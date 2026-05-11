# Phase 2 - Web-Version des Editors

Plan für eine Browser-Variante der ScriptZ-App unter
`app.write-scriptz.com`. Zweck: **Test-Editor zum Ausprobieren**, kein
Ersatz für die Desktop-App. Komplett lokal, IndexedDB als Storage,
kein Konto, kein Sync, kein PWA-Setup.

Ziel hinter dem Ziel: Web und Desktop teilen sich Editor-Engine und
Business-Logik, damit Features nur einmal gepflegt werden müssen.

## Architektur-Idee in einem Satz

Ein neues Workspace-Paket `packages/core/` enthält Editor, Lexical-
Nodes, Plugins, UI-Komponenten und Business-Logik. Die beiden Apps
sind nur noch Schalen, die einen **Storage-Adapter** plus die
plattform-spezifischen Bits (Auto-Updater, native Dialoge, etc.)
beisteuern.

```text
ScriptZ/
├── packages/
│   └── core/                       ← NEU - alles Gemeinsame
│       ├── editor/                 Lexical-Setup, Nodes, Plugins
│       ├── components/             Browser, Editor-View, Settings,
│       │                           Ideas, CommandBar, TabBar
│       ├── stores/                 dailyStats, ideas, settings,
│       │                           tabs, toasts
│       ├── lib/                    scripts, folders, ideas, lex,
│       │                           format, search, snapshots,
│       │                           characterColors, dailyWords,
│       │                           stripe, types, ...
│       └── storage/
│           └── adapter.ts          Interface, KEINE Implementierung
├── apps/
│   ├── desktop/
│   │   └── src/
│   │       └── adapters/
│   │           └── tauri.ts        SQLite via plugin-sql
│   │       └── platform/
│   │           ├── exportFile.ts   Tauri save-Dialog + plugin-fs
│   │           └── updates.ts      Auto-Updater (bleibt hier)
│   ├── web/                        ← NEU
│   │   └── src/
│   │       ├── adapters/
│   │       │   └── indexeddb.ts    Dexie-basierter Adapter
│   │       └── platform/
│   │           └── exportFile.ts   Blob-Download
│   └── landing/                    unverändert
```

**Disziplin-Regel**: `packages/core/` darf **nie** `@tauri-apps/*`
importieren. Wird mit einer ESLint-Regel (`no-restricted-imports`)
erzwungen - sonst fällt die Web-App stillschweigend auseinander.

## Was steht fest aus der Codebase-Analyse

- **Rust-Crate ist trivial** (45 Z., reine Plugin-Konfiguration). Es
  gibt **keine** `#[tauri::command]`-Handler. Aller Daten- und
  Logik-Code lebt schon in TypeScript.
- **Tauri-Kopplungspunkte** sind genau fünf Files:
  - [`apps/desktop/src/lib/tauri.ts`](../apps/desktop/src/lib/tauri.ts) - invoke-Wrapper (8 Z.)
  - [`apps/desktop/src/lib/db.ts`](../apps/desktop/src/lib/db.ts) - `@tauri-apps/plugin-sql`-Verbindung (77 Z.)
  - [`apps/desktop/src/lib/exportPdf.ts`](../apps/desktop/src/lib/exportPdf.ts) / [`exportPlaintext.ts`](../apps/desktop/src/lib/exportPlaintext.ts) - Datei-Dialog + Schreiben
  - [`apps/desktop/src/stores/updates.ts`](../apps/desktop/src/stores/updates.ts) - Auto-Updater
  - [`apps/desktop/src/App.tsx`](../apps/desktop/src/App.tsx) - `onCloseRequested`-Hook für Save-Flush
- **Lexical-Editor und alle Plugins** sind reines TS/Solid, kein
  Tauri-Bezug. Portiert ohne Anpassungen.
- **Kein Stripe, keine Lizenz, keine Konten**. (Das File
  `lib/stripe.ts` ist der **visuelle** Charakter-Stripe auf Karten,
  nichts mit Payment.) Spart einen ganzen Komplex.
- **Storage-Schema steht** (laut User-Bestätigung). Keine
  Migrations-Akrobatik nötig.

## Phasen

Streng in dieser Reihenfolge. Jede Phase ist einzeln merge-bar und
für sich verifizierbar.

### Phase A - Workspace-Paket `core` einziehen, Files umziehen (~2-3 Tage) ✅ ERLEDIGT (2026-05-11, PR #6)

Ziel: Desktop-App läuft identisch wie vorher, aber Code lebt in
`packages/core/`. Kein neues Feature, kein Web-Skelett.

**Was wirklich gemacht wurde** (Stand `e2b273a` auf main):

- ~95 Dateien via `git mv` nach [`packages/core/`](../packages/core/)
  verschoben (lib, stores, components, styles, assets). History
  erhalten dank `git mv`.
