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
  /** Pfad vom Block hinunter zum Anchor-Node, jede Zahl ist ein
   *  child-Index auf der jeweiligen Ebene. Leer bedeutet: der Anchor
   *  liegt am Block selbst (type "element"). Wichtig fuer Bloecke mit
   *  mehreren Text-Descendants (z.B. nach Inline-Bold), wo der bloss
   *  Block-relative Offset auf den FALSCHEN Text-Node zeigen wuerde. */
  path: number[];
  /** Offset innerhalb des Ziel-Nodes (Text-Offset bei type "text",
   *  Child-Index bei type "element"). */
  offset: number;
  /** Selection-Type wie in Lexical. */
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
    const path: number[] = [];
    let node: LexicalNode | null = sel.anchor.getNode();
    let blockIndex = -1;
    while (node) {
      const parent: LexicalNode | null = node.getParent();
      if (!parent) break;
      if ($isRootNode(parent)) {
        blockIndex = node.getIndexWithinParent();
        break;
      }
      path.unshift(node.getIndexWithinParent());
      node = parent;
    }
    if (blockIndex < 0) return;
    result = {
      blockIndex,
      path,
      offset: sel.anchor.offset,
      type: sel.anchor.type,
    };
  });
  return result;
}

/** Setzt die Selection im Editor an die gegebene Adresse. Toleriert
 *  Drift: wenn die Block-Anzahl seit dem Capture geschrumpft ist, wird
 *  auf den letzten Block geclamped; wenn der Pfad nicht mehr aufloest
 *  (z.B. weil Inline-Format weggefallen ist), faellt es auf den ersten
 *  Text-Descendant zurueck und clamped den Offset; bleibt auch das
 *  fruchtlos, landet die Selection element-relativ am Block. */
export function applyCursor(editor: LexicalEditor, addr: CursorAddress): void {
  editor.update(() => {
    const root = $getRoot();
    const blocks = root.getChildren();
    if (blocks.length === 0) return;
    const idx = Math.max(0, Math.min(addr.blockIndex, blocks.length - 1));
    const block = blocks[idx];

    if (addr.type === "text") {
      const target = resolvePath(block, addr.path) ?? findFirstTextDescendant(block);
      if (target && isTextLike(target)) {
        const len = target.getTextContentSize();
        const off = Math.max(0, Math.min(addr.offset, len));
        const sel = $createRangeSelection();
        sel.anchor.set(target.getKey(), off, "text");
        sel.focus.set(target.getKey(), off, "text");
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

type ElementLike = { getChildren?: () => LexicalNode[] };
type TextLike = { getKey(): string; getTextContentSize(): number };

function resolvePath(start: LexicalNode, path: number[]): LexicalNode | null {
  let node: LexicalNode = start;
  for (const i of path) {
    const children = (node as unknown as ElementLike).getChildren?.();
    if (!children || i < 0 || i >= children.length) return null;
    node = children[i];
  }
  return node;
}

function isTextLike(node: LexicalNode): node is LexicalNode & TextLike {
  return node.getType() === "text";
}

function findFirstTextDescendant(node: LexicalNode): (LexicalNode & TextLike) | null {
  if (node.getType() === "text") return node as LexicalNode & TextLike;
  const children = (node as unknown as ElementLike).getChildren?.();
  if (!children) return null;
  for (const c of children) {
    const found = findFirstTextDescendant(c);
    if (found) return found;
  }
  return null;
}
