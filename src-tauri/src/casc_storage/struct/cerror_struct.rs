#[derive(thiserror::Error, Debug)]
pub enum CascError {
    #[error("file not found")]
    FileNotFound,

    #[error("invalid blte format")]
    InvalidBlte,

    #[error("missing encoding entry")]
    MissingEncoding,

    #[error("io error")]
    Io(#[from] std::io::Error),
}
