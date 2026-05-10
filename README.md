<p align="center">
  <img src="apps/desktop/docs/scriptz-icon-400.png" alt="ScriptZ" width="160" height="160" />
</p>

<h1 align="center">ScriptZ</h1>

<p align="center">
  <strong>Der schnellste Skript-Editor für TikTok-Creator und Sketch-Teams.</strong><br/>
  <em>Lokal. Offline. Mac-first.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.6.3-1c1814?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/platform-macOS-1c1814?style=flat-square" alt="macOS" />
  <img src="https://img.shields.io/badge/Apple_Silicon-native-1c1814?style=flat-square" alt="Apple Silicon" />
  <img src="https://img.shields.io/badge/storage-local_only-1c1814?style=flat-square" alt="local-only" />
  <img src="https://img.shields.io/badge/telemetry-none-1c1814?style=flat-square" alt="no telemetry" />
  <img src="https://img.shields.io/badge/license-MIT-1c1814?style=flat-square" alt="license" />
</p>

---

## Warum ScriptZ?

> **Final Draft** ist zu schwer. **Google Docs** zu generisch. **Arc Studio** will dein Abo. **ScriptZ ist die Mitte, die niemand sonst baut.**

App auf → schreiben → exportieren → fertig. Kein Login, keine Cloud, keine Telemetrie. Alles bleibt als eine SQLite-Datei auf deinem Mac.

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
- **Live-Highlight-Toggle** in der Titelleiste — schaltet die Charakter-Farben pro Skript an/aus, identisch zur PDF-Darstellung (per-Zeile tight Pills, nicht block-breit).

### Echte A4-Pagination im Editor

- Papier-Stapel im Editor zeigt **echte A4-Seiten** mit visuellen Seitenumbrüchen — nicht eine endlose Spalte.
- **Word-Style „Keep with next"**: Charaktername wird nie vom dazugehörigen Dialog getrennt.
- Inhalt wird über Seitengrenzen hinweg automatisch umgebrochen, kein Handarbeit nötig.

### Export 1:1 wie auf dem Papier

- **PDF-Export** mit eingebetteter iA Writer Quattro Schrift, optional Titelblatt und Charakter-Highlighting.
- **Plaintext-Export** für Teleprompter.
- Per-Skript-Highlight-Farben im PDF genau wie im Editor — eng am Text, nicht als Block-Bänder.

### Auto-Snapshots & Versionshistorie

- Alle 5 Minuten ein automatischer Snapshot, manuell per ⌘⇧S.
- Bis zu 50 Versionen pro Skript, jederzeit per ⌘⇧H wiederherstellbar.

### Tab-Workflow wie im Browser

- **Quick-Switcher** oben in der Titelleiste: Suche + zuletzt bearbeitete Skripte.
- **⌘⌥← / ⌘⌥→** zwischen Skripten wechseln.
- Geschlossene Tabs werden automatisch aufgeräumt, wenn das Skript gelöscht wird.

### Schreibmotivation, ohne Druck

- **Tagesziel** ("X Wörter heute") oben rechts in der Tab-Bar mit live-aktualisiertem Zähler — anpassbar in den Einstellungen.
- **Streak-Pille** zählt aufeinanderfolgende Schreibtage; Klick öffnet die **Aktivitäts-Übersicht** mit GitHub-Style-Heatmap über die letzten 365 Tage.
- **Momentum-Strip** auf der Übersicht zeigt aktuellen Streak, Tagesfortschritt und einen "weiterschreiben"-Knopf zum letzten offenen Skript.
- **Sprint-Timer** unten rechts im Editor: 5 / 15 / 25 Minuten, mit Fortschrittsbalken und Wortzähler — Pomodoro fürs Schreiben, ohne extra App.

### Ideen-Inbox

- **Quick-Capture** per `⌘I` aus jeder Ansicht — Idee tippen, Enter, weiter im aktuellen Skript.
- **Ideen-Drawer** mit drei Reitern: Offen, Alle, Verwendet — sortiert nach Heute / Gestern / Diese Woche / Älter.
- **Ein-Klick-Konvertierung** Idee → neues Skript (`⌘↵`); die Notizen landen optional direkt im ersten ACTION-Block.

### Cast-Panel im Editor

- **Cast-Tab** in der rechten Editor-Schiene zeigt jeden Charakter mit Dialog-Wortanteil als getöntem Balken (gleiche Farbe wie im Editor und im PDF).
- **Skript-Statistik**: geschätzte Spielzeit, Gesamtwortzahl, A4-Seiten, reine Dialog-Wörter.
- **Versionen-Tab** im selben Panel — Snapshot-Verlauf nicht mehr im Modal versteckt, sondern direkt neben dem Text.

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
| Streak / Tagesziel / Heatmap | ✅ | ❌ | ❌ | ❌ |
| Sprint-Timer eingebaut | ✅ | ❌ | ❌ | ❌ |
| Ideen-Inbox mit Quick-Capture | ✅ | ❌ | ❌ | ❌ |
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
| `⌘⇧S` | Manueller Snapshot |
| `⌘⇧H` | Snapshot-Verlauf |

### Ideen

| Shortcut | Aktion |
|---|---|
| `⌘I` | Quick-Capture (Idee tippen, Enter speichert) - app-weit, auch im Editor |
| `⌘↵` | Idee in neues Skript konvertieren (im Drawer) |

### Editor

| Shortcut | Aktion |
|---|---|
| `⌘1` … `⌘7` | Block-Typ wechseln (Action … SFX) |
| `⌘B` / `⌘U` | Bold / Underline (Action & Dialog) - Italic hat kein Shortcut, weil `⌘I` app-weit für die Ideen-Inbox reserviert ist |
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
