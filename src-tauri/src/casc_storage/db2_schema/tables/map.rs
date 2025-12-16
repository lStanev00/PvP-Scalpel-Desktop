#![allow(dead_code)]

use serde::Serialize;

use crate::casc_storage::db2::Db2File;
use crate::casc_storage::db2_schema::common::{read_u32_le};
use crate::casc_storage::db2_schema::record_iter::iter_section_records;
use crate::casc_storage::db2_schema::string_table::read_string;

#[derive(Debug, Serialize)]
pub struct MapRow {
    pub id: u32,
    pub parent_area_id: u32,
    pub flags: u32,
    pub internal_name: String,
    pub map_name: String,
}

// Fixed layout for Map.db2 (WDC5). This is schema-defined; not inferred at runtime.
const MAP_RECORD_SIZE: usize = 528;
const OFF_ID: usize = 0;
const OFF_PARENT_AREA: usize = 4;
const OFF_FLAGS: usize = 8;
const OFF_INTERNAL_NAME_OFFSET: usize = MAP_RECORD_SIZE - 8;
const OFF_MAP_NAME_OFFSET: usize = MAP_RECORD_SIZE - 4;

pub fn parse_map(db2: &Db2File, data: &[u8]) -> Vec<MapRow> {
    println!(
        "[SCHEMA] Map: parsing record_size={} sections={}",
        MAP_RECORD_SIZE,
        db2.sections.len()
    );

    let mut rows = Vec::new();

    for section in &db2.sections {
        for rec in iter_section_records(data, section, MAP_RECORD_SIZE) {
            if rec.len() < MAP_RECORD_SIZE {
                continue;
            }

            let id = read_u32_le(rec, OFF_ID).unwrap_or(0);
            let parent_area_id = read_u32_le(rec, OFF_PARENT_AREA).unwrap_or(0);
            let flags = read_u32_le(rec, OFF_FLAGS).unwrap_or(0);
            let internal_off = read_u32_le(rec, OFF_INTERNAL_NAME_OFFSET).unwrap_or(0);
            let map_name_off = read_u32_le(rec, OFF_MAP_NAME_OFFSET).unwrap_or(0);

            let internal_name = read_string(data, internal_off).unwrap_or_default();
            let map_name = read_string(data, map_name_off).unwrap_or_default();

            rows.push(MapRow {
                id,
                parent_area_id,
                flags,
                internal_name,
                map_name,
            });
        }
    }

    println!("[SCHEMA] Map: parsed {} records", rows.len());
    rows
}

pub fn dump_map_json(rows: &[MapRow], base_path: &std::path::Path) -> std::io::Result<()> {
    // Write into target/debug_dumps to avoid triggering dev hot-reload on source files.
    let out_path = base_path.join("target").join("debug_dumps").join("map.db2.json");
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(rows).unwrap_or_else(|_| "[]".to_string());
    std::fs::write(&out_path, json)?;
    println!("[DUMP] Map.db2 -> {} ({} records)", out_path.display(), rows.len());
    Ok(())
}
