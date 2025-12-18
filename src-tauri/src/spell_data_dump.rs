use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::Path;

use crate::casc_storage::db2::parse_db2;
use crate::casc_storage::db2_schema::wdc5::decoder::{decode_row_value, DecodedValue};
use crate::casc_storage::db2_schema::wdc5::types::{Wdc5Meta, Wdc5Section};
use crate::casc_storage::storage::{read_file_by_filedataid, CascStorage};
use crate::casc_storage::types::CascError;
use crate::logger;
use crate::simc_formats::FormatTable;

fn field_index(schema: &FormatTable, name: &str) -> Option<usize> {
    schema.fields.iter().position(|f| f.field == name)
}

fn load_wdc5_by_name(storage: &CascStorage, name: &str) -> Result<(Vec<u8>, Wdc5Meta), CascError> {
    let normalized = name.trim().replace('\\', "/").to_ascii_lowercase();
    let listfile = storage.listfile.as_ref().ok_or(CascError::FileNotFound)?;
    let file_id = *listfile
        .by_name
        .get(&normalized)
        .ok_or(CascError::FileNotFound)?;

    let bytes = read_file_by_filedataid(storage, file_id)?;
    let db2 = parse_db2(&bytes)?;
    let meta = db2.wdc5.ok_or(CascError::InvalidConfig)?;
    Ok((bytes, meta))
}

fn decode_u32(meta: &Wdc5Meta, section: &Wdc5Section, record_idx: usize, record_id: i32, col: usize) -> Option<u32> {
    let strings = HashMap::new();
    match decode_row_value(record_idx, record_id, col, section, meta, &strings)? {
        DecodedValue::UInt(v) => Some(v),
        DecodedValue::Int(v) => Some(v as u32),
        DecodedValue::UShort(v) => Some(v as u32),
        DecodedValue::Short(v) => Some(v as u32),
        DecodedValue::UByte(v) => Some(v as u32),
        DecodedValue::Byte(v) => Some(v as u32),
        _ => None,
    }
}

fn decode_string(
    data: &[u8],
    meta: &Wdc5Meta,
    section: &Wdc5Section,
    record_idx: usize,
    record_id: i32,
    col: usize,
) -> Option<String> {
    let raw = decode_u32(meta, section, record_idx, record_id, col)?;
    if raw == 0 {
        return None;
    }

    let start = if section.ptr_offset_map != 0 {
        raw as usize
    } else {
        let record_size = usize::try_from(meta.record_size.max(0)).ok()?;
        let record_id_cont = section.record_id_base.saturating_add(record_idx);
        let field_byte_offset = meta.column_meta.get(col).map(|c| c.record_offset as usize / 8)?;

        let used = record_id_cont
            .checked_mul(record_size)?
            .checked_add(field_byte_offset)?;
        if meta.total_record_data < used {
            return None;
        }
        let bremain = meta.total_record_data - used;
        let raw_u = raw as usize;
        if raw_u < bremain {
            return None;
        }
        let mut sb_offset = raw_u - bremain;

        let mut abs = None;
        for sec in &meta.sections {
            let sb_size = sec.string_table_size.max(0) as usize;
            if sb_offset >= sb_size {
                sb_offset -= sb_size;
                continue;
            }
            abs = Some(sec.ptr_string_block.saturating_add(sb_offset));
            break;
        }
        abs?
    };

    if start >= data.len() {
        return None;
    }

    let end_rel = data[start..].iter().position(|b| *b == 0)?;
    let end = start + end_rel;
    Some(String::from_utf8_lossy(&data[start..end]).to_string())
}

#[derive(Debug, Clone)]
struct SpellDumpEntry {
    id: u32,
    name: String,
    rank: Option<String>,
    desc: Option<String>,
    tooltip: Option<String>,
    family: Option<u32>,
}

fn write_spell_dump(path: &Path, header_line: &str, spells: &[SpellDumpEntry]) -> Result<(), CascError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut f = fs::File::create(path)?;
    writeln!(f, "{header_line}\r")?;

    for spell in spells {
        writeln!(
            f,
            "Name             : {} (id={})\r",
            spell.name, spell.id
        )?;
        if let Some(rank) = &spell.rank {
            if !rank.is_empty() {
                writeln!(f, "Rank             : {}\r", rank)?;
            }
        }
        if let Some(desc) = &spell.desc {
            if !desc.is_empty() {
                writeln!(f, "Description      : {}\r", desc)?;
            }
        }
        if let Some(tt) = &spell.tooltip {
            if !tt.is_empty() {
                writeln!(f, "Tooltip          : {}\r", tt)?;
            }
        }
        writeln!(f, "\r")?;
    }

    Ok(())
}

