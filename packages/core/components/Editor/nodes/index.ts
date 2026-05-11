import type { BlockType } from "../../../lib/types";
import { ScriptzActionNode } from "./ScriptzActionNode";
import { ScriptzCharacterNode } from "./ScriptzCharacterNode";
import { ScriptzDialogNode } from "./ScriptzDialogNode";
import { ScriptzParentheticalNode } from "./ScriptzParentheticalNode";
import { ScriptzCameraNode } from "./ScriptzCameraNode";
import { ScriptzCaptionNode } from "./ScriptzCaptionNode";
import { ScriptzSfxNode } from "./ScriptzSfxNode";

export {
  ScriptzActionNode,
  ScriptzCharacterNode,
  ScriptzDialogNode,
  ScriptzParentheticalNode,
  ScriptzCameraNode,
  ScriptzCaptionNode,
  ScriptzSfxNode,
};

export {
  $createScriptzActionNode,
  $isScriptzActionNode,
} from "./ScriptzActionNode";
export {
  $createScriptzCharacterNode,
  $isScriptzCharacterNode,
} from "./ScriptzCharacterNode";
export {
  $createScriptzDialogNode,
  $isScriptzDialogNode,
} from "./ScriptzDialogNode";
export {
  $createScriptzParentheticalNode,
  $isScriptzParentheticalNode,
} from "./ScriptzParentheticalNode";
export {
  $createScriptzCameraNode,
  $isScriptzCameraNode,
} from "./ScriptzCameraNode";
export {
  $createScriptzCaptionNode,
  $isScriptzCaptionNode,
} from "./ScriptzCaptionNode";
export {
  $createScriptzSfxNode,
  $isScriptzSfxNode,
} from "./ScriptzSfxNode";

export { BaseScriptzNode } from "./BaseScriptzNode";
export type { SerializedScriptzNode } from "./BaseScriptzNode";
export type { SerializedScriptzCharacterNode } from "./ScriptzCharacterNode";

export const SCRIPTZ_NODES = [
  ScriptzActionNode,
  ScriptzCharacterNode,
  ScriptzDialogNode,
  ScriptzParentheticalNode,
  ScriptzCameraNode,
  ScriptzCaptionNode,
  ScriptzSfxNode,
] as const;

export const BLOCK_TAGS: Record<BlockType, string> = {
  "scriptz-action": "Action",
  "scriptz-character": "Charakter",
  "scriptz-dialog": "Dialog",
  "scriptz-parenthetical": "Parenthetical",
  "scriptz-camera": "Kamera",
  "scriptz-caption": "Caption",
  "scriptz-sfx": "SFX",
};

export const BLOCK_TYPES: BlockType[] = [
  "scriptz-action",
  "scriptz-character",
  "scriptz-dialog",
  "scriptz-parenthetical",
  "scriptz-camera",
  "scriptz-caption",
  "scriptz-sfx",
];
