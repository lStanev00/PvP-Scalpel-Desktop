#![allow(dead_code)]

use std::fs;
use std::path::Path;

pub fn dump_json(path: &Path, value: &serde_json::Value) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let text = serde_json::to_string_pretty(value).unwrap_or_else(|_| "[]".to_string());
    fs::write(path, text)
}
