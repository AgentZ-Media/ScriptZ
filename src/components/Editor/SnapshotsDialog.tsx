import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { Modal } from "~/components/Common/Modal";
import { confirmDialog } from "~/components/Common/ConfirmDialog";
import { api } from "~/lib/api";
import { scriptsBus } from "~/lib/scriptsBus";
import { formatAbsolute } from "~/lib/format";
import type { Snapshot, SnapshotMeta } from "~/lib/types";
import { pushToast } from "~/stores/toasts";
import "./SnapshotsDialog.css";

export interface SnapshotsDialogProps {
  scriptId: string;
  scriptTitle?: string;
  open: boolean;
  onClose(): void;
  onRestore?(snapshotId: string): void;
}

export function SnapshotsDialog(props: SnapshotsDialogProps) {
  const [reloadKey, setReloadKey] = createSignal(0);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);

  // List of snapshots — refetches when scriptId/open/reloadKey changes
  const [snapshots] = createResource(
    () =>
      props.open ? { scriptId: props.scriptId, reload: reloadKey() } : null,
    async (q) => {
      if (!q) return [] as SnapshotMeta[];
      const list = await api.listSnapshots(q.scriptId);
      // sort newest first
      return [...list].sort((a, b) => b.created_at - a.created_at);
    },
  );

  // Selection: ensure default to newest
  const ensureSelection = () => {
    const list = snapshots();
    if (!list || list.length === 0) {
      if (selectedId() !== null) setSelectedId(null);
      return;
    }
    const cur = selectedId();
    if (!cur || !list.find((s) => s.id === cur)) setSelectedId(list[0].id);
  };

  const [selectedSnap] = createResource(
    () => {
      ensureSelection();
      const id = selectedId();
      return id ? id : null;
    },
    async (id) => {
      try {
        return (await api.getSnapshot(id)) as Snapshot;
      } catch {
        return null;
      }
    },
  );

  const previewText = createMemo(() => {
    const snap = selectedSnap();
    if (!snap) return "";
    return extractPreview(snap.content_json);
  });

  const onCreateManual = async () => {
    try {
      await api.createSnapshot(props.scriptId, "manual");
      pushToast("Snapshot erstellt", "ok");
      setReloadKey(reloadKey() + 1);
    } catch (e) {
      pushToast(`Snapshot fehlgeschlagen: ${String(e)}`, "error");
    }
  };

  const onDelete = async () => {
    const id = selectedId();
    if (!id) return;
    const ok = await confirmDialog({
      title: "Snapshot löschen?",
      body: "Dieser Snapshot wird unwiderruflich entfernt.",
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteSnapshot(id);
      pushToast("Snapshot gelöscht", "ok");
      setSelectedId(null);
      setReloadKey(reloadKey() + 1);
    } catch (e) {
      pushToast(`Löschen fehlgeschlagen: ${String(e)}`, "error");
    }
  };

  const onRestore = async () => {
    const id = selectedId();
    if (!id) return;
    const ok = await confirmDialog({
      title: "Snapshot wiederherstellen?",
      body: "Aktueller Stand wird als Auto-Snapshot gesichert. Fortfahren?",
      confirmLabel: "Wiederherstellen",
    });
    if (!ok) return;
    try {
      await api.restoreSnapshot(id);
      scriptsBus.bump();
      pushToast("Snapshot wiederhergestellt", "ok");
      props.onRestore?.(id);
      setReloadKey(reloadKey() + 1);
      props.onClose();
    } catch (e) {
      pushToast(`Wiederherstellen fehlgeschlagen: ${String(e)}`, "error");
    }
  };

  const title = () => `Snapshots${props.scriptTitle ? ` — ${props.scriptTitle}` : ""}`;

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={title()}
      maxWidth={860}
      footer={
        <>
          <button class="btn btn-danger" onClick={onDelete} disabled={!selectedId()}>
            Löschen
          </button>
          <span class="snap-spacer" />
          <button class="btn" onClick={props.onClose}>
            Schließen
          </button>
          <button class="btn btn-primary" onClick={onRestore} disabled={!selectedId()}>
            Wiederherstellen
          </button>
        </>
      }
    >
      <div class="snap-toolbar">
        <button class="btn" onClick={onCreateManual}>
          Manueller Snapshot jetzt erstellen
        </button>
      </div>
      <div class="snap-grid">
        <div
          class="snap-list"
          tabIndex={0}
          onKeyDown={(e) => {
            const list = snapshots() ?? [];
            if (list.length === 0) return;
            const idx = list.findIndex((s) => s.id === selectedId());
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelectedId(list[Math.min(list.length - 1, idx + 1)].id);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelectedId(list[Math.max(0, idx - 1)].id);
            } else if (e.key === "Home") {
              e.preventDefault();
              setSelectedId(list[0].id);
            } else if (e.key === "End") {
              e.preventDefault();
              setSelectedId(list[list.length - 1].id);
            } else if (e.key === "Enter") {
              e.preventDefault();
              void onRestore();
            }
          }}
        >
          <Show
            when={(snapshots()?.length ?? 0) > 0}
            fallback={<div class="snap-empty">Noch keine Snapshots.</div>}
          >
            <For each={snapshots()}>
              {(snap) => (
                <button
                  class={`snap-item${snap.id === selectedId() ? " is-active" : ""}`}
                  onClick={() => setSelectedId(snap.id)}
                  tabIndex={-1}
                >
                  <span class="snap-time">{formatAbsolute(snap.created_at)}</span>
                  <span class={`snap-badge snap-badge-${snap.trigger}`}>
                    {snap.trigger === "manual" ? "Manuell" : "Auto"}
                  </span>
                </button>
              )}
            </For>
          </Show>
        </div>
        <div class="snap-preview">
          <Show
            when={selectedSnap()}
            fallback={<div class="snap-empty">Kein Snapshot ausgewählt.</div>}
          >
            <pre class="snap-preview-text">{previewText() || "(leer)"}</pre>
          </Show>
        </div>
      </div>
    </Modal>
  );
}

/** Extract a plain-text preview from a Lexical EditorState JSON string. */
function extractPreview(json: string): string {
  try {
    const parsed = JSON.parse(json);
    const lines: string[] = [];
    walk(parsed?.root, lines);
    return lines.join("\n").slice(0, 4000);
  } catch {
    return "";
  }
}

function walk(node: any, out: string[], depth = 0) {
  if (!node || typeof node !== "object") return;
  // If this is a scriptz-* block, collect its text content as a single line.
  const t: string | undefined = node.type;
  if (typeof t === "string" && t.startsWith("scriptz-")) {
    const text = collectText(node).trim();
    if (text) out.push(text);
    return; // don't double-walk
  }
  // Otherwise, recurse children
  const children = Array.isArray(node.children) ? node.children : null;
  if (children) {
    for (const c of children) walk(c, out, depth + 1);
  }
}

function collectText(node: any): string {
  if (!node || typeof node !== "object") return "";
  if (typeof node.text === "string") return node.text;
  const children = Array.isArray(node.children) ? node.children : null;
  if (!children) return "";
  let s = "";
  for (const c of children) s += collectText(c);
  return s;
}
