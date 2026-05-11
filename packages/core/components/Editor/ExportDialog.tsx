import { Show, createSignal, createEffect } from "solid-js";
import { Modal } from "../Common/Modal";
import { api } from "../../lib/api";
import { pushToast } from "../../stores/toasts";
import { settingsStore } from "../../stores/settings";
import { getPlatformAdapter } from "../../lib/platform";
import "./ExportDialog.css";

const save = (opts: Parameters<ReturnType<typeof getPlatformAdapter>["saveDialog"]>[0]) =>
  getPlatformAdapter().saveDialog(opts);
const revealItemInDir = (path: string) => getPlatformAdapter().revealInFolder(path);

export interface ExportDialogProps {
  scriptId: string;
  scriptTitle: string;
  open: boolean;
  onClose(): void;
}

type Format = "pdf" | "txt";

export function ExportDialog(props: ExportDialogProps) {
  const [format, setFormat] = createSignal<Format>("pdf");
  const [highlighting, setHighlighting] = createSignal<boolean>(false);
  const [titlePage, setTitlePage] = createSignal<boolean>(false);
  const [exporting, setExporting] = createSignal(false);

  // When the dialog opens, default highlighting from global setting.
  let prevOpen = false;
  createEffect(() => {
    const isOpen = props.open;
    if (isOpen && !prevOpen) {
      setHighlighting(settingsStore.highlightingDefault());
      setTitlePage(false);
      setFormat("pdf");
    }
    prevOpen = isOpen;
  });

  const onExport = async () => {
    if (exporting()) return;
    setExporting(true);
    try {
      const fmt = format();
      const ext = fmt === "pdf" ? "pdf" : "txt";
      const defaultName = `${props.scriptTitle || "Unbenannt"}.${ext}`;
      const path = (await save({
        defaultPath: defaultName,
        filters: [
          fmt === "pdf"
            ? { name: "PDF", extensions: ["pdf"] }
            : { name: "Plain Text", extensions: ["txt"] },
        ],
      })) as string | null;
      if (!path) {
        setExporting(false);
        return;
      }
      let result: { path: string };
      if (fmt === "pdf") {
        result = await api.exportPdf({
          scriptId: props.scriptId,
          path,
          includeHighlighting: highlighting(),
          includeTitlePage: titlePage(),
        });
      } else {
        result = await api.exportPlaintext({ scriptId: props.scriptId, path });
      }
      let revealed = true;
      try {
        await revealItemInDir(result.path);
      } catch (err) {
        // Non-fatal but worth surfacing — without the reveal the user
        // might not know where the file actually went.
        revealed = false;
        console.warn("[scriptz] revealItemInDir failed", err);
      }
      if (revealed) {
        pushToast("Export gespeichert", "ok");
      } else {
        pushToast(`Export gespeichert: ${result.path}`, "ok");
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
      </div>
    </Modal>
  );
}
