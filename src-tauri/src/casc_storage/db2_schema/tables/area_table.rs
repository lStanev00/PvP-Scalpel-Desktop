#![allow(dead_code)]

use crate::casc_storage::db2::Db2File;
use crate::casc_storage::db2_schema::common::{read_i32_le, read_u16_le, read_u32_le};
use crate::casc_storage::db2_schema::record_iter::iter_section_records;
use crate::casc_storage::db2_schema::string_table::read_string;

pub struct AreaTableRow {
    pub id: u32,
    pub map_id: u16,
    pub parent_area_id: u16,
    pub area_level: i32,
    pub flags: u32,
    pub name: String,
}

const AREA_TABLE_RECORD_SIZE: usize = 20; // Fixed layout for this schema.
const OFF_ID: usize = 0;
const OFF_MAP_ID: usize = 4;
const OFF_PARENT_ID: usize = 6;
const OFF_AREA_LEVEL: usize = 8;
const OFF_FLAGS: usize = 12;
const OFF_NAME_OFFSET: usize = 16;

pub fn parse_area_table(db2: &Db2File, data: &[u8]) -> Vec<AreaTableRow> {
    println!(
        "[SCHEMA] AreaTable: parsing record_size={} sections={}",
        AREA_TABLE_RECORD_SIZE,
        db2.sections.len()
    );

    let mut rows = Vec::new();

    for section in &db2.sections {
        for rec in iter_section_records(data, section, AREA_TABLE_RECORD_SIZE) {
            if rec.len() < AREA_TABLE_RECORD_SIZE {
                continue;
            }

            let id = read_u32_le(rec, OFF_ID).unwrap_or(0);
            let map_id = read_u16_le(rec, OFF_MAP_ID).unwrap_or(0);
            let parent_area_id = read_u16_le(rec, OFF_PARENT_ID).unwrap_or(0);
            let area_level = read_i32_le(rec, OFF_AREA_LEVEL).unwrap_or(0);
            let flags = read_u32_le(rec, OFF_FLAGS).unwrap_or(0);
            let name_offset = read_u32_le(rec, OFF_NAME_OFFSET).unwrap_or(0);
            let name = read_string(data, name_offset).unwrap_or_default();

            rows.push(AreaTableRow {
                id,
                map_id,
                parent_area_id,
                area_level,
                flags,
                name,
            });
        }
    }

    println!("[SCHEMA] AreaTable: parsed {} records", rows.len());
    rows
}
