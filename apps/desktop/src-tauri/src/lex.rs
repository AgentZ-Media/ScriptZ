// Lexical state -> plain text extraction (server-side mirror of the renderer).
//
// Lossy on purpose - feeds FTS5 and the plain-text export, NOT round-trip
// rendering.

use serde_json::Value;

#[derive(Debug, Clone)]
pub struct ExtractedBlock {
    pub kind: String,
    pub text: String,
}

pub fn extract_blocks(content_json: &str) -> Vec<ExtractedBlock> {
    let v: Value = match serde_json::from_str(content_json) {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    let root = v.get("root").cloned().unwrap_or(v);
    let mut out = Vec::new();
    walk(&root, &mut out);
    out
}

fn walk(node: &Value, out: &mut Vec<ExtractedBlock>) {
    if let Some(typ) = node.get("type").and_then(|t| t.as_str()) {
        let scriptz_kinds = [
            "scriptz-action",
            "scriptz-character",
            "scriptz-dialog",
            "scriptz-parenthetical",
            "scriptz-camera",
            "scriptz-caption",
            "scriptz-sfx",
        ];
        if scriptz_kinds.contains(&typ) {
            let text = collect_text(node);
            out.push(ExtractedBlock {
                kind: typ.to_string(),
                text,
            });
            return;
        }
    }
    if let Some(children) = node.get("children").and_then(|c| c.as_array()) {
        for child in children {
            walk(child, out);
        }
    }
}

fn collect_text(node: &Value) -> String {
    let mut s = String::new();
    collect_text_into(node, &mut s);
    s
}

fn collect_text_into(node: &Value, s: &mut String) {
    if let Some(t) = node.get("type").and_then(|v| v.as_str()) {
        if t == "linebreak" {
            s.push('\n');
            return;
        }
        if t == "text" {
            if let Some(text) = node.get("text").and_then(|v| v.as_str()) {
                s.push_str(text);
            }
            return;
        }
    }
    if let Some(children) = node.get("children").and_then(|c| c.as_array()) {
        for child in children {
            collect_text_into(child, s);
        }
    }
}

pub fn extract_plain_text(content_json: &str) -> String {
    let blocks = extract_blocks(content_json);
    let mut out = String::new();
    for b in blocks {
        if !out.is_empty() {
            out.push_str("\n\n");
        }
        match b.kind.as_str() {
            "scriptz-character" => {
                out.push_str(&b.text.to_uppercase());
            }
            "scriptz-parenthetical" => {
                let trimmed = b.text.trim_matches(|c| c == '(' || c == ')');
                out.push('(');
                out.push_str(trimmed);
                out.push(')');
            }
            "scriptz-sfx" => {
                if !b.text.to_uppercase().starts_with("SFX:") {
                    out.push_str("SFX: ");
                }
                out.push_str(&b.text);
            }
            _ => out.push_str(&b.text),
        }
    }
    out
}

pub fn extract_teleprompter_text(content_json: &str) -> String {
    // Plain-Text export per spec: only Character, Dialog, Parenthetical.
    let blocks = extract_blocks(content_json);
    let mut out = String::new();
    for b in blocks {
        match b.kind.as_str() {
            "scriptz-character" => {
                if !out.is_empty() {
                    out.push_str("\n\n");
                }
                out.push_str(&b.text.to_uppercase());
            }
            "scriptz-dialog" => {
                if !out.is_empty() {
                    out.push('\n');
                }
                out.push_str(&b.text);
            }
            "scriptz-parenthetical" => {
                if !out.is_empty() {
                    out.push('\n');
                }
                let trimmed = b.text.trim_matches(|c| c == '(' || c == ')');
                out.push('(');
                out.push_str(trimmed);
                out.push(')');
            }
            _ => {}
        }
    }
    out
}

/// Word-token set for similarity comparison. Lowercased, ASCII-stripped of
/// punctuation, ignores tokens shorter than 3 chars (drops "im", "am", "und"
/// etc. that would dominate a Jaccard score). NOT meant for FTS — that's what
/// `extract_plain_text` feeds.
pub fn word_token_set(text: &str) -> std::collections::HashSet<String> {
    let mut out = std::collections::HashSet::new();
    for raw in text.split(|c: char| !c.is_alphanumeric()) {
        let token: String = raw.chars().flat_map(|c| c.to_lowercase()).collect();
        if token.chars().count() >= 3 {
            out.insert(token);
        }
    }
    out
}

/// Jaccard similarity between two word-token sets, in [0.0, 1.0].
/// Two empty sets are defined as fully similar (1.0) — no content, no diff.
pub fn jaccard_similarity(
    a: &std::collections::HashSet<String>,
    b: &std::collections::HashSet<String>,
) -> f32 {
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    let inter = a.intersection(b).count() as f32;
    let union = a.union(b).count() as f32;
    if union == 0.0 { 1.0 } else { inter / union }
}

// extract_character_names retired in Migration Phase 7d — only the
// Rust-side reconcile used it, and the reconcile now runs in TS via
// src/lib/lex.ts (see Phase 1 byte-equivalence proof).
