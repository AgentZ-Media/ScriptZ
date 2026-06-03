import { createMemo, createSignal, For, Show } from "solid-js";
import { useParams, useSearchParams, useNavigate, A } from "@solidjs/router";
import { convex, createQuery } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import { useStudio } from "../context";
import { LoadingBlock, Empty, Modal, StatusBadge } from "../components/ui";
import { withToast, relativeTime, formatRange } from "../lib/ui";
import { exportScriptsBundle } from "../lib/exportBundle";
import { ReceiveFromEditor } from "../components/ReceiveFromEditor";

type FolderFilter = string; // "all" | "unfiled" | folderId

export function ClientWorkspace() {
  const params = useParams();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const { isAgency } = useStudio();

  const clientId = () => params.clientId;
  const folder = (): FolderFilter => (sp.folder as string) ?? "all";
  const search = () => (sp.q as string) ?? "";

  const client = createQuery(api.clients.get, () => ({ clientId: clientId() as never }));
  const folders = createQuery(api.folders.listByClient, () => ({ clientId: clientId() as never }));

  const itemArgs = () => {
    const f = folder();
    if (f === "all") return { clientId: clientId() as never };
    if (f === "unfiled") return { clientId: clientId() as never, folderId: null };
    return { clientId: clientId() as never, folderId: f as never };
  };
  const ideas = createQuery(api.ideas.listByClient, itemArgs);
  const scripts = createQuery(api.scripts.listByClient, itemArgs);
  const results = createQuery(api.search.search, () =>
    search().trim() ? { clientId: clientId() as never, query: search().trim() } : "skip",
  );

  const items = createMemo(() => {
    const list = [
      ...(ideas.data() ?? []).map((i) => ({ kind: "idea" as const, ...i })),
      ...(scripts.data() ?? []).map((s) => ({ kind: "script" as const, ...s })),
    ];
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    return list;
  });

  const openItem = (kind: "idea" | "script", id: string) =>
    navigate(`/c/${clientId()}/${kind}/${id}`);

  // ---- create dialogs ----
  const [createKind, setCreateKind] = createSignal<"idea" | "script" | null>(null);
  const [title, setTitle] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const folderForNew = () => {
    const f = folder();
    return f === "all" || f === "unfiled" ? undefined : (f as never);
  };
  const doCreate = async () => {
    const k = createKind();
    if (!k || !title().trim()) return;
    setBusy(true);
    if (k === "idea") {
      const id = await withToast(
        () =>
          convex.mutation(api.ideas.create, {
            clientId: clientId() as never,
            folderId: folderForNew(),
            title: title().trim(),
            notes: notes().trim() || undefined,
          }),
        "Idee angelegt",
      );
      setBusy(false);
      if (id) closeCreate(() => openItem("idea", id));
    } else {
      const id = await withToast(
        () =>
          convex.mutation(api.scripts.create, {
            clientId: clientId() as never,
            folderId: folderForNew(),
            title: title().trim(),
          }),
        "Skript angelegt",
      );
      setBusy(false);
      if (id) closeCreate(() => openItem("script", id));
    }
  };
  const closeCreate = (then?: () => void) => {
    setCreateKind(null);
    setTitle("");
    setNotes("");
    then?.();
  };

  // ---- create / edit folder ----
  const [folderOpen, setFolderOpen] = createSignal(false);
  const [editFolderId, setEditFolderId] = createSignal<string | null>(null);
  const [fName, setFName] = createSignal("");
  const [fStart, setFStart] = createSignal("");
  const [fEnd, setFEnd] = createSignal("");
  const [fTarget, setFTarget] = createSignal("");

  const openNewFolder = () => {
    setEditFolderId(null);
    setFName("");
    setFStart("");
    setFEnd("");
    setFTarget("");
    setFolderOpen(true);
  };
  const openEditFolder = (f: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    targetCount: number | null;
  }) => {
    setEditFolderId(f.id);
    setFName(f.name);
    setFStart(f.startDate ?? "");
    setFEnd(f.endDate ?? "");
    setFTarget(f.targetCount != null ? String(f.targetCount) : "");
    setFolderOpen(true);
  };
  const saveFolder = async () => {
    if (!fName().trim()) return;
    setBusy(true);
    const id = editFolderId();
    if (id) {
      const ok = await withToast(
        () =>
          convex.mutation(api.folders.update, {
            folderId: id as never,
            name: fName().trim(),
            startDate: fStart() || null,
            endDate: fEnd() || null,
            targetCount: fTarget() ? Number(fTarget()) : null,
          }),
        "Ordner aktualisiert",
      );
      setBusy(false);
      if (ok !== undefined) setFolderOpen(false);
    } else {
      const newId = await withToast(
        () =>
          convex.mutation(api.folders.create, {
            clientId: clientId() as never,
            name: fName().trim(),
            startDate: fStart() || undefined,
            endDate: fEnd() || undefined,
            targetCount: fTarget() ? Number(fTarget()) : undefined,
          }),
        "Ordner angelegt",
      );
      setBusy(false);
      if (newId) {
        setFolderOpen(false);
        setSp({ folder: newId });
      }
    }
  };
  const deleteFolder = async () => {
    const id = editFolderId();
    if (!id) return;
    if (
      !confirm(
        'Diesen Ordner löschen? Enthaltene Ideen und Skripte bleiben erhalten und landen unter "Ohne Ordner".',
      )
    )
      return;
    setBusy(true);
    const ok = await withToast(
      () => convex.mutation(api.folders.remove, { folderId: id as never }),
      "Ordner gelöscht",
    );
    setBusy(false);
    if (ok !== undefined) {
      setFolderOpen(false);
      if (folder() === id) setSp({ folder: undefined });
    }
  };

  // ---- move items between folders (agency) ----
  type DragRef = { kind: "idea" | "script"; id: string; folderId: string | null };
  const [dragItem, setDragItem] = createSignal<DragRef | null>(null);
  const [overFolder, setOverFolder] = createSignal<string | null | undefined>(undefined);
  const [menu, setMenu] = createSignal<{ x: number; y: number; item: DragRef } | null>(null);

  const dropAllowed = (target: string | null) => {
    const d = dragItem();
    return isAgency() && !!d && (d.folderId ?? null) !== target;
  };
  const moveItem = async (it: DragRef, target: string | null) => {
    if ((it.folderId ?? null) === target) return;
    if (it.kind === "idea") {
      await withToast(
        () => convex.mutation(api.ideas.update, { ideaId: it.id as never, folderId: target as never }),
        "Verschoben",
      );
    } else {
      await withToast(
        () => convex.mutation(api.scripts.updateMeta, { scriptId: it.id as never, folderId: target as never }),
        "Verschoben",
      );
    }
  };
  const dropOnFolder = (e: DragEvent, target: string | null) => {
    e.preventDefault();
    const d = dragItem();
    setDragItem(null);
    setOverFolder(undefined);
    if (d) void moveItem(d, target);
  };
  const openMenu = (e: MouseEvent, it: DragRef) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, item: it });
  };
  const deleteItem = async (it: DragRef) => {
    const isIdea = it.kind === "idea";
    if (!confirm(isIdea ? "Diese Idee löschen?" : "Dieses Skript löschen?")) return;
    if (isIdea) {
      await withToast(
        () => convex.mutation(api.ideas.remove, { ideaId: it.id as never }),
        "Idee gelöscht",
      );
    } else {
      await withToast(
        () => convex.mutation(api.scripts.remove, { scriptId: it.id as never }),
        "Skript gelöscht",
      );
    }
  };

  const exportApproved = () => {
    const ids = (scripts.data() ?? []).filter((s) => s.status === "approved").map((s) => s.id);
    void exportScriptsBundle(ids, `${client.data()?.name ?? "Export"}.pdf`);
  };

  // Target for the offline-editor handoff: the current folder (if a real one
  // is selected) under this client. The label is shown in the editor.
  const currentFolder = () => {
    const f = folder();
    if (f === "all" || f === "unfiled") return undefined;
    return (folders.data()?.folders ?? []).find((x) => x.id === f);
  };
  const receiveLabel = () => {
    const name = client.data()?.name ?? "Kunde";
    const cf = currentFolder();
    return cf ? `${name} / ${cf.name}` : name;
  };

  return (
    <main class="page">
      <div class="crumbs" style="margin-bottom:1rem;">
        <A href="/">Kunden</A>
        <span class="sep">/</span>
        <span class="cur">{client.data()?.name ?? "…"}</span>
      </div>

      <div class="page-head">
        <div>
          <h1 class="page-title">{client.data()?.name ?? "…"}</h1>
        </div>
        <div class="spacer" />
        <input
          class="input"
          style="max-width:14rem;"
          placeholder="Suchen …"
          value={search()}
          onInput={(e) => setSp({ q: e.currentTarget.value || undefined })}
        />
        <button class="btn" onClick={exportApproved} title="Freigegebene Skripte als PDF-Bündel">
          Export
        </button>
        <Show when={isAgency()}>
          <ReceiveFromEditor
            clientId={clientId() as string}
            folderId={currentFolder()?.id}
            label={receiveLabel()}
          />
        </Show>
        <Show when={isAgency()}>
          <button
            class="btn btn-icon"
            title="Firma & Zugänge verwalten"
            onClick={() => navigate(`/c/${clientId()}/settings`)}
          >
            ⚙
          </button>
        </Show>
      </div>

      <Show when={search().trim()}>
        <SearchResults
          loading={results.loading()}
          rows={results.data() ?? []}
          onOpen={(r) => openItem(r.type, r.id)}
        />
      </Show>

      <Show when={!search().trim()}>
        <div class="workspace">
          <aside class="ws-side">
            <FolderButton label="Alle" active={folder() === "all"} onClick={() => setSp({ folder: undefined })} />
            <Show when={folders.data()?.unfiled || isAgency()}>
              <FolderButton
                label="Ohne Ordner"
                active={folder() === "unfiled"}
                onClick={() => setSp({ folder: "unfiled" })}
                dropOver={overFolder() === null && dropAllowed(null)}
                onDragOver={(e) => {
                  if (dropAllowed(null)) {
                    e.preventDefault();
                    setOverFolder(null);
                  }
                }}
                onDragLeave={() => {
                  if (overFolder() === null) setOverFolder(undefined);
                }}
                onDrop={(e) => dropOnFolder(e, null)}
              />
            </Show>
            <div class="ws-side-head">
              <span>Zeiträume</span>
              <Show when={isAgency()}>
                <button class="btn btn-ghost btn-sm" title="Neuer Zeitraum / Ordner" onClick={openNewFolder}>
                  +
                </button>
              </Show>
            </div>
            <Show when={isAgency() && (folders.data()?.folders.length ?? 0) === 0}>
              <p class="ws-side-hint">Noch keine Ordner. Mit „+“ einen Zeitraum anlegen.</p>
            </Show>
            <For each={folders.data()?.folders ?? []}>
              {(f) => (
                <div
                  class={`ws-folder-wrap ${folder() === f.id ? "is-active" : ""}`}
                  classList={{ "is-drop": overFolder() === f.id && dropAllowed(f.id) }}
                  onDragOver={(e) => {
                    if (dropAllowed(f.id)) {
                      e.preventDefault();
                      setOverFolder(f.id);
                    }
                  }}
                  onDragLeave={() => {
                    if (overFolder() === f.id) setOverFolder(undefined);
                  }}
                  onDrop={(e) => dropOnFolder(e, f.id)}
                >
                  <button
                    class={`ws-folder ${folder() === f.id ? "is-active" : ""}`}
                    onClick={() => setSp({ folder: f.id })}
                  >
                    <span class="ws-folder-name">{f.name}</span>
                    <Show when={formatRange(f.startDate, f.endDate)}>
                      <span class="ws-folder-range">{formatRange(f.startDate, f.endDate)}</span>
                    </Show>
                    <span class="ws-folder-progress">
                      {f.approved}
                      {f.targetCount ? ` / ${f.targetCount}` : ` / ${f.total}`} freigegeben
                      <Show when={f.targetCount}>
                        <span class="ws-progress-bar">
                          <span
                            class="ws-progress-fill"
                            style={{ width: `${Math.min(100, Math.round((f.approved / (f.targetCount || 1)) * 100))}%` }}
                          />
                        </span>
                      </Show>
                    </span>
                  </button>
                  <Show when={isAgency()}>
                    <button
                      class="ws-folder-edit"
                      title="Ordner bearbeiten"
                      onClick={() => openEditFolder(f)}
                    >
                      ⋯
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </aside>

          <section class="ws-main">
            <Show when={isAgency()}>
              <div class="row" style="margin-bottom:0.9rem;">
                <button class="btn btn-primary btn-sm" onClick={() => { setCreateKind("idea"); }}>
                  + Neue Idee
                </button>
                <button class="btn btn-sm" onClick={() => { setCreateKind("script"); }}>
                  + Neues Skript
                </button>
              </div>
            </Show>

            <Show when={!ideas.loading() && !scripts.loading()} fallback={<LoadingBlock />}>
              <Show
                when={items().length > 0}
                fallback={
                  <Empty title={isAgency() ? "Noch nichts hier" : "Noch nichts freigegeben"}>
                    <Show when={isAgency()}>
                      <button class="btn btn-primary" onClick={() => setCreateKind("idea")}>
                        Erste Idee anlegen
                      </button>
                    </Show>
                  </Empty>
                }
              >
                <ul class="item-list">
                  <For each={items()}>
                    {(it) => (
                      <li
                        class="item-row"
                        classList={{ "is-dragging": dragItem()?.id === it.id }}
                        draggable={isAgency()}
                        onClick={() => openItem(it.kind, it.id)}
                        onContextMenu={(e) => {
                          if (isAgency())
                            openMenu(e, { kind: it.kind, id: it.id, folderId: it.folderId ?? null });
                        }}
                        onDragStart={(e) => {
                          setDragItem({ kind: it.kind, id: it.id, folderId: it.folderId ?? null });
                          if (e.dataTransfer) {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", it.id);
                          }
                        }}
                        onDragEnd={() => {
                          setDragItem(null);
                          setOverFolder(undefined);
                        }}
                      >
                        <span class={`item-kind item-kind-${it.kind}`}>
                          {it.kind === "idea" ? "Idee" : "Skript"}
                        </span>
                        <span class="item-title">{it.title}</span>
                        <Show when={it.kind === "idea" && (it as { scriptId?: string | null }).scriptId}>
                          <span class="item-linked" title="In ein Skript überführt">→ Skript</span>
                        </Show>
                        <span class="spacer" />
                        <span class="item-time">{relativeTime(it.updatedAt)}</span>
                        <StatusBadge status={it.status} />
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </section>
        </div>
      </Show>

      {/* Create idea/script */}
      <Modal
        open={createKind() !== null}
        title={createKind() === "idea" ? "Neue Idee" : "Neues Skript"}
        onClose={() => closeCreate()}
      >
        <label class="field">
          <span class="field-label">Titel</span>
          <input class="input" value={title()} onInput={(e) => setTitle(e.currentTarget.value)} autofocus />
        </label>
        <Show when={createKind() === "idea"}>
          <label class="field">
            <span class="field-label">Notizen (optional)</span>
            <textarea class="textarea" value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
          </label>
        </Show>
        <div class="modal-actions">
          <button class="btn" onClick={() => closeCreate()}>
            Abbrechen
          </button>
          <button class="btn btn-primary" disabled={busy() || !title().trim()} onClick={() => void doCreate()}>
            Anlegen
          </button>
        </div>
      </Modal>

      {/* Create / edit folder */}
      <Modal
        open={folderOpen()}
        title={editFolderId() ? "Ordner bearbeiten" : "Neuer Zeitraum / Ordner"}
        onClose={() => setFolderOpen(false)}
      >
        <label class="field">
          <span class="field-label">Name</span>
          <input class="input" value={fName()} onInput={(e) => setFName(e.currentTarget.value)} placeholder="z. B. August oder Q3-Dreh" autofocus />
        </label>
        <div class="row">
          <label class="field" style="flex:1;">
            <span class="field-label">Von</span>
            <input class="input" type="date" value={fStart()} onInput={(e) => setFStart(e.currentTarget.value)} />
          </label>
          <label class="field" style="flex:1;">
            <span class="field-label">Bis</span>
            <input class="input" type="date" value={fEnd()} onInput={(e) => setFEnd(e.currentTarget.value)} />
          </label>
          <label class="field" style="width:6rem;">
            <span class="field-label">Ziel</span>
            <input class="input" type="number" min="0" value={fTarget()} onInput={(e) => setFTarget(e.currentTarget.value)} placeholder="z. B. 30" />
          </label>
        </div>
        <div class="modal-actions">
          <Show when={editFolderId()}>
            <button class="btn btn-danger" disabled={busy()} onClick={() => void deleteFolder()}>
              Löschen
            </button>
          </Show>
          <span class="spacer" />
          <button class="btn" onClick={() => setFolderOpen(false)}>
            Abbrechen
          </button>
          <button class="btn btn-primary" disabled={busy() || !fName().trim()} onClick={() => void saveFolder()}>
            {editFolderId() ? "Speichern" : "Anlegen"}
          </button>
        </div>
      </Modal>

      {/* Move-to-folder context menu (right-click on an item) */}
      <Show when={menu()}>
        {(m) => {
          const targets = () =>
            (folders.data()?.folders ?? []).filter((f) => f.id !== (m().item.folderId ?? null));
          return (
            <>
              <div
                class="ctx-backdrop"
                onClick={() => setMenu(null)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu(null);
                }}
              />
              <div
                class="ctx-menu"
                style={{
                  left: `${Math.min(m().x, window.innerWidth - 240)}px`,
                  top: `${Math.min(m().y, window.innerHeight - 280)}px`,
                }}
              >
                <div class="ctx-menu-label">Verschieben nach</div>
                <Show when={(m().item.folderId ?? null) !== null}>
                  <button
                    class="ctx-menu-item"
                    onClick={() => {
                      void moveItem(m().item, null);
                      setMenu(null);
                    }}
                  >
                    Ohne Ordner
                  </button>
                </Show>
                <For each={targets()}>
                  {(f) => (
                    <button
                      class="ctx-menu-item"
                      onClick={() => {
                        void moveItem(m().item, f.id);
                        setMenu(null);
                      }}
                    >
                      {f.name}
                    </button>
                  )}
                </For>
                <Show when={targets().length === 0 && (m().item.folderId ?? null) === null}>
                  <div class="ctx-menu-empty">Keine Ordner vorhanden</div>
                </Show>
                <div class="ctx-menu-sep" />
                <button
                  class="ctx-menu-item ctx-menu-danger"
                  onClick={() => {
                    const it = m().item;
                    setMenu(null);
                    void deleteItem(it);
                  }}
                >
                  {m().item.kind === "idea" ? "Idee löschen" : "Skript löschen"}
                </button>
              </div>
            </>
          );
        }}
      </Show>
    </main>
  );
}

function FolderButton(props: {
  label: string;
  active: boolean;
  onClick: () => void;
  dropOver?: boolean;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
}) {
  return (
    <button
      class={`ws-folder ws-folder-flat ${props.active ? "is-active" : ""}`}
      classList={{ "is-drop": !!props.dropOver }}
      onClick={props.onClick}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
    >
      <span class="ws-folder-name">{props.label}</span>
    </button>
  );
}

function SearchResults(props: {
  loading: boolean;
  rows: { type: "idea" | "script"; id: string; title: string; status: string }[];
  onOpen: (r: { type: "idea" | "script"; id: string }) => void;
}) {
  return (
    <Show when={!props.loading} fallback={<LoadingBlock />}>
      <Show when={props.rows.length > 0} fallback={<Empty title="Keine Treffer" />}>
        <ul class="item-list">
          <For each={props.rows}>
            {(r) => (
              <li class="item-row" onClick={() => props.onOpen(r)}>
                <span class={`item-kind item-kind-${r.type}`}>{r.type === "idea" ? "Idee" : "Skript"}</span>
                <span class="item-title">{r.title}</span>
                <span class="spacer" />
                <StatusBadge status={r.status} />
              </li>
            )}
          </For>
        </ul>
      </Show>
    </Show>
  );
}
