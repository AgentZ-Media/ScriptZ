<p align="center">
  <img src="apps/desktop/docs/scriptz-icon-400.png" alt="ScriptZ" width="160" height="160" />
</p>

<h1 align="center">ScriptZ</h1>

<p align="center">
  <strong>Der schnellste Skript-Editor für TikTok-Creator und Sketch-Teams.</strong><br/>
  <em>Lokal. Offline. Mac-first.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.4.0-1c1814?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/platform-macOS-1c1814?style=flat-square" alt="macOS" />
  <img src="https://img.shields.io/badge/Apple_Silicon-native-1c1814?style=flat-square" alt="Apple Silicon" />
  <img src="https://img.shields.io/badge/storage-local_only-1c1814?style=flat-square" alt="local-only" />
  <img src="https://img.shields.io/badge/telemetry-none-1c1814?style=flat-square" alt="no telemetry" />
  <img src="https://img.shields.io/badge/license-MIT-1c1814?style=flat-square" alt="license" />
</p>

---

## Warum ScriptZ?

> **Final Draft** ist zu schwer. **Google Docs** zu generisch. **Arc Studio** will dein Abo. **ScriptZ ist die Mitte, die niemand sonst baut.**

App auf → schreiben → drucken → fertig. Kein Login, keine Cloud, keine Telemetrie. Alles bleibt als eine SQLite-Datei auf deinem Mac.

---

## Features im Überblick

### Editor, der wie ein Drehbuch denkt

| | |
|---|---|
| **Sieben Block-Typen** | Action · Charakter · Dialog · Parenthetical · Kamera · Caption · SFX — jeder mit eigener Einrückung, Gewicht und Verhalten. |
| **Smart-Enter** | Charakter → Dialog → Charakter. Der Cursor weiß, was als nächstes kommt. |
| **Live-Klammern** | `(` mitten im Dialog springt automatisch in einen Parenthetical-Block, `)` zurück in den nächsten Dialog. |
| **ALLCAPS via CSS** | Charakternamen werden visuell groß geschrieben, ohne dass im Datenmodell rumgetippt wird. |
| **⌘1–7** | Block-Typ pro Tastenkürzel wechseln. |

### Charaktere als First-Class Citizen

- **Automatische Farbzuweisung** aus einer Palette — jeder Name bekommt seine eigene Farbe.
- **Per-Skript Charakterliste** (kein globales Adressbuch, keine Pflege).
- **Intelligente Autovervollständigung**: tippst du `A`, ist `AXEL` markiert — Enter akzeptiert.
- **Bigramm-Vorhersage** für die nächste Sprecher-Zeile: Dropdown highlightet vor, wer als Nächstes laut Gesprächsverlauf dran ist.
- **Quick-Modus** für Dialog-Sketches mit zwei Personen: Enter im Dialog → der andere Charakter wird automatisch eingefügt.
- **Live-Highlight-Toggle** in der Titelleiste — schaltet die Charakter-Farben pro Skript an/aus, identisch zur PDF/Print-Darstellung (per-Zeile tight Pills, nicht block-breit).

### Echte A4-Pagination im Editor

- Papier-Stapel im Editor zeigt **echte A4-Seiten** mit visuellen Seitenumbrüchen — nicht eine endlose Spalte.
- **Word-Style „Keep with next"**: Charaktername wird nie vom dazugehörigen Dialog getrennt.
- Inhalt wird über Seitengrenzen hinweg automatisch umgebrochen, kein Handarbeit nötig.

### Drucken & Export 1:1 wie auf dem Papier

- **PDF-Export** mit eingebetteter iA Writer Quattro Schrift, optional Titelblatt und Charakter-Highlighting.
- **Plaintext-Export** für Teleprompter.
- **Direkt drucken** (⌘P) → System-Druckdialog erscheint sofort, ohne PDF-Umweg über Adobe oder Preview.
- Per-Skript-Highlight-Farben im Druck genau wie im Editor — eng am Text, nicht als Block-Bänder.

### Auto-Snapshots & Versionshistorie

- Alle 5 Minuten ein automatischer Snapshot, manuell per ⌘⇧S.
- Bis zu 50 Versionen pro Skript, jederzeit per ⌘⇧H wiederherstellbar.

### KI-Zusammenfassungen (Opt-in)

- Optional: OpenRouter-API-Key in der Keychain, freie Modellwahl.
- Pro Skript erscheint eine ein-Satz-Zusammenfassung in der Übersicht.
- Komplett deaktivierbar — App funktioniert vollständig ohne KI.

### Tab-Workflow wie im Browser

- **Quick-Switcher** oben in der Titelleiste: Suche + zuletzt bearbeitete Skripte.
- **⌘⌥← / ⌘⌥→** zwischen Skripten wechseln.
- Geschlossene Tabs werden automatisch aufgeräumt, wenn das Skript gelöscht wird.

