import { For, Show, createSignal, createEffect } from "solid-js";
import type { LexicalEditor } from "lexical";
import { setBlockType } from "./plugins/blockHotkeys";
import type { BlockType } from "../../lib/types";
import "./EditorToolbar.css";

interface BlockDef {
  id: BlockType;
  label: string;
  hint: string;
}

// Primärs sind die drei Block-Typen, die ein Solo-Talking-Head- oder
// 2-Personen-Sketch-Skript praktisch immer braucht. Der Rest (Paren.,
// Kamera, Caption, SFX) lebt hinter einem "+/..."-Aufklappknopf, damit
// die Toolbar für die Zielgruppe (TikTok / Reels) nicht überladen
// wirkt - per Tab-Picker und ⌘4..7 sind sie weiter direkt erreichbar.
const PRIMARY_BLOCKS: BlockDef[] = [
  { id: "scriptz-action",        label: "Action",     hint: "⌘1" },
  { id: "scriptz-character",     label: "Charakter",  hint: "⌘2" },
  { id: "scriptz-dialog",        label: "Dialog",     hint: "⌘3" },
];

const SECONDARY_BLOCKS: BlockDef[] = [
  { id: "scriptz-parenthetical", label: "Paren.",     hint: "⌘4" },
  { id: "scriptz-camera",        label: "Kamera",     hint: "⌘5" },
  { id: "scriptz-caption",       label: "Caption",    hint: "⌘6" },
  { id: "scriptz-sfx",           label: "SFX",        hint: "⌘7" },
];

export interface EditorToolbarProps {
  /** Aktueller Skript-Titel — als kontrollierter Inline-Input angezeigt. */
  title: string;
  /** Wird aufgerufen wenn der Titel committed werden soll (Blur / Enter). */
  onTitleCommit(next: string): void;

  /** Zurück zur Übersicht (aktiviert Home-Tab). */
  onBack(): void;

  /** Lexical-Editor-Instanz für Block-Wechsel; null bevor Editor mounted. */
  editor: LexicalEditor | null;
  /** Aktueller Block-Typ unter dem Cursor (treibt is-active-State der
   *  Block-Pillen). null = Cursor in keinem Scriptz-Block. */
  activeBlock: string | null;

  /** Quick-Mode: aktiv? verfügbar? togglen */
  quickModeOn(): boolean;
  quickModeAvailable(): boolean;
  onToggleQuickMode(): void;

  /** Charakter-Highlighting: aktuell an? togglen */
  highlightOn(): boolean;
  onToggleHighlight(): void;

  /** Fokus-Modus togglen (⇧⌘F) */
  onToggleFocus(): void;

  /** Export-Dialog öffnen (⌘E) */
  onOpenExport(): void;
}

/**
 * Editor-Toolbar oberhalb des Papers nach Re-Design `editor.jsx`:
 *
 *   ← Übersicht  |  [Skript-Titel-Input]  [Block-Pillen × 7]  [⚡] [🎨] [👁] [PDF Export]
 *
 * Im Fokus-Modus blendet sich die ganze Leiste weg (über `.app-root.is-focus
 * .editor-toolbar` in CSS).
 */
