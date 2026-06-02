import { convex } from "./convex";
import { api } from "../../convex/_generated/api";
import { getPlatformAdapter } from "@scriptz/core/lib/platform";
import { pushToast } from "./ui";

/** Renders the given scripts to PDF (core's generator) and merges them into a
 *  single bundled PDF, then saves it via the platform (blob download). */
export async function exportScriptsBundle(
  scriptIds: string[],
  filename: string,
): Promise<void> {
  if (scriptIds.length === 0) {
    pushToast("Keine freigegebenen Skripte zum Export", "info");
    return;
  }
  try {
    const { buildPdfBytes } = await import("@scriptz/core/lib/exportPdf");
    const { PDFDocument } = await import("pdf-lib");
    const merged = await PDFDocument.create();
    for (const id of scriptIds) {
      const s = await convex.query(api.scripts.get, { scriptId: id as never });
      const bytes = await buildPdfBytes(
        { title: s.title, contentJson: s.content_json, characters: s.characters ?? [] },
        { includeHighlighting: false, includeTitlePage: true },
      );
      const doc = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    const out = await merged.save();
    await getPlatformAdapter().saveAs(
      {
        suggestedName: filename,
        mimeType: "application/pdf",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      },
      out,
    );
    pushToast(`${scriptIds.length} Skript(e) als PDF exportiert`, "ok");
  } catch (e) {
    pushToast((e as Error)?.message ?? "Export fehlgeschlagen", "error");
  }
}
