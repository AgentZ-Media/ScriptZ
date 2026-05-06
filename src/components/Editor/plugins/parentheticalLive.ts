import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $createTextNode,
  COMMAND_PRIORITY_HIGH,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import {
  BaseScriptzNode,
  $createScriptzDialogNode,
  $createScriptzParentheticalNode,
  $isScriptzDialogNode,
  $isScriptzParentheticalNode,
} from "../nodes";

function findScriptzAncestor(node: LexicalNode | null): BaseScriptzNode | null {
  let cur: LexicalNode | null = node;
  while (cur) {
    if (cur instanceof BaseScriptzNode) return cur;
    cur = cur.getParent();
  }
  return null;
}

/**
 * State machine:
 *   - In a Dialog block, typing `(` splits the dialog at the cursor: text
 *     before the cursor stays, a new Parenthetical containing `(` is inserted
 *     after, and any text after the cursor moves into a fresh Dialog block
 *     following the parenthetical. The caret lands inside the parenthetical.
 *   - In a Parenthetical block, typing `)` appends the closing paren and jumps
 *     the caret to the next Dialog (creating one if missing).
 */
export function installParentheticalLive(editor: LexicalEditor): () => void {
  return mergeRegister(
    editor.registerCommand<InputEvent | string>(
      CONTROLLED_TEXT_INSERTION_COMMAND,
      (payload) => {
        const text = typeof payload === "string" ? payload : payload.data ?? "";
        if (text !== "(" && text !== ")") return false;

        const sel = $getSelection();
        if (!$isRangeSelection(sel) || !sel.isCollapsed()) return false;

        const block = findScriptzAncestor(sel.anchor.getNode());
        if (!block) return false;

        if (text === "(" && $isScriptzDialogNode(block)) {
          const trailing = collectTrailingNodes(sel.anchor.getNode(), sel.anchor.offset, block);

          const paren = $createScriptzParentheticalNode();
          paren.append($createTextNode("("));
          block.insertAfter(paren);

          if (trailing.length > 0) {
            const trailingDialog = $createScriptzDialogNode();
            for (const node of trailing) {
              node.remove();
              trailingDialog.append(node);
            }
            paren.insertAfter(trailingDialog);
          }

          paren.selectEnd();
          return true;
        }

        if (text === ")" && $isScriptzParentheticalNode(block)) {
          const last = block.getLastChild();
          if ($isTextNode(last)) {
            last.setTextContent(last.getTextContent() + ")");
          } else {
            block.append($createTextNode(")"));
          }

          const next = block.getNextSibling();
          if (next && $isScriptzDialogNode(next)) {
            next.selectStart();
          } else {
            const dialog = $createScriptzDialogNode();
            block.insertAfter(dialog);
            dialog.select(0, 0);
          }
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH,
    ),
  );
}

/**
 * Returns the inline nodes inside `block` that lie at or after `(anchorNode, offset)`.
 * If the anchor is a text node and the offset falls mid-text, the text node is
 * split first so the trailing portion preserves its formatting. The returned
 * nodes are still attached; the caller should detach and re-parent them.
 */
function collectTrailingNodes(
  anchorNode: LexicalNode,
  offset: number,
  block: BaseScriptzNode,
): LexicalNode[] {
  const trailing: LexicalNode[] = [];

  if ($isTextNode(anchorNode) && anchorNode.getParent() === block) {
    const size = anchorNode.getTextContentSize();
    let firstTrailing: LexicalNode | null;

    if (offset === 0) {
      firstTrailing = anchorNode;
    } else if (offset >= size) {
      firstTrailing = anchorNode.getNextSibling();
    } else {
      const parts = anchorNode.splitText(offset);
      firstTrailing = parts[1] ?? null;
    }

    let cur: LexicalNode | null = firstTrailing;
    while (cur) {
      trailing.push(cur);
      cur = cur.getNextSibling();
    }
    return trailing;
  }

  // Anchor is the block element itself (e.g. empty block, or caret between
  // children). offset indexes into block.getChildren().
  if (anchorNode === block) {
    const children = block.getChildren();
    for (let i = offset; i < children.length; i++) {
      trailing.push(children[i]!);
    }
  }

  return trailing;
}
