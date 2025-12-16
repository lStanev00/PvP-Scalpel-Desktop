use std::collections::HashMap;

#[allow(dead_code)]
pub struct EncodingTable {
    pub entries: HashMap<ContentKey, EncodingEntry>,
    pub ekey_to_ckey: HashMap<EncodingKey, ContentKey>,
    pub encryption: HashMap<EncodingKey, Vec<u64>>,
}

#[allow(dead_code)]
pub struct EncodingEntry {
    pub encoding_keys: Vec<EncodingKey>,
    pub size: u64,
}

#[derive(Clone, Copy, Hash, Eq, PartialEq)]
pub struct ContentKey(pub [u8; 16]);

#[derive(Clone, Copy, Hash, Eq, PartialEq)]
pub struct EncodingKey(pub [u8; 16]);
