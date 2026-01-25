use serde_json::Value;
use xxhash_rust::xxh64::xxh64;

#[tauri::command]
pub fn identify_match(obj: Value) -> Result<String, String> {
    let id = hash_match_from_full_match(&obj);
    Ok(id)
}

fn hash_match_from_full_match(obj: &Value) -> String {
    let timestamp = obj["matchDetails"]["timestamp"].as_str().unwrap_or("");
    let map = obj["matchDetails"]["mapName"].as_str().unwrap_or("");
    let format = obj["matchDetails"]["format"].as_str().unwrap_or("");

    let empty: Vec<Value> = Vec::new();
    let players = obj["players"]
        .as_array()
        .or_else(|| obj["soloShuffle"]["matchSummary"]["players"].as_array())
        .unwrap_or(&empty);

    // gather all player-related stable fields (order-independent)
    let mut realms: Vec<String> = players
        .iter()
        .filter_map(|p| p["realm"].as_str().map(|s| s.to_lowercase()))
        .collect();

    let mut names: Vec<String> = players
        .iter()
        .filter_map(|p| p["name"].as_str().map(|s| s.to_lowercase()))
        .collect();

    let mut servers: Vec<String> = players
        .iter()
        .filter_map(|p| p["server"].as_str().map(|s| s.to_lowercase()))
        .collect();

    realms.sort();
    names.sort();
    servers.sort();

    // build stable string representation
    let combined = format!(
        "{}|{}|{}|{:?}|{:?}|{:?}",
        timestamp, map, format, realms, names, servers
    );

    // xxHash64 → always 8 bytes → 16 hex chars
    let h = xxh64(combined.as_bytes(), 0);
    format!("{:016x}", h)
}
