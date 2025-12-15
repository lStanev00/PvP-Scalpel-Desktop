use std::path::PathBuf;
use crate::casc_storage::structs::FileDataId;
use crate::casc_storage::structs::FileDataId;

impl CascStorage {
    pub fn open(path: impl Into<PathBuf>) -> Result<Self, CascError>;

    pub fn read_file_by_id(
        &self,
        id: FileDataId
    ) -> Result<Vec<u8>, CascError>;

    pub fn read_file_by_path(
        &self,
        path: &str
    ) -> Result<Vec<u8>, CascError>;
}
