use serde::Serialize;

const HIDDEN_DIRS: &[&str] = &[
    ".git", "node_modules", "__pycache__", ".venv", "venv", "target", "dist", "build", ".next", ".cache",
];

#[derive(Serialize)]
pub struct FileEntry {
    name: String,
    path: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
}

/// Lists one directory's immediate children (folders first, then files,
/// both alphabetical) for the file panel's lazy-expanding tree. Common
/// noise directories (.git, node_modules, __pycache__, venv, build
/// artifacts) are hidden — they're never what "what did the agents build"
/// is asking about.
#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut dirs = Vec::new();
    let mut files = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if HIDDEN_DIRS.contains(&name.as_str()) {
            continue;
        }

        let full_path = entry.path();
        let is_dir = full_path.is_dir();
        let item = FileEntry { name, path: full_path.to_string_lossy().into_owned(), is_dir };
        if is_dir {
            dirs.push(item);
        } else {
            files.push(item);
        }
    }

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    dirs.extend(files);
    Ok(dirs)
}

const MAX_FILE_BYTES: u64 = 512 * 1024;

/// Reads a text file for the viewer, refusing anything over 512KB (binary
/// or huge files aren't what this panel is for) rather than freezing the
/// UI trying to render them.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err(format!("File troppo grande per l'anteprima ({} KB)", metadata.len() / 1024));
    }

    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|_| "File binario, anteprima non disponibile".to_string())
}
