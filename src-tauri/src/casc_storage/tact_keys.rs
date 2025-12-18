use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::casc_storage::storage::{read_file_by_filedataid, CascStorage};
use crate::casc_storage::types::CascError;
use crate::logger;

const TACTKEY_FILEDATA_ID: u32 = 1_302_850;
const TACTKEYLOOKUP_FILEDATA_ID: u32 = 1_302_851;

const WOWSTATIC_MARKER: &[u8] = b"WOWSTATIC_";

pub fn seed_keys_from_tact_tables(storage: &CascStorage) -> Result<usize, CascError> {
    let tactkey_bytes = read_tact_db2(storage, TACTKEY_FILEDATA_ID, "tactkey.db2")?;
    let lookup_bytes = read_tact_db2(storage, TACTKEYLOOKUP_FILEDATA_ID, "tactkeylookup.db2")?;

    let tactkey_payload = wowstatic_payload(&tactkey_bytes, "TactKey.db2")?;
    let lookup_payload = wowstatic_payload(&lookup_bytes, "TactKeyLookup.db2")?;

    let tact_keys_by_id = parse_tactkey_payload(tactkey_payload)?;
    let lookup = parse_tactkeylookup_payload(lookup_payload, &tact_keys_by_id)?;
    let lookup_total = lookup.len();

    let mut resolved: Vec<(u64, [u8; 16], u32)> = Vec::new();
    for (key_name, tact_id) in lookup {
        if let Some(key) = tact_keys_by_id.get(&tact_id).copied() {
            resolved.push((key_name, key, tact_id));
        }
    }

    logger::info(
        "TACTKEY",
        format!(
            "parsed tact tables: tact_ids={} lookups={} resolved={}",
            tact_keys_by_id.len(),
            lookup_total,
            resolved.len()
        ),
    );

    let inserted = {
        let mut keys = storage.keys.lock().unwrap();
        let mut inserted = 0usize;
        let mut unchanged = 0usize;
        for (key_name, key, _) in &resolved {
            if keys.insert_key(*key_name, *key) {
                inserted += 1;
            } else {
                unchanged += 1;
            }
        }
        (inserted, unchanged)
    };

    logger::info(
        "TACTKEY",
        format!(
            "inserted resolved keys into KeyService: {} (unchanged={})",
            inserted.0, inserted.1
        ),
    );

    write_resolved_keyring(&resolved)?;

    Ok(inserted.0)
}

fn read_tact_db2(storage: &CascStorage, file_data_id: u32, debug_name: &str) -> Result<Vec<u8>, CascError> {
    match read_file_by_filedataid(storage, file_data_id) {
        Ok(bytes) => Ok(bytes),
        Err(e) => {
            logger::warn(
                "TACTKEY",
                format!("read_file_by_filedataid failed for {} ({file_data_id}): {e}", debug_name),
            );
            let local = local_debug_inputs_path(debug_name);
            let bytes = fs::read(&local)?;
            logger::warn(
                "TACTKEY",
                format!("falling back to debug_inputs: {}", local.display()),
            );
            Ok(bytes)
        }
    }
}

fn local_debug_inputs_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("src")
        .join("casc_storage")
        .join("debug_inputs")
        .join("dbfilesclient")
        .join(name)
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")))
        .to_path_buf()
}

fn wowstatic_payload<'a>(bytes: &'a [u8], table: &str) -> Result<&'a [u8], CascError> {
    const BUILD_STRING_OFF: usize = 8;
    const BUILD_STRING_LEN: usize = 128;
    if bytes.len() < BUILD_STRING_OFF + BUILD_STRING_LEN {
        return Err(CascError::InvalidConfig);
    }
    let build = &bytes[BUILD_STRING_OFF..BUILD_STRING_OFF + BUILD_STRING_LEN];
    if !build.windows(WOWSTATIC_MARKER.len()).any(|w| w == WOWSTATIC_MARKER) {
        logger::warn("TACTKEY", format!("{table} missing WOWSTATIC marker"));
        return Err(CascError::InvalidConfig);
    }
    Ok(&bytes[BUILD_STRING_OFF + BUILD_STRING_LEN..])
}

