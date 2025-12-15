pub struct IndexStore {
    pub local: Vec<LocalIndex>,
}

pub struct LocalIndex {
    pub archive: String,   // data.000, data.001, etc
    pub entries: Vec<IndexEntry>,
}

use crate::casc_storage::types::et_type::EncodingKey;
pub struct IndexEntry {
    pub encoding_key: EncodingKey,
    pub offset: u64,
    pub size: u32,
}