- **Platform-Abstraktion** in [`packages/core/lib/platform.ts`](../packages/core/lib/platform.ts)
  schon eingebaut (`DbConnection`-Interface, `PlatformAdapter` mit
  `getDb`, `getVersion`, `openUrl`, `revealInFolder`, `saveDialog`,
  `exportPdf`, `exportPlaintext`). Das war eigentlich für Phase C
  geplant, musste aber jetzt schon rein - sonst hätte die Zirkular-
  Kopplung core → db.ts → Tauri Phase A blockiert.
- Tauri-Implementierung in neuer [`apps/desktop/src/lib/platform.ts`](../apps/desktop/src/lib/platform.ts),
  registriert sich beim Modul-Load via `setPlatformAdapter()`.
- Updates-Store-Slot analog in [`packages/core/lib/updates.ts`](../packages/core/lib/updates.ts):
  SettingsDialog blendet "Updates"-Section auf Plattformen ohne
  registrierten Store dezent aus (Web-Case).
- ESLint-Regel `no-restricted-imports` blockt `@tauri-apps/*` in core.
- 18 Sanity-Tests in [`packages/core/lib/__tests__/`](../packages/core/lib/__tests__/)
  (extractCharacterNames, dialogWordsByCharacter,
  extractTeleprompterText, parseCharsMeta-Roundtrip,
  eqIgnoreAsciiCase, Jaccard).
- Verbleibend in `apps/desktop/src/`: `App.tsx`, `index.tsx`,
  `vite-env.d.ts`, `lib/{tauri,exportPdf,exportPlaintext,platform}.ts`,
  `stores/updates.ts`, `components/Common/UpdateIndicator.{tsx,css}`.

**Konsequenz für Phase C**: Storage-Adapter-Vollausbau hat schon das
Platform-Adapter-Pattern als Basis. Phase C wird kleiner als
ursprünglich geplant - es geht nur noch um das volle
`StorageAdapter`-Interface mit allen CRUDs als Erweiterung
von `PlatformAdapter.getDb()`.

Schritte:

1. `packages/core/` als pnpm-Workspace-Paket anlegen (`package.json`,
   `tsconfig.json`, `vite`-Library-Mode oder einfach Pfad-Imports per
   `tsconfig`-Paths).
2. Dateien aus `apps/desktop/src/` nach `packages/core/` verschieben:
   - **Editor**: gesamter `components/Editor/`-Ordner inkl. `nodes/`,
     `plugins/`, `Editor.tsx`, `ScriptView.tsx`, `ExportDialog.tsx`
     (Datei-Schreib-Teil rauslösen, siehe unten).
   - **Components**: `Browser/`, `Ideas/`, `Settings/`, `CommandBar/`,
     `TabBar.tsx`, `Common/` (außer `UpdateIndicator.tsx`).
   - **Lib**: `lex.ts`, `format.ts`, `scripts.ts`, `folders.ts`,
     `ideas.ts`, `snapshots.ts`, `search.ts`, `fts.ts`, `types.ts`,
     `characterColors.ts`, `colors.ts`, `dailyWords.ts`, `stripe.ts`,
     `runtime.ts`, `welcome.ts`, `api.ts`, `saveFlush.ts`,
     `foldersBus.ts`, `ideasBus.ts`, `scriptsBus.ts`,
     `dailyStatsBus.ts`, `scriptViewCache.ts`.
   - **Stores**: `dailyStats.ts`, `ideas.ts`, `settings.ts`,
     `tabs.ts`, `toasts.ts` (alle außer `updates.ts`).
   - **Styles**: alles aus `src/styles/`, weil beide Apps das gleiche
     Look-and-Feel haben sollen.
3. `apps/desktop/src/` importiert ab jetzt aus `@scriptz/core`. Die
   verbleibenden Files sind nur noch:
   - `App.tsx` (mit Tauri-spezifischem Close-Handler)
   - `index.tsx`
   - `lib/tauri.ts`
   - `lib/db.ts` (wandert in Phase C nach `adapters/`)
   - `lib/exportPdf.ts` / `lib/exportPlaintext.ts` (in Phase F
     zerlegt)
   - `stores/updates.ts`
   - `components/Common/UpdateIndicator.tsx`
4. **ESLint-Regel** in `packages/core/.eslintrc`:
   `no-restricted-imports` für `@tauri-apps/*`. Plus eine
   `pre-commit`- oder CI-Stelle, die das in der ganzen `core` prüft.
5. **Sanity-Tests** in `packages/core/` für die kritische Logik:
   Charakter-Reconciliation in `scripts.ts`, ALLCAPS-Behandlung,
   `dialogWordsByCharacter`, Snapshot-50-Cap. Klein halten, aber
   vorhanden - damit folgende Phasen nicht heimlich brechen.

**Akzeptanzkriterium**: `pnpm dev:desktop` und `pnpm build:desktop`
laufen unverändert. Manueller Smoke-Test: Script schreiben, Tab
schließen, Re-Open, Snapshot, Suche.

### Phase B - Cross-Platform-Hygiene (~1-1.5 Tage) ✅ ERLEDIGT (2026-05-11)

