use crate::casc_storage::types::{CascConfig, CascError};

pub fn parse_config_text(text: &str) -> Result<CascConfig, CascError> {
    let mut build_name: Option<String> = None;
    let mut root_hash: Option<Vec<u8>> = None;
    let mut encoding_hash: Option<Vec<u8>> = None;

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
            let first = value.split_whitespace().next().unwrap_or("");
            if !first.is_empty() {
                encoding_hash = Some(hex::decode(first).map_err(|_| CascError::InvalidConfig)?);
            }
        }
    }

    let root = root_hash.ok_or(CascError::InvalidConfig)?;
    let encoding = encoding_hash.ok_or(CascError::InvalidConfig)?;

    Ok(CascConfig {
        build_name: build_name.unwrap_or_else(|| "unknown".to_string()),
        root_hash: root.try_into().map_err(|_| CascError::InvalidConfig)?,
        encoding_hash: encoding.try_into().map_err(|_| CascError::InvalidConfig)?,
        archives: Vec::new(),
        cdn_hosts: Vec::new(),
        build_key: [0; 16],
        cdn_key: [0; 16],
    })
}
