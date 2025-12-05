use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::{OnceLock, Mutex};

static CLIENT: OnceLock<Mutex<DiscordIpcClient>> = OnceLock::new();

pub fn start_rich_presence() {
    std::thread::spawn(|| {
        let client_id = "1446422635306287114";

        let mut client = DiscordIpcClient::new(client_id).unwrap();
        if client.connect().is_err() {
            eprintln!("Discord RPC: Could not connect to Discord.");
            return;
        }

        let activity = activity::Activity::new()
            .details("In Development")
            // .state("In Development")
            .assets(
                activity::Assets::new()
                    .large_image("logo")
                    .large_text("PvP Scalpel Analytics"),
            );

        if client.set_activity(activity).is_err() {
            eprintln!("Discord RPC: Failed to set activity.");
        }

        CLIENT.set(Mutex::new(client)).ok();
    });
}

#[tauri::command]
pub fn update_stater_rich_presence(state: &str) {
    if let Some(wrapper) = CLIENT.get() {
        if let Ok(mut client) = wrapper.lock() {
            let activity = activity::Activity::new()
                .details("PvP Scalpel Desktop")
                .state(state)
                .assets(
                    activity::Assets::new()
                        .large_image("logo")
                        .large_text("PvP Scalpel Analytics"),
                );

            let _ = client.set_activity(activity);
        }
    }
}

// pub fn clear_rich_presence() {
//     if let Some(wrapper) = CLIENT.get() {
//         if let Ok(mut client) = wrapper.lock() {
//             let _ = client.clear_activity();
//         }
//     }
// }
