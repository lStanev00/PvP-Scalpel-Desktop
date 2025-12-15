use std::path::PathBuf;
use crate::casc_storage::types::*;

pub struct CascStorage { // ./types/cs_types.rs <= 
    // pub product: String,               // "wow"
    pub root_path: std::path::PathBuf,  // _retail_ folder

    pub config: CascConfig,
    // pub encoding: EncodingTable,
    // pub index: IndexStore,
    // pub root: WowRoot,

    // pub listfile: Option<ListFile>,     // optional but VERY useful
}

impl CascStorage {
    pub fn open(path: impl Into<PathBuf>) -> Result<Self, CascError> {
        let root_path = path.into();

        if !root_path.exists() {
            return Err(CascError::FileNotFound);
        }

        let config = crate::casc_storage::config::load_config(&root_path)?;

        Ok(Self {
            root_path,
            config,
        })
    }
}
