// Welcome/Tutorial-Skript pro Sprache. Wird einmalig beim ersten App-Start
// vom welcome-Seeder als Skript-Inhalt + Titel persistiert (siehe
// lib/welcome.ts). Sprache wird zum Seed-Zeitpunkt anhand der aktuellen
// i18n-Sprache gewählt - ein späterer Sprachwechsel übersetzt den
// schon vorhandenen Tutorial-Skripttext nicht nachträglich, weil das
// bereits eigener User-Content ist (er kann den Text editieren).

import type { Language } from "./index";

interface WelcomeContent {
  title: string;
  json: string;
}

interface BlockOptions {
  characterName?: string | null;
}

function textBlock(type: string, text: string, opts: BlockOptions = {}) {
  return {
    type,
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    characterName: opts.characterName ?? "",
    children: [
      {
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
        text,
        type: "text",
        version: 1,
      },
    ],
  };
}

function buildJson(blocks: ReturnType<typeof textBlock>[]): string {
  return JSON.stringify({
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: blocks,
    },
  });
}

function deWelcome(): WelcomeContent {
  return {
    title: "Willkommen bei ScriptZ",
    json: buildJson([
      textBlock("scriptz-caption", "TUTORIAL - SO BENUTZT DU SCRIPTZ"),
      textBlock(
        "scriptz-action",
        "Willkommen. Dieses Skript ist ein interaktives Tutorial. Du kannst alles hier drin verändern, löschen oder ausprobieren.",
      ),
      textBlock(
        "scriptz-action",
        "Jeder Absatz ist ein Block mit einem Typ. Der Typ steht links als Marker. Du wechselst den Typ entweder mit Tab oder mit den Hotkeys Cmd+1 bis Cmd+7.",
      ),

      textBlock("scriptz-character", "ERZÄHLER", { characterName: "ERZÄHLER" }),
      textBlock(
        "scriptz-dialog",
        "Das hier ist ein Dialog-Block. Drück Enter, und der nächste Block wird automatisch zum Charakter - ScriptZ kennt das Wechselspiel zwischen Charakter und Dialog.",
      ),

      textBlock("scriptz-character", "ERZÄHLER", { characterName: "ERZÄHLER" }),
      textBlock("scriptz-parenthetical", "(leise)"),
      textBlock(
        "scriptz-dialog",
        "Eine Klammer wie diese erkennt ScriptZ live, wenn du sie tippst, und macht daraus automatisch einen Parenthetical-Block.",
      ),

      textBlock(
        "scriptz-action",
        "Charaktere existieren nur in dem Skript, in dem sie vorkommen. Tipp einen neuen Namen in einen Charakter-Block, und er erscheint danach in der Pill-Leiste oben mit einer eigenen Farbe.",
      ),

      textBlock("scriptz-camera", "Close-Up"),
      textBlock(
        "scriptz-action",
        "Kamera-Blocks rechtsbündig, Caption-Blocks für Bildunterschriften, SFX für Sounds.",
      ),
      textBlock("scriptz-sfx", "Pling"),

      textBlock("scriptz-caption", "WICHTIGE SHORTCUTS"),
      textBlock("scriptz-action", "Cmd+N - neues Skript"),
      textBlock("scriptz-action", "Cmd+K - Skript suchen"),
      textBlock("scriptz-action", "Cmd+E - exportieren (PDF oder Plain Text)"),
      textBlock("scriptz-action", "Cmd+Shift+S - manueller Snapshot"),
      textBlock("scriptz-action", "Cmd+Shift+H - Snapshot-Verlauf öffnen"),
      textBlock("scriptz-action", "Cmd+, - Einstellungen"),
      textBlock("scriptz-action", "Tab - Block-Typ wechseln (öffnet ein Menü)"),
      textBlock("scriptz-action", "Cmd+1..7 - Block-Typ direkt setzen"),

      textBlock(
        "scriptz-action",
        "Alles wird lokal gespeichert. Es gibt kein Konto, keine Cloud, keine Telemetrie. Wenn du dieses Tutorial nicht mehr brauchst, verschieb es einfach in den Papierkorb (Rechtsklick im Skript-Browser).",
      ),

      textBlock("scriptz-character", "ERZÄHLER", { characterName: "ERZÄHLER" }),
      textBlock("scriptz-dialog", "Viel Spaß beim Schreiben."),
    ]),
  };
}

function enWelcome(): WelcomeContent {
  return {
    title: "Welcome to ScriptZ",
    json: buildJson([
      textBlock("scriptz-caption", "TUTORIAL - HOW TO USE SCRIPTZ"),
      textBlock(
        "scriptz-action",
        "Welcome. This script is an interactive tutorial. Feel free to edit, delete or experiment with anything in here.",
      ),
      textBlock(
        "scriptz-action",
        "Each paragraph is a block with a type. The type marker sits on the left. Switch the type with Tab or with the hotkeys Cmd+1 through Cmd+7.",
      ),

      textBlock("scriptz-character", "NARRATOR", { characterName: "NARRATOR" }),
      textBlock(
        "scriptz-dialog",
        "This is a dialog block. Press Enter and the next block automatically becomes a character - ScriptZ knows the character/dialog rhythm.",
      ),

      textBlock("scriptz-character", "NARRATOR", { characterName: "NARRATOR" }),
      textBlock("scriptz-parenthetical", "(softly)"),
      textBlock(
        "scriptz-dialog",
        "ScriptZ detects parentheses like this as you type and turns them into a parenthetical block automatically.",
      ),

      textBlock(
        "scriptz-action",
        "Characters only exist within the script they appear in. Type a new name into a character block and it shows up in the pill bar above with its own color.",
      ),

      textBlock("scriptz-camera", "Close-up"),
      textBlock(
        "scriptz-action",
        "Camera blocks are right-aligned, caption blocks are for image captions, SFX is for sounds.",
      ),
      textBlock("scriptz-sfx", "Ping"),

      textBlock("scriptz-caption", "IMPORTANT SHORTCUTS"),
      textBlock("scriptz-action", "Cmd+N - new script"),
      textBlock("scriptz-action", "Cmd+K - search scripts"),
      textBlock("scriptz-action", "Cmd+E - export (PDF or plain text)"),
      textBlock("scriptz-action", "Cmd+Shift+S - manual snapshot"),
      textBlock("scriptz-action", "Cmd+Shift+H - open snapshot history"),
      textBlock("scriptz-action", "Cmd+, - settings"),
      textBlock("scriptz-action", "Tab - switch block type (opens a menu)"),
      textBlock("scriptz-action", "Cmd+1..7 - set block type directly"),

      textBlock(
        "scriptz-action",
        "Everything is stored locally. No account, no cloud, no telemetry. When you no longer need this tutorial, just move it to the trash (right-click in the script browser).",
      ),

      textBlock("scriptz-character", "NARRATOR", { characterName: "NARRATOR" }),
      textBlock("scriptz-dialog", "Happy writing."),
    ]),
  };
}

export function getWelcomeContent(lang: Language): WelcomeContent {
  return lang === "en" ? enWelcome() : deWelcome();
}
