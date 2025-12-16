//! CASCExplorer alignment notes (DB2 header parsing)
//! - C# parses DB2 by format, never by scanning for magic mid-buffer.
//! - WDC1/WDB5/WDB6 are treated as contiguous: header (20b) + records + strings.
//! - WDC2/WDC3 use a fixed 72-byte header (section_count at offset 68) and
//!   per-section headers (WDC2: 36 bytes, WDC3: 40 bytes). Validation is
//!   section-based; strings are not assumed contiguous after records.
//! - Sparse tables rely on section offsets (SparseTableOffset / SparseDataEndOffset);
//!   when sparse, string sizes are effectively 0 and string bounds are skipped.

use crate::casc_storage::listfile::Listfile;
use crate::casc_storage::storage::{read_file_by_filedataid, CascStorage};
use crate::casc_storage::types::CascError;
use crate::casc_storage::db2_schema::wdc5::reader::parse_wdc5;
use crate::casc_storage::db2_schema::wdc5::types::Wdc5Meta;

#[derive(Debug, Clone)]
pub struct Db2Section {
    pub data_offset: u32,
    pub data_size: u32,
    #[allow(dead_code)]
    pub string_offset: u32,
    #[allow(dead_code)]
    pub string_size: u32,
}

#[derive(Debug, Clone)]
pub struct Db2File {
    pub magic: [u8; 4],
    pub record_count: u32,
    pub field_count: u32,
    pub record_size: u32,
    pub string_block_size: u32,
    pub section_count: u32,
    pub sections: Vec<Db2Section>,
    pub wdc5: Option<Wdc5Meta>,
}

fn normalize_name(name: &str) -> String {
    name.trim().replace('\\', "/").to_ascii_lowercase()
}

#[allow(dead_code)]
pub fn read_db2_by_name(storage: &CascStorage, name: &str) -> Result<Db2File, CascError> {
    validate_db2_by_name(storage, name)
}

pub fn validate_db2_by_name(storage: &CascStorage, name: &str) -> Result<Db2File, CascError> {
    println!("[DB2] attempting {}", name);
    let normalized = normalize_name(name);
    let listfile: &Listfile = storage.listfile.as_ref().ok_or_else(|| {
        println!("[DB2] failed {} reason=listfile not loaded", name);
        CascError::FileNotFound
    })?;

    let file_id = match listfile.by_name.get(&normalized) {
        Some(fid) => *fid,
        None => {
            println!("[DB2] failed {} reason=name not in listfile", name);
            return Err(CascError::FileNotFound);
        }
    };

    println!("[DB2] resolved FileDataID={}", file_id);

    let bytes = match read_file_by_filedataid(storage, file_id) {
        Ok(b) => b,
        Err(e) => {
            println!("[DB2] failed {} reason={}", name, e);
            return Err(e);
        }
    };

    log_buffer_preview(&bytes, &normalized);

    match parse_db2(&bytes) {
        Ok(db2) => {
            println!(
                "[DB2] magic={}",
                std::str::from_utf8(&db2.magic).unwrap_or("????")
            );
            println!(
                "[DB2] records={} fields={} recordSize={} stringBlock={} sectionCount={}",
                db2.record_count, db2.field_count, db2.record_size, db2.string_block_size, db2.section_count
            );
            log_section0(&db2.sections);
            println!("[DB2] validation OK");
            Ok(db2)
        }
        Err(e) => {
            println!("[DB2] failed {} reason={}", name, e);
            Err(e)
        }
    }
}

fn log_buffer_preview(bytes: &[u8], name: &str) {
    let magic_ascii = bytes.get(0..4).unwrap_or(&[]);
    let magic_hex = magic_ascii.iter().map(|b| format!("{:02x}", b)).collect::<String>();
    let magic_str = std::str::from_utf8(magic_ascii).unwrap_or("????");
    let preview_len = bytes.len().min(32);
    let first = bytes
        .get(0..preview_len)
        .unwrap_or(&[])
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<Vec<_>>()
        .join("");
    println!(
        "[DB2] buffer preview {} size={} magic_ascii={} magic_hex={} first{}={}",
        name,
        bytes.len(),
        magic_str,
        magic_hex,
        preview_len,
        first
    );
}

