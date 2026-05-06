# ScriptZ — Claude context

Fast, local script editor for TikTok creators and sketch teams. Tauri 2
+ Rust backend + Solid + TypeScript + Lexical editor (vanilla, no
React). Mac-first; Windows/Linux possible later.

This codebase was deliberately stripped down to a minimal feature set in
2026-05. The original spec (`ScriptZ-Projektplan.md`) describes a much
larger system; treat the actual code as the source of truth, not the
spec, when they disagree.

## Repo layout

Single-app pnpm project (no monorepo). Top-level:

```
src/                    Solid frontend (TypeScript)
src-tauri/              Rust backend (Tauri 2)
src/assets/fonts/       iA Writer Quattro woff2 (SIL OFL)
ScriptZ-Projektplan.md  Original spec — outdated; superseded by the code
package.json            pnpm scripts (dev, tauri:dev, tauri:build, typecheck)
tsconfig.json
vite.config.ts
```

## Architecture

```
src-tauri/
  src/
    main.rs                entry → scriptz_lib::run()
    lib.rs                 Tauri Builder, plugin wiring, command registration
    db.rs                  SQLite pool (r2d2 + rusqlite, bundled), WAL,
                           page_size 8192, single migration v2
    error.rs               ScriptzError + Serialize for tauri::command
    models.rs              Rust structs (Script, ScriptSummary, ScriptCharacter,
                           Snapshot, ListScriptsQuery, …)
    fts.rs                 FTS5 index helpers (sanitize_fts_query, upsert)
    lex.rs                 Server-side Lexical-state walkers:
                           extract_blocks, extract_plain_text,
                           extract_teleprompter_text, extract_character_names
    commands/
      scripts.rs           CRUD + duplicate + archive/restore/purge.
                           Reconciles characters_meta from content_json
                           on every update. Sticky color via DEFAULT_PALETTE.
      snapshots.rs         Auto + manual snapshots, 50-per-script cap
      search.rs            FTS5 BM25 over scripts (title + content_text)
      settings.rs          Generic key/value
      app_state.rs         Generic key/value (open tabs etc.)
      export.rs            PDF (printpdf, A4, widow/orphan in render loop)
                           + plain-text (teleprompter) export. Char tinting
                           via name lookup against characters_meta.
      updates.rs           GitHub Releases poll (hourly, no payload)

src/                Solid frontend
  index.tsx              entry, mounts <App>, imports global CSS
  App.tsx                tabs + overlays (CmdK, Settings, NewScript)
  components/
    TabBar.tsx           rounded tabs with App-icon + +-button
    Editor/
      ScriptView.tsx     paper canvas + char pillbar (read-only) + status strip
      Editor.tsx         Lexical mount: createEditor, registerRichText,
                         registerHistory, all custom plugins
      ExportDialog.tsx   PDF + Plain Text export modal
      SnapshotsDialog.tsx history browser with restore
      nodes/             7 ElementNode subclasses
        BaseScriptzNode  shared base, getBlockType()
        Scriptz{Action,Character,Dialog,Parenthetical,Camera,Caption,Sfx}Node
      plugins/
        smartEnter.ts          Enter/Backspace state machine
        blockHotkeys.ts        Cmd+1..7 → block-type swap
        blockDropdown.tsx      Tab opens block-type picker
        characterDropdown.tsx  cursor-anchored autocomplete over the
                               script's own character list (no globals)
        parentheticalLive.ts   live ( … ) detection in Dialog
        inlineFormat.ts        Cmd+B/I/U
        allcaps.ts             characterName attribute sync (visual UPPER
                               is CSS-only — text-transform on the block)
    Browser/
      Browser.tsx           file browser: scripts grid, search, sort,
                            virtualised >80 cards
      TrashView.tsx
      NewScriptDialog.tsx + ScriptContextMenu.tsx
    CommandBar/CommandBar.tsx     Cmd+K Spotlight modal (scripts only)
    Settings/SettingsDialog.tsx
    Common/
      Modal, ConfirmDialog, ToastHost, UpdateIndicator
  stores/
    settings.ts        theme, highlightingDefault, updateCheck flags
    tabs.ts            open tabs, persistence in app_state.open_tabs
    toasts.ts          push-toast helper
  lib/
    api.ts             typed `invoke` wrappers for every Rust command
    types.ts           TS types mirrored from src-tauri/src/models.rs
    tauri.ts           thin invoke wrapper, isTauri flag
    colors.ts          tint() helper (rgba blend)
    format.ts          relativeTime, formatAbsolute, debounce
    welcome.ts         first-run welcome script seeder (generic tutorial)
  styles/
    tokens.css         design tokens (brand orange #e0791f, A4 mm geometry)
    fonts.css          iA Writer Quattro @font-face
    global.css         resets, .btn / .modal / .toast etc.
```

## Conventions

- **Rust holds the truth.** Frontend never writes SQL. All persistence goes
  through `#[tauri::command]` functions in `commands/*.rs`.
- **All entities use UUIDv4 string IDs.** Never auto-increment integers.
- **Timestamps** are `i64` Unix-millis (`chrono::Utc::now().timestamp_millis()`).
- **No `any` in TypeScript.** Backend types in `src/lib/types.ts`.
- **Lexical: vanilla only.** No `@lexical/react`. We `editor.setRootElement(ref)`
  and **must** call `registerRichText(editor)` — without it,
  `CONTROLLED_TEXT_INSERTION_COMMAND` has no default handler and typing
  silently breaks for any selection that lands on an element-type anchor.
