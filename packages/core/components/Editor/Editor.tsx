import { onCleanup, onMount, createEffect, createSignal } from "solid-js";
import {
  createEditor,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  type LexicalNode,
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
import { installHighlight } from "./plugins/highlight";
import { installColorPicker } from "./plugins/colorPicker";
import { api } from "../../lib/api";
import { scriptsBus } from "../../lib/scriptsBus";
import { registerFlusher } from "../../lib/saveFlush";
import { settingsStore } from "../../stores/settings";
import { DEFAULT_PALETTE } from "../../lib/characterColors";
import type { ScriptCharacter } from "../../lib/types";
import { applyCursor, type CursorAddress } from "../../lib/scriptViewCache";
import "./Editor.css";

export interface EditorProps {
  scriptId: string;
  initialContentJson: string | null | undefined;
  /** Optional cursor set after mount instead of `rootEnd`.
   *  ScriptView passes the last known cursor of the script through here
   *  so the user lands back exactly where they were on tab switch. */
  initialCursor?: CursorAddress | null;
  characters: ScriptCharacter[];
  highlighting?: boolean;
  /** Quick-mode toggle — when on AND the script has exactly 2 characters,
   * pressing Enter at the end of a Dialog auto-inserts the OTHER character
   * + a fresh Dialog block, so two-hander dialogue flows without manual
   * character-name entry. Read reactively (called on each Enter). */
  quickModeEnabled?: () => boolean;
  onSavingChange?: (saving: boolean) => void;
  /** Fires whenever the live character list changes — used by the parent
   * to drive the quick-mode availability check (need exactly 2). */
  onCharactersChange?: (chars: ScriptCharacter[]) => void;
  /** Fires when `initialContentJson` cannot be parsed by Lexical. The
   * editor will NOT mount (and will NOT auto-overwrite the broken state)
   * — the parent is expected to render a recovery UI instead. */
  onParseError?: (rawJson: string) => void;
  /** Returns the `LexicalEditor` instance to the parent after mount — the
   *  editor toolbar needs it to call
   *  `setBlockType(editor, "scriptz-character")` on a pill click. */
  onEditorReady?: (editor: LexicalEditor) => void;
  /** Fires whenever the cursor moves into a different block type (or out
   *  of any Scriptz block, in which case the value is `null`). Drives the
   *  `is-active` highlighting of the block pills in the toolbar. */
  onActiveBlockChange?: (blockType: string | null) => void;
}

const THEME: EditorThemeClasses = {};

const SAVE_DEBOUNCE_MS = 250;
const AUTO_SNAPSHOT_MS = 5 * 60 * 1000;
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

    // Expose editor instance to parent (the editor toolbar needs it).
    props.onEditorReady?.(editor);

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
        console.error(
          "[scriptz] failed to parse initial state — bailing out so we don't auto-overwrite",
          err,
        );
        // Tell the parent to mount the recovery UI. Importantly we DO
        // NOT seed an empty state and DO NOT attach the auto-save loop:
        // the next persist() would silently overwrite the user's broken-
        // but-present content_json with `{root:{children:[…empty…]}}`,
        // making recovery impossible.
        if (props.onParseError) {
          // Tear down what's already wired up (rich-text + history were
          // registered above) before bailing. The plugins below haven't
          // been installed yet, so nothing else to undo.
          try { teardownHistory(); } catch { /* ignore */ }
          try { teardownRichText(); } catch { /* ignore */ }
          editor.setRootElement(null);
          props.onParseError(props.initialContentJson);
          return;
        }
        // No parent handler? Fall through to the historical behaviour
        // (seed empty) so the editor at least functions — but log loudly.
      }
    }
    if (!loaded) {
      seedEmptyState(editor);
    }

    // Word-style: when a script becomes the active editor, the writer
    // should be able to start typing immediately — no manual click into
    // the contenteditable area required. We focus on the next frame so
    // Lexical has finished its initial reconcile and the DOM target
    // exists.
    //
    // If an `initialCursor` was provided (tab switch back to a
    // previously open script), we place the cursor at the
    // saved spot and focus WITHOUT `defaultSelection` -
    // otherwise Lexical would overwrite the just-set selection back to
    // rootEnd. Without a saved cursor the
    // original behavior stands: to the end of the document.
    const initialCursor = props.initialCursor ?? null;
    requestAnimationFrame(() => {
      try {
        if (initialCursor) {
          applyCursor(editor, initialCursor);
          editor.focus();
        } else {
          editor.focus(undefined, { defaultSelection: "rootEnd" });
        }
      } catch {
        /* ignore — non-fatal if the editor was torn down meanwhile */
      }
    });

    // Word-style: clicking anywhere on the surrounding paper canvas
    // (margins, empty space below the last block) drops the caret at
    // the end of the document, mirroring how a desktop word processor
    // treats the page area as "more editor". We attach to the closest
    // paper-canvas ancestor so the listener lives outside the
    // contenteditable surface and doesn't fight the editor's own
    // mousedown handling.
    const canvas = rootRef.closest(".paper-canvas") as HTMLElement | null;
    const onCanvasMousedown = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      // Click landed inside the editor — let Lexical place the caret
      // at the actual click location.
      if (target.closest(".editor-root")) return;
      // Don't intercept controls (toggle pill, status strip, dropdowns,
      // etc.) — the user clicked something else on purpose.
      if (
        target.closest("button") ||
        target.closest("input") ||
        target.closest("textarea") ||
        target.closest(".scriptz-block-dropdown") ||
        target.closest(".scriptz-character-dropdown") ||
        target.closest(".script-status")
      ) {
        return;
      }
      ev.preventDefault();
      try {
        editor.focus(undefined, { defaultSelection: "rootEnd" });
      } catch {
        /* ignore */
      }
    };
    canvas?.addEventListener("mousedown", onCanvasMousedown);

    const teardownSmartEnter = installSmartEnter(editor, {
      isQuickModeOn: () => !!props.quickModeEnabled?.(),
      getCharacters: () => liveCharacters(),
    });
    const teardownAllCaps = installAllCaps(editor);
    const teardownParen = installParentheticalLive(editor);
    const teardownInlineFmt = installInlineFormat(editor);
    const teardownBlockHK = installBlockHotkeys(editor);
    const teardownBlockDD = installBlockDropdown(editor, hostRef);
    // Highlight first so we can pass its `refresh` to the colour picker —
    // the picker mutates `liveCharacters` outside any editor state change,
    // and without an explicit refresh the tint wouldn't repaint until the
    // next keystroke / selection change.
    const highlight = installHighlight(editor, () => liveCharacters());
    const colorPicker = installColorPicker(editor, hostRef, () => ({
      scriptId: props.scriptId,
      getCharacters: () => liveCharacters(),
      setCharacters: (next) => {
        setLiveCharacters(next);
        props.onCharactersChange?.(next);
        highlight.refresh();
      },
    }));
    const teardownCharDD = installCharacterDropdown(editor, hostRef, () => ({
      scriptCharacters: () => liveCharacters(),
      openColorPicker: colorPicker.openFor,
    }));

    // Recompute character tints when the user toggles the dark-paper option
    // or the resolved theme changes (auto + system switch).
    // The tint formula depends on the paper mode (toward white vs toward
    // dark), so all blocks have to be re-tinted. The first run
    // is skipped, the plugin's initial pass already covers it.
    let firstPaperSync = true;
    createEffect(() => {
      settingsStore.darkPaper();
      settingsStore.resolvedTheme();
      if (firstPaperSync) {
        firstPaperSync = false;
        return;
      }
      highlight.refresh();
    });

    // Cache of the app-wide character color records (override ?? default
    // from character_colors). Loaded once on mount and updated after
    // every save with the server response. The sync reconcile
    // path uses this so a recurring character (same
    // name already tinted in another script) gets the right
    // color immediately instead of only after the debounced DB roundtrip.
    const knownColors = new Map<string, string>();
    api
      .listCharacterColors()
      .then((records) => {
        for (const r of records) {
          const color = r.override_color ?? r.default_color;
          if (color) knownColors.set(r.name.toUpperCase(), color);
        }
        // If the editor already contained characters (seeded from props),
        // reconcile again now so the cache takes effect.
        reconcileLiveCharactersSync();
      })
      .catch(() => {
        /* without the cache, the palette fallback further down takes over */
      });

    /** Pick a palette color that isn't already claimed in the
     *  already-assembled list. Mirrors `pickPaletteInScript` from
     *  characterColors.ts so the later server save (which knows the same
     *  heuristic) lands on the same color and no
     *  visible re-coloring happens. */
    function pickFallbackColor(existing: ScriptCharacter[]): string {
      const used = new Set<string>();
      for (const c of existing) used.add(c.color);
      for (const p of DEFAULT_PALETTE) {
        if (!used.has(p)) return p;
      }
      return DEFAULT_PALETTE[0];
    }

    /** Synchronous walk through the editor state that adjusts `liveCharacters`
     *  to the currently visible character blocks. Runs on
     *  every Lexical update (not debounced) — otherwise the user would
     *  have to wait for the 250 ms DB-save debounce before the tint
     *  color stays on character / dialog. New names get
     *  a color immediately (knownColors from DB cache, otherwise palette);
     *  the later save canonicalizes that via the server response. */
    function reconcileLiveCharactersSync(): boolean {
      const seenNames: string[] = [];
      const seenSet = new Set<string>();
      editor.getEditorState().read(() => {
        let editedCharKey: string | null = null;
        const sel = $getSelection();
        if ($isRangeSelection(sel)) {
          let cur: LexicalNode | null = sel.anchor.getNode();
          while (cur) {
            if ($isScriptzCharacterNode(cur)) {
              editedCharKey = cur.getKey();
              break;
            }
            cur = cur.getParent();
          }
        }
        const root = $getRoot();
        for (const child of root.getChildren()) {
          if (
            $isScriptzCharacterNode(child) &&
            child.getKey() !== editedCharKey
          ) {
            const name = child.getTextContent().trim().toUpperCase();
            if (name && !seenSet.has(name)) {
              seenSet.add(name);
              seenNames.push(name);
            }
          }
        }
      });

      const prev = liveCharacters();
      const colorByPrev = new Map(prev.map((c) => [c.name.toUpperCase(), c.color]));
      const next: ScriptCharacter[] = [];
      for (const name of seenNames) {
        const existing = colorByPrev.get(name);
        if (existing && existing !== PENDING_CHAR_COLOR) {
          next.push({ name, color: existing });
          continue;
        }
        const known = knownColors.get(name);
        if (known) {
          next.push({ name, color: known });
          continue;
        }
        next.push({ name, color: pickFallbackColor(next) });
      }

      const changed =
        next.length !== prev.length ||
        next.some(
          (c, i) => c.name !== prev[i]?.name || c.color !== prev[i]?.color,
        );
      if (changed) {
        setLiveCharacters(next);
        props.onCharactersChange?.(next);
        highlight.refresh();
      }
      return changed;
    }

    // Pull external color updates (e.g. from the settings characters tab)
    // live into the running editor. ScriptView refetches on
    // `scriptsBus.bump()` and passes the fresh `characters` as a prop
    // — we merge ONLY colors into `liveCharacters` (no replace),
    // so currently-typed, not-yet-saved names aren't
    // overwritten. The first run is skipped because
    // `liveCharacters` is already seeded from props.
    let firstCharacterSync = true;
    createEffect(() => {
      const incoming = props.characters ?? [];
      if (firstCharacterSync) {
        firstCharacterSync = false;
        return;
      }
      const byName = new Map<string, string>();
      for (const c of incoming) byName.set(c.name.toUpperCase(), c.color);
      const current = liveCharacters();
      let changed = false;
      const merged = current.map((c) => {
        const next = byName.get(c.name.toUpperCase());
        if (next !== undefined && next !== c.color) {
          changed = true;
          return { ...c, color: next };
        }
        return c;
      });
      if (changed) {
        setLiveCharacters(merged);
        highlight.refresh();
      }
    });

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let dirtySinceSnapshot = false;

    /** Heuristic: is `contentJson` an "empty" Lexical doc?
     *  Used to detect when `persist()` tries to write empty state
     *  over real content because of a race (editor torn down while a
     *  debounced / onCleanup persist() is running). */
    function isContentEffectivelyEmpty(json: string): boolean {
      try {
        const root = (JSON.parse(json) as { root?: { children?: unknown[] } })?.root;
        if (!root || !Array.isArray(root.children) || root.children.length === 0) return true;
        let totalText = 0;
        const walk = (n: unknown): void => {
          if (typeof n !== "object" || n === null) return;
          const o = n as { type?: string; text?: string; children?: unknown[] };
          if (o.type === "text" && typeof o.text === "string") totalText += o.text.length;
          if (Array.isArray(o.children)) o.children.forEach(walk);
        };
        walk(root);
        return totalText === 0;
      } catch {
        return true;
      }
    }

    // Tracks the last content we successfully wrote to the DB. Used by the
    // teardown-race guard below: if the editor state goes empty during an
    // unmount/flush AND the last save had real content, that's a Lexical
    // teardown reading the wrong state, not the user clearing the script.
    let lastPersistedContent = props.initialContentJson ?? "";

    const persist = async (fromTeardown = false) => {
      let contentJson = "";

      editor.getEditorState().read(() => {
        const state = editor.getEditorState();
        contentJson = JSON.stringify(state.toJSON());
      });

      // Note: the live character list is NO LONGER updated here
      // — that runs synchronously in registerUpdateListener via
      // `reconcileLiveCharactersSync()`. Otherwise the tint would have
      // to wait for the 250 ms save debounce and stay grey while typing fast.

      // Safety net against data loss: if the editor state looks empty NOW
      // and the last successfully saved state had content, on a teardown
      // that's a clear race symptom (editor was
      // torn down while an onCleanup persist() was running). We block
      // this only on teardown - otherwise a legitimate "fully clear
      // the script" by the user would fail forever.
      if (
        fromTeardown &&
        isContentEffectivelyEmpty(contentJson) &&
        lastPersistedContent &&
        !isContentEffectivelyEmpty(lastPersistedContent)
      ) {
        console.warn(
          "[scriptz] persist() abgebrochen: Teardown-Flush mit leerem " +
          "Editor-State, letzter gespeicherter Stand war nicht leer - " +
          "vermutlich Unmount-Race. Keine Überschreibung.",
        );
        return;
      }

      props.onSavingChange?.(true);
      try {
        const summary = await api.updateScript({
          id: props.scriptId,
          contentJson,
        });
        lastPersistedContent = contentJson;
        scriptsBus.bump();

        // Re-walk the editor state (the user may have typed during the
        // round-trip) and map each current name to the server-assigned
        // palette color from the summary. If the server doesn't yet know
        // a color for a name typed mid-flight, we keep
        // the locally-chosen color from `liveCharacters` — the
        // next save canonicalizes it. Previously the name landed on
        // `PENDING_CHAR_COLOR` (grey), which would have reverted the
        // sync fix.
        const colorMap = new Map(
          summary.characters.map((c) => [c.name.toUpperCase(), c.color]),
        );
        // Update the cache so a name retyped in a later script
        // immediately gets the canonical color.
        for (const c of summary.characters) {
          knownColors.set(c.name.toUpperCase(), c.color);
        }
        const currentNames: string[] = [];
        const currentSet = new Set<string>();
        editor.getEditorState().read(() => {
          let editedCharKey: string | null = null;
          const sel = $getSelection();
          if ($isRangeSelection(sel)) {
            let cur: LexicalNode | null = sel.anchor.getNode();
            while (cur) {
              if ($isScriptzCharacterNode(cur)) {
                editedCharKey = cur.getKey();
                break;
              }
              cur = cur.getParent();
            }
          }
          const root = $getRoot();
          for (const child of root.getChildren()) {
            if (
              $isScriptzCharacterNode(child) &&
              child.getKey() !== editedCharKey
            ) {
              const name = child.getTextContent().trim().toUpperCase();
              if (name && !currentSet.has(name)) {
                currentSet.add(name);
                currentNames.push(name);
              }
            }
          }
        });
        const before = liveCharacters();
        const colorByPrev = new Map(
          before.map((c) => [c.name.toUpperCase(), c.color]),
        );
        const merged: ScriptCharacter[] = currentNames.map((name) => ({
          name,
          color:
            colorMap.get(name) ??
            colorByPrev.get(name) ??
            PENDING_CHAR_COLOR,
        }));
        const changed =
          merged.length !== before.length ||
          merged.some(
            (c, i) => c.name !== before[i]?.name || c.color !== before[i]?.color,
          );
        if (changed) {
          setLiveCharacters(merged);
          props.onCharactersChange?.(merged);
          highlight.refresh();
        }
      } catch (err) {
        console.error("[scriptz] auto-save failed", err);
      } finally {
        props.onSavingChange?.(false);
      }
    };

    // Track the active block type — both on selection changes (cursor
    // moves via keyboard / click) and on content changes (e.g.
    // ⌘1..⌘7 replaces the block type under the cursor).
    let lastActiveBlock: string | null = null;
    const reportActiveBlock = () => {
      if (!props.onActiveBlockChange) return;
      let kind: string | null = null;
      editor.getEditorState().read(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) return;
        let cur: LexicalNode | null = sel.anchor.getNode();
        while (cur) {
          if (cur instanceof BaseScriptzNode) {
            kind = cur.getBlockType();
            break;
          }
          cur = cur.getParent();
        }
      });
      if (kind !== lastActiveBlock) {
        lastActiveBlock = kind;
        props.onActiveBlockChange?.(kind);
      }
    };
    // Initial value after mount.
    requestAnimationFrame(reportActiveBlock);

    /** Marks the editor root with `data-empty="1"` when the entire
     *  script is empty (exactly one block, without text). CSS uses this
     *  to render the ⌘ hint in the hostRef sibling. */
    const updateEmptyMarker = () => {
      if (!rootRef) return;
      let isEmpty = true;
      editor.getEditorState().read(() => {
        const root = $getRoot();
        const children = root.getChildren();
        if (children.length !== 1) {
          isEmpty = false;
          return;
        }
        if (children[0].getTextContent().trim().length > 0) {
          isEmpty = false;
        }
      });
      if (isEmpty) rootRef.setAttribute("data-empty", "1");
      else rootRef.removeAttribute("data-empty");
    };
    requestAnimationFrame(updateEmptyMarker);

    const teardownUpdate = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      // Selection tracking independent of the dirty state — the cursor can
      // move without anything being typed.
      reportActiveBlock();

      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      dirtySinceSnapshot = true;
      updateEmptyMarker();
      // Reconcile the character list IMMEDIATELY (not only after save
      // debounce) so the tint stays on character / dialog as soon as the
      // user presses Enter after the name — even when typing without a pause.
      reconcileLiveCharactersSync();
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        void persist();
      }, SAVE_DEBOUNCE_MS);
    });

    // If a save is buffered when the window is closing or this editor is
    // about to unmount (script switch, tab close), persist immediately
    // instead of dropping the pending writes.
    const flushPending = async (): Promise<void> => {
      if (!saveTimer) return;
      clearTimeout(saveTimer);
      saveTimer = null;
      try {
        await persist(true);
      } catch (err) {
        console.warn("[scriptz] flushPending failed", err);
      }
    };
    const unregisterFlusher = registerFlusher(flushPending);

    const snapshotTimer = setInterval(() => {
      if (!dirtySinceSnapshot) return;
      dirtySinceSnapshot = false;
      void api.createSnapshot(props.scriptId, "auto").catch((err) => {
        console.warn("[scriptz] snapshot failed", err);
      });
    }, AUTO_SNAPSHOT_MS);

    onCleanup(() => {
      // Critical: flush any debounced save before tearing down so the
      // last 250 ms of typing isn't lost when switching scripts, closing
      // a tab, or unmounting on hot-reload. Fire-and-forget — the IPC
      // continues independently of the editor instance.
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        void persist(true);
      }
      unregisterFlusher();
      canvas?.removeEventListener("mousedown", onCanvasMousedown);
      clearInterval(snapshotTimer);
      teardownUpdate();
      highlight.teardown();
      teardownCharDD();
      colorPicker.teardown();
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
      {/* Hotkey hint: only visible when the editor root carries
          data-empty="1". Lives outside the contenteditable so the
          Lexical selection doesn't get stuck on a ::before
          pseudo-caret target. */}
      <div class="editor-empty-hint" aria-hidden="true">
        Tippe los · <span class="kbd kbd-inline">Tab</span> wechselt den Block-Typ ·{" "}
        <span class="kbd kbd-inline">⌘1</span>–<span class="kbd kbd-inline">⌘7</span>{" "}
        direkt
      </div>
    </div>
  );
}

export default Editor;
