import { createSignal } from "solid-js";
import { api } from "../lib/api";
import { flushAll, registerFlusher } from "../lib/saveFlush";
import { t } from "../i18n";

/**
 * Tabs store — Chrome-style tab list.
 *
 * Important: the **home tab** is NOT an element of the `tabs()` list
 * anymore — it is an implicit anchor to the left of the tab row.
 * `route()` is either `"home"` (home tab active) or `"script"` with one
 * of the opened script tabs as the active tab. All script tabs live in
 * `tabs()`. This keeps the list slimmer, the "can I close home?"
 * edge case disappears, and Cmd+W on home does nothing (instead of
 * creating a new browser tab).
 */

export interface ScriptTab {
  id: string;
  scriptId: string;
  scriptTitle: string;
}

type Route =
  | { kind: "home" }
  | { kind: "ideas" }
  | { kind: "script"; tabId: string };

const [tabs, setTabs] = createSignal<ScriptTab[]>([]);
const [route, setRoute] = createSignal<Route>({ kind: "home" });
let nextId = 1;

const KEY = "open_tabs";

function genId() {
  return `t_${Date.now().toString(36)}_${nextId++}`;
}

function activeScriptTab(): ScriptTab | null {
  const r = route();
  if (r.kind !== "script") return null;
  return tabs().find((t) => t.id === r.tabId) ?? null;
}

/** Before every route change, drain all pending saves (editor auto-save,
 *  tab state persist), THEN navigate. Prevents the "editor is torn
 *  down while async persist() is still running" race, where empty state
 *  could be written over real content (see the safety net
 *  in Editor.tsx::persist()). Side effect: navigation runs in
 *  the next microtask, which keeps the Solid reactive updates out of
 *  the click event frame — clean separation. */
function deferRouteChange(apply: () => void): void {
  void flushAll(2000).finally(() => apply());
}

