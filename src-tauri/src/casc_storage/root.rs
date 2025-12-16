use std::collections::HashMap;
use std::path::Path;

use crate::casc_storage::blte::read_blte;
use crate::casc_storage::encoding::normalize_ekey;
use crate::casc_storage::types::et_type::{ContentKey, EncodingTable};
use crate::casc_storage::types::is_type::IndexStore;
use crate::casc_storage::types::CascError;
use crate::casc_storage::keys::KeyService;

pub struct RootTable {
    pub by_file_id: HashMap<u32, ContentKey>,
}

pub const MFST_MAGIC: u32 = 0x4D46_5354;

const CONTENTFLAGS_HIGHRES: u32 = 0x1;
const CONTENTFLAGS_WINDOWS: u32 = 0x8;
const CONTENTFLAGS_MACOS: u32 = 0x10;
const CONTENTFLAGS_ALTERNATE: u32 = 0x80;
const CONTENTFLAGS_F00020000: u32 = 0x20000;
const CONTENTFLAGS_F00080000: u32 = 0x80000;
const CONTENTFLAGS_F00100000: u32 = 0x100000;
const CONTENTFLAGS_F00200000: u32 = 0x200000;
const CONTENTFLAGS_F00400000: u32 = 0x400000;
const CONTENTFLAGS_F02000000: u32 = 0x2000000;
const CONTENTFLAGS_NOTCOMPRESSED: u32 = 0x8000_0000;
const CONTENTFLAGS_NONAMEHASH: u32 = 0x1000_0000;
const CONTENTFLAGS_F20000000: u32 = 0x2000_0000;

const CONTENTFLAGS_ALLOWED_MASK: u32 = CONTENTFLAGS_HIGHRES
    | CONTENTFLAGS_WINDOWS
    | CONTENTFLAGS_MACOS
    | CONTENTFLAGS_ALTERNATE
    | CONTENTFLAGS_F00020000
    | CONTENTFLAGS_F00080000
    | CONTENTFLAGS_F00100000
    | CONTENTFLAGS_F00200000
    | CONTENTFLAGS_F00400000
    | CONTENTFLAGS_F02000000
    | CONTENTFLAGS_NOTCOMPRESSED
    | CONTENTFLAGS_NONAMEHASH
    | CONTENTFLAGS_F20000000;

impl RootTable {
    pub fn load_from_index(
        data_dir: &Path,
        indices: &IndexStore,
        encoding: &EncodingTable,
        root_ckey: [u8; 16],
        keys: &KeyService,
    ) -> Result<Self, CascError> {
        let ckey = ContentKey(root_ckey);
        let enc_entry = encoding
            .entries
            .get(&ckey)
            .ok_or(CascError::MissingEncoding)?;
        let ekey = enc_entry
            .encoding_keys
            .get(0)
            .ok_or(CascError::MissingEncoding)?
            .0;

        let norm = normalize_ekey(ekey);
        let idx_entry = indices
            .entries
            .get(&norm)
            .ok_or(CascError::MissingEncoding)?;

        let decoded = read_blte(data_dir, idx_entry, ekey, keys)?;
        let table = parse_root(&decoded)?;

        Ok(table)
    }
}

fn parse_root(data: &[u8]) -> Result<RootTable, CascError> {
    let mut r = Reader { data, pos: 0 };
    if data.len() < 4 {
        return Err(CascError::InvalidConfig);
    }

    let magic = r.read_u32_le()?;
    let is_new_manifest = magic == MFST_MAGIC;

    let mut header_size;
    let mut version = 0i32;

    if is_new_manifest {
        if data.len() < 12 {
            return Err(CascError::InvalidConfig);
        }

        header_size = r.read_i32_le()?;
        version = r.read_i32_le()?;

        if header_size != 0x18 {
            version = 0;
        } else if version != 1 && version != 2 {
            return Err(CascError::InvalidConfig);
        }

        if version == 0 {
            let _ = header_size;
            let _ = version;
            header_size = 12;
        } else {
            let _ = r.read_i32_le()?;
            let _ = r.read_i32_le()?;
        }
    } else {
        header_size = 0;
    }

    if data.len() < header_size as usize {
        return Err(CascError::InvalidConfig);
    }

    r.seek(header_size as usize)?;

    let mut by_file_id = HashMap::new();

    while r.pos < data.len() {
        let mut count = 0i32;
        let mut content_flags = 0u32;
        let mut locale_flags = 0u32;

        if version == 0 || version == 1 {
            count = r.read_i32_le()?;
            content_flags = r.read_u32_le()?;
            locale_flags = r.read_u32_le()?;
        } else if version == 2 {
            count = r.read_i32_le()?;
            locale_flags = r.read_u32_le()?;
            let cf1 = r.read_u32_le()?;
            let cf2 = r.read_u32_le()?;
            let cf3 = r.read_u8()? as u32;
            content_flags = cf1 | cf2 | (cf3 << 17);
        }

        if locale_flags == 0 {
            return Err(CascError::InvalidConfig);
        }

        if content_flags != 0 && (content_flags & CONTENTFLAGS_ALLOWED_MASK) == 0 {
            return Err(CascError::InvalidConfig);
        }

        let mut filedata_ids = Vec::with_capacity(count as usize);
        let mut file_data_index = 0i32;
        for _ in 0..count {
            let v = r.read_i32_le()?;
            let file_data_id = file_data_index + v;
            file_data_index = file_data_id + 1;
            filedata_ids.push(file_data_id as u32);
        }

        let mut ckeys = Vec::with_capacity(count as usize);
        let mut name_hashes: Option<Vec<u64>> = None;

        if is_new_manifest {
            for _ in 0..count {
                let md5 = r.read_md5()?;
                ckeys.push(ContentKey(md5));
            }

            if (content_flags & CONTENTFLAGS_NONAMEHASH) == 0 {
                let mut hashes = Vec::with_capacity(count as usize);
                for _ in 0..count {
                    hashes.push(r.read_u64_le()?);
                }
                name_hashes = Some(hashes);
            }
        } else {
            let mut hashes = Vec::with_capacity(count as usize);
            for _ in 0..count {
                let md5 = r.read_md5()?;
                ckeys.push(ContentKey(md5));
                hashes.push(r.read_u64_le()?);
            }
            name_hashes = Some(hashes);
        }

        for i in 0..count as usize {
            let file_id = filedata_ids[i];
            let _hash = if let Some(ref nh) = name_hashes {
                nh[i]
            } else {
                file_data_hash(file_id as i32)
            };

            if !by_file_id.contains_key(&file_id) {
                by_file_id.insert(file_id, ckeys[i]);
            }
        }
    }

    Ok(RootTable { by_file_id })
}

pub fn file_data_hash(file_data_id: i32) -> u64 {
    let mut base_offset: u64 = 0xCBF29CE484222325;
    for i in 0..4 {
        let byte = ((file_data_id as u32) >> (8 * i)) & 0xFF;
        base_offset = 0x100000001B3u64
            .wrapping_mul((byte as u64) ^ base_offset);
    }
    base_offset
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

    fn read_i32_le(&mut self) -> Result<i32, CascError> {
        self.read_u32_le().map(|v| v as i32)
    }

    fn read_u64_le(&mut self) -> Result<u64, CascError> {
        let bytes = self.read_bytes(8)?;
        Ok(u64::from_le_bytes([
            bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        ]))
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

    fn seek(&mut self, pos: usize) -> Result<(), CascError> {
        if pos > self.data.len() {
            return Err(CascError::InvalidConfig);
        }
        self.pos = pos;
        Ok(())
    }
}
