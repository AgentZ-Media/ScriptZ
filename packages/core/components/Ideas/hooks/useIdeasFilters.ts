import { createMemo, createResource, createSignal } from "solid-js";
import { api } from "../../../lib/api";
import { ideasStore } from "../../../stores/ideas";
import { scriptsBus } from "../../../lib/scriptsBus";
import { localeCompare } from "../../../i18n";

export type IdeasFilter = "open" | "all" | "used";
export type IdeasSort = "newest" | "oldest" | "title";

/**
 * Encapsulates the filter/sort/search state of the Ideas view plus the
 * derived counts and script-title lookup. Lives next to IdeasView because
 * nothing else needs it; can move to /hooks later if reused.
 */
export function useIdeasFilters() {
  const [filter, setFilter] = createSignal<IdeasFilter>("open");
  const [sort, setSort] = createSignal<IdeasSort>("newest");
  const [query, setQuery] = createSignal("");

  const ideas = () => ideasStore.ideas() ?? [];

  const counts = createMemo(() => ({
    all: ideas().length,
    open: ideas().filter((i) => !i.used_at).length,
    used: ideas().filter((i) => i.used_at).length,
  }));

  const [scriptIndex] = createResource(
    () => scriptsBus.version(),
    async () => {
      try {
        const list = await api.listScripts({ limit: 500 });
        return new Map(list.map((s) => [s.id, s.title]));
      } catch {
        return new Map<string, string>();
      }
    },
    { initialValue: new Map<string, string>() },
  );

  const filtered = createMemo(() => {
    const f = filter();
    const q = query().trim().toLowerCase();
    const list = ideas().filter((i) => {
      if (f === "open" && i.used_at) return false;
      if (f === "used" && !i.used_at) return false;
      if (q) {
        const hay = (i.title + " " + i.notes).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const s = sort();
    list.sort((a, b) => {
      if (s === "title") return localeCompare(a.title, b.title);
      if (s === "oldest") return a.created_at - b.created_at;
      return b.created_at - a.created_at;
    });
    return list;
  });

  return {
    filter, setFilter,
    sort, setSort,
    query, setQuery,
    counts,
    filtered,
    scriptIndex,
  };
}
