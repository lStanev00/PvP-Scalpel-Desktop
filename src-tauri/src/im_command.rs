use serde_json::Value;

#[tauri::command]
pub fn identify_match(obj: Value) -> Result<String, String> {
    let timestamp = obj["matchDetails"]["timestamp"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let map = obj["matchDetails"]["mapName"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let format = obj["matchDetails"]["format"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let empty: Vec<Value> = Vec::new();

    let players = obj["players"]
        .as_array()
        .unwrap_or(&empty);

    let owner = players
        .iter()
        .find(|p| p["isOwner"].as_bool().unwrap_or(false));

    let mut owner_name = String::new();
    let mut owner_realm = String::new();
    let mut owner_spec = String::new();
    let mut owner_server = String::new();

    if let Some(p) = owner {
        owner_name = p["name"].as_str().unwrap_or("").to_string().to_lowercase();
        owner_realm = p["realm"].as_str().unwrap_or("").to_string().to_lowercase();
        owner_spec = p["spec"].as_str().unwrap_or("").to_string();
        owner_server = p["server"].as_str().unwrap_or("").to_string().to_lowercase();
    }

    // if server missing, scan other players
    if owner_server.is_empty() {
        for p in players {
            if let Some(s) = p["server"].as_str() {
                if !s.is_empty() {
                    owner_server = s.to_string();
                    break;
                }
            }
        }
    }

    // final fallback
    if owner_server.is_empty() {
        owner_server = "eu".to_string();
    }

    let id = hash_match(
        &timestamp,
        &map,
        &format,
        &owner_name,
        &owner_realm,
        &owner_server,
        &owner_spec,
    );

    Ok(id)
}

fn hash_match(
    timestamp: &str,
    map: &str,
    format: &str,
    owner_name: &str,
    owner_realm: &str,
    owner_server: &str,
    owner_spec: &str,
) -> String {
    let key = format!(
        "{}|{}|{}|{}|{}|{}|{}",
        timestamp, map, format, owner_name, owner_realm, owner_server, owner_spec
    );

    let mut hash: u32 = 0;
    for b in key.bytes() {
        hash = hash.wrapping_mul(31).wrapping_add(b as u32);
    }

    let hash_str = format!("{:08x}", hash);

    format!(
        "{}:{}:{}|{}",
        owner_name,
        owner_realm,
        owner_server,
        hash_str
    )
}
