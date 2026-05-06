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
  let menuRef: HTMLDivElement | undefined;

  const closeOnOutside = (e: MouseEvent) => {
    if (!menuRef) return;
    if (!menuRef.contains(e.target as Node)) setMenuOpen(false);
  };
  const closeOnEsc = (e: KeyboardEvent) => {
    if (e.key === "Escape") setMenuOpen(false);
  };

  onMount(() => {
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEsc);
    onCleanup(() => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEsc);
    });
  });

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
          class="titlebar-title"
          aria-expanded={menuOpen()}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((v) => !v)}
          title="Tab wechseln"
        >
          <span class="titlebar-title-text">{activeLabel()}</span>
          <span class="titlebar-caret" aria-hidden="true">⌄</span>
        </button>

        <Show when={menuOpen()}>
          <TabMenu onClose={() => setMenuOpen(false)} />
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

function TabMenu(props: { onClose: () => void }) {
  const select = (t: Tab) => {
    tabsStore.activate(t.id);
    props.onClose();
  };
  const close = (t: Tab, ev: MouseEvent) => {
    ev.stopPropagation();
    tabsStore.closeTab(t.id);
  };
  return (
    <div class="titlebar-menu" role="menu">
      <For each={tabsStore.tabs()}>
        {(t) => {
          const active = () => tabsStore.activeTabId() === t.id;
          const label = () =>
            t.kind === "browser" ? "Übersicht" : t.scriptTitle || "Unbenannt";
          const dot = () => (t.kind === "browser" ? "⌂" : "●");
          return (
            <div
              class="titlebar-menu-row"
              classList={{ "is-active": active() }}
              role="menuitem"
              onClick={() => select(t)}
            >
              <span class="titlebar-menu-dot" aria-hidden="true">{dot()}</span>
              <span class="titlebar-menu-label">{label()}</span>
              <button
                class="titlebar-menu-close"
                aria-label="Tab schließen"
                onClick={(ev) => close(t, ev)}
              >
                ×
              </button>
            </div>
          );
        }}
      </For>
    </div>
  );
}

export default TabBar;
