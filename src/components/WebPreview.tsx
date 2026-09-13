import { useState, type FormEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import "./WebPreview.css";

/**
 * A plain `file://` URL inside an <iframe> is blocked by the webview's own
 * security model when the parent page isn't itself served from `file://`
 * (ours is served from the dev server / the `tauri://` origin in a release
 * build) — it silently fails as a refused connection. Tauri's asset
 * protocol is the sanctioned way around that: it serves a local path
 * through an origin the webview already trusts, gated by the `scope`
 * allow-list in tauri.conf.json.
 */
function toAssetUrl(projectPath: string, relative: string) {
  const normalized = projectPath.replace(/\\/g, "/");
  const withSlash = normalized.endsWith("/") ? normalized : `${normalized}/`;
  return convertFileSrc(`${withSlash}${relative}`);
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
        <button onClick={() => go(toAssetUrl(projectPath, "index.html"))}>Apri index.html</button>
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
