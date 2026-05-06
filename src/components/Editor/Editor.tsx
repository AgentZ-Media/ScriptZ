import { onCleanup, onMount, createEffect, createSignal } from "solid-js";
import {
  createEditor,
  $getRoot,
  $isElementNode,
  type LexicalEditor,
  type EditorThemeClasses,
} from "lexical";
import { registerHistory, createEmptyHistoryState } from "@lexical/history";
import { registerRichText } from "@lexical/rich-text";
import {
  SCRIPTZ_NODES,
  BaseScriptzNode,
  $createScriptzCharacterNode,
  $isScriptzCharacterNode,
} from "./nodes";
import { installSmartEnter } from "./plugins/smartEnter";
import { installBlockDropdown } from "./plugins/blockDropdown";
import { installAllCaps } from "./plugins/allcaps";
import { installParentheticalLive } from "./plugins/parentheticalLive";
import { installInlineFormat } from "./plugins/inlineFormat";
import { installBlockHotkeys } from "./plugins/blockHotkeys";
import { installCharacterDropdown } from "./plugins/characterDropdown";
import { api } from "../../lib/api";
import { scriptsBus } from "../../lib/scriptsBus";
import type { ScriptCharacter } from "../../lib/types";
import "./Editor.css";

export interface EditorProps {
  scriptId: string;
  initialContentJson: string | null | undefined;
  characters: ScriptCharacter[];
  highlighting?: boolean;
  onPageCountChange?: (n: number) => void;
  onSavingChange?: (saving: boolean) => void;
}

const THEME: EditorThemeClasses = {};

const SAVE_DEBOUNCE_MS = 250;
const AUTO_SNAPSHOT_MS = 5 * 60 * 1000;
const PLACEHOLDER_BLOCKS_PER_PAGE = 35;
// Used for character pills the user just typed in this session — the server
// assigns a real palette color on save, but we never re-pull the script (that
// caused contentEditable focus loss every 250ms during typing), so the dot
// stays neutral until the next time the script is opened.
const PENDING_CHAR_COLOR = "#9aa0a6";

function seedEmptyState(editor: LexicalEditor) {
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      const charBlock = $createScriptzCharacterNode();
      // Leave the block CHILDLESS — Lexical's reconciler injects a placeholder
      // <br> so the browser has a caret target. Pre-appending an empty
      // TextNode("") produces an empty span the browser can't caret-target.
      root.append(charBlock);
      charBlock.select(0, 0);
    },
    { discrete: true },
  );
}

