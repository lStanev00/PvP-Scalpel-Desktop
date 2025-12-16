use std::collections::HashMap;
use std::fs;
use std::path::Path;

use reqwest::blocking::Client;

use crate::casc_storage::encoding::normalize_ekey;
use crate::casc_storage::types::cc_type::CascConfig;
use crate::casc_storage::types::is_type::{CdnIndexStore, IndexEntry};
use crate::casc_storage::types::et_type::EncodingKey;
use crate::casc_storage::types::CascError;

impl CdnIndexStore {
    pub fn load(data_dir: &Path, config: &CascConfig) -> Result<Self, CascError> {
        let mut entries: HashMap<EncodingKey, IndexEntry> = HashMap::new();
        let client = Client::new();

        for (idx, archive) in config.archives.iter().enumerate() {
            let local_path = data_dir.join("indices").join(format!("{}.index", archive));
            let data = if local_path.exists() {
                fs::read(&local_path).map_err(CascError::Io)?
            } else {
                let host = match config.cdn_hosts.get(0) {
                    Some(h) => h,
                    None => continue,
                };
                let url = make_cdn_path(host, &config.cdn_path, archive, true);
                match client.get(&url).send() {
                    Ok(resp) if resp.status().is_success() => match resp.bytes() {
                        Ok(b) => b.to_vec(),
                        Err(_) => continue,
                    },
                    _ => continue,
                }
            };

            if let Err(_) = parse_index(&data, idx as u32, &mut entries) {
                continue;
            }
        }

        println!("[CDN-INDEX] loaded entries={}", entries.len());
        Ok(CdnIndexStore { entries })
    }
}

fn parse_index(data: &[u8], data_index: u32, map: &mut HashMap<EncodingKey, IndexEntry>) -> Result<(), CascError> {
    if data.len() < 20 {
        return Err(CascError::InvalidConfig);
    }

    let mut r = Reader { data, pos: 0 };

    // footer at end-20
    r.pos = data.len() - 20;
    let version = r.read_u8()?;
    if version != 1 {
        return Err(CascError::InvalidConfig);
    }
    let unk1 = r.read_u8()?;
    let unk2 = r.read_u8()?;
    let block_size_kb = r.read_u8()?;
    if unk1 != 0 || unk2 != 0 || block_size_kb != 4 {
        return Err(CascError::InvalidConfig);
    }
    let offset_bytes = r.read_u8()?;
    if offset_bytes != 0 && offset_bytes != 4 && offset_bytes != 5 && offset_bytes != 6 {
        return Err(CascError::InvalidConfig);
    }
    let size_bytes = r.read_u8()?;
    if size_bytes != 4 {
        return Err(CascError::InvalidConfig);
    }
    let key_size_bytes = r.read_u8()?;
    if key_size_bytes != 16 {
        return Err(CascError::InvalidConfig);
    }
    let hash_size = r.read_u8()?;
    if hash_size != 8 {
        return Err(CascError::InvalidConfig);
    }
    let num_blocks = r.read_i32_be()? as usize;

    r.pos = 0;
    let block_size = (block_size_kb as usize) * 1024;

    for _ in 0..num_blocks {
        let (key, entry) = parse_entry(&mut r, data_index, offset_bytes)?;
        if !map.contains_key(&key) {
            map.insert(key, entry);
        }

        let remaining = block_size - (r.pos % block_size);
        if remaining < (key_size_bytes as usize + size_bytes as usize + offset_bytes as usize) {
            r.skip(remaining)?;
        }
    }

    Ok(())
}

fn parse_entry(r: &mut Reader, data_index: u32, offset_bytes: u8) -> Result<(EncodingKey, IndexEntry), CascError> {
    let key_bytes = r.read_bytes(16)?;
    let mut key_arr = [0u8; 16];
    key_arr.copy_from_slice(key_bytes);
    let key = normalize_ekey(key_arr);

    let size = r.read_u32_be()?;

    let mut archive = data_index;
    let offset;

    match offset_bytes {
        0 => {
            offset = 0;
        }
        4 => {
            offset = r.read_u32_be()?;
        }
        5 => {
            archive = r.read_u8()? as u32;
            offset = r.read_u32_be()?;
        }
        6 => {
            archive = r.read_u16_be()? as u32;
            offset = r.read_u32_be()?;
        }
        _ => return Err(CascError::InvalidConfig),
    }

    Ok((
        key,
        IndexEntry {
            archive,
            offset,
            size,
            key9: [0; 9],
        },
    ))
}

struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn read_u8(&mut self) -> Result<u8, CascError> {
        let b = *self.data.get(self.pos).ok_or(CascError::InvalidConfig)?;
        self.pos += 1;
        Ok(b)
    }

    fn read_u16_be(&mut self) -> Result<u16, CascError> {
        let bytes = self.read_bytes(2)?;
        Ok(u16::from_be_bytes([bytes[0], bytes[1]]))
    }

    fn read_u32_be(&mut self) -> Result<u32, CascError> {
        let bytes = self.read_bytes(4)?;
        Ok(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn read_i32_be(&mut self) -> Result<i32, CascError> {
        self.read_u32_be().map(|v| v as i32)
    }

    fn read_bytes(&mut self, count: usize) -> Result<&'a [u8], CascError> {
        let end = self.pos.checked_add(count).ok_or(CascError::InvalidConfig)?;
        let slice = self.data.get(self.pos..end).ok_or(CascError::InvalidConfig)?;
        self.pos = end;
        Ok(slice)
    }

    fn skip(&mut self, count: usize) -> Result<(), CascError> {
        self.read_bytes(count)?;
        Ok(())
    }
}

fn make_cdn_path(host: &str, cdn_path: &str, name: &str, is_index: bool) -> String {
    let prefix = name.to_ascii_lowercase();
    let folder = if is_index { "data" } else { "data" };
    let suffix = if is_index { ".index" } else { "" };
    format!(
        "https://{}/{}/{}/{}/{}/{}{}",
        host.trim_end_matches('/'),
        cdn_path.trim_start_matches('/'),
        folder,
        &prefix[0..2],
        &prefix[2..4],
        prefix,
        suffix
    )
}
