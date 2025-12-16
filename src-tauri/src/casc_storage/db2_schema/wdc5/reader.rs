#![allow(dead_code)]

use std::collections::HashMap;
use std::io::Cursor;
use std::io::Read;

use crate::casc_storage::types::CascError;

use super::types::{
    ColumnMetaData, CompressionType, FieldMetaData, SparseEntry, Value32, Wdc5Meta, Wdc5Section,
};

pub fn parse_wdc5(data: &[u8]) -> Result<Wdc5Meta, CascError> {
    let mut cur = Cursor::new(data);

    if data.len() < 72 {
        return Err(CascError::InvalidConfig);
    }

    let _magic = read_u32(&mut cur)?;
    let records_count = read_i32(&mut cur)?;
    let fields_count = read_i32(&mut cur)?;
    let record_size = read_i32(&mut cur)?;
    let _string_table_size = read_i32(&mut cur)?;
    let table_hash = read_u32(&mut cur)?;
    let layout_hash = read_u32(&mut cur)?;
    let _min_index = read_i32(&mut cur)?;
    let _max_index = read_i32(&mut cur)?;
    let _locale = read_i32(&mut cur)?;
    let flags = read_u16(&mut cur)?;
    let id_field_index = read_u16(&mut cur)?;
    let total_fields_count = read_i32(&mut cur)?;
    let _packed_data_offset = read_i32(&mut cur)?;
    let _lookup_column_count = read_i32(&mut cur)?;
    let _column_meta_data_size = read_i32(&mut cur)?;
    let _common_data_size = read_i32(&mut cur)?;
    let _pallet_data_size = read_i32(&mut cur)?;
    let sections_count = read_i32(&mut cur)?;

    // sections
    let mut sections_raw = Vec::with_capacity(sections_count as usize);
    for _ in 0..sections_count {
        let tact = read_u64(&mut cur)?;
        let file_offset = read_i32(&mut cur)?;
        let num_records = read_i32(&mut cur)?;
        let str_table_size = read_i32(&mut cur)?;
        let sparse_data_end = read_i32(&mut cur)?;
        let index_data_size = read_i32(&mut cur)?;
        let parent_lookup_data_size = read_i32(&mut cur)?;
        let num_sparse_records = read_i32(&mut cur)?;
        let num_copy_records = read_i32(&mut cur)?;
        sections_raw.push(SectionRaw {
            tact_key_lookup: tact,
            file_offset,
            num_records,
            string_table_size: str_table_size,
            sparse_data_end_offset: sparse_data_end,
            index_data_size,
            parent_lookup_data_size,
            num_sparse_records,
            num_copy_records,
        });
    }

    // field meta
    let mut field_meta = Vec::with_capacity(fields_count as usize);
    for _ in 0..fields_count {
        let bits = read_i16(&mut cur)?;
        let offset = read_i16(&mut cur)?;
        field_meta.push(FieldMetaData { bits, offset });
    }

    if fields_count > total_fields_count {
        return Err(CascError::InvalidConfig);
    }

    // column meta
    let mut column_meta = Vec::with_capacity(fields_count as usize);
    for _ in 0..fields_count {
        let record_offset = read_u16(&mut cur)?;
        let size = read_u16(&mut cur)?;
        let additional_data_size = read_u32(&mut cur)?;
        let compression = CompressionType::from(read_u32(&mut cur)?);
        let val1 = read_u32(&mut cur)?;
        let val2 = read_u32(&mut cur)?;
        let val3 = read_u32(&mut cur)?;
        column_meta.push(ColumnMetaData {
            record_offset,
            size,
            additional_data_size,
            compression,
            val1,
            val2,
            val3,
        });
    }

    // pallet data
    let mut pallet_data: Vec<Vec<Value32>> = Vec::with_capacity(fields_count as usize);
    for cm in &column_meta {
        match cm.compression {
            CompressionType::Pallet | CompressionType::PalletArray => {
                let count = (cm.additional_data_size / 4) as usize;
                let mut vals = Vec::with_capacity(count);
                for _ in 0..count {
                    vals.push(Value32(read_u32(&mut cur)?));
                }
                pallet_data.push(vals);
            }
            _ => pallet_data.push(Vec::new()),
        }
    }

    // common data
    let mut common_data: Vec<HashMap<i32, Value32>> = Vec::with_capacity(fields_count as usize);
    for cm in &column_meta {
        if cm.compression == CompressionType::Common {
            let mut map = HashMap::new();
            let entries = (cm.additional_data_size / 8) as usize;
            for _ in 0..entries {
                let key = read_i32(&mut cur)?;
                let val = Value32(read_u32(&mut cur)?);
                map.insert(key, val);
            }
            common_data.push(map);
        } else {
            common_data.push(HashMap::new());
        }
    }

    // sections data
    let mut sections = Vec::with_capacity(sections_raw.len());
    let mut previous_string_table_size = 0;
    let mut _previous_record_count = 0;

    for (idx, sec) in sections_raw.iter().enumerate() {
        if sec.tact_key_lookup != 0 {
            println!("[WDC5] section {} is encrypted (tact key present); skipping", idx);
            continue;
        }

        if (sec.file_offset as usize) > data.len() {
            return Err(CascError::InvalidConfig);
        }

        let mut cursor = Cursor::new(&data[sec.file_offset as usize..]);
        let is_sparse = (flags & 0x1) != 0 || sec.num_sparse_records > 0;

        let records_data;
        let mut string_table = HashMap::new();
        let mut sparse_entries = Vec::new();

        if is_sparse {
            let size = (sec.sparse_data_end_offset - sec.file_offset) as usize;
            records_data = read_bytes(&mut cursor, size)?;
            // sparse entries
            for _ in 0..sec.num_sparse_records {
                let offset = read_i32(&mut cursor)?;
                let sz = read_u16(&mut cursor)?;
                let _pad = read_u16(&mut cursor).ok(); // ignore padding if present
                sparse_entries.push(SparseEntry { offset, size: sz });
            }
        } else {
            let size = (sec.num_records as i32 * record_size) as usize;
            records_data = read_bytes(&mut cursor, size)?;
            // string table
            let mut read_bytes_total = 0usize;
            while read_bytes_total < sec.string_table_size as usize {
                let start_pos = cursor.position() as usize;
                let s = read_cstring(&mut cursor)?;
                let end_pos = cursor.position() as usize;
                let consumed = end_pos - start_pos;
                string_table.insert(
                    (read_bytes_total + previous_string_table_size) as u32,
                    s,
                );
                read_bytes_total += consumed;
            }
        }

        // index data
        let mut index_data = Vec::new();
        if sec.index_data_size > 0 {
            let count = (sec.index_data_size / 4) as usize;
            for _ in 0..count {
                index_data.push(read_i32(&mut cursor)?);
            }
        }

        // copy data
        let mut copy_data = HashMap::new();
        for _ in 0..sec.num_copy_records {
            let dst = read_i32(&mut cursor)?;
            let src = read_i32(&mut cursor)?;
            copy_data.insert(dst, src);
        }

        sections.push(Wdc5Section {
            num_records: sec.num_records,
            string_table_size: sec.string_table_size,
            record_size,
            is_sparse,
            records_data,
            string_table,
            index_data,
            copy_data,
            sparse_entries,
        });

        previous_string_table_size += sec.string_table_size as usize;
        _previous_record_count += sec.num_records as usize;
    }

    Ok(Wdc5Meta {
        records_count,
        fields_count,
        record_size,
        id_field_index,
        field_meta,
        column_meta,
        pallet_data,
        common_data,
        sections,
        table_hash,
        layout_hash,
    })
}

