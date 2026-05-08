// Migration-only helper: lets the TS frontend forward log messages
// into the same `tracing` stream Rust uses, so they show up in the
// terminal where `tauri:dev` runs. Useful when the WebKit DevTools
// console is unreliable / hidden / filtered, which is the situation
// during the Rust → TS migration's early phases.
//
// Once the migration is far enough along that the frontend console is
// the source of truth again, this file can be deleted.

#[tauri::command]
pub fn frontend_log(level: String, message: String) {
    match level.as_str() {
        "error" => tracing::error!(target: "frontend", "{}", message),
        "warn" => tracing::warn!(target: "frontend", "{}", message),
        _ => tracing::info!(target: "frontend", "{}", message),
    }
}
