use std::path::PathBuf;

use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;
use crate::error::{Result, ScriptzError};
use crate::lex::extract_blocks;
use crate::models::ScriptCharacter;

#[derive(Debug, Deserialize)]
pub struct ExportPdfInput {
    pub script_id: String,
    pub path: String,
    pub include_highlighting: bool,
    pub include_title_page: bool,
}

#[derive(Debug, Deserialize)]
pub struct ExportTextInput {
    pub script_id: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct ExportResult {
    pub path: String,
}

fn read_script_for_export(
    conn: &rusqlite::Connection,
    script_id: &str,
) -> Result<(String, String, Vec<ScriptCharacter>)> {
    let row = conn
        .query_row(
            "SELECT title, content_json, characters_meta FROM scripts WHERE id = ?1",
            params![script_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            },
        )
        .map_err(|_| ScriptzError::NotFound(format!("script {script_id}")))?;
    let chars: Vec<ScriptCharacter> = serde_json::from_str(&row.2).unwrap_or_default();
    Ok((row.0, row.1, chars))
}

#[tauri::command]
pub fn export_plaintext(db: State<Db>, input: ExportTextInput) -> Result<ExportResult> {
    let conn = db.conn()?;
    let (_title, content_json, _chars) = read_script_for_export(&conn, &input.script_id)?;
    let text = crate::lex::extract_teleprompter_text(&content_json);
    let path = PathBuf::from(&input.path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, text.as_bytes())?;
    Ok(ExportResult { path: input.path })
}

// ---- PDF ----

mod pdf {
    use super::*;
    use printpdf::*;

    const A4_W_MM: f32 = 210.0;
    const A4_H_MM: f32 = 297.0;
    const MARGIN_TOP_MM: f32 = 25.0;
    const MARGIN_BOTTOM_MM: f32 = 25.0;
    const MARGIN_LEFT_MM: f32 = 37.0;
    const MARGIN_RIGHT_MM: f32 = 25.0;
    const FONT_SIZE_PT: f32 = 11.0;
    const LINE_HEIGHT_MM: f32 = 5.0;
    const PARA_GAP_MM: f32 = 2.5;

    struct Layout {
        doc: PdfDocumentReference,
        font: IndirectFontRef,
        font_bold: IndirectFontRef,
        font_italic: IndirectFontRef,
        page_idx: usize,
        layer_name: String,
        cur_layer: PdfLayerReference,
        y_mm: f32,
        page_count: usize,
    }

    impl Layout {
        fn new(title: &str) -> std::result::Result<Self, String> {
            let (doc, page1, layer1) = PdfDocument::new(title, Mm(A4_W_MM), Mm(A4_H_MM), "Layer 1");
            let font = doc
                .add_builtin_font(BuiltinFont::Helvetica)
                .map_err(|e| format!("font: {e}"))?;
            let font_bold = doc
                .add_builtin_font(BuiltinFont::HelveticaBold)
                .map_err(|e| format!("font: {e}"))?;
            let font_italic = doc
                .add_builtin_font(BuiltinFont::HelveticaOblique)
                .map_err(|e| format!("font: {e}"))?;
            let cur_layer = doc.get_page(page1).get_layer(layer1);
            Ok(Layout {
                doc,
                font,
                font_bold,
                font_italic,
                page_idx: 0,
                layer_name: "Layer 1".to_string(),
                cur_layer,
                y_mm: A4_H_MM - MARGIN_TOP_MM,
                page_count: 1,
            })
        }

        fn new_page(&mut self) {
            let (page, layer) =
                self.doc.add_page(Mm(A4_W_MM), Mm(A4_H_MM), self.layer_name.clone());
            self.cur_layer = self.doc.get_page(page).get_layer(layer);
            self.page_idx += 1;
            self.page_count += 1;
            self.y_mm = A4_H_MM - MARGIN_TOP_MM;
        }

        fn ensure_space(&mut self, needed_mm: f32) {
            if self.y_mm - needed_mm < MARGIN_BOTTOM_MM {
                self.new_page();
            }
        }

        fn font_for(&self, italic: bool, bold: bool) -> &IndirectFontRef {
            match (italic, bold) {
                (true, _) => &self.font_italic,
                (false, true) => &self.font_bold,
                _ => &self.font,
            }
        }

