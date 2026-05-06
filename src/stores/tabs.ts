import { createSignal } from "solid-js";
import { api } from "~/lib/api";

export type TabKind = "browser" | "script";

export interface Tab {
  id: string;
  kind: TabKind;
  scriptId?: string;
  scriptTitle?: string;
}

const [tabs, setTabs] = createSignal<Tab[]>([]);
const [activeTabId, setActiveTabId] = createSignal<string | null>(null);
let nextId = 1;

const KEY = "open_tabs";

function genId() {
  return `t_${Date.now().toString(36)}_${nextId++}`;
}

export const tabsStore = {
  tabs,
  activeTabId,
  active: () => tabs().find((t) => t.id === activeTabId()),
  /**
   * Activate the existing browser tab if there is one; otherwise create
   * a new one. Pressing Cmd+T or the + button repeatedly should focus
   * the same overview, not pile up duplicates.
   */
  openBrowser(): Tab {
    const existing = tabs().find((t) => t.kind === "browser");
    if (existing) {
      setActiveTabId(existing.id);
      persist();
      return existing;
    }
    const t: Tab = { id: genId(), kind: "browser" };
    setTabs([...tabs(), t]);
    setActiveTabId(t.id);
    persist();
    return t;
  },
  openScript(scriptId: string, scriptTitle: string, opts: { newTab?: boolean } = {}): Tab {
    const existing = tabs().find((t) => t.kind === "script" && t.scriptId === scriptId);
    if (existing) {
      setActiveTabId(existing.id);
      persist();
      return existing;
    }
    const cur = tabs().find((t) => t.id === activeTabId());
    if (!opts.newTab && cur && cur.kind === "browser") {
      // Replace browser tab with script tab
      const updated: Tab = { id: cur.id, kind: "script", scriptId, scriptTitle };
      setTabs(tabs().map((t) => (t.id === cur.id ? updated : t)));
      setActiveTabId(updated.id);
      persist();
      return updated;
    }
    const t: Tab = { id: genId(), kind: "script", scriptId, scriptTitle };
    setTabs([...tabs(), t]);
    setActiveTabId(t.id);
    persist();
    return t;
  },
  setScriptTitle(scriptId: string, title: string) {
    let changed = false;
    const next = tabs().map((t) => {
      if (t.kind === "script" && t.scriptId === scriptId && t.scriptTitle !== title) {
        changed = true;
        return { ...t, scriptTitle: title };
      }
      return t;
    });
    if (changed) {
      setTabs(next);
      persist();
    }
  },
  closeTab(id: string) {
    const next = tabs().filter((t) => t.id !== id);
    if (next.length === 0) {
      // Always keep at least one tab (browser) open.
      const fallback: Tab = { id: genId(), kind: "browser" };
      setTabs([fallback]);
      setActiveTabId(fallback.id);
      persist();
      return;
    }
    setTabs(next);
    if (activeTabId() === id) {
      setActiveTabId(next[next.length - 1].id);
    }
    persist();
  },
  activate(id: string) {
    setActiveTabId(id);
    persist();
  },
  cycle(dir: 1 | -1) {
    const list = tabs();
    if (list.length === 0) return;
    const idx = list.findIndex((t) => t.id === activeTabId());
    const nextIdx = (idx + dir + list.length) % list.length;
    setActiveTabId(list[nextIdx].id);
    persist();
  },
  activateByIndex(idx: number) {
    const list = tabs();
    if (idx >= 0 && idx < list.length) {
      setActiveTabId(list[idx].id);
      persist();
    }
  },
  async load() {
    const raw = await api.getAppState(KEY);
    if (!raw) {
      this.openBrowser();
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { tabs: Tab[]; activeId: string | null };
      // Verify scripts still exist
      const scriptIds = parsed.tabs.filter((t) => t.kind === "script").map((t) => t.scriptId!);
      const stillExisting = new Set<string>();
      for (const id of scriptIds) {
        try {
          const s = await api.getScript(id);
          stillExisting.add(s.id);
        } catch {
          /* deleted */
        }
      }
      const filtered: Tab[] = parsed.tabs.filter(
        (t) => t.kind === "browser" || stillExisting.has(t.scriptId!),
      );
      if (filtered.length === 0) {
        this.openBrowser();
        return;
      }
      setTabs(filtered);
      const activeOk = filtered.find((t) => t.id === parsed.activeId);
      setActiveTabId(activeOk ? parsed.activeId : filtered[0].id);
    } catch {
      this.openBrowser();
    }
  },
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void api.setAppState(
      KEY,
      JSON.stringify({ tabs: tabs(), activeId: activeTabId() }),
    );
  }, 80);
}
