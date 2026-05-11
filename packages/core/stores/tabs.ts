import { createSignal } from "solid-js";
import { api } from "../lib/api";
import { flushAll, registerFlusher } from "../lib/saveFlush";

/**
 * Tabs store — Chrome-style tab list.
 *
 * Wichtig: der **Home-Tab** ist KEIN Element der `tabs()`-Liste mehr —
 * er ist ein impliziter Anchor links der Tab-Reihe. `route()` ist
 * entweder `"home"` (Home-Tab aktiv) oder `"script"` mit einer der
 * geöffneten Skript-Tabs als aktivem Tab. Alle Skript-Tabs liegen in
 * `tabs()`. Damit ist die Liste schmaler, der "kann ich Home schließen?"-
 * Edge-Case verschwindet, und Cmd+W auf Home tut nichts (statt einen
 * neuen Browser-Tab zu erzeugen).
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

/** Vor jedem Route-Wechsel alle pending Saves drainen (Editor-Auto-Save,
 *  Tab-State-Persist), DANN navigieren. Verhindert das "Editor wird torn
 *  down während async persist() noch läuft"-Race, bei dem leerer State
 *  über echten Content geschrieben werden könnte (siehe das Sicherheitsnetz
 *  in Editor.tsx::persist()). Effekt-Nebeneffekt: die Navigation läuft im
 *  nächsten Microtask, was die Solid-Reactive-Updates aus dem
 *  Click-Event-Frame heraushält — saubere Trennung. */
function deferRouteChange(apply: () => void): void {
  void flushAll(2000).finally(() => apply());
}

export const tabsStore = {
  tabs,
  route,
  /** True wenn der Home-Tab gerade aktiv ist. */
  isHome: () => route().kind === "home",
  /** True wenn der Ideen-Tab gerade aktiv ist. */
  isIdeas: () => route().kind === "ideas",
  /** Aktiver Skript-Tab oder null wenn Home aktiv ist. */
  activeScript: activeScriptTab,
  /** Legacy-API — Komponenten lesen `tabsStore.active()` weiter und kriegen
   *  ein vereinheitlichtes Tab-Objekt mit `kind`. Erlaubt schrittweise
   *  Migration. */
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

  /** Home aktivieren. Ist immer möglich, kein Tab wird angelegt. */
  openBrowser() {
    deferRouteChange(() => {
      setRoute({ kind: "home" });
      persist();
    });
  },
  /** Ideen-Tab aktivieren. Ist immer möglich, kein Tab wird angelegt. */
  openIdeas() {
    deferRouteChange(() => {
      setRoute({ kind: "ideas" });
      persist();
    });
  },
  /** Skript öffnen. Existiert es schon als Tab → aktivieren. Sonst neuen
   *  Tab anlegen. Existing-Tab-Pfad wird ebenfalls deferred (gleiche
   *  Recursion-Falle wie openBrowser, falls man von Skript A → Skript B
   *  wechselt). Neue-Tab-Pfad legt den Tab synchron an, damit der
   *  Caller die ScriptTab-ID sofort hat; die Route-Aktivierung läuft
   *  im Microtask. */
  openScript(scriptId: string, scriptTitle: string, opts: { newTab?: boolean } = {}): ScriptTab {
    const _ = opts; // newTab ist immer effektiv-newTab für Skript-Tabs (Home wird nicht ersetzt)
    const existing = tabs().find((t) => t.scriptId === scriptId);
    if (existing) {
      // Titel kann sich seit dem Öffnen geändert haben (Rename in einem
      // anderen Tab). Synchronisieren statt verwerfen.
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
      // Aktiver Tab geschlossen → bevorzugt den rechten Nachbarn,
      // sonst den linken, sonst Home. Sowohl `setTabs` als auch
      // `setRoute` müssen deferred laufen: ein synchrones `setTabs`
      // würde die ScriptView trotzdem disposen lassen, weil
      // `activeScript()` auch `tabs()` mitliest und null zurückgibt
      // sobald der Tab fehlt — also genau die gleiche Recursion-Falle
      // wie ein direktes `setRoute`.
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
  /** ⌘⌥← / ⌘⌥→ — Reihenfolge: Home (0), Ideen (1), Skript-Tabs (2..N+1).
   *  Spiegelt die visuelle Anordnung in der Tab-Bar. */
  cycle(dir: 1 | -1) {
    const list = tabs();
    const all = list.length + 2; // +2 für Home und Ideen
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
  /** ⌘1..⌘9 — index 0 = Home, 1..N = Skript-Tabs. */
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
      // Backwards-compat: alte Persistenz speicherte `tabs: Tab[]` mit
      // `kind: "browser" | "script"`. Filter auf Skript-Einträge.
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
        .filter((t) => stillExisting.has(t.scriptId))
        .map((t) => ({
          id: t.id ?? genId(),
          scriptId: t.scriptId,
          scriptTitle: t.scriptTitle ?? "Unbenannt",
        }));
      setTabs(filtered);

      // Route restaurieren — neue Form (route) bevorzugt, sonst aus
      // legacy `activeId` ableiten.
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
      // Aktiver Tab wurde wegreconciled → home, aber deferred, damit
      // der Reactive-Cascade von `setTabs(survivors)` oben sich erst
      // setzen darf, bevor wir die Route flippen.
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