**Was wirklich gemacht wurde** (Stand `b744371` auf main):

- [`packages/core/lib/keys.ts`](../packages/core/lib/keys.ts) angelegt
  mit `isModKey()` (metaKey auf macOS, ctrlKey sonst), `formatHotkey()`/
  `K()`, `getPlatform()`, `isMac()`. Logischer Spec wie `"Mod+B"`,
  `"Mod+Shift+S"`, `"Mod+Alt+ArrowLeft"`.
- `PlatformAdapter` um `platform: "macos" | "windows" | "linux"`
  erweitert. Desktop-Adapter liest via
  `@tauri-apps/plugin-os::platform()`. Default-Fallback: `"macos"`.
- `applyPlatformToDocument()` setzt `<html data-platform="...">`, damit
  CSS-Selektoren wie `[data-platform="macos"]` greifen.
- **UI-Migration**: alle hartcodierten ⌘-Display-Strings durch `K()`
  ersetzt - SettingsDialog (gesamte `SHORTCUT_GROUPS`-Tabelle +
  Fokus-Hinweis), EditorToolbar (Block-Hints + Tooltips), TabBar
  (Tooltips), Browser (Suchfeld-Kbd + Empty-Hint), ScriptView,
  EditorRail, IdeaQuickCapture. Windows-User sehen jetzt durchgaengig
  "Ctrl+B" statt "⌘B".
- **Window-Chrome**: CSS-Custom-Property `--titlebar-traffic-width` in
  [`tokens.css`](../packages/core/styles/tokens.css) - 0 als Default,
  78px nur unter `[data-platform="macos"]`. [`TabBar.css`](../packages/core/components/TabBar.css)
  nutzt die Property statt hartcodierter Pixel. Windows/Linux kriegt
  damit keinen leeren Mac-Spacer.
- **Font-Fallback-Stacks** um Cascadia Mono, Consolas, DejaVu Sans
  Mono ergaenzt, damit Pre-Font-Load auf Win/Linux nicht in Courier
  New landet.
- 10 neue Tests fuer keys.ts (28 gruen insgesamt).
- **Hotkey-Handler-Konsolidierung bewusst NICHT gemacht**: die Plugins
  (blockHotkeys.ts, inlineFormat.ts) und App.tsx checken bereits
  `metaKey || ctrlKey` und sind damit plattform-tolerant. `isModKey()`
  ist verfuegbar, aber Bestandscode wurde nicht ueberall ersetzt -
  reine Hygiene-Aufgabe, kommt im Drive-by bei spaeteren Touches.

**Was bewusst draussen blieb** (per User-Vorgabe):

- CI-Pipeline-Erweiterung auf `windows-latest`-Matrix
- Code-Signing-Setup (Azure Trusted Signing / Authenticode)
- Finaler Windows-UX-Feinschliff (Fenster-Buttons rechts, native
  Menues)

Das erledigt der User separat an seinem eigenen Windows-Rechner.

**Urspruengliche Planung** (Stand vor Umsetzung, zur Nachvollziehbarkeit):

Ziel: `packages/core/` macht keine macOS-Annahmen mehr. Heute laufen
Hotkeys nur mit ⌘, Window-Chrome geht von Trafficlights aus, Fonts
nehmen System-Fonts ohne Fallback. Das fixen wir jetzt, weil:

- **Die Web-App braucht das sowieso**. Browser-User unter Windows und
  Linux drücken Ctrl, nicht Cmd. Ohne diesen Schritt funktioniert
  ⌘B/I/U im Web auf 80% der Geräte nicht.
- **Windows-Desktop-Build wird später trivial**, wenn das schon
  sauber ist. Tauri kann eh Windows bauen, das eigentliche
  Hindernis ist der Code, nicht die Pipeline. (Build-Pipeline und
  Code-Signing kommen separat - macht der User händisch am eigenen
  Windows-Rechner.)
- **Phase A hat den Code eh schon angefasst**. Der Diff bleibt
  überschaubar.

Schritte:

1. **Plattform-Detection in `core`** als zentrale Quelle:
   `packages/core/lib/platform.ts` mit:
   - `Platform = "macos" | "windows" | "linux"`
   - `getPlatform(): Platform` - liest aus einem injected Wert
     (Adapter setzt ihn beim App-Start - Desktop via
     `@tauri-apps/plugin-os::platform()`, Web via
     `navigator.userAgent`-Sniffing oder `userAgentData`).
   - `isMac(): boolean` als Convenience.
2. **Modifier-Key-Helper**:
   - `isModKey(e: KeyboardEvent): boolean` → `e.metaKey || e.ctrlKey`.
     Auf macOS ist `metaKey` Cmd, auf Win/Linux nutzt der User
     `ctrlKey`. So zählt beides.
   - Audit aller Stellen mit `metaKey` und ggf. `event.key`-Handling
     in `packages/core/components/Editor/plugins/blockHotkeys.ts`,
     `inlineFormat.ts`, `smartEnter.ts`, CommandBar (`⌘P`), TabBar
     (`⌘T`, `⌘W`), Ideas (`⌘I`). Überall `isModKey(e)` einsetzen.
