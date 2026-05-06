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

/// Collect unique character names (uppercase) used in the script's content.
pub fn extract_character_names(content_json: &str) -> Vec<String> {
    let blocks = extract_blocks(content_json);
    let mut seen = std::collections::HashSet::new();
    let mut out: Vec<String> = Vec::new();
    for b in blocks {
        if b.kind == "scriptz-character" {
            let name = b.text.trim().to_uppercase();
            if name.is_empty() {
                continue;
            }
            if seen.insert(name.clone()) {
                out.push(name);
            }
        }
    }
    out
}
