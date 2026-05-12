# ScriptZ - Monorepo

pnpm-Workspace mit drei Apps und einem geteilten Core:

- [`packages/core/`](packages/core/) - **alle gemeinsame Logik**: Editor,
  Lexical-Nodes, Plugins, UI-Komponenten (Browser, Settings, Ideas,
  CommandBar, TabBar, Onboarding), Stores, Business-Logik (scripts,
  folders, ideas, snapshots, search, format, characterColors,
  dailyWords, scriptzFile, ...), Styles/Tokens. Beide Apps importieren
  von hier via `@scriptz/core`. Darf **nie** `@tauri-apps/*` importieren
  (ESLint-Rule blockt das).
- [`apps/desktop/`](apps/desktop/) - die Tauri-Desktop-App (Solid + Rust + Lexical).
  Dünne Schale: registriert ihren `PlatformAdapter` (Tauri-Dialoge,
  Auto-Updater, plugin-os) und `StorageAdapter` (SQLite via plugin-sql)
  beim Modul-Load, sonst nur App-Shell und Close-Handler. Eigene
  `CLAUDE.md` darin mit App-spezifischen Details.
- [`apps/web/`](apps/web/) - die Browser-Version unter
  `app.write-scriptz.com` (Solid + Vite, Vercel-Deploy). Dünne Schale:
  registriert ihren `PlatformAdapter` (Blob-Download / `<input file>`)
  und `StorageAdapter` (IndexedDB via Dexie, MiniSearch für FTS) plus
  Web-spezifisches Chrome (Disclaimer-Banner, Desktop-Only-Gate unter
  1024 px).
- [`apps/landing/`](apps/landing/) - die Marketing-Seite write-scriptz.com
  (Astro, statisch, Vercel-Deploy). Komplett eigenständig, importiert
  nichts aus `core`.

## Konvention

Desktop und Web sind **eine App, zwei Schalen**. Jedes neue Feature
landet zuerst in `packages/core/` - dann profitieren beide Apps
automatisch. Eine App-spezifische Implementierung gibt es nur, wenn
die Plattform es erzwingt (Tauri-only-API vs. Browser-only-API).
Siehe Sektion "Feature-Parity Desktop ↔ Web" weiter unten.

Die Landing bleibt davon getrennt - sie ist Marketing, keine App.
Wenn die Landing eine Information aus den Apps braucht (z.B. die
aktuelle Version), holt sie sie zur Build-Zeit von GitHub Releases,
nicht via Workspace-Import.

## Feature-Parity Desktop ↔ Web (wichtig)

**Grundregel:** Was ein User merkt, soll in beiden Apps identisch
funktionieren. Wenn es nicht geht, muss die Differenz dokumentiert und
ehrlich kommuniziert sein (Web-Disclaimer, Settings-Hinweis).

### Was zwingend in `packages/core/` lebt

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

### Was bewusst pro App getrennt bleibt (Adapter-Pattern)

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

### Wenn du ein neues Feature baust

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

### Wann eine Differenz OK ist

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

## Mehrsprachigkeit (wichtig)

**App und Landing sind beide mehrsprachig** (aktuell Deutsch +
Englisch, Auto folgt `navigator.language`). Sie nutzen getrennte
i18n-Kataloge, aber dieselbe Konvention - und für beide gilt: jede
User-sichtbare Änderung pflegt ALLE Sprachen, immer.

- **App-i18n**: [`packages/core/i18n/`](packages/core/i18n/) - User-
  sichtbare Strings laufen **immer** durch `t()` / `tPlural()` aus
  `@scriptz/core/i18n` oder den relativen `../../i18n`-Import, niemals
  als Literal in JSX, in einem Toast oder in einem Error, der per
  `pushToast` rauskommt.
- **Landing-i18n**: [`apps/landing/src/i18n/`](apps/landing/src/i18n/) -
  Strings laufen durch `t(lang, "key")`. Routing: `/` ist DE-Default,
  `/en` ist die englische Variante. Impressum und Datenschutz bleiben
  rechts-bedingt DE-only. Details in [`apps/landing/CLAUDE.md`](apps/landing/CLAUDE.md)
  unter "Mehrsprachigkeit".

### Grundregel

