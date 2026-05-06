import { api } from "./api";
import { scriptsBus } from "./scriptsBus";

const SEED_KEY = "welcome_seeded_v3";

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

function welcomeScriptJson(): string {
  return JSON.stringify({
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [
        textBlock("scriptz-caption", "TUTORIAL — SO BENUTZT DU SCRIPTZ"),
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
          "Das hier ist ein Dialog-Block. Drück Enter, und der nächste Block wird automatisch zum Charakter — ScriptZ kennt das Wechselspiel zwischen Charakter und Dialog.",
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
        textBlock("scriptz-action", "Cmd+N — neues Skript"),
        textBlock("scriptz-action", "Cmd+K — Skript suchen"),
        textBlock("scriptz-action", "Cmd+E — exportieren (PDF oder Plain Text)"),
        textBlock("scriptz-action", "Cmd+Shift+S — manueller Snapshot"),
        textBlock("scriptz-action", "Cmd+Shift+H — Snapshot-Verlauf öffnen"),
        textBlock("scriptz-action", "Cmd+, — Einstellungen"),
        textBlock("scriptz-action", "Tab — Block-Typ wechseln (öffnet ein Menü)"),
        textBlock("scriptz-action", "Cmd+1..7 — Block-Typ direkt setzen"),

        textBlock(
          "scriptz-action",
          "Alles wird lokal gespeichert. Es gibt kein Konto, keine Cloud, keine Telemetrie. Wenn du dieses Tutorial nicht mehr brauchst, verschieb es einfach in den Papierkorb (Rechtsklick im Skript-Browser).",
        ),

        textBlock("scriptz-character", "ERZÄHLER", { characterName: "ERZÄHLER" }),
        textBlock("scriptz-dialog", "Viel Spaß beim Schreiben."),
      ],
    },
  });
}

export async function ensureWelcomeContent(): Promise<void> {
  const seeded = await api.getAppState(SEED_KEY);
  if (seeded) return;
  const existing = await api.listScripts({ includeArchived: true, limit: 1 });
  if (existing.length === 0) {
    await api.createScript({
      title: "Willkommen bei ScriptZ",
      initialContentJson: welcomeScriptJson(),
    });
    scriptsBus.bump();
  }
  await api.setAppState(SEED_KEY, "1");
}
