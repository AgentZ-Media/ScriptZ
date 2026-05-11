// Spielzeit-Schätzung - eine Quelle für Editor-Rail und Browser-Übersicht.
//
// Vorher gab es zwei Stellen, die unterschiedlich gerechnet haben:
// die Rail summierte nur Dialog-Wörter und addierte 2s pro Action/Camera-
// Block; die Übersicht teilte die GESAMT-Wortzahl (inkl. Charakter-Namen,
// Parentheticals, Captions, SFX) durch dieselbe WPM und hat die Spielzeit
// dadurch systematisch überschätzt. Diese Datei definiert die Formel
// einmal, scripts.ts persistiert die zwei Eingangswerte beim Save, und
// beide Anzeigen rufen `runtimeSeconds` / `formatRuntime` auf.
//
// WPM bleibt eine Live-Setting - es wird NICHT mitpersistiert, damit eine
// Setting-Änderung sofort überall greift, ohne jedes Skript neu zu speichern.

import { extractBlocks, type ExtractedBlock } from "./lex";

/** Eingangswerte der Spielzeit-Formel. Werden beim Save in den
 *  Spalten `dialog_word_count` und `direction_block_count` festgehalten. */
export interface RuntimeStats {
  /** Wörter in Dialog-Blöcken. Nur diese werden mit Dialog-WPM verrechnet. */
  dialogWords: number;
  /** Action- + Camera-Blöcke. Jeder Block trägt einen kurzen Beat bei. */
  directionBlocks: number;
}

/** Sentinel "noch nie gemessen" - identisches Muster wie `last_word_count`.
 *  Migration 005 setzt Bestandsskripte auf diesen Wert, der Backfill
 *  beim App-Start (oder spätestens der nächste Save) normalisiert sie. */
export const RUNTIME_STATS_SENTINEL = -1;

const SECONDS_PER_DIRECTION_BLOCK = 2;
const MIN_RUNTIME_SEC = 5;

function isDialogBlock(b: ExtractedBlock): boolean {
  return b.kind === "scriptz-dialog";
}

function isDirectionBlock(b: ExtractedBlock): boolean {
  return b.kind === "scriptz-action" || b.kind === "scriptz-camera";
}

function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function runtimeStatsFromBlocks(blocks: ExtractedBlock[]): RuntimeStats {
  let dialogWords = 0;
  let directionBlocks = 0;
  for (const b of blocks) {
    if (isDialogBlock(b)) dialogWords += wordCount(b.text);
    else if (isDirectionBlock(b)) directionBlocks += 1;
  }
  return { dialogWords, directionBlocks };
}

export function runtimeStatsFromContent(contentJson: string): RuntimeStats {
  return runtimeStatsFromBlocks(extractBlocks(contentJson));
}

/** Default 210 WPM ist auf TikTok-/Sketch-Tempo kalibriert (klassische
 *  Drehbücher rechnen mit 150 WPM). Der Action-Beat steht auf 2s, weil
 *  TikTok-Regieanweisungen kürzer sind als klassische. */
export function runtimeSeconds(stats: RuntimeStats, wpm: number): number {
  const dialog = Math.max(0, stats.dialogWords);
  const dir = Math.max(0, stats.directionBlocks);
  const safeWpm = Math.max(1, wpm);
  const sec = (dialog / safeWpm) * 60 + dir * SECONDS_PER_DIRECTION_BLOCK;
  return Math.max(MIN_RUNTIME_SEC, Math.round(sec));
}

/** "5 s" / "1:23 Min" / "3 Min" - identisches Format wie seit v0.6 in
 *  der Rail. */
export function formatRuntime(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r === 0 ? `${m} Min` : `${m}:${String(r).padStart(2, "0")} Min`;
}

/** Fertig gerendertes Label aus persistierten Stats. `null` bei Sentinel
 *  oder echt leerem Skript - der Aufrufer lässt das Feld dann aus. */
export function runtimeLabelFromStats(stats: RuntimeStats, wpm: number): string | null {
  if (stats.dialogWords < 0 || stats.directionBlocks < 0) return null;
  if (stats.dialogWords === 0 && stats.directionBlocks === 0) return null;
  return formatRuntime(runtimeSeconds(stats, wpm));
}
