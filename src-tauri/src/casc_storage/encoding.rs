use std::path::Path;

use crate::casc_storage::types::{
    CascError, ContentKey, EncodingEntry, EncodingKey, EncodingTable,
};

const CHUNK_SIZE: usize = 4096;

impl EncodingTable {
    pub fn load(data_dir: &Path, encoding_hash: [u8; 16]) -> Result<Self, CascError> {
        let encoding_path = data_dir.join("data").join(hex::encode(encoding_hash));

        let data = match std::fs::read(&encoding_path) {
            Ok(bytes) => bytes,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                return Err(CascError::MissingEncoding)
            }
            Err(err) => return Err(CascError::Io(err)),
        };

        let mut reader = Reader::new(&data);

        reader.skip(2)?; // "EN"
        let _version = reader.read_u8()?;
        let _ckey_len = reader.read_u8()?;
        let _ekey_len = reader.read_u8()?;
        let _ckey_page_size = reader.read_u16_be()? as usize * 1024;
        let _ekey_page_size = reader.read_u16_be()? as usize * 1024;
        let ckey_page_count = reader.read_u32_be()? as usize;
        let ekey_page_count = reader.read_u32_be()? as usize;
        let _unk1 = reader.read_u8()?;
        let espec_block_size = reader.read_u32_be()? as usize;

        let espec_raw = reader.read_bytes(espec_block_size)?;
        let espec_strings = String::from_utf8_lossy(espec_raw);
        let espec: Vec<String> = espec_strings.split('\0').map(|s| s.to_string()).collect();

        reader.skip(ckey_page_count * 32)?;

        let mut entries = std::collections::HashMap::new();
        let mut ekey_to_ckey = std::collections::HashMap::new();
        let mut encryption = std::collections::HashMap::new();

        let mut chunk_start = reader.pos;
        let mut i = 0;
        while i < ckey_page_count {
            loop {
                let keys_count = reader.read_u8()?;
                if keys_count == 0 {
                    break;
                }

                let file_size = reader.read_u40_be()?;
                let c_key = ContentKey(reader.read_md5()?);

                let mut entry = EncodingEntry {
                    size: file_size,
                    encoding_keys: Vec::with_capacity(keys_count as usize),
                };

                for _ in 0..keys_count {
                    let e_key = EncodingKey(reader.read_md5()?);
                    entry.encoding_keys.push(e_key);
                    ekey_to_ckey.insert(e_key, c_key);
                }

                entries.insert(c_key, entry);
            }

            let remaining = CHUNK_SIZE - ((reader.pos - chunk_start) % CHUNK_SIZE);

            if remaining == 0xFFF {
                reader.pos = reader.pos.saturating_sub(1);
                i += 1;
                continue;
            }

            if remaining > 0 {
                reader.skip(remaining)?;
            }

            i += 1;
        }

        reader.skip(ekey_page_count * 32)?;

        let chunk_start2 = reader.pos;

        let mut i = 0;
        while i < ekey_page_count {
            loop {
                let remaining = CHUNK_SIZE - ((reader.pos - chunk_start2) % CHUNK_SIZE);

                if remaining < 25 {
                    reader.skip(remaining)?;
                    break;
                }

                let e_key = EncodingKey(reader.read_md5()?);
                let espec_index = reader.read_i32_be()?;
                let _file_size = reader.read_u40_be()?;

                if espec_index == -1 {
                    reader.skip(remaining)?;
                    break;
                }

                let espec_str = espec
                    .get(espec_index as usize)
                    .ok_or(CascError::InvalidConfig)?;

                let key_names = parse_encryption_keys(espec_str);
                if !key_names.is_empty() {
                    encryption.insert(e_key, key_names);
                }
            }

            i += 1;
        }

        Ok(EncodingTable {
            entries,
            ekey_to_ckey,
            encryption,
        })
    }
}

fn parse_encryption_keys(espec: &str) -> Vec<u64> {
    let mut results = Vec::new();
    let mut search_start = 0usize;

    while let Some(pos) = espec[search_start..].find("e:{") {
        let start = search_start + pos + 3;
        if start >= espec.len() {
            break;
        }
        let after_start = &espec[start..];
        if let Some(comma_idx) = after_start.find(',') {
            let candidate = &after_start[..comma_idx];
            if candidate.len() == 16 && candidate.chars().all(|c| c.is_ascii_hexdigit()) {
                if let Ok(bytes) = hex::decode(candidate) {
                    if bytes.len() == 8 {
                        let mut buf = [0u8; 8];
                        buf.copy_from_slice(&bytes);
                        results.push(u64::from_le_bytes(buf));
                    }
                }
            }
            search_start = start + comma_idx;
        } else {
            break;
        }
    }

    results
}

struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn new(data: &'a [u8]) -> Self {
        Reader { data, pos: 0 }
    }

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

    fn read_u40_be(&mut self) -> Result<u64, CascError> {
        let bytes = self.read_bytes(5)?;
        Ok(((bytes[0] as u64) << 32)
            | ((bytes[1] as u64) << 24)
            | ((bytes[2] as u64) << 16)
            | ((bytes[3] as u64) << 8)
            | (bytes[4] as u64))
    }

    fn read_md5(&mut self) -> Result<[u8; 16], CascError> {
        let bytes = self.read_bytes(16)?;
        let mut out = [0u8; 16];
        out.copy_from_slice(bytes);
        Ok(out)
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

    fn skip(&mut self, count: usize) -> Result<(), CascError> {
        self.read_bytes(count)?;
        Ok(())
    }
}
