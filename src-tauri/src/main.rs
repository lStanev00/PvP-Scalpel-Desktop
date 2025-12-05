// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod gc_command;
mod im_command;
mod watcher;
mod gwp_command;
mod discord_rpc;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Default)]
struct WatcherKeeper(Mutex<Option<RecommendedWatcher>>);

#[tauri::command] // Ship a custom command to the FE
fn read_saved_variables(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed reading file: {e}"))
}


fn main() {
    tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .manage(WatcherKeeper::default())
    .setup(|app| {
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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_saved_variables,
            im_command::identify_match,
            gc_command::get_config,
            gc_command::get_local_config,
            discord_rpc::update_stater_rich_presence
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
