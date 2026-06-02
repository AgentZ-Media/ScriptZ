// Builds valid serialized Lexical editor states for fresh scripts, matching
// the structure core's editor expects (mirrors buildScriptSeed in
// packages/core/lib/ideas.ts). Kept in plain TS so it runs in Convex.

function textNode(text: string) {
  return { detail: 0, format: 0, mode: "normal", style: "", text, type: "text", version: 1 };
}

const emptyCharacterBlock = {
  type: "scriptz-character",
  version: 1,
  characterName: "",
  direction: null,
  format: "",
  indent: 0,
  children: [],
};

export function buildEmptySeed(): string {
  return JSON.stringify({
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [emptyCharacterBlock],
    },
  });
}

/** Seeds the idea notes as opening action block(s), one per non-empty line,
 *  followed by an empty character block ready for dialogue. */
export function buildSeedFromNotes(notes: string): string {
  const lines = notes
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return buildEmptySeed();
  const actionBlocks = lines.map((line) => ({
    type: "scriptz-action",
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    children: [textNode(line)],
  }));
  return JSON.stringify({
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [...actionBlocks, emptyCharacterBlock],
    },
  });
}
