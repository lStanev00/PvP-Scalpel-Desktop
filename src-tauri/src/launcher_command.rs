use registry::{Data, Hive, RegKey, Security};
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const LAUNCHER_UPGRADE_CODE: &str = "A3F9C2B4-6E1A-4F3C-9D6A-8C4E0E9A2B17";

fn launcher_exe_candidates() -> [&'static str; 2] {
    ["PVP-S Launcher.exe", "PvP-S Launcher.exe"]
}

fn launcher_display_names() -> [&'static str; 2] {
    ["PVP-S Launcher", "PvP-S Launcher"]
}

fn launcher_shortcut_names() -> [&'static str; 2] {
    ["PVP-S Launcher.lnk", "PvP-S Launcher.lnk"]
}

fn launcher_dir_candidates() -> [&'static str; 3] {
    ["PVP-S Launcher", "PvP-S Launcher", "PvP Scalpel Launcher"]
}

fn extract_exe_path(value: &str) -> Option<PathBuf> {
    let trimmed = value.trim_matches('"');
    let lower = trimmed.to_lowercase();
    if let Some(idx) = lower.find(".exe") {
        let end = idx + 4;
        let slice = trimmed.get(0..end)?;
        let cleaned = slice.trim_matches('"');
        return Some(PathBuf::from(cleaned));
    }
    None
}

fn matches_launcher_exe_name(path: &Path) -> bool {
    let name = path.file_name().and_then(|value| value.to_str());
    if let Some(name) = name {
        return launcher_exe_candidates()
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(name));
    }
    false
}

fn matches_launcher_display_name(value: &str) -> bool {
    let trimmed = value.trim();
    launcher_display_names()
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(trimmed))
}

fn normalize_guid(value: &str) -> String {
    value
        .trim()
        .trim_matches('{')
        .trim_matches('}')
        .chars()
        .filter(|ch| *ch != '-' && !ch.is_whitespace())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

fn matches_upgrade_code(value: &str) -> bool {
    normalize_guid(value) == normalize_guid(LAUNCHER_UPGRADE_CODE)
}

fn same_path(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => a
            .to_string_lossy()
            .eq_ignore_ascii_case(&b.to_string_lossy()),
    }
}

fn is_valid_launcher_exe(path: &Path, current_exe: Option<&Path>) -> bool {
    if !path.is_file() || !matches_launcher_exe_name(path) {
        return false;
    }
    if let Some(current) = current_exe {
        if same_path(path, current) {
            return false;
        }
    }
    true
}

fn is_valid_launcher_shortcut(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    let name = match path.file_name().and_then(|value| value.to_str()) {
        Some(value) => value,
        None => return false,
    };
    launcher_shortcut_names()
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(name))
}

fn possible_install_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(path) = std::env::var("PROGRAMFILES") {
        roots.push(PathBuf::from(path));
    }
    if let Ok(path) = std::env::var("PROGRAMFILES(X86)") {
        roots.push(PathBuf::from(path));
    }
    if let Ok(path) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(path));
    }
    if let Ok(path) = std::env::var("APPDATA") {
        roots.push(PathBuf::from(path));
    }
    roots
}

fn start_menu_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(path) = std::env::var("APPDATA") {
        roots.push(
            Path::new(&path)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs"),
        );
    }
    if let Ok(path) = std::env::var("PROGRAMDATA") {
        roots.push(
            Path::new(&path)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs"),
        );
    }
    roots
}

fn scan_dir_for_shortcut(dir: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = scan_dir_for_shortcut(&path) {
                return Some(found);
            }
        } else if is_valid_launcher_shortcut(&path) {
            return Some(path);
        }
    }
    None
}

fn find_launcher_shortcut() -> Option<PathBuf> {
    for root in start_menu_roots() {
        if let Some(found) = scan_dir_for_shortcut(&root) {
            return Some(found);
        }
    }
    None
}

