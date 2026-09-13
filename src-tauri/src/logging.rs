use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

/// The release build runs as a GUI app (`windows_subsystem = "windows"`),
/// which has no console — anything written to stderr (our own eprintln!
/// debug lines, and any Rust panic message) simply vanishes. That left us
/// with zero evidence the one time the app reportedly crashed. This gives
/// every run a real file to inspect afterwards.
fn log_path() -> PathBuf {
    let dir = if cfg!(target_os = "windows") {
        std::env::var("APPDATA").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("."))
    } else {
        std::env::var("HOME").map(|h| PathBuf::from(h).join("Library/Logs")).unwrap_or_else(|_| PathBuf::from("."))
    }
    .join("aura")
    .join("logs");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("aura.log")
}

fn file() -> &'static Mutex<File> {
    static FILE: OnceLock<Mutex<File>> = OnceLock::new();
    FILE.get_or_init(|| {
        let f = OpenOptions::new().create(true).append(true).open(log_path()).expect("cannot open aura.log");
        Mutex::new(f)
    })
}

pub fn log(msg: impl AsRef<str>) {
    let line = format!("[{}] {}\n", chrono_like_timestamp(), msg.as_ref());
    if let Ok(mut f) = file().lock() {
        let _ = f.write_all(line.as_bytes());
        let _ = f.flush();
    }
}

/// Avoids pulling in the `chrono` crate for one timestamp — `SystemTime`'s
/// seconds-since-epoch is enough to tell log lines apart and correlate them
/// with when the user says something happened.
fn chrono_like_timestamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    secs.to_string()
}

/// Installs a panic hook that logs the panic (message + location) before
/// the process aborts. `panic = "abort"` in the release profile means
/// there's no unwinding to catch, but the hook itself still runs first.
pub fn init() {
    log("--- aura starting ---");
    std::panic::set_hook(Box::new(|info| {
        log(format!("PANIC: {info}"));
    }));
}
