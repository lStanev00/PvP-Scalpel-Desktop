use std::path::{Path, PathBuf};
use std::thread;

use tauri::AppHandle;

use crate::logger;

use super::storage::CascStorage;

#[derive(Clone, Copy, Debug)]
pub struct CascBootstrapOptions {
    pub run_spell_dump: bool,
}

pub fn derive_casc_root_from_account_path(account_path: &Path) -> PathBuf {
    // account_path = <WoW>/_retail_/WTF/Account
    // We want the WoW root that holds `.build.info`.
    account_path
        .parent() // WTF
        .and_then(|p| p.parent()) // _retail_
        .and_then(|p| p.parent()) // WoW root
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| account_path.to_path_buf())
}

pub fn spawn_from_account_path(app: AppHandle, account_path: PathBuf, options: CascBootstrapOptions) {
    let casc_root = derive_casc_root_from_account_path(&account_path);
    spawn_casc_bootstrap(app, casc_root, options);
}

pub fn spawn_casc_bootstrap(app: AppHandle, casc_root: PathBuf, options: CascBootstrapOptions) {
    thread::spawn(move || {
        logger::info(
            "CASC",
            format!("bootstrap thread start: root={}", casc_root.display()),
        );

        let storage = match CascStorage::open(&app, casc_root.clone()) {
            Ok(storage) => {
                logger::info("CASC", format!("opened storage root={}", storage.root_path.display()));
                storage
            }
            Err(e) => {
                logger::error(
                    "CASC",
                    format!("failed to open CASC (root={}): {}", casc_root.display(), e),
                );
                return;
            }
        };

        logger::info("TACTKEY", "seeding keys from TactKey tables");
        match crate::casc_storage::tact_keys::seed_keys_from_tact_tables(&storage) {
            Ok(inserted) => logger::info("TACTKEY", format!("seed complete (inserted={})", inserted)),
            Err(e) => logger::warn("TACTKEY", format!("seed failed: {e}")),
        }

        if options.run_spell_dump {
            logger::info("SPELLDUMP", "starting SpellDataDump generation");
            match crate::spell_data_dump::run_spell_data_dump(&storage) {
                Ok(()) => logger::info("SPELLDUMP", "done"),
                Err(e) => logger::error("SPELLDUMP", format!("failed: {e}")),
            }
        }

        logger::info(
            "CASC",
            "bootstrap done, dropping CASC storage to release memory",
        );
        drop(storage);
    });
}
