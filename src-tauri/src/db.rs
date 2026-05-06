use crate::error::Result;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::path::Path;
use std::sync::Arc;

pub type DbPool = Pool<SqliteConnectionManager>;

#[derive(Clone)]
pub struct Db {
    pub pool: Arc<DbPool>,
}

impl Db {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Bootstrap pass: page_size + WAL on a single connection before the
        // r2d2 pool spawns parallel workers.
        {
            let bootstrap = Connection::open(&path)?;
            bootstrap.busy_timeout(std::time::Duration::from_secs(5))?;
            let current_page_size: i64 =
                bootstrap.query_row("PRAGMA page_size", [], |r| r.get(0))?;
            if current_page_size != 8192 {
                bootstrap.pragma_update(None, "journal_mode", "DELETE")?;
                bootstrap.execute_batch("PRAGMA page_size = 8192; VACUUM;")?;
            }
            bootstrap.pragma_update(None, "journal_mode", "WAL")?;
        }

        let manager = SqliteConnectionManager::file(&path).with_init(|c| {
            c.busy_timeout(std::time::Duration::from_secs(5))?;
            c.execute_batch(
                "PRAGMA synchronous=NORMAL;
                 PRAGMA foreign_keys=ON;
                 PRAGMA temp_store=MEMORY;
                 PRAGMA mmap_size=268435456;
                 PRAGMA cache_size=-65536;
                 PRAGMA wal_autocheckpoint=1000;
                 PRAGMA journal_size_limit=67108864;
                 PRAGMA cache_spill=0;",
            )
        });
        let pool = Pool::builder().max_size(8).build(manager)?;

        let db = Self { pool: Arc::new(pool) };
        db.migrate()?;
        Ok(db)
    }

    pub fn conn(&self) -> Result<r2d2::PooledConnection<SqliteConnectionManager>> {
        Ok(self.pool.get()?)
    }

    fn migrate(&self) -> Result<()> {
        let mut conn = self.conn()?;
        let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;

        // Schema v2: simplified — projects/tags/aliases/global characters all dropped.
        // Migration v2 wipes any older v1 schema and recreates fresh (per spec: full reset).
        let migrations: &[(i64, &str)] = &[(2, MIGRATION_002)];
        let tx = conn.transaction()?;
        for (version, sql) in migrations {
            if *version > current {
                tracing::info!("applying migration v{}", version);
                tx.execute_batch(sql)?;
                tx.execute_batch(&format!("PRAGMA user_version = {}", version))?;
            }
        }
        tx.commit()?;
        Ok(())
    }
}

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

const MIGRATION_002: &str = r#"
-- Wipe any prior v1 schema. Idempotent: IF EXISTS guards a fresh DB too.
DROP TABLE IF EXISTS scripts_fts;
DROP TABLE IF EXISTS characters_fts;
DROP TABLE IF EXISTS snapshots;
DROP TABLE IF EXISTS script_tags;
DROP TABLE IF EXISTS script_characters;
DROP TABLE IF EXISTS character_tags;
DROP TABLE IF EXISTS character_aliases;
DROP TABLE IF EXISTS characters;
DROP TABLE IF EXISTS scripts;
DROP TABLE IF EXISTS projects;

-- Scripts
CREATE TABLE scripts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Unbenannt',
  highlighting_enabled INTEGER, -- NULL = global default, 0/1 = override
  content_json TEXT NOT NULL,
  characters_meta TEXT NOT NULL DEFAULT '[]', -- JSON array of {name, color}
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER,
  page_count INTEGER NOT NULL DEFAULT 1
);

-- Snapshots (versioning)
CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  content_json TEXT NOT NULL,
  trigger TEXT NOT NULL, -- 'auto' | 'manual'
  created_at INTEGER NOT NULL
);

-- App-state (open tabs etc.)
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- FTS5 index over scripts (title + content text only)
CREATE VIRTUAL TABLE scripts_fts USING fts5(
  script_id UNINDEXED,
  title,
  content_text,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE INDEX idx_scripts_updated_at ON scripts(updated_at DESC);
CREATE INDEX idx_scripts_archived ON scripts(archived_at);
CREATE INDEX idx_snapshots_script ON snapshots(script_id, created_at DESC);
"#;
