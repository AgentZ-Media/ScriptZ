/* @refresh reload */
import { render } from "solid-js/web";

// Reihenfolge ist kritisch:
//
// 1. PlatformAdapter setzen (synchron beim Import). core-Module benutzen
//    den Adapter zwar lazy in Funktionsaufrufen, aber alles, was beim
//    Modul-Load schon greift (z.B. applyPlatformToDocument), erwartet
//    einen registrierten Adapter.
// 2. core/lib/api importieren. api.ts registriert beim Load den SQL-
//    basierten Default-Adapter und exportiert den `api`-Proxy über den
//    Slot. Ohne diesen Import wäre der Slot leer, sobald irgendein
//    Boot-Code (settingsStore.load etc.) `api.getSetting` aufruft.
// 3. Dexie-StorageAdapter (Phase E) setzen - der überschreibt den SQL-
//    Default direkt nach dessen Selbstregistrierung. Ab jetzt geht jeder
//    `api.*`-Call gegen IndexedDB. Im Adapter läuft beim ersten Write
//    `navigator.storage.persist()` (best-effort, kein Dialog).
// 4. Erst dann global.css + App importieren - global.css zieht über
//    @import die Tokens und Fonts mit, der App-Tree mountet anschließend.
import "./lib/platform";
import "@scriptz/core/lib/api";
import "./adapters/indexeddb";

import "@scriptz/core/styles/global.css";
import App from "./App";
import { DesktopOnlyGate } from "./components/DesktopOnlyGate";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

// Gate um den App-Tree: unter 1024 px Viewport-Breite (Phones / iPad-
// Portrait) rendern wir statt der App eine "Bitte am Desktop öffnen"-
// Seite. So bleibt die Boot-Last (IndexedDB-Init, Editor-Mount) den
// Geräten erspart, auf denen wir den Editor sowieso nicht ausliefern.
render(
  () => (
    <DesktopOnlyGate>
      <App />
    </DesktopOnlyGate>
  ),
  root,
);
