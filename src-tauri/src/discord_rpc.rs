use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

static CLIENT: OnceLock<Mutex<DiscordIpcClient>> = OnceLock::new();
static START_TS: OnceLock<i64> = OnceLock::new();

pub fn start_rich_presence() {
    std::thread::spawn(|| {
        let client_id = "1446422635306287114";

        let mut client = DiscordIpcClient::new(client_id).unwrap();
        if client.connect().is_err() {
            eprintln!("Discord RPC: failed to connect.");
            return;
        }

        // Save timestamp ONCE
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        START_TS.set(now).ok();

        let activity = activity::Activity::new()
            .details("Private Beta")
            .timestamps(activity::Timestamps::new().start(now))
            .assets(
                activity::Assets::new()
                    .large_image("logo")
            );

        let _ = client.set_activity(activity);

        CLIENT.set(Mutex::new(client)).ok();
    });
}

#[tauri::command]
pub fn update_state_rich_presence(state: &str) {
    if let (Some(c_wrap), Some(start)) = (CLIENT.get(), START_TS.get()) {
        if let Ok(mut client) = c_wrap.lock() {
            let activity = activity::Activity::new()
                .details("In Development")
                .state(state)
                .timestamps(activity::Timestamps::new().start(*start))
                .assets(
                    activity::Assets::new()
                        .large_image("logo")
                );

            let _ = client.set_activity(activity);
        }
    }
}