export function EditorToolbar(props: EditorToolbarProps) {
  const [draftTitle, setDraftTitle] = createSignal(props.title);
  const [secondaryOpen, setSecondaryOpen] = createSignal(false);

  // Wenn der Cursor in einen Sekundärblock wandert, klappen wir die
  // Sekundärleiste automatisch auf - sonst zeigt die Toolbar keinen
  // aktiven Marker für den aktuellen Block.
  createEffect(() => {
    const ab = props.activeBlock;
    if (ab && SECONDARY_BLOCKS.some((b) => b.id === ab)) {
      setSecondaryOpen(true);
    }
  });

  // Wenn der Titel von außen wechselt (Tab-Wechsel, Rename in Sidebar,
  // ...), draftTitle synchronisieren.
  createEffect(() => {
    setDraftTitle(props.title);
  });

  function commit() {
    const v = draftTitle().trim();
    if (v && v !== props.title) {
      props.onTitleCommit(v);
    } else {
      // Nicht-committen → revert zur Original-Anzeige
      setDraftTitle(props.title);
    }
  }

  function clickBlock(id: BlockType) {
    const ed = props.editor;
    if (!ed) return;
    setBlockType(ed, id);
    // Editor wieder fokussieren, damit die Pille keine Tastatureingabe
    // schluckt — der Klick auf die Pille ist nur ein Tool, nicht ein
    // Wechsel des Eingabe-Targets.
    requestAnimationFrame(() => {
      try { ed.focus(); } catch { /* ignore */ }
    });
  }

  return (
    <div class="editor-toolbar">
      <button
        type="button"
        class="editor-toolbar-back"
        onMouseDown={(e) => e.preventDefault() /* kein contenteditable-blur */}
        onClick={props.onBack}
        title="Zurück zur Übersicht"
      >
        <ChevronLeftIcon />
        <span>Übersicht</span>
      </button>

      <div class="editor-toolbar-divider" />

      <div class="editor-title-wrap">
        <input
          class="editor-title-input"
          value={draftTitle()}
          onInput={(e) => setDraftTitle(e.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              setDraftTitle(props.title);
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          spellcheck={false}
          aria-label="Skript-Titel"
        />
      </div>

      <div class="block-toolbar" role="group" aria-label="Block-Typ">
        <For each={PRIMARY_BLOCKS}>
          {(b) => (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              classList={{ "is-active": props.activeBlock === b.id }}
              title={`${b.label}  ${b.hint}`}
              onClick={() => clickBlock(b.id)}
              disabled={!props.editor}
              aria-disabled={!props.editor}
              aria-pressed={props.activeBlock === b.id}
            >
              <span class="block-toolbar-label">{b.label}</span>
              <span class="block-toolbar-hint" aria-hidden="true">{b.hint}</span>
            </button>
          )}
        </For>
        <Show when={secondaryOpen()}>
          <span class="block-toolbar-sep" aria-hidden="true" />
          <For each={SECONDARY_BLOCKS}>
            {(b) => (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                classList={{ "is-active": props.activeBlock === b.id }}
                title={`${b.label}  ${b.hint}`}
                onClick={() => clickBlock(b.id)}
                disabled={!props.editor}
                aria-disabled={!props.editor}
                aria-pressed={props.activeBlock === b.id}
              >
                <span class="block-toolbar-label">{b.label}</span>
                <span class="block-toolbar-hint" aria-hidden="true">{b.hint}</span>
              </button>
            )}
          </For>
        </Show>
        <button
          type="button"
          class="block-toolbar-more"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setSecondaryOpen((v) => !v)}
          title={
            secondaryOpen()
              ? "Weniger Block-Typen anzeigen"
              : "Weitere Block-Typen (Paren./Kamera/Caption/SFX)"
          }
          aria-expanded={secondaryOpen()}
          aria-label={
            secondaryOpen()
              ? "Weniger Block-Typen anzeigen"
              : "Weitere Block-Typen anzeigen"
          }
        >
          {secondaryOpen() ? "–" : "+"}
        </button>
      </div>

      <Show when={props.quickModeAvailable()}>
        <button
          class="editor-toolbar-action"
          classList={{ "is-on": props.quickModeOn() }}
          onClick={props.onToggleQuickMode}
          title={
            props.quickModeOn()
              ? "Quick-Modus aus"
              : "Quick-Modus an (Enter im Dialog → anderer Charakter)"
          }
          aria-label="Quick-Modus"
          aria-pressed={props.quickModeOn()}
        >
          <BoltIcon />
        </button>
      </Show>

      <button
        class="editor-toolbar-action"
        classList={{ "is-on": props.highlightOn() }}
        onClick={props.onToggleHighlight}
        title={props.highlightOn() ? "Charakter-Highlighting aus" : "Charakter-Highlighting an"}
        aria-label="Charakter-Highlighting"
        aria-pressed={props.highlightOn()}
      >
        <HighlightIcon />
      </button>

      <button
        class="editor-toolbar-action"
        onClick={props.onToggleFocus}
        title="Fokus-Modus (⇧⌘F)"
        aria-label="Fokus-Modus"
      >
        <FocusIcon />
      </button>

      <button
        class="editor-toolbar-action editor-toolbar-export"
        onClick={props.onOpenExport}
        title="Exportieren (⌘E)"
      >
        <PdfIcon />
        <span>Export</span>
      </button>
    </div>
  );
}

/* ---- Icons ---- */
function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}
function HighlightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="12" r="3" fill="#e0791f" />
      <circle cx="12" cy="12" r="3" fill="#3a8ed4" />
      <circle cx="18" cy="12" r="3" fill="#7a4ad4" />
    </svg>
  );
}
/* Auge offen (Outline) — Toolbar-Button schaltet den Fokus-Modus AN.
   Bewusst dasselbe Motiv wie der Floating-Button im Fokus (gefüllt),
   damit klar ist: gleiche Funktion, anderer Zustand. */
function FocusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function PdfIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
