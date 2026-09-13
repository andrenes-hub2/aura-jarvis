mod files;
mod logging;
mod optimizer;
mod procutil;
mod remote;
mod secrets;
mod setup;
mod staticserver;
mod terminal;

use procutil::tokio_command;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};

#[derive(Clone, Serialize)]
struct AgentEventPayload {
    event: serde_json::Value,
}

/// Resolves the real Claude Code executable.
///
/// On Windows, global npm packages install as `claude.cmd` / `claude.ps1`
/// shims, not a plain `claude.exe` on PATH — and `std::process::Command`
/// cannot launch a `.cmd` file directly (it isn't a native PE image), so
/// `tokio_command("claude")` silently fails to spawn. The npm shim's actual
/// payload is a real native binary one level down
/// (`node_modules/@anthropic-ai/claude-code/bin/claude.exe`); we target
/// that directly so we never have to round-trip through cmd.exe (which
/// would also mangle prompt text containing `&`, `|`, `%%`, or quotes).
///
/// Deliberately not cached: a `OnceLock` here meant that if Claude Code
/// wasn't installed yet on first call, every later call — including right
/// after installing it from the Setup panel — kept getting back the same
/// unresolved "claude" fallback for the rest of the app's lifetime, so a
/// fresh install only took effect after a full restart. The check itself
/// is one env var read plus one `exists()` stat, cheap enough to redo.
pub(crate) fn claude_binary() -> PathBuf {
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
}

/// `npx -y ruflo ...` re-fetches the package into a fresh, isolated npx
/// cache dir on every run — and at least as of ruflo 3.41.2 that ephemeral
/// install is broken (a transitive dependency, `zod`, required by
/// `@claude-flow/security` isn't hoisted there, so the MCP server crashes
/// on startup with ERR_MODULE_NOT_FOUND). A normal `npm install` resolves
/// it fine, so we require ruflo to be installed globally once
/// (`npm install -g ruflo zod`) and use `--no-install` so npx reuses that
/// working install instead of re-triggering the broken ephemeral path.
fn ruflo_mcp_config() -> String {
    serde_json::json!({
        "mcpServers": {
            "ruflo": {
                "command": "npx",
                "args": ["--no-install", "ruflo", "mcp", "start"]
            }
        }
    })
    .to_string()
}