pub fn parse_db2(data: &[u8]) -> Result<Db2File, CascError> {
    if data.len() < 20 {
        return Err(CascError::InvalidConfig);
    }

    let magic = [data[0], data[1], data[2], data[3]];
    if !is_supported_magic(&magic) {
        return Err(CascError::InvalidConfig);
    }

    if magic == *b"WDC5" {
        let meta = parse_wdc5(data)?;
        let mut sections = Vec::new();
        for sec in &meta.sections {
            sections.push(Db2Section {
                data_offset: 0,
                data_size: sec.records_data.len() as u32,
                string_offset: 0,
                string_size: sec.string_table_size as u32,
            });
        }
        return Ok(Db2File {
            magic,
            record_count: meta.records_count as u32,
            field_count: meta.fields_count as u32,
            record_size: meta.record_size as u32,
            string_block_size: 0,
            section_count: sections.len() as u32,
            sections,
            wdc5: Some(meta),
        });
    }

    println!(
        "[DB2] parse start magic={} bytes={}",
        std::str::from_utf8(&magic).unwrap_or("????"),
        data.len()
    );

    let record_count = u32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    let mut field_count = u32::from_le_bytes([data[8], data[9], data[10], data[11]]);
    let mut record_size = u32::from_le_bytes([data[12], data[13], data[14], data[15]]);
    let mut string_block_size = u32::from_le_bytes([data[16], data[17], data[18], data[19]]);

    let mut sections = Vec::new();

    match &magic {
        b"WDC1" | b"WDB5" | b"WDB6" => {
            let records_bytes = record_count
                .checked_mul(record_size)
                .ok_or(CascError::InvalidConfig)? as usize;
            let total_needed = 20usize
                .checked_add(records_bytes)
                .and_then(|v| v.checked_add(string_block_size as usize))
                .ok_or(CascError::InvalidConfig)?;
            if total_needed > data.len() {
                println!(
                    "[DB2] invalid bounds: need {} bytes, have {}",
                    total_needed,
                    data.len()
                );
                return Err(CascError::InvalidConfig);
            }
        }
        b"WDC2" | b"WDC3" | b"WDC5" => {
            if data.len() < 72 {
                println!("[DB2] invalid bounds: need >=72 bytes for extended header");
                return Err(CascError::InvalidConfig);
            }

            if &magic == b"WDC5" {
                // WDC5 does not use the legacy flat header fields; avoid logging garbage.
                field_count = 0;
                record_size = 0;
                string_block_size = 0;
            }

            let flags = u16::from_le_bytes([data[36], data[37]]);
            let sparse = (flags & 0x1) != 0;
            let section_count = u32::from_le_bytes([data[68], data[69], data[70], data[71]]);
            println!(
                "[DB2] header rc={} fc={} rs={} sb={} sectionCount={}",
                record_count, field_count, record_size, string_block_size, section_count
            );

            let section_header_size = if &magic == b"WDC2" { 36usize } else { 40usize };
            let sections_base = 72usize;
            let needed = sections_base
                .checked_add(section_header_size.saturating_mul(section_count as usize))
                .ok_or(CascError::InvalidConfig)?;
            if needed > data.len() {
                println!(
                    "[DB2] invalid bounds: need {} bytes for section headers, have {}",
                    needed,
                    data.len()
                );
                return Err(CascError::InvalidConfig);
            }

            for i in 0..section_count as usize {
                let base = sections_base + i * section_header_size;
                let tact_key_lookup = read_u64(data, base);
                let file_offset = read_u32(data, base + 8);
                let num_records = read_u32(data, base + 12);
                let string_table_size = read_u32(data, base + 16);

                let (data_size, string_offset, string_size) = if &magic == b"WDC2" {
                    let sparse_table_offset = read_u32(data, base + 24);
                    let data_size = if sparse && sparse_table_offset > file_offset {
                        sparse_table_offset - file_offset
                    } else {
                        num_records
                            .checked_mul(record_size)
                            .ok_or(CascError::InvalidConfig)?
                    };
                    let string_offset = file_offset
                        .checked_add(data_size)
                        .ok_or(CascError::InvalidConfig)?;
                    let string_size = if sparse { 0 } else { string_table_size };
                    (data_size, string_offset, string_size)
                } else if &magic == b"WDC3" {
                    let sparse_data_end = read_u32(data, base + 20);
                    let data_size = if sparse && sparse_data_end > file_offset {
                        sparse_data_end - file_offset
                    } else {
                        num_records
                            .checked_mul(record_size)
                            .ok_or(CascError::InvalidConfig)?
                    };
                    let string_offset = file_offset
                        .checked_add(data_size)
                        .ok_or(CascError::InvalidConfig)?;
                    let string_size = if sparse { 0 } else { string_table_size };
                    (data_size, string_offset, string_size)
                } else {
                    // WDC5: use WDC3-style offsets but avoid trusting record_size.
                    let sparse_data_end = read_u32(data, base + 20);
                    let data_size = if sparse_data_end > file_offset {
                        sparse_data_end - file_offset
                    } else {
                        num_records
                            .checked_mul(record_size)
                            .ok_or(CascError::InvalidConfig)?
                    };
                    let string_offset = file_offset
                        .checked_add(data_size)
                        .ok_or(CascError::InvalidConfig)?;
                    let string_size = if sparse { 0 } else { string_table_size };
                    (data_size, string_offset, string_size)
                };

                let data_end = file_offset
                    .checked_add(data_size)
                    .ok_or(CascError::InvalidConfig)? as usize;
                if data_end > data.len() {
                    println!(
                        "[DB2] invalid section layout (section {}): data_end {} > {}",
                        i, data_end, data.len()
                    );
                    return Err(CascError::InvalidConfig);
                }

                if string_size > 0 {
                    let strings_end = (string_offset as usize)
                        .checked_add(string_size as usize)
                        .ok_or(CascError::InvalidConfig)?;
                    if strings_end > data.len() {
                        println!(
                            "[DB2] invalid section layout (section {}): strings_end {} > {}",
                            i, strings_end, data.len()
                        );
                        return Err(CascError::InvalidConfig);
                    }
                }

                // tact_key_lookup kept for parity; not currently used.
                let _ = tact_key_lookup;

                sections.push(Db2Section {
                    data_offset: file_offset,
                    data_size,
                    string_offset,
                    string_size,
                });
            }
        }
        _ => {}
    }

    // CASCExplorer treats section_count==0 as a single implicit section that spans the data payload.
    if sections.is_empty() {
        if data.len() < 72 {
            return Err(CascError::InvalidConfig);
        }
        let data_offset = 72u32;
        let data_size = (data.len().saturating_sub(72)) as u32;
        sections.push(Db2Section {
            data_offset,
            data_size,
            string_offset: data_offset.saturating_add(data_size),
            string_size: 0,
        });
    }

    Ok(Db2File {
        magic,
        record_count,
        field_count,
        record_size,
        string_block_size,
        section_count: sections.len() as u32,
        sections,
        wdc5: None,
    })
}

fn read_u32(data: &[u8], offset: usize) -> u32 {
    let b = &data[offset..offset + 4];
    u32::from_le_bytes([b[0], b[1], b[2], b[3]])
}

fn read_u64(data: &[u8], offset: usize) -> u64 {
    let b = &data[offset..offset + 8];
    u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]])
}

fn is_supported_magic(magic: &[u8]) -> bool {
    matches!(magic, b"WDC1" | b"WDB5" | b"WDB6" | b"WDC2" | b"WDC3" | b"WDC5")
}

fn log_section0(sections: &[Db2Section]) {
    if let Some(s) = sections.get(0) {
        println!(
            "[DB2] section[0] layout: data_offset={} data_size={}",
            s.data_offset, s.data_size
        );
    }
}

// Future schema parsing:
// for section in &sections {
//     let record_base = section.data_offset as usize;
//     let record_end = record_base + section.data_size as usize;
//     // iterate records using schema-defined field layout
// }
