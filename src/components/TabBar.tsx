import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { tabsStore, type Tab } from "~/stores/tabs";

import "./TabBar.css";

import iconUrl from "~/assets/scriptz-icon.png";

/**
 * Top header (44px tall, drag region):
 *
 *   [traffic-lights gap]  [icon | ScriptZ]  ⏐  [ Active title ⌄ ]   [ + ]
 *
 * The centered button shows the currently focused tab's title and opens a
 * tab-list popover for switching/closing tabs. Single source of truth for
 * navigation chrome — there is no separate horizontal tab strip.
 */
export function TabBar() {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [menuIdx, setMenuIdx] = createSignal(0);
  let menuRef: HTMLDivElement | undefined;
  let menuListRef: HTMLDivElement | undefined;
  let triggerRef: HTMLButtonElement | undefined;

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
    const tabs = tabsStore.tabs();
    const activeIdx = tabs.findIndex((t) => t.id === tabsStore.activeTabId());
    setMenuIdx(activeIdx >= 0 ? activeIdx : 0);
    setMenuOpen(true);
    requestAnimationFrame(() => {
      menuListRef?.querySelector<HTMLElement>(".titlebar-menu-row.is-keyboard")?.focus();
    });
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

  const onMenuKey = (e: KeyboardEvent) => {
    const tabs = tabsStore.tabs();
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMenuIdx((i) => (i + 1) % tabs.length);
      focusKeyboardRow();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setMenuIdx((i) => (i - 1 + tabs.length) % tabs.length);
      focusKeyboardRow();
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setMenuIdx(0);
      focusKeyboardRow();
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setMenuIdx(tabs.length - 1);
      focusKeyboardRow();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const t = tabs[menuIdx()];
      if (t) {
        tabsStore.activate(t.id);
        closeMenu();
      }
    }
  };

  const focusKeyboardRow = () => {
    requestAnimationFrame(() => {
      menuListRef?.querySelector<HTMLElement>(".titlebar-menu-row.is-keyboard")?.focus();
    });
  };

  const activeLabel = () => {
    const t = tabsStore.active();
    if (!t) return "ScriptZ";
    if (t.kind === "browser") return "Übersicht";
    return t.scriptTitle || "Unbenannt";
  };

  return (
    <header class="titlebar" data-tauri-drag-region={true}>
      <div class="titlebar-brand">
        <img class="titlebar-logo" src={iconUrl} alt="ScriptZ" />
        <span class="titlebar-wordmark">ScriptZ</span>
      </div>

      <div class="titlebar-spacer" />

      <div class="titlebar-center" ref={menuRef}>
        <button
          ref={triggerRef}
          class="titlebar-title"
          aria-expanded={menuOpen()}
          aria-haspopup="menu"
          onClick={() => (menuOpen() ? closeMenu() : openMenu())}
          onKeyDown={onTriggerKey}
          title="Tab wechseln"
        >
          <span class="titlebar-title-text">{activeLabel()}</span>
          <span class="titlebar-caret" aria-hidden="true">⌄</span>
        </button>

        <Show when={menuOpen()}>
          <div
            class="titlebar-menu"
            role="menu"
            ref={menuListRef}
            onKeyDown={onMenuKey}
          >
            <For each={tabsStore.tabs()}>
              {(t, i) => {
                const active = () => tabsStore.activeTabId() === t.id;
                const keyboard = () => i() === menuIdx();
                const label = () =>
                  t.kind === "browser" ? "Übersicht" : t.scriptTitle || "Unbenannt";
                const dot = () => (t.kind === "browser" ? "⌂" : "●");
                return (
                  <div
                    class="titlebar-menu-row"
                    classList={{
                      "is-active": active(),
                      "is-keyboard": keyboard(),
                    }}
                    role="menuitem"
                    tabIndex={keyboard() ? 0 : -1}
                    onMouseEnter={() => setMenuIdx(i())}
                    onClick={() => {
                      tabsStore.activate(t.id);
                      closeMenu();
                    }}
                  >
                    <span class="titlebar-menu-dot" aria-hidden="true">{dot()}</span>
                    <span class="titlebar-menu-label">{label()}</span>
                    <button
                      class="titlebar-menu-close"
                      aria-label="Tab schließen"
                      tabIndex={-1}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        tabsStore.closeTab(t.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>

      <div class="titlebar-spacer" />

      <div class="titlebar-trailing">
        <button
          class="titlebar-action"
          aria-label="Neuer Tab"
          title="Neuer Tab (⌘T)"
          onClick={() => tabsStore.openBrowser()}
        >
          +
        </button>
      </div>
    </header>
  );
}

export default TabBar;