fn resolve_launcher_from_key(key: &RegKey, current_exe: Option<&Path>) -> Option<PathBuf> {
    if let Ok(Data::String(path)) = key.value("DisplayIcon") {
        let raw = path.to_string_lossy();
        let cleaned = raw.split(',').next().unwrap_or(&raw);
        if let Some(candidate) = extract_exe_path(cleaned) {
            if is_valid_launcher_exe(&candidate, current_exe) {
                return Some(candidate);
            }
        }
    }

    if let Ok(Data::String(path)) = key.value("InstallLocation") {
        let root = path.to_string_lossy();
        let root = root.trim_matches('"').trim_end_matches(['\\', '/']);
        for candidate in launcher_exe_candidates() {
            let exe = Path::new(root).join(candidate);
            if is_valid_launcher_exe(&exe, current_exe) {
                return Some(exe);
            }
        }
    }

    if let Ok(Data::String(path)) = key.value("UninstallString") {
        let raw = path.to_string_lossy();
        if let Some(candidate) = extract_exe_path(&raw) {
            if is_valid_launcher_exe(&candidate, current_exe) {
                return Some(candidate);
            }
        }
    }

    None
}

fn scan_uninstall_roots_for_launcher(hive: Hive, current_exe: Option<&Path>) -> Option<PathBuf> {
    let roots = [
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    ];

    for root_path in roots {
        let root = match hive.open(root_path, Security::Read) {
            Ok(root) => root,
            Err(_) => continue,
        };

        for key_ref in root.keys().flatten() {
            let subkey = match key_ref.open(Security::Read) {
                Ok(subkey) => subkey,
                Err(_) => continue,
            };

            if let Ok(Data::String(display_name)) = subkey.value("DisplayName") {
                if matches_launcher_display_name(&display_name.to_string_lossy()) {
                    if let Some(candidate) = resolve_launcher_from_key(&subkey, current_exe) {
                        return Some(candidate);
                    }
                }
            }

            if let Ok(Data::String(upgrade_code)) = subkey.value("UpgradeCode") {
                if matches_upgrade_code(&upgrade_code.to_string_lossy()) {
                    if let Some(candidate) = resolve_launcher_from_key(&subkey, current_exe) {
                        return Some(candidate);
                    }
                }
            }
        }
    }

    None
}

fn find_launcher_exe() -> Option<PathBuf> {
    let current_exe = std::env::current_exe().ok();
    // Detect the launcher install path via uninstall registry entries.
    let keys = [
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PVP-S Launcher",
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PvP-S Launcher",
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\bg.pvpscalpel.launcher",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\bg.pvpscalpel.launcher",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\PVP-S Launcher",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\PvP-S Launcher",
    ];
    let hives = [Hive::CurrentUser, Hive::LocalMachine];

    for hive in hives {
        for key_path in keys {
            let key = match hive.open(key_path, Security::Read) {
                Ok(key) => key,
                Err(_) => continue,
            };

            if let Some(candidate) = resolve_launcher_from_key(&key, current_exe.as_deref()) {
                return Some(candidate);
            }
        }
    }

    for hive in hives {
        if let Some(candidate) = scan_uninstall_roots_for_launcher(hive, current_exe.as_deref()) {
            return Some(candidate);
        }
    }

    for root in possible_install_roots() {
        for dir in launcher_dir_candidates() {
            for exe in launcher_exe_candidates() {
                let candidate = root.join(dir).join(exe);
                if is_valid_launcher_exe(&candidate, current_exe.as_deref()) {
                    return Some(candidate);
                }
            }
        }
    }

    find_launcher_shortcut()
}

#[tauri::command]
pub fn get_launcher_path() -> Result<String, String> {
    find_launcher_exe()
        .and_then(|path| path.to_str().map(|value| value.to_string()))
        .ok_or_else(|| "Launcher not found".to_string())
}

#[tauri::command]
pub fn launch_launcher_path(path: String) -> Result<(), String> {
    let exe = PathBuf::from(path);
    let current_exe = std::env::current_exe().ok();
    if is_valid_launcher_exe(&exe, current_exe.as_deref()) {
        let mut cmd = Command::new(&exe);
        #[cfg(windows)]
        {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        cmd.spawn()
            .map_err(|err| format!("Failed to launch launcher: {err}"))?;
    } else if is_valid_launcher_shortcut(&exe) {
        let mut cmd = Command::new("cmd");
        cmd.args(["/c", "start", "", exe.to_string_lossy().as_ref()]);
        #[cfg(windows)]
        {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        cmd.spawn()
            .map_err(|err| format!("Failed to launch launcher shortcut: {err}"))?;
    } else {
        return Err("Invalid launcher path".to_string());
    }
    Ok(())
}

/*
#[tauri::command]
pub fn launch_launcher() -> Result<(), String> {
    // Unused: keep commented out to avoid registering/initializing it.
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
*/
