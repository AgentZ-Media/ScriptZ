// Predict who should speak next, used by the character-autocomplete
// dropdown to pre-highlight the most likely next character so Enter
// accepts it. Independent of Quick mode (Quick mode is strictly the
// 2-character deterministic auto-insert).
//
// Heuristic: bigram counts (how often Y has followed prev historically
// in this script) drive the score; LRU is the tiebreaker so equally-
// frequent candidates rotate naturally instead of always resolving to
// the same name.

import { $getRoot, type LexicalNode } from "lexical";
import {
  $isScriptzCharacterNode,
  type BaseScriptzNode,
  type ScriptzCharacterNode,
} from "./nodes";
import type { ScriptCharacter } from "../../lib/types";

/** Walk back from any block to find the most recent Character block above
 * it (skipping its own siblings). Returns the upper-cased trimmed name. */
export function previousCharacterFrom(
  block: BaseScriptzNode,
): string | null {
  let prev: LexicalNode | null = block.getPreviousSibling();
  while (prev) {
    if ($isScriptzCharacterNode(prev)) {
      const node = prev as ScriptzCharacterNode;
      const name = node.getTextContent().trim().toUpperCase();
      return name || null;
    }
    prev = prev.getPreviousSibling();
  }
  return null;
}

/** Walk the document and collect the ordered sequence of speakers. Empty
 * Character blocks are skipped — they don't contribute to the prediction. */
export function collectSpeakerSequence(): string[] {
  const out: string[] = [];
  for (const child of $getRoot().getChildren()) {
    if ($isScriptzCharacterNode(child)) {
      const name = (child as ScriptzCharacterNode)
        .getTextContent()
        .trim()
        .toUpperCase();
      if (name) out.push(name);
    }
  }
  return out;
}

/** Pick the most plausible next speaker. Bigram score (how often Y
 * followed `prev`) is primary; LRU (smallest last-position wins, i.e.
 * least recently spoken) breaks ties. `prev` may be null on the first
 * character of a fresh script — then bigram has no signal and pure LRU
 * over the candidate list applies. Returns null if no candidate qualifies
 * (only one character defined or zero). */
export function predictNextSpeaker(
  prev: string | null,
  candidates: ScriptCharacter[],
): ScriptCharacter | null {
  if (candidates.length === 0) return null;
  const prevUpper = (prev ?? "").toUpperCase();
  const others = candidates.filter(
    (c) => c.name.toUpperCase() !== prevUpper,
  );
  if (others.length === 0) return null;
  if (others.length === 1) return others[0];

  const sequence = collectSpeakerSequence();

  const bigram = new Map<string, number>();
  if (prevUpper) {
    for (let i = 1; i < sequence.length; i++) {
      if (sequence[i - 1] === prevUpper && sequence[i] !== prevUpper) {
        bigram.set(sequence[i], (bigram.get(sequence[i]) ?? 0) + 1);
      }
    }
  }

  const lru = new Map<string, number>();
  for (let i = 0; i < sequence.length; i++) lru.set(sequence[i], i);

  let best: ScriptCharacter | null = null;
  let bestBg = -1;
  let bestLru = Number.POSITIVE_INFINITY;
  for (const c of others) {
    const u = c.name.toUpperCase();
    const bg = bigram.get(u) ?? 0;
    // Never spoken → treat as oldest (-1) so a fresh character rotates
    // in before any previously-used one when scores are otherwise tied.
    const lr = lru.get(u) ?? -1;
    const better = bg > bestBg || (bg === bestBg && lr < bestLru);
    if (better) {
      best = c;
      bestBg = bg;
      bestLru = lr;
    }
  }
  return best;
}
