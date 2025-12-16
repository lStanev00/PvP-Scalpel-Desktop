use crate::casc_storage::types::{CascConfig, CascError};

pub fn parse_config_text(text: &str) -> Result<CascConfig, CascError> {
    let mut build_name: Option<String> = None;
    let mut root_hash: Option<Vec<u8>> = None;
    let mut encoding_ckey: Option<Vec<u8>> = None;
    let mut encoding_ekey: Option<Vec<u8>> = None;

    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let mut parts = line.splitn(2, '=');
        let key = parts.next().map(|s| s.trim()).unwrap_or("");
        let value = parts.next().map(|s| s.trim()).unwrap_or("");

        if key.eq_ignore_ascii_case("build-name") {
            if !value.is_empty() {
                build_name = Some(value.to_string());
            }
        } else if key.eq_ignore_ascii_case("root") {
            let first = value.split_whitespace().next().unwrap_or("");
            if !first.is_empty() {
                root_hash = Some(hex::decode(first).map_err(|_| CascError::InvalidConfig)?);
            }
        } else if key.eq_ignore_ascii_case("encoding") {
            let mut parts = value.split_whitespace();
            let first = parts.next().unwrap_or("");
            let second = parts.next().unwrap_or("");
            println!(
                "DEBUG encoding split: first='{}' second='{}'",
                first, second
            );
            if !first.is_empty() {
                encoding_ckey = Some(hex::decode(first).map_err(|_| CascError::InvalidConfig)?);
            }
            if !second.is_empty() {
                encoding_ekey = Some(hex::decode(second).map_err(|_| CascError::InvalidConfig)?);
            }
        }
    }

    let root = root_hash.ok_or(CascError::InvalidConfig)?;
    let encoding_c = encoding_ckey.ok_or(CascError::InvalidConfig)?;
    let encoding_e = encoding_ekey.ok_or(CascError::InvalidConfig)?;

    println!("DEBUG root_hash len = {}", root.len());
    println!("DEBUG encoding_ckey len = {}", encoding_c.len());
    println!("DEBUG encoding_ekey len = {}", encoding_e.len());

    Ok(CascConfig {
        build_name: build_name.unwrap_or_else(|| "unknown".to_string()),
        root_hash: root.try_into().map_err(|_| CascError::InvalidConfig)?,
        encoding_ckey: encoding_c.try_into().map_err(|_| CascError::InvalidConfig)?,
        encoding_ekey: encoding_e.try_into().map_err(|_| CascError::InvalidConfig)?,
        archives: Vec::new(),
        cdn_hosts: Vec::new(),
        cdn_path: String::new(),
        build_key: [0; 16],
        cdn_key: [0; 16],
    })
}
