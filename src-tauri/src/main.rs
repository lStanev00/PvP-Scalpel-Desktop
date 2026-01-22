// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod gc_command;
mod im_command;
mod watcher;
mod gwp_command;
mod discord_rpc;
mod ourl_command;
mod version_command;
mod manifest_command;
mod launcher_command;
mod log_command;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle,
    Emitter,
    Manager,
};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::Mutex;
use std::time::Duration;

#[derive(Default)]
struct WatcherKeeper(Mutex<Option<RecommendedWatcher>>);

#[tauri::command] // Ship a custom command to the FE
fn read_saved_variables(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed reading file: {e}"))
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    clear_tray(&app);
    app.exit(0);
}

fn clear_tray(app: &AppHandle) {
    if let Some(tray) = app.remove_tray_by_id("main") {
        drop(tray);
    }
}

/*
#[tauri::command]
fn update_tray_state(
    state: State<TrayMenuState<tauri::Wry>>,
    status_text: String,
) -> Result<(), String> {
    // Unused: keep commented out to avoid registering/initializing it.
    if let Ok(mut stored) = state.status.lock() {
        if let Some(item) = stored.as_mut() {
            item.set_text(format!("Status: {}", status_text))
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
*/

#[tauri::command]
fn scan_saved_vars(app: AppHandle) -> Result<(), String> {
    if let Some(path) = gwp_command::get_wow_path() {
        let root = std::path::PathBuf::from(path);
        let found = watcher::emit_existing_saved_vars(&app, &root);
        if found {
            log_command::emit_log(&app, "SavedVariables discovered");
        } else {
            log_command::emit_log(&app, "SavedVariables not found");
        }
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
    .manage(WatcherKeeper::default())
    .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.center();
                let _ = window.set_shadow(false);
            }
            let handle = app.handle().clone();
            let root = if let Some(path) = gwp_command::get_wow_path() {
                log_command::emit_log(&handle, "WoW path detected");
                std::path::PathBuf::from(path)
            } else {
                log_command::emit_log(&handle, "WoW path not found");
                return Ok(());
            };

            if root.exists() {
                let mut watcher =
                    watcher::create_watcher(handle).expect("failed to create watcher");

                watcher
                    .watch(&root, RecursiveMode::Recursive)
                    .expect("failed to watch folder");

                // Watcher in mem stored
                let keeper = app.state::<WatcherKeeper>();
                *keeper.0.lock().unwrap() = Some(watcher);
                log_command::emit_log(&app.handle(), "Addon watcher registered");
            } else {
                log_command::emit_log(&app.handle(), "Addon watcher started");
            };

            discord_rpc::start_rich_presence(); // Start Discord presence

            if let Some(path) = gwp_command::get_wow_path() {
                let app_handle = app.handle().clone();
                let root = std::path::PathBuf::from(path);
                std::thread::spawn(move || {
                    for _ in 0..30 {
                        if watcher::emit_existing_saved_vars(&app_handle, &root) {
                            log_command::emit_log(&app_handle, "Addon SavedVariables discovered");
                            break;
                        }
                        std::thread::sleep(Duration::from_millis(500));
                    }
                });
            }

            let status = MenuItem::with_id(app, "status", "Status: Ready", false, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Show PvP Scalpel", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Hide PvP Scalpel", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&status, &sep1, &show, &hide, &sep2, &quit])?;
            let icon = app.default_window_icon().cloned();

            let mut tray_builder = TrayIconBuilder::with_id("main")
                .menu(&menu)
                .show_menu_on_left_click(true);
            if let Some(icon) = icon {
                tray_builder = tray_builder.icon(icon);
            }

            tray_builder
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        let _ = app.emit_to("main", "tray-show", ());
                    }
                    "hide" => {
                        let _ = app.emit_to("main", "tray-hide", ());
                    }
                    "quit" => {
                        exit_app(app.clone());
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::DoubleClick { .. } = event {
                        let app = tray.app_handle();
                        let _ = app.emit_to("main", "tray-show", ());
                    }
                })
                .build(app)?;
            log_command::emit_log(&app.handle(), "Tray ready");

            Ok(())
        })
        .on_page_load(|window, _| {
            log_command::emit_log(window.app_handle(), "App initialized");
            if let Some(path) = gwp_command::get_wow_path() {
                let root = std::path::PathBuf::from(path);
                watcher::emit_existing_saved_vars(window, &root);
            }
            let versions = version_command::get_local_versions();
            match versions.desktop_version.as_deref() {
                Some(version) => {
                    log_command::emit_log(window.app_handle(), &format!("Desktop version detected ({version})"));
                }
                None => {
                    log_command::emit_log(window.app_handle(), "Desktop version not found");
                }
            }
            match versions.addon_version.as_deref() {
                Some(version) => {
                    log_command::emit_log(window.app_handle(), &format!("Addon version detected ({version})"));
                }
                None => {
                    log_command::emit_log(window.app_handle(), "Addon version not found");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_saved_variables,
            im_command::identify_match,
            gc_command::get_config,
            gc_command::get_local_config,
            ourl_command::open_url,
            discord_rpc::update_state_rich_presence,
            exit_app,
            scan_saved_vars,
            version_command::get_local_versions,
            manifest_command::fetch_manifest,
            launcher_command::get_launcher_path,
            launcher_command::launch_launcher_path,
            log_command::push_log,
            log_command::get_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
