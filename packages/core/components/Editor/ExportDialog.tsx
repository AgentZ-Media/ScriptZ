import { Show, createSignal, createEffect } from "solid-js";
import { Modal } from "../Common/Modal";
import { api } from "../../lib/api";
import { pushToast } from "../../stores/toasts";
import { settingsStore } from "../../stores/settings";
import { getPlatformAdapter } from "../../lib/platform";
import "./ExportDialog.css";

const revealItemInDir = (path: string) => getPlatformAdapter().revealInFolder(path);

export interface ExportDialogProps {
  scriptId: string;
  scriptTitle: string;
  open: boolean;
  onClose(): void;
}

type Format = "pdf" | "txt" | "scriptz";

export function ExportDialog(props: ExportDialogProps) {
  const [format, setFormat] = createSignal<Format>("pdf");
  const [highlighting, setHighlighting] = createSignal<boolean>(false);
  const [titlePage, setTitlePage] = createSignal<boolean>(false);
  const [exporting, setExporting] = createSignal(false);

  // Beim Öffnen Default-Highlighting aus der per-Skript-Einstellung
  // ableiten, mit Fallback aufs globale Setting - identisch zur
  // Resolution in ScriptView (`highlightingOn`). Wenn der User im
  // Editor das Highlighting aktiv hat, soll die Checkbox hier von Haus
  // aus angehakt sein.
  let prevOpen = false;
  createEffect(() => {
    const isOpen = props.open;
    if (isOpen && !prevOpen) {
      setTitlePage(false);
      setFormat("pdf");
      // Optimistic default while the fetch is in flight - der Lookup
      // ist in der Praxis Millisekunden, aber falls er trotzdem nach
      // dem Dialog-Close zurueckkommt, ignorieren wir den Wert.
      setHighlighting(settingsStore.highlightingDefault());
      const id = props.scriptId;
      void (async () => {
        try {
          const fresh = await api.getScript(id);
          if (props.scriptId !== id) return;
          const enabled = fresh.highlighting_enabled;
          if (enabled === 1) setHighlighting(true);
          else if (enabled === 0) setHighlighting(false);
          else setHighlighting(settingsStore.highlightingDefault());
        } catch {
          // Fallback bereits gesetzt - nichts zu tun.
        }
      })();
    }
    prevOpen = isOpen;
  });

  const onExport = async () => {
    if (exporting()) return;
    setExporting(true);
    try {
      const fmt = format();
      let result: { cancelled: boolean; path: string | null };
      if (fmt === "pdf") {
        result = await api.exportPdf({
          scriptId: props.scriptId,
          includeHighlighting: highlighting(),
          includeTitlePage: titlePage(),
        });
      } else if (fmt === "txt") {
        result = await api.exportPlaintext({ scriptId: props.scriptId });
      } else {
        result = await api.exportScriptz(props.scriptId);
      }

      if (result.cancelled) {
        // User hat den Save-Dialog abgebrochen - kein Toast, kein Close.
        // Dialog bleibt offen, damit ein zweiter Versuch keinen Klick
        // extra kostet.
        return;
      }

      // Desktop liefert den Pfad zurück, Web nicht. Wir versuchen nur
      // dann zu revealen, wenn wir einen Pfad haben - sonst Toast mit
      // "Heruntergeladen"-Wording, das im Browser auch ehrlich ist.
      if (result.path) {
        let revealed = true;
        try {
          await revealItemInDir(result.path);
        } catch (err) {
          revealed = false;
          console.warn("[scriptz] revealItemInDir failed", err);
        }
        if (revealed) {
          pushToast("Export gespeichert", "ok");
        } else {
          pushToast(`Export gespeichert: ${result.path}`, "ok");
        }
      } else {
        pushToast("Datei heruntergeladen", "ok");
      }
      props.onClose();
    } catch (e) {
      pushToast(`Export fehlgeschlagen: ${String(e)}`, "error");
    } finally {
      setExporting(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void onExport();
    }
  };

  return (
    <Modal
      open={props.open}
      onClose={() => (exporting() ? null : props.onClose())}
      title="Skript exportieren"
      footer={
        <>
          <button class="btn" onClick={() => props.onClose()} disabled={exporting()}>
            Abbrechen
          </button>
          <button class="btn btn-primary" onClick={onExport} disabled={exporting()}>
            {exporting() ? "Exportiere…" : "Exportieren"}
          </button>
        </>
      }
    >
      <div class="export-form" onKeyDown={onKeyDown}>
        <div class="export-radio-row">
          <label class="settings-radio">
            <input
              type="radio"
              name="exp-fmt"
              value="pdf"
              checked={format() === "pdf"}
              onChange={() => setFormat("pdf")}
            />
            <span>PDF</span>
          </label>
          <label class="settings-radio">
            <input
              type="radio"
              name="exp-fmt"
              value="txt"
              checked={format() === "txt"}
              onChange={() => setFormat("txt")}
            />
            <span>Plain Text (für Teleprompter)</span>
          </label>
          <label class="settings-radio">
            <input
              type="radio"
              name="exp-fmt"
              value="scriptz"
              checked={format() === "scriptz"}
              onChange={() => setFormat("scriptz")}
            />
            <span>ScriptZ-Datei (.scriptz)</span>
          </label>
        </div>

        <Show when={format() === "pdf"}>
          <div class="export-divider" />
          <div class="export-options">
            <label class="export-opt">
              <input
                type="checkbox"
                checked={highlighting()}
                onChange={(e) => setHighlighting(e.currentTarget.checked)}
              />
              <span>Charakter-Highlighting</span>
            </label>
            <label class="export-opt">
              <input
                type="checkbox"
                checked={titlePage()}
                onChange={(e) => setTitlePage(e.currentTarget.checked)}
              />
              <span>Titelblatt einschließen</span>
            </label>
          </div>
        </Show>

        <Show when={format() === "scriptz"}>
          <div class="export-divider" />
          <p class="export-help">
            Eine ScriptZ-Datei enthält dieses Skript als Container und
            kann auf einem anderen Gerät importiert werden (Datei →
            Importieren). Nur das aktuelle Skript - ohne Ordner-
            Zuordnung, ohne Versions-Verlauf.
          </p>
        </Show>
      </div>
    </Modal>
  );
}
