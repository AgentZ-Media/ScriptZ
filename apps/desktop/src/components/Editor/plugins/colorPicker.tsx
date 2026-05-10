// Three entry points → one popover. The marge-swatch (gutter dot) appears
// for the Charakter block the caret is in OR being hovered; right-clicking
// any Charakter block opens the same popover; the colour dot in the
// character autocomplete dropdown does too (wired via `openFor` from
// characterDropdown.tsx).
//
// The popover always edits the **app-wide** colour for that name (see
// CLAUDE.md and `commands/character_colors.rs`). Per-script overrides
// don't exist on purpose.

import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { $getSelection, $isRangeSelection, type LexicalEditor, type LexicalNode } from "lexical";
import { $isScriptzCharacterNode } from "../nodes";
import { ColorPickerPopover } from "../ColorPickerPopover";
import { api } from "../../../lib/api";
import { scriptsBus } from "../../../lib/scriptsBus";
import { pushToast } from "../../../stores/toasts";
import type { ScriptCharacter } from "../../../lib/types";

const NEUTRAL_PLACEHOLDER = "#9aa0a6";

export interface InstallColorPickerArgs {
  /** Active script — passed to `clearCharacterColor` as the palette
   * context for the case where no default colour has been recorded yet,
   * and used to refetch fresh `characters_meta` after a reset (we can't
   * predict the resolved colour client-side). */
  scriptId: string;
  /** Live character list — needed to resolve a name to its current colour
   * when the popover opens, and updated optimistically on pick. */
  getCharacters: () => ScriptCharacter[];
  setCharacters: (next: ScriptCharacter[]) => void;
}

export interface ColorPickerHandle {
  /** Open the popover for an explicit name (used by characterDropdown's
   * colour-dot click). */
  openFor: (name: string, anchor: { x: number; y: number }) => void;
  teardown: () => void;
}

