// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod gc_command;
mod im_command;
mod watcher;
mod gwp_command;
mod discord_rpc;
mod ourl_command;
mod casc_storage;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::Mutex;
use tauri::Manager;
use crate::casc_storage::storage::CascStorage;
use crate::casc_storage::db2::{parse_db2, Db2File};
use crate::casc_storage::types::CascError;

#[derive(Default)]
struct WatcherKeeper(Mutex<Option<RecommendedWatcher>>);

#[tauri::command] // Ship a custom command to the FE
fn read_saved_variables(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed reading file: {e}"))
}


fn main() {
    tauri::Builder::default()
    .manage(WatcherKeeper::default())
    .setup(|app| {
            let handle = app.handle().clone();
            let account_path = if let Some(path) = gwp_command::get_wow_path() {
                std::path::PathBuf::from(path)
            } else {
                println!("WoW path not found");
                return Ok(());
            };
            // Casc pipeline needs the WoW install root (two levels above WTF/Account).
            // account_path = <WoW>/_retail_/WTF/Account
            // We need the game root that holds .build.info (three levels up).
            let casc_root = account_path
                .parent()        // WTF
                .and_then(|p| p.parent()) // _retail_
                .and_then(|p| p.parent()) // WoW root (has .build.info)
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| account_path.clone());

            let storage = match CascStorage::open(&handle, casc_root.clone()) {
                Ok(storage) => {
                    println!("CASC root: {:?}", storage.root_path);
                    Some(storage)
                }
                Err(e) => {
                    eprintln!("Failed to open CASC: {}", e);
                    None
                }
            };

            if let Some(ref storage) = storage {
                // Try to fetch TACT-related DB2s if present.
                probe_tact_tables(storage);
            }

            println!("Detected WoW path raw: {:?}", gwp_command::get_wow_path());
            println!("Full folder to watch: {:?}", account_path);

            if account_path.exists() {
                let mut watcher =
                    watcher::create_watcher(handle).expect("failed to create watcher");

                watcher
                    .watch(&account_path, RecursiveMode::Recursive)
                    .expect("failed to watch folder");

                // Watcher in mem stored
                let keeper = app.state::<WatcherKeeper>();
                *keeper.0.lock().unwrap() = Some(watcher);

                println!("Watching {:?}", account_path);
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
            ourl_command::open_url,
            discord_rpc::update_state_rich_presence,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}

fn load_db2_bytes(storage: &CascStorage, name: &str) -> Option<(Vec<u8>, Db2File)> {
    let normalized = name.trim().replace('\\', "/").to_ascii_lowercase();
    let listfile = storage.listfile.as_ref()?;
    let file_id = *listfile.by_name.get(&normalized)?;
    let bytes = crate::casc_storage::storage::read_file_by_filedataid(storage, file_id).ok()?;
    let db2 = parse_db2(&bytes).ok()?;
    Some((bytes, db2))
}

/// Attempt to read TACT-related DB2s to see if they are present and decodable.
fn probe_tact_tables(storage: &CascStorage) {
    // IDs provided from listfile
    let targets: &[(&str, u32)] = &[
        ("dbfilesclient/tactkey.db2", 1302850),
        ("dbfilesclient/tactkeylookup.db2", 1302851),
    ];

    for (name, id) in targets {
        println!("[TACT] attempt {} (fileDataID={})", name, id);
        // Prefer local debug_inputs copy if present.
        if let Some((bytes, db2)) = load_db2_from_debug_inputs(name) {
            println!("[TACT] loaded from debug_inputs: bytes={}", bytes.len());
            log_db2_summary(&db2);
            continue;
        }

        match crate::casc_storage::storage::read_file_by_filedataid(storage, *id) {
            Ok(bytes) => {
                println!("[TACT] read OK: bytes={}", bytes.len());
                match parse_db2(&bytes) {
                    Ok(db2) => {
                        log_db2_summary(&db2);
                    }
                    Err(e) => {
                        println!("[TACT] parse failed: {}", e);
                        log_preview(name, &bytes);
                    }
                }
            }
            Err(CascError::MissingDecryptionKey(k)) => {
                println!("[TACT] missing decrypt key {:016x}", k);
            }
            Err(e) => {
                println!("[TACT] read failed: {}", e);
            }
        }
    }
}

fn log_db2_summary(db2: &Db2File) {
    let magic = std::str::from_utf8(&db2.magic).unwrap_or("????");
    println!(
        "[TACT] DB2 parsed: magic={} sections={}",
        magic, db2.section_count
    );
    if let Some(sec0) = db2.sections.get(0) {
        println!(
            "[TACT] section[0]: data_offset={} data_size={}",
            sec0.data_offset, sec0.data_size
        );
    }
}

fn log_preview(name: &str, bytes: &[u8]) {
    let magic_ascii = if bytes.len() >= 4 {
        String::from_utf8_lossy(&bytes[0..4]).to_string()
    } else {
        String::from_utf8_lossy(bytes).to_string()
    };
    let first32 = bytes.iter().take(32).map(|b| format!("{:02x}", b)).collect::<String>();
    println!(
        "[TACT] buffer preview {} size={} magic_ascii={} first32={}",
        name,
        bytes.len(),
        magic_ascii,
        first32
    );
}

fn load_db2_from_debug_inputs(name: &str) -> Option<(Vec<u8>, Db2File)> {
    let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let path = base
        .join("src-tauri")
        .join("src")
        .join("casc_storage")
        .join("debug_inputs")
        .join(name);
    if !path.exists() {
        return None;
    }
    match std::fs::read(&path) {
        Ok(bytes) => match parse_db2(&bytes) {
            Ok(db2) => Some((bytes, db2)),
            Err(e) => {
                println!("[TACT] local parse failed for {} ({}): {}", name, path.display(), e);
                None
            }
        },
        Err(e) => {
            println!("[TACT] failed to read local {}: {}", path.display(), e);
            None
        }
    }
}
