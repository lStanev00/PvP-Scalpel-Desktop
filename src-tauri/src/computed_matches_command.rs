use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const SCHEMA_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ComputedMatchesFile {
    schema_version: u8,
    account: String,
    updated_at_ms: u64,
    entries: HashMap<String, Value>,
}

impl ComputedMatchesFile {
    fn empty(account: String) -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            account,
            updated_at_ms: now_ms(),
            entries: HashMap::new(),
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn sanitize_account(value: &str) -> String {
    let out: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '#' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    if out.is_empty() {
        "unknown".to_string()
    } else {
        out
    }
}

fn store_path(app: &AppHandle, account: &str) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Unable to resolve app data directory: {e}"))?;
    dir.push("computed_outcomes");
    dir.push("v1");
    fs::create_dir_all(&dir).map_err(|e| format!("Unable to create computed store directory: {e}"))?;
    dir.push(format!("{}.json", sanitize_account(account)));
    Ok(dir)
}

fn read_store(path: &PathBuf, account: &str) -> Result<ComputedMatchesFile, String> {
    if !path.exists() {
        return Ok(ComputedMatchesFile::empty(account.to_string()));
    }

    let content =
        fs::read_to_string(path).map_err(|e| format!("Unable to read computed store file: {e}"))?;
    let mut parsed: ComputedMatchesFile = serde_json::from_str(&content)
        .map_err(|e| format!("Unable to parse computed store file: {e}"))?;

    if parsed.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "Unsupported computed store schema version: {}",
            parsed.schema_version
        ));
    }

    parsed.account = account.to_string();
    Ok(parsed)
}

fn write_store_atomic(path: &PathBuf, data: &ComputedMatchesFile) -> Result<(), String> {
    let bytes =
        serde_json::to_vec(data).map_err(|e| format!("Unable to serialize computed store: {e}"))?;
    let tmp_path = path.with_extension("tmp");
    fs::write(&tmp_path, bytes).map_err(|e| format!("Unable to write computed store temp file: {e}"))?;
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    fs::rename(&tmp_path, path).map_err(|e| format!("Unable to replace computed store file: {e}"))?;
    Ok(())
}

fn match_key_of(value: &Value) -> Option<String> {
    value
        .get("matchKey")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

#[tauri::command]
pub fn load_computed_matches(app: AppHandle, account: String) -> Result<Vec<Value>, String> {
    let path = store_path(&app, &account)?;
    let file = read_store(&path, &account)?;
    Ok(file.entries.into_values().collect())
}

#[tauri::command]
pub fn load_all_computed_matches(app: AppHandle) -> Result<Vec<Value>, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Unable to resolve app data directory: {e}"))?;
    dir.push("computed_outcomes");
    dir.push("v1");

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut out: Vec<Value> = Vec::new();
    let read_dir = fs::read_dir(&dir).map_err(|e| format!("Unable to read computed store dir: {e}"))?;

    for entry in read_dir.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|v| v.to_str()) != Some("json") {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let parsed: ComputedMatchesFile = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if parsed.schema_version != SCHEMA_VERSION {
            continue;
        }
        out.extend(parsed.entries.into_values());
    }

    Ok(out)
}

#[tauri::command]
pub fn upsert_computed_matches(
    app: AppHandle,
    account: String,
    matches: Vec<Value>,
) -> Result<(), String> {
    if matches.is_empty() {
        return Ok(());
    }

    let path = store_path(&app, &account)?;
    let mut file = read_store(&path, &account)?;

    matches.into_iter().for_each(|entry| {
        if let Some(match_key) = match_key_of(&entry) {
            file.entries.insert(match_key, entry);
        }
    });

    file.schema_version = SCHEMA_VERSION;
    file.updated_at_ms = now_ms();
    write_store_atomic(&path, &file)
}