        fn write_line(
            &mut self,
            text: &str,
            x_left_mm: f32,
            width_mm: f32,
            italic: bool,
            bold: bool,
            align: &str,
            tint: Option<(u8, u8, u8)>,
        ) {
            let chars_per_line = ((width_mm / 2.05) as usize).max(20);
            let lines = simple_wrap(text, chars_per_line);
            if let Some((r, g, b)) = tint {
                let total_h = (lines.len() as f32) * LINE_HEIGHT_MM + PARA_GAP_MM * 0.6;
                let rect_top = self.y_mm + LINE_HEIGHT_MM * 0.3;
                self.cur_layer
                    .set_fill_color(Color::Rgb(Rgb::new(
                        r as f32 / 255.0,
                        g as f32 / 255.0,
                        b as f32 / 255.0,
                        None,
                    )));
                let pts = vec![
                    (Point::new(Mm(x_left_mm - 1.0), Mm(rect_top)), false),
                    (
                        Point::new(Mm(x_left_mm + width_mm + 1.0), Mm(rect_top)),
                        false,
                    ),
                    (
                        Point::new(Mm(x_left_mm + width_mm + 1.0), Mm(rect_top - total_h)),
                        false,
                    ),
                    (
                        Point::new(Mm(x_left_mm - 1.0), Mm(rect_top - total_h)),
                        false,
                    ),
                ];
                let line = Line {
                    points: pts,
                    is_closed: true,
                };
                self.cur_layer.add_line(line);
                self.cur_layer.set_fill_color(Color::Rgb(Rgb::new(
                    0.0, 0.0, 0.0, None,
                )));
            }
            for line in lines {
                self.ensure_space(LINE_HEIGHT_MM);
                let line_str: String = line;
                let x_pos = match align {
                    "center" => {
                        let est_w = (line_str.chars().count() as f32) * 2.05;
                        x_left_mm + (width_mm - est_w) / 2.0
                    }
                    "right" => {
                        let est_w = (line_str.chars().count() as f32) * 2.05;
                        x_left_mm + width_mm - est_w
                    }
                    _ => x_left_mm,
                };
                self.cur_layer.use_text(
                    line_str.as_str(),
                    FONT_SIZE_PT,
                    Mm(x_pos),
                    Mm(self.y_mm),
                    self.font_for(italic, bold),
                );
                self.y_mm -= LINE_HEIGHT_MM;
            }
            self.y_mm -= PARA_GAP_MM;
        }
    }

    fn simple_wrap(text: &str, width: usize) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        for chunk in text.split('\n') {
            if chunk.is_empty() {
                out.push(String::new());
                continue;
            }
            let mut line = String::new();
            for word in chunk.split_whitespace() {
                if line.is_empty() {
                    line.push_str(word);
                } else if line.chars().count() + 1 + word.chars().count() > width {
                    out.push(line.clone());
                    line.clear();
                    line.push_str(word);
                } else {
                    line.push(' ');
                    line.push_str(word);
                }
            }
            out.push(line);
        }
        if out.is_empty() {
            out.push(String::new());
        }
        out
    }

