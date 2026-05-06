<h1 align="center">ScriptZ</h1>

<p align="center">
  <strong>The script editor that gets out of your way.</strong>
</p>

<p align="center">
  <em>Local. Private. Mac-first.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.2.0-e0791f?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/platform-macOS-e0791f?style=flat-square" alt="macOS" />
  <img src="https://img.shields.io/badge/Apple_Silicon-native-e0791f?style=flat-square" alt="Apple Silicon" />
  <img src="https://img.shields.io/badge/storage-local_only-e0791f?style=flat-square" alt="local-only" />
  <img src="https://img.shields.io/badge/telemetry-none-e0791f?style=flat-square" alt="no telemetry" />
  <img src="https://img.shields.io/badge/license-MIT-e0791f?style=flat-square" alt="license" />
</p>

---

## The pitch in one paragraph

Final Draft is too heavy. Google Docs is too generic. Arc Studio wants a
subscription. **ScriptZ is the middle nobody else built.** It opens
instantly, knows seven block types instead of one, formats your dialog
on the page like a real shooting script, and keeps everything you write
in a single file on your Mac. No account. No cloud. No telemetry. Made
for TikTok creators and sketch teams who need the next idea on paper
*now*.

> **The Northstar:** App auf → schreiben → ausdrucken → fertig.

---

## What makes it different

### Built around block types, not paragraphs

Most editors give you one paragraph type and expect you to invent
formatting on top. ScriptZ ships **seven** semantic block types —
**Action, Charakter, Dialog, Parenthetical, Kamera, Caption, SFX** —
each with its own indentation, weight, alignment, and behaviour. Press
Enter in a Charakter block and you land in Dialog automatically. Press
Enter in Dialog and you land back in Charakter. The keystroke pattern
matches the shape of the script you're writing — one character speaks,
then another, and Action only when it actually matters.

### Smart-Enter, ALLCAPS, parentheticals — the way it works in your head

Type a name in the Charakter block; press Enter; you're in Dialog. Open
a `(` mid-dialog; the rest is auto-formatted as a Parenthetical until
you close it with `)` and you snap back to Dialog. Type a brand-new
name and it shows up in the script's character pillbar with its own
colour. Characters live **only inside the script you write them in** —
no global directory, no registry to maintain, no migration prompts.

### Every word stays on your machine

Everything lives in **one SQLite file** on your Mac:

```
~/Library/Application Support/de.agent-z.scriptz/scriptz.db
```

Back it up however you like. Drop the folder in iCloud Drive or Dropbox
to sync between Macs. Move it to an external drive. Open it with any
SQLite tool to look inside. There is no ScriptZ server. There is no
account. The only network call ScriptZ ever makes is an hourly check
against GitHub Releases for new versions — no body, no identifier, no
telemetry.

### Mac-first, properly

Native dark mode. Real A4-paper layout in the editor with proper
screenplay margins. The whole app is around ten megabytes because it's
**Tauri + Rust**, not Electron.

---

## Features

| | |
|---|---|
| **Seven block types** | Action, Charakter, Dialog, Parenthetical, Kamera, Caption, SFX. Each one with its own hotkey (`Cmd+1..7`), its own typography, its own Smart-Enter target. |
| **Smart-Enter flow** | Charakter → Dialog → Charakter, automatic. Empty Charakter ↔ Action toggle on Enter. Backspace at the start of an empty block deletes it cleanly. |
| **Per-script characters** | Characters belong to the script you write them in. Type a new name in a Charakter block and it appears in the pillbar with an auto-assigned colour. No global registry, no aliases, no overrides. |
| **Live character autocomplete** | Type into a Charakter block and a dropdown suggests names already in this script. |
| **Character highlighting** | Optional per-script tint behind Charakter, Dialog, and Parenthetical blocks. Helps you see who's talking at a glance. Off by default. |
| **A4 paper layout** | Real screenplay margins (3.7 cm left, 2.5 cm everywhere else), live page numbers, page-break markers between sheets. |
| **Spotlight-style search** | `Cmd+K` opens a full-text search over your scripts. FTS5 with snippet highlighting. |
| **PDF + Plain Text export** | `Cmd+E`. PDF exported in Rust with widow/orphan control on Charakter–Dialog clusters. Plain Text mode strips everything except dialog for the teleprompter. |
| **Snapshots** | Auto every 5 minutes while you're writing, manual via `Cmd+Shift+S`. Up to 50 per script. `Cmd+Shift+H` opens the history browser. |
| **Tabs with persistence** | Multiple scripts open at once. Tab strip auto-hides when only one is open. Layout restores on next launch. |
| **Trash with restore** | Deleted scripts go to a Papierkorb tab. Restore individually or empty. Nothing auto-purges. |
| **Themes** | Dark (default), Light, Auto. |

