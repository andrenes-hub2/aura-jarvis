import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { LogEntry, Project } from "../types";
import { mockLogs, mockProjects } from "../data/mockData";

interface AppStateShape {
  projects: Project[];
  activeProjectId: string;
  activeProject: Project;
  logs: LogEntry[];
  selectProject: (id: string) => void;
  createProject: (name: string) => void;
}

const AppStateContext = createContext<AppStateShape | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(mockProjects);
  const [activeProjectId, setActiveProjectId] = useState(mockProjects[0].id);
  const [logs] = useState<LogEntry[]>(mockLogs);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0],
    [projects, activeProjectId],
  );

  function createProject(name: string) {
    const id = `proj-${Date.now()}`;
    const next: Project = { id, name, path: "", agents: [] };
    setProjects((prev) => [...prev, next]);
    setActiveProjectId(id);
  }

  const value: AppStateShape = {
    projects,
    activeProjectId,
    activeProject,
    logs,
    selectProject: setActiveProjectId,
    createProject,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
