/**
 * remarkDialogue - verwandelt Skript-Dialog-Blockquotes in semantische
 * HTML-Blocks, die der **gleichen** Skript-Optik folgen wie die
 * Landing-Sections (siehe WarumSection.astro + landing.css):
 *
 *   .v2-block.v2-character     Name zentriert, uppercase, bold,
 *                              mit per-Zeile-Hintergrund pro Sprecher.
 *   .v2-block.v2-parenthetical 22% eingerueckt, kursiv, gedaempft.
 *   .v2-block.v2-dialog        16% eingerueckt, normal links, mit
 *                              gleichem Sprecher-Tint wie der Name.
 *
 * Syntax (rein Markdown, keine MDX-Pflicht):
 *
 *   > **TIMO:** Das hier ist Dialog.
 *   > *(zögernd)*
 *   > Und das hier ist die Fortsetzung.
 *
 * Erkennt:
 *   - Charakter-Praefix als **fetter Name** + Doppelpunkt am Anfang
 *     der ersten Paragraphenzeile.
 *   - Inline-Parenthetical direkt nach dem Namen
 *     (`> **AXEL:** *(skeptisch)* Text...`).
 *   - Folgezeilen, die mit `(…)` *kursiv* anfangen → Parenthetical.
 *   - Reine `> Text`-Blockquotes ohne Charakter-Praefix bleiben
 *     unangetastet (rendern als editorial Zitat im Stylesheet).
 *
 * Tint pro Sprecher: Hash-zu-Hue, deterministisch. Wird per
 * `style="--bp-char-tint: hsl(...)"` ans Block-Element gehaengt - der
 * `.v2-t`-Span im Block nimmt das als Hintergrund auf. Spiegelt die
 * App-Logik (packages/core/lib/characterColors.ts), so dass derselbe
 * Charaktername hier wie dort dieselbe Farbe trifft.
 */

import { visit } from "unist-util-visit";

/** Stabiler 32-bit-Hash, deterministisch, klein gehalten. */
function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Liefert den Tint fuer einen Charakter-Namen.
 *
 * Bekannte Brand-Charaktere (TIMO/AXEL) bekommen die hardcoded
 * Landing-Tints zurueck - so passt der Blog optisch 1:1 zur Startseite,
 * wenn dieselben Namen im Skript auftauchen.
 *
 * Fuer alle anderen Namen wird ein Hue per Hash bestimmt, dann ueber
 * den goldenen Winkel rotiert. Dadurch landen Namen, deren Hashes
 * eng beieinander liegen, optisch weit auseinander - die Charaktere
 * sind so gut unterscheidbar.
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

/** Holt alle Text-Kinder rekursiv als String. Wird nur fuer das
 *  Erkennen des `NAME:`-Praefix benoetigt - der eigentliche Body wird
 *  als HAST/HTML weitergegeben, damit Inline-Formate erhalten bleiben. */
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

/** Serialisiert eine Liste von mdast-Children zu Inline-HTML. Bewusst
 *  klein - deckt nur, was im Dialog ueblich vorkommt (Text, em, strong,
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

/** Trennt den fuehrenden `**NAME:**` (mdast-Strong + Text) von der
 *  ersten Paragraph-Children-Liste. Gibt `{ name, restChildren }` oder
 *  `null` zurueck. */
function splitCharacterPrefix(children) {
  if (!children || children.length === 0) return null;
  const first = children[0];
  if (!first || first.type !== "strong") return null;

  const strongText = flattenText(first.children || []).trim();
  // Erlaubt `**NAME**:` (Doppelpunkt ausserhalb) und `**NAME:**` (drin).
  let name = null;
  let consumedColon = false;

  if (strongText.endsWith(":")) {
    // Form 1: `**NAME:**`
    name = strongText.slice(0, -1).trim();
    consumedColon = true;
  } else {
    // Form 2: `**NAME**:` - Doppelpunkt steckt als Text-Node danach.
    const second = children[1];
    if (second && second.type === "text" && second.value.startsWith(":")) {
      name = strongText.trim();
      consumedColon = true;
    }
  }

  if (!name || !consumedColon) return null;
  if (name.length === 0 || name.length > 40) return null;

  // Rest-Children zusammenstellen: ab Index 1, ggf. Doppelpunkt aus dem
  // ersten Text-Node abschneiden und fuehrendes Leerzeichen trimmen.
  const rest = children.slice(1).map((n) => ({ ...n }));
  if (rest.length > 0 && rest[0].type === "text") {
    let v = rest[0].value;
    if (v.startsWith(":")) v = v.slice(1);
    rest[0] = { ...rest[0], value: v.replace(/^\s+/, "") };
  }

  return { name, restChildren: rest };
}

/** Eine Paragraph-Children-Liste ist ein "Parenthetical", wenn sie aus
 *  einem einzigen Emphasis-Node besteht, dessen Text mit `(` anfaengt
 *  und mit `)` aufhoert. */
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
      if (!split) return; // Nicht-Dialog → unangetastet (editorial Zitat).

      const { name, restChildren } = split;
      const safeName = escapeHtml(name.toUpperCase());
      const tint = tintForCharacter(name);
      const tintAttr = ` style="--bp-char-tint: ${tint}"`;

      // Inline-Parenthetical direkt nach dem Namen splitten.
      // Deckt `**NAME:** *(zoegernd)* Text...`. Folgezeilen werden
      // weiter unten paragraphenweise erkannt.
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

      // Output: Reihe von Top-Level-Blocks im Landing-Skript-Stil.
      // Reihenfolge: CHARACTER, optional PARENTHETICAL (inline), DIALOG,
      // dann fuer jeden Folge-Paragraph: PARENTHETICAL oder DIALOG.
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
      // Genau ein Knoten wurde ersetzt - naechster Besuch beim Folge-
      // Knoten. Frueher stand hier `index + out.length`, was bei Dialogen
      // mit mehreren Sub-Blocks Geschwister-Blockquotes uebersprungen hat.
      return [visit.SKIP, index + 1];
    });
  };
}
