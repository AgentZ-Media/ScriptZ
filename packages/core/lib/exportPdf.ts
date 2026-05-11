// PDF-Generator - browser-taugliche Bytes-Erzeugung.
//
// Migration aus apps/desktop/src/lib/exportPdf.ts (Phase 2F): die reine
// Layout-Logik plus pdf-lib + @pdf-lib/fontkit hat keine Tauri-Bindung
// und laeuft im Browser identisch wie auf dem Desktop. Der Datei-
// Schreib-Teil (mkdir + writeFile) wandert dafuer in den
// Platform-Adapter (siehe ./platform.ts::saveAs).
//
// Layout-Konventionen: A4-Geometrie, iA Writer Quattro S TTF/11pt,
// Tint-Band-Highlighting (Arc-Studio-Style). Byte-identisch zum
// fruehen Rust-Code (Phase 7d-Migration). Aenderungen an der Geometrie
// muessen mit dem Editor-Look abgestimmt werden, sonst weicht Export
// und Preview ab.
//
// Schriften: Sowohl Desktop als auch Web hosten die TTFs unter
// /fonts/iAWriterQuattroS-*.ttf in ihrem jeweiligen public/-Verzeichnis,
// damit `fetch("/fonts/...")` zur Laufzeit ohne Pfad-Indirektion klappt.

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { extractBlocks, type ExtractedBlock } from "./lex";
import type { ExportPdfDeps } from "./platform";

// ---- Geometrie (mm) - 1:1 wie Rust src-tauri/src/commands/export.rs ----
const A4_W_MM = 210.0;
const A4_H_MM = 297.0;
const MARGIN_TOP_MM = 25.0;
const MARGIN_BOTTOM_MM = 25.0;
const MARGIN_LEFT_MM = 27.0;
const MARGIN_RIGHT_MM = 27.0;
const FONT_SIZE_PT = 11.0;
const LINE_HEIGHT_MM = 6.2;
const PARA_GAP_MM = 1.6;
const CHAR_W_MM = 2.3; // duospaced glyph advance at 11pt

// Tint-Band-Geometrie (Arc-Studio-Style per-line band).
const TINT_PAD_X_MM = 0.8;
const TINT_TOP_OFFSET_MM = 3.2;
const TINT_BOTTOM_OFFSET_MM = 1.6;
const TINT_ALPHA_FACTOR = 0.28;

// 1 mm in PDF-Punkten (1pt = 1/72 inch, 1 inch = 25.4 mm).
const MM_TO_PT = 72 / 25.4;
const mm = (v: number) => v * MM_TO_PT;

const A4_W_PT = mm(A4_W_MM);
const A4_H_PT = mm(A4_H_MM);

let cachedFontBytes: {
  regular: Uint8Array;
  bold: Uint8Array;
  italic: Uint8Array;
  boldItalic: Uint8Array;
} | null = null;

async function loadFontBytes() {
  if (cachedFontBytes) return cachedFontBytes;
  const [regular, bold, italic, boldItalic] = await Promise.all([
    fetchFont("/fonts/iAWriterQuattroS-Regular.ttf"),
    fetchFont("/fonts/iAWriterQuattroS-Bold.ttf"),
    fetchFont("/fonts/iAWriterQuattroS-Italic.ttf"),
    fetchFont("/fonts/iAWriterQuattroS-BoldItalic.ttf"),
  ]);
  cachedFontBytes = { regular, bold, italic, boldItalic };
  return cachedFontBytes;
}

async function fetchFont(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`font fetch ${url}: HTTP ${r.status}`);
  const buf = await r.arrayBuffer();
  return new Uint8Array(buf);
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

class Layout {
  doc: PDFDocument;
  fonts: Fonts;
  page: PDFPage;
  // y in mm, top-down - genauso wie das Rust-Struct-Feld. Konvertiert
  // zu pt beim Zeichnen. PDF-Ursprung ist bottom-left, also y_pt = mm(y_mm).
  y_mm: number;

  constructor(doc: PDFDocument, fonts: Fonts) {
    this.doc = doc;
    this.fonts = fonts;
    this.page = doc.addPage([A4_W_PT, A4_H_PT]);
    this.y_mm = A4_H_MM - MARGIN_TOP_MM;
  }

  newPage() {
    this.page = this.doc.addPage([A4_W_PT, A4_H_PT]);
    this.y_mm = A4_H_MM - MARGIN_TOP_MM;
  }

  ensureSpace(neededMm: number) {
    if (this.y_mm - neededMm < MARGIN_BOTTOM_MM) {
      this.newPage();
    }
  }

  fontFor(italic: boolean, bold: boolean): PDFFont {
    if (italic && bold) return this.fonts.boldItalic;
    if (italic) return this.fonts.italic;
    if (bold) return this.fonts.bold;
    return this.fonts.regular;
  }

