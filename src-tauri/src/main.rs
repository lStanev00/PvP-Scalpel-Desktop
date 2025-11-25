// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod im_command;
mod watcher;

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

            let root = std::path::PathBuf::from(
                r"Z:\Battle.NET Lyb\World of Warcraft\_retail_\WTF\Account",
            );

            if root.exists() {
                let mut watcher =
                    watcher::create_watcher(handle).expect("failed to create watcher");

                watcher
                    .watch(&root, RecursiveMode::Recursive)
                    .expect("failed to watch folder");

                // wathcer in mem stored
                let keeper = app.state::<WatcherKeeper>();
                *keeper.0.lock().unwrap() = Some(watcher);

                println!("Watching {:?}", root);
            } else {
                println!("The root path does not exist. The watcher won't register.")
            };

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_saved_variables,
            im_command::identify_match
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
