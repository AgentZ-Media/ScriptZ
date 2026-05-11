import type { LexicalNode, NodeKey } from "lexical";
import { BaseScriptzNode, type SerializedScriptzNode } from "./BaseScriptzNode";
import type { BlockType } from "../../../lib/types";

export class ScriptzCaptionNode extends BaseScriptzNode {
  static getType(): string {
    return "scriptz-caption";
  }
  static getBlockType(): BlockType {
    return "scriptz-caption";
  }
  static clone(node: ScriptzCaptionNode): ScriptzCaptionNode {
    return new ScriptzCaptionNode(node.__key);
  }
  constructor(key?: NodeKey) {
    super(key);
  }
  getType(): string {
    return ScriptzCaptionNode.getType();
  }
  static importJSON(serialized: SerializedScriptzNode): ScriptzCaptionNode {
    const node = $createScriptzCaptionNode();
    node.setFormat(serialized.format);
    node.setIndent(serialized.indent);
    node.setDirection(serialized.direction);
    return node;
  }
}

export function $createScriptzCaptionNode(): ScriptzCaptionNode {
  return new ScriptzCaptionNode();
}

export function $isScriptzCaptionNode(node: LexicalNode | null | undefined): node is ScriptzCaptionNode {
  return node instanceof ScriptzCaptionNode;
}