  writeLine(
    text: string,
    xLeftMm: number,
    widthMm: number,
    italic: boolean,
    bold: boolean,
    align: "left" | "center" | "right",
    tint: [number, number, number] | null,
  ) {
    const charsPerLine = Math.max(20, Math.trunc(widthMm / CHAR_W_MM));
    const lines = simpleWrap(text, charsPerLine);
    const font = this.fontFor(italic, bold);

    for (const line of lines) {
      this.ensureSpace(LINE_HEIGHT_MM);
      const lineChars = countChars(line);
      const lineWMm = lineChars * CHAR_W_MM;
      let xPos: number;
      if (align === "center") {
        xPos = xLeftMm + (widthMm - lineWMm) / 2.0;
      } else if (align === "right") {
        xPos = xLeftMm + widthMm - lineWMm;
      } else {
        xPos = xLeftMm;
      }

      if (tint && line.trim().length > 0) {
        const rectX1 = xPos - TINT_PAD_X_MM;
        const rectX2 = xPos + lineWMm + TINT_PAD_X_MM;
        const rectTop = this.y_mm + TINT_TOP_OFFSET_MM;
        const rectBottom = this.y_mm - TINT_BOTTOM_OFFSET_MM;
        const [r, g, b] = tint;
        this.page.drawRectangle({
          x: mm(rectX1),
          y: mm(rectBottom),
          width: mm(rectX2 - rectX1),
          height: mm(rectTop - rectBottom),
          color: rgb(r / 255, g / 255, b / 255),
        });
      }

      this.page.drawText(line, {
        x: mm(xPos),
        y: mm(this.y_mm),
        font,
        size: FONT_SIZE_PT,
        color: rgb(0, 0, 0),
      });

      this.y_mm -= LINE_HEIGHT_MM;
    }
    this.y_mm -= PARA_GAP_MM;
  }
}

function countChars(s: string): number {
  // Zaehlt Unicode-Skalare, spiegelt Rust `chars().count()`.
  let n = 0;
  for (const _ of s) n++;
  return n;
}

