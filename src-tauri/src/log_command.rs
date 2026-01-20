use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

const MAX_LOGS: usize = 100;
static LOG_STORE: OnceLock<Mutex<VecDeque<String>>> = OnceLock::new();

fn push_log_entry(message: String) {
    let store = LOG_STORE.get_or_init(|| Mutex::new(VecDeque::with_capacity(MAX_LOGS)));
    if let Ok(mut guard) = store.lock() {
        if guard.len() >= MAX_LOGS {
            guard.pop_front();
        }
        guard.push_back(message);
    }
}

// Reusable log emitter for frontend diagnostics.
pub fn emit_log(app: &AppHandle, message: &str) {
    push_log_entry(message.to_string());
    let _ = app.emit_to("main", "app-log", message.to_string());
}

#[tauri::command]
pub fn push_log(app: AppHandle, message: String) {
    emit_log(&app, &message);
}

#[tauri::command]
pub fn get_logs() -> Vec<String> {
    let store = LOG_STORE.get_or_init(|| Mutex::new(VecDeque::with_capacity(MAX_LOGS)));
    if let Ok(guard) = store.lock() {
        return guard.iter().cloned().collect();
    }
    Vec::new()
}
