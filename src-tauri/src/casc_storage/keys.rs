use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::casc_storage::types::CascError;
use crate::logger;

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
            logger::debug("KEYS", format!("load_from_file: missing path={}", path.display()));
            return Ok(());
        }
        let data = fs::read_to_string(path).map_err(CascError::Io)?;
        let mut added = 0usize;
        for line in data.lines() {
            if let Some((name, arr)) = parse_key_line(line) {
                if !self.keys.contains_key(&name) {
                    self.keys.insert(name, arr);
                    added += 1;
                }
            }
        }
        logger::info(
            "KEYS",
            format!(
                "load_from_file: added={} total={} path={}",
                added,
                self.keys.len(),
                path.display()
            ),
        );
        Ok(())
    }

    pub fn get(&self, name: u64) -> Option<[u8; 16]> {
        self.keys.get(&name).copied()
    }

    pub fn insert_key(&mut self, name: u64, key: [u8; 16]) -> bool {
        match self.keys.get(&name) {
            None => {
                self.keys.insert(name, key);
                true
            }
            Some(existing) if *existing == key => false,
            Some(existing) => {
                logger::warn(
                    "KEYS",
                    format!(
                        "duplicate key name {:016X} with different key (old={} new={})",
                        name,
                        hex::encode_upper(existing),
                        hex::encode_upper(key)
                    ),
                );
                self.keys.insert(name, key);
                true
            }
        }
    }

    pub fn fetch_remote_if_needed(&mut self, missing_key: u64) -> Result<bool, CascError> {
        // If the key is already present, nothing to do.
        if self.keys.contains_key(&missing_key) {
            return Ok(true);
        }

        // Local-only lookup. Try temp WoW.txt and debug_inputs WoW.txt if present.
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

        self.fetch_attempted = true;
        if !tried_local {
            logger::warn("KEYS", format!("missing decrypt key: {:016X}", missing_key));
            logger::warn("KEYS", "no local WoW.txt/TactKey.csv found");
        }

        // Return true if the missing key is now present, even if it was already counted.
        Ok(self.keys.contains_key(&missing_key))
    }

    fn load_builtin(&mut self) {
        // Minimal set of WoW TACT keys commonly needed; extend if required.
        let builtins: &[(u64, &str)] = &[
            // Needed to decrypt DBFilesClient/TactKeyLookup.db2 (CASCExplorer KeyService.cs)
            (0x2915DA21ADE22EA8, "3D4B4C0FE8411CDD8E14FD2D5E43BD0B"),
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
        logger::info("KEYS", format!("builtin keys loaded: {}", self.keys.len()));
    }
}

fn parse_key_line(line: &str) -> Option<(u64, [u8; 16])> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }

    let mut parts = if line.contains(';') {
        line.split(';').collect::<Vec<_>>()
    } else {
        line.split_whitespace().collect::<Vec<_>>()
    };

    if parts.len() < 2 {
        return None;
    }

    let key_name_str = parts.remove(0).trim().trim_start_matches("0x");
    let key_hex = parts.remove(0).trim();

    if key_hex.len() != 32 {
        return None;
    }

    let key_name = u64::from_str_radix(&key_name_str.to_ascii_uppercase(), 16).ok()?;
    let bytes = hex::decode(key_hex).ok()?;
    if bytes.len() != 16 {
        return None;
    }

    let mut arr = [0u8; 16];
    arr.copy_from_slice(&bytes);
    Some((key_name, arr))
}
