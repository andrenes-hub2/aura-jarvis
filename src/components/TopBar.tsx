import { useAppState } from "../state/AppState";
import "./TopBar.css";

export function TopBar({ onToggleLog, logOpen }: { onToggleLog: () => void; logOpen: boolean }) {
  const { activeProject } = useAppState();
  const activeCount = activeProject.agents.filter((a) => a.status === "active").length;

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-mark" />
        <span className="topbar-word">AURA</span>
      </div>

      <div className="topbar-project">
        <span className="topbar-project-name">{activeProject.name}</span>
        <span className="topbar-project-sep">·</span>
        <span className="topbar-project-agents">{activeCount} agenti attivi</span>
      </div>

      <div className="topbar-actions">
        <div className="topbar-auth" title="Autenticato via Claude Code (OAuth)">
          <span className="topbar-auth-dot" />
          Claude — connesso
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
