use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

struct SidecarChild(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // In debug/dev mode, the Python server is started manually.
            // In release mode, launch the bundled sidecar binary.
            if !cfg!(debug_assertions) {
                // Kill any stale process on port 8000 before spawning
                #[cfg(target_os = "macos")]
                {
                    let _ = std::process::Command::new("sh")
                        .args(["-c", "lsof -ti:8000 | xargs kill -9 2>/dev/null"])
                        .output();
                }
                #[cfg(target_os = "windows")]
                {
                    let _ = std::process::Command::new("cmd")
                        .args(["/C", "for /f \"tokens=5\" %a in ('netstat -aon ^| findstr :8000') do taskkill /PID %a /F 2>nul"])
                        .output();
                }

                let sidecar = app.shell().sidecar("python-backend")
                    .expect("failed to create sidecar command");
                let (mut rx, child) = sidecar.spawn()
                    .expect("failed to spawn python-backend sidecar");

                // Store child in app state so we can kill it on exit
                app.manage(SidecarChild(Mutex::new(Some(child))));

                // Log sidecar stdout/stderr for troubleshooting
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                println!("[sidecar stdout] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Stderr(line) => {
                                eprintln!("[sidecar stderr] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Terminated(status) => {
                                eprintln!("[sidecar] terminated with {:?}", status);
                                break;
                            }
                            _ => {}
                        }
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<SidecarChild>() {
                    if let Some(mut child) = state.0.lock().unwrap().take() {
                        eprintln!("[app] killing sidecar process...");
                        let _ = child.kill();
                    }
                }
            }
        });
}
