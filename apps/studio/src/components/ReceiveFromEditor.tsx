import { Show, createSignal, onCleanup } from "solid-js";
import { convex } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import { Modal } from "./ui";
import { pushToast } from "../lib/ui";

/** base64url(JSON) - UTF-8 safe so labels with umlauts survive. */
function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fmtRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Agency-only: generates a single-use pairing code bound to this client (and
 *  the optionally selected folder). The agency pastes it into the offline
 *  editor's "Send to Studio" flow; imported items land here as drafts. */
export function ReceiveFromEditor(props: {
  clientId: string;
  folderId?: string;
  label: string;
}) {
  const [open, setOpen] = createSignal(false);
  const [code, setCode] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [remaining, setRemaining] = createSignal(0);

  let timer: number | undefined;
  const stopTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
  onCleanup(stopTimer);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await convex.mutation(api.transfer.createTransferToken, {
        clientId: props.clientId as never,
        folderId: (props.folderId as never) ?? undefined,
        label: props.label,
      });
      const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL;
      const payload = JSON.stringify({
        u: `${siteUrl}/transfer`,
        t: res.rawToken,
        l: props.label,
      });
      setCode(`scriptz1_${toBase64Url(payload)}`);
      stopTimer();
      const tick = () =>
        setRemaining(Math.max(0, Math.round((res.expiresAt - Date.now()) / 1000)));
      tick();
      timer = window.setInterval(tick, 1000);
    } catch (e) {
      pushToast((e as Error).message ?? "Code konnte nicht erzeugt werden", "error");
    } finally {
      setBusy(false);
    }
  };

  const openDialog = () => {
    setCode(null);
    setRemaining(0);
    setOpen(true);
    void generate();
  };

  const close = () => {
    stopTimer();
    setOpen(false);
  };

  const copy = async () => {
    const c = code();
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c);
      pushToast("Code kopiert", "ok");
    } catch {
      pushToast("Kopieren fehlgeschlagen - Code manuell markieren", "error");
    }
  };

  return (
    <>
      <button
        class="btn"
        onClick={openDialog}
        title="Skripte/Ideen aus dem Offline-Editor empfangen"
      >
        Vom Editor empfangen
      </button>
      <Modal open={open()} title="Vom Editor empfangen" onClose={close}>
        <p class="field-label" style="margin-top:0;line-height:1.4;">
          Erzeuge einen Einmal-Code und füge ihn im Offline-Editor unter „An Studio
          senden“ ein. Importiertes landet als Entwurf bei {props.label}.
        </p>
        <Show when={code()} fallback={<p>Code wird erzeugt …</p>}>
          <label class="field">
            <span class="field-label">Empfangs-Code</span>
            <textarea
              class="textarea"
              readOnly
              rows={3}
              style="font-family:monospace;font-size:0.78rem;"
              onClick={(e) => e.currentTarget.select()}
            >
              {code()}
            </textarea>
          </label>
          <p class="field-label">
            <Show
              when={remaining() > 0}
              fallback={<>Abgelaufen - bitte neu erzeugen.</>}
            >
              Gültig noch {fmtRemaining(remaining())} · gilt für einen Transfer.
            </Show>
          </p>
          <div class="modal-actions">
            <button class="btn" disabled={busy()} onClick={() => void generate()}>
              Neu erzeugen
            </button>
            <span class="spacer" />
            <button class="btn btn-primary" onClick={() => void copy()}>
              Code kopieren
            </button>
          </div>
        </Show>
      </Modal>
    </>
  );
}
