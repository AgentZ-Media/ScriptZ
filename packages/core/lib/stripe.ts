// Geteilte Streifen-Logik für die Cast-Akzentstreifen im File-Browser
// (`ScriptRow`, `ScriptCard`) und im `MomentumStrip` „Weiterschreiben"-CTA.
// Eine Quelle, damit alle Stellen identisch aussehen.
//
// Eingabe ist die `characters`-Liste eines `ScriptSummary` - also der
// per-Skript-Charakter-Cache aus `characters_meta`, der das Feld
// `share` (Dialog-Anteil 0..1) seit der Save-Reconcile-Logik in
// `scripts.ts` mitführt.

import type { ScriptCharacter } from "./types";

export interface StripeSegment {
  color: string;
  /** Anteil in Prozent (0..100), nach Mindest-Sichtbarkeit umverteilt. */
  pct: number;
}

/** Baut die Segmente für den Akzent-Streifen aus den Charakteren des
 *  Skripts. Sortiert absteigend nach Dialog-Anteil; Charaktere ohne
 *  Dialog (`share === 0`) fliegen raus. Gibt `null` zurück, wenn das
 *  Skript keinen Cast hat (Aufrufer rendert dann den dezenten
 *  „leer"-Streifen).
 *
 *  Mindest-Anteil pro sichtbarem Segment ist 8%, sonst verschwinden
 *  kleine Sprecher in einer Pixel-Zeile. Über-Hänge werden den
 *  größeren Segmenten proportional abgezogen, sodass die Summe exakt
 *  100 bleibt.
 *
 *  Backwards-Compat: hat KEIN Charakter `share` gesetzt (alte DB-
 *  Einträge von vor dem Share-Upgrade), zeigen wir den ersten
 *  Charakter solid an. Sobald das Skript einmal gespeichert wird,
 *  füllt `reconcileCharsFromContent` `share` und der Streifen wird
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

/** Setzt eine `linear-gradient`-Stop-Liste mit harten Übergängen
 *  zusammen. Jede Farbe bekommt zwei Stops am gleichen Prozent-Punkt,
 *  also kein Blend. Den Vorspann (`to bottom`/`to right`) setzt der
 *  Aufrufer im CSS-String. */
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

/** Convenience: baut den fertigen `linear-gradient(...)`-Wert für ein
 *  `style="background: …"`. Liefert `null` wenn kein Cast da ist -
 *  Aufrufer kann dann den Empty-State rendern. */
export function stripeBackground(
  chars: ScriptCharacter[],
  direction: "to bottom" | "to right",
): string | null {
  const segs = buildStripeSegments(chars);
  if (!segs) return null;
  return `linear-gradient(${direction}, ${stripeGradientStops(segs)})`;
}
