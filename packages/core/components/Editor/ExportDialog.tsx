import { Show, createSignal, createEffect } from "solid-js";
import { Modal } from "../Common/Modal";
import { api } from "../../lib/api";
import { pushToast } from "../../stores/toasts";
import { settingsStore } from "../../stores/settings";
import { getPlatformAdapter } from "../../lib/platform";
import { t } from "../../i18n";
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

  let prevOpen = false;
  createEffect(() => {
    const isOpen = props.open;
    if (isOpen && !prevOpen) {
      setTitlePage(false);
      setFormat("pdf");
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
          /* Fallback bereits gesetzt */
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
        return;
      }

      if (result.path) {
        let revealed = true;
        try {
          await revealItemInDir(result.path);
        } catch (err) {
          revealed = false;
          console.warn("[scriptz] revealItemInDir failed", err);
        }
        if (revealed) {
          pushToast(t("export.toast.saved"), "ok");
        } else {
          pushToast(t("export.toast.savedAt", { path: result.path }), "ok");
        }
      } else {
        pushToast(t("export.toast.downloaded"), "ok");
      }
      props.onClose();
    } catch (e) {
      pushToast(t("export.toast.failed", { message: String(e) }), "error");
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
      title={t("export.title")}
      footer={
        <>
          <button class="btn" onClick={() => props.onClose()} disabled={exporting()}>
            {t("common.cancel")}
          </button>
          <button class="btn btn-primary" onClick={onExport} disabled={exporting()}>
            {exporting() ? t("export.exporting") : t("export.button")}
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
            <span>{t("export.format.pdf")}</span>
          </label>
          <label class="settings-radio">
            <input
              type="radio"
              name="exp-fmt"
              value="txt"
              checked={format() === "txt"}
              onChange={() => setFormat("txt")}
            />
            <span>{t("export.format.txt")}</span>
          </label>
          <label class="settings-radio">
            <input
              type="radio"
              name="exp-fmt"
              value="scriptz"
              checked={format() === "scriptz"}
              onChange={() => setFormat("scriptz")}
            />
            <span>{t("export.format.scriptz")}</span>
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
              <span>{t("export.opt.highlighting")}</span>
            </label>
            <label class="export-opt">
              <input
                type="checkbox"
                checked={titlePage()}
                onChange={(e) => setTitlePage(e.currentTarget.checked)}
              />
              <span>{t("export.opt.titlePage")}</span>
            </label>
          </div>
        </Show>

        <Show when={format() === "scriptz"}>
          <div class="export-divider" />
          <p class="export-help">
            {t("export.help.scriptz")}
          </p>
        </Show>
      </div>
    </Modal>
  );
}