**Jeder neue User-sichtbare String wird in ALLEN verfügbaren Sprachen
eingetragen, immer.** Aktuell heißt das: ein Eintrag in
[`packages/core/i18n/de.ts`](packages/core/i18n/de.ts) UND ein
korrespondierender Eintrag in
[`packages/core/i18n/en.ts`](packages/core/i18n/en.ts). Wenn später
weitere Sprach-Dateien dazukommen, gilt dieselbe Regel für alle:
keine Sprache darf ein Key-Loch haben. TypeScript erzwingt das
(`Record<keyof typeof de, string>` in `en.ts`), aber das fängt nur
die Form, nicht die inhaltliche Qualität - "TODO"-Strings sind
verboten, jeder Wert ist eine echte Übersetzung.

### Was zählt als "User-sichtbar"

- JSX-Children (Button-Labels, Headings, Body-Text)
- `title=`, `aria-label=`, `placeholder=`, `alt=` und vergleichbare
  Attribute
- Toast-Texte (`pushToast("...")`)
- `throw new Error("...")`, **wenn** die Message via `pushToast` an
  den User durchgereicht wird. Reine Dev-Errors wie
  `not found: script ${id}` bleiben Englisch, weil sie nie an den
  User gelangen.
- Datums-/Zeit-/Zahlen-Formatierung (über
  `getCurrentLocale()` statt hardcoded `"de-DE"`)
- Pluralregeln: `tPlural("units.scripts", count)` statt
  `n === 1 ? "Skript" : "Skripte"`
- Sort-Vergleiche: `localeCompare(a, b)` aus i18n statt
  `a.localeCompare(b, "de")`

Nicht User-sichtbar: Code-Kommentare (bleiben Deutsch), JSDoc, interne
Object-Keys/Identifier, `console.log/warn/error`, Strings in
Test-Dateien (haben eigenes Setup, das die Sprache pinnt).

### Wenn du ein neues Feature mit User-Text baust

1. **Key in `de.ts` anlegen.** Naming-Konvention: `bereich.kontext.was`
   (flach, dot-separated, lowercase). Beispiele: `browser.empty.title`,
   `editor.toast.snapshotSaved`, `settings.weeklyGoal.label`.
   Pluralregeln nutzen `_one` / `_other`-Suffix.
2. **Korrespondierenden Key in `en.ts` anlegen.** Reihenfolge bitte
   1:1 zur DE-Datei halten, damit Diffs sauber bleiben. TypeScript
   zwingt dich beim nächsten `pnpm typecheck` ohnehin dazu.
3. **In der Komponente nutzen**: `t("browser.empty.title")` oder mit
   Platzhalter `t("folder.toast.created", { name: folderName })`. Für
   eingebettete `<kbd>`-Hotkeys oder andere JSX-Inserts den String
   per `.split("{placeholder}")` zerlegen statt HTML in den Key zu
   schreiben (siehe `EditorRail.tsx`, `Browser.tsx::welcome.hint`).
4. **Verifikation**: `pnpm typecheck` (deckt fehlende EN-Keys),
   `pnpm test`, und mindestens einmal mit `language: "en"` in den
   Einstellungen ausprobieren - sonst übersieht man Plurale, die nur
   in einer Sprache aufgehen.

### Anti-Pattern (NICHT machen)

- `pushToast("Skript gespeichert")` - hardcoded DE, nicht
  übersetzbar.
- `<h1>Aktivität</h1>` - dito.
- `n === 1 ? "Tag" : "Tage"` - umgeht das Pluralsystem.
- `date.toLocaleString("de-DE", ...)` - hardcoded Locale, nutzt
  nicht die User-Sprache.
- HTML im i18n-Key (`<b>foo</b>`) - macht den String fragil, lieber
  via `split("{slot}")` + JSX-Teile zusammensetzen.
- "TODO"-Werte in `en.ts` "weil ich später übersetze" - das passiert
  nie. Lieber gleich eine ehrliche Übersetzung.

### Welcome-/Tutorial-Skript

Pro Sprache liegt der Tutorial-Skriptinhalt in
[`packages/core/i18n/welcomeContent.ts`](packages/core/i18n/welcomeContent.ts).
Wird beim ersten Start gemäß der aufgelösten Sprache geseedet. Spätere
Sprachwechsel übersetzen **nicht** nachträglich - das Skript ist dann
User-Content und gehört dem User.

