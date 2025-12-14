pub struct CascStorage {
    pub product: String,               // "wow"
    pub root_path: std::path::PathBuf,  // _retail_ folder

    pub config: CascConfig,
    pub encoding: EncodingTable,
    pub index: IndexStore,
    pub root: WowRoot,

    pub listfile: Option<ListFile>,     // optional but VERY useful
}
