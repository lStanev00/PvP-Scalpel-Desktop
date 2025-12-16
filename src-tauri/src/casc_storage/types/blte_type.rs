#![allow(dead_code)]

pub struct BlteFile {
    pub header: BlteHeader,
    pub chunks: Vec<BlteChunk>,
}

pub struct BlteHeader {
    pub magic: [u8; 4],  // "BLTE"
    pub header_size: u32,
}

pub struct BlteChunk {
    pub compressed_size: u32,
    pub decompressed_size: u32,
    pub flags: u8,
    pub checksum: [u8; 16],
    pub data: Vec<u8>,
}