## Konsistenz App ↔ Landing (wichtig)

Die Landing ist das **Schaufenster** der App. Wenn an der App etwas
verändert wird, muss die Landing nachgezogen werden, sonst zeigt sie
ein Produkt, das es so nicht mehr gibt. Vor dem Abschluss einer
App-Aufgabe immer prüfen, ob die Landing mit betroffen ist. Bei
Unsicherheit lieber kurz beim User nachfragen statt auseinanderlaufen
lassen.

Auslöser, bei denen die Landing **mit** angepasst werden muss:

| Änderung in der App (Desktop oder Web) | Was in der Landing folgen muss |
|---|---|
| Neues Feature, das ein User merkt | Ggf. Aufnahme in Features-Sektion oder Vergleichstabelle ([apps/landing/src/components/Features.astro](apps/landing/src/components/Features.astro), [Compare.astro](apps/landing/src/components/Compare.astro)). Wenn es ein Top-3-Feature ist, eines der bestehenden ablösen. Wenn das Feature im Web *nicht* funktioniert, im Web-CTA-Hinweis ehrlich erwähnen. |
| Feature entfernt | Aus Features, Vergleich, Demo, Texten rauswerfen. Versprechen wie "lokal" oder "kein Konto" gegenchecken. |
| Design-Token geändert (Farbe, Schrift, Radius, Spacing) in `packages/core/styles/` | [apps/landing/src/styles/tokens.css](apps/landing/src/styles/tokens.css) angleichen, falls die Landing den App-Look spiegeln soll. |
| Editor-Layout geändert (Block-Typen, Einrückung, ALLCAPS-Regel, Spacing-Cluster) | [Workflow.astro](apps/landing/src/components/Workflow.astro) Schritt 3 ("Schreiben") so anpassen, dass die Demo weiterhin 1:1 dem echten Editor entspricht. |
| App-Chrome verändert (Tab-Bar, Status-Strip, Trafficlight-Position) | Demo-Frame nachziehen, sonst sieht die Demo aus wie eine alte Version. |
| Schriftart oder Schrift-Größen | [src/styles/fonts.css](apps/landing/src/styles/fonts.css) und Tokens. |
| `app_icon`, Branding | Icons in `apps/landing/public/img/` neu setzen. |
| Plattform-Support erweitert (z.B. Windows-Build) | Hero-Meta, Download-Sektion, Compare-Tabelle, "First-Run"-Anleitung anpassen. |
| Lizenzmodell, Tracking-Verhalten, Konto-Verhalten | OpenSource-Sektion und Datenschutzerklärung gegenchecken. |
| Versionsnummer der Desktop-App | Siehe Release-Checkliste unten. |
| Disclaimer-/Limit-Texte der Web-App (`apps/web/src/components/WebDisclaimerBanner.tsx`) | "Direkt im Browser testen"-CTA und der zugehörige Hinweistext auf der Landing müssen mit dem Banner-Text konsistent bleiben. |

Praktisch heißt das: nach jeder nicht-trivialen App-Änderung mit
einem Blick durch [apps/landing/src/](apps/landing/src/) gehen und
prüfen, ob Texte, Demo, Vergleich noch stimmen. Bei reinen
Bug-Fixes oder Code-Refactors ohne User-sichtbare Wirkung muss nichts
passieren.

## Befehle (vom Repo-Root)

```bash
pnpm install                 # installiert alle Workspaces
pnpm dev:desktop             # tauri dev der Desktop-App
pnpm dev:web                 # vite dev der Web-App (localhost:5173)
pnpm dev:landing             # astro dev der Landing
pnpm build:desktop           # native .app bauen
pnpm build:web               # statische Web-App nach apps/web/dist
pnpm build:landing           # statische Landing bauen
pnpm typecheck               # tsc/astro check über alle Workspaces
pnpm test                    # vitest in packages/core
```

Innerhalb eines Workspaces können auch die eigenen Skripte direkt
benutzt werden (`cd apps/desktop && pnpm tauri:dev`).

## Release / Deploy

