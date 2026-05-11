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
import type { ScriptCharacter } from "../../lib/types";
import { applyCursor, type CursorAddress } from "../../lib/scriptViewCache";
import "./Editor.css";

export interface EditorProps {
  scriptId: string;
  initialContentJson: string | null | undefined;
  /** Optionaler Cursor, der nach dem Mount statt `rootEnd` gesetzt wird.
   *  ScriptView reicht hier den letzten bekannten Cursor des Skripts
   *  durch, damit der User beim Tab-Wechsel zurueck genau dort landet,
   *  wo er war. */
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
  /** Liefert die `LexicalEditor`-Instanz nach Mount nach oben — die
   *  Editor-Toolbar braucht sie, um per Klick auf eine Block-Pille
   *  `setBlockType(editor, "scriptz-character")` aufrufen zu können. */
  onEditorReady?: (editor: LexicalEditor) => void;
  /** Fires whenever the cursor moves into a different block type (or out
   *  of any Scriptz-Block, in which case the value is `null`). Treibt das
   *  `is-active`-Highlighting der Block-Pillen in der Toolbar. */
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

    // Expose editor instance to parent (Editor-Toolbar braucht sie).
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
    // Wenn ein `initialCursor` mitgegeben wurde (Tab-Wechsel zurueck auf
    // ein zuvor offenes Skript), platzieren wir den Cursor an der
    // gespeicherten Stelle und fokussieren OHNE `defaultSelection` -
    // sonst wuerde Lexical die soeben gesetzte Selection wieder nach
    // rootEnd ueberschreiben. Ohne gespeicherten Cursor bleibt das
    // urspruengliche Verhalten: ans Ende des Dokuments.
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

    // Charakter-Tints neu berechnen, wenn der User die dark-paper-Option
    // umlegt oder das aufgelöste Theme wechselt (Auto + System-Wechsel).
    // Die Tint-Formel hängt vom Paper-Modus ab (toward white vs toward
    // dark), daher müssen alle Blöcke neu eingefärbt werden. Erstes Run
    // wird ausgelassen, der Initial-Pass im Plugin macht den ohnehin.
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

    // Externe Farb-Updates (z.B. aus dem Einstellungen-Charaktere-Tab) live
    // in den laufenden Editor ziehen. ScriptView refetcht beim
    // `scriptsBus.bump()` und reicht die frischen `characters` als Prop
    // weiter — wir mergen NUR Farben in `liveCharacters` (kein Replace),
    // damit gerade getippte, noch nicht gespeicherte Namen nicht
    // überschrieben werden. Erstes Run wird übersprungen, weil
    // `liveCharacters` bereits aus Props seeded ist.
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

    /** Heuristik: ist `contentJson` ein "leerer" Lexical-Doc?
     *  Verwendet, um zu erkennen ob `persist()` versucht, durch einen
     *  Race (Editor wird torn down während eine debounced/onCleanup
     *  persist() läuft) leeren State über echte Inhalte zu schreiben. */
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
      const seenNames: string[] = [];
      const seenSet = new Set<string>();

      editor.getEditorState().read(() => {
        const state = editor.getEditorState();
        contentJson = JSON.stringify(state.toJSON());

        // Identify the Character block the cursor is currently inside.
        // We exclude its name from the live list so a half-typed name (e.g.
        // "A" while reaching for "AXEL") doesn't show up as its own
        // character entry in the autocomplete.
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
      if (changed) {
        setLiveCharacters(next);
        props.onCharactersChange?.(next);
      }

      // Sicherheitsnetz gegen Datenverlust: wenn der Editor-State JETZT
      // leer aussieht und der letzte erfolgreich gespeicherte Stand Inhalt
      // hatte, ist das beim Teardown ein klares Race-Symptom (Editor wurde
      // torn down während ein onCleanup persist() lief). Wir blockieren
      // das nur im Teardown - sonst würde ein legitimes "Skript ganz
      // leeren" durch den User für immer scheitern.
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
        // palette color from the summary. Names typed mid-flight that the
        // server hasn't seen yet stay on the placeholder color until the
        // next save settles them.
        const colorMap = new Map(
          summary.characters.map((c) => [c.name.toUpperCase(), c.color]),
        );
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
        const merged: ScriptCharacter[] = currentNames.map((name) => ({
          name,
          color: colorMap.get(name) ?? PENDING_CHAR_COLOR,
        }));
        const before = liveCharacters();
        const changed =
          merged.length !== before.length ||
          merged.some(
            (c, i) => c.name !== before[i]?.name || c.color !== before[i]?.color,
          );
        if (changed) {
          setLiveCharacters(merged);
          props.onCharactersChange?.(merged);
        }
      } catch (err) {
        console.error("[scriptz] auto-save failed", err);
      } finally {
        props.onSavingChange?.(false);
      }
    };

    // Aktiven Block-Typ tracken — sowohl bei Selection-Wechseln (Cursor
    // wandert per Tastatur/Klick) als auch bei Inhaltsänderungen (z.B.
    // ⌘1..⌘7 ersetzt den Block-Typ unter dem Cursor).
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
    // Initial-Wert nach Mount.
    requestAnimationFrame(reportActiveBlock);

    /** Kennzeichnet den Editor-Root mit `data-empty="1"`, wenn das ganze
     *  Skript leer ist (genau ein Block, ohne Text). CSS rendert daraus
     *  den ⌘-Hint im hostRef-Sibling. */
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
      // Selection-Tracking unabhängig von dirty-State — der Cursor kann
      // sich bewegen ohne dass etwas getippt wurde.
      reportActiveBlock();

      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      dirtySinceSnapshot = true;
      updateEmptyMarker();
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
      {/* Hotkey-Hint: nur sichtbar, wenn der Editor-Root data-empty="1"
          trägt. Liegt außerhalb des contenteditable, damit Lexical-
          Selection nicht an einem ::before-Pseudo-Caret-Target hängt. */}
      <div class="editor-empty-hint" aria-hidden="true">
        Tippe los · <span class="kbd kbd-inline">Tab</span> wechselt den Block-Typ ·{" "}
        <span class="kbd kbd-inline">⌘1</span>–<span class="kbd kbd-inline">⌘7</span>{" "}
        direkt
      </div>
    </div>
  );
}

export default Editor;
