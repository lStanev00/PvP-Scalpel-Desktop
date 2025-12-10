// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod gc_command;
mod im_command;
mod watcher;
mod gwp_command;
mod discord_rpc;
mod ourl_command;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::Mutex;
use tauri::Manager;
use std::ffi::CString;

pub mod bindings;
use crate::bindings::cascffi::CascFFI;
use tauri::AppHandle;

pub struct CascRuntime {
    pub ffi: CascFFI,
    pub handle: usize,
}

pub struct CascGlobal {
    pub runtime: Mutex<Option<CascRuntime>>,
}

#[tauri::command]
fn casc_init(app: AppHandle, state: tauri::State<CascGlobal>) -> Result<String, String> {
    let ffi = CascFFI::load(&app)?; // LOAD DLL ONCE

    let base = CString::new("Z:/Battle.NET Lyb/World of Warcraft").unwrap();
    let product = CString::new("wow").unwrap();

    let mut handle: usize = 0;
    let ret = unsafe { (ffi.open)(base.as_ptr(), product.as_ptr(), &mut handle) };

    if ret != 0 || handle == 0 {
        return Err(format!("Failed to init CASC: ret={ret}, handle={handle}"));
    }

    // Save both ffi + handle together
    let mut guard = state.runtime.lock().unwrap();
    *guard = Some(CascRuntime { ffi, handle });

    Ok("CASC initialized".into())
}


#[tauri::command]
fn casc_try_read(
    state: tauri::State<CascGlobal>,
    path: String,
) -> Result<String, String> {
    let guard = state.runtime.lock().unwrap();
    let rt = guard.as_ref().ok_or("CASC not initialized")?;

    let cpath = CString::new(path.clone()).unwrap();

    let mut buf_ptr: *mut u8 = std::ptr::null_mut();
    let mut buf_len: u32 = 0;

    let r = unsafe {
        (rt.ffi.read_file)(rt.handle, cpath.as_ptr(), &mut buf_ptr, &mut buf_len)
    };

    if r != 0 {
        return Err(format!("read failed ret={r} for '{path}'"));
    }

    let data = unsafe {
        std::slice::from_raw_parts(buf_ptr, buf_len as usize).to_vec()
    };

    unsafe { (rt.ffi.free_buf)(buf_ptr) };

    Ok(format!("Read {} bytes from '{}'", data.len(), path))
}



#[derive(Default)]
struct WatcherKeeper(Mutex<Option<RecommendedWatcher>>);

#[tauri::command] // Ship a custom command to the FE
fn read_saved_variables(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed reading file: {e}"))
}


fn main() {
    tauri::Builder::default()
    .manage(WatcherKeeper::default())
    .manage(CascGlobal{
        runtime: Mutex::new(None)
    })
    .setup(|app| {
            let handle = app.handle().clone();
            {
                let state = app.state::<CascGlobal>();
                if let Err(e) = casc_init(handle.clone(), state) {
                    println!("CASC init error: {e}");
                } else {
                    println!("CASC initialized successfully.");
                }
            }

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
            ourl_command::open_url,
            discord_rpc::update_state_rich_presence,
            casc_try_read,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
