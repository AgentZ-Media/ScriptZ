# Migration Rust → TypeScript: was noch ansteht

Stand: 2026-05-09, nach Commit `5510a73` auf `migration/typescript-rewrite`.

## Was schon erledigt ist

Phasen 0–7 + 9 (AI-Removal, statt -Portierung) durch. TypeScript-Seite
besitzt mittlerweile alle Lese- und Schreibpfade gegen die SQLite-DB:

- Settings + App-State (Phase 2)
- Character-Colors inkl. Sticky-Color-Logik (Phase 3)
- Folders + Move-Operations (Phase 4)
- Snapshots + Restore + 50-pro-Skript-Cap (Phase 5)
- Volltextsuche (Phase 6)
- Skripte: get/list/create/duplicate/rename/update/archive/restore/purge/empty_trash (Phase 7)
- AI/OpenRouter komplett raus (Phase 9 — bewusst, nicht migriert)

## Was Rust 2026-05-09 noch tut

- [`src-tauri/src/commands/export.rs`](../src-tauri/src/commands/export.rs)
  — PDF + Plaintext-Export. Hängt fest, weil PDF-Layout-Code
  visuell exakt zu reproduzieren Detailarbeit ist.
- [`src-tauri/src/commands/debug.rs`](../src-tauri/src/commands/debug.rs)
  — `frontend_log`, Migration-Helper für stdout-Logs.
- [`src-tauri/src/db.rs`](../src-tauri/src/db.rs) — rusqlite-Pool +
  Migrationskette v2-v7 + Bootstrap (WAL, page_size). Lebt nur noch,
  damit `export.rs` eine Connection bekommt.
- [`src-tauri/src/lex.rs`](../src-tauri/src/lex.rs) — `extract_blocks`,
  `extract_teleprompter_text`. Auch nur für `export.rs`.
- [`src-tauri/src/models.rs`](../src-tauri/src/models.rs) — nur noch
  `ScriptCharacter` (für Char-Tinting in `export.rs`).
- [`src-tauri/src/error.rs`](../src-tauri/src/error.rs) — `ScriptzError`
  (Sqlite/Pool/Json/Io/NotFound/Other-Varianten).
- `lib.rs` registriert nur noch `frontend_log`, `export_pdf`,
  `export_plaintext` als Commands.

Cargo-Deps die noch drinhängen:
`tauri` + Plugins, `rusqlite`, `r2d2`, `r2d2_sqlite`, `serde`,
`serde_json`, `tokio`, `anyhow`, `thiserror`, `uuid`, `tracing`,
`tracing-subscriber`, `printpdf`, `unicode-segmentation`, `url`.

## DB-Datenmüll (nicht aufgeräumt)

In jeder existierenden DB sitzen Reste von Phase 9:

