# ScriptZ Desktop - Claude context

Fast, local script editor for short-form video creators (TikTok, Reels,
YouTube Shorts). Tauri 2 shell + Solid + TypeScript + Lexical editor
(vanilla, no React). All persistence, search, export and CRUD lives in
TypeScript via `@tauri-apps/plugin-sql`; the Rust crate is plugin
wiring + schema migrations only. macOS Apple Silicon + Windows x64 are
first-class; Linux not (yet) shipped.

This codebase was deliberately stripped down in 2026-05. The original
spec (`ScriptZ-Projektplan.md`) describes a larger system; **treat the
actual code as the source of truth, not the spec**, when they disagree.

## Path-scoped Rules

Details lazy-load aus [`/.claude/rules/`](../../.claude/rules/):

- [`desktop-architecture.md`](../../.claude/rules/desktop-architecture.md)
  - Vollständiges `src/lib/` und `src-tauri/`-Layout, das per-script
  Character-Modell, Editor → DB Data-Flow. Lädt bei `apps/desktop/src/**`
  und `apps/desktop/src-tauri/**`.
- [`desktop-release.md`](../../.claude/rules/desktop-release.md) -
  In-App-Updater (`tauri-plugin-updater` + minisign), Six-Spot Version
  Bump, macOS-`xattr`/SmartScreen-Erstinstall, Windows-Toolchain-Setup.
  Lädt bei Versionsdateien und `src-tauri/**`.
- [`/.claude/rules/release.md`](../../.claude/rules/release.md) -
  zentrale Release-Pipeline (4 Jobs, Asset-Naming, Recovery).

## Top-Level Layout

```
src/                    Solid frontend (TypeScript)
src-tauri/              Rust backend (Tauri 2)
src/assets/fonts/       iA Writer Quattro woff2 (SIL OFL)
ScriptZ-Projektplan.md  Original spec — outdated; superseded by the code
package.json            pnpm scripts (dev, tauri:dev, tauri:build, typecheck)
tsconfig.json
vite.config.ts
```

Detail-Layout der Subverzeichnisse: siehe `desktop-architecture.md`.

## Conventions (wichtig)

- **TypeScript owns persistence.** All SQL goes through plugin-sql via
  the modules in `src/lib/`. There are no Tauri commands for data
  access - the Rust side opens no DB connections.
- **All entities use UUIDv4 string IDs.** Never auto-increment integers.
- **Timestamps** are JS Unix-millis (`Date.now()`).
- **No `any` in TypeScript.** Data types in `src/lib/types.ts`.
- **Lexical: vanilla only.** No `@lexical/react`. We
  `editor.setRootElement(ref)` and **must** call
  `registerRichText(editor)` - without it,
  `CONTROLLED_TEXT_INSERTION_COMMAND` has no default handler and typing
  silently breaks for any selection that lands on an element-type anchor.
- **Visual ALLCAPS in Charakter blocks is CSS-only** (`text-transform`).
  Mutating text nodes inside a node-transform on every keystroke fights
  Lexical's selection model and freezes input after one or two
  characters. Only the parent `characterName` attribute is synced via a
  transform - that's safe because it doesn't touch text-node children.
- **Empty blocks must be CHILDLESS** when handed to Lexical. Don't
  pre-append `$createTextNode("")` - Lexical's reconciler then renders
  nothing useful and WebKit can't place a caret. With no children,
  the reconciler injects a managed `<br>` placeholder automatically.
- **Solid stores:** small modules under `src/stores/`. Components subscribe
  via getters; mutations go through store actions.

## Commands

```bash
pnpm install                # installs node deps
pnpm tauri:dev              # full app with hot-reload + Rust rebuild
pnpm dev                    # Vite-only frontend (no Tauri shell)
pnpm typecheck              # tsc --noEmit
pnpm build                  # Vite prod bundle → dist/
pnpm tauri:build            # native bundle at
                            #   macOS:   src-tauri/target/release/bundle/macos/ScriptZ.app
                            #           + .dmg in bundle/dmg/
                            #   Windows: src-tauri/target/release/bundle/nsis/
                            #           ScriptZ_<version>_x64-setup.exe
cargo check --manifest-path src-tauri/Cargo.toml
```

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
  keystroke.** It will break typing after 1-2 characters. Use CSS or
  intercept `CONTROLLED_TEXT_INSERTION_COMMAND` to transform the payload
  before insertion.

## Out of scope (per spec + post-cleanup)

Drehtage / Drehplanung, Locations als Entität, Notizen-Block, Person-am-
Charakter, Bilder, ElevenLabs, Drag&Drop, Cloud-Sync, Accounts, Telemetry,
Kollaboration, Hook als eigener Block, **alle AI-Features**
(OpenRouter-Anbindung, automatische Skript-Zusammenfassungen, KI im
Editor - bewusst rausgenommen 2026-05-09, Gimmick mit zu wenig
Mehrwert), Plugin-System, mehrere Skript-Layouts, Industry-Standard-
Drehbuch-Layout (Courier 12pt). Plus removed in 2026-05: Projects, Tags,
Series, global Characters with bible/aliases/description, per-script
display-name/color overrides, vibrancy chrome.

## Troubleshooting

- **`sqlite locked`** - should not happen with WAL + r2d2 pool; if it
  does, check no migration fired mid-write.
- **Typing dies after a few keystrokes** - this is the
  `registerRichText` regression. The editor MUST call
  `registerRichText(editor)` after `setRootElement`.
- **Empty Charakter block won't accept input** - pre-appending an empty
  `$createTextNode("")` is the cause; leave the new ElementNode childless
  and call `next.select(0, 0)` instead.
- **A character keeps re-appearing in the pillbar after delete** - the
  pillbar reflects what's in `content_json`. If the name still appears
  in any Charakter block, it'll be re-added on the next save. Empty the
  block (or change the name) instead of trying to delete the character.

## Landing mitziehen

Bei jeder User-sichtbaren App-Änderung Landing-Konsistenz prüfen -
vollständige Auslöserliste in
[`/.claude/rules/landing-consistency.md`](../../.claude/rules/landing-consistency.md).
