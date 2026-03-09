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
mod computed_matches_command;
mod gc_state_command;

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

#[cfg(not(debug_assertions))]
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::Arc,
};

#[cfg(not(debug_assertions))]
use xxhash_rust::xxh64::xxh64;

#[derive(Default)]
struct WatcherKeeper(Mutex<Option<RecommendedWatcher>>);

#[cfg(not(debug_assertions))]
const APP_IDENTIFIER: &str = "bg.pvpscalpel.desktop";

#[cfg(not(debug_assertions))]
const SINGLE_INSTANCE_SIGNAL: &str = "pvp-scalpel-desktop:show:v1";

#[cfg(not(debug_assertions))]
const SINGLE_INSTANCE_ACK: &str = "ok";

#[cfg(not(debug_assertions))]
type SharedAppHandle = Arc<Mutex<Option<AppHandle>>>;

#[cfg(not(debug_assertions))]
enum SingleInstanceStartup {
    Primary(TcpListener),
    ExistingInstanceSignaled,
    Disabled,
}

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

#[cfg(not(debug_assertions))]
fn single_instance_addr() -> String {
    let port = 43_000 + (xxh64(APP_IDENTIFIER.as_bytes(), 0) % 1_000) as u16;
    format!("127.0.0.1:{port}")
}

#[cfg(not(debug_assertions))]
fn prepare_single_instance() -> SingleInstanceStartup {
    let addr = single_instance_addr();
    match TcpListener::bind(&addr) {
        Ok(listener) => SingleInstanceStartup::Primary(listener),
        Err(_) => {
            if signal_existing_instance() {
                SingleInstanceStartup::ExistingInstanceSignaled
            } else {
                SingleInstanceStartup::Disabled
            }
        }
    }
}

#[cfg(not(debug_assertions))]
fn signal_existing_instance() -> bool {
    let Ok(addr) = single_instance_addr().parse() else {
        return false;
    };

    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else {
        return false;
    };

    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));

    if stream.write_all(SINGLE_INSTANCE_SIGNAL.as_bytes()).is_err() {
        return false;
    }

    let mut ack = [0_u8; 8];
    match stream.read(&mut ack) {
        Ok(count) if count > 0 => std::str::from_utf8(&ack[..count])
            .map(|value| value == SINGLE_INSTANCE_ACK)
            .unwrap_or(false),
        _ => false,
    }
}

#[cfg(not(debug_assertions))]
fn spawn_single_instance_listener(listener: TcpListener, app_slot: SharedAppHandle) {
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else {
                continue;
            };

            let mut payload = [0_u8; 64];
            let Ok(count) = stream.read(&mut payload) else {
                continue;
            };
            if count == 0 {
                continue;
            }

            let is_show_signal = std::str::from_utf8(&payload[..count])
                .map(|value| value == SINGLE_INSTANCE_SIGNAL)
                .unwrap_or(false);
            if !is_show_signal {
                continue;
            }

            for _ in 0..100 {
                let app_handle = app_slot.lock().ok().and_then(|guard| guard.clone());
                if let Some(app_handle) = app_handle {
                    reveal_running_instance(&app_handle);
                    let _ = stream.write_all(SINGLE_INSTANCE_ACK.as_bytes());
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    });
}

#[cfg(not(debug_assertions))]
fn reveal_running_instance(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_skip_taskbar(false);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    let _ = app.emit_to("main", "tray-show", ());
}

fn main() {
    #[cfg(not(debug_assertions))]
    let single_instance_handle: SharedAppHandle = Arc::new(Mutex::new(None));

    #[cfg(not(debug_assertions))]
    match prepare_single_instance() {
        SingleInstanceStartup::Primary(listener) => {
            spawn_single_instance_listener(listener, Arc::clone(&single_instance_handle));
        }
        SingleInstanceStartup::ExistingInstanceSignaled => {
            std::process::exit(0);
        }
        SingleInstanceStartup::Disabled => {}
    }

    tauri::Builder::default()
    .manage(WatcherKeeper::default())
    .setup(move |app| {
            #[cfg(not(debug_assertions))]
            if let Ok(mut stored) = single_instance_handle.lock() {
                *stored = Some(app.handle().clone());
            }

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
            computed_matches_command::load_computed_matches,
            computed_matches_command::load_all_computed_matches,
            computed_matches_command::upsert_computed_matches,
            gc_state_command::mark_gc_matches_synced,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
