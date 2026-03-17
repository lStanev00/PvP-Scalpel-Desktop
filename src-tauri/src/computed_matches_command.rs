use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const SCHEMA_VERSION: u8 = 2;

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
    dir.push("v2");
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
    if normalize_entries_in_place(&mut parsed) {
        write_store_atomic(path, &parsed)?;
    }
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

fn bracket_id_from_format(format: &str) -> i64 {
    match format.trim().to_lowercase().as_str() {
        "solo shuffle" => 1,
        "battleground blitz" => 2,
        "rated arena 2v2" => 3,
        "rated arena 3v3" => 4,
        "rated arena" => 5,
        "rated battleground" => 6,
        "arena skirmish" => 7,
        "brawl" => 8,
        "random battleground" => 9,
        "random epic battleground" => 10,
        _ => 0,
    }
}

fn count_faction_players(value: &Value) -> (usize, usize) {
    let mut horde = 0_usize;
    let mut alliance = 0_usize;

    if let Some(players) = value.get("players").and_then(|v| v.as_array()) {
        for player in players {
            let faction = player
                .get("faction")
                .and_then(|v| v.as_i64().or_else(|| v.as_u64().map(|raw| raw as i64)));
            match faction {
                Some(0) => horde += 1,
                Some(1) => alliance += 1,
                _ => {}
            }
        }
    }

    (horde, alliance)
}

fn normalize_match_entry(mut value: Value) -> (Value, bool) {
    let mut changed = false;
    let (horde, alliance) = count_faction_players(&value);

    let current_format = value
        .get("matchDetails")
        .and_then(|v| v.get("format"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let mut next_format = current_format.clone();
    let mut bracket_id = bracket_id_from_format(&current_format);

    if bracket_id == 9 && horde >= 25 && alliance >= 25 {
        next_format = "Random Epic Battleground".to_string();
        bracket_id = 10;
    }

    if let Some(root) = value.as_object_mut() {
        if let Some(match_details) = root.get_mut("matchDetails").and_then(|v| v.as_object_mut()) {
            if !next_format.is_empty() && next_format != current_format {
                match_details.insert("format".to_string(), Value::String(next_format));
                changed = true;
            }
        }

        let existing_bracket_id = root
            .get("bracketId")
            .and_then(|v| v.as_i64().or_else(|| v.as_u64().map(|raw| raw as i64)));
        if existing_bracket_id != Some(bracket_id) {
            root.insert("bracketId".to_string(), json!(bracket_id));
            changed = true;
        }
    }

    (value, changed)
}

fn normalize_entries_in_place(file: &mut ComputedMatchesFile) -> bool {
    let keys: Vec<String> = file.entries.keys().cloned().collect();
    let mut changed = false;

    for key in keys {
        if let Some(entry) = file.entries.get(&key).cloned() {
            let (normalized, entry_changed) = normalize_match_entry(entry);
            if entry_changed {
                file.entries.insert(key, normalized);
                changed = true;
            }
        }
    }

    changed
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
    dir.push("v2");

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
        let mut parsed: ComputedMatchesFile = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if parsed.schema_version != SCHEMA_VERSION {
            continue;
        }
        if normalize_entries_in_place(&mut parsed) {
            let _ = write_store_atomic(&path, &parsed);
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
        let (normalized, _) = normalize_match_entry(entry);
        if let Some(match_key) = match_key_of(&normalized) {
            file.entries.insert(match_key, normalized);
        }
    });

    file.schema_version = SCHEMA_VERSION;
    file.updated_at_ms = now_ms();
    write_store_atomic(&path, &file)
}
