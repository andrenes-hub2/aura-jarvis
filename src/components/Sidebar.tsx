import { useState } from "react";
import { useAppState } from "../state/AppState";
import "./Sidebar.css";

export function Sidebar() {
  const { projects, activeProjectId, selectProject, createProject } = useAppState();
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");

  function commitCreate() {
    const name = draftName.trim();
    if (name) createProject(name);
    setDraftName("");
    setCreating(false);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-label">Progetti</div>
      <nav className="sidebar-list">
        {projects.map((p) => {
          const activeCount = p.agents.filter((a) => a.status === "active").length;
          return (
            <button
              key={p.id}
              className={`sidebar-item ${p.id === activeProjectId ? "is-active" : ""}`}
              onClick={() => selectProject(p.id)}
            >
              <span className="sidebar-item-dot" data-live={activeCount > 0} />
              <span className="sidebar-item-name">{p.name}</span>
              <span className="sidebar-item-count">{p.agents.length}</span>
            </button>
          );
        })}
      </nav>

      {creating ? (
        <form
          className="sidebar-new-form"
          onSubmit={(e) => {
            e.preventDefault();
            commitCreate();
          }}
        >
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitCreate}
            placeholder="Nome progetto…"
          />
        </form>
      ) : (
        <button className="sidebar-new" onClick={() => setCreating(true)}>
          + Nuovo progetto
        </button>
      )}
    </aside>
  );
}
