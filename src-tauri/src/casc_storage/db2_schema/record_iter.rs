#![allow(dead_code)]

use crate::casc_storage::db2::Db2Section;

pub struct SectionRecordIter<'a> {
    data: &'a [u8],
    pos: usize,
    end: usize,
    size: usize,
}

pub fn iter_section_records<'a>(
    data: &'a [u8],
    section: &Db2Section,
    record_size: usize,
) -> SectionRecordIter<'a> {
    let start = section.data_offset as usize;
    let end = start.saturating_add(section.data_size as usize).min(data.len());
    SectionRecordIter {
        data,
        pos: start,
        end,
        size: record_size,
    }
}

impl<'a> Iterator for SectionRecordIter<'a> {
    type Item = &'a [u8];

    fn next(&mut self) -> Option<Self::Item> {
        if self.size == 0 {
            return None;
        }
        if self.pos >= self.end {
            return None;
        }
        let next = self.pos.saturating_add(self.size);
        if next > self.end {
            return None;
        }
        let slice = self.data.get(self.pos..next)?;
        self.pos = next;
        Some(slice)
    }
}
