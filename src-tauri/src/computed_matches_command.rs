use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const LEGACY_SCHEMA_VERSION: u8 = 1;
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
    fn empty(account: String, schema_version: u8) -> Self {
        Self {
            schema_version,
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

fn version_dir(schema_version: u8) -> &'static str {
    match schema_version {
        LEGACY_SCHEMA_VERSION => "v1",
        SCHEMA_VERSION => "v2",
        _ => "v2",
    }
}

fn store_dir(app: &AppHandle, schema_version: u8, create_dir: bool) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Unable to resolve app data directory: {e}"))?;
    dir.push("computed_outcomes");
    dir.push(version_dir(schema_version));
    if create_dir {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Unable to create computed store directory: {e}"))?;
    }
    Ok(dir)
}

fn store_path(
    app: &AppHandle,
    account: &str,
    schema_version: u8,
    create_dir: bool,
) -> Result<PathBuf, String> {
    let mut dir = store_dir(app, schema_version, create_dir)?;
    dir.push(format!("{}.json", sanitize_account(account)));
    Ok(dir)
}

fn read_store(
    path: &PathBuf,
    account: &str,
    schema_version: u8,
    persist_normalized: bool,
) -> Result<ComputedMatchesFile, String> {
    if !path.exists() {
        return Ok(ComputedMatchesFile::empty(
            account.to_string(),
            schema_version,
        ));
    }

    let content =
        fs::read_to_string(path).map_err(|e| format!("Unable to read computed store file: {e}"))?;
    let mut parsed: ComputedMatchesFile = serde_json::from_str(&content)
        .map_err(|e| format!("Unable to parse computed store file: {e}"))?;

    if parsed.schema_version != schema_version {
        return Err(format!(
            "Unsupported computed store schema version: {}",
            parsed.schema_version
        ));
    }

    parsed.account = account.to_string();
    if normalize_entries_in_place(&mut parsed) && persist_normalized {
        write_store_atomic(path, &parsed)?;
    }
    Ok(parsed)
}

fn read_store_or_empty(
    path: &PathBuf,
    account: &str,
    schema_version: u8,
    persist_normalized: bool,
) -> ComputedMatchesFile {
    read_store(path, account, schema_version, persist_normalized)
        .unwrap_or_else(|_| ComputedMatchesFile::empty(account.to_string(), schema_version))
}

fn write_store_atomic(path: &PathBuf, data: &ComputedMatchesFile) -> Result<(), String> {
    let bytes =
        serde_json::to_vec(data).map_err(|e| format!("Unable to serialize computed store: {e}"))?;
    let tmp_path = path.with_extension("tmp");
    fs::write(&tmp_path, bytes)
        .map_err(|e| format!("Unable to write computed store temp file: {e}"))?;
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    fs::rename(&tmp_path, path)
        .map_err(|e| format!("Unable to replace computed store file: {e}"))?;
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

fn merge_entry_maps(target: &mut HashMap<String, Value>, source: HashMap<String, Value>) {
    source.into_iter().for_each(|(match_key, entry)| {
        target.insert(match_key, entry);
    });
}

fn promote_legacy_entries(
    app: &AppHandle,
    account: &str,
    legacy_entries: &HashMap<String, Value>,
) -> Result<(), String> {
    if legacy_entries.is_empty() {
        return Ok(());
    }

    let current_path = store_path(app, account, SCHEMA_VERSION, true)?;
    let mut current = read_store_or_empty(&current_path, account, SCHEMA_VERSION, true);
    let mut changed = false;

    legacy_entries.iter().for_each(|(match_key, entry)| {
        if !current.entries.contains_key(match_key) {
            current.entries.insert(match_key.clone(), entry.clone());
            changed = true;
        }
    });

    if !changed {
        return Ok(());
    }

    current.schema_version = SCHEMA_VERSION;
    current.account = account.to_string();
    current.updated_at_ms = now_ms();
    write_store_atomic(&current_path, &current)
}

fn load_account_store_union(app: &AppHandle, account: &str) -> Result<ComputedMatchesFile, String> {
    let legacy_path = store_path(app, account, LEGACY_SCHEMA_VERSION, false)?;
    let legacy = read_store_or_empty(&legacy_path, account, LEGACY_SCHEMA_VERSION, false);
    if !legacy.entries.is_empty() {
        let _ = promote_legacy_entries(app, account, &legacy.entries);
    }

    let current_path = store_path(app, account, SCHEMA_VERSION, true)?;
    let current = read_store_or_empty(&current_path, account, SCHEMA_VERSION, true);

    let mut merged = ComputedMatchesFile::empty(account.to_string(), SCHEMA_VERSION);
    merged.updated_at_ms = legacy.updated_at_ms.max(current.updated_at_ms);
    merge_entry_maps(&mut merged.entries, legacy.entries);
    merge_entry_maps(&mut merged.entries, current.entries);
    Ok(merged)
}

fn read_all_stores(
    app: &AppHandle,
    schema_version: u8,
    persist_normalized: bool,
) -> Result<Vec<(String, ComputedMatchesFile)>, String> {
    let dir = store_dir(app, schema_version, false)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut out = Vec::new();
    let read_dir =
        fs::read_dir(&dir).map_err(|e| format!("Unable to read computed store dir: {e}"))?;

    for entry in read_dir.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|v| v.to_str()) != Some("json") {
            continue;
        }

        let account = path
            .file_stem()
            .and_then(|v| v.to_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "unknown".to_string());

        let parsed = match read_store(&path, &account, schema_version, persist_normalized) {
            Ok(value) => value,
            Err(_) => continue,
        };

        out.push((account, parsed));
    }

    Ok(out)
}

#[tauri::command]
pub fn load_computed_matches(app: AppHandle, account: String) -> Result<Vec<Value>, String> {
    let file = load_account_store_union(&app, &account)?;
    Ok(file.entries.into_values().collect())
}

#[tauri::command]
pub fn load_all_computed_matches(app: AppHandle) -> Result<Vec<Value>, String> {
    let mut by_account: HashMap<String, HashMap<String, Value>> = HashMap::new();

    for (account, legacy) in read_all_stores(&app, LEGACY_SCHEMA_VERSION, false)? {
        if !legacy.entries.is_empty() {
            let _ = promote_legacy_entries(&app, &account, &legacy.entries);
        }
        let bucket = by_account.entry(account).or_default();
        merge_entry_maps(bucket, legacy.entries);
    }

    for (account, current) in read_all_stores(&app, SCHEMA_VERSION, true)? {
        let bucket = by_account.entry(account).or_default();
        merge_entry_maps(bucket, current.entries);
    }

    Ok(by_account
        .into_values()
        .flat_map(|entries| entries.into_values())
        .collect())
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

    let path = store_path(&app, &account, SCHEMA_VERSION, true)?;
    let mut file = read_store_or_empty(&path, &account, SCHEMA_VERSION, true);

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