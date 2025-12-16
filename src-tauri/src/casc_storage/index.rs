use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::casc_storage::types::is_type::{IndexEntry, IndexStore};
use crate::casc_storage::types::CascError;
use crate::casc_storage::types::et_type::EncodingKey;

impl IndexStore {
    pub fn load(indices_dir: &Path) -> Result<Self, CascError> {
        if !indices_dir.exists() {
            return Err(CascError::FileNotFound);
        }

        let idx_files = collect_idx_files(indices_dir)?;
        if idx_files.is_empty() {
            return Err(CascError::FileNotFound);
        }

        let mut entries: HashMap<EncodingKey, IndexEntry> = HashMap::new();

        for path in idx_files {
            let data = fs::read(&path).map_err(CascError::Io)?;
            parse_idx_file(&data, &mut entries)?;
        }

        Ok(IndexStore { entries })
    }
}

fn collect_idx_files(indices_dir: &Path) -> Result<Vec<std::path::PathBuf>, CascError> {
    let mut selected = Vec::new();

    for i in 0..0x10 {
        let prefix = format!("{:02x}", i);
        let mut matches: Vec<_> = fs::read_dir(indices_dir)
            .map_err(CascError::Io)?
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
            .filter(|e| {
                e.file_name()
                    .to_str()
                    .map(|s| s.to_ascii_lowercase().starts_with(&prefix))
                    .unwrap_or(false)
            })
            .map(|e| e.path())
            .collect();

        matches.sort();

        if let Some(last) = matches.pop() {
            selected.push(last);
        }
    }

    Ok(selected)
}

fn parse_idx_file(data: &[u8], map: &mut HashMap<EncodingKey, IndexEntry>) -> Result<(), CascError> {
    let mut r = Reader { data, pos: 0 };

    let header_hash_size = r.read_u32_le()?;
    let _header_hash = r.read_u32_le()?;
    r.read_bytes(header_hash_size as usize)?;

    let pad_pos = (8 + header_hash_size as usize + 0x0F) & 0xFFFF_FFF0;
    r.seek(pad_pos)?;

    let entries_size = r.read_u32_le()? as usize;
    let _entries_hash = r.read_u32_le()?;

    let num_blocks = entries_size / 18;

    for _ in 0..num_blocks {
        let key_bytes = r.read_bytes(9)?;
        let mut full = [0u8; 16];
        full[..9].copy_from_slice(key_bytes);
        let key = EncodingKey(full);

        let index_high = r.read_u8()? as u32;
        let index_low = r.read_u32_be()?;

        let archive = (index_high << 2) | ((index_low & 0xC000_0000) >> 30);
        let offset = index_low & 0x3FFF_FFFF;
        let size = r.read_u32_le()?;

        if !map.contains_key(&key) {
            map.insert(
                key,
                IndexEntry {
                    archive,
                    offset,
                    size,
                    key9: {
                        let mut k = [0u8; 9];
                        k.copy_from_slice(key_bytes);
                        k
                    },
                },
            );
        }
    }

    let pad_pos = (entries_size + 0x0FFF) & 0xFFFF_F000;
    r.seek(pad_pos)?;

    Ok(())
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

    fn read_u32_le(&mut self) -> Result<u32, CascError> {
        let bytes = self.read_bytes(4)?;
        Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn read_u32_be(&mut self) -> Result<u32, CascError> {
        let bytes = self.read_bytes(4)?;
        Ok(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn read_bytes(&mut self, count: usize) -> Result<&'a [u8], CascError> {
        let end = self.pos.checked_add(count).ok_or(CascError::InvalidConfig)?;
        let slice = self
            .data
            .get(self.pos..end)
            .ok_or(CascError::InvalidConfig)?;
        self.pos = end;
        Ok(slice)
    }

    fn seek(&mut self, pos: usize) -> Result<(), CascError> {
        if pos > self.data.len() {
            return Err(CascError::InvalidConfig);
        }
        self.pos = pos;
        Ok(())
    }
}