export function installColorPicker(
  editor: LexicalEditor,
  host: HTMLElement,
  getArgs: () => InstallColorPickerArgs,
): ColorPickerHandle {
  // ---- Reactive state for popover + marge swatch ------------------------
  const [popoverOpen, setPopoverOpen] = createSignal(false);
  const [popoverPos, setPopoverPos] = createSignal({ x: 0, y: 0 });
  const [popoverName, setPopoverName] = createSignal("");
  const [popoverColor, setPopoverColor] = createSignal(NEUTRAL_PLACEHOLDER);

  const [swatchVisible, setSwatchVisible] = createSignal(false);
  const [swatchPos, setSwatchPos] = createSignal({ x: 0, y: 0 });
  const [swatchColor, setSwatchColor] = createSignal(NEUTRAL_PLACEHOLDER);
  const [swatchName, setSwatchName] = createSignal("");

  const closePopover = () => {
    setPopoverOpen(false);
  };

  const colorForName = (name: string): string => {
    const upper = name.trim().toUpperCase();
    const found = getArgs()
      .getCharacters()
      .find((c) => c.name.toUpperCase() === upper);
    return found?.color ?? NEUTRAL_PLACEHOLDER;
  };

  // Optimistic update of the in-memory characters list. The server call
  // returns asynchronously; updating immediately means the highlight tint
  // refreshes within the same frame as the click — no flicker, no wait.
  const applyColorOptimistically = (name: string, color: string) => {
    const upper = name.trim().toUpperCase();
    const next = getArgs()
      .getCharacters()
      .map((c) =>
        c.name.toUpperCase() === upper ? { ...c, color } : c,
      );
    getArgs().setCharacters(next);
    // The marge swatch reads its colour from a separate signal that's
    // only refreshed by reposition events. Sync it here so the gutter
    // dot also reflects the new colour immediately.
    if (swatchName() === upper) {
      setSwatchColor(color);
    }
  };

  const persistColor = async (name: string, color: string) => {
    const upper = name.trim().toUpperCase();
    if (!upper) return;
    applyColorOptimistically(upper, color);
    try {
      await api.setCharacterColor(upper, color);
      // Bump the bus so any other open tabs (= other ScriptView instances)
      // refetch their script. The active tab updated optimistically and
      // does NOT need to wait for the refetch — the value will match.
      scriptsBus.bump();
    } catch (err) {
      pushToast(`Farbe speichern fehlgeschlagen: ${(err as Error).message ?? err}`, "error");
    }
  };

  const resetColor = async (name: string) => {
    const upper = name.trim().toUpperCase();
    if (!upper) return;
    try {
      await api.clearCharacterColor(upper, getArgs().scriptId);
      // Refetch the active script directly and push the fresh characters
      // into the editor's signal. `scriptsBus.bump()` alone wouldn't fix
      // the in-editor colour: the Editor's `liveCharacters` is local and
      // doesn't auto-sync from the parent's refetch (that would fight
      // the optimistic-typing path). The bus bump still fires so other
      // open tabs / the file browser refresh.
      const fresh = await api.getScript(getArgs().scriptId);
      getArgs().setCharacters(fresh.characters);
      // Sync the swatch cache too — same reason as in the optimistic-set
      // path: its colour comes from a separate signal.
      if (swatchName() === upper) {
        const next = fresh.characters.find(
          (c) => c.name.toUpperCase() === upper,
        );
        if (next) setSwatchColor(next.color);
      }
      scriptsBus.bump();
    } catch (err) {
      pushToast(`Reset fehlgeschlagen: ${(err as Error).message ?? err}`, "error");
    }
  };

  const openFor = (name: string, anchor: { x: number; y: number }) => {
    const upper = name.trim().toUpperCase();
    if (!upper) return;
    setPopoverName(upper);
    setPopoverColor(colorForName(upper));
    setPopoverPos(anchor);
    setPopoverOpen(true);
  };

  // ---- Marge swatch positioning -----------------------------------------
  // Strategy: we maintain "the block the swatch is currently anchored to"
  // and reposition on caret/hover/scroll/resize. The block is determined
  // by precedence: hover beats caret, since hover is a deliberate gesture.

  let caretBlock: HTMLElement | null = null;
  let hoverBlock: HTMLElement | null = null;
  // Deduplicate "still the same anchor" repositions so we don't fight the
  // browser layout for every frame of a smooth scroll.
  let lastAnchorBlock: HTMLElement | null = null;

  const editorRoot = (): HTMLElement | null =>
    host.querySelector(".editor-root");

  const repositionSwatch = () => {
    const target = hoverBlock ?? caretBlock;
    if (!target || !document.body.contains(target)) {
      if (swatchVisible()) setSwatchVisible(false);
      lastAnchorBlock = null;
      return;
    }
    const root = editorRoot();
    if (!root) return;
    const hostRect = host.getBoundingClientRect();
    const blockRect = target.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();

    // Place the swatch in the gutter to the LEFT of the editor-root, at
    // the vertical centre of the block. 18 px out, centred (8 px swatch).
    const x = rootRect.left - hostRect.left - 22;
    const y = blockRect.top - hostRect.top + blockRect.height / 2 - 6;

    // Resolve the current name + colour from the block. The character name
    // lives as the block's own (uppercased) text content.
    const name = (target.textContent ?? "").trim().toUpperCase();
    setSwatchPos({ x, y });
    setSwatchColor(colorForName(name));
    setSwatchName(name);
    setSwatchVisible(true);
    lastAnchorBlock = target;
  };

  const onCaretChange = () => {
    let block: HTMLElement | null = null;
    editor.getEditorState().read(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      let cur: LexicalNode | null = sel.anchor.getNode();
      while (cur) {
        if ($isScriptzCharacterNode(cur)) {
          const dom = editor.getElementByKey(cur.getKey());
          if (dom) block = dom as HTMLElement;
          break;
        }
        cur = cur.getParent();
      }
    });
    caretBlock = block;
    repositionSwatch();
  };

  // Hover: kontinuierlich per `mousemove` tracken statt nur bei
  // Element-Wechseln (mouseover feuert eben NICHT, wenn die Maus
  // innerhalb desselben Containers - hier `editor-host` - bleibt).
  // Mit raf-Throttling, damit's nicht jeden Mausbewegungs-Pixel kostet.
  //
  // Hit-Zone für die Anker-Wahl ist absichtlich größer als die reine
  // Block-Box: Der Swatch sitzt im linken Gutter (~22 px außerhalb der
  // editor-root-Kante). Damit der User vom Charakter-Namen geradeaus
  // zum Swatch wandern kann, ohne dass die Pille auf dem Weg
  // verschwindet, akzeptieren wir bis zu 80 px links vom Block-Left
  // als "noch in der Charakter-Zeile". Vertikal wird die Block-Box
  // hart eingehalten, damit benachbarte Action-/Dialog-Zeilen nicht
  // den Swatch geistern lassen.
  const HIT_LEFT_PAD = 80;
  let mouseTracker: { x: number; y: number } | null = null;
  let mouseRafId: number | null = null;

  const updateHoverFromPoint = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (el?.closest(".scriptz-marge-swatch")) return;
    let block = el?.closest(".block-scriptz-character") as HTMLElement | null;
    if (!block) {
      const root = editorRoot();
      if (root) {
        const blocks = root.querySelectorAll<HTMLElement>(".block-scriptz-character");
        for (const b of Array.from(blocks)) {
          const r = b.getBoundingClientRect();
          if (y >= r.top && y <= r.bottom &&
              x >= r.left - HIT_LEFT_PAD && x <= r.right) {
            block = b;
            break;
          }
        }
      }
    }
    if (block === hoverBlock) return;
    hoverBlock = block;
    repositionSwatch();
  };

  const onMouseMove = (ev: MouseEvent) => {
    mouseTracker = { x: ev.clientX, y: ev.clientY };
    if (mouseRafId !== null) return;
    mouseRafId = requestAnimationFrame(() => {
      mouseRafId = null;
      if (!mouseTracker) return;
      updateHoverFromPoint(mouseTracker.x, mouseTracker.y);
    });
  };

  // hoverContainer ist der `paper-canvas` (= scrollbarer Volltbereich
   // des Skripts), nicht der editor-host. Grund: editor-host ist nur
   // so breit wie die Schreib-Spalte (`--paper-content-w`); links
   // und rechts davon liegen die Paper-Margins, die zum
   // `paper-editor-overlay` gehören - dort verläuft die Maus auf dem
   // Weg zum Swatch. Listener am host würden mouseleave feuern, sobald
   // die Maus die Schreib-Spalte verlässt, und der Swatch verschwände
   // genau dann, wenn der User ihn anklicken will. Fallback host für
   // den seltenen Fall, dass paper-canvas im DOM nicht (mehr) existiert.
   const canvas = host.closest(".paper-canvas") as HTMLElement | null;
   const hoverContainer: HTMLElement = canvas ?? host;

   const onMouseLeave = (ev: MouseEvent) => {
     const related = ev.relatedTarget as Node | null;
     if (related && hoverContainer.contains(related)) return;
     mouseTracker = null;
     if (mouseRafId !== null) {
       cancelAnimationFrame(mouseRafId);
       mouseRafId = null;
     }
     hoverBlock = null;
     repositionSwatch();
   };

  // Right-click: open the popover at the cursor for the right-clicked
  // Charakter block. We bind on the editor-host so the listener survives
  // Lexical's reconciles.
  const onContextMenu = (ev: MouseEvent) => {
    const t = ev.target as HTMLElement | null;
    const block = t?.closest(".block-scriptz-character") as HTMLElement | null;
    if (!block) return;
    ev.preventDefault();
    const name = (block.textContent ?? "").trim().toUpperCase();
    if (!name) return;
    openFor(name, { x: ev.clientX, y: ev.clientY });
  };

  // Hover-Tracker am paper-canvas (siehe Erklärung beim Definieren
  // von hoverContainer oben). contextmenu-Handler bleibt am host, weil
  // ein Rechtsklick nur auf einem Charakter-Block Sinn macht und
  // sowieso direkt dort feuert.
  hoverContainer.addEventListener("mousemove", onMouseMove);
  hoverContainer.addEventListener("mouseleave", onMouseLeave);
  host.addEventListener("contextmenu", onContextMenu);

  // Scroll-/Resize-Reposition: paper-canvas (vertikales Scrolling) +
  // Fenster (Resize verändert Block-Layout).
  const onScroll = () => repositionSwatch();
  canvas?.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  // ResizeObserver on the editor root catches block reflows from typing
  // (line wraps) without the cost of a per-keystroke editor listener.
  const ro = new ResizeObserver(() => repositionSwatch());
  const editorEl = editorRoot();
  if (editorEl) ro.observe(editorEl);

  const teardownEditorUpdate = editor.registerUpdateListener(() => {
    onCaretChange();
  });

  // ---- Render the popover + swatch into a host-owned overlay div --------
  const overlay = document.createElement("div");
  overlay.className = "scriptz-color-overlay";
  // Don't let this div eat clicks meant for the editor; only the swatch
  // and popover inside it are interactive.
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.pointerEvents = "none";
  host.appendChild(overlay);

  const dispose = render(
    () => (
      <>
        {/* Marge swatch — always rendered; visibility/position controlled
            by the signals so we don't tear-and-recreate every frame. */}
        <button
          type="button"
          class="scriptz-marge-swatch scriptz-color-picker-trigger"
          aria-label={`Farbe von ${swatchName()} ändern`}
          title={`Farbe von ${swatchName()} ändern`}
          style={{
            position: "absolute",
            left: `${swatchPos().x}px`,
            top: `${swatchPos().y}px`,
            background: swatchColor(),
            opacity: swatchVisible() && swatchName() ? "1" : "0",
            "pointer-events": swatchVisible() && swatchName() ? "auto" : "none",
          }}
          onClick={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const name = swatchName();
            if (!name) return;
            const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
            openFor(name, { x: r.right + 8, y: r.top });
          }}
        />
        <ColorPickerPopover
          open={popoverOpen()}
          x={popoverPos().x}
          y={popoverPos().y}
          characterName={popoverName()}
          currentColor={popoverColor()}
          onPick={(c) => {
            void persistColor(popoverName(), c);
            closePopover();
          }}
          onReset={() => {
            void resetColor(popoverName());
            closePopover();
          }}
          onClose={closePopover}
        />
      </>
    ),
    overlay,
  );

  // First placement once Lexical has rendered the initial content.
  requestAnimationFrame(() => onCaretChange());

  return {
    openFor,
    teardown: () => {
      hoverContainer.removeEventListener("mousemove", onMouseMove);
      hoverContainer.removeEventListener("mouseleave", onMouseLeave);
      host.removeEventListener("contextmenu", onContextMenu);
      if (mouseRafId !== null) {
        cancelAnimationFrame(mouseRafId);
        mouseRafId = null;
      }
      canvas?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
      teardownEditorUpdate();
      dispose();
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      caretBlock = null;
      hoverBlock = null;
      lastAnchorBlock = null;
    },
  };
}
