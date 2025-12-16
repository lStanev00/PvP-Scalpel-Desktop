use std::collections::HashMap;
use crate::casc_storage::types::et_type::EncodingKey;

pub struct IndexStore {
    pub entries: HashMap<EncodingKey, IndexEntry>,
}

pub struct IndexEntry {
    pub archive: u32,
    pub offset: u32,
    pub size: u32,
    pub key9: [u8; 9],
}

pub struct CdnIndexStore {
    pub entries: HashMap<EncodingKey, IndexEntry>,
}