- **Desktop**: GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml))
  baut beim Pushen eines `vX.Y.Z`-Tags **zwei** Bundles sequenziell:
  zuerst auf `macos-26` (aarch64-apple-darwin → `.dmg` + Updater-
  `.app.tar.gz`), danach auf `windows-latest` (x86_64-pc-windows-msvc
  → NSIS-`.exe` + Updater-`.nsis.zip`). Beide landen am selben
  GitHub-Release; `latest.json` wird vom zweiten Job in das vom ersten
  hochgeladene Manifest gemerged (`windows-x86_64` ergänzt sich neben
  dem bestehenden `darwin-aarch64`-Eintrag). Auto-Updater im laufenden
  Client poll't `latest.json` plattform-spezifisch.
- **Web**: Vercel-Project mit `Root Directory` = `apps/web`. Deploy auf
  jeden Push zu `main`. Domain `app.write-scriptz.com`. **Keine
  Tag-Releases nötig** - die Version wird zur Build-Zeit aus
  `apps/desktop/package.json` injectet, damit Settings die Desktop-
  Version spiegelt.
- **Landing**: Vercel-Project mit `Root Directory` = `apps/landing`.
  Deploy auf jeden Push zu `main`. Eigene Domain write-scriptz.com.

### Release-Checkliste (jedes Mal!)

Bei einem neuen Release `vX.Y.Z` müssen **vier** Stellen synchron
gehalten werden, sonst bleibt entweder die Landing oder der
Auto-Updater auf der alten Version hängen:

1. [`apps/desktop/package.json`](apps/desktop/package.json) - `version`
2. [`apps/desktop/src-tauri/tauri.conf.json`](apps/desktop/src-tauri/tauri.conf.json) - `version`
3. [`apps/desktop/src-tauri/Cargo.toml`](apps/desktop/src-tauri/Cargo.toml) +
   [`Cargo.lock`](apps/desktop/src-tauri/Cargo.lock) (Lock-Eintrag
   `name = "scriptz"` mitziehen, sonst bricht der CI-Build mit
   `--frozen-lockfile`)
4. [`apps/landing/src/data/site.ts`](apps/landing/src/data/site.ts) -
   `fallbackVersion`. Die Landing fetcht zwar zur Build-Zeit aus der
   GitHub-Releases-API, aber `fallbackVersion` greift, falls die API
   beim Build down ist - und sollte daher zum aktuellen Tag passen.
5. [`docs/release-notes/vX.Y.Z.md`](docs/release-notes/) **neu anlegen**
   mit dem Changelog seit dem letzten Tag (siehe nächster Abschnitt).
   Der Release-Workflow liest diese Datei und bricht ab, wenn sie
   fehlt - kein Release geht mit der vorherigen Beschreibung raus.

Danach: commit, `git tag vX.Y.Z`, `git push origin main vX.Y.Z`. Der
Release-Workflow triggert nach erfolgreichem Build (beide Plattformen!)
automatisch einen Vercel-Rebuild via Deploy-Hook (Secret
`VERCEL_DEPLOY_HOOK_URL`), damit die Landing die frisch publizierte
Version aus der GitHub-Releases-API zieht. Ohne diesen Hook würde die
Landing auf der vorherigen Version hängenbleiben, weil Vercel nur auf
Git-Push reagiert - und der Push passiert *vor* dem Release-Publish.

### Release-Asset-Naming

Pro Release publiziert der Workflow folgende Assets am GitHub-Release-
Objekt. Wer die URLs irgendwo verlinken will, muss sich auf das
Schema verlassen - die Landing zieht sie zur Build-Zeit aus der
GitHub-Releases-API per Suffix-Match (`.dmg` → macOS, `.exe` → Windows
NSIS-Installer; siehe [`apps/landing/src/data/site.ts`](apps/landing/src/data/site.ts)):

- **macOS**: `ScriptZ_<version>_aarch64.dmg` (Direct-Install) +
  `ScriptZ.app.tar.gz` + `ScriptZ.app.tar.gz.sig` (Auto-Updater-Bundle)
- **Windows**: `ScriptZ_<version>_x64-setup.exe` (NSIS-Installer,
  installiert in den User-Ordner ohne Admin) +
  `ScriptZ_<version>_x64-setup.nsis.zip` +
  `ScriptZ_<version>_x64-setup.nsis.zip.sig` (Auto-Updater-Bundle)
