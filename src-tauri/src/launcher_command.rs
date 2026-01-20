use registry::{Data, Hive, Security};
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn launcher_exe_candidates() -> [&'static str; 2] {
    ["PVP-S Launcher.exe", "PvP-S Launcher.exe"]
}

fn find_launcher_exe() -> Option<PathBuf> {
    // Detect the launcher install path via uninstall registry entries.
    let keys = [
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PVP-S Launcher",
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PvP-S Launcher",
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\bg.pvpscalpel.launcher",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\bg.pvpscalpel.launcher",
    ];
    let hives = [Hive::CurrentUser, Hive::LocalMachine];

    for hive in hives {
        for key_path in keys {
            let key = match hive.open(key_path, Security::Read) {
                Ok(key) => key,
                Err(_) => continue,
            };

            if let Ok(Data::String(path)) = key.value("DisplayIcon") {
                let raw = path.to_string_lossy();
                let cleaned = raw.split(',').next().unwrap_or(&raw);
                let cleaned = cleaned.trim_matches('"');
                let candidate = PathBuf::from(cleaned);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }

            if let Ok(Data::String(path)) = key.value("InstallLocation") {
                let root = path.to_string_lossy();
                let root = root.trim_matches('"').trim_end_matches(['\\', '/']);
                for candidate in launcher_exe_candidates() {
                    let exe = Path::new(root).join(candidate);
                    if exe.is_file() {
                        return Some(exe);
                    }
                }
            }
        }
    }

    None
}

#[tauri::command]
pub fn launch_launcher() -> Result<(), String> {
    let exe = find_launcher_exe().ok_or_else(|| "Launcher not found".to_string())?;
    let mut cmd = Command::new(&exe);
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn()
        .map_err(|err| format!("Failed to launch launcher: {err}"))?;
    Ok(())
}
