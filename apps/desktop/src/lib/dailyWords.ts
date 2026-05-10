// Tägliche Wortprotokollierung — Speist Streak, Heatmap und Tagesziel.
//
// Drei Verbraucher:
//   1. Status-Strip in der Titlebar (Wörter heute, Streak)
//   2. Momentum-Strip in der Browser-Übersicht (Tagesziel-Fortschritt)
//   3. Activity-Modal mit 365-Tage-Heatmap (GitHub-Style, sepia-Rampe)
//
// Schreibpfad: lib/scripts.ts ruft auf jedem Save `recordWordDelta(delta)`,
// nachdem der Diff aus dem letzten gespeicherten Wortcount berechnet
// wurde. Der Helper hier kümmert sich um das Datums-Bucket. Negative
// Deltas (Löschungen) werden ignoriert - heute gilt als „heute neu
// geschrieben", nicht als „Netto-Veränderung".
//
// Lesepfad: `loadStats()` holt die letzten 365 Tage in einem SELECT
// und baut darauf Streak + Aggregat-Stats. Der Solid-Store
// stores/dailyStats.ts cached das Ergebnis und invalidiert über den
// dailyStatsBus, sobald ein Save Wörter eingetragen hat.

import { extractBlocks } from "./lex";
import { getDb } from "./db";
import type { DailyStatsSummary, DailyWordEntry } from "./types";
import { dailyStatsBus } from "./dailyStatsBus";

/** ISO-ähnliches lokales Datum YYYY-MM-DD ohne UTC-Drift. */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Wortanzahl eines Lexical-Skripts. Mirror der v3-Logik:
 *  Splitting an Whitespace, leere Tokens werden verworfen.
 *  Block-Typ ist egal - jeder Text-Block zählt. */
export function countWordsInContent(contentJson: string): number {
  const blocks = extractBlocks(contentJson);
  let total = 0;
  for (const b of blocks) {
    const text = b.text.trim();
    if (!text) continue;
    total += text.split(/\s+/).filter(Boolean).length;
  }
  return total;
}

/** Trägt einen positiven Wortdelta ins heutige Bucket ein. Aufrufer
 *  müssen den Delta vorher gegen den letzten gespeicherten Wortcount
 *  bilden und negative Werte clampen. Nach erfolgreichem Schreiben
 *  bumpt der dailyStatsBus, damit Komponenten neu lesen. */
export async function recordWordDelta(delta: number): Promise<void> {
  if (delta <= 0) return;
  const date = localDateKey();
  const db = await getDb();
  await db.execute(
    `INSERT INTO daily_word_log (date, words_added) VALUES ($1, $2)
     ON CONFLICT(date) DO UPDATE SET
       words_added = daily_word_log.words_added + excluded.words_added`,
    [date, delta],
  );
  dailyStatsBus.bump();
}

/** Gibt die letzten N Tage zurück (älterster zuerst, heute zuletzt) als
 *  durchgehendes Array - fehlende Tage in der DB werden als 0 ergänzt. */
export async function loadDailyWords(days = 365): Promise<DailyWordEntry[]> {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  const startKey = localDateKey(start);
  const db = await getDb();
  const rows = await db.select<DailyWordEntry[]>(
    `SELECT date, words_added FROM daily_word_log
     WHERE date >= $1 ORDER BY date ASC`,
    [startKey],
  );
  const map = new Map(rows.map((r) => [r.date, r.words_added]));
  const out: DailyWordEntry[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = localDateKey(d);
    out.push({ date: key, words_added: map.get(key) ?? 0 });
  }
  return out;
}

function streakFromSeries(words: number[]): number {
  // Konvention: Streak endet heute oder spätestens gestern. Heute mit 0
  // Wörtern bricht den Streak NICHT - der Tag läuft noch. Erst sobald
  // gestern auch 0 war, gilt der Streak als unterbrochen.
  if (words.length === 0) return 0;
  const last = words.length - 1;
  let streak = 0;
  // Falls heute leer ist, beginnen wir bei gestern.
  let i = words[last] === 0 ? last - 1 : last;
  while (i >= 0 && words[i] > 0) {
    streak++;
    i--;
  }
  // Heute (mit Wörtern) noch dazu addieren, sofern es schon zählt.
  if (words[last] > 0) {
    // Wir sind oben bereits beim letzten Element gestartet, also
    // bereits eingerechnet.
  }
  return streak;
}

/** Anzahl der Tage zwischen dem letzten Montag (inkl.) und heute (inkl.).
 *  Montag = 1. Sonntag = 7 (Wochenende zählt zur abgelaufenen Woche).
 *  Konvention deckt sich mit DE-Kalenderwoche (ISO-8601). */
function daysSinceMondayInclusive(d: Date = new Date()): number {
  // JavaScript: 0 = Sonntag, 1 = Montag, ..., 6 = Samstag.
  // ISO: 1 = Montag, ..., 7 = Sonntag. Mapping: 0 → 7, sonst unverändert.
  const iso = d.getDay() === 0 ? 7 : d.getDay();
  return iso; // Mo = 1 Tag (heute), So = 7 Tage (Mo..So)
}

export async function loadStats(): Promise<DailyStatsSummary> {
  const entries = await loadDailyWords(365);
  const series = entries.map((e) => e.words_added);
  const wordsToday = series.length > 0 ? series[series.length - 1] : 0;
  const weekDays = daysSinceMondayInclusive();
  const wordsThisWeek = series.slice(-weekDays).reduce((a, b) => a + b, 0);
  const streakDays = streakFromSeries(series);
  const activeDays = series.filter((w) => w > 0).length;
  const totalWords = series.reduce((a, b) => a + b, 0);
  return {
    wordsToday,
    wordsThisWeek,
    streakDays,
    dailyWords: series,
    activeDays,
    totalWords,
  };
}