struct SectionRaw {
    tact_key_lookup: u64,
    file_offset: i32,
    num_records: i32,
    string_table_size: i32,
    sparse_data_end_offset: i32,
    index_data_size: i32,
    parent_lookup_data_size: i32,
    num_sparse_records: i32,
    num_copy_records: i32,
}

fn read_u16(cur: &mut Cursor<&[u8]>) -> Result<u16, CascError> {
    let mut buf = [0u8; 2];
    cur.read_exact(&mut buf).map_err(CascError::Io)?;
    Ok(u16::from_le_bytes(buf))
}

fn read_i16(cur: &mut Cursor<&[u8]>) -> Result<i16, CascError> {
    Ok(read_u16(cur)? as i16)
}

fn read_u32(cur: &mut Cursor<&[u8]>) -> Result<u32, CascError> {
    let mut buf = [0u8; 4];
    cur.read_exact(&mut buf).map_err(CascError::Io)?;
    Ok(u32::from_le_bytes(buf))
}

fn read_i32(cur: &mut Cursor<&[u8]>) -> Result<i32, CascError> {
    Ok(read_u32(cur)? as i32)
}

fn read_u64(cur: &mut Cursor<&[u8]>) -> Result<u64, CascError> {
    let mut buf = [0u8; 8];
    cur.read_exact(&mut buf).map_err(CascError::Io)?;
    Ok(u64::from_le_bytes(buf))
}

fn read_bytes(cur: &mut Cursor<&[u8]>, len: usize) -> Result<Vec<u8>, CascError> {
    let mut buf = vec![0u8; len];
    cur.read_exact(&mut buf).map_err(CascError::Io)?;
    Ok(buf)
}

fn read_cstring(cur: &mut Cursor<&[u8]>) -> Result<String, CascError> {
    let mut bytes = Vec::new();
    loop {
        let mut b = [0u8; 1];
        cur.read_exact(&mut b).map_err(CascError::Io)?;
        if b[0] == 0 {
            break;
        }
        bytes.push(b[0]);
    }
    Ok(String::from_utf8_lossy(&bytes).to_string())
}
