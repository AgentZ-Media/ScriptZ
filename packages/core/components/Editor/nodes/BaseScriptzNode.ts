import {
  ElementNode,
  type EditorConfig,
  type LexicalNode,
  type SerializedElementNode,
  type Spread,
} from "lexical";
import type { BlockType } from "../../../lib/types";

export type SerializedScriptzNode = Spread<
  { blockType: BlockType },
  SerializedElementNode
>;

/**
 * Shared base class for the seven ScriptZ block types.
 * Each subclass declares its own BlockType through `getBlockType()`.
 */
export abstract class BaseScriptzNode extends ElementNode {
  static getBlockType(): BlockType {
    throw new Error("BaseScriptzNode subclass must override getBlockType()");
  }

  getBlockType(): BlockType {
    return (this.constructor as unknown as typeof BaseScriptzNode).getBlockType();
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const type = this.getBlockType();
    const dom = document.createElement("div");
    dom.classList.add("block", `block-${type}`);
    dom.setAttribute("data-block-type", type);
    return dom;
  }

  updateDOM(_prev: this, _dom: HTMLElement, _config: EditorConfig): boolean {
    return false;
  }

  exportJSON(): SerializedScriptzNode {
    return {
      ...super.exportJSON(),
      blockType: this.getBlockType(),
      type: (this.constructor as unknown as { getType(): string }).getType(),
      version: 1,
    } as SerializedScriptzNode;
  }

  // Subclasses can override to read extra fields. Default just calls super.
  static importJSON(_serialized: SerializedScriptzNode): BaseScriptzNode {
    throw new Error("BaseScriptzNode subclass must override importJSON()");
  }

  isShadowRoot(): boolean {
    return false;
  }

  // Block nodes are always block-level top-level paragraphs.
  canBeEmpty(): boolean {
    return true;
  }

  canInsertTextBefore(): boolean {
    return true;
  }

  canInsertTextAfter(): boolean {
    return true;
  }

  // Helper used by smart-Enter: insert a sibling block of any concrete type.
  // Subclasses do not need to override this — the plugin uses concrete factories.
  insertNewAfter(_selection: unknown, _restoreSelection?: boolean): LexicalNode | null {
    return null;
  }
}
