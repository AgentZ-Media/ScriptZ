import { createMemo, createSignal, For, Show } from "solid-js";
import { useParams, useSearchParams, useNavigate, A } from "@solidjs/router";
import { convex, createQuery } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import { useStudio } from "../context";
import { LoadingBlock, Empty, Modal, StatusBadge } from "../components/ui";
import { withToast, relativeTime, formatRange } from "../lib/ui";
import { exportScriptsBundle } from "../lib/exportBundle";

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

  // ---- new folder ----
  const [folderOpen, setFolderOpen] = createSignal(false);
  const [fName, setFName] = createSignal("");
  const [fStart, setFStart] = createSignal("");
  const [fEnd, setFEnd] = createSignal("");
  const [fTarget, setFTarget] = createSignal("");
  const createFolder = async () => {
    if (!fName().trim()) return;
    setBusy(true);
    const id = await withToast(
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
    if (id) {
      setFolderOpen(false);
      setFName("");
      setFStart("");
      setFEnd("");
      setFTarget("");
      setSp({ folder: id });
    }
  };

  const exportApproved = () => {
    const ids = (scripts.data() ?? []).filter((s) => s.status === "approved").map((s) => s.id);
    void exportScriptsBundle(ids, `${client.data()?.name ?? "Export"}.pdf`);
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
            <Show when={folders.data()?.unfiled}>
              <FolderButton
                label="Ohne Ordner"
                active={folder() === "unfiled"}
                onClick={() => setSp({ folder: "unfiled" })}
              />
            </Show>
            <div class="ws-side-head">
              <span>Zeiträume</span>
              <Show when={isAgency()}>
                <button class="btn btn-ghost btn-sm" onClick={() => setFolderOpen(true)}>
                  +
                </button>
              </Show>
            </div>
            <For each={folders.data()?.folders ?? []}>
              {(f) => (
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
                      <li class="item-row" onClick={() => openItem(it.kind, it.id)}>
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

      {/* New folder */}
      <Modal open={folderOpen()} title="Neuer Zeitraum / Ordner" onClose={() => setFolderOpen(false)}>
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
          <button class="btn" onClick={() => setFolderOpen(false)}>
            Abbrechen
          </button>
          <button class="btn btn-primary" disabled={busy() || !fName().trim()} onClick={() => void createFolder()}>
            Anlegen
          </button>
        </div>
      </Modal>

    </main>
  );
}

function FolderButton(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button class={`ws-folder ws-folder-flat ${props.active ? "is-active" : ""}`} onClick={props.onClick}>
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