- **Visual ALLCAPS in Charakter blocks is CSS-only** (`text-transform`).
  Mutating text nodes inside a node-transform on every keystroke fights
  Lexical's selection model and freezes input after one or two
  characters. Only the parent `characterName` attribute is synced via a
  transform — that's safe because it doesn't touch text-node children.
- **Empty blocks must be CHILDLESS** when handed to Lexical. Don't
  pre-append `$createTextNode("")` — Lexical's reconciler then renders
  nothing useful and WebKit can't place a caret. With no children,
  the reconciler injects a managed `<br>` placeholder automatically.
- **Solid stores:** small modules under `src/stores/`. Components subscribe
  via getters; mutations go through store actions.

## Characters — the per-script model

Characters live **only** inside the script that uses them. There is no
global character table.

- The Lexical state contains `scriptz-character` blocks with a
  `characterName` attribute (uppercased, kept in sync by `allcaps.ts`).
- On every save, Rust walks the JSON via `lex::extract_character_names`,
  reconciles the result against `scripts.characters_meta` (a JSON array
  of `{name, color}`), and writes the merged list back. Names are matched
  case-insensitively; **colors are sticky** — a name that already has a
  color keeps it. New names get the next free color from `DEFAULT_PALETTE`
  in `commands/scripts.rs`.
- The frontend reads `script.characters` (the parsed array) for the
  pillbar and the in-editor autocomplete dropdown. There is no
  "create character" UI — it happens implicitly when you type a new
  name into a Charakter block.

## Data flow

- Editor mounts on script load → registers all plugins → `onUpdate`
  debounced 250 ms → serialises Lexical state to JSON →
  `api.updateScript` → Rust writes `scripts.content_json`, refreshes
  FTS5, reconciles `characters_meta`.
- `onSaved` callback fires after each successful save → `ScriptView`
  refetches the script → pillbar re-renders with the latest character
  list.
- Auto-snapshot fires every 5 min while dirty (`api.createSnapshot(id, "auto")`).
  Manual via `Cmd+Shift+S`. Cap is 50 per script (oldest is dropped).
- Search: frontend → `api.globalSearch(query)` → FTS5 BM25 over
  `scripts_fts` → `SearchHit[]` with `<mark>` snippets.
- PDF export: frontend `api.exportPdf({ scriptId, path, ... })` → Rust
  parses `content_json`, walks blocks, lays out on A4 with widow/orphan
  control, writes via `printpdf`. The frontend never assembles PDF bytes.

## Commands

```bash
pnpm install                # installs node deps
pnpm tauri:dev              # full app with hot-reload + Rust rebuild
pnpm dev                    # Vite-only frontend (no Tauri shell)
pnpm typecheck              # tsc --noEmit
pnpm build                  # Vite prod bundle → dist/
pnpm tauri:build            # native .app at
                            #   src-tauri/target/release/bundle/macos/ScriptZ.app
cargo check --manifest-path src-tauri/Cargo.toml
```

## Don'ts

- **Never start the dev server on your own.** The user runs it. Use
  `pnpm typecheck` and `cargo check` for verification, and describe what
  to look for if a manual UI check is needed.
- **No `@lexical/react`.** Solid + React don't mix.
- **No `tauri-plugin-sql`.** We own the schema in Rust (richer than the
  plugin allows for FTS5 + reconcile-on-save).
- **No localStorage for script content.** Persistence is SQLite.
- **No telemetry.** App works fully offline. The only network call is the
  hourly GitHub Releases check (no body, no identifier).
- **Don't reintroduce global characters, projects, tags, aliases,
  character bibles, per-script overrides, the series field, or
  vibrancy chrome.** They were deliberately removed in 2026-05 to bring
  the app closer to an iA Writer-style minimal editor. If you think you
  need them, talk to the user first.
- **Don't mutate text-node content from a node transform on every
  keystroke.** It will break typing after 1–2 characters. Use CSS or
  intercept `CONTROLLED_TEXT_INSERTION_COMMAND` to transform the payload
  before insertion.

## Out of scope (per spec + post-cleanup)

Drehtage / Drehplanung, Locations als Entität, Notizen-Block, Person-am-
Charakter, Bilder, ElevenLabs, Drag&Drop, Cloud-Sync, Accounts, Telemetry,
Kollaboration, Hook als eigener Block, AI-Features im Editor, Plugin-
System, mehrere Skript-Layouts, Industry-Standard-Drehbuch-Layout
(Courier 12pt). Plus removed in 2026-05: Projects, Tags, Series,
global Characters with bible/aliases/description, per-script
display-name/color overrides, vibrancy chrome.

## Troubleshooting

- **`sqlite locked`** — should not happen with WAL + r2d2 pool; if it
  does, check no migration fired mid-write.
- **Typing dies after a few keystrokes** — this is the
  `registerRichText` regression. The editor MUST call
  `registerRichText(editor)` after `setRootElement`.
- **Empty Charakter block won't accept input** — pre-appending an empty
  `$createTextNode("")` is the cause; leave the new ElementNode childless
  and call `next.select(0, 0)` instead.
- **A character keeps re-appearing in the pillbar after delete** — the
  pillbar reflects what's in `content_json`. If the name still appears
  in any Charakter block, it'll be re-added on the next save. Empty the
  block (or change the name) instead of trying to delete the character.
