#![allow(dead_code)]

pub fn read_string(data: &[u8], offset: u32) -> Option<String> {
    let start = offset as usize;
    let slice = data.get(start..)?;
    let end = slice.iter().position(|&b| b == 0).unwrap_or(slice.len());
    let bytes = slice.get(0..end)?;
    Some(String::from_utf8_lossy(bytes).to_string())
}
