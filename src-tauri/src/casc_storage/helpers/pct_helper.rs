use crate::casc_storage::types::*;

pub fn parse_config_text(text: &str) -> Result<CascConfig, CascError> {
    let mut build_name = None;
    let mut root_hash = None;
    let mut encoding_hash = None;

    for line in text.lines() {
        if let Some(v) = line.strip_prefix("build-name = ") {
            build_name = Some(v.to_string());
        } else if let Some(v) = line.strip_prefix("root = ") {
            let first = v.split_whitespace().next().ok_or(CascError::InvalidConfig)?;
            root_hash = Some(hex::decode(first).map_err(|_| CascError::InvalidConfig)?);
        } else if let Some(v) = line.strip_prefix("encoding = ") {
            let first = v.split_whitespace().next().ok_or(CascError::InvalidConfig)?;
            encoding_hash = Some(hex::decode(first).map_err(|_| CascError::InvalidConfig)?);
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
