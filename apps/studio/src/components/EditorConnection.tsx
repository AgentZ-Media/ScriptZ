import { Show, createSignal } from "solid-js";
import { convex, createQuery } from "../lib/convex";
import { api } from "../../convex/_generated/api";
import { Modal } from "./ui";
import { pushToast, formatDate } from "../lib/ui";

/** base64url(JSON) - UTF-8 safe. */
function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Agency-only: manages the permanent editor connect key. Generating or
 *  rotating shows the wrapped `scriptzk1_...` connect code exactly once -
 *  only the key's hash is stored server-side, so it can never be displayed
 *  again. The agency pastes the code into the offline editor's settings. */
export function EditorConnection() {
  const status = createQuery(api.transfer.keyStatus, () => ({}));
  const [code, setCode] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [confirmRevoke, setConfirmRevoke] = createSignal(false);

  const rotate = async () => {
    setBusy(true);
    try {
      const res = await convex.mutation(api.transfer.rotateKey, {});
      const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL;
      const payload = JSON.stringify({ u: siteUrl, k: res.rawKey });
      setCode(`scriptzk1_${toBase64Url(payload)}`);
    } catch (e) {
      pushToast((e as Error).message ?? "Key konnte nicht erzeugt werden", "error");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await convex.mutation(api.transfer.revokeKey, {});
      pushToast("Verbindungs-Key widerrufen", "ok");
      setConfirmRevoke(false);
    } catch (e) {
      pushToast((e as Error).message ?? "Widerrufen fehlgeschlagen", "error");
    } finally {
      setBusy(false);
    }
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
    <section class="card" style="margin-top:2rem;padding:1rem 1.25rem;">
      <h2 style="margin:0 0 0.25rem;font-size:1.05rem;">Editor-Verbindung</h2>
      <p class="page-sub" style="margin:0 0 0.75rem;">
        Permanenter Verbindungs-Code für „An Studio senden“ im ScriptZ-Editor.
        Wird in den Editor-Einstellungen hinterlegt; das Ziel (Kunde/Ordner)
        wählt man dort bei jeder Übertragung.
      </p>
      <Show
        when={status.data()}
        fallback={
          <div class="row" style="align-items:center;gap:0.75rem;">
            <span class="page-sub">Kein aktiver Key.</span>
            <button class="btn btn-primary" disabled={busy()} onClick={() => void rotate()}>
              Key erzeugen
            </button>
          </div>
        }
      >
        {(s) => (
          <div class="row" style="align-items:center;gap:0.75rem;flex-wrap:wrap;">
            <span class="page-sub">
              Aktiver Key seit {formatDate(s().createdAt)} (erzeugt von {s().createdByName}).
            </span>
            <span class="spacer" />
            <button class="btn" disabled={busy()} onClick={() => void rotate()}>
              Rotieren
            </button>
            <button class="btn btn-ghost" disabled={busy()} onClick={() => setConfirmRevoke(true)}>
              Widerrufen
            </button>
          </div>
        )}
      </Show>

      {/* The one-time reveal of the freshly generated connect code. */}
      <Modal open={code() !== null} title="Verbindungs-Code" onClose={() => setCode(null)}>
        <p class="field-label" style="margin-top:0;line-height:1.4;">
          Diesen Code im ScriptZ-Editor unter Einstellungen → Studio einfügen.
          Er ist nur jetzt sichtbar - danach hilft nur Rotieren. Ein vorheriger
          Key ist ab sofort ungültig.
        </p>
        <label class="field">
          <span class="field-label">Verbindungs-Code</span>
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
        <div class="modal-actions">
          <button class="btn" onClick={() => setCode(null)}>
            Schließen
          </button>
          <span class="spacer" />
          <button class="btn btn-primary" onClick={() => void copy()}>
            Code kopieren
          </button>
        </div>
      </Modal>

      <Modal
        open={confirmRevoke()}
        title="Key widerrufen?"
        onClose={() => setConfirmRevoke(false)}
      >
        <p class="field-label" style="margin-top:0;line-height:1.4;">
          Verbundene Editoren können danach nichts mehr übertragen, bis ein
          neuer Key erzeugt und eingetragen wird.
        </p>
        <div class="modal-actions">
          <button class="btn" onClick={() => setConfirmRevoke(false)}>
            Abbrechen
          </button>
          <span class="spacer" />
          <button class="btn btn-danger" disabled={busy()} onClick={() => void revoke()}>
            Widerrufen
          </button>
        </div>
      </Modal>
    </section>
  );
}
