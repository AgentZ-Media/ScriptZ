/**
 * Pro-Skript-View-State, der den Tab-Wechsel ueberlebt.
 *
 * Wenn man von Skript A auf B wechselt und zurueck, soll man dort
 * landen, wo man war: Scroll-Position des Paper-Canvas + Cursor im
 * Editor. ScriptView haelt sich beim Wechsel kurz auf, sichert den
 * Stand fuer A in dieser Map und liest beim Mount-Schritt fuer B
 * (bzw. beim spaeteren Zurueckwechseln auf A) den passenden Eintrag
 * wieder aus.
 *
 * Die Map lebt nur im Speicher der laufenden App-Sitzung. Ueber
 * App-Neustarts hinweg wird *nicht* persistiert - das wuerde
 * bedeuten, dass der Cursor nach Tagen an einer Stelle landet, die
 * der User laengst vergessen hat. Sitzung reicht.
 *
 * Cursor wird strukturell adressiert (Block-Index in root.children +
 * Offset), nicht ueber Lexical-Keys: die werden bei jedem
 * `parseEditorState` neu vergeben, ein gespeicherter Key zeigt nach
 * dem Editor-Remount ins Leere.
 */

import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isRootNode,
  $setSelection,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";

export type CursorAddress = {
  /** Index des Top-Level-Blocks in root.getChildren(). */
  blockIndex: number;
  /** Anchor-Offset innerhalb des Blocks. */
  offset: number;
  /** Selection-Type wie in Lexical: "text" zeigt auf einen TextNode-Offset,
   *  "element" auf eine Position innerhalb eines ElementNodes. */
  type: "text" | "element";
};

export type ScriptViewState = {
  scrollTop: number;
  cursor: CursorAddress | null;
};

const cache = new Map<string, ScriptViewState>();

export const scriptViewCache = {
  get(id: string): ScriptViewState | undefined {
    return cache.get(id);
  },
  set(id: string, state: ScriptViewState) {
    cache.set(id, state);
  },
  drop(id: string) {
    cache.delete(id);
  },
};

/** Liest die aktuelle Cursor-Position aus dem Editor und gibt sie als
 *  strukturelle Adresse zurueck. Nur Range-Selections - Node-Selections
 *  (z.B. ein selektiertes Image) sind in diesem Editor nicht moeglich. */
export function captureCursor(editor: LexicalEditor): CursorAddress | null {
  let result: CursorAddress | null = null;
  editor.getEditorState().read(() => {
    const sel = $getSelection();
    if (!$isRangeSelection(sel)) return;
    let node: LexicalNode | null = sel.anchor.getNode();
    let blockIndex = -1;
    while (node) {
      const parent: LexicalNode | null = node.getParent();
      if (parent && $isRootNode(parent)) {
        blockIndex = node.getIndexWithinParent();
        break;
      }
      node = parent;
    }
    if (blockIndex < 0) return;
    result = {
      blockIndex,
      offset: sel.anchor.offset,
      type: sel.anchor.type,
    };
  });
  return result;
}

/** Setzt die Selection im Editor an die gegebene Adresse. Toleriert
 *  Drift: wenn die Block-Anzahl seit dem Capture geschrumpft ist, wird
 *  auf den letzten Block geclamped; wenn der Offset im Text-Node nicht
 *  mehr passt, auf die Text-Laenge geclamped. */
export function applyCursor(editor: LexicalEditor, addr: CursorAddress): void {
  editor.update(() => {
    const root = $getRoot();
    const blocks = root.getChildren();
    if (blocks.length === 0) return;
    const idx = Math.max(0, Math.min(addr.blockIndex, blocks.length - 1));
    const block = blocks[idx];

    if (addr.type === "text") {
      // Erster Text-Descendant des Blocks. Bei leeren Bloecken (childless)
      // gibt es keinen, dann fallen wir auf "element" zurueck.
      const first = findFirstTextDescendant(block);
      if (first) {
        const len = first.getTextContentSize();
        const off = Math.max(0, Math.min(addr.offset, len));
        const sel = $createRangeSelection();
        sel.anchor.set(first.getKey(), off, "text");
        sel.focus.set(first.getKey(), off, "text");
        $setSelection(sel);
        return;
      }
    }

    const sel = $createRangeSelection();
    sel.anchor.set(block.getKey(), 0, "element");
    sel.focus.set(block.getKey(), 0, "element");
    $setSelection(sel);
  });
}

function findFirstTextDescendant(node: LexicalNode): {
  getKey(): string;
  getTextContentSize(): number;
} | null {
  type ElementLike = { getChildren?: () => LexicalNode[] };
  if (node.getType() === "text") {
    return node as unknown as {
      getKey(): string;
      getTextContentSize(): number;
    };
  }
  const children = (node as unknown as ElementLike).getChildren?.();
  if (!children) return null;
  for (const c of children) {
    const found = findFirstTextDescendant(c);
    if (found) return found;
  }
  return null;
}
