#![allow(dead_code)]

use std::collections::HashMap;
use std::io::Cursor;
use std::io::Read;

use crate::casc_storage::types::CascError;

use super::types::{ColumnMetaData, CompressionType, FieldMetaData, Value32, Wdc5Meta, Wdc5Section};

pub fn parse_wdc5(data: &[u8]) -> Result<Wdc5Meta, CascError> {
    let mut cur = Cursor::new(data);

    if data.len() < 204 {
        return Err(CascError::InvalidConfig);
    }

    let _magic = read_u32(&mut cur)?;
    let _version = read_u32(&mut cur)?;
    let mut build_string = [0u8; 128];
    cur.read_exact(&mut build_string).map_err(CascError::Io)?;

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
    let _wdc2_unk1 = read_i32(&mut cur)?;
    let _column_meta_data_size = read_i32(&mut cur)?;
    let _sparse_block_size = read_i32(&mut cur)?;
    let _column_data_block_size = read_i32(&mut cur)?;
    let sections_count = read_i32(&mut cur)?;

    // sections
    let mut sections_raw = Vec::with_capacity(sections_count as usize);
    for _ in 0..sections_count {
        let tact = read_u64(&mut cur)?;
        let ptr_records = read_i32(&mut cur)?;
        let total_records = read_i32(&mut cur)?;
        let string_table_size = read_i32(&mut cur)?;
        let ptr_blocks = read_i32(&mut cur)?;
        let id_block_size = read_i32(&mut cur)?;
        let key_block_size = read_i32(&mut cur)?;
        let offset_map_entries = read_i32(&mut cur)?;
        let clone_block_entries = read_i32(&mut cur)?;
        sections_raw.push(SectionRaw {
            tact_key_lookup: tact,
            ptr_records,
            total_records,
            string_table_size,
            ptr_blocks,
            id_block_size,
            key_block_size,
            offset_map_entries,
            clone_block_entries,
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
    let is_sparse = (flags & 0x1) != 0;
    let record_size_u = usize::try_from(record_size.max(0)).map_err(|_| CascError::InvalidConfig)?;
    let total_record_data = sections_raw
        .iter()
        .map(|s| record_size_u.saturating_mul(usize::try_from(s.total_records.max(0)).unwrap_or(0)))
        .sum::<usize>();

    let mut record_id_base = 0usize;

    for (idx, sec) in sections_raw.iter().enumerate() {
        if sec.tact_key_lookup != 0 {
            println!("[WDC5] section {} is encrypted (tact key present); skipping", idx);
            continue;
        }

        let records_offset = sec.ptr_records.max(0) as usize;
        if records_offset > data.len() {
            return Err(CascError::InvalidConfig);
        }

        let offsets = compute_section_offsets(sec, record_size_u);
        let record_count = if sec.ptr_blocks > 0 && sec.offset_map_entries > 0 {
            sec.offset_map_entries as usize
        } else {
            sec.total_records as usize
        };

        let records_len = if sec.ptr_blocks > 0 {
            offsets.ptr_blocks.saturating_sub(records_offset)
        } else {
            record_size_u.saturating_mul(sec.total_records as usize)
        };
        let records_end = records_offset
            .checked_add(records_len)
            .ok_or(CascError::InvalidConfig)?;
        let records_data = data
            .get(records_offset..records_end)
            .ok_or(CascError::InvalidConfig)?
            .to_vec();

        let mut record_offsets = Vec::with_capacity(record_count);
        let mut record_sizes = Vec::with_capacity(record_count);

        if offsets.ptr_offset_map > 0 && record_count > 0 {
            for i in 0..record_count {
                let entry_offset = offsets.ptr_offset_map + i * 6;
                let data_offset = read_u32_at(data, entry_offset)? as usize;
                let size = read_u16_at(data, entry_offset + 4)? as usize;
                let rel = if data_offset >= records_offset {
                    data_offset - records_offset
                } else {
                    data_offset
                };
                record_offsets.push(rel);
                record_sizes.push(size);
            }
        } else {
            for i in 0..record_count {
                record_offsets.push(record_size_u * i);
                record_sizes.push(record_size_u);
            }
        }

        let string_table = parse_string_table(data, &offsets, record_size_u, sec, records_offset)?;
        let record_ids = parse_record_ids(
            data,
            &offsets,
            sec,
            record_count,
            record_size_u,
            &records_data,
            &record_offsets,
            &column_meta,
            &field_meta,
            id_field_index as usize,
        )?;
        let parent_ids = parse_key_block(data, &offsets, sec, record_count)?;
        let copy_data = parse_clone_block(data, &offsets, sec)?;

        sections.push(Wdc5Section {
            num_records: record_count as i32,
            string_table_size: sec.string_table_size,
            record_size,
            is_sparse,
            ptr_records: records_offset,
            total_records: sec.total_records.max(0) as usize,
            record_id_base,
            ptr_string_block: offsets.ptr_string_block,
            ptr_offset_map: offsets.ptr_offset_map,
            records_data,
            record_offsets,
            record_sizes,
            string_table,
            record_ids,
            parent_ids,
            copy_data,
            sparse_entries: Vec::new(),
        });

        record_id_base = record_id_base.saturating_add(sec.total_records.max(0) as usize);
    }

    Ok(Wdc5Meta {
        records_count,
        fields_count,
        record_size,
        total_record_data,
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
    ptr_records: i32,
    total_records: i32,
    string_table_size: i32,
    ptr_blocks: i32,
    id_block_size: i32,
    key_block_size: i32,
    offset_map_entries: i32,
    clone_block_entries: i32,
}

struct SectionOffsets {
    ptr_blocks: usize,
    ptr_string_block: usize,
    ptr_id_block: usize,
    ptr_clone_block: usize,
    ptr_offset_map: usize,
    ptr_id_map: usize,
    ptr_key_block: usize,
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

fn read_u32_at(data: &[u8], offset: usize) -> Result<u32, CascError> {
    let slice = data.get(offset..offset + 4).ok_or(CascError::InvalidConfig)?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn read_u16_at(data: &[u8], offset: usize) -> Result<u16, CascError> {
    let slice = data.get(offset..offset + 2).ok_or(CascError::InvalidConfig)?;
    Ok(u16::from_le_bytes([slice[0], slice[1]]))
}

fn compute_section_offsets(sec: &SectionRaw, record_size: usize) -> SectionOffsets {
    let ptr_records = sec.ptr_records.max(0) as usize;
    let total_records = sec.total_records.max(0) as usize;

    let mut ptr_string_block = 0usize;
    let mut running_offset = if sec.ptr_blocks == 0 {
        ptr_string_block = ptr_records.saturating_add(record_size.saturating_mul(total_records));
        ptr_string_block + sec.string_table_size.max(0) as usize
    } else {
        sec.ptr_blocks.max(0) as usize
    };

    let ptr_id_block = if sec.id_block_size > 0 {
        let off = running_offset;
        running_offset += sec.id_block_size.max(0) as usize;
        off
    } else {
        0
    };

    let ptr_clone_block = if sec.clone_block_entries > 0 {
        let off = running_offset;
        running_offset += sec.clone_block_entries.max(0) as usize * 8;
        off
    } else {
        0
    };

    let (ptr_offset_map, ptr_id_map) = if sec.ptr_blocks > 0 && sec.offset_map_entries > 0 {
        let off_map = running_offset;
        running_offset += sec.offset_map_entries.max(0) as usize * 6;
        let id_map = running_offset;
        running_offset += sec.offset_map_entries.max(0) as usize * 4;
        (off_map, id_map)
    } else {
        (0, 0)
    };

    let ptr_key_block = if sec.key_block_size > 0 {
        let off = running_offset;
        off
    } else {
        0
    };

    SectionOffsets {
        ptr_blocks: sec.ptr_blocks.max(0) as usize,
        ptr_string_block,
        ptr_id_block,
        ptr_clone_block,
        ptr_offset_map,
        ptr_id_map,
        ptr_key_block,
    }
}

fn parse_string_table(
    data: &[u8],
    offsets: &SectionOffsets,
    _record_size: usize,
    sec: &SectionRaw,
    _records_offset: usize,
) -> Result<HashMap<u32, String>, CascError> {
    let mut table = HashMap::new();
    if offsets.ptr_string_block == 0 || sec.string_table_size == 0 {
        return Ok(table);
    }

    let start = offsets.ptr_string_block;
    let size = sec.string_table_size as usize;
    let end = start.checked_add(size).ok_or(CascError::InvalidConfig)?;
    let block = data.get(start..end).ok_or(CascError::InvalidConfig)?;

    let mut offset = 0usize;
    while offset < block.len() {
        let zero_pos = block[offset..]
            .iter()
            .position(|b| *b == 0)
            .unwrap_or(block.len() - offset);
        let end_pos = offset + zero_pos;
        let s = String::from_utf8_lossy(&block[offset..end_pos]).to_string();
        table.insert(offset as u32, s);
        offset = end_pos + 1;
    }
    Ok(table)
}

fn parse_record_ids(
    data: &[u8],
    offsets: &SectionOffsets,
    sec: &SectionRaw,
    record_count: usize,
    record_size: usize,
    records_data: &[u8],
    record_offsets: &[usize],
    column_meta: &[ColumnMetaData],
    field_meta: &[FieldMetaData],
    id_field_index: usize,
) -> Result<Vec<i32>, CascError> {
    if offsets.ptr_id_block > 0 && sec.id_block_size > 0 {
        let count = (sec.id_block_size.max(0) as usize) / 4;
        let mut ids = Vec::with_capacity(count);
        for i in 0..count {
            ids.push(read_u32_at(data, offsets.ptr_id_block + i * 4)? as i32);
        }
        return Ok(ids);
    }

    if offsets.ptr_id_map > 0 && record_count > 0 {
        let mut ids = Vec::with_capacity(record_count);
        for i in 0..record_count {
            ids.push(read_u32_at(data, offsets.ptr_id_map + i * 4)? as i32);
        }
        return Ok(ids);
    }

    if id_field_index >= column_meta.len() {
        return Err(CascError::InvalidConfig);
    }

    let field = &field_meta[id_field_index];
    let column = &column_meta[id_field_index];
    let bit_width = if field.bits < 32 {
        (32 - field.bits) as usize
    } else {
        column.val2 as usize
    };

    let mut ids = Vec::with_capacity(record_count);
    for i in 0..record_count {
        let base_offset = *record_offsets.get(i).unwrap_or(&(record_size * i));
        if base_offset >= records_data.len() {
            ids.push(0);
            continue;
        }
        let mut reader = super::decoder::BitReader::new(records_data, base_offset);
        reader.set_position(column.record_offset as usize);
        let val = reader.read_bits(bit_width).unwrap_or(0) as i32;
        ids.push(val);
    }
    Ok(ids)
}

fn parse_key_block(
    data: &[u8],
    offsets: &SectionOffsets,
    sec: &SectionRaw,
    record_count: usize,
) -> Result<Vec<i32>, CascError> {
    let mut parent_ids = vec![0; record_count];
    if offsets.ptr_key_block == 0 || sec.key_block_size <= 0 {
        return Ok(parent_ids);
    }

    let mut offset = offsets.ptr_key_block;
    let records = read_u32_at(data, offset)? as usize;
    offset += 12;

    for _ in 0..records {
        let parent_id = read_u32_at(data, offset)? as i32;
        let record_index = read_u32_at(data, offset + 4)? as usize;
        if record_index < record_count {
            parent_ids[record_index] = parent_id;
        }
        offset += 8;
    }
    Ok(parent_ids)
}

fn parse_clone_block(
    data: &[u8],
    offsets: &SectionOffsets,
    sec: &SectionRaw,
) -> Result<HashMap<i32, i32>, CascError> {
    let mut copy_data = HashMap::new();
    if offsets.ptr_clone_block == 0 || sec.clone_block_entries <= 0 {
        return Ok(copy_data);
    }

    let mut offset = offsets.ptr_clone_block;
    for _ in 0..sec.clone_block_entries {
        let dst = read_u32_at(data, offset)? as i32;
        let src = read_u32_at(data, offset + 4)? as i32;
        copy_data.insert(dst, src);
        offset += 8;
    }
    Ok(copy_data)
}
