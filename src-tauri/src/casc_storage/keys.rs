use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::casc_storage::types::CascError;

// Minimal key service mirroring CASCExplorer's KeyService behaviour.
// Loads a small built-in set plus optional keys from TactKey.csv if present.
pub struct KeyService {
    keys: HashMap<u64, [u8; 16]>,
    fetch_attempted: bool,
}

impl KeyService {
    pub fn new() -> Self {
        let mut ks = KeyService {
            keys: HashMap::new(),
            fetch_attempted: false,
        };
        ks.load_builtin();
        ks
    }

    pub fn load_from_file(&mut self, path: &Path) -> Result<(), CascError> {
        if !path.exists() {
            return Ok(());
        }
        let data = fs::read_to_string(path).map_err(CascError::Io)?;
        let mut new_entries: Vec<(u64, [u8; 16])> = Vec::new();
        for line in data.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let mut parts = line.split(';');
            let key_name = match parts.next() {
                Some(v) => u64::from_str_radix(v.trim().to_ascii_uppercase().as_str(), 16).ok(),
                None => None,
            };
            let key_hex = parts.next().unwrap_or("").trim().to_ascii_uppercase();
            if key_hex.len() != 32 {
                continue;
            }
            if let Some(name) = key_name {
                if let Ok(bytes) = hex::decode(&key_hex) {
                    if bytes.len() == 16 {
                        let mut arr = [0u8; 16];
                        arr.copy_from_slice(&bytes);
                        if !self.keys.contains_key(&name) {
                            self.keys.insert(name, arr);
                            new_entries.push((name, arr));
                        }
                    }
                }
            }
        }
        if !new_entries.is_empty() {
            println!(
                "[KEYS] loaded {} entries from {}",
                new_entries.len(),
                path.display()
            );
            for (i, (k, v)) in new_entries.iter().take(10).enumerate() {
                println!("[KEYS] [{}] {:016X} => {}", i, k, hex::encode_upper(v));
            }
        }
        Ok(())
    }

    pub fn get(&self, name: u64) -> Option<[u8; 16]> {
        self.keys.get(&name).copied()
    }

    pub fn fetch_remote_if_needed(&mut self, missing_key: u64) -> Result<bool, CascError> {
        // If the key is already present, nothing to do.
        if self.keys.contains_key(&missing_key) {
            return Ok(true);
        }

        // Try local files first (no network). Temp WoW.txt and debug_inputs WoW.txt if present.
        let mut tried_local = false;
        let temp_path = std::env::temp_dir().join("WoW.txt");
        if temp_path.exists() {
            tried_local = true;
            let _ = self.load_from_file(&temp_path);
            if self.keys.contains_key(&missing_key) {
                return Ok(true);
            }
        }
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let local_debug = PathBuf::from(manifest_dir)
                .join("src-tauri")
                .join("src")
                .join("casc_storage")
                .join("debug_inputs")
                .join("WoW.txt");
            if local_debug.exists() {
                tried_local = true;
                let _ = self.load_from_file(&local_debug);
                if self.keys.contains_key(&missing_key) {
                    return Ok(true);
                }
            }
        }

        // Avoid repeated attempts if already tried and nothing new added.
        if self.fetch_attempted && tried_local {
            return Ok(false);
        }
        if self.fetch_attempted {
            return Ok(false);
        }

        println!("[KEYS] missing decrypt key: {:016X}", missing_key);
        println!("[KEYS] attempting remote key fetch");

        let url = std::env::var("TACT_KEYS_URL")
            .unwrap_or_else(|_| "https://raw.githubusercontent.com/wowdev/TACTKeys/master/WoW.txt".to_string());
        let cache_path = std::env::temp_dir().join("WoW.txt");

        let resp = reqwest::blocking::get(&url).map_err(|e| {
            self.fetch_attempted = true;
            println!("[KEYS] fetch failed: {}", e);
            CascError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
        })?;

        if !resp.status().is_success() {
            self.fetch_attempted = true;
            println!("[KEYS] fetch failed: http {}", resp.status());
            return Ok(false);
        }

        let text = resp.text().map_err(|e| {
            self.fetch_attempted = true;
            CascError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
        })?;

        fs::write(&cache_path, &text).ok();

        self.fetch_attempted = true;
        let added = self.load_wow_txt(&text);
        println!("[KEYS] fetched WoW.txt (entries={})", added);

        // Return true if the missing key is now present, even if it was already counted.
        Ok(self.keys.contains_key(&missing_key))
    }

    fn load_wow_txt(&mut self, text: &str) -> usize {
        let mut added = 0usize;
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let mut parts = line.split_whitespace();
            let key_name_str = parts.next().unwrap_or("");
            let key_hex = parts.next().unwrap_or("");

            let key_name_clean = key_name_str.trim_start_matches("0x").to_ascii_uppercase();
            let key_name = match u64::from_str_radix(&key_name_clean, 16) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let key_hex = key_hex.to_ascii_uppercase();
            if key_hex.len() != 32 {
                continue;
            }
            if let Ok(bytes) = hex::decode(&key_hex) {
                if bytes.len() == 16 {
                    let mut arr = [0u8; 16];
                    arr.copy_from_slice(&bytes);
                    if !self.keys.contains_key(&key_name) {
                        self.keys.insert(key_name, arr);
                        added += 1;
                    }
                }
            }
        }
        added
    }

    fn load_builtin(&mut self) {
        // Minimal set of WoW TACT keys commonly needed; extend if required.
        let builtins: &[(u64, &str)] = &[
            (0xE07E107F1390A3DF, "290D27B0E871F8C5B14A14E514D0F0D9"),
            (0xFA505078126ACB3E, "BDC51862ABED79B2DE48C8E7E66C6200"),
            (0xFF813F7D062AC0BC, "AA0B5C77F088CCC2D39049BD267F066D"),
            (0xD1E9B5EDF9283668, "8E4A2579894E38B4AB9058BA5C7328EE"),
            (0xB76729641141CB34, "9849D1AA7B1FD09819C5C66283A326EC"),
            (0xFFB9469FF16E6BF8, "D514BD1909A9E5DC8703F4B8BB1DFD9A"),
            (0x23C5B5DF837A226C, "1406E2D873B6FC99217A180881DA8D62"),
            (0xE2854509C471C554, "433265F0CDEB2F4E65C0EE7008714D9E"),
            (0x8EE2CB82178C995A, "DA6AFC989ED6CAD279885992C037A8EE"),
            (0x5813810F4EC9B005, "01BE8B43142DD99A9E690FAD288B6082"),
            (0x7F9E217166ED43EA, "05FC927B9F4F5B05568142912A052B0F"),
            (0xC4A8D364D23793F7, "D1AC20FD14957FABC27196E9F6E7024A"),
            (0x40A234AEBCF2C6E5, "C6C5F6C7F735D7D94C87267FA4994D45"),
            (0x9CF7DFCFCBCE4AE5, "72A97A24A998E3A5500F3871F37628C0"),
            (0x4E4BDECAB8485B4F, "3832D7C42AAC9268F00BE7B6B48EC9AF"),
            (0x94A50AC54EFF70E4, "C2501A72654B96F86350C5A927962F7A"),
            (0xBA973B0E01DE1C2C, "D83BBCB46CC438B17A48E76C4F5654A3"),
            (0x494A6F8E8E108BEF, "F0FDE1D29B274F6E7DBDB7FF815FE910"),
            (0x918D6DD0C3849002, "857090D926BB28AEDA4BF028CACC4BA3"),
        ];
        for (name, hexstr) in builtins {
            if let Ok(bytes) = hex::decode(hexstr) {
                if bytes.len() == 16 {
                    let mut arr = [0u8; 16];
                    arr.copy_from_slice(&bytes);
                    self.keys.insert(*name, arr);
                }
            }
        }
    }
}
