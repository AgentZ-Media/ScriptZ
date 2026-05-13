---
paths:
  - "apps/desktop/src/**"
  - "apps/desktop/src-tauri/**"
---

# Desktop-App: Architektur-Detail

Tauri 2 shell + Solid + TypeScript + Lexical editor (vanilla, no React).
All persistence, search, export and CRUD lives in TypeScript via
`@tauri-apps/plugin-sql`; the Rust crate is reduced to plugin wiring +
schema migrations after the Phase 0-11 Rust → TS migration finished
in 2026-05. macOS Apple Silicon + Windows x64 are first-class; Linux
not (yet) shipped.

This codebase was deliberately stripped down to a minimal feature set in
2026-05. The original spec (`ScriptZ-Projektplan.md`) describes a much
larger system; treat the actual code as the source of truth, not the
spec, when they disagree.

## Repo-Layout (Detail)

```
src-tauri/
  src/
    main.rs                entry → scriptz_lib::run()
    lib.rs                 ~45 lines: Tauri Builder + plugin wiring +
                           plugin-sql migration list. No commands, no
                           business logic, no setup-closure.
  migrations/
    001_baseline.sql       Idempotent post-Phase-7 schema (CREATE TABLE
                           IF NOT EXISTS …). Includes the AI summary
                           cols on purpose so 002 can DROP them
                           uniformly on fresh + existing DBs.
    002_ai_cleanup.sql     ALTER TABLE DROP COLUMN x5 + DELETE
                           ai.* settings.
    003_redesign.sql       v0.6 redesign: daily_word_log table for
                           streak/heatmap aggregation, ideas table for
                           the inbox, scripts.last_word_count sentinel.
    004_word_count_sentinel.sql  Backfill sentinel for existing scripts
                           so the first save after upgrade doesn't
                           double-count words into daily_word_log.
  capabilities/default.json  Tauri permission scope (sql, fs, dialog, …)
  tauri.conf.json          Window geometry, bundle ID, updater endpoint
  Cargo.toml               11 deps: tauri + 9 plugins + serde_json (only
                           because tauri::generate_context!() expands to
                           code that references it).

src/                Solid frontend (TypeScript) — owns all persistence
  lib/
    db.ts              Lazy plugin-sql connection (Database.load("sqlite:scriptz.db")).
    scripts.ts         CRUD + duplicate + archive/restore/purge. Reconciles
                       characters_meta from content_json on every update.
                       Sticky color via DEFAULT_PALETTE in characterColors.ts.
    snapshots.ts       Auto + manual snapshots, 50-per-script cap.
    search.ts          FTS5 BM25 over scripts_fts (title + content_text).
    folders.ts         Flat one-level folders.
    characterColors.ts App-wide name → colour overrides + palette logic.
    fts.ts             FTS5 helpers (sanitize, refresh-on-save).
    lex.ts             Lexical state → text extraction (extract_blocks,
                       extract_teleprompter_text, extract_character_names).
                       Powers FTS, plain-text export, and character-meta
                       reconciliation on every save.
    exportPdf.ts       PDF export via pdf-lib + @pdf-lib/fontkit. A4,
                       widow/orphan control, char tinting via name lookup
                       against the script's characters_meta.
    exportPlaintext.ts Teleprompter plain-text export (Char/Dialog/Paren).
    api.ts             Single `api.*` facade exposing the modules above
                       as a typed object. Used by every component.
    types.ts           TS-side data types (Script, ScriptSummary, Folder,
                       Snapshot, ScriptCharacter, SearchHit …).
    tauri.ts           thin invoke wrapper, isTauri flag (rare — most
                       code now goes through plugin-sql, not commands).
    colors.ts          tint() helper (rgba blend)
    format.ts          relativeTime, formatAbsolute, debounce
    saveFlush.ts       central registry for "drain pending writes"
                       hooks (editor auto-save, tab-state persist) so
                       the window-close handler in App.tsx can wait for
                       all buffered work before destroying the window
    welcome.ts         first-run welcome script seeder (generic tutorial)
    dailyWords.ts      day-bucketing + word-delta accounting; writes
                       to daily_word_log on every save (positive
                       deltas only, sentinel-protected).
    dailyStats.ts      reads daily_word_log → streak, today's words,
                       365-day heatmap series.
    dailyStatsBus.ts   pub/sub for stats changes (wakes Heatmap +
                       MomentumStrip + EditorToolbar's "X W heute"
                       counter without polling).
    ideas.ts           CRUD for the ideas inbox (open / used) +
                       convert-to-script.
    ideasBus.ts        pub/sub for ideas list changes.
  index.tsx              entry, mounts <App>, imports global CSS
  App.tsx                tabs + overlays (CmdK, Settings, NewScript,
                         IdeaQuickCapture)
  components/
    TabBar.tsx           rounded tabs with App-icon + +-button +
                         daily-goal pill ("X W heute") + streak pill
    Editor/
      ScriptView.tsx     paper canvas, hosts EditorRail + SprintPill
      Editor.tsx         Lexical mount: createEditor, registerRichText,
                         registerHistory, all custom plugins
      EditorToolbar.tsx  inline title editor + 7 block-type pills +
                         quick-mode + highlight + focus + export
      EditorRail.tsx     right sidebar: Cast tab (per-char dialog %)
                         + Versions tab (snapshot history inline)
      SprintPill.tsx     bottom-right Pomodoro pill (5/15/25 min)
                         with progress bar + word-tracker
      ExportDialog.tsx   PDF + Plain Text export modal
      SnapshotsDialog.tsx history browser with restore (still used
                          from CmdK; the rail's Versions tab is the
                          new primary surface)
      nodes/             7 ElementNode subclasses
        BaseScriptzNode  shared base, getBlockType()
        Scriptz{Action,Character,Dialog,Parenthetical,Camera,Caption,Sfx}Node
      plugins/
        smartEnter.ts          Enter/Backspace state machine
        blockHotkeys.ts        Cmd+1..7 → block-type swap
        blockDropdown.tsx      Tab opens block-type picker
        characterDropdown.tsx  cursor-anchored autocomplete; entries are
                               sorted by predict.ts ranking so the visual
                               order mirrors the prediction
        parentheticalLive.ts   live ( … ) detection in Dialog
        inlineFormat.ts        Cmd+B/I/U
        allcaps.ts             characterName attribute sync (visual UPPER
                               is CSS-only — text-transform on the block)
        highlight.ts           per-block --char-tint CSS variable; Editor
                               highlighting now matches PDF output
                               (per-character colour, not a single tint)
    Browser/
      Browser.tsx           file browser: scripts grid, search, sort,
                            paginated by 200 with "load more" button
      MomentumStrip.tsx     dashboard top row: streak + today's progress
                            + "weiterschreiben" CTA to last open script.
      Heatmap.tsx           365-day GitHub-style writing heatmap.
      ActivityModal.tsx     full activity panel: today meter, streak,
                            year totals, big heatmap.
      FolderChips.tsx       flat folder filter row above the grid
      TrashView.tsx
      NewScriptDialog.tsx + ScriptContextMenu.tsx
    Ideas/
      IdeaQuickCapture.tsx  ⌘I overlay: tippen, Enter speichert.
                            Auto-closes; no script-context required.
      IdeasDrawer.tsx       side drawer with Open/Alle/Verwendet tabs;
                            click → convert idea to new script (⌘↵).
      IdeasToggle.tsx       browser-side toggle button for the drawer.
    CommandBar/CommandBar.tsx     Cmd+K Spotlight modal (scripts only)
    Settings/SettingsDialog.tsx   incl. daily-goal field for tab-bar pill
    Common/
      Modal, ConfirmDialog, ToastHost, UpdateIndicator
  stores/
    settings.ts        theme, highlightingDefault, updateCheck flags,
                       dailyWordGoal
    tabs.ts            open tabs, persistence in app_state.open_tabs
    toasts.ts          push-toast helper
    dailyStats.ts      cached today/streak/heatmap, invalidated by
                       dailyStatsBus on every save
    ideas.ts           cached ideas list, invalidated by ideasBus
  styles/
    tokens.css         design tokens (brand orange #e0791f, A4 mm geometry)
    fonts.css          iA Writer Quattro @font-face
    global.css         resets, .btn / .modal / .toast etc.
public/fonts/          iA Writer Quattro TTFs (loaded at runtime by
                       exportPdf.ts via fetch + pdf-lib embedFont)
```

