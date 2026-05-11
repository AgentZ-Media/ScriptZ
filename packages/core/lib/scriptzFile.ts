// `.scriptz`-Dateiformat: ein simpler JSON-Container, der ein einzelnes
// Skript zwischen Geräten (Web <-> Desktop, Desktop <-> Desktop)
// austauschbar macht.
//
// Bewusst NICHT im Format:
//   - `folder_id` (existiert auf dem Zielgerät nicht; Import landet in
//      der Wurzel, User filed selbst ein).
//   - Snapshots (nur aktueller Stand). Lässt sich später als
//      `script.snapshots: [...]` ergänzen, ohne Format-Bruch (version: 2).
//   - Globale Character-Color-Overrides (`character_colors`-Tabelle).
//      Die im File mitgelieferten `characters[].color` reichen fürs
//      Wiedergeben - App-weite Overrides bleiben App-weit.
//   - App-State, Settings, Ideas, Daily-Word-Log - das ist Geräte-State,
//      nicht Script-Inhalt.

import type { ScriptCharacter } from "./types";

/** Dateiendung ohne Punkt. */
export const SCRIPTZ_EXTENSION = "scriptz";
/** MIME-Type für Blob-Download und <input accept>. */
export const SCRIPTZ_MIME = "application/x-scriptz+json";

/** Aktuelle Format-Version. Versions-Bumps müssen nur passieren, wenn
 *  ein neuer Reader das alte Format NICHT mehr lesen kann. Additive
 *  Felder bekommen Default-Werte beim Parsen und keinen Bump. */
export const SCRIPTZ_VERSION_CURRENT = 1;

export interface ScriptzFileV1 {
  format: "scriptz";
  version: 1;
  exportedAt: string; // ISO 8601
  script: {
    title: string;
    contentJson: object; // parsed Lexical state - kein doppeltes Stringify
    characters: ScriptCharacter[];
    highlightingEnabled: number | null;
    createdAt: string; // ISO 8601
    updatedAt: string; // ISO 8601
  };
}

/** Format-Validierungs-Fehler. Caller fängt mit `instanceof` und zeigt
 *  einen Toast statt zu crashen. */
export class ScriptzParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptzParseError";
  }
}

export interface ScriptForSerialization {
  title: string;
  content_json: string;
  characters: ScriptCharacter[];
  highlighting_enabled: number | null;
  created_at: number; // Unix-millis
  updated_at: number; // Unix-millis
}

/** Pure: serialisiert ein Skript ins V1-Container-Objekt. */
export function serializeScript(script: ScriptForSerialization): ScriptzFileV1 {
  let parsedContent: object;
  try {
    parsedContent = JSON.parse(script.content_json) as object;
  } catch (err) {
    throw new ScriptzParseError(
      `content_json ist kein gültiges JSON: ${(err as Error).message}`,
    );
  }
  return {
    format: "scriptz",
    version: SCRIPTZ_VERSION_CURRENT,
    exportedAt: new Date().toISOString(),
    script: {
      title: script.title,
      contentJson: parsedContent,
      characters: script.characters.map((c) =>
        c.share === undefined
          ? { name: c.name, color: c.color }
          : { name: c.name, color: c.color, share: c.share },
      ),
      highlightingEnabled: script.highlighting_enabled,
      createdAt: new Date(script.created_at).toISOString(),
      updatedAt: new Date(script.updated_at).toISOString(),
    },
  };
}

/** Serialisiert in einen UTF-8-Byte-String fürs Download. */
export function serializeScriptToBytes(script: ScriptForSerialization): Uint8Array {
  const obj = serializeScript(script);
  const json = JSON.stringify(obj, null, 2);
  return new TextEncoder().encode(json);
}

/** Pure: parst und validiert. Wirft `ScriptzParseError` bei kaputten
 *  Dateien mit beschreibender Meldung. */
export function parseScriptzBytes(bytes: Uint8Array): ScriptzFileV1 {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (err) {
    throw new ScriptzParseError(
      `Datei ist nicht gültiges UTF-8: ${(err as Error).message}`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new ScriptzParseError(
      `Datei ist kein JSON: ${(err as Error).message}`,
    );
  }
  return validateScriptzObject(raw);
}

function validateScriptzObject(raw: unknown): ScriptzFileV1 {
  if (typeof raw !== "object" || raw === null) {
    throw new ScriptzParseError("Datei-Inhalt ist kein Objekt.");
  }
  const r = raw as Record<string, unknown>;
  if (r.format !== "scriptz") {
    throw new ScriptzParseError(
      `Format-Marker fehlt oder falsch (erwartet "scriptz", war ${JSON.stringify(r.format)}).`,
    );
  }
  if (r.version !== 1) {
    throw new ScriptzParseError(
      `Version ${JSON.stringify(r.version)} wird nicht unterstützt - diese App liest nur Version 1.`,
    );
  }
  const script = r.script;
  if (typeof script !== "object" || script === null) {
    throw new ScriptzParseError("Feld `script` fehlt oder ist kein Objekt.");
  }
  const s = script as Record<string, unknown>;
  if (typeof s.title !== "string") {
    throw new ScriptzParseError("Feld `script.title` fehlt oder ist kein String.");
  }
  if (typeof s.contentJson !== "object" || s.contentJson === null) {
    throw new ScriptzParseError("Feld `script.contentJson` fehlt oder ist kein Objekt.");
  }
  if (!Array.isArray(s.characters)) {
    throw new ScriptzParseError("Feld `script.characters` fehlt oder ist kein Array.");
  }
  // Charaktere flach validieren - name + color müssen Strings sein.
  const characters: ScriptCharacter[] = [];
  for (let i = 0; i < s.characters.length; i++) {
    const c = s.characters[i] as Record<string, unknown>;
    if (typeof c?.name !== "string" || typeof c?.color !== "string") {
      throw new ScriptzParseError(
        `script.characters[${i}] hat ungültige name/color-Felder.`,
      );
    }
    const entry: ScriptCharacter = { name: c.name, color: c.color };
    if (typeof c.share === "number") entry.share = c.share;
    characters.push(entry);
  }
  // Datumsfelder sind nice-to-have; bei Fehlern lieber tolerant sein -
  // unsere App nutzt sie nicht beim Import (siehe applyScriptzFile),
  // sondern setzt eigene Zeitstempel.
  const exportedAt = typeof r.exportedAt === "string" ? r.exportedAt : new Date().toISOString();
  const createdAt = typeof s.createdAt === "string" ? s.createdAt : exportedAt;
  const updatedAt = typeof s.updatedAt === "string" ? s.updatedAt : exportedAt;
  const highlightingEnabled =
    typeof s.highlightingEnabled === "number"
      ? s.highlightingEnabled
      : s.highlightingEnabled === null
        ? null
        : null;
  return {
    format: "scriptz",
    version: 1,
    exportedAt,
    script: {
      title: s.title,
      contentJson: s.contentJson,
      characters,
      highlightingEnabled,
      createdAt,
      updatedAt,
    },
  };
}

/** Slug-freier Dateiname-Vorschlag mit `.scriptz`-Endung. Ersetzt Slashes
 *  und Zeichen, die Dateisysteme nicht mögen, durch Underscore. */
export function defaultScriptzFilename(title: string): string {
  const cleaned = (title || "Unbenannt").replace(/[\\/:*?"<>|]+/g, "_").trim();
  return `${cleaned || "Unbenannt"}.${SCRIPTZ_EXTENSION}`;
}
