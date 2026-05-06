use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum ScriptzError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("pool: {0}")]
    Pool(#[from] r2d2::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("http: {0}")]
    Http(String),
    #[error("ai: {0}")]
    Ai(String),
    #[error("{0}")]
    Other(String),
}

impl From<reqwest::Error> for ScriptzError {
    fn from(e: reqwest::Error) -> Self {
        ScriptzError::Http(e.to_string())
    }
}

impl From<keyring::Error> for ScriptzError {
    fn from(e: keyring::Error) -> Self {
        ScriptzError::Other(format!("keychain: {e}"))
    }
}

impl Serialize for ScriptzError {
    fn serialize<S>(&self, s: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, ScriptzError>;
