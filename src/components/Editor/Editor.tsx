import { onCleanup, onMount, createEffect } from "solid-js";
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
} from "./nodes";
import { installSmartEnter } from "./plugins/smartEnter";
import { installBlockDropdown } from "./plugins/blockDropdown";
import { installAllCaps } from "./plugins/allcaps";
import { installParentheticalLive } from "./plugins/parentheticalLive";
import { installInlineFormat } from "./plugins/inlineFormat";
import { installBlockHotkeys } from "./plugins/blockHotkeys";
import { installCharacterDropdown } from "./plugins/characterDropdown";
import { api } from "../../lib/api";
import type { ScriptCharacter } from "../../lib/types";
import "./Editor.css";

export interface EditorProps {
  scriptId: string;
  initialContentJson: string | null | undefined;
  characters: ScriptCharacter[];
  highlighting?: boolean;
  onPageCountChange?: (n: number) => void;
  onSavingChange?: (saving: boolean) => void;
  onSaved?: () => void;
}

const THEME: EditorThemeClasses = {};

const SAVE_DEBOUNCE_MS = 250;
const AUTO_SNAPSHOT_MS = 5 * 60 * 1000;
const PLACEHOLDER_BLOCKS_PER_PAGE = 35;

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
      scriptCharacters: () => props.characters ?? [],
    }));

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let dirtySinceSnapshot = false;
    let lastReportedPages = -1;

    const persist = async () => {
      let contentJson = "";
      let blockCount = 0;

      editor.getEditorState().read(() => {
        const state = editor.getEditorState();
        contentJson = JSON.stringify(state.toJSON());
        const root = $getRoot();
        for (const child of root.getChildren()) {
          if ($isElementNode(child)) blockCount += 1;
        }
      });

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
        props.onSaved?.();
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
