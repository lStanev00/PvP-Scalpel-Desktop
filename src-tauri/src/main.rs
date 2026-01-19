// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod gc_command;
mod im_command;
mod watcher;
mod gwp_command;
mod discord_rpc;
mod ourl_command;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle,
    Emitter,
    Manager,
    Runtime,
    State,
};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::Mutex;
use std::time::Duration;

#[derive(Default)]
struct WatcherKeeper(Mutex<Option<RecommendedWatcher>>);

#[derive(Default)]
struct TrayMenuState<R: Runtime> {
    status: Mutex<Option<MenuItem<R>>>,
}

#[tauri::command] // Ship a custom command to the FE
fn read_saved_variables(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed reading file: {e}"))
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn update_tray_state(
    state: State<TrayMenuState<tauri::Wry>>,
    status_text: String,
) -> Result<(), String> {
    if let Ok(mut stored) = state.status.lock() {
        if let Some(item) = stored.as_mut() {
            item.set_text(format!("Status: {}", status_text))
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn scan_saved_vars(app: AppHandle) -> Result<(), String> {
    if let Some(path) = gwp_command::get_wow_path() {
        let root = std::path::PathBuf::from(path);
        watcher::emit_existing_saved_vars(&app, &root);
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
                std::path::PathBuf::from(path)
            } else {
                println!("WoW path not found");
                return Ok(());
            };

            println!("Detected WoW path raw: {:?}", gwp_command::get_wow_path());
            println!("Full folder to watch: {:?}", root);

            if root.exists() {
                let mut watcher =
                    watcher::create_watcher(handle).expect("failed to create watcher");

                watcher
                    .watch(&root, RecursiveMode::Recursive)
                    .expect("failed to watch folder");

                // Watcher in mem stored
                let keeper = app.state::<WatcherKeeper>();
                *keeper.0.lock().unwrap() = Some(watcher);

                println!("Watching {:?}", root);
            } else {
                println!("The root path does not exist. The watcher won't register.")
            };

            discord_rpc::start_rich_presence(); // Start Discord presence

            if let Some(path) = gwp_command::get_wow_path() {
                let app_handle = app.handle().clone();
                let root = std::path::PathBuf::from(path);
                std::thread::spawn(move || {
                    for _ in 0..30 {
                        if watcher::emit_existing_saved_vars(&app_handle, &root) {
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

            app.manage(TrayMenuState {
                status: Mutex::new(Some(status.clone())),
            });

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
                        app.exit(0);
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

            Ok(())
        })
        .on_page_load(|window, _| {
            if let Some(path) = gwp_command::get_wow_path() {
                let root = std::path::PathBuf::from(path);
                watcher::emit_existing_saved_vars(window, &root);
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
            update_tray_state,
            scan_saved_vars,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
