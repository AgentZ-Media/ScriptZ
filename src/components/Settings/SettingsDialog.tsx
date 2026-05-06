import {
  Show,
  createMemo,
  createResource,
  createSignal,
  onMount,
  For,
  onCleanup,
} from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { Modal } from "~/components/Common/Modal";
import { settingsStore, type Theme } from "~/stores/settings";
import { aiStore } from "~/stores/ai";
import { api } from "~/lib/api";
import type { AiModelInfo } from "~/lib/types";
import { pushToast } from "~/stores/toasts";
import "./SettingsDialog.css";

const REPO_URL = "https://github.com/ibimspumo/ScriptZ";

type CheckResult =
  | { kind: "uptodate" }
  | { kind: "available"; version: string }
  | { kind: "error" };

export interface SettingsDialogProps {
  open: boolean;
  onClose(): void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const [appVersion, setAppVersion] = createSignal("0.1.0");
  const [updateChecking, setUpdateChecking] = createSignal(false);
  const [updateResult, setUpdateResult] = createSignal<CheckResult | null>(null);

  // ---- AI section ----
  const [apiKeyInput, setApiKeyInput] = createSignal<string>("");
  const [apiKeyDirty, setApiKeyDirty] = createSignal(false);
  const [savingKey, setSavingKey] = createSignal(false);
  const [testing, setTesting] = createSignal(false);

  onMount(async () => {
    try {
      setAppVersion(await getVersion());
    } catch {
      /* dev mode without Tauri */
    }
  });

  const onCheckUpdate = async () => {
    setUpdateChecking(true);
    setUpdateResult(null);
    try {
      const update = await check();
      setUpdateResult(update ? { kind: "available", version: update.version } : { kind: "uptodate" });
    } catch {
      setUpdateResult({ kind: "error" });
    } finally {
      setUpdateChecking(false);
    }
  };

  const openRepo = async () => {
    try { await openUrl(REPO_URL); } catch {}
  };
  const openLatestRelease = async () => {
    try { await openUrl(`${REPO_URL}/releases/latest`); } catch {}
  };

