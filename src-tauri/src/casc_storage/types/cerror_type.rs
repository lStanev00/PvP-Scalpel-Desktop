use std::fmt;

#[allow(dead_code)]
#[derive(Debug)]
pub enum CascError {
    InvalidBlte,
    MissingEncoding,
    Unimplemented,
    FileNotFound,
    InvalidConfig,
    InvalidHex,
    Io(std::io::Error),
    MissingDecryptionKey(u64),
}

impl fmt::Display for CascError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CascError::InvalidBlte =>
                write!(f, "invalid blte format"),
            CascError::MissingEncoding =>
                write!(f, "missing encoding entry"),
            CascError::FileNotFound =>
                write!(f, "file not found"),
            CascError::InvalidConfig =>
                write!(f, "invalid config file"),
            CascError::Unimplemented =>
                write!(f, "not implemented"),
            CascError::Io(err) =>
                write!(f, "io error: {}", err),
            CascError::InvalidHex =>
                write!(f, "invalid hex string"),
            CascError::MissingDecryptionKey(k) =>
                write!(f, "missing decryption key {:016x}", k),
        }
    }
}



impl std::error::Error for CascError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            CascError::Io(err) => Some(err),
            _ => None,
        }
    }
}

impl From<std::io::Error> for CascError {
    fn from(err: std::io::Error) -> Self {
        CascError::Io(err)
    }
}

impl From<hex::FromHexError> for CascError {
    fn from(_: hex::FromHexError) -> Self {
        CascError::InvalidHex
    }
}
