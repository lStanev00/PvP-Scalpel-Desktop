use registry::{Data, Hive, Security};
use serde::Serialize;
use std::sync::OnceLock;
use std::fs;
use std::path::Path;

// Cache registry and addon lookups so we only touch disk/registry once per run.
static DESKTOP_VERSION_CACHE: OnceLock<Option<String>> = OnceLock::new();
static ADDON_VERSION_CACHE: OnceLock<Option<String>> = OnceLock::new();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalVersions {
    pub desktop_version: Option<String>,
    pub addon_version: Option<String>,
}

fn read_desktop_version() -> Option<String> {
    // Desktop version is stored in uninstall registry entries (read-only).
    let keys = [
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PvP Scalpel",
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\bg.pvpscalpel.desktop",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\bg.pvpscalpel.desktop",
    ];
    let values = ["DisplayVersion", "Version", "ProductVersion"];
    let hives = [Hive::CurrentUser, Hive::LocalMachine];

    for hive in hives {
        for key_path in keys {
            if let Ok(key) = hive.open(key_path, Security::Read) {
                for value in values {
                    if let Ok(Data::String(version)) = key.value(value) {
                        return Some(version.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    None
}

fn read_addon_version() -> Option<String> {
    // Resolve addon version from the WoW install path in the registry.
    let main_key = r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Battle.net\Game\wow";

    if let Ok(key) = Hive::LocalMachine.open(main_key, Security::Read) {
        if let Ok(Data::String(path)) = key.value("InstallLocation") {
            let wow = path.to_string_lossy();
            let addons_root = format!("{}\\Interface\\AddOns", wow.trim_end_matches(['\\', '/']));
            return read_addon_version_from_root(&addons_root);
        }
    }

    let fallback = r"SOFTWARE\WOW6432Node\Blizzard Entertainment\World of Warcraft";

    if let Ok(key) = Hive::LocalMachine.open(fallback, Security::Read) {
        if let Ok(Data::String(path)) = key.value("InstallPath") {
            let wow = path.to_string_lossy();
            let addons_root = format!("{}\\Interface\\AddOns", wow.trim_end_matches(['\\', '/']));
            return read_addon_version_from_root(&addons_root);
        }
    }

    None
}

fn read_addon_version_from_root(addons_root: &str) -> Option<String> {
    // Addon version is stored inside the .toc file.
    let toc_path = Path::new(addons_root).join("PvP_Scalpel").join("PvP_Scalpel.toc");
    let contents = fs::read_to_string(&toc_path).ok()?;

    for line in contents.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("## Version:") {
            let version = rest.trim();
            if !version.is_empty() {
                return Some(version.to_string());
            }
        }
    }

    None
}

/*
#[tauri::command]
pub fn get_desktop_version() -> Option<String> {
    // Unused: keep commented out to avoid registering/initializing it.
    DESKTOP_VERSION_CACHE
        .get_or_init(read_desktop_version)
        .clone()
}

#[tauri::command]
pub fn get_addon_version() -> Option<String> {
    // Unused: keep commented out to avoid registering/initializing it.
    ADDON_VERSION_CACHE.get_or_init(read_addon_version).clone()
}
*/

#[tauri::command]
pub fn get_local_versions() -> LocalVersions {
    LocalVersions {
        desktop_version: DESKTOP_VERSION_CACHE.get_or_init(read_desktop_version).clone(),
        addon_version: ADDON_VERSION_CACHE.get_or_init(read_addon_version).clone(),
    }
}

/*
#[tauri::command]
pub fn get_launcher_version() -> Option<String> {
    // Unused: keep commented out to avoid registering/initializing it.
    LAUNCHER_VERSION_CACHE
        .get_or_init(read_launcher_version)
        .clone()
}
*/
