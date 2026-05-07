import type { LexicalNode, NodeKey } from "lexical";
import { BaseScriptzNode, type SerializedScriptzNode } from "./BaseScriptzNode";
import type { BlockType } from "../../../lib/types";

export class ScriptzCameraNode extends BaseScriptzNode {
  static getType(): string {
    return "scriptz-camera";
  }
  static getBlockType(): BlockType {
    return "scriptz-camera";
  }
  static clone(node: ScriptzCameraNode): ScriptzCameraNode {
    return new ScriptzCameraNode(node.__key);
  }
  constructor(key?: NodeKey) {
    super(key);
  }
  getType(): string {
    return ScriptzCameraNode.getType();
  }
  static importJSON(serialized: SerializedScriptzNode): ScriptzCameraNode {
    const node = $createScriptzCameraNode();
    node.setFormat(serialized.format);
    node.setIndent(serialized.indent);
    node.setDirection(serialized.direction);
    return node;
  }
}

export function $createScriptzCameraNode(): ScriptzCameraNode {
  return new ScriptzCameraNode();
}

export function $isScriptzCameraNode(node: LexicalNode | null | undefined): node is ScriptzCameraNode {
  return node instanceof ScriptzCameraNode;
}
