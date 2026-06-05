import { createMemo, createResource, createSignal } from "solid-js";
import { api } from "../../../lib/api";
import { ideasStore } from "../../../stores/ideas";
import { scriptsBus } from "../../../lib/scriptsBus";
import { INBOX_FOLDER_ID } from "../../../lib/folders";
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
  // null = all folders. Orthogonal to the open/used filter and the
  // search; the three combine.
  const [activeFolderId, setActiveFolderId] = createSignal<string | null>(null);

  const ideas = () => ideasStore.ideas() ?? [];

  const counts = createMemo(() => ({
    all: ideas().length,
    open: ideas().filter((i) => !i.used_at).length,
    used: ideas().filter((i) => i.used_at).length,
  }));

  // The ideas matching the current status filter + search, but NOT the
  // folder filter — this is the scope the folder chips count over, so a
  // chip's number matches what selecting it would show.
  const inStatusScope = createMemo(() => {
    const f = filter();
    const q = query().trim().toLowerCase();
    return ideas().filter((i) => {
      if (f === "open" && i.used_at) return false;
      if (f === "used" && !i.used_at) return false;
      if (q) {
        const hay = (i.title + " " + i.notes).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  // Per-folder idea counts within the current status scope, keyed by
  // folder id. Computed client-side from the in-memory list — no SQL.
  const folderCounts = createMemo(() => {
    const map = new Map<string, number>();
    for (const i of inStatusScope()) {
      if (i.folder_id) map.set(i.folder_id, (map.get(i.folder_id) ?? 0) + 1);
    }
    return map;
  });

  // "All" chip: every idea in the current status scope, any folder.
  const folderAllCount = createMemo(() => inStatusScope().length);

  // "Inbox" chip: ideas in the current status scope that sit in no folder.
  const folderInboxCount = createMemo(
    () => inStatusScope().filter((i) => !i.folder_id).length,
  );

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
    const folderId = activeFolderId();
    const list = inStatusScope().filter((i) => {
      if (folderId === null) return true;
      if (folderId === INBOX_FOLDER_ID) return !i.folder_id;
      return i.folder_id === folderId;
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
    activeFolderId, setActiveFolderId,
    counts,
    folderCounts,
    folderAllCount,
    folderInboxCount,
    filtered,
    scriptIndex,
  };
}