3. **Hotkey-Anzeige-Strings**:
   - `formatHotkey("Mod+B")` → `"⌘B"` auf macOS, `"Ctrl+B"` sonst.
   - Plus für Spezialfälle: `Mod+Shift+T` etc.
   - Alle hartcodierten `⌘`-Strings in Tooltips, Menü-Labels,
     Block-Picker, Onboarding durchgehen. Empirischer Suchstart:
     grep nach `⌘` über die ganze `core`-Codebase.
4. **Window-Chrome plattform-aware**:
   - Root-Element bekommt `data-platform="macos"|"windows"|"linux"`
     beim App-Start.
   - CSS-Custom-Property `--titlebar-pad-left` ist nur unter
     `[data-platform="macos"]` gesetzt (für die Trafficlights).
     Sonst 0.
   - TabBar nutzt diese Property statt hartcodierter Pixel.
   - Web setzt automatisch `linux` oder `windows` (Webview hat eh
     keine Trafficlights), Desktop liefert den echten Wert.
5. **Font-Fallback-Stacks**:
   - [`apps/desktop/src/styles/fonts.css`](../apps/desktop/src/styles/fonts.css) (wandert in
     Phase A nach `core/styles/`) auditieren.
   - Nackte System-Fonts (`SF Pro`, `San Francisco`, etc.) durch
     vollständige Stacks ersetzen: `"SF Pro Display", -apple-system,
     BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`. Auf
     Windows fällt das sauber auf Segoe UI, im Web auf den
     plattform-üblichen System-Font.
   - Custom-Fonts (falls vorhanden, z.B. Schreibmaschinen-/Mono-
     Font für den Editor) werden gebundlet und per `@font-face`
     geladen - das funktioniert plattform-übergreifend von selbst.
6. **Keine Build-Pipeline-Änderung**. CI-Workflow und
   Windows-Signing bleiben außen vor, das verifiziert der User
   separat am eigenen Windows-Rechner.

**Akzeptanzkriterium**: Auf macOS verhält sich alles identisch zu
vorher. Im Browser (Phase C+) reagieren ⌘B/I/U **und** Ctrl+B/I/U
korrekt. Wenn der User später `tauri build --target windows` baut,
muss er nur die CI- und Signing-Sachen lösen - der Code selbst läuft.

### Phase C - Storage-Adapter-Interface (~1 Tag) ✅ ERLEDIGT (2026-05-11)

**Was wirklich gemacht wurde** (Stand auf main):

- Neues [`packages/core/lib/storage.ts`](../packages/core/lib/storage.ts)
  mit `StorageAdapter`-Interface (30 typisierte CRUD-Methoden:
  createScript, listFolders, createSnapshot, globalSearch, ...) plus
  `setStorageAdapter()` / `getStorageAdapter()` Slot - analog zum
  PlatformAdapter aus Phase A.
- `api.ts` refactored: die bisherige `api`-Facade ist jetzt
  `sqlBackedAdapter: StorageAdapter`, registriert sich bei Modul-Load
  via `setStorageAdapter()`. Der weiterhin exportierte `api`-Symbol
  ist ein Proxy auf `getStorageAdapter()` - **keine** der 19
  Bestands-Call-Sites musste angepasst werden.
- Behavior auf Desktop: 1:1 identisch (selbe Funktionen, selbe SQL).
- Effekt fuer spaeter: Phase E (IndexedDB-Adapter) kann via
  `setStorageAdapter(webImpl)` einen Dexie-basierten Adapter
  registrieren und so die SQL-Implementierung komplett ersetzen,
  ohne in core/lib/scripts.ts etc. einzugreifen.
- 3 neue Tests fuer die Slot-Mechanik (31 gruen insgesamt) -
  validieren dass der `api`-Proxy live ueber den Slot geht und ein
  spaeterer Adapter-Swap sofort durchgreift.

**Was bewusst NICHT gemacht wurde** (Scope-Disziplin):

