# ScriptZ — Projektplan

**Ein professioneller, minimalistischer Drehbuch-Editor für TikTok-Creator und Sketch-Comedy-Teams. Mac-first, lokal, blitzschnell.**

---

## Inhaltsverzeichnis

1. [Vision & Designphilosophie](#1-vision--designphilosophie)
2. [Tech-Stack](#2-tech-stack)
3. [App-Struktur & UI-Modi](#3-app-struktur--ui-modi)
4. [Datenmodell](#4-datenmodell)
5. [Editor: Block-System](#5-editor-block-system)
6. [Editor: Verhalten beim Schreiben](#6-editor-verhalten-beim-schreiben)
7. [Charakter-System](#7-charakter-system)
8. [Datei-Browser & Start-Screen](#8-datei-browser--start-screen)
9. [Charakter-Übersicht](#9-charakter-übersicht)
10. [Tab-System](#10-tab-system)
11. [Suche](#11-suche)
12. [Export](#12-export)
13. [Settings](#13-settings)
14. [Lifecycle & Edge-Cases](#14-lifecycle--edge-cases)
15. [Updates](#15-updates)
16. [Performance-Anforderungen](#16-performance-anforderungen)
17. [Tastenkürzel-Referenz](#17-tastenkürzel-referenz)
18. [Out of Scope (für immer)](#18-out-of-scope-für-immer)
19. [Roadmap-Vorschlag](#19-roadmap-vorschlag)

---

## 1. Vision & Designphilosophie

### Der Nordstern

> **"App auf → schreiben → ausdrucken → fertig."**
>
> Wenn der User nachdenken muss bevor er schreibt, haben wir verloren.

### Designprinzipien

1. **Schreiben ist heilig.** Das Editor-Erlebnis steht an erster Stelle. Nichts darf vom Schreiben ablenken.
2. **iA Writer-Cleanness.** So minimalistisch wie möglich. Keine Sidebars, keine Toolbars, keine Buttons, die nicht unbedingt gebraucht werden.
3. **Wie eine App, für die Leute Geld ausgeben.** Linear-Polish, Apple-Materials, durchdachtes Design-System. Keine geratenen Spacings, Radii oder Schriftgrößen — alles aus Tokens.
4. **Performance ist nicht verhandelbar.** Darf nie ruckeln, auch bei vielen Skripten. Wie NoteZ-Doktrin: "1M-Items-Test".
5. **Lokal & privat.** Keine Cloud, keine Accounts, keine Telemetrie.
6. **Open Source.** MIT-Lizenz, GitHub.

### Inspiration

- **iA Writer** — Cleanness, Fokus, Schreibgefühl
- **Arc Studio** — Block-Logik, Character-Highlighting, Workflow
- **NoteZ** — Performance, Architektur, Mac-Native-Feel
- **Linear** — Design-System, Polish, Animationen

---

## 2. Tech-Stack

| Komponente | Technologie | Begründung |
|---|---|---|
| **Container** | Tauri 2 | Klein, schnell, native, NoteZ-erprobt |
| **Backend** | Rust | Performance, NoteZ-Pattern wiederverwendbar |
| **Frontend** | Solid + TypeScript | Lexical-without-React-Pattern aus NoteZ, schnellstes reaktives Framework |
| **Editor** | Lexical (Meta) | Custom-Node-System ideal für Block-Types |
| **Storage** | SQLite + FTS5 | Volltextsuche, Performance, einzelne DB-Datei |
| **PDF-Generierung** | Rust-Crate (`printpdf` oder `genpdf`) | Native, schnell, keine Browser-Abhängigkeit |
| **Plain-Text-Export** | Native Rust File-IO | Trivial |
| **Build** | pnpm-Monorepo (wie NoteZ) | Konsistenz mit existierender Codebase |

### Zielplattform

- **macOS only in v1**, Apple Silicon native
- **Windows/Linux** verschoben auf später (Tauri kann's, aber Fokus zuerst)

### App-Identität

- **Name:** ScriptZ
- **Bundle-ID:** `de.agent-z.scriptz`
- **DB-Pfad:** `~/Library/Application Support/de.agent-z.scriptz/scriptz.db`
- **Lizenz:** MIT
- **Repository:** Open Source auf GitHub

---

## 3. App-Struktur & UI-Modi

ScriptZ hat genau **zwei UI-Modi**:

### Mode A: Browser-Tab

Der "Datei-Browser" / "Start-Screen". Vollbild-Ansicht. Zeigt alle Skripte als Grid/Karten.

**Erreichbar wenn:**
- App startet ohne offene Tabs
- User öffnet einen neuen Tab (Cmd+T oder Plus-Button)
- User schließt alle Skript-Tabs

**Inhalt:**
- Suche-Feld zentral oben
- Filter (Projekt, Tag, Charakter)
- Grid von Skript-Karten (sortiert nach letztem Bearbeitet-Datum)
- Tab-Bereiche oben für Switch zwischen: **Skripte** | **Charaktere** | **Papierkorb**
- Update-Indikator (falls Update verfügbar) klein, dezent oben rechts
- Footer: "Neues Skript erstellen"-Button (auf leerem Welcome-Screen prominent in der Mitte)

### Mode B: Skript-Tab

Der Editor selbst. Vollbild-Schreibumgebung.

**Inhalt:**
- A4-Papier-Layout mit echten Seitenumbrüchen
- Charakter-Pills oben am Skript-Anfang (sobald Charaktere existieren)
- Status-Leiste unten ("Gespeichert" / "Speichert..." + Seite X von Y)
- Tab-Leiste oben (auto-hide wenn nur 1 Tab offen, erscheint bei Hover oder bei 2+ Tabs)
- KEINE Sidebar
- KEINE Toolbar
- KEINE permanenten UI-Elemente außer den genannten

### Wechsel zwischen Modi

- **Cmd+T** → öffnet neuen Browser-Tab
- **Klick auf Skript-Karte** → öffnet Skript in neuem Tab oder im aktuellen Tab (siehe Tab-System)
- **Tab-Schließen-X** → schließt Tab, ggf. zurück zum Browser

---

## 4. Datenmodell

### SQLite-Schema

```sql
-- Projekte (optional, im Hintergrund)
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Skripte
CREATE TABLE scripts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Unbenannt',
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  series TEXT,                          -- frei eingebbarer Serien-Name
  highlighting_enabled INTEGER,         -- NULL = global setting, 0/1 = override
  content_json TEXT NOT NULL,           -- Lexical-Editor-State als JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER,                  -- NULL = aktiv, sonst = im Papierkorb
  page_count INTEGER DEFAULT 1
);

-- Charaktere (global)
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                   -- Vollname, z.B. "Axel Stern"
  display_name TEXT NOT NULL,           -- ALLCAPS-Skript-Name, z.B. "AXEL"
  color TEXT NOT NULL,                  -- Hex
  description TEXT,                     -- Kurzbeschreibung 1-2 Sätze
  bible TEXT,                           -- Lange Notizen / Charakter-Bibel (Markdown)
  archived INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Aliasse pro Charakter
CREATE TABLE character_aliases (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  alias TEXT NOT NULL
);

-- Tags pro Charakter (z.B. "Hauptcharakter", "Cameo")
CREATE TABLE character_tags (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  tag TEXT NOT NULL
);

-- Skript ↔ Charakter Verknüpfung MIT Override-Mechanismus
CREATE TABLE script_characters (
  script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE RESTRICT,
  display_name_override TEXT,           -- Skript-spezifischer Name, NULL = global
  color_override TEXT,                  -- Skript-spezifische Farbe, NULL = global
  PRIMARY KEY (script_id, character_id)
);

-- Tags pro Skript (z.B. "Sketch", "Talking Head")
CREATE TABLE script_tags (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  tag TEXT NOT NULL
);

-- Snapshots (Versionierung)
CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  content_json TEXT NOT NULL,
  trigger TEXT NOT NULL,                -- 'auto' | 'manual'
  created_at INTEGER NOT NULL
);

-- App-State (offene Tabs etc.)
CREATE TABLE app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- FTS5 Full-Text-Search Index
CREATE VIRTUAL TABLE scripts_fts USING fts5(
  script_id UNINDEXED,
  title,
  content_text,                         -- extrahierter Plain-Text aus content_json
  character_names,                      -- Charaktere im Skript (display_names)
  tags,
  series,
  project_name
);

CREATE VIRTUAL TABLE characters_fts USING fts5(
  character_id UNINDEXED,
  name,
  display_name,
  description,
  bible,
  aliases
);
```

### Eindeutige Sortierung & Indizes

```sql
CREATE INDEX idx_scripts_updated_at ON scripts(updated_at DESC);
CREATE INDEX idx_scripts_project ON scripts(project_id);
CREATE INDEX idx_scripts_archived ON scripts(archived_at);
CREATE INDEX idx_snapshots_script ON snapshots(script_id, created_at DESC);
CREATE INDEX idx_script_chars_script ON script_characters(script_id);
CREATE INDEX idx_script_chars_char ON script_characters(character_id);
```

---

## 5. Editor: Block-System

### Block-Types (final, 7 Stück)

| # | Block | Hotkey | Aussehen |
|---|---|---|---|
| 1 | **Action** | Cmd+1 | Linksbündig, volle Spaltenbreite, normale Schrift |
| 2 | **Charakter** | Cmd+2 | Zentriert, ALLCAPS forciert, optional Pill mit Farbe (Highlight-Modus) |
| 3 | **Dialog** | Cmd+3 | Eingerückt (schmaler als Action), normale Schrift |
| 4 | **Parenthetical** | Cmd+4 | Klein, kursiv, eingerückt, in `()` automatisch eingebettet |
| 5 | **Kamera** | Cmd+5 | Rechtsbündig, ALLCAPS, klein |
| 6 | **Caption** | Cmd+6 | Pill/Badge-Style, klein, visuell distinkt |
| 7 | **SFX** | Cmd+7 | Eingerückt, kursiv, mit "SFX:"-Präfix |

### Tab-Verhalten

**Tab im aktuellen Block** → öffnet ein **Dropdown** mit allen Block-Types zur Auswahl. Pfeiltasten navigieren, Enter bestätigt, Escape schließt.

### Default-Block

- **Beim neuen, leeren Skript:** Charakter-Block (TikTok-typisch, Statement zuerst)
- **Erste Eingabe = Charakter** mit aktivem Charakter-Dropdown

### Inline-Formatierung (in Dialog & Action)

- **Cmd+B** → Fett
- **Cmd+I** → Kursiv
- **Cmd+U** → Unterstrichen
- Wird in PDF und Plain-Text-Export erhalten

---

## 6. Editor: Verhalten beim Schreiben

### Smart-Enter-Logik

```
In Action     + Enter → Charakter
In Charakter  + Enter → Dialog (sobald Charakter-Name gewählt/getippt wurde)
In Dialog     + Enter → Charakter
In Parenthetical + Enter → Dialog (gleicher Charakter)
In Kamera     + Enter → Charakter
In Caption    + Enter → Charakter
In SFX        + Enter → Charakter
```

**Action kommt nur manuell** (Cmd+1 oder Tab→Auswahl). Action ist die Ausnahme, nicht die Regel — passt zu TikTok-Workflow.

### Special: Doppel-Enter Toggle

Wenn ich in einem leeren Charakter-Block bin (Smart-Logik hat ihn erzeugt) und nochmal Enter drücke ohne zu tippen:

```
Charakter (leer) + Enter → konvertiert zu Action
Action (leer)    + Enter → konvertiert zu Charakter
```

→ Das gibt dem User einen eleganten Weg, zwischen den beiden häufigsten Block-Types zu togglen.

### Backspace-Verhalten

**Backspace in einem leeren Block** → Block wird gelöscht, Cursor springt zurück ans Ende des Blocks davor.

### Mehrzeiliger Dialog

- **Innerhalb eines Dialog-Blocks:** Text läuft automatisch um (wie ein Textabsatz in Word)
- **Shift+Enter** → manueller Zeilenumbruch im Dialog (kein neuer Block)
- **Enter** → neuer Block (Smart-Logik: Charakter)

### Parenthetical-Live-Erkennung

**Im Dialog tippe ich `(`:**

1. App erkennt Live: ab `(` wird der Inhalt als Parenthetical formatiert (klein, kursiv)
2. Sobald ich `)` tippe, springt der Cursor automatisch in einen **neuen Dialog-Block (gleicher Charakter)**
3. Der Parenthetical wird als eigener Block in den Lexical-State eingefügt

**Über Cmd+4 oder Tab→Parenthetical:**

1. Neuer Parenthetical-Block wird erzeugt mit `()` schon vorbefüllt
2. Cursor steht zwischen den Klammern
3. Ich tippe drin
4. Enter → springt in neuen Dialog-Block (gleicher Charakter)

### Character-Block: ALLCAPS forciert

Sobald der Cursor in einem Charakter-Block ist:
- Jeder Tastenanschlag wird automatisch in Großbuchstaben umgewandelt
- Auch beim Einfügen (Paste) wird der Inhalt uppercase konvertiert
- Keine Toleranz für gemischte Schreibung

### A4-Layout & Seitenumbrüche

- **A4-Papier sichtbar im Editor** (mit Schatten auf grauem/dunklem Hintergrund)
- **Seitenränder:** Standard-Drehbuch (oben/unten 2.5cm, links 3.7cm, rechts 2.5cm) — anpassbar in v2
- **Echte Seitenumbrüche** zwischen den Seiten
- **Seitenzahlen** in der Statusleiste unten ("Seite 2 von 4")
- **Live-Berechnung** der Seitenumbrüche basierend auf Block-Höhen

### Widow/Orphan-Control (KRITISCHE REGEL)

> **Charakter + Dialog dürfen NIEMALS getrennt werden.**

Wenn ein Charakter-Dialog-Pärchen am unteren Seitenrand nicht mehr zusammen passt:
- **Beide wandern auf die nächste Seite**
- **Parenthetical zwischen Charakter und Dialog ebenfalls mitnehmen**
- **Auch mehrteilige Dialog-Sequenzen mit Parentheticals dazwischen bleiben zusammen** (klassische Drehbuch-Konvention)

Algorithmus:
1. Vor jedem Seitenumbruch prüfen: Steht direkt davor ein Charakter-Block?
2. Falls ja: ganzen Charakter-Dialog-Block-Cluster auf nächste Seite verschieben
3. Cluster = Charakter + alle direkt folgenden Dialog/Parenthetical-Blöcke bis zum nächsten anderen Block-Type

### Auto-Save

- **Nach jedem Tastenanschlag** wenn Performance es zulässt
- Falls nicht: **Debounced Auto-Save** (~300ms nach Tipp-Pause)
- **SQLite WAL-Mode** für non-blocking Writes
- **Status in der Footer-Leiste:** "Gespeichert" / "Speichert..."

### Snapshot-System (Versionierung)

- **Auto-Snapshot alle 5 Minuten** während aktivem Schreiben
- **Manueller Snapshot** via Cmd+Shift+S
- **Bis zu 50 Snapshots pro Skript** (älteste werden überschrieben)
- **Snapshot-Browser** öffenbar via Cmd+Shift+H — zeigt alle Snapshots, Vorschau, "Wiederherstellen"-Button

---

## 7. Charakter-System

### Charakter-Felder

| Feld | Typ | Beschreibung |
|---|---|---|
| `name` | String | Vollname, z.B. "Axel Stern" |
| `display_name` | String | ALLCAPS-Skript-Name, z.B. "AXEL" |
| `color` | Hex | Charakter-Farbe für Highlighting |
| `description` | String | Kurzbeschreibung (1-2 Sätze) |
| `bible` | Markdown | Lange Notizen / Charakter-Bibel |
| `aliases` | String[] | z.B. ["Der Praktikant", "Axel Stern"] |
| `tags` | String[] | z.B. ["Hauptcharakter", "Wiederkehrend"] |
| `archived` | Boolean | Versteckt aus Hauptansicht |

### Charakter-Speicherung: Hybrid-Modell

- **Charaktere existieren global** (in der `characters`-Tabelle)
- **Pro Skript verlinkbar** über `script_characters`-Tabelle
- **Override-Mechanismus:** Pro Skript kann `display_name` und `color` überschrieben werden, ohne den globalen Charakter zu ändern

### Charakter-Dropdown im Editor

**Wenn der Cursor in einem Charakter-Block ist:**

1. **Sofort beim Aktivieren des Blocks** erscheint ein Dropdown unter dem Cursor mit allen Charakteren des aktuellen Skripts
2. **Beim Tippen** wird die Liste live gefiltert (Substring-Match, case-insensitive)
3. **Enter** wählt den markierten Eintrag
4. **Pfeiltasten** navigieren
5. **Escape** schließt Dropdown, behält Texteingabe als neuen Charakter
6. **Liste enthält:** Skript-Charaktere zuerst, dann globale Charaktere darunter (visuell getrennt)

### Neuer Charakter wird getippt

**Szenario:** Ich tippe "MURAT" und drücke Enter, MURAT existiert noch nicht im Skript.

1. Charakter wird **temporär dem Skript hinzugefügt** mit zufälliger Farbe aus Default-Palette
2. **Subtiler Inline-Hinweis** neben dem Charakter-Block:
   ```
   Neuer Charakter "MURAT" — [Global übernehmen?] [Nur in diesem Skript]
   ```
3. **Default-Verhalten:** Wenn nicht reagiert wird, bleibt der Charakter nur in diesem Skript
4. **Bei Klick "Global übernehmen":** Charakter wird in `characters`-Tabelle aufgenommen, in script_characters verlinkt
5. **Hinweis verschwindet** nach 10 Sekunden oder nach erstem Klick

### Charakter-Import beim Skript-Erstellen

**Optional, aber wenn der User es nutzt:**

- Beim Klick auf "Neues Skript" gibt es eine Mini-Sektion "Charaktere importieren"
- Liste aller globalen Charaktere als Pills mit Toggle-Auswahl
- Ausgewählte Charaktere werden direkt mit dem neuen Skript verlinkt (Farben, Namen werden übernommen)

### Charakter-Quick-Edit aus dem Skript

**Cmd+Click auf einen Charakter-Namen im Skript:**

1. Kleines Popover öffnet sich neben dem Charakter
2. **Felder editierbar:** display_name, color
3. **Toggle:** "Global ändern" vs. "Nur in diesem Skript überschreiben"
4. Speichern → schreibt in `characters` (global) oder in `script_characters.display_name_override` / `color_override` (nur Skript)

### Charakter-Pills oben am Skript-Anfang

- **Position:** Direkt über dem ersten Block, klein
- **Sichtbar wenn:** Skript hat mindestens 1 Charakter
- **Aussehen:** Kleine farbige Tags mit Charakter-Namen (Farbe = Charakter-Farbe als Hintergrund-Tint)
- **Klick auf Pill:** Öffnet kleines Popover mit Charakter-Profil-Quick-View (Name, Beschreibung, Tags, "Profil öffnen"-Button)
- **Verhalten beim Scrollen:** Pills bleiben sichtbar oben (sticky-Header-Verhalten)

### Charakter-Highlighting im Editor

**Default: AUS** (Setting `highlighting_default = false`)

**Wenn aktiviert (global oder pro Skript):**
- Charakter-Block bekommt farbigen Hintergrund-Tint in Charakter-Farbe (transparent ~30%)
- Dialog-Blöcke direkt darunter ebenfalls farbiger Tint
- Parenthetical zwischen Charakter und Dialog ebenfalls
- Action, Kamera, Caption, SFX bleiben **immer neutral** (kein Tint)

**Pro-Skript-Override:**
- In den Skript-Metadaten (im Datei-Browser) kann pro Skript "Highlighting an / aus / global" gesetzt werden
- NULL in DB = global setting verwenden
- 0/1 = explizit aus/an

---

## 8. Datei-Browser & Start-Screen

### Layout

- **Vollbild** (in einem Tab)
- **Header oben:** Tabs zum Switchen: **Skripte** | **Charaktere** | **Papierkorb**
- **Unter Header:** Suchfeld zentriert mit Filter-Pills daneben
- **Hauptbereich:** Grid von Karten

### Skript-Karten

| Inhalt der Karte |
|---|
| **Titel** (groß, oben) |
| **Projekt-Name** (klein, unter Titel, falls vorhanden) |
| **Charaktere** (kleine farbige Pills, max. 4 sichtbar, "+3" wenn mehr) |
| **Letzte Bearbeitung** ("vor 2 Stunden", "Gestern", "Letzten Mittwoch") |
| **Seitenzahl** (klein, rechts unten) |

**Karten-Verhalten:**
- **Klick** → öffnet Skript im aktuellen Tab oder neuem Tab (siehe Tab-System)
- **Cmd+Click** → öffnet immer in neuem Tab
- **Rechtsklick** → Kontextmenü (Umbenennen, Duplizieren, In Papierkorb verschieben)
- **Bei Auswahl** (Single-Click ohne Öffnen): Sidebar rechts erscheint mit Metadaten-Editor

### Metadaten-Sidebar (rechts)

**Erscheint nur im Datei-Browser**, **niemals im Editor-Mode**.

Felder:
- **Titel** (editierbar)
- **Projekt** (Dropdown mit Autocomplete, "Neues Projekt erstellen" am Ende)
- **Tags** (Multi-Tag-Eingabe mit Autocomplete)
- **Serie** (Eingabefeld mit Autocomplete)
- **Highlighting** (Toggle: Global / An / Aus)

### Filter-System (oben im Browser)

- **Projekt:** Multi-Select-Dropdown
- **Tags:** Multi-Select-Dropdown
- **Charakter:** Multi-Select-Dropdown ("Alle Skripte mit AXEL und MURAT")
- **Sortierung:** Letzte Bearbeitung (default) / Erstelldatum / Alphabetisch

### Welcome-Screen (frische Installation)

- **Demo-Skript** ist bereits angelegt (zeigt alle Block-Types)
- Datei-Browser zeigt das Demo-Skript als Karte
- Wenn der User das Demo-Skript löscht und keine eigenen hat, erscheint zentriert:
  - **"Erstes Skript erstellen"**-Button (groß, prominent)
  - Subtiler Text darunter: "Cmd+N für ein neues Skript"

### Beim ersten Start (Onboarding)

- Demo-Skript "Willkommen bei ScriptZ" ist sichtbar
- Inhalt zeigt alle Block-Types in Aktion mit kurzen Erklärungen
- Beispiel: Charakter-Block "AXEL" mit Dialog "So sieht ein Charakter-Dialog aus."
- User kann das Skript löschen oder als Spielwiese nutzen

---

## 9. Charakter-Übersicht

### Erreichbarkeit

- **Eigener Tab im Datei-Browser** ("Skripte | Charaktere | Papierkorb")
- **Niemals aus dem Skript-Editor heraus** (außer Quick-Edit per Cmd+Click)

### Layout

**Karten-Grid** mit Charakter-Farbe als Hintergrund-Akzent.

### Charakter-Karte

| Inhalt |
|---|
| **Display Name** (groß, ALLCAPS, mit Farbe) |
| **Vollname** (klein, darunter) |
| **Tags** (kleine Pills) |
| **Anzahl Skripte** ("In 47 Skripten") |
| **Anzahl Dialog-Zeilen** (Statistik gesamt) |

**Klick auf Karte** → öffnet Charakter-Detail-Seite

### Charakter-Detail-Seite

**Layout:**
- **Header:** Name groß, Farb-Picker als Akzent, "Bearbeiten"-Button
- **Felder (read-only, oder editierbar im Edit-Modus):**
  - Vollname
  - Display Name
  - Farbe
  - Beschreibung
  - Charakter-Bibel (Markdown-Editor mit Tiptap-ähnlichem Editor)
  - Aliasse (editierbare Liste)
  - Tags (editierbare Liste)
- **Statistiken:**
  - Anzahl Skripte
  - Anzahl Dialog-Zeilen total
  - Erstellt am / Zuletzt geändert am
- **Skript-Liste:** Alle Skripte mit diesem Charakter, klickbar zum Öffnen, sortiert nach Datum
- **"Charakter archivieren"-Button** unten

### Edit-Modus

- Klick auf "Bearbeiten" → alle Felder werden editierbar
- "Speichern" / "Abbrechen" oben rechts
- **Beim Speichern eines geänderten `display_name`:**
  - Dialog: "Soll dieser Charakter in allen X Skripten umbenannt werden?"
  - "Ja, alle migrieren" / "Nein, nur Stammdaten ändern" / "Abbrechen"

### Archivierte Charaktere

- Versteckt in der Standard-Ansicht
- Toggle oben: "Archivierte anzeigen" → blendet sie ein (visuell ausgegraut)
- Können wieder reaktiviert werden

---

## 10. Tab-System

### Tab-Leiste

- **Position:** Ganz oben am Fenster
- **Auto-Hide:** Wenn nur 1 Tab offen ist, wird die Tab-Leiste nicht angezeigt
- **Erscheint:** Bei 2+ Tabs ODER bei Hover oben am Fensterrand ODER beim Drücken von Cmd+T

### Tab-Aussehen

- **Titel** (Skript-Titel oder "Neuer Tab" für Browser-Tabs)
- **Schließen-X** rechts (Chrome-Style)
- Aktiver Tab visuell hervorgehoben (subtiler Hintergrund)
- Inactive Tabs gedämpft

### Tab-Verhalten

- **Cmd+T** → Neuer Browser-Tab
- **Cmd+W** → Aktuellen Tab schließen
- **Cmd+Tab** → Nächster Tab (innerhalb der App)
- **Cmd+Shift+Tab** → Vorheriger Tab
- **Cmd+1..9** → Tab nach Index aktivieren (innerhalb des Editor-Modus konfliktfrei mit Block-Hotkeys, weil im Editor Cmd+1 = Action ist; im Browser-Tab haben wir keine Block-Hotkeys)

### Tab-Persistenz

- **Beim App-Schließen:** Alle offenen Tabs werden in `app_state` gespeichert (Skript-IDs + welcher Tab aktiv war)
- **Beim App-Start:** Tabs werden wiederhergestellt
- Wenn ein Skript zwischenzeitlich gelöscht wurde: Tab wird übersprungen

### Beim Klick auf Skript-Karte im Browser

- **Default:** Skript wird im aktuellen Tab geöffnet (Browser-Tab wird zu Skript-Tab)
- **Cmd+Click:** Öffnet in neuem Tab, aktueller Tab bleibt erhalten

---

## 11. Suche

### Cmd+K — Globale Suche

Spotlight-artiges Modal, öffnet sich überall.

### Suchumfang

Sucht in:
- Skript-Inhalt (Volltext)
- Skript-Titel
- Charakter-Namen (display_name + name)
- Charakter-Aliasse
- Tags
- Serien
- Projekte
- Charakter-Bibel-Texte

### Suchergebnis-Layout

**Modal mit:**
- Suchfeld oben
- Ergebnisliste darunter, gruppiert nach Typ:
  - **Skripte** (mit Snippet, in dem die Treffer hervorgehoben sind)
  - **Charaktere** (mit Skript-Anzahl)
  - **Projekte** (mit Skript-Anzahl)
- **Pfeiltasten** navigieren
- **Enter** öffnet das ausgewählte Element
- **Escape** schließt Modal

### Cmd+F — Suche im aktuellen Skript (V2)

Erstmal nur globale Suche. Lokale Suche ist v2-Feature.

---

## 12. Export

### Cmd+E — Export-Modal

**Layout des Modals:**

```
┌─────────────────────────────────────────┐
│  Skript exportieren                     │
│                                         │
│  Format:                                │
│    ◉ PDF                                │
│    ○ Plain Text (für Teleprompter)      │
│                                         │
│  Optionen:                              │
│    ☐ Charakter-Highlighting             │
│    ☐ Titelblatt einschließen            │
│                                         │
│         [Abbrechen]  [Exportieren]      │
└─────────────────────────────────────────┘
```

### PDF-Export

**Layout:**
- **1:1 wie der Editor** (gleiche Schriftart, gleiches Layout, gleiche Einrückungen)
- **A4** mit Seitenzahlen unten
- **Highlighting:** Wenn aktiviert, Charakter + Dialog mit farbigem Hintergrund-Tint
- **Titelblatt:** Wenn aktiviert, eine zusätzliche erste Seite mit:
  - Titel zentriert in der Mitte
  - Datum (Erstelldatum)
  - Charaktere-Liste
  - Seitenanzahl

**Technische Umsetzung:**
- Rust-Crate `printpdf` oder `genpdf`
- Generierung erfolgt im Tauri-Backend (nicht im Frontend!)
- Rendering basiert auf dem Lexical-State (JSON), wird in PDF-Layout-Beschreibung übersetzt

### Plain-Text-Export

**Inhalt:**
- Nur Charakter, Dialog, Parenthetical
- Action, Kamera, Caption, SFX werden komplett weggelassen

**Format:**

```
AXEL
Was geht ab Leute?

(grinst)
Heute zeige ich euch was Krasses.

MURAT
Mach mal!
```

**Verwendung:** Teleprompter

### Speicherung

- **macOS Speichern-Dialog** öffnet sich
- User wählt Pfad und Dateiname
- Default-Dateiname: `[Skript-Titel].pdf` oder `[Skript-Titel].txt`

### Tastenkürzel

- **Cmd+E** → Export-Modal öffnen

---

## 13. Settings

### Settings-Fenster

Erreichbar via macOS-Standard "App → Einstellungen" (Cmd+,).

### Felder

| Setting | Typ | Default |
|---|---|---|
| **Theme** | Dark / Light / Auto-System | Dark |
| **Highlighting Default** | An / Aus | Aus |
| **Update-Check** | An / Aus + Hourly-Toggle | An |

### Zukünftige Settings (v2)

- Default-Schriftart und -größe im Editor
- Auto-Save-Verhalten
- Snapshot-Intervall
- DB-Backup-Funktion

---

## 14. Lifecycle & Edge-Cases

### Charakter umbenennen

1. User editiert `display_name` in der Charakter-Detail-Seite
2. Beim Speichern: Dialog
   ```
   AXEL ist in 47 Skripten verwendet.
   Sollen alle Skripte den neuen Namen "AXEL STERN" zeigen?
   
   [Ja, alle migrieren] [Nein, nur Stammdaten ändern] [Abbrechen]
   ```
3. **Ja, alle migrieren:** alle Lexical-States der verlinkten Skripte werden geupdatet
4. **Nein, nur Stammdaten:** Charakter wird umbenannt, in alten Skripten bleibt der alte Name als Override (`display_name_override` wird gesetzt)
5. **Abbrechen:** Änderung wird verworfen

### Charakter löschen

1. User klickt "Löschen" in der Charakter-Detail-Seite
2. Wenn Charakter mit mind. 1 Skript verlinkt ist:
   ```
   AXEL ist in 47 Skripten verwendet.
   Charaktere mit Skript-Verknüpfungen können nicht gelöscht werden.
   
   Stattdessen archivieren?
   
   [Archivieren] [Abbrechen]
   ```
3. Wenn keine Skripte verlinkt: Hard-Delete mit einfacher Bestätigung
4. Archivierte Charaktere sind versteckt, aber wiederherstellbar

### Projekt löschen

1. User klickt "Löschen" auf einem Projekt
2. Wenn Projekt Skripte enthält:
   ```
   "Murat-Doku" enthält 12 Skripte. Was soll passieren?
   
   ◉ Skripte projektlos machen (bleiben erhalten)
   ○ Skripte mitlöschen (in den Papierkorb)
   
   [Abbrechen] [Löschen]
   ```
3. Wenn Projekt leer: einfache Löschbestätigung

### Skript löschen

1. Skript wird in den Papierkorb verschoben (`archived_at` wird gesetzt)
2. Bleibt im Papierkorb-Tab sichtbar
3. **Wiederherstellbar** über "Wiederherstellen"-Button im Papierkorb
4. **Endgültig gelöscht** nur via "Papierkorb leeren"-Button (komplette Liste oder einzeln)
5. **Kein Auto-Delete** — Papierkorb wird nie automatisch geleert

### Skript ohne Titel speichern

1. Default-Titel "Unbenannt"
2. Bleibt "Unbenannt" bis User ihn ändert
3. **Mehrere "Unbenannt"-Skripte sind erlaubt** — werden in der Datei-Browser-Liste mit Datum unterschieden
4. Beim Export wird "Unbenannt" als Dateiname vorgeschlagen

### App-Start ohne Tabs

- Welcome-Screen / Datei-Browser im aktuellen Fenster
- Kein leerer Editor

### Crash-Recovery

- Da Auto-Save nach jedem Tastenanschlag (oder ~300ms debounced) erfolgt, sind Datenverluste minimal
- Beim nächsten App-Start werden die letzten offenen Tabs wieder geladen
- Snapshots als zusätzliches Sicherheitsnetz

---

## 15. Updates

### Wie NoteZ — Pattern wiederverwenden

- **Stündlicher Check** auf GitHub Releases (kein Telemetrie, nur GET-Request)
- **Update verfügbar:** Indikator erscheint im Datei-Browser (Tab "Skripte") oben rechts als kleines Pill
- **Klick auf Pill:** Download im Hintergrund, Pill wird zu Progress-Bar
- **Download fertig:** Pill wird zu "Restart to apply"
- **Klick auf Restart:** App neu starten, Update wird angewendet

### Update-Indikator nicht im Editor sichtbar

- Im Editor-Modus stört kein Update-Pill
- Nur im Datei-Browser / Start-Screen sichtbar
- Settings hat eigene "Manuell prüfen"-Option

### Erstinstallation

- App ist unsigned (kein Apple Developer Account in v1) — User muss `xattr -cr` einmal ausführen
- README erklärt das (gleicher Pattern wie NoteZ)

---

## 16. Performance-Anforderungen

### Performance-Doktrin

> "ScriptZ darf nie ruckeln. Wenn ein Feature die Performance kompromittiert, fliegt es raus."

### Konkrete Ziele

| Metrik | Ziel |
|---|---|
| **App-Start (Cold)** | < 800ms |
| **Skript öffnen (10 Seiten)** | < 100ms |
| **Tastenanschlag → Bildschirm** | < 16ms (60fps) |
| **Auto-Save Latenz (nicht spürbar)** | < 50ms |
| **Globale Suche (Cmd+K) auf 1000 Skripten** | < 200ms |
| **Datei-Browser mit 1000 Skripten** | < 100ms (mit Virtualisierung) |
| **PDF-Export (10 Seiten)** | < 1 Sekunde |

### Architektur-Entscheidungen für Performance

- **SQLite WAL-Mode** für non-blocking Writes
- **FTS5** für O(log n) Volltextsuche
- **Virtualisierte Listen** im Datei-Browser (nur sichtbare Karten gerendert)
- **Lexical** ist von Haus aus performant (Differential-Updates)
- **Tauri statt Electron** = ~10MB Binary statt ~100MB
- **Solid statt React/Vue** = effizientere reaktive Updates
- **Rust statt JavaScript** im Backend = native Performance

---

## 17. Tastenkürzel-Referenz

### Globale Hotkeys

| Hotkey | Aktion |
|---|---|
| `Cmd+N` | Neues Skript |
| `Cmd+T` | Neuer Browser-Tab |
| `Cmd+W` | Aktuellen Tab schließen |
| `Cmd+K` | Globale Suche |
| `Cmd+E` | Export-Modal |
| `Cmd+,` | Einstellungen |
| `Cmd+Tab` / `Cmd+Shift+Tab` | Tabs durchschalten |
| `Cmd+1..9` | Tab nach Index (im Browser-Mode) |

### Editor-Hotkeys (Block-Wechsel)

| Hotkey | Block-Type |
|---|---|
| `Cmd+1` | Action |
| `Cmd+2` | Charakter |
| `Cmd+3` | Dialog |
| `Cmd+4` | Parenthetical |
| `Cmd+5` | Kamera |
| `Cmd+6` | Caption |
| `Cmd+7` | SFX |
| `Tab` | Block-Type-Dropdown öffnen |

### Editor-Hotkeys (Formatierung)

| Hotkey | Aktion |
|---|---|
| `Cmd+B` | Fett (in Dialog/Action) |
| `Cmd+I` | Kursiv (in Dialog/Action) |
| `Cmd+U` | Unterstrichen (in Dialog/Action) |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Shift+Enter` | Manueller Zeilenumbruch im Dialog |

### Snapshot-Hotkeys

| Hotkey | Aktion |
|---|---|
| `Cmd+Shift+S` | Manueller Snapshot |
| `Cmd+Shift+H` | Snapshot-Browser für aktuelles Skript |

---

## 18. Out of Scope (für immer)

Diese Features kommen **NICHT** in ScriptZ:

- ❌ Drehtage / Drehplanung
- ❌ Locations als eigene Entität
- ❌ Notizen-Block (interne Anmerkungen im Skript)
- ❌ Person-Verknüpfung am Charakter (kein "gespielt von")
- ❌ Bilder / Profilbilder (auch keine Charakter-Bilder)
- ❌ ElevenLabs-Voice-Integration
- ❌ Drag & Drop (in v1; ggf. später diskutierbar)
- ❌ Cloud-Sync
- ❌ Accounts / Login
- ❌ Telemetrie / Analytics
- ❌ Kollaboration / Echtzeit-Editing
- ❌ Hook als eigener Block-Type
- ❌ AI-Features im Editor
- ❌ Plugin-System
- ❌ Mehrere Skript-Layouts (Stage-Play, Comic etc.)
- ❌ Industry-Standard-Drehbuch-Layout-Optionen (z.B. Courier 12pt mit 1.5" Margins)

---

## 19. Roadmap-Vorschlag

### Phase 1: Fundament (1-2 Tage)

- Tauri-Projekt aufsetzen mit Solid + TypeScript
- SQLite-Schema implementieren (Migrations-System)
- Basis-Window mit Traffic Lights, Vibrancy, Dark/Light-Theme
- Design-System anlegen (Tokens für Farben, Spacings, Radii, Schriften)
- Lexical-Integration ohne React (Solid-Wrapper)

### Phase 2: Editor-Core (2-3 Tage)

- Custom Lexical Nodes für alle 7 Block-Types
- Smart-Enter-Logik
- Tab-Dropdown
- Backspace-Verhalten
- ALLCAPS-Forcing in Charakter-Block
- Parenthetical-Live-Erkennung
- Inline-Formatierung (Bold/Italic/Underline)
- Auto-Save mit SQLite WAL

### Phase 3: A4-Layout & Seitenumbrüche (1-2 Tage)

- A4-Papier-Optik mit Schatten
- Live-Seitenumbruch-Berechnung
- Widow/Orphan-Control für Charakter-Dialog-Cluster
- Seitenzahl-Anzeige in Statusleiste

### Phase 4: Charakter-System (2 Tage)

- Charakter-Dropdown im Editor
- Charakter-Pills oben am Skript
- Cmd+Click auf Charakter → Quick-Edit-Popover
- Neuer-Charakter-Inline-Hinweis
- Override-Mechanismus (script_characters mit display_name_override / color_override)
- Charakter-Highlighting-Rendering (mit Toggle)

### Phase 5: Datei-Browser & Charakter-Übersicht (2 Tage)

- Browser-Tab mit Grid-Layout
- Skript-Karten + Filter + Sortierung
- Metadaten-Sidebar rechts
- Charakter-Übersicht (Karten-Grid)
- Charakter-Detail-Seite mit Edit-Modus
- Tab-Switch (Skripte | Charaktere | Papierkorb)

### Phase 6: Tab-System & Cmd+K (1-2 Tage)

- Tab-Leiste oben mit Auto-Hide
- Tab-Persistenz über App-Restarts
- Cmd+K Spotlight-Suche mit FTS5

### Phase 7: Export (1-2 Tage)

- Export-Modal
- PDF-Generierung (Rust)
- Plain-Text-Export
- macOS Speichern-Dialog

### Phase 8: Snapshots & Papierkorb (1 Tag)

- Auto-Snapshots alle 5 Minuten
- Manuelle Snapshots
- Snapshot-Browser (Cmd+Shift+H)
- Papierkorb-Tab mit "Wiederherstellen" und "Endgültig löschen"

### Phase 9: Updates & Polish (1-2 Tage)

- Update-Check via GitHub Releases (NoteZ-Pattern)
- Update-Pill im Datei-Browser
- Animations-Polish
- Demo-Skript für Erstinstallation
- README schreiben (mit `xattr`-Anleitung)
- Erste DMG bauen und releasen

---

## Geschätzte Gesamtzeit

**~2 Wochen Entwicklungszeit mit Claude Code**, vorausgesetzt der Stack ist von NoteZ vertraut.

Realistisch eher 2-3 Wochen mit Polish, Bug-Fixing und iterativem Tuning.

---

## Wichtige Architektur-Hinweise für die Implementierung

### Lexical-State als Single Source of Truth

- Skript-Inhalt = Lexical EditorState als JSON in `scripts.content_json`
- Änderungen am State triggern Auto-Save
- Beim Öffnen wird der State in den Editor geladen
- Bei Skript-Wechsel: aktueller State wird gespeichert, neuer geladen

### Charakter-Erkennung im Lexical-State

- Charakter-Blocks haben eine `characterId` als Property
- Beim Tippen eines neuen Namens wird ein temporärer Eintrag in `script_characters` erstellt
- Dropdown nutzt diese ID-Verlinkung, nicht reine Strings

### Plain-Text-Extraktion für FTS5

- Bei jedem Save wird zusätzlich eine Plain-Text-Version aus dem Lexical-State extrahiert
- Wird in `scripts_fts.content_text` gespeichert
- FTS5-Index wird inkrementell aktualisiert

### PDF-Generierung im Backend

- Lexical-State (JSON) wird im Backend in eine intermediate Repräsentation geparst
- Layout-Berechnung und PDF-Generierung passieren in Rust (Performance!)
- Frontend ruft nur `invoke('export_pdf', { script_id, options })` auf

### Theme-System

- CSS Custom Properties für alle Farben
- Dark/Light wird über `data-theme` Attribut am Root umgeschaltet
- Charakter-Farben werden zur Laufzeit injiziert (CSS Variables pro Charakter-ID)

---

## Schluss

Dieser Plan ist die Spezifikation für ScriptZ v1. Jeder Aspekt vom ersten Buchstaben bis zum PDF-Export ist hier definiert.

**Bei Unklarheiten während der Implementierung:** Im Zweifel **immer** die einfachere, schnellere, minimalistische Variante wählen. Der Nordstern bleibt:

> **App auf → schreiben → ausdrucken → fertig.**
