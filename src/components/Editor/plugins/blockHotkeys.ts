import {
  $getSelection,
  $isRangeSelection,
  $createTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import {
  BaseScriptzNode,
  $createScriptzActionNode,
  $createScriptzCharacterNode,
  $createScriptzDialogNode,
  $createScriptzParentheticalNode,
  $createScriptzCameraNode,
  $createScriptzCaptionNode,
  $createScriptzSfxNode,
} from "../nodes";
import type { BlockType } from "../../../lib/types";

const FACTORY: Record<BlockType, () => BaseScriptzNode> = {
  "scriptz-action": $createScriptzActionNode,
  "scriptz-character": $createScriptzCharacterNode,
  "scriptz-dialog": $createScriptzDialogNode,
  "scriptz-parenthetical": $createScriptzParentheticalNode,
  "scriptz-camera": $createScriptzCameraNode,
  "scriptz-caption": $createScriptzCaptionNode,
  "scriptz-sfx": $createScriptzSfxNode,
};

const DIGIT_TO_BLOCK: Record<string, BlockType> = {
  "1": "scriptz-action",
  "2": "scriptz-character",
  "3": "scriptz-dialog",
  "4": "scriptz-parenthetical",
  "5": "scriptz-camera",
  "6": "scriptz-caption",
  "7": "scriptz-sfx",
};

function findScriptzAncestor(node: LexicalNode | null): BaseScriptzNode | null {
  let cur: LexicalNode | null = node;
  while (cur) {
    if (cur instanceof BaseScriptzNode) return cur;
    cur = cur.getParent();
  }
  return null;
}

export function installBlockHotkeys(editor: LexicalEditor): () => void {
  return editor.registerCommand<KeyboardEvent>(
    KEY_DOWN_COMMAND,
    (event) => {
      if (!(event.metaKey || event.ctrlKey)) return false;
      if (event.shiftKey || event.altKey) return false;
      const target = DIGIT_TO_BLOCK[event.key];
      if (!target) return false;

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return false;
      const block = findScriptzAncestor(selection.anchor.getNode());
      if (!block) return false;

      // Already this type? no-op.
      if (block.getBlockType() === target) {
        event.preventDefault();
        return true;
      }

      const fresh = FACTORY[target]();
      const text = block.getTextContent();
      if (text.length === 0) {
        fresh.append($createTextNode(""));
      } else {
        // Preserve text content if any
        fresh.append($createTextNode(text));
      }
      block.replace(fresh);
      // Place caret at end of new block
      fresh.selectEnd();
      event.preventDefault();
      return true;
    },
    COMMAND_PRIORITY_HIGH,
  );
}