    pub fn render(
        title: &str,
        content_json: &str,
        chars: &[ScriptCharacter],
        include_highlighting: bool,
        include_title_page: bool,
        path: &str,
    ) -> std::result::Result<(), String> {
        let mut layout = Layout::new(title).map_err(|e| format!("init: {e}"))?;

        if include_title_page {
            layout.y_mm = A4_H_MM * 0.6;
            layout.write_line(
                title,
                MARGIN_LEFT_MM,
                A4_W_MM - MARGIN_LEFT_MM - MARGIN_RIGHT_MM,
                false,
                true,
                "center",
                None,
            );
            if !chars.is_empty() {
                let names: Vec<String> = chars.iter().map(|c| c.name.clone()).collect();
                let line = format!("Charaktere: {}", names.join(", "));
                layout.write_line(
                    &line,
                    MARGIN_LEFT_MM,
                    A4_W_MM - MARGIN_LEFT_MM - MARGIN_RIGHT_MM,
                    true,
                    false,
                    "center",
                    None,
                );
            }
            layout.new_page();
        }

        let content_w = A4_W_MM - MARGIN_LEFT_MM - MARGIN_RIGHT_MM;
        let blocks = extract_blocks(content_json);
        // Map uppercased name -> color, for Character/Dialog/Parenthetical tinting.
        let char_color: std::collections::HashMap<String, &str> = chars
            .iter()
            .map(|c| (c.name.to_uppercase(), c.color.as_str()))
            .collect();

        for (idx, b) in blocks.iter().enumerate() {
            if b.kind == "scriptz-character" {
                let needed = LINE_HEIGHT_MM * 4.0 + PARA_GAP_MM * 2.0;
                layout.ensure_space(needed);
            }
            let tint = if include_highlighting {
                match b.kind.as_str() {
                    "scriptz-character" | "scriptz-dialog" | "scriptz-parenthetical" => {
                        // Walk back to nearest preceding character block to get the name.
                        let mut name: Option<String> = if b.kind == "scriptz-character" {
                            Some(b.text.trim().to_uppercase())
                        } else {
                            None
                        };
                        if name.is_none() {
                            for j in (0..idx).rev() {
                                if blocks[j].kind == "scriptz-character" {
                                    name = Some(blocks[j].text.trim().to_uppercase());
                                    break;
                                }
                            }
                        }
                        name.as_deref()
                            .and_then(|n| char_color.get(n))
                            .map(|hex| hex_to_rgb_tint(hex, 0.18))
                    }
                    _ => None,
                }
            } else {
                None
            };
            match b.kind.as_str() {
                "scriptz-character" => {
                    layout.write_line(
                        &b.text.to_uppercase(),
                        MARGIN_LEFT_MM,
                        content_w,
                        false,
                        true,
                        "center",
                        tint,
                    );
                }
                "scriptz-dialog" => {
                    layout.write_line(
                        &b.text,
                        MARGIN_LEFT_MM + 25.0,
                        content_w - 50.0,
                        false,
                        false,
                        "left",
                        tint,
                    );
                }
                "scriptz-parenthetical" => {
                    let trimmed = b.text.trim_matches(|c| c == '(' || c == ')');
                    let line = format!("({})", trimmed);
                    layout.write_line(
                        &line,
                        MARGIN_LEFT_MM + 35.0,
                        content_w - 70.0,
                        true,
                        false,
                        "left",
                        tint,
                    );
                }
                "scriptz-action" => {
                    layout.write_line(&b.text, MARGIN_LEFT_MM, content_w, false, false, "left", None);
                }
                "scriptz-camera" => {
                    layout.write_line(
                        &b.text.to_uppercase(),
                        MARGIN_LEFT_MM,
                        content_w,
                        false,
                        true,
                        "right",
                        None,
                    );
                }
                "scriptz-caption" => {
                    let line = format!("[{}]", b.text);
                    layout.write_line(
                        &line,
                        MARGIN_LEFT_MM,
                        content_w,
                        false,
                        true,
                        "left",
                        None,
                    );
                }
                "scriptz-sfx" => {
                    let prefixed = if b.text.to_uppercase().starts_with("SFX:") {
                        b.text.clone()
                    } else {
                        format!("SFX: {}", b.text)
                    };
                    layout.write_line(
                        &prefixed,
                        MARGIN_LEFT_MM + 15.0,
                        content_w - 30.0,
                        true,
                        false,
                        "left",
                        None,
                    );
                }
                _ => {
                    layout.write_line(&b.text, MARGIN_LEFT_MM, content_w, false, false, "left", None);
                }
            }
        }

        let parent = std::path::Path::new(path).parent().map(|p| p.to_path_buf());
        if let Some(p) = parent {
            std::fs::create_dir_all(&p).ok();
        }
        let mut writer = std::io::BufWriter::new(
            std::fs::File::create(path).map_err(|e| format!("create file: {e}"))?,
        );
        layout.doc.save(&mut writer).map_err(|e| format!("save: {e}"))?;
        Ok(())
    }

    fn hex_to_rgb_tint(hex: &str, alpha_factor: f32) -> (u8, u8, u8) {
        let s = hex.trim_start_matches('#');
        if s.len() != 6 {
            return (240, 240, 240);
        }
        let r = u8::from_str_radix(&s[0..2], 16).unwrap_or(160);
        let g = u8::from_str_radix(&s[2..4], 16).unwrap_or(160);
        let b = u8::from_str_radix(&s[4..6], 16).unwrap_or(160);
        let mix = |c: u8| -> u8 {
            (255.0 - (255.0 - c as f32) * alpha_factor).round().clamp(0.0, 255.0) as u8
        };
        (mix(r), mix(g), mix(b))
    }
}

#[tauri::command]
pub fn export_pdf(db: State<Db>, input: ExportPdfInput) -> Result<ExportResult> {
    let conn = db.conn()?;
    let (title, content_json, chars) =
        read_script_for_export(&conn, &input.script_id)?;
    pdf::render(
        &title,
        &content_json,
        &chars,
        input.include_highlighting,
        input.include_title_page,
        &input.path,
    )
    .map_err(ScriptzError::Other)?;
    Ok(ExportResult { path: input.path })
}