- Schema-aware Logik (Character-Reconciliation, Word-Count-Delta,
  Snapshot-Cap) wurde **nicht** in den Adapter gezogen. Sie lebt
  weiterhin in core/lib/*.ts und ist damit fuer ALLE Adapter
  wiederverwendbar - ein zukuenftiger Web-Adapter mit Dexie wuerde
  dieselben Reconciliation-Aufrufe machen, nur die zugrunde
  liegenden CRUD-Primitive auswechseln.
- Bestehende lib-Files (scripts.ts, folders.ts, ideas.ts, snapshots.ts,
  ...) wurden **nicht** in einen apps/desktop/adapters/-Ordner
  verschoben. Sie sind nach wie vor Teil von core - aber nur als
  Default-Implementierung. Wer ueber den Slot kommt, sieht sie nie.
- **Original-Plan war:** "Editor-Code in core kennt SQLite nicht mehr"
  (high-level CRUD ueber Adapter). **Realer Stand:** SQL bleibt in
  core, der Slot kapselt sie nur. Web-Builds koennen sql.js laden
  (DbConnection-tauglich, ~1 MB WASM) ODER per
  `setStorageAdapter(dexieImpl)` die Default-Impl komplett ersetzen.
  Auswahlpunkt ist offen.

**Urspruengliche Planung** (Stand vor Umsetzung, zur Nachvollziehbarkeit):

Ziel: Editor-Code in `core` kennt SQLite nicht mehr. Stattdessen
ruft er ein Interface auf, das der Desktop-Code per Adapter erfüllt.

1. `packages/core/storage/adapter.ts` definiert ein TS-Interface
   `StorageAdapter` mit den Methoden, die die Editor-/UI-Schicht
   braucht. Grobe Liste (final aus den heutigen Aufrufstellen
   ableiten):
   - `listScripts(opts)`, `getScript(id)`, `createScript(input)`,
     `updateScript(id, patch)`, `archiveScript(id)`,
     `restoreScript(id)`, `deleteScript(id)`
   - `listFolders()`, `createFolder()`, `renameFolder()`,
     `deleteFolder()`, `moveScript(s)`
   - `listIdeas()`, `createIdea()`, `updateIdea()`, `deleteIdea()`,
     `convertIdeaToScript()`
   - `listSnapshots(scriptId)`, `createSnapshot(...)`,
     `restoreSnapshot(...)`
   - `searchGlobal(query, limit)` - kapselt FTS
   - `getSetting/setSetting`, `getAppState/setAppState`
   - `getCharacterColor`, `setCharacterColorOverride`, `listCharacterColors`
   - `logDailyWords(date, delta)`, `getDailyWordSeries(range)`
2. `apps/desktop/src/adapters/tauri.ts` enthält die heutige
   `db.ts`-Logik, plus die Implementierungen der oben genannten
   Methoden (die meisten existieren schon in `scripts.ts` etc. -
   einfach in den Adapter umziehen oder dünn delegieren).
3. Die Module in `core/lib/` rufen statt direkt auf die DB jetzt den
   übergebenen Adapter. **Provider-Pattern**: ein Solid-Context
   stellt den Adapter bereit, jede Komponente/Lib zieht ihn da raus.
4. Tests aus Phase A nochmal grün ziehen mit dem `tauri`-Adapter.

**Akzeptanzkriterium**: Desktop-App läuft, kein Verhalten geändert.
Ein Grep nach `@tauri-apps/plugin-sql` in `packages/core/` ergibt
nichts.

### Phase D - `apps/web/` Skelett (~1 Tag)

Ziel: Im Browser läuft ein leerer Editor, der aus `core` kommt - noch
ohne Persistenz.

1. `apps/web/` mit Vite+Solid (TypeScript) bootstrappen. `index.html`,
   `main.tsx`, ein `App.tsx`-Stub.
2. Editor aus `core` mounten. Storage-Adapter ist ein **In-Memory-
   Stub** (Map im RAM), nur damit was funktioniert.
3. Tippen, Block-Hotkeys (⌘1..7), Charakter-Erkennung, Tab-Picker -
   alles muss out-of-the-box gehen, weil keine Tauri-Annahmen drin
   sind. Wenn nicht: Bug in Phase A, B oder C, zurück und fixen.
4. Build und Dev-Server konfigurieren.

**Akzeptanzkriterium**: `pnpm dev:web` startet, Editor lädt, Schreiben
funktioniert. Beim Reload sind die Daten weg - das ist hier OK.

### Phase E - IndexedDB-Adapter via Dexie (~1-2 Tage)

Ziel: Web-App speichert dauerhaft im Browser.

1. **Dexie** als Dependency in `apps/web/`. Schema definieren, das
   1:1 die SQLite-Tabellen spiegelt: `scripts`, `folders`, `ideas`,
   `snapshots`, `character_colors`, `daily_word_log`, `settings`,
   `app_state`. FTS-Index wird separat in Phase F gebaut (Dexie hat
   kein FTS5).
2. `apps/web/src/adapters/indexeddb.ts` erfüllt das `StorageAdapter`-
   Interface aus `core`. Für jede Methode die Dexie-Variante
   implementieren - Reihenfolge: erst Scripts/Folders/Ideas, dann
   Snapshots, dann Daily-Words, dann Settings.
3. **Persistenz-Schutz**: beim ersten Schreibvorgang stilles
   `navigator.storage.persist()` aufrufen. Best-effort, ohne
   User-Dialog.
4. **Daten-Limit**: Karten in der UI cachen wir heute eher
   großzügig. Im Web bei 200+ langen Scripts mal stresstesten und
   ggf. Lazyloading anziehen - aber nicht spekulativ, erst wenn's
   stockt.

**Akzeptanzkriterium**: Script schreiben, Reload, Script ist noch da.
Folder/Ideas/Snapshots ebenso. Sortierung und Filter im Browser
funktionieren analog zur Desktop-App.

### Phase F - Browser-Ersatz für native Features (~1-2 Tage)

Ziel: Volltextsuche, PDF-Export und Schließen-Flush funktionieren im
Browser.

1. **FTS-Suche**: **MiniSearch** als Default - leichtgewichtig, pure
   JS, baut Index in-memory beim App-Start (oder lazy nach erstem
   Suchaufruf). Der Adapter hält einen MiniSearch-Index synchron mit
   IndexedDB: bei `createScript`/`updateScript` Index aktualisieren.
   Fallback-Option, falls Performance/Genauigkeit nicht reicht:
   sql.js (WASM) mit FTS5 - identische Query-Syntax wie Desktop, aber
   ~700 KB Bundle.
2. **PDF-Export**: Aktueller [`exportPdf.ts`](../apps/desktop/src/lib/exportPdf.ts)
   prüfen, ob die PDF-Erzeugung schon mit einer browser-tauglichen
   Lib läuft (z.B. pdf-lib oder jsPDF) oder ob die Rendering-Schicht
   Tauri-Calls macht. Falls Lib browser-tauglich → in `core` ziehen,
   nur den **finalen "Datei speichern"-Call** plattform-spezifisch
   trennen:
   - Desktop: `apps/desktop/src/platform/file.ts` macht
     Tauri-Save-/Open-Dialog + `plugin-fs::writeFile`/`readFile`.
   - Web: `apps/web/src/platform/file.ts` triggert
     `Blob` + `<a download>` für Save bzw. `<input type="file">`
     für Open. File-System-Access-API ist Bonus, wenn verfügbar.
   - Beide erfüllen ein dünnes `PlatformFile`-Interface aus `core`
     mit `saveAs(suggestedName, mimeType, bytes)` und
     `openFile(accept) -> Promise<{name, bytes}>`. Dieses Interface
     wird auch von Phase G (.scriptz-Import/Export) genutzt - also
     direkt sauber bauen, nicht nur für PDF.
3. **Plaintext-Export**: identisches Muster, viel simpler.
4. **Save-Flush beim Schließen**: Web-Pendant zum
   Tauri-`onCloseRequested` ist `beforeunload`/`pagehide`. In
   `apps/web/App.tsx` einhängen, ruft `flushPendingSaves()` aus
   `core`.
5. **Auto-Updater fällt weg**. In `apps/web/` keine Update-Pille.
   Stattdessen im Header oder Footer ein dezenter Link "Volle
   Funktionen → Desktop-App laden", der zur Landing führt.
6. **Onboarding** in `core` ist plattform-neutral, sollte direkt
   gehen. Beim ersten Öffnen der Web-App: gleicher 3-Schritt-Flow,
   aber Schritt-3-CTA "Erstes Drehbuch anlegen" bleibt im Browser.

**Akzeptanzkriterium**: Suche findet Scripts, PDF-Download
funktioniert, Browser-Tab schließen verliert keine ungespeicherten
Änderungen.

### Phase G - `.scriptz`-Dateiformat (Import/Export, ~0.5-1 Tag)

Ziel: Klassisches "Datei → Speichern als" und "Datei → Öffnen" mit
einem eigenen Dateiformat. Funktioniert in **beiden** Apps. Kein
Sync, keine Cloud - einfach ein Container, den User per Mail,
Dropbox, USB-Stick weitergeben können.

**Format-Definition** in `packages/core/lib/scriptzFile.ts`:

```json
{
  "format": "scriptz",
  "version": 1,
  "exportedAt": "2026-05-11T12:34:56.000Z",
  "script": {
    "title": "Mein Drehbuch",
    "contentJson": { /* Lexical state */ },
    "characters": [
      { "name": "MAX", "color": "#7aa2f7", "share": 0.42 }
    ],
    "highlightingEnabled": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

