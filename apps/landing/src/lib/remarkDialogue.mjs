/**
 * remarkDialogue - turns script-dialog blockquotes into semantic
 * HTML blocks that follow the **same** script look as the landing
 * sections (see WarumSection.astro + landing.css):
 *
 *   .v2-block.v2-character     Name centered, uppercase, bold, with
 *                              per-line background per speaker.
 *   .v2-block.v2-parenthetical 22% indent, italic, muted.
 *   .v2-block.v2-dialog        16% indent, normal left, with the
 *                              same speaker tint as the name.
 *
 * Syntax (pure markdown, no MDX required):
 *
 *   > **TIMO:** This here is dialog.
 *   > *(hesitating)*
 *   > And this here is the continuation.
 *
 * Recognizes:
 *   - Character prefix as **bold name** + colon at the start of the
 *     first paragraph line.
 *   - Inline parenthetical right after the name
 *     (`> **AXEL:** *(skeptical)* Text...`).
 *   - Follow-up lines starting with `(…)` *italic* → parenthetical.
 *   - Plain `> Text` blockquotes without a character prefix stay
 *     untouched (render as editorial citation per the stylesheet).
 *
 * Tint per speaker: hash-to-hue, deterministic. Attached to the
 * block element via `style="--bp-char-tint: hsl(...)"` - the
 * `.v2-t` span in the block uses it as background. Mirrors the
 * app logic (packages/core/lib/characterColors.ts) so the same
 * character name hits the same color here as there.
 */

import { visit } from "unist-util-visit";

/** Stable 32-bit hash, deterministic, kept small. */
function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Returns the tint for a character name.
 *
 * Known brand characters (TIMO/AXEL) get the hardcoded landing
 * tints back - so the blog matches the home page visually 1:1
 * when the same names appear in the script.
 *
 * For all other names a hue is determined by hash, then rotated
 * over the golden angle. This way names whose hashes are close
 * end up visually far apart - characters are easy to distinguish.
 */
const KNOWN_TINTS = {
  TIMO: "rgb(247, 222, 197)",
  AXEL: "rgb(243, 207, 207)",
};
const GOLDEN_ANGLE = 137.50776405003785;

function tintForCharacter(name) {
  const upper = name.toUpperCase();
  if (KNOWN_TINTS[upper]) return KNOWN_TINTS[upper];
  const h = hashString(upper);
  const hue = Math.floor((h * GOLDEN_ANGLE) % 360);
  return `hsl(${hue} 75% 87%)`;
}

/** Collects all text children recursively as a string. Only needed
 *  to detect the `NAME:` prefix - the actual body is passed on as
 *  HAST/HTML so inline formats are preserved. */
function flattenText(nodes) {
  let out = "";
  for (const node of nodes) {
    if (!node) continue;
    if (node.type === "text") out += node.value;
    else if (node.type === "strong" || node.type === "emphasis") {
      out += flattenText(node.children || []);
    } else if (node.children) {
      out += flattenText(node.children);
    }
  }
  return out;
}

/** Serializes a list of mdast children to inline HTML. Deliberately
 *  small - only covers what's usual in dialog (text, em, strong,
 *  inlineCode, link, break). */
