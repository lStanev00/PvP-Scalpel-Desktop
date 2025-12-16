#![allow(dead_code)]

#[derive(Debug, Clone)]
pub struct DbdTable {
    pub name: String,
    pub fields: Vec<DbdField>,
}

#[derive(Debug, Clone)]
pub struct DbdField {
    pub name: String,
    pub ty: DbdType,
    pub array_len: usize,
}

#[derive(Debug, Clone)]
pub enum DbdType {
    Int,
    UInt,
    Short,
    UShort,
    Byte,
    UByte,
    Long,
    ULong,
    Float,
    String,
    LocString,
}

impl DbdType {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "int" => Some(DbdType::Int),
            "uint" => Some(DbdType::UInt),
            "short" => Some(DbdType::Short),
            "ushort" => Some(DbdType::UShort),
            "byte" => Some(DbdType::Byte),
            "ubyte" => Some(DbdType::UByte),
            "long" => Some(DbdType::Long),
            "ulong" => Some(DbdType::ULong),
            "float" => Some(DbdType::Float),
            "string" => Some(DbdType::String),
            "locstring" => Some(DbdType::LocString),
            _ => None,
        }
    }
}
