import type { LexicalNode, NodeKey } from "lexical";
import { BaseScriptzNode, type SerializedScriptzNode } from "./BaseScriptzNode";
import type { BlockType } from "../../../lib/types";

export class ScriptzSfxNode extends BaseScriptzNode {
  static getType(): string {
    return "scriptz-sfx";
  }
  static getBlockType(): BlockType {
    return "scriptz-sfx";
  }
  static clone(node: ScriptzSfxNode): ScriptzSfxNode {
    return new ScriptzSfxNode(node.__key);
  }
  constructor(key?: NodeKey) {
    super(key);
  }
  getType(): string {
    return ScriptzSfxNode.getType();
  }
  static importJSON(serialized: SerializedScriptzNode): ScriptzSfxNode {
    const node = $createScriptzSfxNode();
    node.setFormat(serialized.format);
    node.setIndent(serialized.indent);
    node.setDirection(serialized.direction);
    return node;
  }
}

export function $createScriptzSfxNode(): ScriptzSfxNode {
  return new ScriptzSfxNode();
}

export function $isScriptzSfxNode(node: LexicalNode | null | undefined): node is ScriptzSfxNode {
  return node instanceof ScriptzSfxNode;
}
