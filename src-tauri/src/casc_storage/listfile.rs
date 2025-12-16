use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::casc_storage::root::file_data_hash;
use crate::casc_storage::root::RootTable;
use crate::casc_storage::types::CascError;

#[allow(dead_code)]
pub struct Listfile {
    pub by_name: HashMap<String, u32>,
    pub by_file_id: HashMap<u32, String>,
}

impl Listfile {
    pub fn load(path: &Path, root: &RootTable) -> Result<Self, CascError> {
        println!("[LISTFILE] loading listfile.csv");
        let data = fs::read_to_string(path).map_err(CascError::Io)?;

        let mut by_name = HashMap::new();
        let mut by_file_id = HashMap::new();

        let mut total = 0usize;
        let mut matched = 0usize;
        let mut unmatched = 0usize;

        for line in data.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let (fid_str_raw, name_str) = match trimmed.split_once(',').or_else(|| trimmed.split_once(';')) {
                Some(parts) => parts,
                None => continue,
            };

            let fid_str = fid_str_raw.trim_start_matches('\u{feff}');
            let file_id: u32 = match fid_str.parse() {
                Ok(v) => v,
                Err(_) => {
                    continue;
                }
            };

            let norm_name = normalize_name(name_str);
            total += 1;

            // compute hash to mirror CASC behavior (not stored, but keep parity)
            let _name_hash = name_hash(&norm_name);
            let _fid_hash = file_data_hash(file_id as i32);

            if root.by_file_id.contains_key(&file_id) {
                matched += 1;
                by_name.insert(norm_name.clone(), file_id);
                by_file_id.insert(file_id, norm_name);
            } else {
                unmatched += 1;
            }
        }

        println!("[LISTFILE] entries read: {}", total);
        println!("[LISTFILE] matched to root: {}", matched);
        println!("[LISTFILE] unmatched entries: {}", unmatched);

        Ok(Listfile { by_name, by_file_id })
    }
}

fn normalize_name(name: &str) -> String {
    name.trim()
        .replace('\\', "/")
        .to_ascii_lowercase()
}

fn name_hash(name: &str) -> u64 {
    // Jenkins/FNV style hash used in CASCExplorer for names (Jenkins96).
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in name.as_bytes() {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}
