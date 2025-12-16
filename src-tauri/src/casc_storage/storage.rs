use std::path::PathBuf;
use crate::casc_storage::types::*;
use crate::casc_storage::types::et_type::EncodingTable;
use crate::casc_storage::types::is_type::IndexStore;
use crate::casc_storage::root::RootTable;
use crate::casc_storage::encoding::normalize_ekey;
use crate::casc_storage::blte::{read_blte, parse_blte_with_keys};
use crate::casc_storage::listfile::Listfile;
use crate::casc_storage::keys::KeyService;
use crate::casc_storage::types::is_type::CdnIndexStore;
use tauri::{AppHandle, Manager};
use tauri::path::BaseDirectory;

use reqwest::blocking::Client;
use std::sync::Mutex;

pub struct CascStorage { // ./types/cs_types.rs <= 
    // pub product: String,               // "wow"
    pub root_path: std::path::PathBuf,  // _retail_ folder

    pub config: CascConfig,
    pub root_table: RootTable,
    pub encoding: EncodingTable,
    pub index_store: IndexStore,
    pub cdn_index: CdnIndexStore,
    pub listfile: Option<Listfile>,
    pub keys: Mutex<KeyService>,
    // pub encoding: EncodingTable,
    // pub index: IndexStore,
    // pub root: WowRoot,

    // pub listfile: Option<ListFile>,     // optional but VERY useful
}

impl CascStorage {
    pub fn open(app: &AppHandle, path: impl Into<PathBuf>) -> Result<Self, CascError> {
        let root_path = path.into();

        if !root_path.exists() {
            return Err(CascError::FileNotFound);
        }

        let config = crate::casc_storage::config::load_config(&root_path)?;

        let data_dir = if root_path.join("Data").exists() {
            root_path.join("Data")
        } else {
            root_path.clone()
        };

        // Load keys optionally from bundled files
        let mut keys = KeyService::new();
        if let Ok(p) = app
            .path()
            .resolve("src/casc_storage/TactKey.csv", BaseDirectory::Resource)
        {
            let _ = keys.load_from_file(&p);
        }
        if let Ok(p) = app
            .path()
            .resolve("src/casc_storage/WoW.txt", BaseDirectory::Resource)
        {
            let _ = keys.load_from_file(&p);
        }

        let indices_dir = data_dir.join("data");
        let index_store = IndexStore::load(&indices_dir)?;
        let cdn_index = CdnIndexStore::load(&data_dir, &config).unwrap_or(CdnIndexStore { entries: std::collections::HashMap::new() });

        let encoding = EncodingTable::load_from_index(
            &data_dir,
            &index_store,
            config.encoding_ekey,
            &keys,
        )?;

        let root_table = RootTable::load_from_index(
            &data_dir,
            &index_store,
            &encoding,
            config.root_hash,
            &keys,
        )?;

        let listfile = match app
            .path()
            .resolve("src/casc_storage/listfile.csv", BaseDirectory::Resource)
        {
            Ok(p) => {
                println!(
                    "[LISTFILE] resolved resource path: {}",
                    p.display()
                );
                match Listfile::load(&p, &root_table) {
                    Ok(lf) => Some(lf),
                    Err(e) => {
                        println!("[LISTFILE] failed to load: {}", e);
                        None
                    }
                }
            }
            Err(_) => {
                println!("[LISTFILE] listfile.csv not found");
                None
            }
        };

        Ok(Self {
            root_path,
            config,
            root_table,
            encoding,
            index_store,
            cdn_index,
            listfile,
            keys: Mutex::new(keys),
        })
    }
}

