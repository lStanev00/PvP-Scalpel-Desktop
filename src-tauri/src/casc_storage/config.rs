use std::path::{Path, PathBuf};

use crate::casc_storage::helpers::pct_helper::parse_config_text;
use crate::casc_storage::types::{CascConfig, CascError};

pub fn load_config(root: &Path) -> Result<CascConfig, CascError> {
    let (base, data_dir) = determine_paths(root)?;

    let build_info_path = [base.join(".build.info"), data_dir.join(".build.info")]
        .into_iter()
        .find(|p| p.exists())
        .ok_or(CascError::FileNotFound)?;

    let build_info_bytes = std::fs::read(&build_info_path)?;
    let build_info_text = String::from_utf8_lossy(&build_info_bytes);

    let (build_key, cdn_key, build_name) = parse_build_info(&build_info_text)?;

    let bk = build_key.to_ascii_lowercase();
    if bk.len() < 4 {
        return Err(CascError::InvalidConfig);
    }

    let config_path = data_dir
        .join("config")
        .join(&bk[0..2])
        .join(&bk[2..4])
        .join(&bk);

    if !config_path.exists() {
        return Err(CascError::FileNotFound);
    }

    let cfg_bytes = std::fs::read(&config_path)?;
    let cfg_text = String::from_utf8_lossy(&cfg_bytes);

    let mut cfg = parse_config_text(&cfg_text)?;
    cfg.build_key = hex16(&build_key)?;
    cfg.cdn_key = hex16(&cdn_key)?;
    if cfg.build_name.is_empty() || cfg.build_name == "unknown" {
        cfg.build_name = build_name.unwrap_or_else(|| "unknown".to_string());
    }

    Ok(cfg)
}

fn determine_paths(root: &Path) -> Result<(PathBuf, PathBuf), CascError> {
    let is_data_dir = root
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.eq_ignore_ascii_case("data"))
        .unwrap_or(false);

    if is_data_dir {
        let base = root.parent().ok_or(CascError::FileNotFound)?;
        return Ok((base.to_path_buf(), root.to_path_buf()));
    }

    if root.join("Data").exists() {
        return Ok((root.to_path_buf(), root.join("Data")));
    }

    if let Some(parent) = root.parent() {
        let data_dir = parent.join("Data");
        if data_dir.exists() {
            return Ok((parent.to_path_buf(), data_dir));
        }
    }

    Err(CascError::FileNotFound)
}

fn hex16(s: &str) -> Result<[u8; 16], CascError> {
    let bytes = hex::decode(s).map_err(|_| CascError::InvalidConfig)?;
    bytes.try_into().map_err(|_| CascError::InvalidConfig)
}

fn parse_build_info(text: &str) -> Result<(String, String, Option<String>), CascError> {
    let mut lines = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !l.starts_with('#'));

    let header = lines.next().ok_or(CascError::InvalidConfig)?;
    let delim = detect_delimiter(header);

    let headers: Vec<String> = header
        .split(delim)
        .map(|s| s.split('!').next().unwrap_or("").trim().to_ascii_lowercase())
        .collect();

    let mut build_key = None;
    let mut cdn_key = None;
    let mut build_name = None;

    let mut best_is_wow = false;

    for row in lines {
        let cols: Vec<&str> = row.split(delim).map(|s| s.trim()).collect();

        let product_col = headers
            .iter()
            .position(|h| h == "product")
            .and_then(|idx| cols.get(idx));
        let is_wow = product_col.map(|p| p.eq_ignore_ascii_case("wow")).unwrap_or(false);

        // Prefer retail (product == wow); otherwise take the first populated row.
        let should_take = build_key.is_none() || (!best_is_wow && is_wow);

        if !should_take {
            continue;
        }

        best_is_wow = best_is_wow || is_wow;

        for (i, h) in headers.iter().enumerate() {
            let v = cols.get(i).copied().unwrap_or("");
            if v.is_empty() {
                continue;
            }

            if h == "build key" {
                build_key = Some(v.to_string());
            } else if h == "cdn key" {
                cdn_key = Some(v.to_string());
            } else if h == "version" || h == "build name" {
                build_name = Some(v.to_string());
            }
        }
    }

    Ok((
        build_key.ok_or(CascError::InvalidConfig)?,
        cdn_key.ok_or(CascError::InvalidConfig)?,
        build_name,
    ))
}

fn detect_delimiter(line: &str) -> char {
    for delim in ['|', '!', '\t'] {
        if line.contains(delim) {
            return delim;
        }
    }
    ' '
}
