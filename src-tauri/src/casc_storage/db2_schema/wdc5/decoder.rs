#![allow(dead_code)]

use std::collections::HashMap;

use super::types::{ColumnMetaData, CompressionType, FieldMetaData, Value32, Wdc5Meta, Wdc5Section};

#[derive(Debug, Clone)]
pub enum DecodedValue {
    Int(i32),
    UInt(u32),
    Short(i16),
    UShort(u16),
    Byte(i8),
    UByte(u8),
    Long(i64),
    ULong(u64),
    Float(f32),
    String(String),
    Array(Vec<DecodedValue>),
    Empty,
}

pub struct BitReader<'a> {
    data: &'a [u8],
    pub position: usize, // bits
    pub offset: usize,   // bytes
}

impl<'a> BitReader<'a> {
    pub fn new(data: &'a [u8], offset: usize) -> Self {
        Self {
            data,
            position: 0,
            offset,
        }
    }

    pub fn set_position(&mut self, pos: usize) {
        self.position = pos;
    }

    pub fn read_bits(&mut self, num_bits: usize) -> Option<u64> {
        if num_bits == 0 {
            return Some(0);
        }
        let byte_pos = self.offset + (self.position >> 3);
        let bit_offset = self.position & 7;

        let needed_bits = num_bits + bit_offset;
        let needed_bytes = (needed_bits + 7) >> 3;

        let slice = self.data.get(byte_pos..byte_pos + needed_bytes)?;
        let mut val: u64 = 0;
        for (i, b) in slice.iter().enumerate() {
            val |= (*b as u64) << (i * 8);
        }
        val >>= bit_offset;
        let mask = if num_bits == 64 { u64::MAX } else { (1u64 << num_bits) - 1 };
        let out = val & mask;
        self.position += num_bits;
        Some(out)
    }

    pub fn read_signed(&mut self, num_bits: usize) -> Option<i64> {
        let v = self.read_bits(num_bits)? as i64;
        let shift = 64 - num_bits;
        Some((v << shift) >> shift)
    }
}

pub fn decode_row_value(
    row_index: usize,
    record_id: i32,
    col_index: usize,
    section: &Wdc5Section,
    meta: &Wdc5Meta,
    _strings: &HashMap<u32, String>,
) -> Option<DecodedValue> {
    let field_meta = meta.field_meta.get(col_index)?;
    let column = meta.column_meta.get(col_index)?;

    let mut base_offset = section
        .record_offsets
        .get(row_index)
        .copied()
        .unwrap_or_else(|| section.record_size as usize * row_index);
    if section.is_sparse {
        if let Some(entry) = section.sparse_entries.get(row_index) {
            base_offset = (entry.offset - section.record_size * (row_index as i32)) as usize;
        } else {
            return None;
        }
    }

    let mut reader = BitReader::new(&section.records_data, base_offset);
    reader.set_position(column.record_offset as usize);

    match column.compression {
        CompressionType::None | CompressionType::Immediate | CompressionType::SignedImmediate => {
            decode_bitpacked(field_meta, column, &mut reader)
        }
        CompressionType::Common => decode_common(record_id, col_index, column, meta),
        CompressionType::Pallet => decode_pallet(field_meta, col_index, column, &mut reader, meta),
        CompressionType::PalletArray => {
            decode_pallet_array(field_meta, col_index, column, &mut reader, meta)
        }
    }
}

fn decode_bitpacked(
    field_meta: &FieldMetaData,
    column: &ColumnMetaData,
    reader: &mut BitReader<'_>,
) -> Option<DecodedValue> {
    let bit_width = if field_meta.bits < 32 {
        (32 - field_meta.bits) as usize
    } else {
        column.val2 as usize
    };
    let signed = matches!(column.compression, CompressionType::SignedImmediate);
    if signed {
        reader
            .read_signed(bit_width)
            .map(|v| DecodedValue::Int(v as i32))
    } else {
        reader
            .read_bits(bit_width)
            .map(|v| DecodedValue::UInt(v as u32))
    }
}

fn decode_common(
    record_id: i32,
    col_index: usize,
    column: &ColumnMetaData,
    meta: &Wdc5Meta,
) -> Option<DecodedValue> {
    let default = Value32(column.val1);
    meta.common_data.get(col_index).map(|map| {
        map.get(&record_id)
            .map(|v| DecodedValue::UInt(v.as_u32()))
            .unwrap_or(DecodedValue::UInt(default.as_u32()))
    })
}

fn decode_pallet(
    field_meta: &FieldMetaData,
    col_index: usize,
    column: &ColumnMetaData,
    reader: &mut BitReader<'_>,
    meta: &Wdc5Meta,
) -> Option<DecodedValue> {
    let bit_width = if field_meta.bits < 32 {
        (32 - field_meta.bits) as usize
    } else {
        column.val2 as usize
    };
    let idx = reader.read_bits(bit_width)? as usize;
    let pallet = meta.pallet_data.get(col_index)?;
    pallet.get(idx).map(|v| DecodedValue::UInt(v.as_u32()))
}

fn decode_pallet_array(
    field_meta: &FieldMetaData,
    col_index: usize,
    column: &ColumnMetaData,
    reader: &mut BitReader<'_>,
    meta: &Wdc5Meta,
) -> Option<DecodedValue> {
    let bit_width = if field_meta.bits < 32 {
        (32 - field_meta.bits) as usize
    } else {
        column.val2 as usize
    };
    let pallet_idx = reader.read_bits(bit_width)? as usize;
    let cardinality = column.val3 as usize;
    let pallet = meta.pallet_data.get(col_index)?;
    let mut vals = Vec::new();
    for i in 0..cardinality {
        if let Some(v) = pallet.get(i + cardinality * pallet_idx) {
            vals.push(DecodedValue::UInt(v.as_u32()));
        }
    }
    Some(DecodedValue::Array(vals))
}
