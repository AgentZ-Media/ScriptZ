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
 *   - In a Dialog block, typing `(` splits the dialog at the cursor and starts a
 *     new ParentheticalNode containing the `(`.
 *   - In a Parenthetical block, typing `)` finishes the parenthetical, then
 *     creates a new Dialog block after it where the cursor lands.
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
          const paren = $createScriptzParentheticalNode();
          paren.append($createTextNode("("));
          block.insertAfter(paren);
          paren.selectEnd();
          return true;
        }

        if (text === ")" && $isScriptzParentheticalNode(block)) {
          // Append the closing paren, then start a fresh Dialog block.
          const last = block.getLastChild();
          if ($isTextNode(last)) {
            last.setTextContent(last.getTextContent() + ")");
          } else {
            block.append($createTextNode(")"));
          }
          const dialog = $createScriptzDialogNode();
          dialog.append($createTextNode(""));
          block.insertAfter(dialog);
          dialog.selectStart();
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH,
    ),
  );
}
