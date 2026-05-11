/* @refresh reload */
import { render } from "solid-js/web";

// Reihenfolge ist kritisch:
//
// 1. PlatformAdapter setzen (synchron beim Import). core-Module benutzen
//    den Adapter zwar lazy in Funktionsaufrufen, aber alles, was beim
//    Modul-Load schon greift (z.B. applyPlatformToDocument), erwartet
//    einen registrierten Adapter.
// 2. core/lib/api importieren. api.ts registriert beim Load den SQL-
//    basierten Default-Adapter und exportiert den `api`-Proxy ueber den
//    Slot. Ohne diesen Import waere der Slot leer, sobald irgendein
//    Boot-Code (settingsStore.load etc.) `api.getSetting` aufruft.
// 3. Memory-StorageAdapter setzen - der ueberschreibt den SQL-Default
//    direkt nach dessen Selbstregistrierung. Ab jetzt geht jeder
//    `api.*`-Call gegen die Memory-Map.
// 4. Erst dann global.css + App importieren - global.css zieht ueber
//    @import die Tokens und Fonts mit, der App-Tree mountet anschliessend.
import "./lib/platform";
import "@scriptz/core/lib/api";
import "./lib/storage";

import "@scriptz/core/styles/global.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

render(() => <App />, root);
