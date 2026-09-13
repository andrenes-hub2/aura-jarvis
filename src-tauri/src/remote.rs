use serde::Serialize;
use std::net::UdpSocket;
use std::sync::{Arc, Mutex};
use tiny_http::{Header, Response, Server};

const PAGE: &str = include_str!("remote_view.html");

struct RemoteState {
    server: Arc<Server>,
    ip: String,
    port: u16,
    pin: String,
    snapshot: Arc<Mutex<String>>,
}

#[derive(Default)]
pub struct RemoteRegistry(Mutex<Option<RemoteState>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    ip: String,
    port: u16,
    pin: String,
    url: String,
}

/// If Tailscale is running, its IP (100.64.0.0/10) is reachable from any
/// other device on the same tailnet regardless of physical network — the
/// whole point, since a plain LAN IP only works from the same Wi-Fi. Ask
/// the tailscale CLI itself rather than guessing from interface lists.
fn tailscale_ip() -> Option<String> {
    for candidate in ["tailscale", r"C:\Program Files\Tailscale\tailscale.exe"] {
        if let Ok(output) = std::process::Command::new(candidate).args(["ip", "-4"]).output() {
            if output.status.success() {
                let ip = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !ip.is_empty() {
                    return Some(ip);
                }
            }
        }
    }
    None
}

/// Finds this machine's LAN IP without any network dependency: connecting a
/// UDP socket doesn't actually send a packet, it just makes the OS resolve
/// which local interface/address it would use for that route.
fn lan_ip() -> String {
    (|| -> std::io::Result<String> {
        let socket = UdpSocket::bind("0.0.0.0:0")?;
        socket.connect("8.8.8.8:80")?;
        Ok(socket.local_addr()?.ip().to_string())
    })()
    .unwrap_or_else(|_| "127.0.0.1".to_string())
}

fn local_ip() -> String {
    tailscale_ip().unwrap_or_else(lan_ip)
}

fn random_pin() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(424242);
    format!("{:06}", nanos % 1_000_000)
}

/// Starts (or returns the already-running) local HTTP server that serves a
/// tiny mobile-friendly dashboard mirroring whatever the frontend last
/// pushed via `push_remote_snapshot` — a live read-only view of the active
/// project's agents and chat, reachable from any device on the same LAN,
/// gated by a one-time PIN shown in the AURA window (not real auth, but
/// enough to stop a random device on the network from stumbling onto it).
#[tauri::command]
pub fn start_remote_view(registry: tauri::State<RemoteRegistry>) -> Result<RemoteInfo, String> {
    let mut guard = registry.0.lock().map_err(|e| e.to_string())?;
    if let Some(state) = guard.as_ref() {
        return Ok(RemoteInfo {
            ip: state.ip.clone(),
            port: state.port,
            pin: state.pin.clone(),
            url: format!("http://{}:{}/", state.ip, state.port),
        });
    }

    let server = Arc::new(Server::http("0.0.0.0:0").map_err(|e| e.to_string())?);
    let port = server.server_addr().to_ip().ok_or("indirizzo del server non valido")?.port();
    let ip = local_ip();
    let pin = random_pin();
    let snapshot = Arc::new(Mutex::new("null".to_string()));

    let server_for_thread = server.clone();
    let snapshot_for_thread = snapshot.clone();
    let pin_for_thread = pin.clone();
    std::thread::spawn(move || {
        for request in server_for_thread.incoming_requests() {
            let url = request.url().to_string();
            if let Some(query) = url.strip_prefix("/state") {
                let query = query.strip_prefix('?').unwrap_or("");
                let ok_pin = query.split('&').any(|p| p == format!("pin={pin_for_thread}"));
                if ok_pin {
                    let body = snapshot_for_thread.lock().map(|s| s.clone()).unwrap_or_else(|_| "null".to_string());
                    let header = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
                    let _ = request.respond(Response::from_string(body).with_header(header));
                } else {
                    let _ = request.respond(Response::from_string("{\"error\":\"pin\"}").with_status_code(401));
                }
            } else if url == "/" {
                let header = Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap();
                let _ = request.respond(Response::from_string(PAGE).with_header(header));
            } else {
                let _ = request.respond(Response::from_string("404 Not Found").with_status_code(404));
            }
        }
    });

    let info = RemoteInfo { ip: ip.clone(), port, pin: pin.clone(), url: format!("http://{ip}:{port}/") };

    // Also drop the connection info in a plain file: lets Claude Code (or
    // the user) read the PIN/URL from outside the app when nobody can look
    // at the AURA window's screen directly.
    if let Ok(json) = serde_json::to_string_pretty(&info) {
        let _ = std::fs::write(std::env::temp_dir().join("aura-remote.json"), json);
    }

    *guard = Some(RemoteState { server, ip, port, pin, snapshot });
    Ok(info)
}

#[tauri::command]
pub fn stop_remote_view(registry: tauri::State<RemoteRegistry>) -> Result<(), String> {
    if let Some(state) = registry.0.lock().map_err(|e| e.to_string())?.take() {
        state.server.unblock();
    }
    Ok(())
}

/// Called by the frontend whenever the active project's visible state
/// changes, so the remote page always reflects the same thing the local
/// window shows — Rust never re-derives agent/chat state itself.
#[tauri::command]
pub fn push_remote_snapshot(registry: tauri::State<RemoteRegistry>, snapshot: String) -> Result<(), String> {
    if let Some(state) = registry.0.lock().map_err(|e| e.to_string())?.as_ref() {
        *state.snapshot.lock().map_err(|e| e.to_string())? = snapshot;
    }
    Ok(())
}
