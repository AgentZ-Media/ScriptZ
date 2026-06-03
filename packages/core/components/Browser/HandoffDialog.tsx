import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { Modal } from "../Common/Modal";
import { pushToast } from "../../stores/toasts";
import { t, tPlural } from "../../i18n";
import {
  PairingCodeError,
  parsePairingCode,
  sendHandoff,
  targetHost,
  type HandoffResult,
  type PairingTarget,
} from "../../lib/handoff";
import "./HandoffDialog.css";

export interface HandoffDialogProps {
  open: boolean;
  scriptIds: string[];
  ideaIds: string[];
  onClose: () => void;
  /** Fired after a (possibly partial) successful transfer, so the caller can
   *  clear its selection and refresh lists. */
  onSent: (result: HandoffResult) => void;
}

export function HandoffDialog(props: HandoffDialogProps) {
  const [code, setCode] = createSignal("");
  const [deleteAfter, setDeleteAfter] = createSignal(true);
  const [sending, setSending] = createSignal(false);

  let prevOpen = false;
  createEffect(() => {
    if (props.open && !prevOpen) {
      setCode("");
      setDeleteAfter(true);
      setSending(false);
    }
    prevOpen = props.open;
  });

  const parsed = createMemo<{ target: PairingTarget | null; error: string | null }>(() => {
    const c = code().trim();
    if (!c) return { target: null, error: null };
    try {
      return { target: parsePairingCode(c), error: null };
    } catch (e) {
      return { target: null, error: e instanceof PairingCodeError ? e.message : String(e) };
    }
  });

  const summary = createMemo(() => {
    const parts: string[] = [];
    if (props.scriptIds.length > 0) parts.push(tPlural("units.scripts", props.scriptIds.length));
    if (props.ideaIds.length > 0) parts.push(tPlural("units.ideas", props.ideaIds.length));
    return parts.join(", ");
  });

  const canSend = createMemo(
    () =>
      !sending() &&
      parsed().target !== null &&
      props.scriptIds.length + props.ideaIds.length > 0,
  );

  async function onSend() {
    const target = parsed().target;
    if (!target || !canSend()) return;
    setSending(true);
    try {
      const res = await sendHandoff(
        target,
        { scriptIds: props.scriptIds, ideaIds: props.ideaIds },
        { deleteAfter: deleteAfter() },
      );
      const accepted = res.acceptedScriptIds.length + res.acceptedIdeaIds.length;
      if (accepted < res.total) {
        pushToast(t("handoff.toast.partial", { accepted, total: res.total }), "info");
      } else {
        pushToast(t("handoff.toast.success", { summary: summary() }), "ok");
      }
      props.onSent(res);
      props.onClose();
    } catch (e) {
      pushToast((e as Error).message ?? String(e), "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={props.open}
      onClose={() => (sending() ? null : props.onClose())}
      title={t("handoff.title")}
      footer={
        <>
          <button class="btn" onClick={() => props.onClose()} disabled={sending()}>
            {t("common.cancel")}
          </button>
          <button class="btn btn-primary" onClick={onSend} disabled={!canSend()}>
            {sending() ? t("handoff.sending") : t("handoff.send")}
          </button>
        </>
      }
    >
      <div class="handoff-form">
        <p class="handoff-intro">{t("handoff.intro")}</p>
        <p class="handoff-selection">{t("handoff.selection", { summary: summary() })}</p>

        <label class="handoff-label" for="handoff-code">
          {t("handoff.code.label")}
        </label>
        <input
          id="handoff-code"
          class="handoff-input"
          value={code()}
          onInput={(e) => setCode(e.currentTarget.value)}
          placeholder={t("handoff.code.placeholder")}
          spellcheck={false}
          autocomplete="off"
        />

        <Show when={parsed().error}>
          <p class="handoff-error">{parsed().error}</p>
        </Show>

        <Show
          when={parsed().target}
          fallback={
            <Show when={!parsed().error}>
              <p class="handoff-hint">{t("handoff.code.hint")}</p>
            </Show>
          }
        >
          {(target) => (
            <p class="handoff-target">
              {target().label
                ? t("handoff.target.labeled", {
                    host: targetHost(target()),
                    label: target().label ?? "",
                  })
                : t("handoff.target", { host: targetHost(target()) })}
            </p>
          )}
        </Show>

        <label class="handoff-opt">
          <input
            type="checkbox"
            checked={deleteAfter()}
            onChange={(e) => setDeleteAfter(e.currentTarget.checked)}
          />
          <span>{t("handoff.deleteAfter")}</span>
        </label>
      </div>
    </Modal>
  );
}
