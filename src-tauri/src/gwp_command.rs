use registry::{Hive, Security, Data};

#[tauri::command]
pub fn get_wow_path() -> Option<String> {
    let main_key = r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Battle.net\Game\wow";

    if let Ok(key) = Hive::LocalMachine.open(main_key, Security::Read) {
        if let Ok(Data::String(path)) = key.value("InstallLocation") {
            let wow = path.to_string_lossy();
            let result = format!("{}\\WTF\\Account", wow.trim_end_matches(['\\','/']));
            return Some(result);
        }
    }

    let fallback = r"SOFTWARE\WOW6432Node\Blizzard Entertainment\World of Warcraft";

    if let Ok(key) = Hive::LocalMachine.open(fallback, Security::Read) {
        if let Ok(Data::String(path)) = key.value("InstallPath") {
            let wow = path.to_string_lossy();
            let result = format!("{}\\WTF\\Account", wow.trim_end_matches(['\\','/']));
            return Some(result);
        }
    }

    None
}
