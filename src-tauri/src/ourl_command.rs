use crate::log_command;
use tauri::AppHandle;

// opens an url in browser
#[tauri::command]
pub fn open_url(app: AppHandle, path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Err(e) = std::process::Command::new("explorer").arg(path).spawn() {
            log_command::emit_log(&app, "External link failed to open");
            return Err(e.to_string());
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Err(e) = std::process::Command::new("open").arg(path).spawn() {
            log_command::emit_log(&app, "External link failed to open");
            return Err(e.to_string());
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Err(e) = std::process::Command::new("xdg-open").arg(path).spawn() {
            log_command::emit_log(&app, "External link failed to open");
            return Err(e.to_string());
        }
    }

    log_command::emit_log(&app, "External link opened");
    Ok(())
}
