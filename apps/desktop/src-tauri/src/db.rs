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
        // Migration v3: additive — adds AI summary columns to scripts.
        // Migration v4: additive — adds summary_source_tokens (compact
        //   word-set used for Jaccard) so we don't have to store the
        //   full plain-text body alongside every script.
        // Migration v5: additive — folders (single, flat level) and
        //   scripts.folder_id with ON DELETE SET NULL so deleting a folder
        //   leaves its scripts intact in "Alle".
        // Migration v6: additive — `character_colors` table holding
        //   app-wide name → color overrides. Consulted on every reconcile
        //   so the same character name keeps its colour across scripts.
        // Migration v7: split `color` into `default_color` (the first-ever
        //   auto-assigned palette colour, written once and never touched
        //   again) and `override_color` (nullable manual override). Reset
        //   propagates `default_color` instead of picking next-free-palette
        //   per script, so the same name lands on the same colour
        //   everywhere after a reset.
        let migrations: &[(i64, &str)] = &[
            (2, MIGRATION_002),
            (3, MIGRATION_003),
            (4, MIGRATION_004),
            (5, MIGRATION_005),
            (6, MIGRATION_006),
            (7, MIGRATION_007),
        ];
        let tx = conn.transaction()?;
        for (version, sql) in migrations {
            if *version > current {
                tracing::info!("applying migration v{}", version);
                if *version == 2 {
                    // M10 safeguard: migration 002 unconditionally drops
                    // every prior table. Catastrophic if it ever runs
                    // against a v2+ DB whose user_version got reset
                    // (manual edits, broken backup-restore). Only run
                    // the wipe when the DB is either (a) genuinely
                    // empty, or (b) actually carries the old v1 schema
                    // (signalled by the `projects` or `characters`
                    // tables that v2 removed).
                    if !is_safe_to_apply_v2(&tx)? {
                        tracing::error!(
                            "Refusing to apply v2 migration: DB looks like a \
                             post-v2 state with user_version reset to {}. \
                             Stamping user_version=2 without wiping. If you \
                             really want to reset, delete the file manually.",
                            current
                        );
                        tx.execute_batch("PRAGMA user_version = 2")?;
                        continue;
                    }
                }
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

// new_id moved to TS (crypto.randomUUID) in Migration Phase 4+; the
// remaining Rust writers (update_script, archive flow) only update
// existing rows, so no fresh UUID is generated server-side anymore.

/// Heuristic: is it safe to apply the destructive v2 migration here?
///   - YES if the DB has no `scripts` table at all (fresh DB).
///   - YES if `scripts` exists but is empty (test fixture / dev reset).
///   - YES if v1-only tables (`projects`, `characters`) are still around
///     — that's the actual upgrade path the migration was written for.
///   - NO if `scripts` is populated and the v1-only tables are gone —
///     we're almost certainly on v2+ with a reset user_version, and
///     dropping `scripts` would obliterate the user's content.
fn is_safe_to_apply_v2(conn: &rusqlite::Connection) -> Result<bool> {
    let scripts_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='scripts'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if scripts_exists == 0 {
        return Ok(true);
    }
    let scripts_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM scripts", [], |r| r.get(0))
        .unwrap_or(0);
    if scripts_count == 0 {
        return Ok(true);
    }
    // v1-only marker tables — if either still exists alongside scripts,
    // we really are upgrading from v1 and the wipe is intentional.
    let v1_marker: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type='table' AND name IN ('projects','characters','character_aliases')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(v1_marker > 0)
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

// v3: AI-generated short summary per script (nullable; opt-in feature).
// summary_source_hash = SHA-256 of the plain-text content used to produce
// `summary` — lets us cheaply detect "no content change" without diffing.
// Word-Jaccard against the source text drives re-generation; the hash is
// just the cheap exit-early check.
const MIGRATION_003: &str = r#"
ALTER TABLE scripts ADD COLUMN summary TEXT;
ALTER TABLE scripts ADD COLUMN summary_source_text TEXT;
ALTER TABLE scripts ADD COLUMN summary_generated_at INTEGER;
ALTER TABLE scripts ADD COLUMN summary_model TEXT;
"#;

// v4: store the deduped word-token list instead of the full plain-text
// body. The token list is what the Jaccard-similarity check actually
// uses; keeping the full text was ~2-3× the storage cost per script.
// `summary_source_text` is no longer written on save but kept readable
// as a one-time fallback so existing rows can recompute their tokens
// in-place at the next save without losing their cooldown state.
const MIGRATION_004: &str = r#"
ALTER TABLE scripts ADD COLUMN summary_source_tokens TEXT;
"#;

// v5: flat folders. One folder per script (nullable — "Alle" / no folder
// is the absence of folder_id). Deleting a folder is a soft drop: scripts
// in it just lose their folder_id and reappear in "Alle". No nesting yet;
// if we ever want it, add `parent_id TEXT REFERENCES folders(id)` later.
const MIGRATION_005: &str = r#"
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
ALTER TABLE scripts ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX idx_scripts_folder ON scripts(folder_id);
"#;

// v6: app-wide character-colour overrides. `name` is stored exactly as the
// writer typed it (uppercased like in `characters_meta`) and matched
// case-insensitively via COLLATE NOCASE. `color` is a "#rrggbb" string,
// matching the format used everywhere else.
const MIGRATION_006: &str = r#"
CREATE TABLE character_colors (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  color TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
"#;

// v7: split `color` into `default_color` (write-once "this is what the
// palette assigned the first time the name showed up") and
// `override_color` (nullable manual user override). Reset goes back to
// the default instead of picking next-free per script, so the same
// character lands on the same colour app-wide after a reset.
//
// SQLite can't widen a column from NOT NULL to nullable in place, so we
// recreate the table. Existing v6 rows held only manual overrides
// (`set_character_color` was the only writer), so we copy `color` into
// `override_color` and leave `default_color` NULL — defaults will be
// back-filled on the next save of any script that mentions the name.
const MIGRATION_007: &str = r#"
CREATE TABLE character_colors_v7 (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  default_color TEXT,
  override_color TEXT,
  updated_at INTEGER NOT NULL
);
INSERT INTO character_colors_v7 (name, default_color, override_color, updated_at)
SELECT name, NULL, color, updated_at FROM character_colors;
DROP TABLE character_colors;
ALTER TABLE character_colors_v7 RENAME TO character_colors;
"#;
