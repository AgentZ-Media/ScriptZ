// Browser-native printing using the main window (no iframe). The script
// content is injected into a hidden #scriptz-print-area in the main DOM,
// @media print rules hide everything else, and `window.print()` triggers
// the OS-native print sheet.
//
// Why not iframe.contentWindow.print()? In Tauri's WKWebView the iframe
// load + print path is unreliable — load events can race, and child
// windows sometimes silently swallow print(). Printing the main window
// is the universally-supported web pattern.
//
// Fonts (iA Writer Quattro) are already loaded once at app boot, so we
// don't need to re-embed them here.

import { api } from "./api";
import type { Script, ScriptCharacter } from "./types";

const PRINT_AREA_ID = "scriptz-print-area";
const PRINT_STYLE_ID = "scriptz-print-stylesheet";

interface PrintBlock {
  kind: string;
  text: string;
}

const SCRIPTZ_KINDS = new Set([
  "scriptz-action",
  "scriptz-character",
  "scriptz-dialog",
  "scriptz-parenthetical",
  "scriptz-camera",
  "scriptz-caption",
  "scriptz-sfx",
]);

function parseBlocks(contentJson: string): PrintBlock[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    return [];
  }
  const root = (parsed as { root?: unknown }).root ?? parsed;
  const out: PrintBlock[] = [];
  walk(root, out);
  return out;
}

function walk(node: unknown, out: PrintBlock[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as { type?: string; children?: unknown };
  if (typeof n.type === "string" && SCRIPTZ_KINDS.has(n.type)) {
    out.push({ kind: n.type, text: collectText(node) });
    return;
  }
  if (Array.isArray(n.children)) {
    for (const c of n.children) walk(c, out);
  }
}

function collectText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; children?: unknown };
  if (n.type === "linebreak") return "\n";
  if (n.type === "text") return n.text ?? "";
  if (Array.isArray(n.children)) {
    let s = "";
    for (const c of n.children) s += collectText(c);
    return s;
  }
  return "";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hexToTint(hex: string, alpha: number): string {
  const s = hex.replace("#", "");
  if (s.length !== 6) return "transparent";
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * alpha);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

interface RenderOpts {
  highlighting: boolean;
  titlePage: boolean;
}

function renderBody(
  script: Script,
  blocks: PrintBlock[],
  opts: RenderOpts,
): string {
  const colorByName = new Map<string, string>(
    script.characters.map((c: ScriptCharacter) => [
      c.name.toUpperCase(),
      c.color,
    ]),
  );
  let currentChar: string | null = null;
  const rows: string[] = [];

  if (opts.titlePage) {
    const title = escapeHtml(script.title);
    const charNames = script.characters.map((c) => c.name).join(", ");
    rows.push(
      `<section class="sz-title-page"><h1>${title}</h1>${
        charNames
          ? `<p>Charaktere: ${escapeHtml(charNames)}</p>`
          : ""
      }</section>`,
    );
  }

  const renderBlock = (b: PrintBlock): string => {
    let text = b.text;
    if (b.kind === "scriptz-character") {
      currentChar = text.trim().toUpperCase();
      text = currentChar;
    } else if (
      b.kind === "scriptz-caption" ||
      b.kind === "scriptz-sfx" ||
      b.kind === "scriptz-camera"
    ) {
      text = text.toUpperCase();
    }

    let style = "";
    if (opts.highlighting) {
      let name: string | null = null;
      if (b.kind === "scriptz-character") name = currentChar;
      else if (
        b.kind === "scriptz-dialog" ||
        b.kind === "scriptz-parenthetical"
      ) {
        name = currentChar;
      }
      if (name) {
        const color = colorByName.get(name);
        if (color) {
          style = ` style="background:${hexToTint(color, 0.28)};"`;
        }
      }
    }

    return `<div class="sz-b sz-${b.kind}"${style}>${escapeHtml(text)}</div>`;
  };

  // Walk blocks, packaging each Character + immediately-following
  // Parenthetical/Dialog runs into a single .sz-group wrapper. The CSS
  // sets `break-inside: avoid` on .sz-group so WebKit treats the whole
  // run as one atomic unit — Character can never be left dangling at
  // the bottom of a page with its dialog wandering to the next.
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.kind === "scriptz-character") {
      const groupParts: string[] = [renderBlock(b)];
      let j = i + 1;
      while (
        j < blocks.length &&
        (blocks[j].kind === "scriptz-dialog" ||
          blocks[j].kind === "scriptz-parenthetical")
      ) {
        groupParts.push(renderBlock(blocks[j]));
        j++;
      }
      rows.push(`<div class="sz-group">${groupParts.join("")}</div>`);
      i = j;
    } else {
      rows.push(renderBlock(b));
      i++;
    }
  }

  return rows.join("\n");
}