export function Editor(props: EditorProps) {
  let rootRef: HTMLDivElement | undefined;
  let hostRef: HTMLDivElement | undefined;

  // Live character list seeded from the server, then updated client-side as
  // the writer adds/renames Charakter blocks. We deliberately stop refetching
  // the whole script after every save (that was disrupting contentEditable
  // focus mid-keystroke); instead, walk the Lexical state ourselves. Names
  // already known to the server keep their assigned palette color; freshly-
  // typed names get a neutral placeholder until the script is reloaded.
  const [liveCharacters, setLiveCharacters] = createSignal<ScriptCharacter[]>(
    props.characters ?? [],
  );

  onMount(() => {
    if (!rootRef || !hostRef) return;

    const editor = createEditor({
      namespace: "scriptz",
      nodes: SCRIPTZ_NODES as unknown as Array<typeof BaseScriptzNode>,
      theme: THEME,
      onError: (err: Error) => console.error("[lexical]", err),
    } as unknown as Parameters<typeof createEditor>[0]);

    editor.setRootElement(rootRef);

    // Lexical's default text-insertion handlers live in @lexical/rich-text.
    // Without this, beforeinput dispatches CONTROLLED_TEXT_INSERTION_COMMAND
    // but nobody handles it, so input visibly "stops working".
    const teardownRichText = registerRichText(editor);

    const teardownHistory = registerHistory(
      editor,
      createEmptyHistoryState(),
      1000,
    );

    let loaded = false;
    if (props.initialContentJson) {
      try {
        const state = editor.parseEditorState(props.initialContentJson);
        editor.setEditorState(state);
        loaded = true;
      } catch (err) {
        console.warn("[scriptz] failed to parse initial state, seeding empty", err);
      }
    }
    if (!loaded) {
      seedEmptyState(editor);
    }

    const teardownSmartEnter = installSmartEnter(editor);
    const teardownAllCaps = installAllCaps(editor);
    const teardownParen = installParentheticalLive(editor);
    const teardownInlineFmt = installInlineFormat(editor);
    const teardownBlockHK = installBlockHotkeys(editor);
    const teardownBlockDD = installBlockDropdown(editor, hostRef);
    const teardownCharDD = installCharacterDropdown(editor, hostRef, () => ({
      scriptCharacters: () => liveCharacters(),
    }));

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let dirtySinceSnapshot = false;
    let lastReportedPages = -1;

    const persist = async () => {
      let contentJson = "";
      let blockCount = 0;
      const seenNames: string[] = [];
      const seenSet = new Set<string>();

      editor.getEditorState().read(() => {
        const state = editor.getEditorState();
        contentJson = JSON.stringify(state.toJSON());
        const root = $getRoot();
        for (const child of root.getChildren()) {
          if ($isElementNode(child)) blockCount += 1;
          if ($isScriptzCharacterNode(child)) {
            const name = child.getTextContent().trim().toUpperCase();
            if (name && !seenSet.has(name)) {
              seenSet.add(name);
              seenNames.push(name);
            }
          }
        }
      });

      // Refresh the autocomplete list from the in-editor state (no script
      // refetch — that was knocking contentEditable focus loose every 250ms).
      const prev = liveCharacters();
      const colorByName = new Map(prev.map((c) => [c.name.toUpperCase(), c.color]));
      const next: ScriptCharacter[] = seenNames.map((name) => ({
        name,
        color: colorByName.get(name) ?? PENDING_CHAR_COLOR,
      }));
      const changed =
        next.length !== prev.length ||
        next.some((c, i) => c.name !== prev[i]?.name || c.color !== prev[i]?.color);
      if (changed) setLiveCharacters(next);

      const pageCount = Math.max(
        1,
        Math.ceil(blockCount / PLACEHOLDER_BLOCKS_PER_PAGE),
      );

      if (pageCount !== lastReportedPages) {
        lastReportedPages = pageCount;
        props.onPageCountChange?.(pageCount);
      }

      props.onSavingChange?.(true);
      try {
        await api.updateScript({
          id: props.scriptId,
          contentJson,
          pageCount,
        });
        scriptsBus.bump();
      } catch (err) {
        console.error("[scriptz] auto-save failed", err);
      } finally {
        props.onSavingChange?.(false);
      }
    };

    const teardownUpdate = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      dirtySinceSnapshot = true;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        void persist();
      }, SAVE_DEBOUNCE_MS);
    });

    const snapshotTimer = setInterval(() => {
      if (!dirtySinceSnapshot) return;
      dirtySinceSnapshot = false;
      void api.createSnapshot(props.scriptId, "auto").catch((err) => {
        console.warn("[scriptz] snapshot failed", err);
      });
    }, AUTO_SNAPSHOT_MS);

    onCleanup(() => {
      if (saveTimer) clearTimeout(saveTimer);
      clearInterval(snapshotTimer);
      teardownUpdate();
      teardownCharDD();
      teardownBlockDD();
      teardownBlockHK();
      teardownInlineFmt();
      teardownParen();
      teardownAllCaps();
      teardownSmartEnter();
      teardownHistory();
      teardownRichText();
      editor.setRootElement(null);
    });
  });

  createEffect(() => {
    if (!rootRef) return;
    rootRef.setAttribute("data-highlighting", props.highlighting ? "on" : "off");
  });

  return (
    <div ref={hostRef} class="editor-host">
      <div
        ref={rootRef}
        class="editor-root"
        contentEditable
        spellcheck
        data-highlighting={props.highlighting ? "on" : "off"}
      />
    </div>
  );
}

export default Editor;
