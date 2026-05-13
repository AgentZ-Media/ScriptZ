---
paths:
  - "apps/desktop/**"
  - "apps/web/**"
  - "packages/core/**"
---

# Feature-Parity Desktop ↔ Web

**Grundregel:** Was ein User merkt, soll in beiden Apps identisch
funktionieren. Wenn es nicht geht, muss die Differenz dokumentiert und
ehrlich kommuniziert sein (Web-Disclaimer, Settings-Hinweis).

## Was zwingend in `packages/core/` lebt

Alles, was auf beiden Plattformen identisch sein muss:

- Editor-Engine, Lexical-Nodes, alle Plugins (Hotkeys, Block-Picker,
  Smart-Enter, Inline-Format, Character-Reconciliation)
- UI-Komponenten: Browser, ScriptView, EditorView, Settings, Ideas,
  CommandBar, TabBar, Onboarding, Export-Dialog, gemeinsames Chrome
- Stores: tabs, ideas, dailyStats, settings, toasts (alles außer
  desktop-only `updates`)
- Business-Logik: `scripts.ts`, `folders.ts`, `ideas.ts`,
  `snapshots.ts`, `search.ts`/`fts.ts`, `format.ts`, `lex.ts`,
  `characterColors.ts`, `dailyWords.ts`, `scriptzFile.ts`, ...
- Styles/Tokens, Schrift-Setup, Farbpaletten
- PDF-Generator und Plain-Text-Export (Pure-Function, schreibt Bytes;
  das *Speichern* ist plattform-spezifisch, siehe unten)
- Plattform-Detection (`isModKey`, `K()` / `formatHotkey`,
  `data-platform`-Attribut auf `<html>`)

`packages/core/` darf **nie** `@tauri-apps/*` importieren - ESLint-Rule
blockt das. Browser-only-Annahmen (`window`-Zugriffe) nur hinter
Feature-Detection.

## Was bewusst pro App getrennt bleibt (Adapter-Pattern)

| Bereich | Desktop (`apps/desktop/`) | Web (`apps/web/`) |
|---|---|---|
| `StorageAdapter` | [`adapters/`](apps/desktop/src/) → SQLite via `@tauri-apps/plugin-sql`, FTS5 | [`adapters/indexeddb.ts`](apps/web/src/adapters/indexeddb.ts) → Dexie + MiniSearch |
| `PlatformAdapter.saveAs/openFile` | Native Tauri-Dialoge + `plugin-fs` | Blob-Download via `<a download>` / verstecktes `<input type="file">` |
| `PlatformAdapter.openUrl` / `revealInFolder` | Tauri-Shell / `plugin-opener` | `window.open` / No-op |
| Auto-Updater | [`stores/updates.ts`](apps/desktop/src/stores/updates.ts) + `UpdateIndicator` | Entfällt - SettingsDialog blendet "Updates" aus, wenn Slot leer |
| Save-Flush beim Schließen | Tauri `onCloseRequested` → `flushAll()` | `beforeunload` + `pagehide` → `flushAll(2000)` |
| Window-Chrome | macOS-Trafficlight-Spacer (CSS-Property `--titlebar-traffic-width`) | `data-shell="web"` deaktiviert den Mac-Spacer im Browser |
| Web-only Chrome | - | [`WebDisclaimerBanner`](apps/web/src/components/), [`DesktopOnlyGate`](apps/web/src/components/) (< 1024 px) |
| Code-Signing / Release | macOS-Signing, GitHub-Release mit `latest.json` | Vercel-Deploy auf Push zu `main` |

## Wenn du ein neues Feature baust

1. **Default**: Code in `packages/core/`. Keine `@tauri-apps/*`-Imports
   (ESLint blockt das ohnehin), keine Browser-only-Annahmen
   (`window`-Zugriffe nur hinter Feature-Detection).
2. **Wenn das Feature einen neuen Storage-Zugriff braucht**:
   `StorageAdapter`-Interface in
   [`packages/core/lib/storage.ts`](packages/core/lib/storage.ts)
   erweitern. TypeScript meckert dann in **beiden** Adapter-Impls -
   Tauri-Adapter UND IndexedDB-Adapter mit aktualisieren, sonst bricht
   die jeweils andere App stillschweigend.
3. **Wenn das Feature einen neuen Platform-Zugriff braucht** (Dialoge,
   OS-Info, externes Öffnen): `PlatformAdapter` in
   [`packages/core/lib/platform.ts`](packages/core/lib/platform.ts)
   erweitern. Beide Apps müssen die neue Methode implementieren -
   Desktop via Tauri, Web via Browser-API oder No-op + ehrliche
   Fehlermeldung.
4. **Wenn das Feature .scriptz-Daten betrifft**:
   [`scriptzFile.ts`](packages/core/lib/scriptzFile.ts) mit anpassen,
   sonst überleben die neuen Felder den Import/Export-Roundtrip nicht.
   Format-Version hochziehen, wenn die Änderung nicht additiv ist.
5. **Verifikation**: `pnpm dev:desktop` UND `pnpm dev:web` mindestens
   einmal anwerfen und das Feature in beiden Welten ausprobieren.
   Type-Check (`pnpm typecheck`) deckt die Adapter-Vollständigkeit ab,
   aber nicht die Laufzeit-Wirkung.

## Wann eine Differenz OK ist

Wenn die Plattform-Limits es erzwingen - z.B.:

- **Auto-Update gibt's nur auf Desktop**, weil Browser keinen
  installierten Binary haben. Settings blendet die Sektion im Web aus.
- **MiniSearch (Web) vs. SQLite-FTS5 (Desktop)**: gleiche User-UX,
  unterschiedliche Tech. Wenn die Suchqualität spürbar
  auseinanderläuft, später auf sql.js (WASM) wechseln.
- **Datei-Zugriff**: native Save-Dialoge geben einen Pfad zurück (mit
  Reveal-in-Finder), Blob-Downloads nicht. Toast-Wording adaptiv
  ("Export gespeichert" mit Reveal vs. "Datei heruntergeladen").
- **Daten-Persistenz**: SQLite ist hart persistent, IndexedDB kann der
  Browser unter Speicherdruck räumen. Web-Disclaimer macht das ehrlich.

Solche Differenzen müssen für den User sichtbar/spürbar konsistent
sein - "tut dasselbe, sieht gleich aus, sagt das Gleiche, wo nötig
ehrlich anders". Nie eine App-Variante haben, die ein Feature *still*
weglässt.