Bewusst **nicht** mitgenommen in V1:

- **`folder_id`** - existiert auf dem Zielgerät nicht. Import landet
  in der Wurzel, User filed selbst ein.
- **Snapshots** - nur aktueller Stand. Lässt sich später als
  `script.snapshots: [...]` ergänzen, ohne Format-Bruch (`version: 2`).
- **Globale Character-Color-Overrides** aus der `character_colors`-
  Tabelle. Die im File mitgelieferten `characters[].color` reichen
  fürs Wiedergeben - App-weite Overrides bleiben App-weit.
- **App-State, Settings, Ideas, Daily-Word-Log** - das ist
  Geräte-State, nicht Script-Inhalt.

**Datei-Endung**: `.scriptz` (eindeutig, googelbar, keine
Kollision). `.sz` bewusst verworfen, weil das eine Snappy-
Komprimierung ist und andere Tools das auch nutzen.

**MIME-Type**: `application/x-scriptz+json`.

Schritte:

1. **Serializer/Deserializer in `core`** (`scriptzFile.ts`):
   - `serializeScript(script): ScriptzFileV1` - reine Pure-Function.
   - `parseScriptzFile(bytes): ScriptzFileV1` - validiert
     `format === "scriptz"`, `version`, prüft Pflichtfelder,
     wirft beschreibende Fehler bei kaputten Dateien.
   - `applyScriptzFile(file, adapter): Promise<string>` - erzeugt
     via `adapter.createScript(...)` einen neuen Script-Datensatz
     und gibt die neue ID zurück.