- [`scripts`](../src-tauri/src/db.rs#L235): orphane Spalten `summary`,
  `summary_source_text`, `summary_generated_at`, `summary_model`,
  `summary_source_tokens`. Niemand liest oder schreibt sie.
- [`settings`](../src-tauri/src/db.rs#L211): orphane Keys
  `ai.enabled`, `ai.model`, `ai.openrouter_models_cache`.
- macOS-Schlüsselbund: Eintrag `ScriptZ` / `openrouter_api_key`. Kein
  Code mehr, der ihn anfasst. Manuell entfernen via
  Schlüsselbundverwaltung.app, falls gewollt.

Keiner dieser Reste tut etwas. Alle gehen mit Phase 10 weg.

---

## Phase 8 — PDF + Plaintext-Export nach TS

**Ziel:** `commands/export.rs` (470 Zeilen, `printpdf`-basiert) durch
TS-Implementierung mit [`pdf-lib`](https://pdf-lib.js.org/) ersetzen.
Plaintext-Export ist trivial; PDF ist Detailarbeit.

### Was zu tun ist

1. **Plaintext zuerst** (15 Min):
   - Neuer File `src/lib/exportPlaintext.ts`.
   - Funktion `exportPlaintext(scriptId, path)`:
     - `getScript(id)` → content_json
     - `extractTeleprompterText(content_json)` aus `lib/lex.ts`
       (Phase 1 Port, byte-genau gegen Rust verifiziert)
     - Datei schreiben via `@tauri-apps/plugin-fs` (`writeTextFile`)
       — Plugin muss in `tauri.conf.json` mit Berechtigung freigegeben
       werden (`fs:write-text-file` mit Pfad-Scope ist akzeptabel,
       weil der User den Pfad selbst über den Save-Dialog wählt).
   - Tauri-Command `export_plaintext` aus `lib.rs` raus.

2. **PDF-Layout** (1-2 Tage Detailarbeit):
   - `pdf-lib` als Dep hinzufügen (npm).
   - iA Writer Quattro woff2 einbetten — pdf-lib will TTF/OTF, also
     entweder die Originale .otf laden oder via `fontkit` registrieren.
     `apps/desktop/src/assets/fonts/` enthält die woff2 — die OTF/TTF
     liegen vermutlich nicht im Repo. Quelle besorgen.
   - Layout 1:1 nach `commands/export.rs` portieren:
     - A4 Geometrie, Marges aus Rust-Code übernehmen
     - Per-Block-Layout (Action, Character, Dialog, etc.)
     - Widow/Orphan-Kontrolle (Block-Splitting an Page-Boundaries)
     - Charakter-Tinting (Hintergrundfarbe oder Text-Farbe?
       Quellcode in `export.rs::render_block` anschauen)
     - Optional Title-Page (vor dem ersten Inhaltsseitenumbruch)
     - Highlighting-Toggle (`include_highlighting`)
   - Bytes via `@tauri-apps/plugin-fs writeFile`.

3. **Verifikation:** Vorher referenz-PDFs erzeugen (mit aktuellem
   Rust-Build) für 3-4 representative Skripte (kurz / lang / viele
   Charaktere / mit Highlighting an+aus). Nach TS-Implementierung
   nebeneinander öffnen, visuelle Diffs identifizieren.
   pdf-Bytes-Vergleich ist nicht aussagekräftig (PDF-Producer/Datum/
   etc. unterscheiden sich), Auge ist der einzige Maßstab.

### Was rauskann nach Phase 8

- `src-tauri/src/commands/export.rs` löschen
- `src-tauri/src/commands/mod.rs`: export-Modul raus
- `src-tauri/src/lib.rs`: 2 invoke-handler weg
- `src-tauri/src/lex.rs`: komplett gelöscht (`extract_blocks` +
  `extract_teleprompter_text` waren letzte Nutzer)
- `src-tauri/src/lib.rs`: `mod lex;` raus
- `src-tauri/src/models.rs`: komplett leer (`ScriptCharacter` war
  letzte Struct), Datei löschen
- `src-tauri/src/lib.rs`: `mod models;` raus
- Cargo-Dep `printpdf` raus
- Cargo-Dep `unicode-segmentation` raus (war eh nur historisch,
  schon seit Phase 6 ungenutzt)
- Cargo-Dep `url` checken — wird das noch genutzt? Wenn nein, raus

### Definition of Done

- Plaintext-Export schreibt identische Bytes wie vorher (lass dir das
  mit `diff` bestätigen)
- PDF-Export sieht für mind. 3 Test-Skripte visuell identisch zum
  Rust-Build aus
- `pnpm typecheck` + `cargo check` grün, keine Warnings
- Manuell: 5 reale Skripte exportieren, Layout korrekt, Charakter-
  Farben stimmen, Title-Page funktioniert, Highlighting-Toggle wirkt

### Risiko

Niedrig fürs Daten-Modell, hoch fürs Polishing. Wenn das PDF schief
aussieht, bricht nichts. Aber jeder Dialog-Block-Umbruch, jeder
Spacing-Cluster, jede Charakter-Tint-Farbe muss exakt sein, sonst
sieht's wie eine Beta aus.

---

## Phase 10 — DB-Open + Migrations + AI-Cleanup

**Ziel:** Rust öffnet die DB nicht mehr, plugin-sql übernimmt komplett.
Migrationskette wird zu plugin-sql migriert. AI-Datenmüll wird sauber
weggeräumt.

### Voraussetzung: Phase 8 ist durch

Phase 10 in voller Form geht erst, wenn Rust nichts mehr aus der DB
liest. Solange `commands/export.rs` lebt, braucht es einen rusqlite-
Pool — also bleibt `db.rs`. Drei Pfade:

#### Pfad A: Phase 10 jetzt "light" (parallele Pools)

Plugin-sql-Migrations registrieren, AI-Cleanup machen, aber db.rs
bleibt für `export.rs`. Folge: zwei Connection-Pools auf derselben
SQLite-Datei (Rust r2d2 + plugin-sql sqlx). WAL kann das technisch,
aber die Architektur ist hässlich. **Nicht empfohlen.**

#### Pfad B: Phase 10 nach Phase 8 (sauber)

Erst Phase 8 abschließen, dann db.rs komplett retiren. Empfohlen,
wenn Phase 8 sowieso noch ansteht.

#### Pfad C: Mini-Cleanup-Migration jetzt, Rest nach Phase 8

Eine kleine Rust-Migration v8 zur bestehenden db.rs-Kette anhängen,
um den AI-Datenmüll wegzubekommen. Architektur unverändert.

```sql
-- Migration v8: AI cleanup nach Phase 9
DELETE FROM settings WHERE key LIKE 'ai.%';

-- Spalten droppen — funktioniert ab SQLite 3.35.
-- (rusqlite bundled feature, libsqlite3-sys >= 0.27 enthält 3.45+)
ALTER TABLE scripts DROP COLUMN summary;
ALTER TABLE scripts DROP COLUMN summary_source_text;
ALTER TABLE scripts DROP COLUMN summary_generated_at;
ALTER TABLE scripts DROP COLUMN summary_model;
ALTER TABLE scripts DROP COLUMN summary_source_tokens;
```

In `src-tauri/src/db.rs`: zur `migrations`-Liste `(8, MIGRATION_008)`
hinzufügen, MIGRATION_008-String mit obigem SQL.

Test: `pnpm tauri:dev`, App startet, Settings-Tabelle hat keine
ai.*-Keys mehr (`sqlite3 scriptz.db "SELECT * FROM settings WHERE key LIKE 'ai.%';"` ist leer), `PRAGMA table_info(scripts);` zeigt
keine summary*-Spalten mehr.

### Phase 10 in voller Form (nach Phase 8)

1. **Rust-DB-Setup retiren:**
   - `src-tauri/src/db.rs` löschen
   - `src-tauri/src/lib.rs`: `mod db;` raus, `Db::open(...)` aus dem
     Setup-Closure raus, `app.manage(db)` raus
   - `src-tauri/src/error.rs`: `Sqlite`, `Pool`, `Json`, `Io`-
     Varianten raus (waren nur für rusqlite-Code). Vermutlich kann die
     ganze Datei weg, wenn sonst kein Rust-Code mehr Errors mappt.
   - Cargo-Deps `rusqlite`, `r2d2`, `r2d2_sqlite`, `anyhow` (falls nur
     noch in error.rs genutzt), `thiserror` (dito) raus

2. **Plugin-sql Migrations einrichten** in `src-tauri/src/lib.rs`:

   ```rust
   use tauri_plugin_sql::{Migration, MigrationKind, Builder};

   let migrations = vec![
       Migration {
           version: 1,
           description: "baseline schema",
           sql: include_str!("../migrations/001_baseline.sql"),
           kind: MigrationKind::Up,
       },
   ];

   tauri::Builder::default()
       .plugin(
           Builder::default()
               .add_migrations("sqlite:scriptz.db", migrations)
               .build(),
       )
       // ... rest
   ```

3. **`migrations/001_baseline.sql` schreiben:**
   - Schema im Endzustand (post-v7, OHNE AI-Spalten)
   - Mit `CREATE TABLE IF NOT EXISTS …`, `CREATE INDEX IF NOT EXISTS
     …`, `CREATE VIRTUAL TABLE IF NOT EXISTS scripts_fts …`
   - Existing User: alle Tabellen sind schon da, baseline-Migration
     ist effektiv No-Op. Plugin-sql vermerkt "applied" in
     `_sqlx_migrations`.
   - Frischer User: Schema wird einmalig aufgesetzt.

4. **AI-Cleanup als plugin-sql Migration v2:**
   ```sql
   DELETE FROM settings WHERE key LIKE 'ai.%';
   ALTER TABLE scripts DROP COLUMN summary;
   ALTER TABLE scripts DROP COLUMN summary_source_text;
   ALTER TABLE scripts DROP COLUMN summary_generated_at;
   ALTER TABLE scripts DROP COLUMN summary_model;
   ALTER TABLE scripts DROP COLUMN summary_source_tokens;
   ```
   Bei frischer DB: DROP COLUMN errort, weil die Spalten schon nicht
   da sind. **Lösung:** entweder
   - (a) Baseline-Schema (v1) MIT den Spalten definieren (ja, im
     Endzustand mit AI-Resten — kosmetisch hässlich, funktional egal,
     dann v2 cleart sie cleanly auf beiden Seiten), oder
   - (b) Tabelle scripts in v2 komplett rebuilden (CREATE TABLE
     scripts_new, INSERT SELECT, DROP scripts, RENAME) — funktioniert
     für frische und existing DBs gleich.

   Empfehlung: (b), ist die saubere SQLite-idiomatische Lösung für
   "Spalten droppen ohne Sonderfälle".

5. **Bootstrap-Pragmas:** WAL und page_size sind im DB-Header
   persistiert, bei existing DB also schon gesetzt. Plugin-sql öffnet
   via sqlx-sqlite, das setzt per Default `synchronous=NORMAL`,
   `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5s`. Damit
   sollten wir leben können — die übrigen Performance-Pragmas aus
   `db.rs` (mmap_size, cache_size, wal_autocheckpoint,
   journal_size_limit, cache_spill) sind Tuning, nicht Korrektheit.
   Falls sich Performance bei großen Skripten messbar ändert, kann man
   sie via `Builder::default().with_handler(|conn| { ... })` pro
   Connection nachsetzen — die plugin-sql Builder-API hat einen
   `with_handler`-Hook seit v2.4.

6. **Tests:**
   - **Existing DB:** App startet, alle 7 Skripte da, Snapshots da,
     keine AI-Reste mehr (`sqlite3 scriptz.db "PRAGMA table_info(scripts);"` zeigt
     keine summary*-Spalten).
   - **Frische DB:** App-Data-Dir umbenennen oder zweite App-Instanz
     mit anderem AppId, App startet, Welcome-Skript erscheint, alles
     funktioniert.
   - **Migration-Idempotenz:** App zweimal starten, zweite Start
     darf nicht die Baseline nochmal ausführen.

### Was rauskann nach Phase 10

- `src-tauri/src/db.rs` weg
- `src-tauri/src/error.rs` weg (vermutlich)
- `src-tauri/src/models.rs` weg (war nach Phase 8 schon)
- `src-tauri/src/lex.rs` weg (war nach Phase 8 schon)
- Cargo-Deps `rusqlite`, `r2d2`, `r2d2_sqlite`, `anyhow`,
  `thiserror`, `uuid` raus

### Definition of Done

- `cargo check` grün, keine Warnings
- App startet, alle existing Skripte intakt, keine AI-Reste in DB
- Frische DB-Test bestanden
- `_sqlx_migrations`-Tabelle existiert, baseline + v2 markiert applied

### Risiko

Mittel. Migrationen falsch zu schreiben kann existing DBs
korrumpieren. **Vorher DB-Backup ziehen:**
```bash
cp "~/Library/Application Support/de.agent-z.scriptz/scriptz.db" \
   "~/Desktop/scriptz-pre-phase10.db"
```

---

## Phase 11 — Rust-Cleanup auf Minimum

**Ziel:** Rust-Crate auf das absolut nötige reduzieren. Nur noch
Tauri-Plugin-Setup, sonst nichts mehr.

### Was zu tun ist

1. **`src-tauri/src/lib.rs` wird ~50 Zeilen:**
   ```rust
   use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

   const MIGRATIONS: &[Migration] = &[
       Migration {
           version: 1,
           description: "baseline schema",
           sql: include_str!("../migrations/001_baseline.sql"),
           kind: MigrationKind::Up,
       },
       // future migrations …
   ];

   #[cfg_attr(mobile, tauri::mobile_entry_point)]
   pub fn run() {
       tauri::Builder::default()
           .plugin(tauri_plugin_window_state::Builder::default().build())
           .plugin(tauri_plugin_clipboard_manager::init())
           .plugin(tauri_plugin_os::init())
           .plugin(tauri_plugin_updater::Builder::new().build())
           .plugin(tauri_plugin_process::init())
           .plugin(tauri_plugin_opener::init())
           .plugin(tauri_plugin_dialog::init())
           .plugin(tauri_plugin_global_shortcut::Builder::new().build())
           .plugin(
               SqlBuilder::default()
                   .add_migrations("sqlite:scriptz.db", MIGRATIONS.to_vec())
                   .build(),
           )
           .run(tauri::generate_context!())
           .expect("error while running tauri application");
   }
   ```

2. **`commands/`-Ordner komplett leeren:**
   - `commands/debug.rs` weg (frontend_log war nur Migration-Helper,
     wir brauchen es nicht mehr)
   - `commands/mod.rs` weg
   - `lib.rs`: `mod commands;` raus, `invoke_handler` ganz raus
   - `src/lib/db.ts`: `termLog`-Funktion raus (war Wrapper um
     frontend_log) und alle Aufrufer in TS suchen + entfernen

3. **`src-tauri/Cargo.toml` aufräumen — final dependency list:**
   ```toml
   [dependencies]
   tauri = { version = "2", features = [] }
   tauri-plugin-os = "2"
   tauri-plugin-window-state = "2"
   tauri-plugin-updater = "2"
   tauri-plugin-process = "2"
   tauri-plugin-opener = "2"
   tauri-plugin-dialog = "2"
   tauri-plugin-clipboard-manager = "2"
   tauri-plugin-global-shortcut = "2"
   tauri-plugin-sql = { version = "2", features = ["sqlite"] }

   serde = { version = "1", features = ["derive"] }
   serde_json = "1"

   tracing = "0.1"
   tracing-subscriber = { version = "0.3", features = ["env-filter"] }
   ```

   Raus: `rusqlite`, `r2d2`, `r2d2_sqlite`, `tokio` (Tauri schleppt
   das selbst), `once_cell` (schon raus), `anyhow`, `thiserror`,
   `uuid`, `chrono` (schon raus), `printpdf` (schon nach Phase 8 raus),
   `unicode-segmentation`, `url`.

   Optional weg, falls keiner mehr drauf zugreift: `serde`,
   `serde_json`, `tracing*`. Bei einem reinen Plugin-Setup vermutlich
   ja.

4. **`src-tauri/src/main.rs` bleibt wie es ist** (ruft `scriptz_lib::run()`).

### Tests

- `cargo check` grün
- `pnpm tauri:dev` startet, App läuft, Smoke-Test: ein Skript anlegen,
  schreiben, speichern, exportieren (TS-PDF nach Phase 8), schließen,
  neu öffnen.
- `cargo build --release` baut die App-Binary, Größe vorher/nachher
  vergleichen — sollte deutlich kleiner sein.

### Definition of Done

- `src-tauri/src/` enthält nur noch `main.rs`, `lib.rs` und das
  `migrations/`-Verzeichnis
- Cargo-Deps auf Tauri + Plugins reduziert
- App startet und funktioniert

### Risiko

Niedrig. Reines Aufräumen.

---

## Phase 12 — Release v0.5.0

**Ziel:** Branch nach `main`, Auto-Updater rollt die TS-Migrations-Build
zu allen Usern aus.

### Vorbereitung: 1 Woche im Branch dogfooden

Branch nicht direkt mergen. Lokal bauen (`pnpm tauri:build`),
installieren, eine Woche täglich nutzen. Schauen, ob:
- Performance subjektiv unverändert (TS DB-Layer kann theoretisch
  langsamer als Rust sein, in der Praxis bei <100 Skripten egal)
- Save-Verhalten zuverlässig (kein Datenverlust nach App-Crash)
- Export funktioniert auf realen Skripten
- Search vollständige Treffer liefert
- Snapshot-Cap greift
- Color-Stickiness korrekt über mehrere Skripte hinweg

### Release-Checkliste (siehe Repo-Root [`/CLAUDE.md`](../../../CLAUDE.md))

Vier Versionsstellen müssen synchron stehen:
1. [`apps/desktop/package.json`](../package.json) → `"version": "0.5.0"`
2. [`apps/desktop/src-tauri/Cargo.toml`](../src-tauri/Cargo.toml) → `[package] version = "0.5.0"`
3. [`apps/desktop/src-tauri/Cargo.lock`](../src-tauri/Cargo.lock) — `name = "scriptz"` Eintrag
4. [`apps/desktop/src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) → `"version": "0.5.0"`
5. [`apps/landing/src/data/site.ts`](../../landing/src/data/site.ts) → `fallbackVersion: "0.5.0"`
6. [Repo-Root `/README.md`](../../../README.md) — die `version-X.Y.Z` shields.io-Badges

(Punkt 3 nicht vergessen — sonst bricht der CI-Build mit
`--frozen-lockfile`.)

### Merge + Tag + Push

```bash
git checkout main
git merge --no-ff migration/typescript-rewrite
git push origin main
git tag -a v0.5.0 -m "ScriptZ v0.5.0 — Rust → TS Migration"
git push origin v0.5.0
```

GitHub Actions baut auf `macos-26`, signiert, published Release-Assets,
triggert Vercel-Deploy-Hook für die Landing.

### Was ein User merkt

- **Erste Migration (alte → neue Version):** App startet, plugin-sql
  Migration v1 läuft (no-op via IF NOT EXISTS), v2 droppt AI-Reste.
  Dauert <1s, einmalig. User sieht nichts davon.
- **Settings-Dialog:** keine KI-Section mehr, nur Erscheinungsbild /
  Editor / Updates / Über.
- **Browser-Karten:** kein Summary-Feld mehr.
- **Performance:** subjektiv unverändert (siehe oben).

### Release-Notes-Skizze

```markdown
## v0.5.0

### Geändert
- Komplette Rewrite des Datenbank-Layers: Rust → TypeScript via
  tauri-plugin-sql. Architektonische Vereinfachung, gleiche Daten,
  selbe Schemafassung.
- KI-Features entfernt: keine OpenRouter-Anbindung, keine
  automatischen Skript-Zusammenfassungen mehr. Wer das nutzte: der
  API-Key liegt noch im macOS-Schlüsselbund (Eintrag „ScriptZ" /
  „openrouter_api_key") und kann manuell entfernt werden.

### Intern
- Rust-Crate auf Plugin-Setup-Minimum reduziert
- Rust-Cargo-Deps von ~25 auf ~12 abgespeckt
- Backend-Code von ~3500 Zeilen auf ~50 Zeilen geschrumpft
```

### Risiko

Niedrig. Wenn die Woche im Branch sauber war, sollte der Release
nichts neues bringen.

---

## Anhang: Fallback-Plan

Wenn auf dem Weg etwas schief geht und du **zurück** willst:

```bash
# Branch wegwerfen, main ist unverändert
git checkout main
git branch -D migration/typescript-rewrite

# Letzten Pre-Migrations-Stand aus main bauen
git checkout 614c6b6  # commit "Release v0.4.3"
pnpm install
pnpm tauri:build
```

Solange wir nicht released haben, gibt es keinen Punkt of no return.

---

*Diese Datei ist nicht maintained. Entweder durcharbeiten und löschen,
oder beim nächsten Aufgreifen aktualisieren.*
