use crate::claude_binary;
use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Clone, Serialize)]
pub struct CheckResult {
    ok: bool,
    detail: String,
}

fn ok(detail: impl Into<String>) -> CheckResult {
    CheckResult { ok: true, detail: detail.into() }
}
fn fail(detail: impl Into<String>) -> CheckResult {
    CheckResult { ok: false, detail: detail.into() }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    node: CheckResult,
    npm: CheckResult,
    claude: CheckResult,
    claude_auth: CheckResult,
    ruflo: CheckResult,
}

/// Resolves node.exe's own install directory on Windows via `where`
/// (a real system .exe, never a shim) so we can run npm/npx's *.js entry
/// points through `node` directly. Same root cause as `claude_binary`:
/// npm ships `npm.cmd` / `npx.cmd` on Windows, and a bare
/// `Command::new("npm")` cannot execute those — only `npm`/`npm-cli.js`,
/// which are not native PE images either.
fn node_dir() -> Option<PathBuf> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        let output = std::process::Command::new("where").arg("node").output().ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let first = text.lines().next()?.trim();
        Some(PathBuf::from(first).parent()?.to_path_buf())
    })
    .clone()
}

fn node_cli_command(entry_dir: &str, entry_file: &str, posix_fallback: &str) -> Command {
    if cfg!(target_os = "windows") {
        if let Some(dir) = node_dir() {
            let script = dir.join("node_modules").join(entry_dir).join("bin").join(entry_file);
            if script.exists() {
                let mut c = Command::new("node");
                c.arg(script);
                return c;
            }
        }
    }
    Command::new(posix_fallback)
}

fn npm_command() -> Command {
    node_cli_command("npm", "npm-cli.js", "npm")
}

fn has_command(bin: &str) -> bool {
    std::process::Command::new(bin)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

async fn run_check(mut cmd: Command) -> CheckResult {
    match cmd.output().await {
        Ok(out) if out.status.success() => ok(String::from_utf8_lossy(&out.stdout).trim().to_string()),
        Ok(out) => fail(String::from_utf8_lossy(&out.stderr).trim().to_string()),
        Err(e) => fail(e.to_string()),
    }
}

/// Checks every prerequisite AURA's real engine needs: Node/npm (required
/// to run ruflo), Claude Code itself and its OAuth login, and ruflo.
#[tauri::command]
pub async fn run_diagnostics() -> Diagnostics {
    let node = run_check({
        let mut c = Command::new("node");
        c.arg("--version");
        c
    })
    .await;

    let npm = run_check({
        let mut c = npm_command();
        c.arg("--version");
        c
    })
    .await;

    let claude = run_check({
        let mut c = Command::new(claude_binary());
        c.arg("--version");
        c
    })
    .await;

    let claude_auth = {
        let output = Command::new(claude_binary()).arg("auth").arg("status").output().await;
        match output {
            Ok(out) => {
                let text = String::from_utf8_lossy(&out.stdout);
                match serde_json::from_str::<serde_json::Value>(&text) {
                    Ok(v) if v.get("loggedIn").and_then(|b| b.as_bool()) == Some(true) => {
                        let email = v.get("email").and_then(|e| e.as_str()).unwrap_or("account sconosciuto");
                        let plan = v.get("subscriptionType").and_then(|s| s.as_str()).unwrap_or("");
                        ok(format!("{email} ({plan})"))
                    }
                    _ => fail("Non autenticato"),
                }
            }
            Err(e) => fail(e.to_string()),
        }
    };

    let ruflo = run_check({
        let mut c = npm_command();
        c.args(["ls", "-g", "ruflo", "--depth=0"]);
        c
    })
    .await;

    Diagnostics { node, npm, claude, claude_auth, ruflo }
}

#[derive(Clone, Serialize)]
struct SetupEventPayload {
    step: String,
    line: String,
}

/// Installs one missing prerequisite, streaming its output live on the
/// `setup-event` channel so the UI can show real install progress instead
/// of a spinner. `component` is one of "node", "claude", "ruflo".
#[tauri::command]
pub async fn install_component(app: AppHandle, component: String) -> Result<(), String> {
    let mut cmd = match component.as_str() {
        "node" if cfg!(target_os = "windows") => {
            let mut c = Command::new("winget");
            c.args([
                "install",
                "--id",
                "OpenJS.NodeJS.LTS",
                "-e",
                "--silent",
                "--accept-package-agreements",
                "--accept-source-agreements",
            ]);
            c
        }
        "node" if cfg!(target_os = "macos") && has_command("brew") => {
            let mut c = Command::new("brew");
            c.args(["install", "node"]);
            c
        }
        "node" => return Err("MANUAL:https://nodejs.org/".to_string()),
        "claude" => {
            let mut c = npm_command();
            c.args(["install", "-g", "@anthropic-ai/claude-code"]);
            c
        }
        "ruflo" => {
            let mut c = npm_command();
            c.args(["install", "-g", "ruflo", "zod"]);
            c
        }
        other => return Err(format!("Componente sconosciuto: {other}")),
    };

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("Impossibile avviare l'installazione: {e}"))?;

    let stdout = child.stdout.take().ok_or("nessuno stdout")?;
    let stderr = child.stderr.take().ok_or("nessuno stderr")?;
    let mut out_lines = BufReader::new(stdout).lines();
    let mut err_lines = BufReader::new(stderr).lines();

    loop {
        tokio::select! {
            line = out_lines.next_line() => match line.map_err(|e| e.to_string())? {
                Some(l) => { let _ = app.emit("setup-event", SetupEventPayload { step: component.clone(), line: l }); }
                None => break,
            },
            line = err_lines.next_line() => {
                if let Ok(Some(l)) = line {
                    let _ = app.emit("setup-event", SetupEventPayload { step: component.clone(), line: l });
                }
            }
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("Installazione terminata con errore ({status})"))
    }
}

/// Opens a real terminal running Claude Code interactively so the user can
/// complete the OAuth login flow normally — we deliberately don't try to
/// script the login itself, since it's an interactive browser handoff.
#[tauri::command]
pub async fn open_login_terminal() -> Result<(), String> {
    if cfg!(target_os = "windows") {
        std::process::Command::new("cmd")
            .args(["/C", "start", "AURA - Login Claude"])
            .arg(claude_binary())
            .spawn()
            .map_err(|e| e.to_string())?;
    } else if cfg!(target_os = "macos") {
        let script = format!("tell application \"Terminal\" to do script \"{}\"", claude_binary().display());
        std::process::Command::new("osascript")
            .args(["-e", &script])
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        return Err("Apertura automatica del terminale non supportata su questa piattaforma".to_string());
    }
    Ok(())
}
