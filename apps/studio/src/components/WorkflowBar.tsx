import { createSignal, Show } from "solid-js";
import { convex } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import { withToast } from "../lib/ui";
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
        <div class="row wrap">
          <Show
            when={
              props.status !== "in_review" &&
              props.status !== "approved" &&
              props.status !== "filmed"
            }
          >
            <button class="btn btn-primary btn-sm" disabled={busy()} onClick={() => void act("in_review")}>
              Zur Freigabe stellen
            </button>
          </Show>
          <Show when={props.status === "in_review"}>
            <button class="btn btn-sm" disabled={busy()} onClick={() => void act("draft")}>
              Zurückziehen
            </button>
          </Show>
          <Show when={props.status === "approved"}>
            <button class="btn btn-primary btn-sm" disabled={busy()} onClick={() => void act("filmed")}>
              Als gedreht markieren
            </button>
          </Show>
          <Show when={props.status === "filmed"}>
            <button class="btn btn-sm" disabled={busy()} onClick={() => void act("approved")}>
              Gedreht zurücknehmen
            </button>
          </Show>
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
          <span class="field-label">Begründung für die Agentur</span>
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