pub fn run_spell_data_dump(storage: &CascStorage) -> Result<(), CascError> {
    let out_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")))
        .join("SpellDataDump");
    fs::create_dir_all(&out_dir)?;

    let (format_path, formats) = crate::simc_formats::load_formats_for_build(&storage.config.build_name)?;
    logger::info(
        "SPELLDUMP",
        format!(
            "using SimC formats={} (build={})",
            format_path.display(),
            storage.config.build_name
        ),
    );

    let (spell_name_bytes, spell_name_meta) =
        load_wdc5_by_name(storage, "DBFilesClient\\SpellName.db2")?;
    let spell_name_schema = formats.get("SpellName").ok_or(CascError::InvalidConfig)?;
    let name_col = field_index(spell_name_schema, "name").ok_or(CascError::InvalidConfig)?;

    let (spell_bytes, spell_meta) = load_wdc5_by_name(storage, "DBFilesClient\\Spell.db2")?;
    let spell_schema = formats.get("Spell").ok_or(CascError::InvalidConfig)?;
    let rank_col = field_index(spell_schema, "rank").ok_or(CascError::InvalidConfig)?;
    let desc_col = field_index(spell_schema, "desc").ok_or(CascError::InvalidConfig)?;
    let tt_col = field_index(spell_schema, "tt").ok_or(CascError::InvalidConfig)?;

    let (_sco_bytes, sco_meta) = load_wdc5_by_name(storage, "DBFilesClient\\SpellClassOptions.db2")?;
    let sco_schema = formats
        .get("SpellClassOptions")
        .ok_or(CascError::InvalidConfig)?;
    let id_spell_col = field_index(sco_schema, "id_spell").ok_or(CascError::InvalidConfig)?;
    let family_col = field_index(sco_schema, "family").ok_or(CascError::InvalidConfig)?;

    let mut names: HashMap<u32, String> = HashMap::new();
    for section in &spell_name_meta.sections {
        for record_idx in 0..section.num_records.max(0) as usize {
            let record_id = *section.record_ids.get(record_idx).unwrap_or(&0);
            if record_id <= 0 {
                continue;
            }
            if let Some(name) = decode_string(
                &spell_name_bytes,
                &spell_name_meta,
                section,
                record_idx,
                record_id,
                name_col,
            ) {
                names.insert(record_id as u32, name);
            }
        }
    }
    logger::info("SPELLDUMP", format!("loaded SpellName rows={}", names.len()));

    let mut spell_text: HashMap<u32, (Option<String>, Option<String>, Option<String>)> = HashMap::new();
    for section in &spell_meta.sections {
        for record_idx in 0..section.num_records.max(0) as usize {
            let record_id = *section.record_ids.get(record_idx).unwrap_or(&0);
            if record_id <= 0 {
                continue;
            }
            let rank = decode_string(&spell_bytes, &spell_meta, section, record_idx, record_id, rank_col);
            let desc = decode_string(&spell_bytes, &spell_meta, section, record_idx, record_id, desc_col);
            let tt = decode_string(&spell_bytes, &spell_meta, section, record_idx, record_id, tt_col);
            spell_text.insert(record_id as u32, (rank, desc, tt));
        }
    }
    logger::info("SPELLDUMP", format!("loaded Spell rows={}", spell_text.len()));

    let mut spell_family: HashMap<u32, u32> = HashMap::new();
    for section in &sco_meta.sections {
        for record_idx in 0..section.num_records.max(0) as usize {
            let record_id = *section.record_ids.get(record_idx).unwrap_or(&0);
            if record_id <= 0 {
                continue;
            }
            let spell_id = decode_u32(&sco_meta, section, record_idx, record_id, id_spell_col)
                .unwrap_or(0);
            let family = decode_u32(&sco_meta, section, record_idx, record_id, family_col)
                .unwrap_or(0);
            if spell_id != 0 && family != 0 {
                spell_family.insert(spell_id, family);
            }
        }
    }
    logger::info(
        "SPELLDUMP",
        format!("loaded SpellClassOptions rows={}", spell_family.len()),
    );

    let mut all: BTreeMap<u32, SpellDumpEntry> = BTreeMap::new();
    for (id, name) in &names {
        let (rank, desc, tooltip) = spell_text.get(id).cloned().unwrap_or((None, None, None));
        let family = spell_family.get(id).copied();
        all.insert(
            *id,
            SpellDumpEntry {
                id: *id,
                name: name.clone(),
                rank,
                desc,
                tooltip,
                family,
            },
        );
    }

    let header = format!(
        "PvP-Scalpel SpellDataDump for World of Warcraft {} Live",
        storage.config.build_name
    );

    let all_vec: Vec<SpellDumpEntry> = all.values().cloned().collect();
    write_spell_dump(&out_dir.join("allspells.txt"), &header, &all_vec)?;

    let classes: [(&str, u32); 13] = [
        ("warrior", 4),
        ("paladin", 10),
        ("hunter", 9),
        ("rogue", 8),
        ("priest", 6),
        ("deathknight", 15),
        ("shaman", 11),
        ("mage", 3),
        ("warlock", 5),
        ("monk", 53),
        ("druid", 7),
        ("demonhunter", 107),
        ("evoker", 224),
    ];

    let mut in_class: HashSet<u32> = HashSet::new();
    for (file, fam) in classes {
        let class_spells: Vec<SpellDumpEntry> = all
            .values()
            .filter(|s| s.family == Some(fam))
            .cloned()
            .collect();
        for s in &class_spells {
            in_class.insert(s.id);
        }
        write_spell_dump(&out_dir.join(format!("{file}.txt")), &header, &class_spells)?;
    }

    let nonclass: Vec<SpellDumpEntry> = all
        .values()
        .filter(|s| !in_class.contains(&s.id))
        .cloned()
        .collect();
    write_spell_dump(&out_dir.join("nonclass.txt"), &header, &nonclass)?;

    fs::write(out_dir.join("build_info.txt"), format!("{header}\r\n"))?;
    fs::write(out_dir.join("bonus_ids.txt"), format!("{header}\r\n"))?;

    logger::info("SPELLDUMP", format!("wrote dumps to {}", out_dir.display()));
    Ok(())
}
