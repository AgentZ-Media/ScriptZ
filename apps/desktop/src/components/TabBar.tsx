import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { tabsStore } from "~/stores/tabs";
import { api } from "~/lib/api";
import { scriptsBus } from "~/lib/scriptsBus";
import { relativeTime } from "~/lib/format";
import type { ScriptSummary } from "~/lib/types";

import "./TabBar.css";

import iconUrl from "~/assets/scriptz-icon.png";

const RECENT_LIMIT = 8;

export interface TabBarProps {
  onOpenSettings?: () => void;
  onOpenExport?: () => void;
  onToggleHighlight?: () => void;
  highlightOn?: () => boolean;
}

/**
 * Top header (44px, drag region):
 *
 *   [traffic-lights gap]  [icon | ScriptZ]   [ Active title ⌄ ]   [ ⤓ ⚙ ]
 *
 * The centered button shows the currently focused tab's title and opens
 * a "quick switcher" popover: a search field plus the most recently
 * edited scripts (live from the DB, refetched whenever scriptsBus bumps).
 * Trailing actions: export (only while a script is active),
 * settings (always).
 */
export function TabBar(props: TabBarProps) {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [menuIdx, setMenuIdx] = createSignal(0);
  const [search, setSearch] = createSignal("");
  let menuRef: HTMLDivElement | undefined;
  let searchRef: HTMLInputElement | undefined;
  let triggerRef: HTMLButtonElement | undefined;

  // Refetch the recent-scripts list whenever the dropdown opens AND
  // whenever anything mutates the script list (archive / purge / rename …).
  const [recents] = createResource(
    () => ({ open: menuOpen(), version: scriptsBus.version() }),
    async ({ open }) => {
      if (!open) return [] as ScriptSummary[];
      try {
        return await api.listScripts({ sort: "updated", limit: 50 });
      } catch {
        return [] as ScriptSummary[];
      }
    },
    { initialValue: [] },
  );

  const filtered = createMemo<ScriptSummary[]>(() => {
    const q = search().trim().toLowerCase();
    const list = recents() ?? [];
    if (!q) return list.slice(0, RECENT_LIMIT);
    return list
      .filter((s) => s.title.toLowerCase().includes(q))
      .slice(0, RECENT_LIMIT);
  });

  const openScriptIds = createMemo(
    () =>
      new Set(
        tabsStore
          .tabs()
          .filter((t) => t.kind === "script" && t.scriptId)
          .map((t) => t.scriptId!),
      ),
  );
  const tabIdForScript = (scriptId: string) =>
    tabsStore.tabs().find((t) => t.kind === "script" && t.scriptId === scriptId)?.id;

  const closeOnOutside = (e: MouseEvent) => {
    if (!menuRef) return;
    if (!menuRef.contains(e.target as Node)) setMenuOpen(false);
  };

  onMount(() => {
    document.addEventListener("mousedown", closeOnOutside);
    onCleanup(() => {
      document.removeEventListener("mousedown", closeOnOutside);
    });
  });

  const openMenu = () => {
    setMenuIdx(0);
    setSearch("");
    setMenuOpen(true);
    requestAnimationFrame(() => searchRef?.focus());
  };
  const closeMenu = () => {
    setMenuOpen(false);
    triggerRef?.focus();
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      menuOpen() ? closeMenu() : openMenu();
    }
  };

  const activate = (s: ScriptSummary) => {
    tabsStore.openScript(s.id, s.title);
    closeMenu();
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const list = filtered();
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (list.length === 0) return;
      setMenuIdx((i) => (i + 1) % list.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (list.length === 0) return;
      setMenuIdx((i) => (i - 1 + list.length) % list.length);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setMenuIdx(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setMenuIdx(Math.max(0, list.length - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const s = list[menuIdx()];
      if (s) activate(s);
    }
  };

  const activeLabel = () => {
    const t = tabsStore.active();
    if (!t) return "ScriptZ";
    if (t.kind === "browser") return "Übersicht";
    return t.scriptTitle || "Unbenannt";
  };

  const showCenterPill = () => {
    const t = tabsStore.active();
    return !!t && t.kind === "script";
  };

  return (
    <header class="titlebar" data-tauri-drag-region={true}>
      <button
        class="titlebar-brand"
        type="button"
        aria-label="Übersicht öffnen"
        title="Übersicht"
        onClick={() => tabsStore.openBrowser()}
      >
        <img class="titlebar-logo" src={iconUrl} alt="" />
        <span class="titlebar-wordmark">ScriptZ</span>
      </button>

      <Show when={showCenterPill()}>
        <div class="titlebar-center" ref={menuRef}>
          <button
            ref={triggerRef}
            class="titlebar-title"
            aria-expanded={menuOpen()}
            aria-haspopup="menu"
            onClick={() => (menuOpen() ? closeMenu() : openMenu())}
            onKeyDown={onTriggerKey}
            title="Skript wechseln"
          >
            <span class="titlebar-title-text">{activeLabel()}</span>
            <span class="titlebar-caret" aria-hidden="true">⌄</span>
          </button>

          <Show when={menuOpen()}>
            <div class="titlebar-menu" role="menu" onKeyDown={onMenuKey}>
              <div class="titlebar-menu-search">
                <input
                  ref={searchRef}
                  type="search"
                  class="titlebar-menu-search-input"
                  placeholder="Skripte durchsuchen…"
                  value={search()}
                  onInput={(e) => {
                    setSearch(e.currentTarget.value);
                    setMenuIdx(0);
                  }}
                  spellcheck={false}
                  autocomplete="off"
                />
              </div>

              <div class="titlebar-menu-list">
                <Show
                  when={filtered().length > 0}
                  fallback={
                    <div class="titlebar-menu-empty">
                      <Show
                        when={search().trim()}
                        fallback={"Keine Skripte vorhanden."}
                      >
                        Keine Treffer.
                      </Show>
                    </div>
                  }
                >
                  <For each={filtered()}>
                    {(s, i) => {
                      const isOpen = () => openScriptIds().has(s.id);
                      const keyboard = () => i() === menuIdx();
                      return (
                        <div
                          class="titlebar-menu-row"
                          classList={{
                            "is-keyboard": keyboard(),
                            "is-active":
                              tabsStore.active()?.kind === "script" &&
                              tabsStore.active()?.scriptId === s.id,
                          }}
                          role="menuitem"
                          tabIndex={-1}
                          onMouseEnter={() => setMenuIdx(i())}
                          onClick={() => activate(s)}
                        >
                          <span
                            class="titlebar-menu-dot"
                            aria-hidden="true"
                            classList={{ "is-open": isOpen() }}
                          >
                            ●
                          </span>
                          <span class="titlebar-menu-label">
                            {s.title || "Unbenannt"}
                          </span>
                          <span class="titlebar-menu-time">
                            {relativeTime(s.updated_at)}
                          </span>
                          <Show when={isOpen()}>
                            <button
                              class="titlebar-menu-close"
                              aria-label="Tab schließen"
                              tabIndex={-1}
                              title="Tab schließen"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                const tabId = tabIdForScript(s.id);
                                if (tabId) tabsStore.closeTab(tabId);
                              }}
                            >
                              ×
                            </button>
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      <div class="titlebar-trailing">
        <Show when={showCenterPill()}>
          <button
            class="titlebar-action"
            classList={{ "is-on": !!props.highlightOn?.() }}
            aria-label="Charakter-Highlighting umschalten"
            aria-pressed={!!props.highlightOn?.()}
            title={
              props.highlightOn?.()
                ? "Charakter-Highlighting aus"
                : "Charakter-Highlighting an"
            }
            onClick={() => props.onToggleHighlight?.()}
          >
            <HighlightIcon />
          </button>
          <button
            class="titlebar-action"
            aria-label="Exportieren"
            title="Exportieren (⌘E)"
            onClick={() => props.onOpenExport?.()}
          >
            <ExportIcon />
          </button>
        </Show>
        <button
          class="titlebar-action"
          aria-label="Einstellungen"
          title="Einstellungen (⌘,)"
          onClick={() => props.onOpenSettings?.()}
        >
          <GearIcon />
        </button>
      </div>
    </header>
  );
}

function HighlightIcon() {
  // Three small filled circles in three palette accents — communicates
  // "character highlighting" at a glance without needing text.
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="12" r="3.2" fill="#e0791f" />
      <circle cx="12" cy="12" r="3.2" fill="#3a8ed4" />
      <circle cx="18" cy="12" r="3.2" fill="#7a4ad4" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 4v12" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 19h14" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default TabBar;
