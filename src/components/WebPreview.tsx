import { useState, type FormEvent } from "react";
import "./WebPreview.css";

function toFileUrl(projectPath: string, relative: string) {
  const normalized = projectPath.replace(/\\/g, "/");
  const withSlash = normalized.endsWith("/") ? normalized : `${normalized}/`;
  return `file:///${withSlash}${relative}`;
}

export function WebPreview({ projectPath }: { projectPath: string }) {
  const [draft, setDraft] = useState("http://localhost:3000");
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  function go(url: string) {
    setDraft(url);
    setLoadedUrl(url);
    setReloadKey((k) => k + 1);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    go(draft);
  }

  return (
    <div className="webpreview">
      <form className="webpreview-bar" onSubmit={handleSubmit}>
        <input
          className="webpreview-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="http://localhost:3000 oppure file:///…"
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
        <button onClick={() => go(toFileUrl(projectPath, "index.html"))}>Apri index.html</button>
        <button onClick={() => go("http://localhost:3000")}>localhost:3000</button>
        <button onClick={() => go("http://localhost:5173")}>localhost:5173 (Vite)</button>
      </div>

      {loadedUrl ? (
        <iframe key={reloadKey} src={loadedUrl} className="webpreview-frame" title="Anteprima progetto" />
      ) : (
        <p className="webpreview-empty">
          Inserisci l'indirizzo del server di sviluppo del progetto, o apri direttamente un file HTML statico.
        </p>
      )}
    </div>
  );
}
