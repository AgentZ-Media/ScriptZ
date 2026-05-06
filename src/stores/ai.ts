import { createSignal } from "solid-js";
import { api } from "~/lib/api";
import type { AiState } from "~/lib/types";

const DEFAULT_MODEL = "google/gemini-3.1-flash-lite-preview";

const [enabled, setEnabled] = createSignal<boolean>(false);
const [hasApiKey, setHasApiKey] = createSignal<boolean>(false);
const [modelId, setModelId] = createSignal<string>(DEFAULT_MODEL);
const [loaded, setLoaded] = createSignal(false);

function applyState(s: AiState) {
  setEnabled(s.enabled);
  setHasApiKey(s.has_api_key);
  setModelId(s.model_id);
}

export const aiStore = {
  enabled,
  hasApiKey,
  modelId,
  loaded,
  ready: () => enabled() && hasApiKey(),

  async refresh() {
    try {
      const s = await api.aiGetState();
      applyState(s);
    } catch {
      // ignore — stays at defaults
    } finally {
      setLoaded(true);
    }
  },

  async setEnabled(v: boolean) {
    setEnabled(v);
    await api.aiSetEnabled(v);
  },

  async setApiKey(v: string) {
    await api.aiSetApiKey(v);
    setHasApiKey(v.trim().length > 0);
  },

  async clearApiKey() {
    await api.aiClearApiKey();
    setHasApiKey(false);
  },

  async setModel(id: string) {
    setModelId(id);
    await api.aiSetModel(id);
  },
};
