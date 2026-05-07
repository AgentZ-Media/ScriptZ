import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type TextFormatType,
} from "lexical";
import {
  BaseScriptzNode,
  $isScriptzActionNode,
  $isScriptzDialogNode,
} from "../nodes";

function findScriptzAncestor(node: LexicalNode | null): BaseScriptzNode | null {
  let cur: LexicalNode | null = node;
  while (cur) {
    if (cur instanceof BaseScriptzNode) return cur;
    cur = cur.getParent();
  }
  return null;
}

export function installInlineFormat(editor: LexicalEditor): () => void {
  return editor.registerCommand<KeyboardEvent>(
    KEY_DOWN_COMMAND,
    (event) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return false;
      const k = event.key.toLowerCase();
      if (k !== "b" && k !== "i" && k !== "u") return false;

      let allow = false;
      editor.getEditorState().read(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) return;
        const block = findScriptzAncestor(sel.anchor.getNode());
        if (!block) return;
        if ($isScriptzActionNode(block) || $isScriptzDialogNode(block)) {
          allow = true;
        }
      });

      if (!allow) {
        // Block formatting in non-eligible blocks.
        event.preventDefault();
        return true;
      }

      const fmt: TextFormatType =
        k === "b" ? "bold" : k === "i" ? "italic" : "underline";
      event.preventDefault();
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, fmt);
      return true;
    },
    COMMAND_PRIORITY_HIGH,
  );
}
