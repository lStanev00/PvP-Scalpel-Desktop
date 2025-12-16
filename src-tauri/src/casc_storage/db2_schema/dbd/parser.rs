#![allow(dead_code)]

use std::fs;
use std::path::Path;

use super::types::{DbdField, DbdTable, DbdType};

pub fn parse_dbd_file(path: &Path) -> std::io::Result<DbdTable> {
    let content = fs::read_to_string(path)?;
    parse_dbd_str(&content)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

pub fn parse_dbd_str(content: &str) -> Result<DbdTable, String> {
    let mut lines = content.lines();
    let mut in_columns = false;
    let mut fields = Vec::new();
    let mut table_name = String::new();

    while let Some(line) = lines.next() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') {
            continue;
        }
        if l.eq_ignore_ascii_case("COLUMNS") {
            in_columns = true;
            continue;
        }
        if !in_columns {
            if table_name.is_empty() && !l.starts_with("LAYOUT") {
                // First non-empty, non-columns line before COLUMNS is the table name (if present)
                table_name = l.to_string();
            }
            continue;
        }

        // stop at next section
        if l.eq_ignore_ascii_case("LAYOUT") || l.eq_ignore_ascii_case("LAYOUTS") {
            break;
        }

        if let Some(field) = parse_field_line(l) {
            fields.push(field);
        }
    }

    if fields.is_empty() {
        return Err("No fields parsed from DBD".to_string());
    }

    if table_name.is_empty() {
        // Fallback to the first field-based name if not provided
        table_name = "unknown".to_string();
    }

    Ok(DbdTable { name: table_name, fields })
}

fn parse_field_line(line: &str) -> Option<DbdField> {
    // Example lines:
    // int ID
    // locstring Name_lang
    // int<SpellScaling::ID> ScalingID
    // int[3] Flags
    let mut parts = line.split_whitespace();
    let raw_ty = parts.next()?;
    let raw_name = parts.next()?;

    let (base_ty, array_len) = parse_type_and_array(raw_ty)?;
    let name = raw_name.trim_end_matches(';').to_string();

    Some(DbdField {
        name,
        ty: base_ty?,
        array_len,
    })
}

fn parse_type_and_array(raw: &str) -> Option<(Option<DbdType>, usize)> {
    let mut base = raw.to_string();
    if let Some(idx) = raw.find('<') {
        if let Some(end) = raw.find('>') {
            base = raw[..idx].to_string();
            if end + 1 < raw.len() {
                base.push_str(&raw[end + 1..]);
            }
        }
    }

    let mut array_len = 1usize;
    let mut ty_str = base.as_str();
    if let Some(arr_start) = base.find('[') {
        if let Some(arr_end) = base.find(']') {
            let len_str = &base[arr_start + 1..arr_end];
            array_len = len_str.parse::<usize>().unwrap_or(1);
            ty_str = &base[..arr_start];
        }
    }

    Some((DbdType::from_str(ty_str), array_len))
}
