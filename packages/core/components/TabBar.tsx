import { For, Show } from "solid-js";
import { tabsStore } from "../stores/tabs";
import { dailyStatsStore } from "../stores/dailyStats";
import { settingsStore } from "../stores/settings";
import { ideasStore } from "../stores/ideas";
import { K } from "../lib/keys";
import { t, tPlural } from "../i18n";

import "./TabBar.css";

export interface TabBarProps {
  onNewScript?: () => void;
  onOpenSettings?: () => void;
}

export function TabBar(props: TabBarProps) {
  return (
    <header class="titlebar" data-tauri-drag-region>
      <div class="titlebar-traffic" data-tauri-drag-region aria-hidden="true" />

      <div class="tabs" data-tauri-drag-region>
        <button
          class="tab tab-home"
          classList={{ "is-active": tabsStore.isHome() }}
          onClick={() => tabsStore.openBrowser()}
          title={t("tabBar.home.title")}
          type="button"
        >
          <span class="tab-home-ic"><HomeIcon /></span>
        </button>

        <button
          class="tab tab-ideas"
          classList={{ "is-active": tabsStore.isIdeas() }}
          onClick={() => tabsStore.openIdeas()}
          title={t("tabBar.ideas.title")}
          aria-label={t("tabBar.ideas.aria")}
          type="button"
        >
          <span class="tab-ideas-ic"><BulbIcon /></span>
          <IdeasBadge />
        </button>

        <For each={tabsStore.tabs()}>
          {(tab) => (
            <div
              class="tab"
              role="button"
              tabindex={0}
              classList={{
                "is-active": tabsStore.activeTabId() === tab.id,
              }}
              onClick={() => tabsStore.activate(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  tabsStore.activate(tab.id);
                }
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  tabsStore.closeTab(tab.id);
                }
              }}
              title={tab.scriptTitle}
              aria-label={tab.scriptTitle || t("common.untitled")}
            >
              <span class="tab-doc"><DocIcon /></span>
              <span class="tab-title">{tab.scriptTitle || t("common.untitled")}</span>
              <button
                type="button"
                class="tab-x"
                aria-label={t("tabBar.closeTab.aria")}
                title={t("tabBar.closeTab.title")}
                onClick={(e) => {
                  e.stopPropagation();
                  tabsStore.closeTab(tab.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
                }}
              >
                <CloseIcon />
              </button>
            </div>
          )}
        </For>

        <button
          class="tab-new"
          title={t("tabBar.newScript.title", { hotkey: K("Mod+N") })}
          aria-label={t("tabBar.newScript.aria")}
          onClick={() => props.onNewScript?.()}
          type="button"
        >
          <PlusIcon />
        </button>
      </div>

      <StatusStrip />

      <button
        type="button"
        class="titlebar-gear"
        onClick={() => props.onOpenSettings?.()}
        title={t("tabBar.settings.title", { hotkey: K("Mod+,") })}
        aria-label={t("tabBar.settings.aria")}
      >
        <GearIcon />
      </button>
    </header>
  );
}

function StatusStrip() {
  const stats = () => dailyStatsStore.stats();
  const goal = () => settingsStore.weeklyWordGoal();
  const wordsThisWeek = () => stats().wordsThisWeek;
  const streak = () => stats().streakDays;
  const goalMet = () => wordsThisWeek() >= goal();
  return (
    <div class="status-strip" data-tauri-drag-region>
      <span
        class="status-cell"
        title={t("status.weekWords.title", { goal: goal() })}
      >
        <strong classList={{ "is-met": goalMet() }}>{wordsThisWeek()}</strong>
        <span class="status-cell-label">{t("status.weekWords.unit")}</span>
      </span>
      <span class="status-cell-divider" aria-hidden="true" />
      <span class="status-cell" title={t("status.streak.title")}>
        <span class="status-flame"><SparkleIcon /></span>
        <strong>{streak()}</strong>
        <span class="status-cell-label">{tPlural("units.days", streak())}</span>
      </span>
      <span class="status-cell-divider" aria-hidden="true" />
      <span class="status-cell" title={t("status.saved.title")}>
        <span class="status-dot status-dot-ok" aria-hidden="true" />
        <span class="status-cell-label">{t("status.saved.label")}</span>
      </span>
    </div>
  );
}

/* ---- Icons (Lucide-style, stroke 1.75) ---- */

function BulbIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
    </svg>
  );
}

function IdeasBadge() {
  const openCount = () =>
    (ideasStore.ideas() ?? []).filter((i) => !i.used_at).length;
  return (
    <Show when={settingsStore.showIdeasBadge() && openCount() > 0}>
      <span class="tab-ideas-badge">{openCount()}</span>
    </Show>
  );
}

function HomeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 9.5L12 3l9 6.5" />
      <path d="M5 9v11a1 1 0 0 0 1 1h4v-7h4v7h4a1 1 0 0 0 1-1V9" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5 10.1 7.6z" />
    </svg>
  );
}

export default TabBar;