2. **UI-Stellen**:
   - **Export**: Eintrag im bestehenden `ExportDialog.tsx` neben
     "PDF" und "Plaintext": "ScriptZ-Datei (.scriptz)". Nutzt
     `PlatformFile.saveAs(title + ".scriptz", "application/x-scriptz+json", bytes)`.
   - **Import**: Button im `Browser/`-Header neben "Neues Script"
     (Icon + "Importieren"). Plus optional ein zusätzlicher Eintrag
     in der CommandBar (⌘P) "Datei importieren". Nutzt
     `PlatformFile.openFile(".scriptz,application/x-scriptz+json")`.
   - **Doppelklick-Öffnen** im Finder/Explorer wäre nett, lassen wir
     aber bewusst weg (kostet Tauri-Manifest-Eintrag für File-
     Associations und Browser kann das ohnehin nicht). Kann später
     auf Desktop nachgereicht werden.
3. **Edge-Cases**:
   - Title-Kollision: importiertes "Mein Drehbuch" und vorhandenes
     "Mein Drehbuch" leben einfach nebeneinander - Scripts haben
     UUIDs, keine eindeutigen Titel. Kein "Überschreiben?"-Dialog
     nötig.
   - Falsche/kaputte Datei: Toast mit klarer Meldung. Nicht crashen.
   - Sehr großes `content_json` (theoretisch mehrere MB): einfach
     durchreichen, kein Streaming nötig - Lexical-States sind in der
     Praxis < 1 MB.
4. **Tests**: Roundtrip-Test in `packages/core/`: Script anlegen,
   serialisieren, parsen, applyien, vergleichen. Fängt Regressionen,
   falls jemand später ein Script-Feld vergisst zu serialisieren.

**Akzeptanzkriterium**: Auf Desktop ein Script exportieren →
`.scriptz`-Datei liegt auf der Platte. Datei im Web öffnen → Script
ist drin, lässt sich weiter bearbeiten. Umgekehrt genauso.

### Phase H - Disclaimer, Branding, Deploy (~0.5 Tag)

1. **Disclaimer-Banner** im Web-App-Header, zwei Zeilen:

   > "Test-Editor im Browser. Deine Drehbücher liegen lokal auf
   > diesem Gerät, kein Sync, kein Konto. Für die volle Erfahrung
   > → Desktop-App laden."

   Persistent oder per "verstanden"-Button wegklickbar, aber auch
   beim erneuten Besuch wieder einblenden, wenn Daten weg sind
   (z.B. nach Browser-Datenlöschung).
2. **Onboarding mit Web-Hinweis**: Der bestehende 3-Schritt-Flow
   läuft im Web identisch, aber Schritt 1 (oder ein extra Vor-
   Schritt) bekommt einen zusätzlichen Hinweisblock:

   > "Du nutzt gerade die Webversion zum Ausprobieren. Sie läuft
   > komplett in deinem Browser, ohne Konto, ohne Sync. Für den
   > Alltag empfehlen wir die Desktop-App - schneller, offline-
   > stabil, eigene Daten-Datei. → Hier laden."

   Sauber gelöst über eine Prop am Onboarding-Component in `core`,
   die nur die Web-App setzt - kein eigener Onboarding-Fork.
3. **Versionierung**: Web-App zeigt eigene Build-Version (aus
   `apps/web/package.json`), nicht die Desktop-Version. Sonst
   verwirrt's. Im Footer klein.
4. **Vercel-Project** für `apps/web/`:
   - Root Directory `apps/web`
   - Build-Command `pnpm build`
   - Output Directory `dist`
   - Domain `app.write-scriptz.com` (DNS-Setup macht der User).
5. **Landing** anpassen: Im Hero oder im Download-Block einen Link
   "Direkt im Browser testen → app.write-scriptz.com". Texte gemäß
   Konsistenz-Tabelle in [CLAUDE.md](../CLAUDE.md) checken.

**Akzeptanzkriterium**: `app.write-scriptz.com` erreichbar,
Disclaimer sichtbar, Editor schreibbar, Daten überleben Reload,
Landing verlinkt drauf.

## Pflegealltag danach (Hauptgewinn)

**Neues Editor-Feature**: Eine Stelle in `packages/core/editor/`.
Beide Apps haben's nach dem nächsten Build.

**Neue Datenoperation** (z.B. "Tags pro Script"):

1. Methode in `StorageAdapter`-Interface erweitern.
2. **Beide** Adapter-Implementierungen (Tauri + IndexedDB) erweitern -
   TypeScript meckert, bis das gemacht ist.
