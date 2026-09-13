use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use tiny_http::{Header, Response, Server};

struct Instance {
    port: u16,
    server: Arc<Server>,
}

#[derive(Default)]
pub struct StaticServerRegistry(Mutex<HashMap<String, Instance>>);

impl StaticServerRegistry {
    /// Ferma tutti i server statici in ascolto sbloccando i thread bloccati
    /// su `incoming_requests()`, così da non lasciare thread e socket orfani
    /// alla chiusura dell'app (mirror di `TerminalRegistry::close_all()`).
    pub fn close_all(&self) {
        if let Ok(mut ports) = self.0.lock() {
            for (_, instance) in ports.drain() {
                instance.server.unblock();
            }
        }
    }
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase().as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "wasm" => "application/wasm",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// Resolves a URL path against the project root, so the preview can't be
/// tricked into serving files outside the project. Only accepts components
/// that stay strictly relative and downward (`Normal` / `CurDir`) — this
/// also covers `..` traversal, but the reason it can't just check for
/// `ParentDir` on the joined path (as a first version of this did) is that
/// `PathBuf::join` silently *discards* `root` and returns its argument
/// verbatim when that argument is itself absolute (a drive letter like
/// `C:/Windows/win.ini` on Windows, or a path a decoded leading slash
/// turned absolute) — such a candidate has no `..` in it at all, so that
/// check alone let a request read any file the process could read.
fn resolve_safe(root: &Path, url_path: &str) -> Option<PathBuf> {
    let decoded = urlencoding_decode(url_path);
    let trimmed = decoded.trim_start_matches(['/', '\\']);
    let relative = if trimmed.is_empty() { "index.html" } else { trimmed };
    let rel_path = Path::new(relative);

    if rel_path.components().any(|c| !matches!(c, Component::Normal(_) | Component::CurDir)) {
        return None;
    }
    Some(root.join(rel_path))
}

fn urlencoding_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(hex);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Starts (or reuses) a plain local HTTP server rooted at a project
/// directory, so the web preview panel can load it as `http://127.0.0.1:<port>/`
/// with correct MIME types — the same thing Claude Code's own Playwright
/// tooling does to preview a static site. A `file://`/asset-protocol src
/// inside the iframe technically loads the HTML, but WebView2 is strict
/// enough about MIME types on non-http origins that `<script src>` tags
/// silently fail to execute, which is why buttons on the page did nothing.
#[tauri::command]
pub fn start_static_server(registry: tauri::State<StaticServerRegistry>, project_id: String, path: String) -> Result<u16, String> {
    let mut ports = registry.0.lock().map_err(|e| e.to_string())?;
    if let Some(instance) = ports.get(&project_id) {
        return Ok(instance.port);
    }

    let server = Arc::new(Server::http("127.0.0.1:0").map_err(|e| e.to_string())?);
    let port = server.server_addr().to_ip().ok_or("indirizzo del server non valido")?.port();
    let root = PathBuf::from(path);

    let thread_server = Arc::clone(&server);
    std::thread::spawn(move || {
        for request in thread_server.incoming_requests() {
            let target = resolve_safe(&root, request.url());
            let response = match target.and_then(|p| std::fs::read(&p).ok().map(|bytes| (p, bytes))) {
                Some((p, bytes)) => {
                    let header = Header::from_bytes(&b"Content-Type"[..], content_type(&p).as_bytes()).unwrap();
                    Response::from_data(bytes).with_header(header)
                }
                None => Response::from_string("404 Not Found").with_status_code(404),
            };
            let _ = request.respond(response);
        }
    });

    ports.insert(project_id, Instance { port, server });
    Ok(port)
}

/// Ferma il server statico associato a un progetto. Il preview panel la
/// chiama quando l'utente naviga via da un progetto: senza questo, ogni
/// progetto mai visto in anteprima perderebbe per sempre il suo thread in
/// ascolto e la relativa socket. Non è un errore se non c'è nulla da fermare.
#[tauri::command]
pub fn stop_static_server(registry: tauri::State<StaticServerRegistry>, project_id: String) -> Result<(), String> {
    let mut ports = registry.0.lock().map_err(|e| e.to_string())?;
    if let Some(instance) = ports.remove(&project_id) {
        instance.server.unblock();
    }
    Ok(())
}
