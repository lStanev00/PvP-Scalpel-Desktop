use reqwest::Client;
use serde_json::Value;

// Centralized API base for manifest checks.
const API_BASE: &str = "https://api.pvpscalpel.com";

#[tauri::command]
pub async fn fetch_manifest() -> Result<Value, String> {
    // Always fetch fresh manifest; no caching on the backend.
    let url = format!("{}/CDN/manifest", API_BASE);
    let client = Client::new();
    let response = client
        .get(url)
        .header("600", "BasicPass")
        .send()
        .await
        .map_err(|err| format!("Manifest request failed: {err}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("Manifest request failed: HTTP {status}"));
    }

    response
        .json::<Value>()
        .await
        .map_err(|err| format!("Manifest parse failed: {err}"))
}