function ensureStylesheet(): void {
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  // The print area is *always* in the DOM, just positioned 10000 px
  // offscreen so the user never sees it. We deliberately don't use
  // `display: none` for the screen state — Tauri's webview.print()
  // takes a synchronous DOM snapshot and any element marked
  // display:none gets stripped before @media print rules activate,
  // which is why the first attempt produced an empty printout.
  style.textContent = `
    #${PRINT_AREA_ID} {
      position: absolute;
      left: -100000px;
      top: 0;
      width: 156mm;          /* A4 content width @ 27mm margins */
      pointer-events: none;
      z-index: -1;
    }

    @media print {
      @page {
        size: A4;
        margin: 27mm 27mm 27mm 27mm;
      }
      /* The app's global stylesheet clamps html/body/#root to the
         viewport with overflow:hidden, which would chop the printout
         to one page. Restore natural document height + visible
         overflow for printing. */
      html, body, #root {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        background: white !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      body > *:not(#${PRINT_AREA_ID}) {
        display: none !important;
      }
      #${PRINT_AREA_ID} {
        position: static !important;
        left: auto !important;
        top: auto !important;
        width: auto !important;
        z-index: auto !important;
        pointer-events: auto !important;
        font-family: "iA Writer Quattro", ui-monospace, "SF Mono", Menlo, monospace;
        font-size: 11pt;
        line-height: 1.6;
        color: black;
      }

      #${PRINT_AREA_ID} .sz-b {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
      }
      #${PRINT_AREA_ID} .sz-b + .sz-b { margin-top: 4pt; }
      /* Atomic Character + Dialog group: the engine treats the whole
         run as one block and never splits a character name from its
         dialogue across a page boundary. */
      #${PRINT_AREA_ID} .sz-group {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      #${PRINT_AREA_ID} .sz-group + .sz-group { margin-top: 4pt; }
      #${PRINT_AREA_ID} .sz-group .sz-b + .sz-b { margin-top: 4pt; }

      #${PRINT_AREA_ID} .sz-title-page {
        page-break-after: always;
        break-after: page;
        text-align: center;
        padding-top: 30vh;
      }
      #${PRINT_AREA_ID} .sz-title-page h1 {
        font-size: 24pt;
        font-weight: 700;
        margin: 0 0 16pt;
      }
      #${PRINT_AREA_ID} .sz-title-page p {
        font-style: italic;
        color: #555;
      }

      #${PRINT_AREA_ID} .sz-scriptz-action { text-align: left; }
      #${PRINT_AREA_ID} .sz-scriptz-caption {
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      #${PRINT_AREA_ID} .sz-scriptz-character {
        text-align: center;
        text-transform: uppercase;
        font-weight: 700;
        letter-spacing: 0.06em;
        margin-top: 18pt;
        page-break-after: avoid;
        break-after: avoid;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      #${PRINT_AREA_ID} .sz-scriptz-parenthetical {
        margin-left: 22%;
        margin-right: 22%;
        font-style: italic;
        color: #555;
        page-break-before: avoid;
        break-before: avoid;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      #${PRINT_AREA_ID} .sz-scriptz-dialog {
        margin-left: 16%;
        margin-right: 16%;
        page-break-before: avoid;
        break-before: avoid;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      #${PRINT_AREA_ID} .sz-scriptz-camera {
        text-align: right;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 700;
        font-size: 10pt;
        color: #555;
      }
      #${PRINT_AREA_ID} .sz-scriptz-sfx {
        text-align: left;
        letter-spacing: 0.02em;
        font-size: 10pt;
        color: #555;
        text-transform: uppercase;
      }

      #${PRINT_AREA_ID} .sz-scriptz-action + .sz-scriptz-character,
      #${PRINT_AREA_ID} .sz-scriptz-dialog + .sz-scriptz-action,
      #${PRINT_AREA_ID} .sz-scriptz-dialog + .sz-scriptz-character,
      #${PRINT_AREA_ID} .sz-scriptz-action + .sz-scriptz-action {
        margin-top: 14pt;
      }
      #${PRINT_AREA_ID} .sz-b + .sz-scriptz-caption { margin-top: 22pt; }
      #${PRINT_AREA_ID} .sz-scriptz-caption + .sz-b { margin-top: 14pt; }
    }
  `;
  document.head.appendChild(style);
}

function ensurePrintArea(): HTMLDivElement {
  let area = document.getElementById(PRINT_AREA_ID) as HTMLDivElement | null;
  if (!area) {
    area = document.createElement("div");
    area.id = PRINT_AREA_ID;
    document.body.appendChild(area);
  }
  return area;
}

export async function printScript(
  scriptId: string,
  opts: RenderOpts,
): Promise<void> {
  const script = await api.getScript(scriptId);
  const blocks = parseBlocks(script.content_json);

  ensureStylesheet();
  const area = ensurePrintArea();
  area.innerHTML = renderBody(script, blocks, opts);

  // Wait two frames so layout/fonts settle, then trigger native print
  // dialog. We deliberately do NOT clear the area afterwards: Tauri's
  // window.print() goes through async IPC, so the dialog actually
  // captures the DOM some time later — clearing right after the call
  // would race the snapshot and produce an empty printout. The area
  // gets overwritten on the next print, so memory doesn't grow.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  window.print();
}
