import { useAppState } from "../state/AppState";
import "./Sidebar.css";

export function Sidebar() {
  const { projects, activeProjectId, selectProject, createProject } = useAppState();

  return (
    <aside className="sidebar">
      <div className="sidebar-label">Progetti</div>

      {projects.length === 0 && (
        <p className="sidebar-empty">Nessun progetto. Scegli una cartella reale su cui far lavorare Claude.</p>
      )}

      <nav className="sidebar-list">
        {projects.map((p) => {
          const activeCount = p.agents.filter((a) => a.status === "active").length;
          return (
            <button
              key={p.id}
              className={`sidebar-item ${p.id === activeProjectId ? "is-active" : ""}`}
              onClick={() => selectProject(p.id)}
              title={p.path}
            >
              <span className="sidebar-item-dot" data-live={p.running || activeCount > 0} />
              <span className="sidebar-item-name">{p.name}</span>
              <span className="sidebar-item-count">{p.agents.length}</span>
            </button>
          );
        })}
      </nav>

      <button className="sidebar-new" onClick={() => void createProject()}>
        + Nuovo progetto
      </button>
    </aside>
  );
}
