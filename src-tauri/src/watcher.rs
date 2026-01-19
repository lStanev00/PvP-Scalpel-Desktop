use notify::{Config, Event, RecommendedWatcher, Watcher};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};

pub fn create_watcher(app: AppHandle) -> notify::Result<RecommendedWatcher> {
    RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| match res {
            Ok(event) => {
                for path in event.paths {

                    if is_our_saved_vars(&path) {
                        println!("SavedVars updated: {}", path.to_string_lossy());
                        if let Some(account) = extract_account_name(&path) {
                            let payload = serde_json::json!({
                                "account": account,
                                "path": path.to_string_lossy()
                            });

                            if let Err(err) = app.emit("savedvars-updated", payload) {
                                eprintln!("emit error: {err}");
                            }
                        }
                    }
                }
            }
            Err(err) => eprintln!("watch error: {err}"),
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
                println!("SavedVars found: {}", path.to_string_lossy());
                found_any = true;
                let payload = serde_json::json!({
                    "account": extract_account_name(&path).unwrap_or_default(),
                    "path": path.to_string_lossy()
                });

                let _ = emitter.emit("savedvars-updated", payload);
            }
        }
    }

    found_any
}

fn is_our_saved_vars(path: &Path) -> bool {
    matches!(
        path.file_name().and_then(|n| n.to_str()),
        Some("PvP_Scalpel.lua")
    )
}

pub fn extract_account_name(path: &Path) -> Option<String> {
    let mut comps = path.components().rev();

    comps.next()?; // filename
    if comps.next()?.as_os_str() != "SavedVariables" {
        return None;
    }

    Some(comps.next()?.as_os_str().to_str()?.to_string())
}
