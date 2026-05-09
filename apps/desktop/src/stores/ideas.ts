import { createResource } from "solid-js";
import { api } from "~/lib/api";
import { ideasBus } from "~/lib/ideasBus";
import type { Idea } from "~/lib/types";

// Globaler Resource-Slot für die Ideen-Liste. Subscribers (Drawer,
// Toggle-Counter, ggf. Quick-Capture) teilen sich denselben Cache.
const [ideas] = createResource(
  () => ideasBus.version(),
  async () => {
    try {
      return await api.listIdeas();
    } catch (err) {
      console.warn("[scriptz] ideas load failed", err);
      return [] as Idea[];
    }
  },
  { initialValue: [] },
);

export const ideasStore = {
  ideas,
  refresh() {
    ideasBus.bump();
  },
};
