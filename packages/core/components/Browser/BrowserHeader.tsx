import { Show } from "solid-js";
import type { ScriptSummary } from "../../lib/types";
import { settingsStore } from "../../stores/settings";
import { K } from "../../lib/keys";
import { t } from "../../i18n";
import { MomentumStrip } from "./MomentumStrip";
import {
  SearchIcon,
  ListIcon,
  GridIcon,
  ImportIcon,
  TrashIcon,
} from "./BrowserIcons";

export type ViewMode = "grid" | "list";

/** Time-of-day-dependent greeting. Deliberately does NOT use a
 *  first name (no onboarding with name prompt). */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return t("greeting.lateNight");
  if (h < 11) return t("greeting.morning");
  if (h < 14) return t("greeting.noon");
  if (h < 18) return t("greeting.day");
  if (h < 22) return t("greeting.evening");
  return t("greeting.lateHour");
}

export interface BrowserHeaderProps {
  searchInput: string;
  onSearchInput: (v: string) => void;
  searchInputRef: (el: HTMLInputElement) => void;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  isTrashActive: boolean;
  onToggleTrash: () => void;
  onImport: () => void;
  onNewScript: () => void;
  onOpenCmdK?: () => void;
  /** Newest script for the MomentumStrip "continue writing" tile. */
  lastScript: ScriptSummary | null;
  onContinueScript: (s: ScriptSummary) => void;
}

/** Browser header — greeting, optional MomentumStrip, and the row
 *  with search · view toggle · import · trash · "+ New" button. */
export function BrowserHeader(props: BrowserHeaderProps) {
  return (
    <div class="home-header">
      <div class="home-greet">
        <h1 class="home-greet-h">{greeting()}.</h1>
        <p class="home-greet-sub">{t("greeting.sub")}</p>
      </div>

      <Show when={settingsStore.showWritingStats()}>
        <MomentumStrip
          lastScript={props.lastScript}
          onContinue={props.onContinueScript}
        />
      </Show>

      <div class="home-header-row">
        <label class="home-search">
          <span class="home-search-ic" aria-hidden="true"><SearchIcon /></span>
          <input
            ref={props.searchInputRef}
            type="search"
            placeholder={t("browser.search.placeholder")}
            value={props.searchInput}
            onInput={(e) => props.onSearchInput(e.currentTarget.value)}
            spellcheck={false}
            autocomplete="off"
          />
          <button
            class="home-search-kbd"
            title={t("browser.commands.title", { hotkey: K("Mod+K") })}
            onClick={(e) => {
              e.preventDefault();
              props.onOpenCmdK?.();
            }}
          >
            {K("Mod+K")}
          </button>
        </label>

        <div class="viewseg" role="group" aria-label={t("browser.view")}>
          <button
            type="button"
            classList={{ "is-on": props.viewMode === "list" }}
            onClick={() => props.onViewMode("list")}
            title={t("browser.view.list")}
            aria-label={t("browser.view.list")}
          >
            <ListIcon />
          </button>
          <button
            type="button"
            classList={{ "is-on": props.viewMode === "grid" }}
            onClick={() => props.onViewMode("grid")}
            title={t("browser.view.grid")}
            aria-label={t("browser.view.grid")}
          >
            <GridIcon />
          </button>
        </div>

        <button
          class="icon-btn"
          onClick={props.onImport}
          title={t("browser.import.title")}
          aria-label={t("browser.import.aria")}
          type="button"
        >
          <ImportIcon />
        </button>

        <button
          class="icon-btn"
          classList={{ "is-active": props.isTrashActive }}
          onClick={props.onToggleTrash}
          title={t("browser.trash")}
          aria-label={t("browser.trash")}
          type="button"
        >
          <TrashIcon />
        </button>

        <button
          class="btn btn-primary home-new"
          onClick={props.onNewScript}
          type="button"
        >
          <span class="home-new-plus" aria-hidden="true">+</span>
          <span>{t("browser.new")}</span>
        </button>
      </div>
    </div>
  );
}
