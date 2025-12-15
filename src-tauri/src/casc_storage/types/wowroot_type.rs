pub struct WowRoot {
    pub entries: std::collections::HashMap<
        FileDataId,
        RootEntry
    >,
}
use crate::casc_storage::types::et_type::ContentKey;
pub struct RootEntry {
    pub content_key: ContentKey,
    pub flags: u32,
    pub locale_mask: u32,
}

#[derive(Clone, Copy, Hash, Eq, PartialEq)]
pub struct FileDataId(pub u32);

pub struct ListFile {
    pub by_path: std::collections::HashMap<String, FileDataId>,
    pub by_id: std::collections::HashMap<FileDataId, String>,
}
