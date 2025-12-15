pub struct IndexStore {
    pub local: Vec<LocalIndex>,
}

pub struct LocalIndex {
    pub archive: String,   // data.000, data.001, etc
    pub entries: Vec<IndexEntry>,
}

pub struct IndexEntry {
    pub encoding_key: EncodingKey,
    pub offset: u64,
    pub size: u32,
}
