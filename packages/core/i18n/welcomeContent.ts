// Welcome/Tutorial-Skript pro Sprache. Wird einmalig beim ersten App-Start
// vom welcome-Seeder als Skript-Inhalt + Titel persistiert (siehe
// lib/welcome.ts). Sprache wird zum Seed-Zeitpunkt anhand der aktuellen
// i18n-Sprache gewählt - ein späterer Sprachwechsel übersetzt den
// schon vorhandenen Tutorial-Skripttext nicht nachträglich, weil das
// bereits eigener User-Content ist (er kann den Text editieren).
//
// Hotkeys laufen durch K() / formatHotkey() aus lib/keys, damit
// Windows-/Linux-User "Ctrl+N" statt "Cmd+N" sehen - andernfalls würde
// das Tutorial dort falsche Anweisungen geben.

import { K } from "../lib/keys";
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
  const kN = K("Mod+N");
  const kK = K("Mod+K");
  const kE = K("Mod+E");
  const kSnap = K("Mod+Shift+S");
  const kHist = K("Mod+Shift+H");
  const kSettings = K("Mod+,");
  const k1 = K("Mod+1");
  const k7 = K("Mod+7");
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
        `Jeder Absatz ist ein Block mit einem Typ. Der Typ steht links als Marker. Du wechselst den Typ entweder mit Tab oder mit den Hotkeys ${k1} bis ${k7}.`,
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
      textBlock("scriptz-action", `${kN} - neues Skript`),
      textBlock("scriptz-action", `${kK} - Skript suchen`),
      textBlock("scriptz-action", `${kE} - exportieren (PDF oder Plain Text)`),
      textBlock("scriptz-action", `${kSnap} - manueller Snapshot`),
      textBlock("scriptz-action", `${kHist} - Snapshot-Verlauf öffnen`),
      textBlock("scriptz-action", `${kSettings} - Einstellungen`),
      textBlock("scriptz-action", "Tab - Block-Typ wechseln (öffnet ein Menü)"),
      textBlock("scriptz-action", `${k1}..${k7} - Block-Typ direkt setzen`),

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
  const kN = K("Mod+N");
  const kK = K("Mod+K");
  const kE = K("Mod+E");
  const kSnap = K("Mod+Shift+S");
  const kHist = K("Mod+Shift+H");
  const kSettings = K("Mod+,");
  const k1 = K("Mod+1");
  const k7 = K("Mod+7");
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
        `Each paragraph is a block with a type. The type marker sits on the left. Switch the type with Tab or with the hotkeys ${k1} through ${k7}.`,
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
      textBlock("scriptz-action", `${kN} - new script`),
      textBlock("scriptz-action", `${kK} - search scripts`),
      textBlock("scriptz-action", `${kE} - export (PDF or plain text)`),
      textBlock("scriptz-action", `${kSnap} - manual snapshot`),
      textBlock("scriptz-action", `${kHist} - open snapshot history`),
      textBlock("scriptz-action", `${kSettings} - settings`),
      textBlock("scriptz-action", "Tab - switch block type (opens a menu)"),
      textBlock("scriptz-action", `${k1}..${k7} - set block type directly`),

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
