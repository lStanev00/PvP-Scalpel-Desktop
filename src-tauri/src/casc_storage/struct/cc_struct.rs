pub struct CascConfig {
    pub build_name: String,
    pub build_key: [u8; 16],
    pub cdn_key: [u8; 16],

    pub archives: Vec<String>,          // archive names
    pub cdn_hosts: Vec<String>,          // optional online access

    pub encoding_hash: [u8; 16],
    pub root_hash: [u8; 16],
}
