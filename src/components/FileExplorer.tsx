import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./FileExplorer.css";

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

function extIcon(name: string) {
  if (name.includes(".")) return name.slice(name.lastIndexOf(".") + 1).toUpperCase().slice(0, 4);
  return "—";
}

function TreeNode({
  entry,
  depth,
  selectedPath,
  onSelectFile,
}: {
  entry: FileEntry;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!entry.isDir) {
      onSelectFile(entry.path);
      return;
    }
    if (!expanded && children === null) {
      setLoading(true);
      try {
        const kids = await invoke<FileEntry[]>("list_dir", { path: entry.path });
        setChildren(kids);
      } finally {
        setLoading(false);
      }
    }
    setExpanded((v) => !v);
  }

  return (
    <div>
      <button
        className="file-tree-row"
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={handleClick}
        data-selected={selectedPath === entry.path}
      >
        <span className="file-tree-icon">{entry.isDir ? (expanded ? "▾" : "▸") : extIcon(entry.name)}</span>
        <span className="file-tree-name">{entry.name}</span>
        {loading && <span className="file-tree-loading">…</span>}
      </button>
      {expanded && children && (
        <div>
          {children.length === 0 ? (
            <div className="file-tree-empty" style={{ paddingLeft: 10 + (depth + 1) * 14 }}>
              vuota
            </div>
          ) : (
            children.map((child) => (
              <TreeNode key={child.path} entry={child} depth={depth + 1} selectedPath={selectedPath} onSelectFile={onSelectFile} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function FileExplorer({ projectPath }: { projectPath: string }) {
  const [roots, setRoots] = useState<FileEntry[] | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRoots(null);
    setSelectedPath(null);
    setContent(null);
    invoke<FileEntry[]>("list_dir", { path: projectPath }).then((entries) => {
      // A fast project switch can leave an older `list_dir` call still in
      // flight when a newer one starts; without this guard, whichever
      // resolves last wins and can overwrite the tree with the wrong
      // project's files.
      if (!cancelled) setRoots(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  async function selectFile(path: string) {
    setSelectedPath(path);
    setContent(null);
    setError(null);
    try {
      const text = await invoke<string>("read_text_file", { path });
      setContent(text);
    } catch (err) {
      setError(String(err));
    }
  }

  if (roots === null) {
    return <div className="file-explorer-loading">Carico i file del progetto…</div>;
  }

  return (
    <div className="file-explorer">
      <div className="file-tree">
        {roots.length === 0 ? (
          <p className="file-tree-empty-root">Nessun file ancora in questo progetto.</p>
        ) : (
          roots.map((entry) => (
            <TreeNode key={entry.path} entry={entry} depth={0} selectedPath={selectedPath} onSelectFile={selectFile} />
          ))
        )}
      </div>
      <div className="file-viewer">
        {!selectedPath && <p className="file-viewer-empty">Seleziona un file per vederne il contenuto.</p>}
        {selectedPath && (
          <>
            <div className="file-viewer-path">{selectedPath}</div>
            {error && <p className="file-viewer-error">{error}</p>}
            {content !== null && <pre className="file-viewer-content">{content}</pre>}
          </>
        )}
      </div>
    </div>
  );
}
