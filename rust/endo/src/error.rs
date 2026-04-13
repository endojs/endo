use std::fmt;
use std::io;

#[derive(Debug)]
pub enum EndoError {
    Io(io::Error),
    Config(String),
    Timeout(String),
    NotRunning,
}

impl fmt::Display for EndoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EndoError::Io(e) => write!(f, "{e}"),
            EndoError::Config(msg) => write!(f, "{msg}"),
            EndoError::Timeout(msg) => write!(f, "{msg}"),
            EndoError::NotRunning => {
                write!(f, "endor is not running (start with: endor start)")
            }
        }
    }
}

impl std::error::Error for EndoError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            EndoError::Io(e) => Some(e),
            _ => None,
        }
    }
}

impl From<io::Error> for EndoError {
    fn from(e: io::Error) -> Self {
        EndoError::Io(e)
    }
}
