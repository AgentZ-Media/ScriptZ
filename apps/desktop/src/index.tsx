/* @refresh reload */
import { render } from "solid-js/web";

// Register the Tauri-backed PlatformAdapter and the auto-updater store
// before anything from @scriptz/core gets imported transitively — these
// modules call setPlatformAdapter() / setUpdatesStore() at import time
// and core code crashes if the adapter is missing on first use.
import "./lib/platform";
import "./stores/updates";

// global.css transitively pulls tokens.css and fonts.css via @import.
import "@scriptz/core/styles/global.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

render(() => <App />, root);
