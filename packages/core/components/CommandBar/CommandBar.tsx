import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { api } from "../../lib/api";
import { tabsStore } from "../../stores/tabs";
import type { SearchHit } from "../../lib/types";
import { debounce } from "../../lib/format";
import "./CommandBar.css";

/**
 * FTS5 zentriert das Match in seinem Token-Fenster. Bei nowrap-Layout
 * fällt der hintere Teil — und damit oft das `<mark>` selbst — in die
 * Ellipsis. Wir kürzen den Text vor dem ersten `<mark>` auf ein
 * einzelnes Wort, damit der Treffer garantiert sichtbar am Anfang
 * steht; alles dahinter bleibt erhalten und wird ggf. rechts gekappt.
 */
function trimBeforeMark(s: string): string {
  const idx = s.indexOf("<mark>");
  if (idx <= 0) return s;
  const before = s.slice(0, idx).replace(/^…\s*/, "");
  const words = before.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return s;
  return "… " + words[words.length - 1] + " " + s.slice(idx);
}

/**
 * SQLite's FTS5 `snippet()` returns the user's own content verbatim with
 * `<mark>`/`</mark>` literally interleaved — no entity escaping. Pumping
 * that through `innerHTML` would inject any HTML the writer happens to
 * have typed into the script (CSP defangs scripts, but layout/markup
 * corruption still works). Escape everything, then re-enable the two
 * tags FTS produced.
 */
function safeSnippet(s: string): string {
  return trimBeforeMark(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}

export interface CommandBarProps {
  open: boolean;
  onClose(): void;
  onOpenScript?(id: string, title: string): void;
}

export function CommandBar(props: CommandBarProps) {
  const [query, setQuery] = createSignal("");
  const [hits, setHits] = createSignal<SearchHit[]>([]);
  const [activeIdx, setActiveIdx] = createSignal(0);
  const [searching, setSearching] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;
  let listRef: HTMLDivElement | undefined;

  const runSearch = debounce(async (q: string) => {
    if (!q.trim()) {
      setHits([]);
      setSearching(false);
      return;
    }
    try {
      const r = await api.globalSearch(q, 50);
      setHits(r);
      setActiveIdx(0);
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  }, 200);

  const onInput = (e: Event) => {
    const v = (e.currentTarget as HTMLInputElement).value;
    setQuery(v);
    setSearching(true);
    runSearch(v);
  };

  const open = (hit: SearchHit) => {
    if (props.onOpenScript) {
      props.onOpenScript(hit.id, hit.title);
    } else {
      tabsStore.openScript(hit.id, hit.title);
    }
    props.onClose();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!props.open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
      return;
    }
    const list = hits();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (list.length) setActiveIdx((idx) => (idx + 1) % list.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (list.length) setActiveIdx((idx) => (idx - 1 + list.length) % list.length);
    } else if (e.key === "Enter") {
      const hit = list[activeIdx()];
      if (hit) {
        e.preventDefault();
        open(hit);
      }
    }
  };

  onMount(() => {
    document.addEventListener("keydown", onKey, true);
    onCleanup(() => document.removeEventListener("keydown", onKey, true));
  });

  let lastOpen = false;
  const focusEffect = () => {
    if (props.open && !lastOpen) {
      setQuery("");
      setHits([]);
      setActiveIdx(0);
      queueMicrotask(() => inputRef?.focus());
    }
    lastOpen = props.open;
  };

  const scrollEffect = () => {
    if (!listRef) return;
    queueMicrotask(() => {
      const el = listRef!.querySelector<HTMLElement>(".cmd-row.is-active");
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "nearest" });
      }
    });
  };

  return (
    <Show when={props.open}>
      {(() => {
        focusEffect();
        return (
          <Portal>
            <div
              class="modal-backdrop cmd-backdrop"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) props.onClose();
              }}
            >
              <div
                class="cmd-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Befehlspalette"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div class="cmd-search">
                  <span class="cmd-search-icon" aria-hidden="true">
                    ⌕
                  </span>
                  <input
                    ref={inputRef}
                    class="cmd-search-input"
                    placeholder="Skripte suchen…"
                    value={query()}
                    onInput={onInput}
                    autocomplete="off"
                    spellcheck={false}
                    role="combobox"
                    aria-expanded={hits().length > 0}
                    aria-controls="cmd-results-list"
                    aria-activedescendant={
                      hits().length > 0 ? `cmd-row-${activeIdx()}` : undefined
                    }
                  />
                  <Show when={searching()}>
                    <span class="cmd-spinner" aria-hidden="true" />
                  </Show>
                </div>
                <div
                  class="cmd-results"
                  id="cmd-results-list"
                  role="listbox"
                  aria-label="Suchtreffer"
                  ref={listRef}
                >
                  <Show
                    when={query().trim()}
                    fallback={
                      <div class="cmd-empty">Tippe, um Skripte zu suchen…</div>
                    }
                  >
                    <Show when={hits().length > 0} fallback={<div class="cmd-empty">Keine Treffer.</div>}>
                      {(() => {
                        scrollEffect();
                        return (
                          <For each={hits()}>
                            {(hit, i) => (
                              <div
                                id={`cmd-row-${i()}`}
                                class={`cmd-row${i() === activeIdx() ? " is-active" : ""}`}
                                role="option"
                                aria-selected={i() === activeIdx()}
                                onMouseEnter={() => setActiveIdx(i())}
                                onClick={() => open(hit)}
                              >
                                <div class="cmd-row-title">{hit.title || "(ohne Titel)"}</div>
                                <Show when={hit.snippet}>
                                  <div
                                    class="cmd-row-snippet"
                                    innerHTML={safeSnippet(hit.snippet)}
                                  />
                                </Show>
                              </div>
                            )}
                          </For>
                        );
                      })()}
                    </Show>
                  </Show>
                </div>
                <div class="cmd-footer">
                  <span class="cmd-foot-hint">
                    <span class="kbd">↑</span>
                    <span class="kbd">↓</span> bewegen
                  </span>
                  <span class="cmd-foot-hint">
                    <span class="kbd">↵</span> öffnen
                  </span>
                  <span class="cmd-foot-hint">
                    <span class="kbd">Esc</span> schließen
                  </span>
                </div>
              </div>
            </div>
          </Portal>
        );
      })()}
    </Show>
  );
}
