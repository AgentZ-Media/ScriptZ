// Lexical state -> plain text extraction (server-side mirror of the renderer).
//
// Lossy on purpose - feeds FTS5 and the plain-text export, NOT round-trip
// rendering.
//
// Mirrors src-tauri/src/lex.rs byte-for-byte during the Rust -> TS migration.
// Both modules coexist until Phase 11 retires the Rust copy.

export interface ExtractedBlock {
  kind: string;
  text: string;
}

const SCRIPTZ_KINDS = new Set([
  "scriptz-action",
  "scriptz-character",
  "scriptz-dialog",
  "scriptz-parenthetical",
  "scriptz-camera",
  "scriptz-caption",
  "scriptz-sfx",
]);

export function extractBlocks(contentJson: string): ExtractedBlock[] {
  let v: unknown;
  try {
    v = JSON.parse(contentJson);
  } catch {
    return [];
  }
  const root = isObject(v) && "root" in v ? (v as Record<string, unknown>).root : v;
  const out: ExtractedBlock[] = [];
  walk(root, out);
  return out;
}

function walk(node: unknown, out: ExtractedBlock[]): void {
  if (!isObject(node)) return;
  const typ = node.type;
  if (typeof typ === "string" && SCRIPTZ_KINDS.has(typ)) {
    out.push({ kind: typ, text: collectText(node) });
    return;
  }
  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) walk(child, out);
  }
}

function collectText(node: unknown): string {
  const buf: string[] = [];
  collectTextInto(node, buf);
  return buf.join("");
}

function collectTextInto(node: unknown, buf: string[]): void {
  if (!isObject(node)) return;
  const t = node.type;
  if (typeof t === "string") {
    if (t === "linebreak") {
      buf.push("\n");
      return;
    }
    if (t === "text") {
      const text = node.text;
      if (typeof text === "string") buf.push(text);
      return;
    }
  }
  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) collectTextInto(child, buf);
  }
}

export function extractPlainText(contentJson: string): string {
  const blocks = extractBlocks(contentJson);
  let out = "";
  for (const b of blocks) {
    if (out.length > 0) out += "\n\n";
    switch (b.kind) {
      case "scriptz-character":
        out += b.text.toUpperCase();
        break;
      case "scriptz-parenthetical": {
        const trimmed = trimParens(b.text);
        out += "(" + trimmed + ")";
        break;
      }
      case "scriptz-sfx":
        if (!b.text.toUpperCase().startsWith("SFX:")) out += "SFX: ";
        out += b.text;
        break;
      default:
        out += b.text;
    }
  }
  return out;
}

export function extractTeleprompterText(contentJson: string): string {
  // Plain-Text export per spec: only Character, Dialog, Parenthetical.
  const blocks = extractBlocks(contentJson);
  let out = "";
  for (const b of blocks) {
    switch (b.kind) {
      case "scriptz-character":
        if (out.length > 0) out += "\n\n";
        out += b.text.toUpperCase();
        break;
      case "scriptz-dialog":
        if (out.length > 0) out += "\n";
        out += b.text;
        break;
      case "scriptz-parenthetical": {
        if (out.length > 0) out += "\n";
        const trimmed = trimParens(b.text);
        out += "(" + trimmed + ")";
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/**
 * Word-token set for similarity comparison. Lowercased, ASCII-stripped of
 * punctuation, ignores tokens shorter than 3 chars (drops "im", "am", "und"
 * etc. that would dominate a Jaccard score). NOT meant for FTS - that's what
 * `extractPlainText` feeds.
 */
export function wordTokenSet(text: string): Set<string> {
  const out = new Set<string>();
  // Mirrors Rust's `c.is_alphanumeric()` (Unicode Alphabetic | Numeric).
  const parts = text.split(/[^\p{Alphabetic}\p{N}]+/u);
  for (const raw of parts) {
    if (raw.length === 0) continue;
    const token = raw.toLowerCase();
    // Count Unicode scalar values, not UTF-16 code units, to mirror
    // Rust's `chars().count() >= 3`.
    if (codePointCount(token) >= 3) out.add(token);
  }
  return out;
}

/**
 * Jaccard similarity between two word-token sets, in [0.0, 1.0].
 * Two empty sets are defined as fully similar (1.0) - no content, no diff.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  if (union === 0) return 1.0;
  return inter / union;
}

/** Dialog-Wörter pro Charakter - gleicher Algorithmus wie im EditorRail
 *  Cast-Tab: Wörter aus `scriptz-dialog`-Blöcken werden dem zuletzt
 *  davor gesehenen `scriptz-character`-Block zugeordnet. Charaktere
 *  ohne Dialog haben einen Eintrag mit `0` (damit Aufrufer wissen,
 *  dass es sie gibt). Schlüssel sind UPPERCASE, weil Charakter-Namen
 *  app-weit case-insensitive matchen.
 *
 *  Eine einzige Quelle für diese Berechnung - siehe `scripts.ts`
 *  (für `characters_meta.share` beim Speichern) und `EditorRail.tsx`
 *  (für den Cast-Tab). */
export function dialogWordsByCharacter(contentJson: string): Record<string, number> {
  const out: Record<string, number> = {};
  let last: string | null = null;
  for (const b of extractBlocks(contentJson)) {
    if (b.kind === "scriptz-character") {
      last = b.text.trim().toUpperCase();
      if (last && !(last in out)) out[last] = 0;
    } else if (b.kind === "scriptz-dialog" && last) {
      const w = b.text.trim().split(/\s+/).filter(Boolean).length;
      out[last] = (out[last] ?? 0) + w;
    }
  }
  return out;
}

/** Collect unique character names (uppercase) used in the script's content. */
export function extractCharacterNames(contentJson: string): string[] {
  const blocks = extractBlocks(contentJson);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind !== "scriptz-character") continue;
    const name = b.text.trim().toUpperCase();
    if (name.length === 0) continue;
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

// ---------- helpers ----------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Mirrors `b.text.trim_matches(|c| c == '(' || c == ')')`: strip ALL
// leading/trailing parens (not just one pair).
function trimParens(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && (s[start] === "(" || s[start] === ")")) start++;
  while (end > start && (s[end - 1] === "(" || s[end - 1] === ")")) end--;
  return s.slice(start, end);
}

function codePointCount(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}
