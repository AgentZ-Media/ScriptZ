import { For, Show, onMount, onCleanup } from "solid-js";
import { tabsStore, type Tab } from "~/stores/tabs";

import "./TabBar.css";

import iconUrl from "~/assets/scriptz-icon.png";

export function TabBar() {
  let stripRef: HTMLDivElement | undefined;

  // Tab bar is always visible (matches the screenshot look). Auto-hide kept
  // out for clarity — the strip is part of the chrome.
  return (
    <div class="tabbar" ref={stripRef} data-tauri-drag-region={true}>
      <div class="tabbar-brand">
        <img src={iconUrl} alt="ScriptZ" />
        <span>ScriptZ</span>
      </div>
      <div class="tabbar-tabs">
        <For each={tabsStore.tabs()}>
          {(tab) => <TabButton tab={tab} active={tabsStore.activeTabId() === tab.id} />}
        </For>
      </div>
      <div class="tabbar-trailing">
        <button
          class="tabbar-new"
          aria-label="Neuer Tab"
          title="Neuer Tab (⌘T)"
          onClick={() => tabsStore.openBrowser()}
        >
          +
        </button>
      </div>
    </div>
  );
}

function TabButton(props: { tab: Tab; active: boolean }) {
  const label = () => {
    if (props.tab.kind === "browser") return "Neuer Tab";
    return props.tab.scriptTitle || "Unbenannt";
  };
  return (
    <div
      class="tab"
      classList={{ active: props.active }}
      data-kind={props.tab.kind}
      onClick={() => tabsStore.activate(props.tab.id)}
      onMouseDown={(ev) => {
        if (ev.button === 1) {
          ev.preventDefault();
          tabsStore.closeTab(props.tab.id);
        }
      }}
    >
      <span class="tab-dot" />
      <Show when={props.tab.kind === "browser"}>
        <span class="tab-icon" aria-hidden="true">⌂</span>
      </Show>
      <span class="tab-label">{label()}</span>
      <button
        class="tab-close"
        aria-label="Tab schließen"
        onClick={(ev) => {
          ev.stopPropagation();
          tabsStore.closeTab(props.tab.id);
        }}
      >
        ×
      </button>
    </div>
  );
}

export default TabBar;
