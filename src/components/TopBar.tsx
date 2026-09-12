import { useAppState } from "../state/AppState";
import "./TopBar.css";

const ENGINE_LABEL: Record<string, string> = {
  checking: "Claude — verifica…",
  connected: "Claude — connesso",
  unavailable: "Claude — non trovato",
};

export function TopBar({ onToggleLog, logOpen }: { onToggleLog: () => void; logOpen: boolean }) {
  const { activeProject, engineStatus, toggleRuflo } = useAppState();
  const activeCount = activeProject?.agents.filter((a) => a.status === "active").length ?? 0;

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-mark" />
        <span className="topbar-word">AURA</span>
      </div>

      {activeProject ? (
        <div className="topbar-project">
          <span className="topbar-project-name">{activeProject.name}</span>
          <span className="topbar-project-sep">·</span>
          <span className="topbar-project-agents">
            {activeProject.running ? "in esecuzione…" : `${activeCount} agenti attivi`}
          </span>
        </div>
      ) : (
        <div className="topbar-project">
          <span className="topbar-project-agents">Nessun progetto selezionato</span>
        </div>
      )}

      <div className="topbar-actions">
        {activeProject && (
          <button
            className="topbar-btn"
            data-active={Boolean(activeProject.useRuflo)}
            onClick={() => toggleRuflo(activeProject.id)}
            title="Carica il server MCP di ruflo in questa sessione per lo swarm di sub-agenti"
          >
            Ruflo
          </button>
        )}
        <div className="topbar-auth" data-status={engineStatus} title="Autenticazione via Claude Code (OAuth), nessuna API key a consumo">
          <span className="topbar-auth-dot" />
          {ENGINE_LABEL[engineStatus]}
        </div>
        <button className="topbar-btn" data-active={logOpen} onClick={onToggleLog}>
          Log
        </button>
        <button className="topbar-btn topbar-btn-icon" title="Impostazioni" aria-label="Impostazioni">
          ⚙
        </button>
      </div>
    </header>
  );
}
