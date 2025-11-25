use notify::{Config, Event, RecommendedWatcher, Watcher};
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub fn create_watcher(app: AppHandle) -> notify::Result<RecommendedWatcher> {
    RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| match res {
            Ok(event) => {
                for path in event.paths {
                    println!("FS event: {:?}", path);

                    if is_our_saved_vars(&path) {
                        if let Some(account) = extract_account_name(&path) {
                            let payload = serde_json::json!({
                                "account": account,
                                "path": path.to_string_lossy()
                            });

                            if let Err(err) = app.emit("savedvars-updated", payload) {
                                eprintln!("emit error: {err}");
                            } else {
                                println!("!!! emitted savedvars-updated");
                            }
                        }
                    }
                }
            }
            Err(err) => eprintln!("watch error: {err}"),
        },
        Config::default().with_poll_interval(Duration::from_millis(400)),
    )
}

fn is_our_saved_vars(path: &Path) -> bool {
    matches!(
        path.file_name().and_then(|n| n.to_str()),
        Some("PvP_Scalpel.lua")
    )
}

pub fn extract_account_name(path: &Path) -> Option<String> {
    let mut comps = path.components().rev();

    comps.next()?; // filename
    if comps.next()?.as_os_str() != "SavedVariables" {
        return None;
    }

    Some(comps.next()?.as_os_str().to_str()?.to_string())
}
