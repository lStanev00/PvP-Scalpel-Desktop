#![allow(dead_code)]

use std::path::PathBuf;

use crate::casc_storage::db2::Db2File;
use crate::casc_storage::db2_schema::dbd::parser::parse_dbd_file;
use crate::casc_storage::db2_schema::dbd::types::{DbdField, DbdType};
use crate::casc_storage::db2_schema::dump::dump_json;
use crate::casc_storage::db2_schema::wdc5::decoder::BitReader;
use crate::casc_storage::db2_schema::wdc5::types::{CompressionType, Wdc5Meta, Wdc5Section};
use crate::casc_storage::types::CascError;

pub fn dump_spell(db2: &Db2File, _bytes: &[u8], base_dir: &std::path::Path) -> Result<(), CascError> {
    let meta = db2
        .wdc5
        .as_ref()
        .ok_or(CascError::InvalidConfig)?;

    if db2.magic != *b"WDC5" {
        return Err(CascError::InvalidConfig);
    }

    let schema_path: PathBuf = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("src")
        .join("casc_storage")
        .join("definitions")
        .join("Spell.dbd");
    let dbd = parse_dbd_file(&schema_path)
        .map_err(|_| CascError::InvalidConfig)?;

    let fields = dbd.fields;

    let rows = decode_spell_rows(meta, &fields);

    let out_path = base_dir
        .join("src")
        .join("casc_storage")
        .join("debug_dumps")
        .join("spell.db2.json");

    let value = serde_json::Value::Array(rows);
    dump_json(&out_path, &value).map_err(CascError::Io)?;

    let mut preview = String::new();
    for (i, row) in value.as_array().unwrap().iter().take(3).enumerate() {
        preview.push_str(&format!("{}:{}, ", i, row["ID"]));
    }
    println!(
        "[DUMP] Spell.db2 -> {} ({} records) first3: {}",
        out_path.display(),
        value.as_array().map(|a| a.len()).unwrap_or(0),
        preview
    );

    Ok(())
}

fn decode_spell_rows(meta: &Wdc5Meta, fields: &[DbdField]) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    for section in &meta.sections {
        for row_idx in 0..section.num_records as usize {
            let mut obj = serde_json::Map::new();
            for (col_idx, field) in fields.iter().enumerate() {
                if let Some(v) = decode_field(row_idx, col_idx, field, meta, section) {
                    obj.insert(field.name.clone(), v);
                }
            }
            out.push(serde_json::Value::Object(obj));
        }
    }
    out
}

fn decode_field(
    row_idx: usize,
    col_idx: usize,
    field: &DbdField,
    meta: &Wdc5Meta,
    section: &Wdc5Section,
) -> Option<serde_json::Value> {
    if col_idx >= meta.field_meta.len() || col_idx >= meta.column_meta.len() {
        return None;
    }

    let array_len = field.array_len.max(1);
    let mut reader = super::super::wdc5::decoder::BitReader::new(&section.records_data, 0);

    if array_len == 1 {
        decode_single(row_idx, col_idx, field, meta, section, &mut reader)
    } else {
        let mut arr = Vec::new();
        for _ in 0..array_len {
            if let Some(v) = decode_single(row_idx, col_idx, field, meta, section, &mut reader) {
                arr.push(v);
            }
        }
        if arr.is_empty() {
            None
        } else {
            Some(serde_json::Value::Array(arr))
        }
    }
}

fn decode_single(
    row_idx: usize,
    col_idx: usize,
    field: &DbdField,
    meta: &Wdc5Meta,
    section: &Wdc5Section,
    reader: &mut BitReader<'_>,
) -> Option<serde_json::Value> {
    let field_meta = &meta.field_meta[col_idx];
    let column = &meta.column_meta[col_idx];

    let mut base_offset = section.record_size as usize * row_idx;
    if section.is_sparse {
        if let Some(entry) = section.sparse_entries.get(row_idx) {
            base_offset = (entry.offset - section.record_size * (row_idx as i32)) as usize;
        } else {
            return None;
        }
    }

    reader.offset = base_offset;
    reader.set_position(column.record_offset as usize);

    match field.ty {
        DbdType::String | DbdType::LocString => decode_string(field_meta, column, reader, section)
            .map(|s| serde_json::Value::String(s)),
        DbdType::Int | DbdType::Short | DbdType::Byte => decode_numeric(
            row_idx,
            col_idx,
            true,
            field_meta,
            column,
            reader,
            meta,
        )
        .map(|v| serde_json::Value::Number(v.into())),
        DbdType::UInt | DbdType::UShort | DbdType::UByte => decode_numeric(
            row_idx,
            col_idx,
            false,
            field_meta,
            column,
            reader,
            meta,
        )
        .map(|v| serde_json::Value::Number(v.into())),
        DbdType::Float => decode_numeric(
            row_idx,
            col_idx,
            false,
            field_meta,
            column,
            reader,
            meta,
        )
        .and_then(|v| serde_json::Number::from_f64(f32::from_bits(v as u32) as f64))
        .map(serde_json::Value::Number),
        _ => None,
    }
}

fn decode_numeric(
    row_idx: usize,
    col_idx: usize,
    signed: bool,
    field_meta: &crate::casc_storage::db2_schema::wdc5::types::FieldMetaData,
    column: &crate::casc_storage::db2_schema::wdc5::types::ColumnMetaData,
    reader: &mut BitReader<'_>,
    meta: &Wdc5Meta,
) -> Option<i64> {
    let bit_width = if field_meta.bits < 32 {
        (32 - field_meta.bits) as usize
    } else {
        column.val2 as usize
    };

    match column.compression {
        CompressionType::None | CompressionType::Immediate | CompressionType::SignedImmediate => {
            if signed {
                reader.read_signed(bit_width)
            } else {
                reader.read_bits(bit_width).map(|v| v as i64)
            }
        }
        CompressionType::Common => {
            let default = column.val1 as i64;
            meta.common_data
                .get(col_idx)
                .and_then(|map| map.get(&(row_idx as i32)))
                .map(|v| v.as_i32() as i64)
                .or(Some(default))
        }
        CompressionType::Pallet => {
            let idx = reader.read_bits(bit_width)? as usize;
            meta.pallet_data
                .get(col_idx)
                .and_then(|vals| vals.get(idx))
                .map(|v| v.as_i32() as i64)
        }
        CompressionType::PalletArray => {
            let idx = reader.read_bits(bit_width)? as usize;
            let cardinality = column.val3 as usize;
            meta.pallet_data
                .get(col_idx)
                .and_then(|vals| vals.get(idx * cardinality))
                .map(|v| v.as_i32() as i64)
        }
    }
}

fn decode_string(
    field_meta: &crate::casc_storage::db2_schema::wdc5::types::FieldMetaData,
    column: &crate::casc_storage::db2_schema::wdc5::types::ColumnMetaData,
    reader: &mut super::super::wdc5::decoder::BitReader<'_>,
    section: &Wdc5Section,
) -> Option<String> {
    let bit_width = if field_meta.bits < 32 {
        (32 - field_meta.bits) as usize
    } else {
        column.val2 as usize
    };
    let offset = reader.read_bits(bit_width)? as u32;
    let pos = (reader.offset + (reader.position >> 3)) as u32;
    let key = pos + offset;
    section.string_table.get(&key).cloned()
}
