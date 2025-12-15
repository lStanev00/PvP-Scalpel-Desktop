use std::path::Path;
extern crate hex;
use crate::casc_storage::types::CascError;
use crate::casc_storage::types::CascConfig;
use crate::casc_storage::helpers::pct_helper::parse_config_text;

pub fn load_config(root: &Path) -> Result<CascConfig, CascError> {
    let config_root = root.join("Data").join("config");
    if !config_root.exists() {
        return Err(CascError::FileNotFound);
    }

    let mut last_good: Option<CascConfig> = None;

    for bucket in std::fs::read_dir(&config_root)? {
        let bucket = bucket?;
        if !bucket.path().is_dir() {
            continue;
        }

        for entry in std::fs::read_dir(bucket.path())? {
            let entry = entry?;
            if !entry.path().is_file() {
                continue;
            }

            let text = match std::fs::read_to_string(entry.path()) {
                Ok(t) => t,
                Err(_) => continue,
            };

            if let Ok(cfg) = parse_config_text(&text) {
                last_good = Some(cfg);
            }
        }
    }

    last_good.ok_or(CascError::InvalidConfig)
}
