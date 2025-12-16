#![allow(dead_code)]

use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CompressionType {
    None = 0,
    Immediate = 1,
    Common = 2,
    Pallet = 3,
    PalletArray = 4,
    SignedImmediate = 5,
}

impl From<u32> for CompressionType {
    fn from(v: u32) -> Self {
        match v {
            0 => CompressionType::None,
            1 => CompressionType::Immediate,
            2 => CompressionType::Common,
            3 => CompressionType::Pallet,
            4 => CompressionType::PalletArray,
            5 => CompressionType::SignedImmediate,
            _ => CompressionType::None,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct FieldMetaData {
    pub bits: i16,
    pub offset: i16,
}

#[derive(Debug, Clone, Copy)]
pub struct ColumnMetaData {
    pub record_offset: u16,      // bit offset within record
    pub size: u16,
    pub additional_data_size: u32,
    pub compression: CompressionType,
    pub val1: u32,
    pub val2: u32,
    pub val3: u32,
}

#[derive(Debug, Clone, Copy)]
pub struct SparseEntry {
    pub offset: i32,
    pub size: u16,
}

#[derive(Debug, Clone)]
pub struct Wdc5Section {
    pub num_records: i32,
    pub string_table_size: i32,
    pub record_size: i32,
    pub is_sparse: bool,
    pub records_data: Vec<u8>,
    pub string_table: HashMap<u32, String>,
    pub index_data: Vec<i32>,
    pub copy_data: HashMap<i32, i32>,
    pub sparse_entries: Vec<SparseEntry>,
}

#[derive(Debug, Clone)]
pub struct Wdc5Meta {
    pub records_count: i32,
    pub fields_count: i32,
    pub record_size: i32,
    pub id_field_index: u16,
    pub field_meta: Vec<FieldMetaData>,
    pub column_meta: Vec<ColumnMetaData>,
    pub pallet_data: Vec<Vec<Value32>>,
    pub common_data: Vec<HashMap<i32, Value32>>,
    pub sections: Vec<Wdc5Section>,
    pub table_hash: u32,
    pub layout_hash: u32,
}

#[derive(Debug, Clone, Copy)]
pub struct Value32(pub u32);

impl Value32 {
    pub fn as_u32(self) -> u32 {
        self.0
    }
    pub fn as_i32(self) -> i32 {
        self.0 as i32
    }
    pub fn as_f32(self) -> f32 {
        f32::from_bits(self.0)
    }
}
