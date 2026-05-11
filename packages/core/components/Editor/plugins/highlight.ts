// Per-character tint for Charakter / Dialog / Parenthetical blocks.
//
// CLAUDE.md is strict about not mutating Lexical text-node state during
// keystrokes — but applying a CSS custom property on the rendered DOM
// element (no Lexical state changes, no transforms) is safe. This plugin
// runs after every reconcile and writes `--char-tint` onto the DOM
// element of any block whose effective speaker has a known palette
// colour. The Editor.css rule paints `background: var(--char-tint, …)`
// when `data-highlighting="on"` is set on the editor root.
//
// PDF export does the equivalent walk in TS (see src/lib/exportPdf.ts,
// `computeTint` + `hexToRgbTint`). This brings the live editor in line
// with the rendered output the user sees on save/share.

import type { LexicalEditor } from "lexical";
import { $getRoot } from "lexical";
import { $isScriptzCharacterNode } from "../nodes";
import type { ScriptCharacter } from "../../../lib/types";

const TINT_BLOCKS = new Set([
  "scriptz-character",
  "scriptz-dialog",
  "scriptz-parenthetical",
]);

/** Convert "#rrggbb" plus an alpha factor (0..1) into a "rgb(r,g,b)"
 * blended **toward white** — Default-Look auf hellem Papier. Matched
 * die Formel aus exportPdf.ts, daher sehen Editor und PDF identisch
 * aus, solange das Papier hell ist (PDF ist immer hell). */
function hexToTintLight(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return "";
  const mix = (c: number) => Math.round(255 - (255 - c) * alpha);
  return `rgb(${mix(rgb[0])}, ${mix(rgb[1])}, ${mix(rgb[2])})`;
}

/** Variante für Dark-Paper: blendet die User-Charakterfarbe **richtung
 * Dunkel** (Papier-Bg #1c1c1c). Sonst läge weisser Text auf weisslicher
 * Tinte — kein Kontrast. Resultat ist eine satter-gemutete Variante der
 * gleichen Farbe, weiße Schrift bleibt darauf gut lesbar. */
function hexToTintDark(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return "";
  // Mix gegen 28 (= #1c) statt 255 (= white).
  const PAPER = 28;
  const mix = (c: number) => Math.round(PAPER + (c - PAPER) * alpha);
  return `rgb(${mix(rgb[0])}, ${mix(rgb[1])}, ${mix(rgb[2])})`;
}

function parseHex(hex: string): [number, number, number] | null {
  const s = hex.replace("#", "");
  if (s.length !== 6) return null;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return [r, g, b];
}

export interface HighlightHandle {
  teardown: () => void;
  /** Re-paint tints right now without waiting for the next editor update.
   * Used by the colour picker after an optimistic character-list mutation
   * — the editor itself didn't change, so registerUpdateListener wouldn't
   * fire and the new colour would only show up on the next keystroke. */
  refresh: () => void;
}

export function installHighlight(
  editor: LexicalEditor,
  getCharacters: () => ScriptCharacter[],
): HighlightHandle {
  let lastApplied = new WeakMap<HTMLElement, string>();

  const apply = () => {
    const chars = getCharacters();
    // Build the lookup map even when empty so we can clear stale tints
    // (case: a character was renamed/deleted — its dialog blocks should
    // lose the colour rather than keep the previous value).
    const colorByName = new Map<string, string>();
    for (const c of chars) {
      colorByName.set(c.name.toUpperCase(), c.color);
    }

    // Aktuelle Paper-Variante zur Apply-Zeit lesen. Bei jedem Toggle
    // der darkPaper-Setting wird refresh() gerufen, daher reicht es,
    // den Wert hier einmal pro Lauf zu lesen.
    const darkPaper =
      typeof document !== "undefined" &&
      document.documentElement.dataset.paper === "dark";
    const tintFn = darkPaper ? hexToTintDark : hexToTintLight;

    editor.getEditorState().read(() => {
      const root = $getRoot();
      let currentName: string | null = null;
      for (const child of root.getChildren()) {
        const type = child.getType();
        if ($isScriptzCharacterNode(child)) {
          const name = child.getTextContent().trim().toUpperCase();
          currentName = name || null;
        } else if (type !== "scriptz-dialog" && type !== "scriptz-parenthetical") {
          // Any non-dialogue block resets the speaker context. (Action,
          // Camera, Caption, SFX between two character runs shouldn't
          // inherit the previous speaker's tint.)
          currentName = null;
        }
        if (!TINT_BLOCKS.has(type)) continue;
        const dom = editor.getElementByKey(child.getKey()) as HTMLElement | null;
        if (!dom) continue;

        let speaker: string | null = null;
        if ($isScriptzCharacterNode(child)) {
          const own = child.getTextContent().trim().toUpperCase();
          speaker = own || null;
        } else {
          speaker = currentName;
        }
        const color = speaker ? colorByName.get(speaker) ?? null : null;
        const next = color ? tintFn(color, 0.28) : "";
        const prev = lastApplied.get(dom) ?? "";
        if (next === prev) continue;
        if (next) {
          dom.style.setProperty("--char-tint", next);
        } else {
          dom.style.removeProperty("--char-tint");
        }
        lastApplied.set(dom, next);
      }
    });
  };

  // Initial pass after mount — give Lexical a frame to render the DOM.
  const raf = requestAnimationFrame(apply);
  const teardownUpdate = editor.registerUpdateListener(() => {
    apply();
  });

  return {
    teardown: () => {
      cancelAnimationFrame(raf);
      teardownUpdate();
      // Drop refs so GC can reclaim DOM nodes once detached.
      lastApplied = new WeakMap();
    },
    refresh: apply,
  };
}
