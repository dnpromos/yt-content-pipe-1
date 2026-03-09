use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let sidecar = app.shell().sidecar("python-backend")
                .expect("failed to create sidecar command");
            let (_rx, _child) = sidecar.spawn()
                .expect("failed to spawn python-backend sidecar");
            // Keep _child alive so the process isn't dropped
            app.manage(_child);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
