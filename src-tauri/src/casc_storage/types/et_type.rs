pub struct EncodingTable {
    pub entries: std::collections::HashMap<
        ContentKey,
        EncodingEntry
    >,
}

pub struct EncodingEntry {
    pub encoding_keys: Vec<EncodingKey>,
    pub size: u64,
}

#[derive(Clone, Copy, Hash, Eq, PartialEq)]
pub struct ContentKey(pub [u8; 16]);

#[derive(Clone, Copy, Hash, Eq, PartialEq)]
pub struct EncodingKey(pub [u8; 16]);