---

## Keyboard

### Global

| | |
|---|---|
| `Cmd+N` | New script |
| `Cmd+T` | New browser tab |
| `Cmd+W` | Close active tab |
| `Cmd+K` | Search scripts |
| `Cmd+E` | Export modal |
| `Cmd+,` | Settings |
| `Cmd+Tab` / `Cmd+Shift+Tab` | Cycle tabs |
| `Cmd+1..9` | Jump to tab by index (in browser) |

### Editor — block types

| | |
|---|---|
| `Cmd+1` | Action |
| `Cmd+2` | Charakter |
| `Cmd+3` | Dialog |
| `Cmd+4` | Parenthetical |
| `Cmd+5` | Kamera |
| `Cmd+6` | Caption |
| `Cmd+7` | SFX |
| `Tab` | Block-type picker |

### Editor — formatting

| | |
|---|---|
| `Cmd+B` / `Cmd+I` / `Cmd+U` | Bold / Italic / Underline (in Action + Dialog) |
| `Cmd+Z` / `Cmd+Shift+Z` | Undo / Redo |
| `Shift+Enter` | Soft line break inside Dialog |

### Snapshots

| | |
|---|---|
| `Cmd+Shift+S` | Manual snapshot |
| `Cmd+Shift+H` | Snapshot browser |

---

## Install

ScriptZ is built for **Apple Silicon Macs**.

1. Drag **ScriptZ.app** into **Applications**.
2. The app is unsigned (no Apple Developer account yet), so macOS Gatekeeper
   blocks it on first launch. Run this once in Terminal to clear the
   quarantine flag:

   ```bash
   xattr -cr /Applications/ScriptZ.app
   ```

3. Open ScriptZ from Applications. It launches normally from now on.

If you skip step 2, you'll see *"ScriptZ is damaged and can't be opened"* or
*"cannot be opened because the developer cannot be verified"*. That's
macOS, not the app. The `xattr` command just removes the quarantine flag
that Safari/Finder added to the download.

### Updating

ScriptZ checks GitHub Releases once an hour for newer versions. When one
is available, a small orange **Update available** pill appears in the
file browser, top-right. The check sends no payload, no identifier, no
telemetry. Disconnecting from the internet just means the pill never
appears; the app keeps working.

The `xattr` step is only needed for the *first* install.

---

## Promises

- **No accounts.** Ever.
- **No cloud.** Your scripts never touch a server we control.
- **No telemetry.** We don't watch when you write, what you write, or whether you write at all.
- **No forced updates.** Updates are checked once an hour against GitHub Releases. Downloading happens only when you click the pill.
- **No lock-in.** It's a SQLite file. You own it.

---

## Built with

Tauri 2 + Rust on the back, Solid + TypeScript on the front, Lexical for
the editor (vanilla — no React), SQLite (FTS5) for storage and search,
`printpdf` for PDF rendering. The whole app is around ten megabytes.

For development setup, see [CLAUDE.md](CLAUDE.md).

---

## License

MIT. Take it. Read it. Fork it. Ship it.
