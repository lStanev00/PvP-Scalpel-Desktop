#[allow(dead_code)]
pub struct CascConfig {
    pub build_name: String,
    pub root_hash: [u8; 16],

    pub encoding_ckey: [u8; 16],
    pub encoding_ekey: [u8; 16],

    pub archives: Vec<String>,
    pub cdn_hosts: Vec<String>,
    pub cdn_path: String,
    pub build_key: [u8; 16],
    pub cdn_key: [u8; 16],
}