function inlineToHtml(nodes) {
  let out = "";
  for (const node of nodes) {
    if (!node) continue;
    switch (node.type) {
      case "text":
        out += escapeHtml(node.value);
        break;
      case "strong":
        out += `<strong>${inlineToHtml(node.children || [])}</strong>`;
        break;
      case "emphasis":
        out += `<em>${inlineToHtml(node.children || [])}</em>`;
        break;
      case "inlineCode":
        out += `<code>${escapeHtml(node.value)}</code>`;
        break;
      case "break":
        out += "<br/>";
        break;
      case "link": {
        const href = escapeHtml(node.url || "");
        const title = node.title ? ` title="${escapeHtml(node.title)}"` : "";
        out += `<a href="${href}"${title}>${inlineToHtml(node.children || [])}</a>`;
        break;
      }
      default:
        if (node.children) out += inlineToHtml(node.children);
        break;
    }
  }
  return out;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Splits the leading `**NAME:**` (mdast-strong + text) from the
 *  first paragraph's children list. Returns `{ name, restChildren }`
 *  or `null`. */
function splitCharacterPrefix(children) {
  if (!children || children.length === 0) return null;
  const first = children[0];
  if (!first || first.type !== "strong") return null;

  const strongText = flattenText(first.children || []).trim();
  // Allows `**NAME**:` (colon outside) and `**NAME:**` (inside).
  let name = null;
  let consumedColon = false;

  if (strongText.endsWith(":")) {
    // Form 1: `**NAME:**`
    name = strongText.slice(0, -1).trim();
    consumedColon = true;
  } else {
    // Form 2: `**NAME**:` - colon sits as a text node afterwards.
    const second = children[1];
    if (second && second.type === "text" && second.value.startsWith(":")) {
      name = strongText.trim();
      consumedColon = true;
    }
  }

  if (!name || !consumedColon) return null;
  if (name.length === 0 || name.length > 40) return null;

  // Assemble rest-children: from index 1 onward, strip a leading
  // colon from the first text node and trim leading whitespace.
  const rest = children.slice(1).map((n) => ({ ...n }));
  if (rest.length > 0 && rest[0].type === "text") {
    let v = rest[0].value;
    if (v.startsWith(":")) v = v.slice(1);
    rest[0] = { ...rest[0], value: v.replace(/^\s+/, "") };
  }

  return { name, restChildren: rest };
}

/** A paragraph's children list is a "parenthetical" if it consists
 *  of a single emphasis node whose text starts with `(` and ends
 *  with `)`. */
function isParenthetical(children) {
  if (!children || children.length !== 1) return false;
  const only = children[0];
  if (!only || only.type !== "emphasis") return false;
  const txt = flattenText(only.children || []).trim();
  return txt.startsWith("(") && txt.endsWith(")");
}

export function remarkDialogue() {
  return (tree) => {
    visit(tree, "blockquote", (node, index, parent) => {
      if (!parent || typeof index !== "number") return;
      const paragraphs = (node.children || []).filter((c) => c.type === "paragraph");
      if (paragraphs.length === 0) return;

      const firstParaChildren = paragraphs[0].children || [];
      const split = splitCharacterPrefix(firstParaChildren);
      if (!split) return; // Not dialog → untouched (editorial citation).

      const { name, restChildren } = split;
      const safeName = escapeHtml(name.toUpperCase());
      const tint = tintForCharacter(name);
      const tintAttr = ` style="--bp-char-tint: ${tint}"`;

      // Split inline parenthetical right after the name.
      // Covers `**NAME:** *(hesitating)* Text...`. Follow-up lines
      // are recognized paragraph-by-paragraph further below.
      let leftover = [...restChildren];
      while (leftover.length > 0 && leftover[0].type === "text" && leftover[0].value.trim() === "") {
        leftover = leftover.slice(1);
      }
      let inlineParenHtml = null;
      if (leftover.length > 0 && leftover[0].type === "emphasis") {
        const emText = flattenText(leftover[0].children || []).trim();
        if (emText.startsWith("(") && emText.endsWith(")")) {
          inlineParenHtml = escapeHtml(emText);
          leftover = leftover.slice(1);
          if (leftover.length > 0 && leftover[0].type === "text") {
            leftover[0] = { ...leftover[0], value: leftover[0].value.replace(/^\s+/, "") };
          }
        }
      }

      // Output: a series of top-level blocks in landing script style.
      // Order: CHARACTER, optional PARENTHETICAL (inline), DIALOG,
      // then for each follow-up paragraph: PARENTHETICAL or DIALOG.
      const out = [];
      out.push(
        `<p class="v2-block v2-character" data-speaker="${safeName}"${tintAttr}>` +
          `<span class="v2-t">${safeName}</span>` +
          `</p>`,
      );
      if (inlineParenHtml !== null) {
        out.push(
          `<p class="v2-block v2-parenthetical" data-speaker="${safeName}">` +
            `<span class="v2-t-plain">${inlineParenHtml}</span>` +
            `</p>`,
        );
      }
      const firstDialogHtml = inlineToHtml(leftover).trim();
      if (firstDialogHtml.length > 0) {
        out.push(
          `<p class="v2-block v2-dialog" data-speaker="${safeName}"${tintAttr}>` +
            `<span class="v2-t">${firstDialogHtml}</span>` +
            `</p>`,
        );
      }
      for (let i = 1; i < paragraphs.length; i += 1) {
        const para = paragraphs[i];
        const kids = para.children || [];
        if (isParenthetical(kids)) {
          const inner = flattenText(kids[0].children || []).trim();
          out.push(
            `<p class="v2-block v2-parenthetical" data-speaker="${safeName}">` +
              `<span class="v2-t-plain">${escapeHtml(inner)}</span>` +
              `</p>`,
          );
        } else {
          out.push(
            `<p class="v2-block v2-dialog" data-speaker="${safeName}"${tintAttr}>` +
              `<span class="v2-t">${inlineToHtml(kids)}</span>` +
              `</p>`,
          );
        }
      }

      parent.children.splice(index, 1, { type: "html", value: out.join("") });
      // Exactly one node was replaced - next visit at the following
      // node. Previously this was `index + out.length`, which skipped
      // sibling blockquotes for dialogs with multiple sub-blocks.
      return [visit.SKIP, index + 1];
    });
  };
}
