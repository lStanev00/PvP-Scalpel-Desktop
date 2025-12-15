use std::path::Path;
extern crate hex;
use crate::casc_storage::types::*;

pub fn load_config(root: &Path) -> Result<CascConfig, CascError> {
    let config_dir = root.join("Data").join("config");

    if !config_dir.exists() {
        return Err(CascError::FileNotFound);
    }

    let mut configs = std::fs::read_dir(&config_dir)?
        .filter_map(|e| e.ok())
        .collect::<Vec<_>>();

    configs.sort_by_key(|e| e.metadata().ok().and_then(|m| m.modified().ok()));

    let latest = configs.last().ok_or(CascError::FileNotFound)?;

    let data = std::fs::read(latest.path())?;
    let text = String::from_utf8_lossy(&data);

    let mut build_name = None;
    let mut root_hash = None;
    let mut encoding_hash = None;

    for line in text.lines() {
        if let Some(v) = line.strip_prefix("build-name = ") {
            build_name = Some(v.to_string());
        } else if let Some(v) = line.strip_prefix("root = ") {
            root_hash = Some(hex::decode(v)?);
        } else if let Some(v) = line.strip_prefix("encoding = ") {
            encoding_hash = Some(hex::decode(v)?);
        }
    }

    Ok(CascConfig {
        build_name: build_name.ok_or(CascError::InvalidConfig)?,
        root_hash: root_hash.ok_or(CascError::InvalidConfig)?.try_into().unwrap(),
        encoding_hash: encoding_hash.ok_or(CascError::InvalidConfig)?.try_into().unwrap(),
        cdn_hosts: vec![],
        archives: vec![],
        build_key: [0; 16],
        cdn_key: [0; 16],
    })
}
