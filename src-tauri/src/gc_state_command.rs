use std::collections::BTreeSet;
use std::fs;

fn find_gc_table_range(content: &str) -> Option<(usize, usize)> {
    let start_idx = content.find("PvP_Scalpel_GC")?;
    let bytes = content.as_bytes();
    let mut eq_idx = start_idx;
    while eq_idx < bytes.len() && bytes[eq_idx] != b'=' {
        eq_idx += 1;
    }
    if eq_idx >= bytes.len() {
        return None;
    }

    let mut i = eq_idx + 1;
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    if i >= bytes.len() || bytes[i] != b'{' {
        return None;
    }

    let table_start = i;
    let mut depth: i32 = 0;
    let mut in_string = false;
    let mut quote = b'"';
    let mut escaped = false;
    let mut in_comment = false;

    let mut j = i;
    while j < bytes.len() {
        let ch = bytes[j];
        let next = if j + 1 < bytes.len() { bytes[j + 1] } else { 0 };

        if in_comment {
            if ch == b'\n' {
                in_comment = false;
            }
            j += 1;
            continue;
        }

        if in_string {
            if escaped {
                escaped = false;
                j += 1;
                continue;
            }
            if ch == b'\\' {
                escaped = true;
                j += 1;
                continue;
            }
            if ch == quote {
                in_string = false;
            }
            j += 1;
            continue;
        }

        if ch == b'-' && next == b'-' {
            in_comment = true;
            j += 2;
            continue;
        }

        if ch == b'"' || ch == b'\'' {
            in_string = true;
            quote = ch;
            j += 1;
            continue;
        }

        if ch == b'{' {
            depth += 1;
        } else if ch == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some((table_start, j + 1));
            }
        }

        j += 1;
    }

    None
}

fn replace_gc_value(table: &mut String, key: &str, value: &str) {
    let variants = [format!("[\"{}\"]", key), format!("['{}']", key)];
    for marker in variants {
        if let Some(pos) = table.find(&marker) {
            let after = pos + marker.len();
            if let Some(eq_rel) = table[after..].find('=') {
                let eq_pos = after + eq_rel;
                let mut val_start = eq_pos + 1;
                let bytes = table.as_bytes();
                while val_start < bytes.len() && bytes[val_start].is_ascii_whitespace() {
                    val_start += 1;
                }
                if val_start >= bytes.len() {
                    break;
                }

                let quoted = bytes[val_start] == b'"' || bytes[val_start] == b'\'';
                if quoted {
                    let quote = bytes[val_start];
                    let mut k = val_start + 1;
                    let mut escaped = false;
                    while k < bytes.len() {
                        let ch = bytes[k];
                        if escaped {
                            escaped = false;
                            k += 1;
                            continue;
                        }
                        if ch == b'\\' {
                            escaped = true;
                            k += 1;
                            continue;
                        }
                        if ch == quote {
                            let replacement = format!("\"{}\"", value);
                            table.replace_range(val_start..=k, &replacement);
                            return;
                        }
                        k += 1;
                    }
                } else {
                    let mut k = val_start;
                    while k < bytes.len()
                        && bytes[k] != b','
                        && bytes[k] != b'\n'
                        && bytes[k] != b'\r'
                        && bytes[k] != b'}'
                    {
                        k += 1;
                    }
                    let replacement = format!("\"{}\"", value);
                    table.replace_range(val_start..k, &replacement);
                    return;
                }
            }
        }
    }

    if let Some(end) = table.rfind('}') {
        let line = format!("  [\"{}\"] = \"{}\",\n", key, value);
        table.insert_str(end, &line);
    }
}

#[tauri::command]
pub fn mark_gc_matches_synced(path: String, keys: Vec<String>) -> Result<usize, String> {
    if keys.is_empty() {
        return Ok(0);
    }

    let mut unique = BTreeSet::new();
    keys.into_iter()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .for_each(|v| {
            unique.insert(v);
        });
    if unique.is_empty() {
        return Ok(0);
    }

    let mut content =
        fs::read_to_string(&path).map_err(|e| format!("Failed reading SavedVariables: {e}"))?;
    let (start, end) = find_gc_table_range(&content)
        .ok_or_else(|| "Failed locating PvP_Scalpel_GC table".to_string())?;

    let mut table = content[start..end].to_string();
    unique
        .iter()
        .for_each(|key| replace_gc_value(&mut table, key, "synced"));

    content.replace_range(start..end, &table);
    fs::write(&path, content).map_err(|e| format!("Failed writing SavedVariables: {e}"))?;

    Ok(unique.len())
}