3. UI in `core` nutzt die neue Methode.
4. Wenn das neue Feld auch in `.scriptz`-Dateien überleben soll:
   `serializeScript`/`parseScriptzFile` in `packages/core/lib/scriptzFile.ts`
   mitziehen. TypeScript zeigt das durch das `ScriptzFileV1`-Typing
   ebenfalls an, sobald der Script-Typ erweitert wird.

→ Doppelarbeit nur in den dünnen Adapter-Files plus ggf. dem
File-Serializer, nie in der eigentlichen Logik.

**Bugfix in Charakter-Erkennung / Format / Search**: Eine Stelle in
`core`. Fertig.

**Landing-Konsistenz**: gilt unverändert (siehe [CLAUDE.md](../CLAUDE.md)).
Plus jetzt zusätzlich: bei nicht-trivialen Editor-Änderungen kurz
prüfen, ob der Disclaimer-Text auf `app.write-scriptz.com` noch
stimmt.

## Risiken & Gotchas

- **Disziplin im `core`-Ordner**. ESLint-Regel ist Pflicht, nicht
  optional. Sonst importiert in drei Wochen jemand
  `@tauri-apps/plugin-fs` in einem `core`-File und die Web-App
  bricht, ohne dass es sofort auffällt.
- **Phase A ist zäh, aber risikoarm**. Viele Files umziehen, viele
  Import-Pfade ändern. Empfehlung: ein einziger PR pro Phase, klein
  halten geht hier nicht, dafür gut testen.
- **FTS-Genauigkeit im Web**: SQLite FTS5 BM25 ist exzellent.
  MiniSearch ist gut, aber nicht identisch. Wenn die Suche im Web
  spürbar schlechter trifft, auf sql.js (WASM) umsteigen - kostet
  Bundle-Size, gewinnt Konsistenz. Erst messen, dann entscheiden.
- **Browser-Storage-Quoten**: IndexedDB hat keine harten Limits, aber
  Browser können bei Speicherdruck räumen. Mit `storage.persist()`
  weitgehend abgesichert. Disclaimer macht ehrlich, dass es ein
  Test-Editor ist.
- **Safari-ITP**: nicht-installierte Sites können nach ~7 Tagen
  Inaktivität geräumt werden. Für einen Test-Editor verkraftbar -
  per Disclaimer adressieren.
- **Service-Worker bewusst NICHT**. Kein Offline-Cache, kein PWA. Wer
  die Tab-Seite einmal geladen hat und das Netz verliert, läuft
  trotzdem weiter - das macht der Browser-Tab-Cache von alleine,
  solange der Tab offen bleibt. Reicht für den Zweck.
- **Solid-Reactivity in `core`**: Aufpassen, dass keine Tauri-
  spezifischen Solid-Signale oder Stores in der Web-App leaken (z.B.
  ein `updateAvailable`-Signal, das nur Desktop füllen kann). Lösung:
  solche Signale gehören in `apps/desktop/`, nicht in `core/stores/`.

## Aufwand-Zusammenfassung

| Phase | Aufwand | Risiko |
|---|---|---|
| A - Refactor in `core` | 2-3 Tage | niedrig, aber zäh |
| B - Cross-Platform-Hygiene | 1-1.5 Tage | niedrig |
| C - Storage-Adapter | 1 Tag | niedrig |
| D - Web-Skelett | 1 Tag | niedrig |
| E - IndexedDB-Adapter | 1-2 Tage | mittel (Schema-Sorgfalt) |
| F - FTS + PDF/Plain + Flush | 1-2 Tage | mittel (FTS-Qualität) |
| G - `.scriptz` Import/Export | 0.5-1 Tag | niedrig |
| H - Disclaimer + Deploy | 0.5 Tag | niedrig |
| **Summe** | **8-12 Tage** | |

Realistisch in **~2-2.5 fokussierte Wochen** machbar.

**Hinweis Windows-Desktop**: Mit Phase B ist der Code Windows-ready.
Was danach für einen echten Windows-Build noch fehlt - CI-Pipeline
auf `windows-latest`-Matrix, Code-Signing (Azure Trusted Signing
oder Authenticode-Cert), Trafficlight-Fenster auf Windows-Style
final - macht der User händisch am eigenen Windows-Rechner, separat
vom Web-App-Plan.

## Offene Fragen

Alle drei vor Plan-Schreiben offenen Punkte sind geklärt:

- **DNS für `app.write-scriptz.com`**: macht der User selbst, kein
  Handlungsbedarf.
- **Onboarding im Web**: gleicher 3-Schritt-Flow wie Desktop, plus
  zusätzlicher Web-Hinweisblock im ersten Schritt (siehe Phase H).
- **Daten-Migration Web ↔ Desktop**: kein automatischer Sync, aber
  manueller Austausch über `.scriptz`-Dateien (Phase G). Wird im
  Disclaimer ehrlich kommuniziert.

Bereit für Phase A.
