use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::casc_storage::types::CascError;
use crate::logger;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct FormatTable {
    #[serde(default)]
    pub parent: Option<String>,
    pub fields: Vec<FormatField>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct FormatField {
    pub data_type: String,
    pub field: String,
    #[serde(default)]
    pub elements: Option<usize>,
    #[serde(default)]
    pub r#ref: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct WowVersion {
    major: u32,
    minor: u32,
    patch: u32,
    build: u32,
}

fn repo_root() -> Result<PathBuf, CascError> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| CascError::Io(std::io::Error::new(std::io::ErrorKind::NotFound, "repo root not found")))
}

fn default_formats_dirs() -> Result<Vec<PathBuf>, CascError> {
    let root = repo_root()?;
    Ok(vec![
        root.join("external").join("simc").join("dbc_extract3").join("formats"),
        root.join("debug_inputs").join("simc_formats"),
        root.join("src-tauri").join("resources").join("simc_formats"),
    ])
}

fn parse_wow_version_exact(s: &str) -> Option<WowVersion> {
    let s = s.trim();
    let mut parts = s.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    let build = parts.next()?.parse().ok()?;
    Some(WowVersion {
        major,
        minor,
        patch,
        build,
    })
}

fn parse_build_name_target(build_name: &str) -> Option<WowVersion> {
    if let Some(v) = parse_wow_version_exact(build_name) {
        return Some(v);
    }

    let (major, minor, patch) = find_version_triplet(build_name)?;
    let build = find_wow_build(build_name).unwrap_or(u32::MAX);
    Some(WowVersion {
        major,
        minor,
        patch,
        build,
    })
}

fn find_wow_build(s: &str) -> Option<u32> {
    let upper = s.to_ascii_uppercase();
    let idx = upper.find("WOW-")?;
    let digits = upper[idx + 4..]
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>();
    digits.parse().ok()
}

fn parse_num(bytes: &[u8], start: usize) -> Option<(u32, usize)> {
    let mut end = start;
    while end < bytes.len() && bytes[end].is_ascii_digit() {
        end += 1;
    }
    if end == start {
        return None;
    }
    let s = std::str::from_utf8(&bytes[start..end]).ok()?;
    let v: u32 = s.parse().ok()?;
    Some((v, end))
}

fn find_version_triplet(s: &str) -> Option<(u32, u32, u32)> {
    let bytes = s.as_bytes();
    for i in 0..bytes.len() {
        if !bytes[i].is_ascii_digit() {
            continue;
        }
        let (major, j) = parse_num(bytes, i)?;
        if bytes.get(j) != Some(&b'.') {
            continue;
        }
        let (minor, k) = parse_num(bytes, j + 1)?;
        if bytes.get(k) != Some(&b'.') {
            continue;
        }
        let (patch, _l) = parse_num(bytes, k + 1)?;
        return Some((major, minor, patch));
    }
    None
}

fn select_formats_dir() -> Result<PathBuf, CascError> {
    for dir in default_formats_dirs()? {
        if dir.exists() {
            return Ok(dir);
        }
    }
    Err(CascError::FileNotFound)
}

pub fn select_simc_format(build_name: &str) -> Result<PathBuf, CascError> {
    let formats_dir = select_formats_dir()?;
    let target = parse_build_name_target(build_name);

    let mut candidates: Vec<(WowVersion, PathBuf)> = Vec::new();
    for entry in fs::read_dir(&formats_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => continue,
        };
        let ver = match parse_wow_version_exact(stem) {
            Some(v) => v,
            None => continue,
        };
        candidates.push((ver, path));
    }

    candidates.sort_by_key(|(v, _)| *v);
    if candidates.is_empty() {
        return Err(CascError::FileNotFound);
    }

    if let Some(target) = target {
        if let Some((_, path)) = candidates.iter().rev().find(|(v, _)| *v <= target) {
            logger::debug(
                "SPELLDUMP",
                format!("selected SimC formats={}", path.display()),
            );
            return Ok(path.clone());
        }
    }

    let path = candidates.last().unwrap().1.clone();
    logger::debug(
        "SPELLDUMP",
        format!("selected SimC formats={}", path.display()),
    );
    Ok(path)
}

pub fn load_formats_for_build(build_name: &str) -> Result<(PathBuf, HashMap<String, FormatTable>), CascError> {
    let format_path = select_simc_format(build_name)?;
    let formats = load_formats(&format_path)?;
    Ok((format_path, formats))
}

pub fn load_formats(format_path: &Path) -> Result<HashMap<String, FormatTable>, CascError> {
    let text = fs::read_to_string(format_path)?;
    serde_json::from_str(&text).map_err(|_| CascError::InvalidConfig)
}