fn parse_tactkey_payload(payload: &[u8]) -> Result<HashMap<u32, [u8; 16]>, CascError> {
    let (header_off, record_count) = find_static_header(payload, 16)?;
    let record_count = usize::try_from(record_count).map_err(|_| CascError::InvalidConfig)?;
    let id_table_start = find_tactkey_id_table(payload, header_off, record_count)
        .ok_or(CascError::InvalidConfig)?;

    let key_blob_len = record_count.checked_mul(16).ok_or(CascError::InvalidConfig)?;
    if id_table_start < key_blob_len {
        return Err(CascError::InvalidConfig);
    }
    let key_blob_start = id_table_start - key_blob_len;

    let mut map: HashMap<u32, [u8; 16]> = HashMap::with_capacity(record_count);
    for i in 0..record_count {
        let v = read_u32_le(payload, id_table_start + i * 4)?;
        let tact_id = v >> 16;
        let off = key_blob_start + i * 16;
        let key = payload.get(off..off + 16).ok_or(CascError::InvalidConfig)?;
        let mut arr = [0u8; 16];
        arr.copy_from_slice(key);
        map.insert(tact_id, arr);
    }
    Ok(map)
}

fn parse_tactkeylookup_payload(
    payload: &[u8],
    tact_keys_by_id: &HashMap<u32, [u8; 16]>,
) -> Result<HashMap<u64, u32>, CascError> {
    let (header_off, record_count) = find_static_header(payload, 8)?;
    let header_count = usize::try_from(record_count).map_err(|_| CascError::InvalidConfig)?;

    // Locate the ID table using the header-provided count first; then consider that some builds
    // include a footer/sentinel that shifts the effective count for the keyName blob by 1.
    let (table_start, id_shift) = match find_tactkeylookup_id_table(payload, header_off, header_count) {
        Some(v) => v,
        None => find_tactkeylookup_id_table(payload, header_off, header_count.saturating_sub(1))
            .ok_or(CascError::InvalidConfig)?,
    };

    // Some builds include an extra 8-byte sentinel before the keyName blob, which makes the
    // header "record_count" off-by-one for pairing keyName[i] with tactId[i]. Try both and pick
    // the one that matches known keyName->key pairs (CASCExplorer/SimC).
    let candidates = [header_count, header_count.saturating_sub(1)]
        .into_iter()
        .filter(|c| *c > 0)
        .collect::<Vec<_>>();

    let mut best: Option<(usize, usize, HashMap<u64, u32>)> = None; // (score, count, map)

    for count in candidates {
        let map = match parse_tactkeylookup_payload_with_count(payload, table_start, id_shift, count) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let score = score_lookup_candidate(&map, tact_keys_by_id);
        match &best {
            None => best = Some((score, count, map)),
            Some((best_score, _best_count, _)) if score > *best_score => {
                best = Some((score, count, map));
            }
            Some((best_score, best_count, _)) if score == *best_score && count > *best_count => {
                // Prefer larger count on ties.
                best = Some((score, count, map));
            }
            _ => {}
        }
    }

    let Some((_score, chosen_count, chosen)) = best else {
        return Err(CascError::InvalidConfig);
    };

    if chosen_count != header_count {
        logger::debug(
            "TACTKEY",
            format!("TactKeyLookup count adjusted: header_count={} chosen_count={}", header_count, chosen_count),
        );
    }

    Ok(chosen)
}

fn parse_tactkeylookup_payload_with_count(
    payload: &[u8],
    table_start: usize,
    id_shift: u32,
    record_count: usize,
) -> Result<HashMap<u64, u32>, CascError> {
    let keynames_len = record_count.checked_mul(8).ok_or(CascError::InvalidConfig)?;
    if table_start < keynames_len {
        return Err(CascError::InvalidConfig);
    }
    let keynames_start = table_start - keynames_len;

    let mut map: HashMap<u64, u32> = HashMap::with_capacity(record_count);
    for i in 0..record_count {
        let key_name = read_u64_le(payload, keynames_start + i * 8)?;
        let v = read_u32_le(payload, table_start + i * 4)?;
        let tact_id = v >> id_shift;
        map.insert(key_name, tact_id);
    }
    Ok(map)
}

