// Plain-text (teleprompter) export — mirrors the previous Rust
// commands/export.rs::export_plaintext exactly.
//
// Body bytes come from extractTeleprompterText(), which has been the
// byte-for-byte mirror of the Rust extract_teleprompter_text since
// Migration Phase 1.

import { writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { extractTeleprompterText } from "@scriptz/core/lib/lex";

export interface ExportPlaintextInput {
  scriptId: string;
  path: string;
}

export interface ExportPlaintextResult {
  path: string;
}

export async function exportPlaintext(
  input: ExportPlaintextInput,
  loadContentJson: (scriptId: string) => Promise<string>,
): Promise<ExportPlaintextResult> {
  const contentJson = await loadContentJson(input.scriptId);
  const text = extractTeleprompterText(contentJson);

  const parent = parentDir(input.path);
  if (parent) {
    try {
      await mkdir(parent, { recursive: true });
    } catch (err) {
      // Tolerate "already exists" (recursive: true should suppress it
      // but plugin-fs leaks it on some OS variants). Surface anything
      // else — permission denied / invalid path would otherwise hide
      // behind a misleading writeTextFile error.
      if (!/already exists|EEXIST|file exists/i.test(
        err instanceof Error ? err.message : String(err),
      )) throw err;
    }
  }
  await writeTextFile(input.path, text);
  return { path: input.path };
}

function parentDir(path: string): string | null {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (i <= 0) return null;
  return path.slice(0, i);
}
