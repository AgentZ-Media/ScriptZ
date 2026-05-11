import { api } from "./api";
import { scriptsBus } from "./scriptsBus";
import { language } from "../i18n";
import { getWelcomeContent } from "../i18n/welcomeContent";

const SEED_KEY = "welcome_seeded_v3";

export async function ensureWelcomeContent(): Promise<void> {
  const seeded = await api.getAppState(SEED_KEY);
  if (seeded) return;
  const existing = await api.listScripts({ includeArchived: true, limit: 1 });
  if (existing.length === 0) {
    // Sprache zum Seed-Zeitpunkt: settings.load() hat die Präferenz
    // bereits aufgelöst (Auto -> navigator.language), bevor wir hier
    // landen. Bei späterem Sprachwechsel bleibt das Tutorial-Skript so
    // wie es ist - es ist ja User-Content, den der User editieren kann.
    const content = getWelcomeContent(language());
    await api.createScript({
      title: content.title,
      initialContentJson: content.json,
    });
    scriptsBus.bump();
  }
  await api.setAppState(SEED_KEY, "1");
}