- **Plattform-übergreifend**: `latest.json` (Auto-Updater-Manifest mit
  beiden Plattform-Einträgen)

### Release-Notes schreiben

Pro Release **eine** Markdown-Datei unter
[`docs/release-notes/vX.Y.Z.md`](docs/release-notes/) anlegen. Inhalt:

- **Erste Zeile:** kurzes Headline-Statement, was dieses Release
  ausmacht. `ScriptZ vX.Y.Z - <ein-Satz-Tagline>.`
- **`## Was ist neu`** mit den User-sichtbaren Features seit dem
  vorherigen Tag. Knackig, in Bullets gruppiert nach Themen.
  Keine Refactor-Listen. Keine internen Migration-Phasen. Was würde
  ein User merken, der die App benutzt?
- **`## Bug-Fixes`** wenn vorhanden. Kurz beschreiben, was sich für
  den User ändert (nicht *welche Datei* gefixt wurde).
- **`## Updating`** als letzter inhaltlicher Abschnitt mit ein bis
  zwei Sätzen, wie die Auto-Update-Pille funktioniert.

Die statische **Install-Footer** ("Install (first time only)" mit
`xattr -cr`-Hinweis) hängt der Release-Workflow automatisch dran -
**niemals** in die per-Version-Datei kopieren. Die kommt aus
[`.github/workflows/release.yml`](.github/workflows/release.yml).

**Die Landing hat in den Release-Notes nichts zu suchen.** Die Notes
beschreiben die App, nicht die Marketing-Site. Änderungen an
`write-scriptz.com` wandern nicht ins Release.

Als Vorlage: [`docs/release-notes/v0.6.0.md`](docs/release-notes/v0.6.0.md).

Workflow-Verhalten: ist die Datei vor dem Tag-Push commited, baut der
Release-Workflow Body = Datei-Inhalt + Install-Footer. Vergisst man
sie, **bricht der Workflow mit klarem Error ab** statt mit der
vorherigen Beschreibung weiterzumachen.

Wer einen bereits publizierten Release retroaktiv mit den richtigen
Notes nachziehen will: Body-Datei manuell zusammensetzen
(per-Version-Notes + Install-Footer aus dem Workflow-YAML einmalig
copy/pasten) und mit `gh release edit vX.Y.Z --notes-file <datei>`
überschreiben.

### Was bei einem Release alles automatisch passiert

Sobald der Tag-Push erfolgreich gebaut hat, läuft alles weitere ohne
manuelle Schritte:

1. **Job `prepare-notes`** (ubuntu): liest
   `docs/release-notes/vX.Y.Z.md` + `_install_footer.md` und gibt den
   Body als Output weiter. Bricht ab, wenn die Notes-Datei fehlt.
2. **Job `build-macos`** (macos-26): baut `.dmg` + signiertes
   `.app.tar.gz`. Legt das GitHub-Release-Objekt an, lädt Assets hoch
   inkl. erstem `latest.json` (Eintrag `darwin-aarch64`).
3. **Job `build-windows`** (windows-latest, needs build-macos): baut
   NSIS-`.exe` + signiertes `.nsis.zip`. Findet den existierenden
   Release per Tag, appended Windows-Assets, mergt `windows-x86_64`
   ins `latest.json`. Sequenziell **nach** macOS, sonst race condition
   auf das `latest.json`-Asset.
4. **Job `trigger-landing`** (ubuntu, needs beide Builds): Triggert
   den Vercel-Deploy-Hook (`VERCEL_DEPLOY_HOOK_URL`).
5. Vercel rebuildet die Landing, fetcht die neue Version aus der
   GitHub-Releases-API (`.dmg` + `.exe` Asset-URLs), deployed
   write-scriptz.com.
6. Bestehende User sehen innerhalb von ~60 Min die grüne Update-Pille
   im File-Browser-Footer (stündlicher `latest.json`-Poll, plattform-
   spezifisches Bundle wird automatisch gewählt).

### Wenn der Release-Workflow fehlschlägt