## Characters - das Per-Script-Modell

Characters live **only** inside the script that uses them. There is no
global character table.

- The Lexical state contains `scriptz-character` blocks with a
  `characterName` attribute (uppercased, kept in sync by `allcaps.ts`).
- On every save, `src/lib/scripts.ts` walks the JSON via
  `extractCharacterNames` (in `src/lib/lex.ts`), reconciles the result
  against `scripts.characters_meta` (a JSON array of `{name, color}`),
  and writes the merged list back. Names are matched case-insensitively;
  **colors are sticky** - a name that already has a color keeps it.
  New names get the next free color from `DEFAULT_PALETTE` in
  `src/lib/characterColors.ts`.
- The frontend reads `script.characters` (the parsed array) for the
  pillbar and the in-editor autocomplete dropdown. There is no
  "create character" UI - it happens implicitly when you type a new
  name into a Charakter block.

## Data flow

- Editor mounts on script load → registers all plugins → `onUpdate`
  debounced 250 ms → serialises Lexical state to JSON →
  `api.updateScript` → `src/lib/scripts.ts` writes `scripts.content_json`
  via plugin-sql, refreshes FTS5 (`refreshFtsForScript`), reconciles
  `characters_meta` against `character_colors`.
- `onSaved` callback fires after each successful save → `ScriptView`
  refetches the script → pillbar re-renders with the latest character
  list.
- Auto-snapshot fires every 5 min while dirty (`api.createSnapshot(id, "auto")`).
  Manual via `Cmd+Shift+S`. Cap is 50 per script (oldest is dropped),
  enforced in both `createSnapshot` and `restoreSnapshot`.
- Search: frontend → `api.globalSearch(query)` → FTS5 BM25 over
  `scripts_fts` → `SearchHit[]` with `<mark>` snippets.
- PDF export: frontend `api.exportPdf({ scriptId, path, … })` →
  `src/lib/exportPdf.ts` reads the script via plugin-sql, walks blocks,
  lays out on A4 with widow/orphan control via pdf-lib, writes the
  bytes via `@tauri-apps/plugin-fs::writeFile`. No Rust code involved.
