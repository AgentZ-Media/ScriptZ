import { Show, createMemo, createSignal } from "solid-js";
import { settingsStore } from "../../../stores/settings";
import { pushToast } from "../../../stores/toasts";
import { t, tPlural } from "../../../i18n";
import {
  ConnectCodeError,
  connectionHost,
  fetchTargets,
  parseConnectCode,
  tryParseConnectCode,
  type StudioConnection,
} from "../../../lib/handoff";

/** Connection to a ScriptZ Studio. The user pastes the permanent connect
 *  code generated in Studio's admin UI; while no code is stored, the app
 *  shows no Studio surface anywhere else (most users don't have a Studio). */
export function SettingsStudio() {
  const [draft, setDraft] = createSignal("");
  const [draftError, setDraftError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [testResult, setTestResult] = createSignal<string | null>(null);

  // A stored-but-broken code should never happen (we validate before
  // saving), but render it as "not connected" instead of crashing.
  const connection = createMemo<StudioConnection | null>(() =>
    tryParseConnectCode(settingsStore.studioConnectCode()),
  );

  async function connect() {
    const raw = draft().trim();
    if (!raw) return;
    let conn: StudioConnection;
    try {
      conn = parseConnectCode(raw);
    } catch (e) {
      setDraftError(e instanceof ConnectCodeError ? e.message : String(e));
      return;
    }
    setDraftError(null);
    setBusy(true);
    try {
      // Verify against Studio before persisting, so a revoked or mistyped
      // key fails here and not silently on the first transfer.
      const clients = await fetchTargets(conn);
      await settingsStore.setStudioConnectCode(raw);
      setDraft("");
      setTestResult(tPlural("settings.studio.test.ok", clients.length));
      pushToast(t("settings.studio.toast.connected"), "ok");
    } catch (e) {
      setDraftError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    const conn = connection();
    if (!conn) return;
    setBusy(true);
    setTestResult(null);
    try {
      const clients = await fetchTargets(conn);
      setTestResult(tPlural("settings.studio.test.ok", clients.length));
    } catch (e) {
      setTestResult((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    await settingsStore.setStudioConnectCode("");
    setTestResult(null);
    setDraft("");
    setDraftError(null);
    pushToast(t("settings.studio.toast.disconnected"), "ok");
  }

  return (
    <>
      <h3>{t("settings.section.studio")}</h3>
      <div class="settings-pane-sub">{t("settings.studio.sub")}</div>

      <Show
        when={connection()}
        fallback={
          <div class="settings-studio">
            <label class="row-label" for="studio-connect-code">
              {t("settings.studio.code.label")}
            </label>
            <input
              id="studio-connect-code"
              class="settings-studio-input"
              value={draft()}
              onInput={(e) => {
                setDraft(e.currentTarget.value);
                setDraftError(null);
              }}
              placeholder={t("settings.studio.code.placeholder")}
              spellcheck={false}
              autocomplete="off"
            />
            <Show when={draftError()}>
              <p class="settings-studio-error">{draftError()}</p>
            </Show>
            <p class="row-help">{t("settings.studio.code.help")}</p>
            <div class="settings-studio-actions">
              <button
                class="btn btn-primary"
                disabled={busy() || !draft().trim()}
                onClick={() => void connect()}
              >
                {busy() ? t("settings.studio.connecting") : t("settings.studio.connect")}
              </button>
            </div>
          </div>
        }
      >
        {(conn) => (
          <div class="settings-studio">
            <p class="settings-studio-status">
              {t("settings.studio.connected", { host: connectionHost(conn()) })}
            </p>
            <Show when={testResult()}>
              <p class="row-help">{testResult()}</p>
            </Show>
            <div class="settings-studio-actions">
              <button class="btn" disabled={busy()} onClick={() => void test()}>
                {t("settings.studio.test")}
              </button>
              <button class="btn btn-ghost" disabled={busy()} onClick={() => void disconnect()}>
                {t("settings.studio.disconnect")}
              </button>
            </div>
          </div>
        )}
      </Show>
    </>
  );
}
