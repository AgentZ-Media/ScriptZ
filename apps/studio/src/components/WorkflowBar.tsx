import { createSignal, For, Show } from "solid-js";
import { convex } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import { ITEM_STATUSES, statusLabel, withToast } from "../lib/ui";
import { Modal } from "./ui";

type TargetType = "idea" | "script";

async function setStatus(
  targetType: TargetType,
  id: string,
  status: string,
  decisionNote?: string,
) {
  if (targetType === "idea") {
    return await convex.mutation(api.ideas.setStatus, {
      ideaId: id as never,
      status: status as never,
      decisionNote,
    });
  }
  return await convex.mutation(api.scripts.setStatus, {
    scriptId: id as never,
    status: status as never,
    decisionNote,
  });
}

export function WorkflowBar(props: {
  targetType: TargetType;
  id: string;
  status: string;
  isAgency: boolean;
}) {
  const [busy, setBusy] = createSignal(false);
  const [noteFor, setNoteFor] = createSignal<"rejected" | "changes_requested" | null>(null);
  const [note, setNote] = createSignal("");

  const act = async (status: string, decisionNote?: string) => {
    setBusy(true);
    const ok = await withToast(
      () => setStatus(props.targetType, props.id, status, decisionNote),
      status === "approved"
        ? "Freigegeben"
        : status === "filmed"
          ? "Als gedreht markiert"
          : status === "rejected"
            ? "Abgelehnt"
            : status === "changes_requested"
              ? "Änderung erbeten"
              : status === "in_review"
                ? "Zur Freigabe gestellt"
                : "Aktualisiert",
    );
    setBusy(false);
    if (ok !== undefined) {
      setNoteFor(null);
      setNote("");
    }
  };

  const submitNote = () => {
    const target = noteFor();
    if (!target) return;
    if (!note().trim()) return;
    void act(target, note().trim());
  };

  return (
    <>
      <Show when={props.isAgency}>
        {/* The agency can override an item to any status directly. */}
        <div class="row wrap">
          <span class="field-label workflow-set-label">Status setzen:</span>
          <For each={ITEM_STATUSES.filter((s) => s !== props.status)}>
            {(s) => (
              <button
                class={
                  s === "rejected"
                    ? "btn btn-danger btn-sm"
                    : s === "approved" || s === "in_review"
                      ? "btn btn-primary btn-sm"
                      : "btn btn-sm"
                }
                disabled={busy()}
                onClick={() => {
                  if (s === "rejected" || s === "changes_requested") {
                    setNote("");
                    setNoteFor(s);
                  } else {
                    void act(s);
                  }
                }}
              >
                {statusLabel(s)}
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={!props.isAgency && props.status === "in_review"}>
        <div class="row wrap">
          <button class="btn btn-primary btn-sm" disabled={busy()} onClick={() => void act("approved")}>
            Freigeben
          </button>
          <button
            class="btn btn-sm"
            disabled={busy()}
            onClick={() => {
              setNote("");
              setNoteFor("changes_requested");
            }}
          >
            Änderung erbeten
          </button>
          <button
            class="btn btn-danger btn-sm"
            disabled={busy()}
            onClick={() => {
              setNote("");
              setNoteFor("rejected");
            }}
          >
            Ablehnen
          </button>
        </div>
      </Show>

      <Modal
        open={noteFor() !== null}
        title={noteFor() === "rejected" ? "Ablehnen" : "Änderung erbeten"}
        onClose={() => setNoteFor(null)}
      >
        <label class="field">
          <span class="field-label">Begründung</span>
          <textarea
            class="textarea"
            value={note()}
            onInput={(e) => setNote(e.currentTarget.value)}
            placeholder="Was soll geändert werden bzw. warum abgelehnt?"
            autofocus
          />
        </label>
        <div class="modal-actions">
          <button class="btn" onClick={() => setNoteFor(null)}>
            Abbrechen
          </button>
          <button
            class={noteFor() === "rejected" ? "btn btn-danger" : "btn btn-primary"}
            disabled={!note().trim() || busy()}
            onClick={submitNote}
          >
            {noteFor() === "rejected" ? "Ablehnen" : "Änderung anfragen"}
          </button>
        </div>
      </Modal>
    </>
  );
}
