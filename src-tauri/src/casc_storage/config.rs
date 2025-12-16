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

    let (build_key, cdn_key, build_name, cdn_path, cdn_hosts) = parse_build_info(&build_info_text)?;

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
    if cdn_path.is_empty() || cdn_hosts.is_empty() {
        return Err(CascError::InvalidConfig);
    }
    cfg.cdn_path = cdn_path;
    cfg.cdn_hosts = cdn_hosts;
    if cfg.build_name.is_empty() || cfg.build_name == "unknown" {
        cfg.build_name = build_name.unwrap_or_else(|| "unknown".to_string());
    }

    // Load CDN config using cdn_key (archives, etc.)
    let ck = cdn_key.to_ascii_lowercase();
    if ck.len() < 4 {
        return Err(CascError::InvalidConfig);
    }

    let cdn_cfg_path = data_dir
        .join("config")
        .join(&ck[0..2])
        .join(&ck[2..4])
        .join(&ck);

    let cdn_bytes = std::fs::read(&cdn_cfg_path)?;
    let cdn_text = String::from_utf8_lossy(&cdn_bytes);
    let archives = parse_cdn_config_text(&cdn_text)?;
    cfg.archives = archives;

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

fn parse_build_info(text: &str) -> Result<(String, String, Option<String>, String, Vec<String>), CascError> {
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
    let mut cdn_path = None;
    let mut cdn_hosts: Vec<String> = Vec::new();

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
            } else if h == "cdn path" {
                cdn_path = Some(v.to_string());
            } else if h == "cdn hosts" {
                cdn_hosts = v.split_whitespace().map(|s| s.to_string()).collect();
            }
        }
    }

    Ok((
        build_key.ok_or(CascError::InvalidConfig)?,
        cdn_key.ok_or(CascError::InvalidConfig)?,
        build_name,
        cdn_path.ok_or(CascError::InvalidConfig)?,
        cdn_hosts,
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

fn parse_cdn_config_text(text: &str) -> Result<Vec<String>, CascError> {
    let mut archives: Vec<String> = Vec::new();

    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let mut parts = line.splitn(2, '=');
        let key = parts.next().map(|s| s.trim().to_ascii_lowercase()).unwrap_or_default();
        let value = parts.next().map(|s| s.trim()).unwrap_or("");

        if key.is_empty() {
            continue;
        }

        let values: Vec<String> = value
            .split_whitespace()
            .filter(|v| !v.is_empty())
            .map(|v| v.to_string())
            .collect();

        if key == "archives" {
            archives = values;
        }
    }

    Ok(archives)
}
