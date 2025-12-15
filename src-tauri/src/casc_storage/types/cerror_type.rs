use std::fmt;

#[derive(Debug)]
pub enum CascError {
    InvalidBlte,
    MissingEncoding,
    Unimplemented,
    FileNotFound,
    Io(std::io::Error),
}

impl fmt::Display for CascError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CascError::InvalidBlte =>
                write!(f, "invalid blte format"),
            CascError::MissingEncoding =>
                write!(f, "missing encoding entry"),
            CascError::Unimplemented =>
                write!(f, "not implemented"),
            CascError::Io(err) =>
                write!(f, "io error: {}", err),
            CascError::FileNotFound =>
                write!(f, "file not found"),
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
