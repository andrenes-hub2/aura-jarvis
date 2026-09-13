import { useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./WebPreview.css";

export function WebPreview({ projectId, projectPath }: { projectId: string; projectPath: string }) {
  const [draft, setDraft] = useState("http://localhost:3000");
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [starting, setStarting] = useState(false);

  function go(url: string) {
    setDraft(url);
    setLoadedUrl(url);
    setReloadKey((k) => k + 1);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    go(draft);
  }

  async function openStatic() {
    // A file:// or asset-protocol src loads the HTML, but WebView2 is
    // strict enough about script MIME types on a non-http origin that
    // <script src> tags silently never run — buttons look present but do
    // nothing. A real (if minimal) local HTTP server sidesteps that
    // entirely, the same way Claude Code's own Playwright tooling
    // previews a static site.
    setStarting(true);
    try {
      const port = await invoke<number>("start_static_server", { projectId, path: projectPath });
      go(`http://127.0.0.1:${port}/index.html`);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="webpreview">
      <form className="webpreview-bar" onSubmit={handleSubmit}>
        <input
          className="webpreview-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="http://localhost:3000"
        />
        <button type="submit" className="webpreview-go">
          Vai
        </button>
        {loadedUrl && (
          <button type="button" className="webpreview-go" onClick={() => setReloadKey((k) => k + 1)} title="Ricarica">
            ↻
          </button>
        )}
      </form>

      <div className="webpreview-quick">
        <button onClick={() => void openStatic()} disabled={starting}>
          {starting ? "Avvio…" : "Apri index.html"}
        </button>
        <button onClick={() => go("http://localhost:3000")}>localhost:3000</button>
        <button onClick={() => go("http://localhost:5173")}>localhost:5173 (Vite)</button>
      </div>

      {loadedUrl ? (
        <iframe key={reloadKey} src={loadedUrl} className="webpreview-frame" title="Anteprima progetto" />
      ) : (
        <p className="webpreview-empty">
          Inserisci l'indirizzo del server di sviluppo del progetto, o apri direttamente un sito statico.
        </p>
      )}
    </div>
  );
}
