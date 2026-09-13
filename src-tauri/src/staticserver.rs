use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tiny_http::{Header, Response, Server};

#[derive(Default)]
pub struct StaticServerRegistry(Mutex<HashMap<String, u16>>);

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

/// Resolves a URL path against the project root, rejecting `..` segments
/// so the preview can't be tricked into serving files outside the project.
fn resolve_safe(root: &Path, url_path: &str) -> Option<PathBuf> {
    let decoded = urlencoding_decode(url_path);
    let trimmed = decoded.trim_start_matches('/');
    let candidate = if trimmed.is_empty() { root.join("index.html") } else { root.join(trimmed) };

    if candidate.components().any(|c| matches!(c, Component::ParentDir)) {
        return None;
    }
    Some(candidate)
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
    if let Some(port) = ports.get(&project_id) {
        return Ok(*port);
    }

    let server = Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = server.server_addr().to_ip().ok_or("indirizzo del server non valido")?.port();
    let root = PathBuf::from(path);

    std::thread::spawn(move || {
        for request in server.incoming_requests() {
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

    ports.insert(project_id, port);
    Ok(port)
}