export const tabsStore = {
  tabs,
  route,
  /** True when the home tab is currently active. */
  isHome: () => route().kind === "home",
  /** True when the ideas tab is currently active. */
  isIdeas: () => route().kind === "ideas",
  /** Active script tab, or null when home is active. */
  activeScript: activeScriptTab,
  /** Legacy API — components still read `tabsStore.active()` and get
   *  a unified tab object with `kind`. Allows gradual
   *  migration. */
  active(): { kind: "browser" } | { kind: "ideas" } | { kind: "script"; scriptId: string; scriptTitle: string } | null {
    const r = route();
    if (r.kind === "home") return { kind: "browser" };
    if (r.kind === "ideas") return { kind: "ideas" };
    const t = tabs().find((x) => x.id === r.tabId);
    if (!t) return { kind: "browser" };
    return { kind: "script", scriptId: t.scriptId, scriptTitle: t.scriptTitle };
  },
  activeTabId(): string | null {
    const r = route();
    return r.kind === "script" ? r.tabId : null;
  },

  /** Activate home. Always possible, no tab is created. */
  openBrowser() {
    deferRouteChange(() => {
      setRoute({ kind: "home" });
      persist();
    });
  },
  /** Activate the ideas tab. Always possible, no tab is created. */
  openIdeas() {
    deferRouteChange(() => {
      setRoute({ kind: "ideas" });
      persist();
    });
  },
  /** Open script. If it already exists as a tab → activate. Otherwise create
   *  a new tab. The existing-tab path is also deferred (same
   *  recursion trap as openBrowser, in case you switch from script A → script B).
   *  The new-tab path creates the tab synchronously so the
   *  caller has the ScriptTab id immediately; route activation runs
   *  in the microtask. */
  openScript(scriptId: string, scriptTitle: string, opts: { newTab?: boolean } = {}): ScriptTab {
    const _ = opts; // newTab is always effectively-newTab for script tabs (home is not replaced)
    const existing = tabs().find((t) => t.scriptId === scriptId);
    if (existing) {
      // The title may have changed since opening (rename in another
      // tab). Sync instead of discarding.
      if (existing.scriptTitle !== scriptTitle) {
        setTabs(tabs().map((t) => (t.id === existing.id ? { ...t, scriptTitle } : t)));
      }
      deferRouteChange(() => {
        setRoute({ kind: "script", tabId: existing.id });
        persist();
      });
      return existing;
    }
    const t: ScriptTab = { id: genId(), scriptId, scriptTitle };
    setTabs([...tabs(), t]);
    deferRouteChange(() => {
      setRoute({ kind: "script", tabId: t.id });
      persist();
    });
    return t;
  },
  setScriptTitle(scriptId: string, title: string) {
    let changed = false;
    const next = tabs().map((t) => {
      if (t.scriptId === scriptId && t.scriptTitle !== title) {
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
    const list = tabs();
    const idx = list.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const next = list.filter((t) => t.id !== id);
    const r = route();
    const isActive = r.kind === "script" && r.tabId === id;
    if (isActive) {
      // Active tab closed → prefer the right neighbor,
      // otherwise the left one, otherwise home. Both `setTabs` and
      // `setRoute` need to run deferred: a synchronous `setTabs`
      // would still cause the ScriptView to dispose, because
      // `activeScript()` also reads `tabs()` and returns null
      // as soon as the tab is missing — exactly the same recursion trap
      // as a direct `setRoute`.
      const fallback = next[idx] ?? next[idx - 1] ?? null;
      deferRouteChange(() => {
        setTabs(next);
        setRoute(fallback ? { kind: "script", tabId: fallback.id } : { kind: "home" });
        persist();
      });
    } else {
      setTabs(next);
      persist();
    }
  },
  activate(id: string) {
    const exists = tabs().find((t) => t.id === id);
    if (!exists) return;
    deferRouteChange(() => {
      setRoute({ kind: "script", tabId: id });
      persist();
    });
  },
  /** ⌘⌥← / ⌘⌥→ — order: home (0), ideas (1), script tabs (2..N+1).
   *  Mirrors the visual layout in the tab bar. */
  cycle(dir: 1 | -1) {
    const list = tabs();
    const all = list.length + 2; // +2 for home and ideas
    const r = route();
    const cur =
      r.kind === "home"
        ? 0
        : r.kind === "ideas"
          ? 1
          : list.findIndex((t) => t.id === r.tabId) + 2;
    if (cur < 0) return;
    const nextIdx = (cur + dir + all) % all;
    deferRouteChange(() => {
      if (nextIdx === 0) setRoute({ kind: "home" });
      else if (nextIdx === 1) setRoute({ kind: "ideas" });
      else setRoute({ kind: "script", tabId: list[nextIdx - 2].id });
      persist();
    });
  },
  /** ⌘1..⌘9 — index 0 = home, 1..N = script tabs. */
  activateByIndex(idx: number) {
    if (idx === 0) {
      deferRouteChange(() => {
        setRoute({ kind: "home" });
        persist();
      });
      return;
    }
    const list = tabs();
    const t = list[idx - 1];
    if (t) {
      deferRouteChange(() => {
        setRoute({ kind: "script", tabId: t.id });
        persist();
      });
    }
  },
  async load() {
    const raw = await api.getAppState(KEY);
    if (!raw) {
      setRoute({ kind: "home" });
      return;
    }
    try {
      // Backwards-compat: old persistence stored `tabs: Tab[]` with
      // `kind: "browser" | "script"`. Filter to script entries.
      const parsed = JSON.parse(raw) as {
        tabs: Array<{ id?: string; kind?: string; scriptId?: string; scriptTitle?: string }>;
        activeId?: string | null;
        route?: Route;
      };
      const scriptEntries = (parsed.tabs ?? [])
        .filter((t) => t && (t.kind === "script" || (t.kind === undefined && t.scriptId)))
        .filter((t): t is { id?: string; scriptId: string; scriptTitle?: string } => !!t.scriptId);
      // Verify scripts still exist.
      const scriptIds = new Set(scriptEntries.map((t) => t.scriptId));
      let stillExisting = new Set<string>();
      if (scriptIds.size > 0) {
        try {
          const all = await api.listScripts({ includeArchived: true });
          stillExisting = new Set(all.map((s) => s.id));
        } catch {
          stillExisting = scriptIds;
        }
      }
      const filtered: ScriptTab[] = scriptEntries
        .filter((tab) => stillExisting.has(tab.scriptId))
        .map((tab) => ({
          id: tab.id ?? genId(),
          scriptId: tab.scriptId,
          scriptTitle: tab.scriptTitle ?? t("common.untitled"),
        }));
      setTabs(filtered);

      // Restore route — new form (route) preferred, otherwise derived
      // from legacy `activeId`.
      const r = parsed.route;
      if (r && r.kind === "script" && filtered.find((t) => t.id === r.tabId)) {
        setRoute(r);
      } else if (r && r.kind === "home") {
        setRoute({ kind: "home" });
      } else if (r && r.kind === "ideas") {
        setRoute({ kind: "ideas" });
      } else if (parsed.activeId) {
        const match = filtered.find((t) => t.id === parsed.activeId);
        setRoute(match ? { kind: "script", tabId: match.id } : { kind: "home" });
      } else {
        setRoute({ kind: "home" });
      }
    } catch {
      setRoute({ kind: "home" });
    }
  },
  /** Drop tabs whose scriptId is not in the given set. */
  reconcile(liveScriptIds: Set<string>) {
    const all = tabs();
    const survivors = all.filter((t) => liveScriptIds.has(t.scriptId));
    if (survivors.length === all.length) return;
    setTabs(survivors);
    const r = route();
    if (r.kind === "script" && !survivors.find((t) => t.id === r.tabId)) {
      // Active tab got reconciled away → home, but deferred so
      // the reactive cascade from `setTabs(survivors)` above gets to
      // settle before we flip the route.
      deferRouteChange(() => {
        setRoute({ kind: "home" });
        persist();
      });
    } else {
      persist();
    }
  },
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistInflight: Promise<void> | null = null;

function writeNow(): Promise<void> {
  const r = route();
  const payload = JSON.stringify({
    tabs: tabs().map((t) => ({ ...t, kind: "script" })),
    route: r,
    activeId: r.kind === "script" ? r.tabId : null,
  });
  const p = api.setAppState(KEY, payload).catch(() => {});
  persistInflight = p.finally(() => {
    if (persistInflight === p) persistInflight = null;
  });
  return persistInflight;
}

function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void writeNow();
  }, 80);
}

registerFlusher(async () => {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
    await writeNow();
    return;
  }
  if (persistInflight) await persistInflight;
});
