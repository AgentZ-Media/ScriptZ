import { For, Show, createSignal, createMemo } from "solid-js";
import { dialogWordsByCharacter, extractBlocks } from "../../lib/lex";
import {
  formatRuntime,
  runtimeSeconds,
  runtimeStatsFromBlocks,
} from "../../lib/runtime";
import { settingsStore } from "../../stores/settings";
import type { ScriptCharacter } from "../../lib/types";
import { K } from "../../lib/keys";
import { t } from "../../i18n";
import "./EditorRail.css";

export interface EditorRailProps {
  contentJson: string | null | undefined;
  characters: ScriptCharacter[];
  onOpenSnapshots(): void;
}

type RailTab = "cast" | "versions";

export function EditorRail(props: EditorRailProps) {
  const [tab, setTab] = createSignal<RailTab>("cast");

  const blocks = createMemo(() =>
    extractBlocks(props.contentJson ?? "")
  );

  const wordsByChar = createMemo(() =>
    dialogWordsByCharacter(props.contentJson ?? ""),
  );

  const totalDialog = createMemo(() => {
    let n = 0;
    for (const v of Object.values(wordsByChar())) n += v;
    return n;
  });

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

  const totalWords = createMemo(() => {
    let n = 0;
    for (const b of blocks()) {
      n += b.text.trim().split(/\s+/).filter(Boolean).length;
    }
    return n;
  });

  const runtimeSec = createMemo(() =>
    runtimeSeconds(runtimeStatsFromBlocks(blocks()), settingsStore.dialogWpm()),
  );

  const emptyParts = createMemo(() => t("rail.empty").split("{block}"));

  return (
    <aside class="editor-rail" aria-label={t("rail.aria")}>
      <div class="rail-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab() === "cast"}
          classList={{ "is-on": tab() === "cast" }}
          onClick={() => setTab("cast")}
        >
          {t("rail.tab.cast")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab() === "versions"}
          classList={{ "is-on": tab() === "versions" }}
          onClick={() => setTab("versions")}
        >
          {t("rail.tab.versions")}
        </button>
      </div>

      <Show when={tab() === "cast"}>
        <Show
          when={cast().length > 0}
          fallback={
            <div class="rail-empty">
              {emptyParts()[0]}
              <b>{t("block.character")}</b>
              {emptyParts()[1] ?? ""}
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
            <div class="rail-stat-label">{t("rail.stat.runtime")}</div>
            <div class="rail-stat-val">{formatRuntime(runtimeSec())}</div>
          </div>
          <div>
            <div class="rail-stat-label">{t("rail.stat.words")}</div>
            <div class="rail-stat-val">{totalWords()}</div>
          </div>
          <div>
            <div class="rail-stat-label">{t("rail.stat.dialog")}</div>
            <div class="rail-stat-val">{totalDialog()}</div>
          </div>
        </div>
      </Show>

      <Show when={tab() === "versions"}>
        <div class="rail-versions-info">
          {t("rail.versions.info")}
        </div>
        <button
          type="button"
          class="rail-versions-open"
          onClick={props.onOpenSnapshots}
        >
          {t("rail.versions.open")}
        </button>
        <div class="rail-versions-hint">
          <span class="kbd kbd-inline">{K("Mod+Shift+S")}</span>{" "}{t("rail.versions.hintSave")} ·{" "}
          <span class="kbd kbd-inline">{K("Mod+Shift+H")}</span>{" "}{t("rail.versions.hintOpen")}
        </div>
      </Show>
    </aside>
  );
}
