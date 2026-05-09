# ScriptZ — Claude context

Fast, local script editor for TikTok creators and sketch teams. Tauri 2
shell + Solid + TypeScript + Lexical editor (vanilla, no React). All
persistence, search, export and CRUD lives in TypeScript via
`@tauri-apps/plugin-sql`; the Rust crate is reduced to plugin wiring +
schema migrations after the Phase 0–11 Rust → TS migration finished
in 2026-05. Mac-first; Windows/Linux possible later.

This codebase was deliberately stripped down to a minimal feature set in
2026-05. The original spec (`ScriptZ-Projektplan.md`) describes a much
larger system; treat the actual code as the source of truth, not the
spec, when they disagree.

## Repo layout

This app lives at `apps/desktop/` inside a pnpm monorepo. The root
`CLAUDE.md` documents the workspace shape; treat this file as the
authoritative reference for the desktop app itself.

Inside `apps/desktop/`:

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
        characterDropdown.tsx  cursor-anchored autocomplete; entries are
                               sorted by predict.ts ranking so the visual
                               order mirrors the prediction
        parentheticalLive.ts   live ( … ) detection in Dialog
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
  styles/
    tokens.css         design tokens (brand orange #e0791f, A4 mm geometry)
    fonts.css          iA Writer Quattro @font-face
    global.css         resets, .btn / .modal / .toast etc.
public/fonts/          iA Writer Quattro TTFs (loaded at runtime by
                       exportPdf.ts via fetch + pdf-lib embedFont)
```

## Conventions

- **TypeScript owns persistence.** All SQL goes through plugin-sql via
  the modules in `src/lib/` (db, scripts, snapshots, folders, …).
  There are no Tauri commands for data access — the Rust side opens
  no DB connections.
- **All entities use UUIDv4 string IDs.** Never auto-increment integers.
- **Timestamps** are JS Unix-millis (`Date.now()`).
- **No `any` in TypeScript.** Data types in `src/lib/types.ts`.
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
- On every save, `src/lib/scripts.ts` walks the JSON via
  `extractCharacterNames` (in `src/lib/lex.ts`), reconciles the result
  against `scripts.characters_meta` (a JSON array of `{name, color}`),
  and writes the merged list back. Names are matched case-insensitively;
  **colors are sticky** — a name that already has a color keeps it.
  New names get the next free color from `DEFAULT_PALETTE` in
  `src/lib/characterColors.ts`.
- The frontend reads `script.characters` (the parsed array) for the
  pillbar and the in-editor autocomplete dropdown. There is no
  "create character" UI — it happens implicitly when you type a new
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

## Releasing & in-app auto-update

Auto-update is the official `tauri-plugin-updater` flow, same shape as
NoteZ. The frontend does `check() → downloadAndInstall() → relaunch()`
in [`src/components/Common/UpdateIndicator.tsx`](src/components/Common/UpdateIndicator.tsx);
the manual "Jetzt prüfen" button in Settings goes through the same
plugin. Updates are signed with a minisign keypair — the public key is
embedded in [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json),
the private key lives at `~/.tauri/scriptz_updater.key` (no password)
and is mirrored to the GitHub repo secret
`TAURI_SIGNING_PRIVATE_KEY`. **Lose the private key and you lose the
ability to ship updates** — back it up.

The release pipeline lives in
[`.github/workflows/release.yml`](.github/workflows/release.yml). It
fires on tags matching `v*.*.*` (but not `v*.*.*.*`), runs on
`macos-26` for SDK parity with Tahoe users, builds for
`aarch64-apple-darwin` only, and publishes a Release containing the
DMG, the signed `.app.tar.gz` + `.sig`, and the `latest.json` manifest
the in-app updater polls. The current-version check inside the app
uses `@tauri-apps/api/app`'s `getVersion()`, which reads from Cargo
metadata at runtime — no `VITE_APP_VERSION` constant to keep in sync.

To cut a release:

1. Bump the version in **all six** places (they must agree, or
   `tauri build` warns, the CI build breaks on `--frozen-lockfile`,
   or the landing shows the previous version after a GitHub-API blip):
   - `apps/desktop/package.json` → `version`
   - `apps/desktop/src-tauri/Cargo.toml` → `[package] version`
   - `apps/desktop/src-tauri/Cargo.lock` → the `name = "scriptz"` entry
     (cargo auto-rewrites this when you edit Cargo.toml, but commit it)
   - `apps/desktop/src-tauri/tauri.conf.json` → `version`
   - `apps/landing/src/data/site.ts` → `fallbackVersion`
   - `/README.md` (Repo-Root) → the `version-X.Y.Z` shields.io badge
     near the top (the only displayed version humans see before
     installing)
2. Commit, push `main`.
3. `git tag -a vX.Y.Z -m "ScriptZ vX.Y.Z — …" && git push origin vX.Y.Z`
4. The workflow runs ~6 min and produces the release. After it finishes,
   any running v(X.Y.Z-1) instance picks the new version up on its next
   hourly poll (or immediately on app restart).

The first manual install still needs `xattr -cr /Applications/ScriptZ.app`
because the app is unsigned (no Apple Developer account). In-place
updates **don't** need that — the new bundle inherits the running
process's quarantine state.

## Landing mitziehen, wenn sich etwas User-sichtbar ändert

Die Marketing-Site lebt in [`apps/landing/`](../landing/) und ist das
Schaufenster dieser App. Bei jeder Änderung, die ein User merkt
(neues / entferntes Feature, geänderter Editor-Look, neue Schrift,
neue Plattform, geändertes Lizenz- oder Konto-Verhalten), gehört
in den gleichen Arbeitsschritt ein Blick in die Landing - sonst
zeigt sie ein Produkt, das es so nicht mehr gibt.

Konkrete Touchpoints:

- [`apps/landing/src/components/Features.astro`](../landing/src/components/Features.astro) - Top-3-Features
- [`apps/landing/src/components/Compare.astro`](../landing/src/components/Compare.astro) - Vergleichstabelle
- [`apps/landing/src/components/AutoTypingDemo.astro`](../landing/src/components/AutoTypingDemo.astro) - Editor-Demo, muss 1:1 wie der echte Editor aussehen (Block-Typen, Einrückung, ALLCAPS, Spacing-Cluster)
- [`apps/landing/src/components/Hero.astro`](../landing/src/components/Hero.astro) - Headline, Plattform-Meta
- [`apps/landing/src/components/OpenSource.astro`](../landing/src/components/OpenSource.astro) - Versprechen (kein Konto, keine Tracker etc.) - muss zur tatsächlichen App passen
- [`apps/landing/src/styles/tokens.css`](../landing/src/styles/tokens.css) - Designsystem, falls Schrift/Farben/Spacing geändert werden
- [`apps/landing/src/pages/datenschutz.astro`](../landing/src/pages/datenschutz.astro) - der Abschnitt "Die Desktop-App ScriptZ selbst" muss bei jeder Änderung am Daten- und Netzwerk-Verhalten der App gegengecheckt werden

Versionsnummer **nicht** manuell in der Landing pflegen - sie wird zur
Build-Zeit von der GitHub-Releases-API geholt ([`apps/landing/src/data/site.ts`](../landing/src/data/site.ts)).
Repo-Root-`CLAUDE.md` hat eine vollständige Liste der Auslöser.

## Don'ts

- **Never start the dev server on your own.** The user runs it. Use
  `pnpm typecheck` and `cargo check` for verification, and describe what
  to look for if a manual UI check is needed.
- **No `@lexical/react`.** Solid + React don't mix.
- **No new Tauri commands for data.** Persistence runs through
  `@tauri-apps/plugin-sql` from `src/lib/`. The Rust crate intentionally
  has no `invoke_handler`; if you find yourself wanting one for CRUD,
  you're probably reinventing what plugin-sql already gives you.
- **No localStorage for script content.** Persistence is SQLite.
- **No telemetry.** App works fully offline. The only network call is
  the hourly updater poll to
  `https://github.com/AgentZ-Media/ScriptZ/releases/latest/download/latest.json`
  (no body, no identifier) plus the manifest-driven binary download
  when the user clicks the update pill.
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
Kollaboration, Hook als eigener Block, **alle AI-Features**
(OpenRouter-Anbindung, automatische Skript-Zusammenfassungen, KI im
Editor — bewusst rausgenommen 2026-05-09, Gimmick mit zu wenig
Mehrwert), Plugin-System, mehrere Skript-Layouts, Industry-Standard-
Drehbuch-Layout (Courier 12pt). Plus removed in 2026-05: Projects, Tags,
Series, global Characters with bible/aliases/description, per-script
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