fn score_lookup_candidate(lookup: &HashMap<u64, u32>, tact_keys_by_id: &HashMap<u32, [u8; 16]>) -> usize {
    // These pairs are stable across tools and let us validate alignment without hardcoding offsets.
    // Format: (keyName, expected AES key hex).
    const PROBES: &[(u64, &str)] = &[
        (0xFA505078126ACB3E, "BDC51862ABED79B2DE48C8E7E66C6200"),
        (0xE2854509C471C554, "433265F0CDEB2F4E65C0EE7008714D9E"),
        (0x5813810F4EC9B005, "01BE8B43142DD99A9E690FAD288B6082"),
        (0x7F9E217166ED43EA, "05FC927B9F4F5B05568142912A052B0F"),
    ];

    let mut score = 0usize;
    for (key_name, expected_hex) in PROBES {
        let Some(tact_id) = lookup.get(key_name) else {
            continue;
        };
        let Some(actual) = tact_keys_by_id.get(tact_id) else {
            continue;
        };
        if let Ok(expected) = hex::decode(expected_hex) {
            if expected.len() == 16 && expected.as_slice() == actual.as_slice() {
                score += 1;
            }
        }
    }
    score
}

fn find_static_header(payload: &[u8], expected_key_size: u32) -> Result<(usize, u32), CascError> {
    // Scan for 4 LE u32 values: (record_count, unk1, key_size, unk2)
    // We use record_count/key_size as primary discriminators.
    for off in (0..payload.len().saturating_sub(16)).step_by(4) {
        let record_count = read_u32_le(payload, off)?;
        let unk1 = read_u32_le(payload, off + 4)?;
        let key_size = read_u32_le(payload, off + 8)?;
        let unk2 = read_u32_le(payload, off + 12)?;

        let sane_count = (1..100_000).contains(&record_count);
        let sane_unk = unk1 > 0 && unk1 < 0x100 && unk2 < 0x1_0000;
        if sane_count && sane_unk && key_size == expected_key_size {
            return Ok((off, record_count));
        }
    }
    Err(CascError::InvalidConfig)
}

fn find_tactkey_id_table(payload: &[u8], min_offset: usize, record_count: usize) -> Option<usize> {
    let table_len = record_count.checked_mul(4)?;
    if payload.len() < table_len {
        return None;
    }
    let max_start = payload.len() - table_len;
    let mut start = max_start - (max_start % 4);
    loop {
        if start < min_offset {
            break;
        }
        let mut prev_id = 0u32;
        let mut ok = true;
        for i in 0..record_count {
            let v = read_u32_le(payload, start + i * 4).ok()?;
            if (v & 0xFFFF) != 0 {
                ok = false;
                break;
            }
            let id = v >> 16;
            if id == 0 || id > 5_000_000 {
                ok = false;
                break;
            }
            if i > 0 && id < prev_id {
                ok = false;
                break;
            }
            prev_id = id;
        }
        if ok {
            return Some(start);
        }
        if start < 4 {
            break;
        }
        start -= 4;
    }
    None
}

fn find_tactkeylookup_id_table(payload: &[u8], min_offset: usize, record_count: usize) -> Option<(usize, u32)> {
    // Prefer the CASCExplorer-expected encoding (id << 24), but newer builds appear to use (id << 16).
    if let Some(start) = find_tactkeylookup_id_table_shift24(payload, min_offset, record_count) {
        return Some((start, 24));
    }
    if let Some(start) = find_tactkeylookup_id_table_shift16(payload, min_offset, record_count) {
        return Some((start, 16));
    }
    None
}

