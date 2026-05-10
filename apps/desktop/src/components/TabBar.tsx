import { For, Show } from "solid-js";
import { tabsStore } from "~/stores/tabs";
import { dailyStatsStore } from "~/stores/dailyStats";
import { settingsStore } from "~/stores/settings";
import { ideasStore } from "~/stores/ideas";

import "./TabBar.css";

export interface TabBarProps {
  /** Wenn der "+" am Ende der Tab-Reihe geklickt wird. App.tsx öffnet
   *  daraufhin den NewScriptDialog (mit dem aktiven Folder vorausgewählt). */
  onNewScript?: () => void;
}

/**
 * Tab-Bar im Stil von Chrome — siehe Design `app-v3.jsx`:
 *
 *   [traffic-light Lücke]  [🏠] [Skript-Tab] [Skript-Tab] ... [+]   [W heute · Streak · Gespeichert]
 *
 * - Home-Tab ist FIX (40 px, nur Icon, niemals flex)
 * - Skript-Tabs teilen sich die Breite gleichmäßig (`flex: 1 1 0`),
 *   wachsen bis 200 px, schrumpfen bis 52 px
 * - Unter 80 px Tab-Breite verschwinden Titel + ✕ via `container-query`,
 *   nur das Doc-Icon bleibt — Hover zeigt den vollen Titel als `title`-Attribut
 * - "+" erzeugt ein neues Skript (öffnet den NewScriptDialog)
 * - Status-Strip ganz rechts (Wörter heute · Streak · Saved-Pille)
 *
 * Die alte zentrierte Title-Pille mit Quick-Switcher-Dropdown ist raus —
 * die Tab-Reihe ist jetzt selbst das primäre Wechsel-UI.
 */
export function TabBar(props: TabBarProps) {
  return (
    <header class="titlebar" data-tauri-drag-region>
      <div class="titlebar-traffic" data-tauri-drag-region aria-hidden="true" />

      <div class="tabs" data-tauri-drag-region>
        <button
          class="tab tab-home"
          classList={{ "is-active": tabsStore.isHome() }}
          onClick={() => tabsStore.openBrowser()}
          title="Übersicht"
          type="button"
        >
          <span class="tab-home-ic"><HomeIcon /></span>
        </button>

        <button
          class="tab tab-ideas"
          classList={{ "is-active": tabsStore.isIdeas() }}
          onClick={() => tabsStore.openIdeas()}
          title="Ideen"
          aria-label="Ideen"
          type="button"
        >
          <span class="tab-ideas-ic"><BulbIcon /></span>
          <IdeasBadge />
        </button>

        <For each={tabsStore.tabs()}>
          {(t) => (
            // Tab ist ein <div role="button"> statt <button>, damit der
            // echte Close-<button> als Kind nicht in einem nested-
            // interactive landet (button-in-button ist invalid HTML
            // und gibt Screen-Readern Mischsemantik).
            <div
              class="tab"
              role="button"
              tabindex={0}
              classList={{
                "is-active": tabsStore.activeTabId() === t.id,
              }}
              onClick={() => tabsStore.activate(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  tabsStore.activate(t.id);
                }
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  tabsStore.closeTab(t.id);
                }
              }}
              title={t.scriptTitle}
              aria-label={t.scriptTitle || "Unbenannt"}
            >
              <span class="tab-doc"><DocIcon /></span>
              <span class="tab-title">{t.scriptTitle || "Unbenannt"}</span>
              <button
                type="button"
                class="tab-x"
                aria-label="Tab schließen"
                title="Tab schließen"
                onClick={(e) => {
                  e.stopPropagation();
                  tabsStore.closeTab(t.id);
                }}
                onKeyDown={(e) => {
                  // Damit Enter/Space am Close-Button nicht zusätzlich
                  // den umgebenden Tab-Activate triggert.
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
          title="Neues Skript (⌘N)"
          aria-label="Neues Skript"
          onClick={() => props.onNewScript?.()}
          type="button"
        >
          <PlusIcon />
        </button>
      </div>

      <StatusStrip />
    </header>
  );
}

/** Schreib-Statistik-Pille rechts: Wörter heute · Streak · Gespeichert. */
function StatusStrip() {
  const stats = () => dailyStatsStore.stats();
  const goal = () => settingsStore.dailyWordGoal();
  const wordsToday = () => stats().wordsToday;
  const streak = () => stats().streakDays;
  const goalMet = () => wordsToday() >= goal();
  return (
    <div class="status-strip" data-tauri-drag-region>
      <span
        class="status-cell"
        title={`Heute geschrieben (Tagesziel: ${goal()} Wörter)`}
      >
        <strong classList={{ "is-met": goalMet() }}>{wordsToday()}</strong>
        <span class="status-cell-label">W heute</span>
      </span>
      <span class="status-cell-divider" aria-hidden="true" />
      <span class="status-cell" title="Aufeinanderfolgende Schreibtage">
        <span class="status-flame"><SparkleIcon /></span>
        <strong>{streak()}</strong>
        <span class="status-cell-label">{streak() === 1 ? "Tag" : "Tage"}</span>
      </span>
      <span class="status-cell-divider" aria-hidden="true" />
      <span class="status-cell" title="Lokal gespeichert, kein Konto, keine Cloud">
        <span class="status-dot status-dot-ok" aria-hidden="true" />
        <span class="status-cell-label">Gespeichert</span>
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

/** Kleine Pille rechts vom Glühbirnen-Icon, zeigt die Anzahl offener
 *  Ideen. Bewusst dezent — der Tab soll nicht ständig schreien. Bei 0
 *  offenen Ideen verschwindet das Badge. Über die Einstellung
 *  `showIdeasBadge` kann es ganz abgeschaltet werden (sinnvoll bei
 *  großen Idee-Sammlungen, wenn die Zahl nicht ständig nach Aufmerksam-
 *  keit schreien soll). */
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

function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5 10.1 7.6z" />
    </svg>
  );
}

export default TabBar;
