use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

struct TerminalSession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Default)]
pub struct TerminalRegistry(Mutex<HashMap<String, TerminalSession>>);

fn default_shell() -> CommandBuilder {
    if cfg!(target_os = "windows") {
        CommandBuilder::new("powershell.exe")
    } else {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        CommandBuilder::new(shell)
    }
}

/// Opens (or reuses) a real PTY-backed shell for a project, rooted at its
/// folder, and streams its output live on `terminal-output:<project_id>`.
/// This is a genuine interactive terminal (arrow-key history, colors,
/// running programs that expect a TTY) rather than a piped subprocess —
/// the point is to actually run and poke at whatever Aura/ruflo built.
#[tauri::command]
pub fn open_terminal(
    app: AppHandle,
    registry: State<TerminalRegistry>,
    project_id: String,
    cwd: String,
) -> Result<(), String> {
    let mut sessions = registry.0.lock().map_err(|e| e.to_string())?;
    if sessions.contains_key(&project_id) {
        return Ok(());
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 30, cols: 100, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = default_shell();
    cmd.cwd(&cwd);

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let channel = format!("terminal-output:{project_id}");
    let app_for_thread = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).into_owned();
                    if app_for_thread.emit(&channel, text).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    sessions.insert(project_id, TerminalSession { writer, master: pair.master, child });
    Ok(())
}

#[tauri::command]
pub fn write_terminal(registry: State<TerminalRegistry>, project_id: String, data: String) -> Result<(), String> {
    let mut sessions = registry.0.lock().map_err(|e| e.to_string())?;
    let session = sessions.get_mut(&project_id).ok_or("nessun terminale aperto per questo progetto")?;
    session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_terminal(registry: State<TerminalRegistry>, project_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = registry.0.lock().map_err(|e| e.to_string())?;
    let session = sessions.get(&project_id).ok_or("nessun terminale aperto per questo progetto")?;
    session
        .master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_terminal(registry: State<TerminalRegistry>, project_id: String) -> Result<(), String> {
    let mut sessions = registry.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = sessions.remove(&project_id) {
        let _ = session.child.kill();
    }
    Ok(())
}
