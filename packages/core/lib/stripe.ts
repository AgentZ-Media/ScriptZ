// Shared stripe logic for the cast accent stripes in the file browser
// (`ScriptRow`, `ScriptCard`) and in the `MomentumStrip` "Continue writing" CTA.
// One source so all spots look identical.
//
// Input is the `characters` list of a `ScriptSummary` - i.e. the
// per-script character cache from `characters_meta`, which carries
// the `share` field (dialog share 0..1) since the save reconcile logic
// in `scripts.ts`.

import type { ScriptCharacter } from "./types";

export interface StripeSegment {
  color: string;
  /** Share in percent (0..100), redistributed after minimum visibility. */
  pct: number;
}

/** Builds the segments for the accent stripe from the characters of
 *  the script. Sorted descending by dialog share; characters without
 *  dialog (`share === 0`) are filtered out. Returns `null` if the
 *  script has no cast (caller then renders the discreet
 *  "empty" stripe).
 *
 *  Minimum share per visible segment is 8%, otherwise small speakers
 *  disappear in a one-pixel row. Overhang is taken proportionally from
 *  larger segments so the sum stays exactly
 *  100.
 *
 *  Backwards-compat: if NO character has `share` set (old DB
 *  entries from before the share upgrade), we show the first
 *  character solid. Once the script is saved,
 *  `reconcileCharsFromContent` fills `share` and the stripe becomes
 *  proportional. */
export function buildStripeSegments(
  chars: ScriptCharacter[],
): StripeSegment[] | null {
  if (chars.length === 0) return null;
  const anyShare = chars.some((c) => c.share !== undefined);
  if (!anyShare) {
    return [{ color: chars[0].color, pct: 100 }];
  }
  const withShare = chars
    .filter((c) => (c.share ?? 0) > 0)
    .map((c) => ({ color: c.color, share: c.share ?? 0 }))
    .sort((a, b) => b.share - a.share);
  if (withShare.length === 0) return null;
  if (withShare.length === 1) return [{ color: withShare[0].color, pct: 100 }];

  const MIN_PCT = 8;
  const raw = withShare.map((c) => c.share * 100);
  const need = raw.map((p) => (p < MIN_PCT ? MIN_PCT - p : 0));
  const totalNeed = need.reduce((a, b) => a + b, 0);
  if (totalNeed > 0) {
    const surplusPool = raw.reduce(
      (sum, p) => sum + Math.max(0, p - MIN_PCT),
      0,
    );
    if (surplusPool > 0) {
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] > MIN_PCT) {
          const excess = raw[i] - MIN_PCT;
          raw[i] -= (excess / surplusPool) * totalNeed;
        } else {
          raw[i] = MIN_PCT;
        }
      }
    }
  }
  return withShare.map((c, i) => ({ color: c.color, pct: raw[i] }));
}

/** Assembles a `linear-gradient` stop list with hard transitions.
 *  Each color gets two stops at the same percent point,
 *  i.e. no blend. The prefix (`to bottom`/`to right`) is set by the
 *  caller in the CSS string. */
export function stripeGradientStops(segments: StripeSegment[]): string {
  const stops: string[] = [];
  let acc = 0;
  for (const s of segments) {
    stops.push(`${s.color} ${acc}%`);
    acc += s.pct;
    stops.push(`${s.color} ${acc}%`);
  }
  return stops.join(", ");
}

/** Convenience: builds the finished `linear-gradient(...)` value for a
 *  `style="background: …"`. Returns `null` when no cast is there -
 *  the caller can then render the empty state. */
export function stripeBackground(
  chars: ScriptCharacter[],
  direction: "to bottom" | "to right",
): string | null {
  const segs = buildStripeSegments(chars);
  if (!segs) return null;
  return `linear-gradient(${direction}, ${stripeGradientStops(segs)})`;
}