**Re-Run via `gh run rerun` reicht oft nicht**, weil GitHub den
`GITHUB_TOKEN`-Kontext vom ursprünglichen Trigger cached. Wenn der
Fehler etwas mit Permissions zu tun hatte (z.B. nach einem
Org-Transfer oder einer geänderten Workflow-Permission-Setting),
muss ein **frischer** Run her:

```bash
git push --delete origin vX.Y.Z   # Remote-Tag entfernen
git tag -d vX.Y.Z                 # lokal entfernen
git tag -a vX.Y.Z -m "ScriptZ vX.Y.Z"  # neu setzen
git push origin vX.Y.Z            # frischer Workflow-Trigger
```

Das Release-Objekt selbst wird dabei nicht doppelt - der gefailte
Run hatte ja noch keins erstellt. Der historische Failed-Run bleibt
in der Actions-History stehen, das ist OK.

Bei wiederholten Permission-Fehlern: prüfen, dass auf **Org- und
Repo-Ebene** unter Settings → Actions → General → "Workflow
permissions" jeweils "Read and write permissions" aktiv ist.

## Workflow nach jeder Änderung (wichtig)

Nach **jeder** abgeschlossenen Aufgabe (Feature, Fix, Refactor,
Doku-Update, egal was) **niemals automatisch committen, pushen oder
releasen**. Stattdessen einmal kurz innehalten und dem User eine
Zusammenfassung + Optionen geben:

1. **Was wurde geändert?** Ein Satz, plus Liste der angefassten
   Dateien. So kann der User selbst nochmal drüberschauen, bevor
   irgendwas rausgeht.
2. **Konsistenz-Check:** Ist die Landing mit betroffen (siehe Tabelle
   oben)? Müssen Versionen synchron gezogen werden? Wenn ja, sagen.
3. **Empfehlung + Optionen** für das weitere Vorgehen, abhängig von
   der Art der Änderung. Beispiele:
   - **Trivial** (Tippfehler, Kommentar, kleines Style-Detail):
     Direkt-Commit auf `main` reicht. Kein Release nötig.
   - **Kleiner, aber wichtiger Bugfix** (User merkt's, betrifft alle):
     Direkt-Commit auf `main` + Patch-Release `vX.Y.Z+1` empfehlen,
     damit der Auto-Updater die Fix ausrollt. Release-Checkliste
     durchgehen.
   - **Neues Feature oder nicht-trivialer Refactor:** PR auf GitHub
     vorschlagen, damit CodeRabbit drüberschaut. Erst nach Review +
     Merge ggf. Minor-Release `vX.Y+1.0`.
   - **Landing-only Änderung** (Texte, Bilder, Marketing): Direkt-
     Commit reicht, kein Versions-Bump - Vercel deployed bei Push.
   - **Risiko-Änderung** (Migrations, Storage-Format, Build-Pipeline):
     Immer PR, nie direkt - egal wie klein.
4. **Auf Antwort warten.** Erst handeln, wenn der User explizit sagt
   was er will (z.B. "ja, Patch-Release" oder "PR machen" oder "nur
   committen, kein Release"). Niemals in einem Rutsch durchziehen,
   auch wenn die Empfehlung offensichtlich scheint.

Diese Regel gilt **immer**, auch wenn der User vorher schon eine
Aufgabe ähnlich abgewickelt hat. Jede Änderung ist neu zu bewerten.

## Deutsche Texte

Die App ist mehrsprachig (siehe Sektion "Mehrsprachigkeit" weiter
oben), Landing ist auf Deutsch. Code-Kommentare, Doku-Markdown,
Release-Notes und die DE-Hälfte der i18n-Kataloge sind alle deutsch.
In all diesen Texten wird normaler Bindestrich verwendet, **kein
Em-Dash**. Auch in von Claude generierten Texten.

**Echte Umlaute, keine ASCII-Ersatzschreibung.** In allen
deutschsprachigen Texten (Release-Notes, README, Landing,
`i18n/de.ts`, Code-Kommentare) immer `ä`, `ö`, `ü`, `ß` statt
`ae`, `oe`, `ue`, `ss`. Auch wenn die Tastatur das gerade
nicht hergibt - dann lieber kurz suchen als ein "haendisch"
ins Repo schreiben. Gilt insbesondere für Release-Notes,
weil die im GitHub-Release-Body stehen und User-sichtbar sind.
