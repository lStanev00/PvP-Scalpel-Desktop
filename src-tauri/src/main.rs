// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod watcher;
mod im_command;

use std::sync::Mutex;
use notify::{RecursiveMode, RecommendedWatcher, Watcher};
use tauri::Manager;

#[derive(Default)]
struct WatcherKeeper(Mutex<Option<RecommendedWatcher>>);

#[tauri::command] // Ship a custom command to the FE
fn read_saved_variables(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed reading file: {e}"))
}


fn main() {
    tauri::Builder::default()
        .manage(WatcherKeeper::default())
        .setup(|app| {
            let handle = app.handle().clone();

            let root = std::path::PathBuf::from(
                r"Z:\Battle.NET Lyb\World of Warcraft\_retail_\WTF\Account"
            );

            let mut watcher = watcher::create_watcher(handle)
                .expect("failed to create watcher");

            watcher
                .watch(&root, RecursiveMode::Recursive)
                .expect("failed to watch folder");

            // wathcer in mem stored
            let keeper = app.state::<WatcherKeeper>();
            *keeper.0.lock().unwrap() = Some(watcher);

            println!("Watching {:?}", root);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![read_saved_variables, im_command::identify_match])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}