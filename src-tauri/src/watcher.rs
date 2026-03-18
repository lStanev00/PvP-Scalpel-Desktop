use notify::{Config, Event, RecommendedWatcher, Watcher};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Runtime};
use crate::log_command;

#[derive(Clone, Copy)]
enum GameRuntimeState {
    NotRunning,
    Running,
    JustClosed,
}

impl GameRuntimeState {
    fn as_str(self) -> &'static str {
        match self {
            GameRuntimeState::NotRunning => "not_running",
            GameRuntimeState::Running => "running",
            GameRuntimeState::JustClosed => "just_closed",
        }
    }
}

fn resolve_game_runtime_state(is_running_now: bool, was_running: &mut bool) -> GameRuntimeState {
    if is_running_now {
        *was_running = true;
        return GameRuntimeState::Running;
    }

    if *was_running {
        *was_running = false;
        return GameRuntimeState::JustClosed;
    }

    GameRuntimeState::NotRunning
}

#[cfg(target_os = "windows")]
fn is_wow_running() -> bool {
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);
    system.processes().values().any(|process| {
        let name = process.name().to_string_lossy().to_ascii_lowercase();
        name == "wow.exe" || name == "wow"
    })
}

#[cfg(not(target_os = "windows"))]
fn is_wow_running() -> bool {
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);
    system.processes().values().any(|process| {
        let name = process.name().to_string_lossy().to_ascii_lowercase();
        name == "world of warcraft" || name == "wow"
    })
}

pub fn create_watcher(app: AppHandle) -> notify::Result<RecommendedWatcher> {
    let mut was_running = is_wow_running();
    RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| match res {
            Ok(event) => {
                let mut game_state: Option<GameRuntimeState> = None;
                for path in event.paths {

                    if is_our_saved_vars(&path) {
                        let runtime_state = *game_state.get_or_insert_with(|| {
                            resolve_game_runtime_state(is_wow_running(), &mut was_running)
                        });
                        log_command::emit_log(&app, "SavedVariables updated");
                        if let Some(account) = extract_account_name(&path) {
                            let payload = serde_json::json!({
                                "account": account,
                                "path": path.to_string_lossy(),
                                "gameState": runtime_state.as_str(),
                            });

                            if app.emit("savedvars-updated", payload).is_err() {
                                log_command::emit_log(&app, "SavedVariables event failed");
                            }
                        }
                    }
                }
            }
            Err(_) => log_command::emit_log(&app, "Watcher error"),
        },
        Config::default().with_poll_interval(Duration::from_millis(400)),
    )
}

pub fn emit_existing_saved_vars<R: Runtime, E: Emitter<R>>(emitter: &E, root: &Path) -> bool {
    if !root.exists() {
        return false;
    }

    let mut found_any = false;
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }

            if is_our_saved_vars(&path) {
                found_any = true;
                let runtime_state = if is_wow_running() {
                    GameRuntimeState::Running
                } else {
                    GameRuntimeState::NotRunning
                };
                let payload = serde_json::json!({
                    "account": extract_account_name(&path).unwrap_or_default(),
                    "path": path.to_string_lossy(),
                    "gameState": runtime_state.as_str(),
                });

                let _ = emitter.emit("savedvars-updated", payload);
            }
        }
    }

    found_any
}

fn extract_account_saved_vars_info(path: &Path) -> Option<String> {
    let mut comps = path.components().rev();

    comps.next()?; // filename
    if comps.next()?.as_os_str() != "SavedVariables" {
        return None;
    }

    let account = comps.next()?.as_os_str().to_str()?.to_string();
    if comps.next()?.as_os_str() != "Account" {
        return None;
    }

    Some(account)
}

fn is_our_saved_vars(path: &Path) -> bool {
    matches!(
        path.file_name().and_then(|n| n.to_str()),
        Some("PvP_Scalpel.lua")
    ) && extract_account_saved_vars_info(path).is_some()
}

pub fn extract_account_name(path: &Path) -> Option<String> {
    extract_account_saved_vars_info(path)
}
