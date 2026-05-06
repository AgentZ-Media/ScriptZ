import { createSignal, For, Show } from "solid-js";
import { render } from "solid-js/web";
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $createTextNode,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import {
  BaseScriptzNode,
  $isScriptzCharacterNode,
  type ScriptzCharacterNode,
} from "../nodes";
import type { ScriptCharacter } from "../../../lib/types";

function findCharacterAncestor(
  node: LexicalNode | null,
): ScriptzCharacterNode | null {
  let cur: LexicalNode | null = node;
  while (cur) {
    if ($isScriptzCharacterNode(cur)) return cur;
    cur = cur instanceof BaseScriptzNode ? null : cur.getParent();
  }
  return null;
}

export interface InstallCharacterDropdownArgs {
  scriptCharacters: () => ScriptCharacter[];
}

export function installCharacterDropdown(
  editor: LexicalEditor,
  host: HTMLElement,
  getArgs: () => InstallCharacterDropdownArgs,
): () => void {
  const [open, setOpen] = createSignal(false);
  const [pos, setPos] = createSignal({ x: 0, y: 0 });
  const [filter, setFilter] = createSignal("");
  const [activeIdx, setActiveIdx] = createSignal(0);
  const [activeKey, setActiveKey] = createSignal<string | null>(null);

  const filteredEntries = (): ScriptCharacter[] => {
    const q = filter().trim().toUpperCase();
    const all = getArgs().scriptCharacters();
    if (!q) return all;
    return all.filter((e) => e.name.toUpperCase().includes(q));
  };

  const positionFromCursor = (): { x: number; y: number } => {
    const dom = window.getSelection();
    if (dom && dom.rangeCount > 0) {
      const rect = dom.getRangeAt(0).getBoundingClientRect();
      if (rect.width || rect.height || rect.left || rect.top) {
        return { x: rect.left, y: rect.bottom + 6 };
      }
    }
    const r = host.getBoundingClientRect();
    return { x: r.left + 16, y: r.top + 60 };
  };

  const close = () => {
    setOpen(false);
    setActiveKey(null);
  };

  const applySelection = (entry: ScriptCharacter) => {
    const key = activeKey();
    if (!key) return;
    editor.update(() => {
      const node = $getNodeByKey(key);
      if (!node || !$isScriptzCharacterNode(node)) return;
      node.setCharacterName(entry.name.toUpperCase());
      const children = node.getChildren();
      for (const c of children) c.remove();
      node.append($createTextNode(entry.name.toUpperCase()));
      node.selectEnd();
    });
    close();
  };

  const container = document.createElement("div");
  container.className = "scriptz-char-dd-host";
  host.appendChild(container);

  function DropdownView() {
    return (
      <Show when={open() && filteredEntries().length > 0}>
        <div
          class="scriptz-character-dropdown"
          style={{
            position: "fixed",
            left: `${pos().x}px`,
            top: `${pos().y}px`,
            "z-index": 1000,
            background: "var(--modal-bg)",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            "border-radius": "var(--r-3)",
            "box-shadow": "var(--shadow-popover)",
            padding: "4px",
            "min-width": "240px",
            "font-family": "var(--font-sans)",
            "font-size": "13px",
            "user-select": "none",
          }}
          onMouseDown={(ev) => ev.preventDefault()}
        >
          <For each={filteredEntries()}>
            {(entry, i) => (
              <div
                style={{
                  padding: "6px 10px",
                  "border-radius": "var(--r-2)",
                  cursor: "pointer",
                  background: i() === activeIdx() ? "var(--selected)" : "transparent",
                  display: "flex",
                  "align-items": "center",
                  gap: "8px",
                }}
                onMouseEnter={() => setActiveIdx(i())}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  applySelection(entry);
                }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    "border-radius": "999px",
                    background: entry.color,
                    "flex-shrink": 0,
                  }}
                />
                <span style={{ "flex": 1, "font-weight": 600 }}>{entry.name}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    );
  }

  const dispose = render(() => <DropdownView />, container);

  const teardownUpdate = editor.registerUpdateListener(({ editorState }) => {
    let nodeKey: string | null = null;
    let text = "";
    editorState.read(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      const charNode = findCharacterAncestor(sel.anchor.getNode());
      if (!charNode) return;
      nodeKey = charNode.getKey();
      text = charNode.getTextContent();
    });

    if (!nodeKey) {
      if (open()) close();
      return;
    }

    setActiveKey(nodeKey);
    setFilter(text);
    setPos(positionFromCursor());
    setActiveIdx(0);
    setOpen(true);
  });

  const onKey = (ev: KeyboardEvent) => {
    if (!open()) return;
    const list = filteredEntries();
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setActiveIdx((i) => (i + 1) % Math.max(1, list.length));
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setActiveIdx((i) => (i - 1 + list.length) % Math.max(1, list.length));
    } else if (ev.key === "Enter") {
      const entry = list[activeIdx()];
      if (entry) {
        ev.preventDefault();
        ev.stopPropagation();
        applySelection(entry);
      }
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  };
  document.addEventListener("keydown", onKey, true);

  return () => {
    document.removeEventListener("keydown", onKey, true);
    teardownUpdate();
    dispose();
    if (container.parentNode) container.parentNode.removeChild(container);
  };
}