// Spiegelt Rust `simple_wrap`: splittet an '\n', dann Whitespace-Wrap
// per Char-Count. Leere Chunks geben eine leere Zeile aus; ein leerer
// Input gibt trotzdem eine leere Zeile.
function simpleWrap(text: string, width: number): string[] {
  const out: string[] = [];
  const chunks = text.split("\n");
  for (const chunk of chunks) {
    if (chunk.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    const words = chunk.split(/\s+/u).filter((w) => w.length > 0);
    for (const word of words) {
      if (line.length === 0) {
        line = word;
      } else if (countChars(line) + 1 + countChars(word) > width) {
        out.push(line);
        line = word;
      } else {
        line = line + " " + word;
      }
    }
    out.push(line);
  }
  if (out.length === 0) out.push("");
  return out;
}

// Hellt RGB-Hex Richtung Weiss auf um `(1 - alphaFactor)`. Spiegelt
// Rust `hex_to_rgb_tint(hex, 0.28)`.
function hexToRgbTint(hex: string, alphaFactor: number): [number, number, number] {
  // Neutrales Grau-Fallback fuer alle malformed Hex. Rust hatte hier zwei
  // verschiedene Greys (240,240,240 vs 160,160,160) - hier zu einem
  // zusammengefasst, weil beide Pfade in der Praxis tot sind (Charakter-
  // farben kommen aus DEFAULT_PALETTE, immer well-formed).
  const FALLBACK: [number, number, number] = [160, 160, 160];
  const s = hex.startsWith("#") ? hex.slice(1) : hex;
  if (s.length !== 6) return FALLBACK;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return FALLBACK;
  const mix = (c: number) =>
    Math.max(0, Math.min(255, Math.round(255 - (255 - c) * alphaFactor)));
  return [mix(r), mix(g), mix(b)];
}

export interface BuildPdfBytesOptions {
  includeHighlighting: boolean;
  includeTitlePage: boolean;
}

/** Erzeugt die fertigen PDF-Bytes fuer ein Skript. Reine Pure-Function -
 *  Caller entscheidet, was mit den Bytes passiert (Desktop schreibt sie
 *  via plugin-fs, Web triggert Blob-Download). */
export async function buildPdfBytes(
  deps: ExportPdfDeps,
  opts: BuildPdfBytesOptions,
): Promise<Uint8Array> {
  const fontBytes = await loadFontBytes();

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(deps.title);

  const [regular, bold, italic, boldItalic] = await Promise.all([
    doc.embedFont(fontBytes.regular, { subset: true }),
    doc.embedFont(fontBytes.bold, { subset: true }),
    doc.embedFont(fontBytes.italic, { subset: true }),
    doc.embedFont(fontBytes.boldItalic, { subset: true }),
  ]);

  const layout = new Layout(doc, { regular, bold, italic, boldItalic });

  if (opts.includeTitlePage) {
    layout.y_mm = A4_H_MM * 0.6;
    layout.writeLine(
      deps.title,
      MARGIN_LEFT_MM,
      A4_W_MM - MARGIN_LEFT_MM - MARGIN_RIGHT_MM,
      false,
      true,
      "center",
      null,
    );
    if (deps.characters.length > 0) {
      const names = deps.characters.map((c) => c.name);
      const line = `Charaktere: ${names.join(", ")}`;
      layout.writeLine(
        line,
        MARGIN_LEFT_MM,
        A4_W_MM - MARGIN_LEFT_MM - MARGIN_RIGHT_MM,
        true,
        false,
        "center",
        null,
      );
    }
    layout.newPage();
  }

  const contentW = A4_W_MM - MARGIN_LEFT_MM - MARGIN_RIGHT_MM;
  const blocks = extractBlocks(deps.contentJson);

  // name (UPPER) -> color hex
  const charColor = new Map<string, string>();
  for (const c of deps.characters) {
    charColor.set(c.name.toUpperCase(), c.color);
  }

  for (let idx = 0; idx < blocks.length; idx++) {
    const b = blocks[idx];

    // Widow/Orphan-Guard fuer Charakter-Speech: reserviere 4 Zeilen + 2
    // Paragraph-Gaps, damit ein Character-Block nicht am Seitenende
    // verwaist landet.
    if (b.kind === "scriptz-character") {
      layout.ensureSpace(LINE_HEIGHT_MM * 4 + PARA_GAP_MM * 2);
    }

    const tint = computeTint(blocks, idx, b, opts.includeHighlighting, charColor);

    switch (b.kind) {
      case "scriptz-character":
        layout.writeLine(
          b.text.toUpperCase(),
          MARGIN_LEFT_MM,
          contentW,
          false,
          true,
          "center",
          tint,
        );
        break;
      case "scriptz-dialog":
        layout.writeLine(
          b.text,
          MARGIN_LEFT_MM + 25.0,
          contentW - 50.0,
          false,
          false,
          "left",
          tint,
        );
        break;
      case "scriptz-parenthetical":
        // Der parentheticalLive-Plugin wickelt Text bereits in "( … )" -
        // verbatim rendern, damit nicht doppelt geklammert wird.
        layout.writeLine(
          b.text,
          MARGIN_LEFT_MM + 35.0,
          contentW - 70.0,
          true,
          false,
          "left",
          tint,
        );
        break;
      case "scriptz-action":
        layout.writeLine(
          b.text,
          MARGIN_LEFT_MM,
          contentW,
          false,
          false,
          "left",
          null,
        );
        break;
      case "scriptz-camera":
        layout.writeLine(
          b.text.toUpperCase(),
          MARGIN_LEFT_MM,
          contentW,
          false,
          true,
          "right",
          null,
        );
        break;
      case "scriptz-caption":
        layout.writeLine(
          b.text.toUpperCase(),
          MARGIN_LEFT_MM,
          contentW,
          false,
          true,
          "left",
          null,
        );
        break;
      case "scriptz-sfx":
        layout.writeLine(
          b.text.toUpperCase(),
          MARGIN_LEFT_MM,
          contentW,
          false,
          false,
          "left",
          null,
        );
        break;
      default:
        layout.writeLine(
          b.text,
          MARGIN_LEFT_MM,
          contentW,
          false,
          false,
          "left",
          null,
        );
    }
  }

  return await doc.save({ useObjectStreams: false });
}

function computeTint(
  blocks: ExtractedBlock[],
  idx: number,
  b: ExtractedBlock,
  includeHighlighting: boolean,
  charColor: Map<string, string>,
): [number, number, number] | null {
  if (!includeHighlighting) return null;
  if (
    b.kind !== "scriptz-character" &&
    b.kind !== "scriptz-dialog" &&
    b.kind !== "scriptz-parenthetical"
  ) {
    return null;
  }
  let name: string | null =
    b.kind === "scriptz-character" ? b.text.trim().toUpperCase() : null;
  if (name === null) {
    for (let j = idx - 1; j >= 0; j--) {
      if (blocks[j].kind === "scriptz-character") {
        name = blocks[j].text.trim().toUpperCase();
        break;
      }
    }
  }
  if (name === null) return null;
  const hex = charColor.get(name);
  if (!hex) return null;
  return hexToRgbTint(hex, TINT_ALPHA_FACTOR);
}
