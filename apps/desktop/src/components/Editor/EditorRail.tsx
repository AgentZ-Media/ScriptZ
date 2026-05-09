import { For, Show, createSignal, createMemo } from "solid-js";
import { dialogWordsByCharacter, extractBlocks } from "~/lib/lex";
import type { ScriptCharacter } from "~/lib/types";
import "./EditorRail.css";

export interface EditorRailProps {
  /** Aktueller Skript-Inhalt als Lexical-JSON (für Cast-Statistik). */
  contentJson: string | null | undefined;
  /** Charaktere mit Sticky-Farben (aus dem Skript-Modell). */
  characters: ScriptCharacter[];
  /** Anzahl Seiten (paginiert vom Editor). */
  pageCount: number;
  /** "Versionen"-Tab → öffnet die existierende SnapshotsDialog-Komponente. */
  onOpenSnapshots(): void;
}

type RailTab = "cast" | "versions";

/**
 * Rechte Seitenleiste im Editor — Re-Design `editor.jsx::editor-rail`.
 * Zwei Tabs: **Cast** (Wörter pro Charakter, Spielzeit, Wörter, Seiten,
 * Dialog) und **Versionen** (öffnet den vorhandenen SnapshotsDialog).
 *
 * Im Fokus-Modus blendet die Rail komplett weg (CSS).
 */
export function EditorRail(props: EditorRailProps) {
  const [tab, setTab] = createSignal<RailTab>("cast");

  const blocks = createMemo(() =>
    extractBlocks(props.contentJson ?? "")
  );

  /** Wörter pro Charakter — geteilte Logik mit `scripts.ts`
   *  (`characters_meta.share` beim Save). Quelle ist
   *  `dialogWordsByCharacter` in `lib/lex.ts`. */
  const wordsByChar = createMemo(() =>
    dialogWordsByCharacter(props.contentJson ?? ""),
  );

  /** Summe Dialog-Wörter (für Prozent-Berechnung). */
  const totalDialog = createMemo(() => {
    let n = 0;
    for (const v of Object.values(wordsByChar())) n += v;
    return n;
  });

  /** Charaktere sortiert nach Dialog-Wörtern absteigend, mit Farbe. */
  const cast = createMemo(() => {
    const wbc = wordsByChar();
    const colorByName = new Map(
      props.characters.map((c) => [c.name.toUpperCase(), c.color] as const),
    );
    const list = Object.entries(wbc)
      .map(([name, words]) => ({
        name,
        words,
        color: colorByName.get(name) ?? "var(--ink-300)",
        pct: totalDialog() > 0 ? Math.round((words / totalDialog()) * 100) : 0,
      }))
      .sort((a, b) => b.words - a.words);
    return list;
  });

  /** Gesamt-Wortzahl (alle Block-Texte zusammen). */
  const totalWords = createMemo(() => {
    let n = 0;
    for (const b of blocks()) {
      n += b.text.trim().split(/\s+/).filter(Boolean).length;
    }
    return n;
  });

  /** Geschätzte Spielzeit in Sekunden — 210 WPM für Dialog + 2s pro
   *  Action/Camera-Block (Pausen).
   *
   *  Kalibriert auf TikTok-/Sketch-Tempo: Industriestandard für klassische
   *  Drehbücher liegt bei 150 WPM (Hörspiel/TV-Pace), aber die Zielgruppe
   *  dieser App spricht deutlich schneller. Empirisch ergibt eine fertig
   *  produzierte Folge (238 Dialogwörter, 0 Action-Blöcke) ≈ 1:06 Min,
   *  was 216 WPM entspricht; 210 WPM lässt etwas Headroom für ruhigere
   *  Stellen. Der Action-Beat ist von 4s auf 2s halbiert, weil TikTok-
   *  Action-Beschreibungen kürzer und schneller sind als TV-Regieanweisungen. */
  const runtimeSec = createMemo(() => {
    const dialogWords = blocks()
      .filter((b) => b.kind === "scriptz-dialog")
      .reduce((n, b) => n + b.text.trim().split(/\s+/).filter(Boolean).length, 0);
    const dirCount = blocks().filter(
      (b) => b.kind === "scriptz-action" || b.kind === "scriptz-camera",
    ).length;
    const sec = (dialogWords / 210) * 60 + dirCount * 2;
    return Math.max(5, Math.round(sec));
  });

  function fmtRuntime(s: number): string {
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r === 0 ? m + " Min" : m + ":" + String(r).padStart(2, "0") + " Min";
  }

  return (
    <aside class="editor-rail" aria-label="Skript-Statistik">
      <div class="rail-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab() === "cast"}
          classList={{ "is-on": tab() === "cast" }}
          onClick={() => setTab("cast")}
        >
          Cast
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab() === "versions"}
          classList={{ "is-on": tab() === "versions" }}
          onClick={() => setTab("versions")}
        >
          Versionen
        </button>
      </div>

      <Show when={tab() === "cast"}>
        <Show
          when={cast().length > 0}
          fallback={
            <div class="rail-empty">
              Noch niemand spricht. Tipp einen Namen in einen{" "}
              <b>Charakter</b>-Block.
            </div>
          }
        >
          <div class="rail-cast">
            <For each={cast()}>
              {(c) => (
                <div class="rail-char-row">
                  <div class="rail-char">
                    <span class="rail-dot" style={`background:${c.color};`} />
                    <span class="rail-name">{c.name}</span>
                    <span class="rail-pct">{c.pct}%</span>
                  </div>
                  <div class="rail-bar">
                    <span style={`width:${c.pct}%;background:${c.color};`} />
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        <div class="rail-stats">
          <div>
            <div class="rail-stat-label">Spielzeit</div>
            <div class="rail-stat-val">{fmtRuntime(runtimeSec())}</div>
          </div>
          <div>
            <div class="rail-stat-label">Wörter</div>
            <div class="rail-stat-val">{totalWords()}</div>
          </div>
          <div>
            <div class="rail-stat-label">Seiten</div>
            <div class="rail-stat-val">{props.pageCount}</div>
          </div>
          <div>
            <div class="rail-stat-label">Dialog</div>
            <div class="rail-stat-val">{totalDialog()}</div>
          </div>
        </div>
      </Show>

      <Show when={tab() === "versions"}>
        <div class="rail-versions-info">
          Verlauf der automatischen und manuellen Snapshots dieses Skripts.
        </div>
        <button
          type="button"
          class="rail-versions-open"
          onClick={props.onOpenSnapshots}
        >
          Verlauf öffnen
        </button>
        <div class="rail-versions-hint">
          <span class="kbd kbd-inline">⌘⇧S</span> sichert manuell ·{" "}
          <span class="kbd kbd-inline">⌘⇧H</span> öffnet diesen Verlauf
        </div>
      </Show>
    </aside>
  );
}
