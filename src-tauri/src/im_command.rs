use serde_json::Value;
use xxhash_rust::xxh64::xxh64;

#[tauri::command]
pub fn identify_match(obj: Value) -> Result<String, String> {
    let id = hash_match_from_full_match(&obj);
    Ok(id)
}

fn as_i64_lossy(value: &Value) -> Option<i64> {
    if let Some(v) = value.as_i64() {
        return Some(v);
    }
    if let Some(v) = value.as_u64() {
        return i64::try_from(v).ok();
    }
    value.as_f64().map(|v| v.round() as i64)
}

fn player_key(player: &Value) -> String {
    if let Some(guid) = player.get("guid").and_then(|v| v.as_str()) {
        let trimmed = guid.trim();
        if !trimmed.is_empty() {
            return trimmed.to_lowercase();
        }
    }

    let name = player
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .trim()
        .to_lowercase();
    let realm = player
        .get("realm")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .trim()
        .to_lowercase();

    format!("{name}-{realm}")
}

fn player_damage_healing(player: &Value) -> (Option<i64>, Option<i64>) {
    // Prefer normalized fields when present, otherwise accept scoreboard naming.
    let damage = player
        .get("damage")
        .and_then(as_i64_lossy)
        .or_else(|| player.get("damageDone").and_then(as_i64_lossy))
        .map(|v| v.max(0));
    let healing = player
        .get("healing")
        .and_then(as_i64_lossy)
        .or_else(|| player.get("healingDone").and_then(as_i64_lossy))
        .map(|v| v.max(0));

    (damage, healing)
}

fn player_killing_blows_deaths(player: &Value) -> (Option<i64>, Option<i64>) {
    let killing_blows = player
        .get("killingBlows")
        .and_then(as_i64_lossy)
        .or_else(|| player.get("kills").and_then(as_i64_lossy))
        .map(|v| v.max(0));
    let deaths = player.get("deaths").and_then(as_i64_lossy).map(|v| v.max(0));

    (killing_blows, deaths)
}

fn hash_match_from_full_match(obj: &Value) -> String {
    let map = obj["matchDetails"]["mapName"].as_str().unwrap_or("");
    let format = obj["matchDetails"]["format"].as_str().unwrap_or("");

    let empty: Vec<Value> = Vec::new();
    let players = obj["players"]
        .as_array()
        .or_else(|| obj["soloShuffle"]["matchSummary"]["players"].as_array())
        .unwrap_or(&empty);

    // Gather stable identity fields and per-player totals in a single pass.
    // (We still sort afterward for order-independence.)
    let mut realms: Vec<String> = Vec::with_capacity(players.len());
    let mut names: Vec<String> = Vec::with_capacity(players.len());
    let mut servers: Vec<String> = Vec::with_capacity(players.len());
    let mut stats: Vec<(String, Option<i64>, Option<i64>, Option<i64>, Option<i64>)> =
        Vec::with_capacity(players.len());

    for p in players {
        if let Some(realm) = p.get("realm").and_then(|v| v.as_str()) {
            realms.push(realm.to_lowercase());
        }
        if let Some(name) = p.get("name").and_then(|v| v.as_str()) {
            names.push(name.to_lowercase());
        }
        if let Some(server) = p.get("server").and_then(|v| v.as_str()) {
            servers.push(server.to_lowercase());
        }

        // Include per-player totals to detect tampering across uploads.
        // Missing values remain missing (not coerced to 0) so incomplete captures differ.
        let key = player_key(p);
        let (dmg, heal) = player_damage_healing(p);
        let (kb, deaths) = player_killing_blows_deaths(p);
        stats.push((key, dmg, heal, kb, deaths));
    }

    realms.sort();
    names.sort();
    servers.sort();
    stats.sort_by(|a, b| a.0.cmp(&b.0));

    let mut stats_str = String::new();
    for (idx, (key, dmg, heal, kb, deaths)) in stats.iter().enumerate() {
        if idx > 0 {
            stats_str.push('|');
        }
        stats_str.push_str(key);
        stats_str.push(':');
        match dmg {
            Some(v) => stats_str.push_str(&v.to_string()),
            None => stats_str.push_str("null"),
        }
        stats_str.push(',');
        match heal {
            Some(v) => stats_str.push_str(&v.to_string()),
            None => stats_str.push_str("null"),
        }
        stats_str.push(',');
        match kb {
            Some(v) => stats_str.push_str(&v.to_string()),
            None => stats_str.push_str("null"),
        }
        stats_str.push(',');
        match deaths {
            Some(v) => stats_str.push_str(&v.to_string()),
            None => stats_str.push_str("null"),
        }
    }

    // build stable string representation
    let combined = format!(
        "{}|{}|{:?}|{:?}|{:?}|{}",
        map, format, realms, names, servers, stats_str
    );

    // xxHash64 → always 8 bytes → 16 hex chars
    let h = xxh64(combined.as_bytes(), 0);
    format!("{:016x}", h)
}
