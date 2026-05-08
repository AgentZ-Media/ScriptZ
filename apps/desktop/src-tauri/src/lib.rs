mod commands;
mod db;
mod error;
mod fts;
mod lex;
mod models;

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::db::Db;

fn resolve_db_path(app: &AppHandle) -> std::io::Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| std::io::Error::other(format!("app_data_dir: {e}")))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("scriptz.db"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("scriptz=debug,info")),
        )
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            tracing::info!("======== ScriptZ booting (migration build, plugin-sql wired) ========");
            let db_path = resolve_db_path(app.handle())?;
            tracing::info!("opening database: {:?}", db_path);
            let db = Db::open(&db_path)
                .map_err(|e| Box::<dyn std::error::Error>::from(format!("db open: {e}")))?;
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // debug (migration-only — frontend → terminal log bridge)
            commands::debug::frontend_log,
            // scripts
            commands::scripts::create_script,
            commands::scripts::get_script,
            commands::scripts::update_script,
            commands::scripts::list_scripts,
            commands::scripts::archive_script,
            commands::scripts::restore_script,
            commands::scripts::purge_script,
            commands::scripts::empty_trash,
            commands::scripts::duplicate_script,
            commands::scripts::rename_script,
            // folders
            commands::folders::count_live_scripts,
            commands::folders::list_folders,
            commands::folders::create_folder,
            commands::folders::rename_folder,
            commands::folders::delete_folder,
            commands::folders::move_script,
            commands::folders::move_scripts,
            // snapshots
            commands::snapshots::create_snapshot,
            commands::snapshots::list_snapshots,
            commands::snapshots::get_snapshot,
            commands::snapshots::restore_snapshot,
            commands::snapshots::delete_snapshot,
            // search
            commands::search::global_search,
            // settings
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::list_settings,
            // app_state
            commands::app_state::get_app_state,
            commands::app_state::set_app_state,
            // export
            commands::export::export_pdf,
            commands::export::export_plaintext,
            // character colors (app-wide overrides)
            commands::character_colors::list_character_colors,
            commands::character_colors::set_character_color,
            commands::character_colors::clear_character_color,
            // ai (OpenRouter — opt-in)
            commands::ai::ai_get_state,
            commands::ai::ai_set_api_key,
            commands::ai::ai_clear_api_key,
            commands::ai::ai_set_enabled,
            commands::ai::ai_set_model,
            commands::ai::ai_list_models,
            commands::ai::ai_test_connection,
            commands::ai::ai_generate_summary,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