/// Spawns `claude` with the given extra args, rooted at `cwd`, and streams
/// every stream-json event live on `channel` as it arrives. Returns the
/// session id so the caller can pass it back via `--resume` next time.
/// Shared by `send_prompt` (real projects) and the prompt-optimizer window
/// (its own scratch session) so both get identical streaming/error handling.
pub(crate) async fn run_claude_stream(
    app: AppHandle,
    channel: String,
    cwd: &Path,
    args: Vec<String>,
    envs: Vec<(String, String)>,
) -> Result<String, String> {
    logging::log(format!("run_claude_stream: bin={:?} dir={cwd:?} args={args:?}", claude_binary()));

    let mut cmd = tokio_command(claude_binary());
    cmd.args(&args)
        .envs(envs)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Impossibile avviare Claude Code ('claude' e' nel PATH?): {e}"))?;

    logging::log(format!("run_claude_stream: spawned pid={:?}", child.id()));

    let stdout = child.stdout.take().ok_or("nessuno stdout dal processo claude")?;
    let stderr = child.stderr.take().ok_or("nessuno stderr dal processo claude")?;

    let mut session_id = String::new();
    let mut out_lines = BufReader::new(stdout).lines();
    let mut err_lines = BufReader::new(stderr).lines();

    loop {
        tokio::select! {
            line = out_lines.next_line() => {
                match line.map_err(|e| e.to_string())? {
                    Some(line) => {
                        if line.trim().is_empty() { continue; }
                        logging::log(format!("run_claude_stream: line: {}", &line[..line.len().min(2000)]));
                        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                            if let Some(sid) = value.get("session_id").and_then(|v| v.as_str()) {
                                session_id = sid.to_string();
                            }
                            match app.emit(&channel, AgentEventPayload { event: value }) {
                                Ok(()) => {}
                                Err(e) => logging::log(format!("run_claude_stream: emit failed: {e}")),
                            }
                        } else {
                            logging::log("run_claude_stream: failed to parse line as JSON");
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

    logging::log("run_claude_stream: stdout/stderr closed, waiting on child");
    let status = child.wait().await.map_err(|e| e.to_string())?;
    logging::log(format!("run_claude_stream: child exited with status={status} session_id={session_id}"));
    if !status.success() && session_id.is_empty() {
        return Err(format!("Sessione Claude Code terminata con errore ({status})"));
    }

    Ok(session_id)
}

/// Ruflo is not an optional helper the user has to opt into per-prompt —
/// it is the mandatory execution path. Without this, Claude tends to judge
/// "simple" requests as not worth delegating, or claims ruflo "has no
/// matching task type" and falls back to doing the work itself directly;
/// this instruction forecloses both escape hatches.
const RUFLO_MANDATORY_PROMPT: &str = "Per QUALSIASI richiesta dell'utente, indipendentemente dalla sua semplicita' o complessita' apparente, devi sempre delegarla tramite i tool mcp__ruflo__* (es. agent_spawn seguito da agent_execute, o swarm_init quando serve coordinamento tra piu' agenti). Non eseguire mai direttamente tu stesso un task che potresti in teoria fare da solo (leggere/scrivere un file, rispondere a una domanda, una piccola modifica): usa comunque ruflo per farlo eseguire da un sub-agente. Non rifiutare mai di usare ruflo dicendo che 'non ha un tipo di task corrispondente': se non esiste un tipo di agente specifico per la richiesta, spawna un agente general-purpose e descrivigli il compito in linguaggio naturale. Il tuo ruolo e' orchestrare tramite ruflo, non eseguire il lavoro in prima persona. Non prescrivere numero o ruoli specifici di agenti oltre a quanto serve per avviare la delega: lascia che sia ruflo a decidere autonomamente come comporre il proprio swarm.";

/// Without this, "analizza/revisiona questa cartella" on a real dev
/// project (this one included: src-tauri/target alone is ~13GB and 18k
/// files after a release build) sends agents walking build output and
/// dependency trees no one asked about, burning CPU/RAM until the whole
/// app becomes unresponsive or gets killed by the OS. Mirrors the same
/// hidden-directories list the file panel already uses (files.rs).
const DIRECTORY_HYGIENE_PROMPT: &str = "Quando esplori, analizzi o revisioni una cartella di progetto, ignora sempre le directory di build/dipendenze/output (node_modules, target, dist, build, .git, .next, .venv, venv, __pycache__, .cache) a meno che l'utente non chieda esplicitamente di guardare dentro una di esse: non elencarne il contenuto, non leggerne i file, non lanciare comandi che le attraversano ricorsivamente (find, dir /s, grep -r senza esclusioni). Se un progetto le contiene, limitati al codice sorgente e alla configurazione.";

/// "Full auto": no permission prompts for any tool (Bash, Edit, npm
/// installs, MCP tools included), and an explicit instruction not to
/// pause the turn on an open design question — pick something
/// reasonable and keep going. This is what "send a prompt and go to
/// sleep" requires, and it is genuinely dangerous: with it on, Claude
/// (and any ruflo sub-agents) can run any shell command, edit or
/// delete any file under the project dir, and install packages,
/// all without asking first. Only meant for a project directory the
/// user already trusts completely.
const FULL_AUTO_PROMPT: &str = "Modalita' completamente autonoma: non fare domande di chiarimento e non fermarti in attesa di conferme o scelte dall'utente. Se una decisione e' ambigua (es. quale libreria o convenzione usare), scegli tu l'opzione piu' ragionevole, motivala brevemente in una riga e prosegui subito con l'implementazione fino al completamento del task.";

/// Runs a Claude Code headless session for a project and streams every
/// stream-json event back to the frontend as it arrives, on the
/// `agent-event:<project_id>` channel. Returns the session id so the
/// caller can pass it back as `resume_session_id` to continue the
/// same conversation on the next prompt. Ruflo is always wired in and
/// always mandated by the system prompt — it is the only execution path,
/// not a per-project toggle.
#[tauri::command]
async fn send_prompt(
    app: AppHandle,
    project_id: String,
    project_path: String,
    prompt: String,
    resume_session_id: Option<String>,
    full_auto: bool,
    attachment_paths: Vec<String>,
) -> Result<String, String> {
    let mut args = vec![
        "-p".to_string(),
        prompt,
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--forward-subagent-text".to_string(),
        "--add-dir".to_string(),
        project_path.clone(),
        "--mcp-config".to_string(),
        ruflo_mcp_config(),
    ];

    // The attach picker lets the user pick a file from anywhere, not just
    // inside the project — Claude can only read paths under a directory
    // it was given via --add-dir, so without this an attachment outside
    // the project silently failed to open ("File allegato: ..." in the
    // prompt, but no access to actually read it).
    let project_path_canon = Path::new(&project_path).canonicalize().unwrap_or_else(|_| PathBuf::from(&project_path));
    let mut extra_dirs: Vec<String> = Vec::new();
    for attachment in &attachment_paths {
        if let Some(parent) = Path::new(attachment).parent() {
            let parent_canon = parent.canonicalize().unwrap_or_else(|_| parent.to_path_buf());
            if !parent_canon.starts_with(&project_path_canon) {
                let parent_str = parent_canon.to_string_lossy().into_owned();
                if !extra_dirs.contains(&parent_str) {
                    extra_dirs.push(parent_str);
                }
            }
        }
    }
    for dir in extra_dirs {
        args.push("--add-dir".to_string());
        args.push(dir);
    }

    if let Some(sid) = resume_session_id.filter(|s| !s.is_empty()) {
        args.push("--resume".to_string());
        args.push(sid);
    }

    let mut system_prompt = format!("{RUFLO_MANDATORY_PROMPT} {DIRECTORY_HYGIENE_PROMPT}");
    if full_auto {
        args.push("--permission-mode".to_string());
        args.push("bypassPermissions".to_string());
        system_prompt.push(' ');
        system_prompt.push_str(FULL_AUTO_PROMPT);
    }
    args.push("--append-system-prompt".to_string());
    args.push(system_prompt);

    // ruflo's `agent_execute` tool calls the Anthropic API directly,
    // bypassing this OAuth session entirely, so it only works if a real
    // API key is present in the environment. Scoped to just this child
    // process (never the whole app), and read from the OS keychain —
    // never a file or localStorage. Absent, agent_execute alone will fail;
    // agent_spawn/agent_status/etc. don't need it.
    let mut envs = secrets::stored_api_key().map(|key| vec![("ANTHROPIC_API_KEY".to_string(), key)]).unwrap_or_default();

    // Claude Code and ruflo's MCP server both run on Node/V8, which caps
    // its own heap well below what's physically installed (a default
    // around 2-4GB) unless told otherwise — a machine with 64GB of RAM
    // gets no benefit from it by default. A heavy analysis/review task
    // that ends up holding a lot of tool output in memory can hit that
    // self-imposed ceiling and crash with "JavaScript heap out of memory",
    // which surfaces as the session abruptly restarting mid-task. This
    // env var only reaches this child process and whatever it spawns
    // (ruflo's server included, via normal env inheritance).
    envs.push(("NODE_OPTIONS".to_string(), "--max-old-space-size=8192".to_string()));

    let envs = envs;

    let channel = format!("agent-event:{project_id}");
    let project_path_buf = PathBuf::from(&project_path);
    run_claude_stream(app, channel, &project_path_buf, args, envs).await
}

/// Quick health check used by the UI to show a real "connesso" / "non trovato"
/// status instead of assuming Claude Code is always available.
#[tauri::command]
async fn check_engine() -> Result<String, String> {
    let output = tokio_command(claude_binary())
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
    logging::init();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(terminal::TerminalRegistry::default())
        .manage(staticserver::StaticServerRegistry::default())
        .manage(remote::RemoteRegistry::default())
        .invoke_handler(tauri::generate_handler![
            send_prompt,
            check_engine,
            setup::run_diagnostics,
            setup::install_component,
            setup::open_login_terminal,
            secrets::save_api_key,
            secrets::has_api_key,
            secrets::clear_api_key,
            secrets::test_api_key,
            files::list_dir,
            files::read_text_file,
            terminal::open_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::close_terminal,
            staticserver::start_static_server,
            optimizer::send_optimizer_prompt,
            remote::start_remote_view,
            remote::stop_remote_view,
            remote::push_remote_snapshot
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Terminal sessions are deliberately kept alive across panel
            // show/hide (so switching tabs doesn't kill a running command)
            // but nothing was ever killing them on real app shutdown,
            // leaving orphaned shell processes behind.
            if let tauri::RunEvent::Exit = event {
                app_handle.state::<terminal::TerminalRegistry>().close_all();
            }
        });
}
