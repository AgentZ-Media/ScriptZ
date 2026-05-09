import { For, Show, createMemo } from "solid-js";
import "./Heatmap.css";

export interface HeatmapProps {
  /** 365 Werte, älterster zuerst, heute zuletzt. Fehlende Tage = 0. */
  dailyWords: number[];
}

/** GitHub-Style Activity-Heatmap, sepia-Rampe auf Papier. 53 Spalten
 *  à 7 Tage, älteste Spalte links, „heute" rechts unten. Tooltip pro
 *  Zelle zeigt das Datum + die Wortzahl. */
export function Heatmap(props: HeatmapProps) {
  const grid = createMemo(() => buildGrid(props.dailyWords));
  const monthLabels = createMemo(() => buildMonthLabels(grid()));
  // Wochentag-Labels: nur jede zweite Spalte ist sichtbar (Mo/Mi/Fr/So),
  // aria-Variante listet alle sieben für Screen-Reader, damit die Grid-
  // Struktur lesbar bleibt.
  const dayLabelsVisible = ["Mo", "", "Mi", "", "Fr", "", "So"];
  return (
    <div
      class="hm"
      role="grid"
      aria-label="Aktivitätsverlauf der letzten 365 Tage"
    >
      <div
        class="hm-months"
        style={`grid-template-columns: 16px repeat(${grid().length}, var(--hm-cell));`}
      >
        <span />
        <For each={monthLabels()}>{(m) => <span>{m}</span>}</For>
      </div>
      <div class="hm-grid-wrap">
        <div class="hm-days">
          <For each={dayLabelsVisible}>
            {(label) => <span aria-hidden="true">{label}</span>}
          </For>
        </div>
        <div
          class="hm-grid"
          style={`grid-template-columns: repeat(${grid().length}, var(--hm-cell));`}
        >
          <For each={grid()}>
            {(week) => (
              <div class="hm-col" role="row">
                <For each={week}>
                  {(cell) => (
                    <Show
                      when={cell !== null}
                      fallback={<span class="hm-cell hm-cell-pad" aria-hidden="true" />}
                    >
                      <span
                        class="hm-cell"
                        classList={{ "is-today": cell!.isToday }}
                        data-l={bucket(cell!.words)}
                        title={tooltip(cell!.date, cell!.words)}
                        role="gridcell"
                        aria-label={tooltip(cell!.date, cell!.words)}
                      />
                    </Show>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>
      <div class="hm-legend" aria-hidden="true">
        <span>Weniger</span>
        <span class="hm-cell" data-l={0} />
        <span class="hm-cell" data-l={1} />
        <span class="hm-cell" data-l={2} />
        <span class="hm-cell" data-l={3} />
        <span class="hm-cell" data-l={4} />
        <span>Mehr</span>
      </div>
    </div>
  );
}

interface Cell {
  date: Date;
  words: number;
  isToday: boolean;
}

function bucket(w: number): 0 | 1 | 2 | 3 | 4 {
  if (!w) return 0;
  if (w < 150) return 1;
  if (w < 320) return 2;
  if (w < 520) return 3;
  return 4;
}

/** Baut ein 53×7-Grid: erste Spalte enthält den ältesten Sonntag/Montag-
 *  beginnenden Wochenblock, letzte Spalte endet auf „heute". Fehlende
 *  Vor- und Nachpadding-Slots werden mit `null` aufgefüllt. */
function buildGrid(daily: number[]): (Cell | null)[][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = daily.length;

  // Mo = 0, Di = 1, ... So = 6 (deutsche Konvention).
  const todayDow = (today.getDay() + 6) % 7;

  const padStart = (7 - ((days + (6 - todayDow)) % 7)) % 7;
  const padEnd = 6 - todayDow;

  const cells: (Cell | null)[] = [];
  for (let i = 0; i < padStart; i++) cells.push(null);
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - i));
    cells.push({
      date: d,
      words: daily[i] ?? 0,
      isToday: i === days - 1,
    });
  }
  for (let i = 0; i < padEnd; i++) cells.push(null);

  const weeks: (Cell | null)[][] = [];
  for (let c = 0; c < cells.length; c += 7) {
    weeks.push(cells.slice(c, c + 7));
  }
  return weeks;
}

const MONTH_LABELS = ["Jan","Feb","Mrz","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

function buildMonthLabels(weeks: (Cell | null)[][]): string[] {
  // Pro Wochenspalte ein Label - aber nur einmal pro Monat. Wenn die
  // Woche den 1. eines Monats enthält (auch mitten in der Woche, also
  // wenn ein Monat z. B. an einem Donnerstag startet), nehmen wir
  // diesen Monat - sonst zieht sich das Label um eine Spalte nach
  // hinten und der echte Monatsanfang wäre unbeschriftet.
  let lastMonth = -1;
  return weeks.map((week) => {
    const firstReal = week.find((c): c is Cell => c !== null);
    if (!firstReal) return "";
    const monthMarker =
      week.find((c): c is Cell => c !== null && c.date.getDate() === 1) ??
      firstReal;
    const month = monthMarker.date.getMonth();
    if (month === lastMonth) return "";
    lastMonth = month;
    return MONTH_LABELS[month];
  });
}

function tooltip(date: Date, words: number): string {
  const fmt = date.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  if (words === 0) return `${fmt} · keine Aktivität`;
  return `${fmt} · ${words.toLocaleString("de-DE")} ${words === 1 ? "Wort" : "Wörter"}`;
}