  const onSaveApiKey = async () => {
    const v = apiKeyInput().trim();
    setSavingKey(true);
    try {
      await aiStore.setApiKey(v);
      pushToast(v ? "API-Key gespeichert (Keychain)" : "API-Key entfernt", "ok");
      setApiKeyInput("");
      setApiKeyDirty(false);
    } catch (e) {
      pushToast(`Fehler: ${(e as Error).message}`, "error");
    } finally {
      setSavingKey(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    try {
      await api.aiTestConnection();
      pushToast("Verbindung erfolgreich", "ok");
    } catch (e) {
      pushToast(`Test fehlgeschlagen: ${(e as Error).message}`, "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Einstellungen"
      footer={
        <button class="btn" onClick={() => props.onClose()}>
          Schließen
        </button>
      }
    >
      <div class="settings-sections">
        <section class="settings-section">
          <h3>Erscheinungsbild</h3>
          <div class="field">
            <label>Theme</label>
            <div class="settings-radio-row">
              {(["dark", "light", "auto"] as Theme[]).map((value) => (
                <label class="settings-radio">
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={settingsStore.theme() === value}
                    onChange={() => void settingsStore.setTheme(value)}
                  />
                  <span>
                    {value === "dark" ? "Dark" : value === "light" ? "Light" : "Auto"}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h3>Editor</h3>
          <Toggle
            label="Charakter-Highlighting standardmäßig aktiviert"
            checked={settingsStore.highlightingDefault()}
            onChange={(v) => void settingsStore.setHighlightingDefault(v)}
          />
          <Toggle
            label="Quick-Modus automatisch aktivieren bei genau 2 Charakteren"
            checked={settingsStore.quickModeAutoEnable()}
            onChange={(v) => void settingsStore.setQuickModeAutoEnable(v)}
          />
          <p class="muted small">
            Greift pro Skript nur, solange du den Toggle nicht selbst
            angefasst hast. Sobald du Quick-Modus in einem Skript einmal
            händisch ein- oder ausschaltest, bleibt diese Wahl in dem
            Skript bestehen — auch wenn die Charakterzahl später wieder
            zwischen 2 und 3+ wechselt.
          </p>
        </section>

        <section class="settings-section">
          <h3>Drucken</h3>
          <p class="muted small">
            Standardmäßig druckt ScriptZ ohne Titelblatt und ohne Highlighting.
            Hier kannst du das pro Druckvorgang erzwingen.
          </p>
          <Toggle
            label="Titelblatt mitdrucken"
            checked={settingsStore.printTitlePage()}
            onChange={(v) => void settingsStore.setPrintTitlePage(v)}
          />
          <Toggle
            label="Charakter-Highlighting mitdrucken"
            checked={settingsStore.printHighlighting()}
            onChange={(v) => void settingsStore.setPrintHighlighting(v)}
          />
        </section>

        <section class="settings-section">
          <h3>KI-Zusammenfassungen</h3>
          <p class="muted small">
            Optional. Wenn aktiviert, schickt ScriptZ den Inhalt deiner Skripte
            an OpenRouter und speichert eine ein-Satz-Zusammenfassung pro
            Skript. Funktioniert komplett ohne KI weiter.
          </p>
          <Toggle
            label="OpenRouter-Zusammenfassungen aktivieren"
            checked={aiStore.enabled()}
            disabled={!aiStore.hasApiKey()}
            onChange={(v) => void aiStore.setEnabled(v)}
          />
          <Show when={!aiStore.hasApiKey()}>
            <div class="muted small">
              Benötigt einen OpenRouter API-Key.
            </div>
          </Show>

          <div class="field">
            <label>OpenRouter API-Key</label>
            <div class="ai-key-row">
              <input
                type="password"
                placeholder={aiStore.hasApiKey() ? "•••••••••••• (in Keychain hinterlegt)" : "sk-or-v1-…"}
                value={apiKeyInput()}
                onInput={(e) => {
                  setApiKeyInput(e.currentTarget.value);
                  setApiKeyDirty(true);
                }}
                spellcheck={false}
                autocomplete="off"
              />
              <button
                class="btn"
                onClick={() => void onSaveApiKey()}
                disabled={!apiKeyDirty() || savingKey()}
              >
                {savingKey() ? "Speichere…" : "Speichern"}
              </button>
              <Show when={aiStore.hasApiKey()}>
                <button
                  class="btn"
                  onClick={() => void aiStore.clearApiKey()}
                  title="Aus Keychain entfernen"
                >
                  Löschen
                </button>
              </Show>
              <button
                class="btn"
                onClick={() => void onTest()}
                disabled={!aiStore.hasApiKey() || testing()}
              >
                {testing() ? "Teste…" : "Verbindung testen"}
              </button>
            </div>
            <div class="muted small">
              Wird sicher in der macOS-Keychain gespeichert. Keys bekommst du auf{" "}
              <button
                class="link-like"
                onClick={() => void openUrl("https://openrouter.ai/keys").catch(() => {})}
              >
                openrouter.ai/keys
              </button>
              .
            </div>
          </div>

          <ModelPicker />
        </section>

        <section class="settings-section">
          <h3>Updates</h3>
          <Toggle
            label="Auf Updates prüfen"
            checked={settingsStore.updateCheckEnabled()}
            onChange={(v) => void settingsStore.setUpdateCheckEnabled(v)}
          />
          <Toggle
            label="Stündlich automatisch prüfen"
            checked={settingsStore.hourlyUpdateCheck()}
            disabled={!settingsStore.updateCheckEnabled()}
            onChange={(v) => void settingsStore.setHourlyUpdateCheck(v)}
          />
          <div class="settings-update-row">
            <button
              class="btn"
              onClick={onCheckUpdate}
              disabled={updateChecking()}
            >
              {updateChecking() ? "Prüfe…" : "Jetzt prüfen"}
            </button>
            <Show when={updateResult()}>
              {(res) => (
                <span class="settings-update-result">
                  <Show
                    when={res().kind !== "error"}
                    fallback={<span style="color:var(--status-err);">Fehler beim Prüfen</span>}
                  >
                    <Show
                      when={res().kind === "available"}
                      fallback={<span class="muted">Du hast die neueste Version</span>}
                    >
                      <>
                        <span>
                          Update verfügbar: v
                          {(res() as { kind: "available"; version: string }).version}
                        </span>
                        <button class="link-like" onClick={openLatestRelease}>
                          Auf GitHub anzeigen
                        </button>
                      </>
                    </Show>
                  </Show>
                </span>
              )}
            </Show>
          </div>
        </section>

        <section class="settings-section">
          <h3>Über</h3>
          <div class="settings-about">
            <div>
              <strong>ScriptZ</strong>
              <span class="muted"> · v{appVersion()}</span>
            </div>
            <div class="muted">Lizenz: MIT</div>
            <div class="muted">
              Entwickelt von{" "}
              <button
                class="link-like"
                onClick={() => void openUrl("https://linktr.ee/deragentz").catch(() => {})}
              >
                AgentZ
              </button>
            </div>
            <div>
              <button class="link-like" onClick={openRepo}>
                {REPO_URL}
              </button>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function Toggle(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <label class={`settings-toggle${props.disabled ? " is-disabled" : ""}`}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}

// ---- Searchable model combobox ----

function ModelPicker() {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [refreshing, setRefreshing] = createSignal(false);
  let rootRef: HTMLDivElement | undefined;

  const [models, { refetch }] = createResource<AiModelInfo[]>(async () => {
    try {
      return await api.aiListModels(false);
    } catch {
      return [];
    }
  });

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    const list = models() ?? [];
    if (!q) return list;
    return list.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q),
    );
  });

  const selected = createMemo(() => {
    const id = aiStore.modelId();
    return (models() ?? []).find((m) => m.id === id);
  });

  const onChoose = async (m: AiModelInfo) => {
    await aiStore.setModel(m.id);
    setOpen(false);
    setQuery("");
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await api.aiListModels(true);
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const onDocClick = (e: MouseEvent) => {
    if (!rootRef) return;
    if (!rootRef.contains(e.target as Node)) setOpen(false);
  };
  onMount(() => {
    document.addEventListener("mousedown", onDocClick);
    onCleanup(() => document.removeEventListener("mousedown", onDocClick));
  });

  return (
    <div class="field">
      <label>Modell</label>
      <div class="ai-model-picker" ref={rootRef}>
        <button
          class="ai-model-trigger"
          onClick={() => setOpen((v) => !v)}
          type="button"
          aria-expanded={open()}
        >
          <span class="ai-model-trigger-name">
            <Show
              when={selected()}
              fallback={<span class="muted">{aiStore.modelId()}</span>}
            >
              {(m) => m().name}
            </Show>
          </span>
          <span class="ai-model-trigger-id muted">{aiStore.modelId()}</span>
          <span class="ai-model-trigger-caret" aria-hidden="true">▾</span>
        </button>

        <Show when={open()}>
          <div class="ai-model-popover">
            <div class="ai-model-search">
              <input
                type="search"
                placeholder="Modell suchen…"
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
                autofocus
                spellcheck={false}
              />
              <button
                class="btn ai-model-refresh"
                onClick={() => void onRefresh()}
                disabled={refreshing()}
                title="Modell-Liste neu laden"
              >
                {refreshing() ? "…" : "↻"}
              </button>
            </div>
            <div class="ai-model-list">
              <Show
                when={(models() ?? []).length > 0}
                fallback={
                  <div class="ai-model-empty muted">
                    {models.loading ? "Lade Modelle…" : "Keine Modelle gefunden"}
                  </div>
                }
              >
                <Show
                  when={filtered().length > 0}
                  fallback={
                    <div class="ai-model-empty muted">Keine Treffer</div>
                  }
                >
                  <For each={filtered().slice(0, 100)}>
                    {(m) => (
                      <button
                        type="button"
                        class="ai-model-item"
                        classList={{ "is-active": m.id === aiStore.modelId() }}
                        onClick={() => void onChoose(m)}
                      >
                        <div class="ai-model-item-name">{m.name}</div>
                        <div class="ai-model-item-id muted">{m.id}</div>
                      </button>
                    )}
                  </For>
                  <Show when={filtered().length > 100}>
                    <div class="ai-model-empty muted small">
                      … {filtered().length - 100} weitere — bitte verfeinern.
                    </div>
                  </Show>
                </Show>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