---

## Vergleich

| | ScriptZ | Final Draft | Google Docs | Arc Studio |
|---|:---:|:---:|:---:|:---:|
| Lokal & offline | ✅ | ✅ | ❌ | ❌ |
| Kein Account / Login | ✅ | ⚠️ | ❌ | ❌ |
| Keine Telemetrie | ✅ | ⚠️ | ❌ | ❌ |
| App-Start unter 1s | ✅ | ❌ | — | ⚠️ |
| Sketch-/TikTok-Layout | ✅ | ❌ | ❌ | ⚠️ |
| Sieben Block-Typen | ✅ | ⚠️ | ❌ | ✅ |
| Live-A4-Pagination | ✅ | ✅ | ❌ | ✅ |
| Charakter-Farben | ✅ | ❌ | ❌ | ✅ |
| Quick-Modus für 2-Personen | ✅ | ❌ | ❌ | ❌ |
| Bigramm-Predict für Charaktere | ✅ | ❌ | ❌ | ❌ |
| Kostenlos | ✅ | ❌ | ✅ | ⚠️ |

---

## Tastenkürzel

### Global
| Shortcut | Aktion |
|---|---|
| `⌘N` | Neues Skript |
| `⌘T` | Übersicht öffnen |
| `⌘W` | Aktiven Tab schließen |
| `⌘K` | Command-Bar |
| `⌘,` | Einstellungen |
| `⌘⌥←` / `⌘⌥→` | Vorheriger / nächster Tab |

### Skript-Ansicht
| Shortcut | Aktion |
|---|---|
| `⌘E` | Export-Dialog |
| `⌘P` | Drucken |
| `⌘⇧S` | Manueller Snapshot |
| `⌘⇧H` | Snapshot-Verlauf |

### Editor
| Shortcut | Aktion |
|---|---|
| `⌘1` … `⌘7` | Block-Typ wechseln (Action … SFX) |
| `⌘B` / `⌘I` / `⌘U` | Bold / Italic / Underline (Action & Dialog) |
| `Tab` | Block-Typ-Picker im aktuellen Block |
| `Enter` | Smart-Advance zum nächsten Block-Typ |

---

## Tech-Stack

| Layer | Tool |
|---|---|
| Shell | [Tauri 2](https://tauri.app) (Rust, ~10 MB Binary, native macOS) |
| UI | [Solid.js](https://solidjs.com) + TypeScript (kein React, kein Virtual DOM) |
| Editor | [Lexical](https://lexical.dev) (vanilla, ohne `@lexical/react`) |
| Storage | SQLite mit FTS5 für Volltext-Suche |
| Schrift | iA Writer Quattro (SIL OFL 1.1) |
| Auto-Update | `tauri-plugin-updater` mit signierten Releases |

---

## Installation

> **macOS Apple Silicon** — getestet auf macOS 26 Tahoe.

1. Aktuelles `.dmg` von [Releases](https://github.com/AgentZ-Media/ScriptZ/releases/latest) laden.
2. Installieren, in `/Applications` ziehen.
3. Beim ersten Start einmal:
   ```bash
   xattr -cr /Applications/ScriptZ.app
   ```
   (Apple-Quarantäne entfernen — die App ist nicht über das Apple Developer Program signiert.)

In-App-Updates funktionieren danach automatisch und ohne weitere Hürden.

---

## Entwicklung

Dieses Repository ist ein pnpm-Monorepo. Die App selbst lebt in
[`apps/desktop/`](apps/desktop/), die Marketing-Seite write-scriptz.com
in [`apps/landing/`](apps/landing/).

Vom Repo-Root:

```bash
pnpm install              # installiert Desktop + Landing
pnpm dev:desktop          # Hot-Reload Frontend + Rust
pnpm build:desktop        # Native .app bauen
pnpm typecheck            # TypeScript über alle Apps

pnpm dev:landing          # Astro-Devserver für die Landing
pnpm build:landing        # Statische Landing bauen
```

Innerhalb von `apps/desktop/` funktionieren auch die App-eigenen
Skripte:

```bash
cd apps/desktop
pnpm tauri:dev
pnpm tauri:build
cargo check --manifest-path src-tauri/Cargo.toml
```

Code-Konventionen siehe [`CLAUDE.md`](CLAUDE.md) (Monorepo-Übersicht)
und [`apps/desktop/CLAUDE.md`](apps/desktop/CLAUDE.md) (App-Details).

---

## Lizenz & Credits

- **MIT-Lizenz** — siehe [LICENSE](LICENSE).
- Schrift: **iA Writer Quattro** © Information Architects Inc., SIL OFL 1.1.
- Entwickelt von [AgentZ](https://linktr.ee/deragentz).

<p align="center">
  <sub>Kein Login. Kein Tracking. Keine Cloud. Nur du, dein Skript und dein Mac.</sub>
</p>
