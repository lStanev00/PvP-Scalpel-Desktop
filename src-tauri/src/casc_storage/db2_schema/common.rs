#![allow(dead_code)]

pub fn read_u16_le(input: &[u8], offset: usize) -> Option<u16> {
    let b = input.get(offset..offset + 2)?;
    Some(u16::from_le_bytes([b[0], b[1]]))
}

pub fn read_u32_le(input: &[u8], offset: usize) -> Option<u32> {
    let b = input.get(offset..offset + 4)?;
    Some(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

pub fn read_i32_le(input: &[u8], offset: usize) -> Option<i32> {
    read_u32_le(input, offset).map(|v| v as i32)
}