fn find_tactkeylookup_id_table_shift24(payload: &[u8], min_offset: usize, record_count: usize) -> Option<usize> {
    let table_len = record_count.checked_mul(4)?;
    if payload.len() < table_len {
        return None;
    }
    let max_start = payload.len() - table_len;
    let mut start = max_start - (max_start % 4);
    loop {
        if start < min_offset {
            break;
        }
        let mut prev_id = 0u32;
        let mut ok = true;
        for i in 0..record_count {
            let v = read_u32_le(payload, start + i * 4).ok()?;
            if (v & 0x00FF_FFFF) != 0 {
                ok = false;
                break;
            }
            let id = v >> 24;
            if id > 100_000 {
                ok = false;
                break;
            }
            if i > 0 && id < prev_id {
                ok = false;
                break;
            }
            prev_id = id;
        }
        if ok {
            return Some(start);
        }
        if start < 4 {
            break;
        }
        start -= 4;
    }
    None
}

fn find_tactkeylookup_id_table_shift16(payload: &[u8], min_offset: usize, record_count: usize) -> Option<usize> {
    let table_len = record_count.checked_mul(4)?;
    if payload.len() < table_len {
        return None;
    }
    let max_start = payload.len() - table_len;
    let mut start = max_start - (max_start % 4);
    loop {
        if start < min_offset {
            break;
        }
        let mut prev_id = 0u32;
        let mut ok = true;
        for i in 0..record_count {
            let v = read_u32_le(payload, start + i * 4).ok()?;
            if (v & 0xFFFF) != 0 {
                ok = false;
                break;
            }
            let id = v >> 16;
            if id > 5_000_000 {
                ok = false;
                break;
            }
            if i > 0 && id < prev_id {
                ok = false;
                break;
            }
            prev_id = id;
        }
        if ok {
            return Some(start);
        }
        if start < 4 {
            break;
        }
        start -= 4;
    }
    None
}

fn write_resolved_keyring(resolved: &[(u64, [u8; 16], u32)]) -> Result<(), CascError> {
    let base = repo_root().join("debug_inputs").join("tactkeys");
    fs::create_dir_all(&base)?;
    let path = base.join("resolved_keyring.txt");

    let mut lines: Vec<String> = resolved
        .iter()
        .map(|(key_name, key, tact_id)| {
            format!(
                "{:016X}:{}:{}",
                key_name,
                hex::encode_upper(key),
                tact_id
            )
        })
        .collect();
    lines.sort();
    fs::write(&path, lines.join("\n"))?;
    logger::info("TACTKEY", format!("wrote {}", path.display()));
    Ok(())
}

fn read_u32_le(data: &[u8], offset: usize) -> Result<u32, CascError> {
    let slice = data.get(offset..offset + 4).ok_or(CascError::InvalidConfig)?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn read_u64_le(data: &[u8], offset: usize) -> Result<u64, CascError> {
    let slice = data.get(offset..offset + 8).ok_or(CascError::InvalidConfig)?;
    Ok(u64::from_le_bytes([
        slice[0], slice[1], slice[2], slice[3], slice[4], slice[5], slice[6], slice[7],
    ]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tact_tables_from_debug_inputs() {
        let tactkey_bytes = fs::read(local_debug_inputs_path("tactkey.db2")).unwrap();
        let lookup_bytes = fs::read(local_debug_inputs_path("tactkeylookup.db2")).unwrap();

        let tactkey_payload = wowstatic_payload(&tactkey_bytes, "TactKey.db2").unwrap();
        let lookup_payload = wowstatic_payload(&lookup_bytes, "TactKeyLookup.db2").unwrap();

        let tact_keys_by_id = parse_tactkey_payload(tactkey_payload).unwrap();
        let lookup = parse_tactkeylookup_payload(lookup_payload, &tact_keys_by_id).unwrap();

        assert!(tact_keys_by_id.len() > 0);
        assert!(lookup.len() > 0);

        let key_name = 0xFA505078126ACB3E;
        let tact_id = lookup[&key_name];
        assert_eq!(tact_id, 15);
        let key = tact_keys_by_id.get(&tact_id).unwrap();
        assert_eq!(hex::encode_upper(key), "BDC51862ABED79B2DE48C8E7E66C6200");
    }
}
