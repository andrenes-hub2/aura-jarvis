use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Clone, Serialize)]
struct AgentEventPayload {
    event: serde_json::Value,
}

/// Resolves the real Claude Code executable.
///
/// On Windows, global npm packages install as `claude.cmd` / `claude.ps1`
/// shims, not a plain `claude.exe` on PATH — and `std::process::Command`
/// cannot launch a `.cmd` file directly (it isn't a native PE image), so
/// `Command::new("claude")` silently fails to spawn. The npm shim's actual
/// payload is a real native binary one level down
/// (`node_modules/@anthropic-ai/claude-code/bin/claude.exe`); we target
/// that directly so we never have to round-trip through cmd.exe (which
/// would also mangle prompt text containing `&`, `|`, `%%`, or quotes).
fn claude_binary() -> &'static PathBuf {
    static RESOLVED: OnceLock<PathBuf> = OnceLock::new();
    RESOLVED.get_or_init(|| {
        if cfg!(target_os = "windows") {
            if let Ok(appdata) = std::env::var("APPDATA") {
                let candidate = PathBuf::from(appdata)
                    .join("npm")
                    .join("node_modules")
                    .join("@anthropic-ai")
                    .join("claude-code")
                    .join("bin")
                    .join("claude.exe");
                if candidate.exists() {
                    return candidate;
                }
            }
        }
        PathBuf::from("claude")
    })
}

fn ruflo_mcp_config() -> String {
    serde_json::json!({
        "mcpServers": {
            "ruflo": {
                "command": "npx",
                "args": ["-y", "ruflo", "mcp", "start"]
            }
        }
    })
    .to_string()
}

/// Runs a Claude Code headless session for a project and streams every
/// stream-json event back to the frontend as it arrives, on the
/// `agent-event:<project_id>` channel. Returns the session id so the
/// caller can pass it back as `resume_session_id` to continue the
/// same conversation on the next prompt.
#[tauri::command]
async fn send_prompt(
    app: AppHandle,
    project_id: String,
    project_path: String,
    prompt: String,
    resume_session_id: Option<String>,
    use_ruflo: bool,
) -> Result<String, String> {
    eprintln!("[aura] send_prompt: bin={:?} dir={project_path}", claude_binary());

    let mut cmd = Command::new(claude_binary());
    cmd.arg("-p")
        .arg(&prompt)
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        .arg("--forward-subagent-text")
        .arg("--add-dir")
        .arg(&project_path)
        .current_dir(&project_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(sid) = resume_session_id.filter(|s| !s.is_empty()) {
        cmd.arg("--resume").arg(sid);
    }

    if use_ruflo {
        cmd.arg("--mcp-config").arg(ruflo_mcp_config());
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Impossibile avviare Claude Code ('claude' e' nel PATH?): {e}"))?;

    eprintln!("[aura] send_prompt: spawned pid={:?}", child.id());

    let stdout = child.stdout.take().ok_or("nessuno stdout dal processo claude")?;
    let stderr = child.stderr.take().ok_or("nessuno stderr dal processo claude")?;

    let channel = format!("agent-event:{project_id}");
    let mut session_id = String::new();

    let mut out_lines = BufReader::new(stdout).lines();
    let mut err_lines = BufReader::new(stderr).lines();

    loop {
        tokio::select! {
            line = out_lines.next_line() => {
                match line.map_err(|e| e.to_string())? {
                    Some(line) => {
                        if line.trim().is_empty() { continue; }
                        eprintln!("[aura] send_prompt: line: {}", &line[..line.len().min(200)]);
                        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                            if let Some(sid) = value.get("session_id").and_then(|v| v.as_str()) {
                                session_id = sid.to_string();
                            }
                            match app.emit(&channel, AgentEventPayload { event: value }) {
                                Ok(()) => {}
                                Err(e) => eprintln!("[aura] send_prompt: emit failed: {e}"),
                            }
                        } else {
                            eprintln!("[aura] send_prompt: failed to parse line as JSON");
                        }
                    }
                    None => break,
                }
            }
            line = err_lines.next_line() => {
                if let Ok(Some(line)) = line {
                    if !line.trim().is_empty() {
                        let _ = app.emit(&channel, AgentEventPayload {
                            event: serde_json::json!({ "type": "stderr", "text": line }),
                        });
                    }
                }
            }
        }
    }

    eprintln!("[aura] send_prompt: stdout/stderr closed, waiting on child");
    let status = child.wait().await.map_err(|e| e.to_string())?;
    eprintln!("[aura] send_prompt: child exited with status={status} session_id={session_id}");
    if !status.success() && session_id.is_empty() {
        return Err(format!("Sessione Claude Code terminata con errore ({status})"));
    }

    Ok(session_id)
}

/// Quick health check used by the UI to show a real "connesso" / "non trovato"
/// status instead of assuming Claude Code is always available.
#[tauri::command]
async fn check_engine() -> Result<String, String> {
    let output = Command::new(claude_binary())
        .arg("--version")
        .output()
        .await
        .map_err(|e| format!("'claude' non trovato nel PATH: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![send_prompt, check_engine])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