pub fn read_file_by_filedataid(storage: &CascStorage, file_data_id: u32) -> Result<Vec<u8>, CascError> {
    println!("[CASC] read_file_by_filedataid start: fileDataID={}", file_data_id);

    let ckey = storage
        .root_table
        .by_file_id
        .get(&file_data_id)
        .ok_or_else(|| {
            println!("[CASC] root lookup failed: fileDataID={}", file_data_id);
            CascError::FileNotFound
        })?;

    println!(
        "[CASC] root resolved: fileDataID={} contentKey={}",
        file_data_id,
        hex::encode(ckey.0)
    );

    let enc_entry = storage.encoding.entries.get(ckey).ok_or_else(|| {
        println!(
            "[CASC] encoding lookup failed: fileDataID={} contentKey={}",
            file_data_id,
            hex::encode(ckey.0)
        );
        CascError::MissingEncoding
    })?;

    println!(
        "[CASC] encoding resolved: contentKey={} encodingKeys={}",
        hex::encode(ckey.0),
        enc_entry.encoding_keys.len()
    );

    let ekey_raw = enc_entry
        .encoding_keys
        .get(0)
        .ok_or_else(|| {
            println!(
                "[CASC] no encoding keys: fileDataID={} contentKey={}",
                file_data_id,
                hex::encode(ckey.0)
            );
            CascError::MissingEncoding
        })?
        .0;

    let norm = normalize_ekey(ekey_raw);
    if let Some(idx_entry) = storage.index_store.entries.get(&norm) {
        println!(
            "[CASC] BLTE read: archive={} offset={} size={}",
            idx_entry.archive, idx_entry.offset, idx_entry.size
        );

        let data_dir = if storage.root_path.join("Data").exists() {
            storage.root_path.join("Data")
        } else {
            storage.root_path.clone()
        };

        let mut keys = storage.keys.lock().unwrap();
        match read_blte(&data_dir, idx_entry, ekey_raw, &*keys) {
            Ok(decoded) => {
                println!(
                    "[CASC] BLTE decoded: outputBytes={}",
                    decoded.len()
                );
                Ok(decoded)
            }
            Err(CascError::MissingDecryptionKey(k)) => {
                if keys.fetch_remote_if_needed(k)? {
                    println!("[KEYS] retrying BLTE decode");
                    let decoded = read_blte(&data_dir, idx_entry, ekey_raw, &*keys)?;
                    println!(
                        "[CASC] BLTE decoded: outputBytes={}",
                        decoded.len()
                    );
                    Ok(decoded)
                } else {
                    Err(CascError::MissingDecryptionKey(k))
                }
            }
            Err(e) => Err(e),
        }
    } else if let Some(cdn_entry) = storage.cdn_index.entries.get(&norm) {
        let host = storage.config.cdn_hosts.get(0).ok_or_else(|| CascError::FileNotFound)?;
        let archive_name = storage
            .config
            .archives
            .get(cdn_entry.archive as usize)
            .ok_or_else(|| CascError::FileNotFound)?;
        println!(
            "[CDN] archive hit: archive={} offset={} size={}",
            archive_name,
            cdn_entry.offset,
            cdn_entry.size
        );
        let url = format!(
            "https://{}/{}/data/{}/{}/{}",
            host.trim_end_matches('/'),
            storage.config.cdn_path.trim_start_matches('/'),
            &archive_name[0..2],
            &archive_name[2..4],
            archive_name
        );
        let range_start = cdn_entry.offset as u64;
        let range_end = range_start + cdn_entry.size as u64 - 1;
        let client = Client::new();
        let resp = client
            .get(&url)
            .header(
                reqwest::header::RANGE,
                format!("bytes={}-{}", range_start, range_end),
            )
            .send()
            .map_err(|e| {
                println!("[CDN] range fetch failed: {}", e);
                CascError::FileNotFound
            })?;
        if !resp.status().is_success() {
            println!("[CDN] range fetch failed: http {}", resp.status());
            return Err(CascError::FileNotFound);
        }
        let bytes = resp.bytes().map_err(|e| {
            println!("[CDN] read failed: {}", e);
            CascError::FileNotFound
        })?;
        println!("[CDN] range fetch OK bytes={}", bytes.len());
        let mut keys = storage.keys.lock().unwrap();
        let result = parse_blte_with_keys(&bytes, Some(&*keys));
        match result {
            Ok(decoded) => {
                println!("[CASC] BLTE decoded: outputBytes={}", decoded.len());
                Ok(decoded)
            }
            Err(CascError::MissingDecryptionKey(k)) => {
                if keys.fetch_remote_if_needed(k)? {
                    println!("[KEYS] retrying BLTE decode");
                    let decoded = parse_blte_with_keys(&bytes, Some(&*keys))?;
                    println!("[CASC] BLTE decoded: outputBytes={}", decoded.len());
                    Ok(decoded)
                } else {
                    Err(CascError::MissingDecryptionKey(k))
                }
            }
            Err(e) => Err(e),
        }
    } else {
        println!(
            "[CASC] index lookup failed: fileDataID={} ekey={}",
            file_data_id,
            hex::encode(ekey_raw)
        );
        let decoded = fetch_from_cdn(storage, ekey_raw)?;
        Ok(decoded)
    }
}

fn fetch_from_cdn(storage: &CascStorage, ekey_raw: [u8; 16]) -> Result<Vec<u8>, CascError> {
    let host = storage.config.cdn_hosts.get(0).cloned().ok_or_else(|| {
        println!("[CDN] local index miss, but no CDN hosts configured");
        CascError::FileNotFound
    })?;
    if storage.config.cdn_path.is_empty() {
        println!("[CDN] local index miss, but CDN path missing");
        return Err(CascError::FileNotFound);
    }

    println!("[CDN] local index miss, falling back");
    println!("[CDN] host={}", host);

    let ekey_hex = hex::encode(ekey_raw);
    println!("[CDN] fetch ekey={}", ekey_hex);

    let url = format!(
        "https://{}/{}/data/{}/{}/{}",
        host.trim_end_matches('/'),
        storage.config.cdn_path.trim_start_matches('/'),
        &ekey_hex[0..2],
        &ekey_hex[2..4],
        ekey_hex
    );

    let client = Client::new();
    let resp = client.get(&url).send().map_err(|e| {
        println!("[CDN] fetch failed: {}", e);
        CascError::FileNotFound
    })?;

    if !resp.status().is_success() {
        println!("[CDN] fetch failed: http {}", resp.status());
        return Err(CascError::FileNotFound);
    }

    let bytes = resp.bytes().map_err(|e| {
        println!("[CDN] read failed: {}", e);
        CascError::FileNotFound
    })?;

    println!("[CDN] fallback to direct EKey");
    println!("[CDN] received bytes={}", bytes.len());

    let mut keys = storage.keys.lock().unwrap();
    let result = parse_blte_with_keys(&bytes, Some(&*keys));
    match result {
        Ok(decoded) => {
            println!("[CDN] BLTE decoded bytes={}", decoded.len());
            Ok(decoded)
        }
        Err(CascError::MissingDecryptionKey(k)) => {
            if keys.fetch_remote_if_needed(k)? {
                println!("[KEYS] retrying BLTE decode");
                let decoded = parse_blte_with_keys(&bytes, Some(&*keys))?;
                println!("[CDN] BLTE decoded bytes={}", decoded.len());
                Ok(decoded)
            } else {
                Err(CascError::MissingDecryptionKey(k))
            }
        }
        Err(e) => {
            println!("[CDN] BLTE decode failed: {}", e);
            Err(e)
        }
    }
}
