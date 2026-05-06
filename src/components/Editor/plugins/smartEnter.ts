import {
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import {
  BaseScriptzNode,
  $createScriptzActionNode,
  $createScriptzCharacterNode,
  $createScriptzDialogNode,
  $isScriptzActionNode,
  $isScriptzCharacterNode,
  $isScriptzDialogNode,
  $isScriptzParentheticalNode,
  $isScriptzCameraNode,
  $isScriptzCaptionNode,
  $isScriptzSfxNode,
} from "../nodes";

function findScriptzAncestor(node: LexicalNode | null): BaseScriptzNode | null {
  let cur: LexicalNode | null = node;
  while (cur) {
    if (cur instanceof BaseScriptzNode) return cur;
    cur = cur.getParent();
  }
  return null;
}

function makeBlockLikeAfter(block: BaseScriptzNode): BaseScriptzNode {
  if ($isScriptzActionNode(block)) return $createScriptzCharacterNode();
  if ($isScriptzCharacterNode(block)) return $createScriptzDialogNode();
  if ($isScriptzDialogNode(block)) return $createScriptzCharacterNode();
  if ($isScriptzParentheticalNode(block)) return $createScriptzDialogNode();
  if ($isScriptzCameraNode(block)) return $createScriptzCharacterNode();
  if ($isScriptzCaptionNode(block)) return $createScriptzCharacterNode();
  if ($isScriptzSfxNode(block)) return $createScriptzCharacterNode();
  return $createScriptzActionNode();
}

function insertNewBlockAfter(
  block: BaseScriptzNode,
  next: BaseScriptzNode,
): void {
  block.insertAfter(next);
  next.select(0, 0);
}

function replaceBlockWith(
  block: BaseScriptzNode,
  next: BaseScriptzNode,
): void {
  block.replace(next);
  next.select(0, 0);
}

export function installSmartEnter(editor: LexicalEditor): () => void {
  return mergeRegister(
    editor.registerCommand<KeyboardEvent | null>(
      KEY_ENTER_COMMAND,
      (event) => {
        if (event && event.shiftKey) return false;

        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        if (!selection.isCollapsed()) return false;

        const anchor = selection.anchor.getNode();
        const block = findScriptzAncestor(anchor);
        if (!block) return false;

        const text = block.getTextContent();
        const isEmpty = text.trim().length === 0;

        if ($isScriptzCharacterNode(block) && isEmpty) {
          replaceBlockWith(block, $createScriptzActionNode());
          if (event) event.preventDefault();
          return true;
        }
        if ($isScriptzActionNode(block) && isEmpty) {
          replaceBlockWith(block, $createScriptzCharacterNode());
          if (event) event.preventDefault();
          return true;
        }

        if ($isScriptzCharacterNode(block)) {
          insertNewBlockAfter(block, $createScriptzDialogNode());
          if (event) event.preventDefault();
          return true;
        }

        if ($isScriptzActionNode(block)) {
          insertNewBlockAfter(block, $createScriptzCharacterNode());
          if (event) event.preventDefault();
          return true;
        }
        if ($isScriptzDialogNode(block)) {
          insertNewBlockAfter(block, $createScriptzCharacterNode());
          if (event) event.preventDefault();
          return true;
        }
        if ($isScriptzParentheticalNode(block)) {
          insertNewBlockAfter(block, $createScriptzDialogNode());
          if (event) event.preventDefault();
          return true;
        }
        if (
          $isScriptzCameraNode(block) ||
          $isScriptzCaptionNode(block) ||
          $isScriptzSfxNode(block)
        ) {
          insertNewBlockAfter(block, makeBlockLikeAfter(block));
          if (event) event.preventDefault();
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH,
    ),

    editor.registerCommand<KeyboardEvent>(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        if (!selection.isCollapsed()) return false;

        const anchor = selection.anchor;
        if (anchor.offset !== 0) return false;

        const block = findScriptzAncestor(anchor.getNode());
        if (!block) return false;

        const text = block.getTextContent();
        if (text.length > 0) return false;

        const prev = block.getPreviousSibling();
        if (!prev || !$isElementNode(prev)) {
          if (!$isScriptzActionNode(block)) {
            replaceBlockWith(block, $createScriptzActionNode());
            event.preventDefault();
            return true;
          }
          return false;
        }

        block.remove();
        if ($isElementNode(prev)) {
          prev.selectEnd();
        }
        event.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    ),
  );
}
