import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { Project } from "../types";
import { applyAgentEvent } from "../engine/events";

const STORAGE_KEY = "aura.projects.v1";

function loadPersisted(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Project[];
    return parsed.map((p) => ({ ...p, agents: [], logs: [], messages: [], running: false }));
  } catch {
    return [];
  }
}

function persist(projects: Project[]) {
  const slim = projects.map(({ id, name, path, useRuflo, sessionId }) => ({
    id,
    name,
    path,
    useRuflo,
    sessionId,
  }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

interface AppStateShape {
  projects: Project[];
  activeProjectId: string | null;
  activeProject: Project | null;
  engineStatus: "checking" | "connected" | "unavailable";
  selectProject: (id: string) => void;
  createProject: () => Promise<void>;
  toggleRuflo: (projectId: string) => void;
  sendPrompt: (text: string) => Promise<void>;
}

const AppStateContext = createContext<AppStateShape | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(() => loadPersisted());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => loadPersisted()[0]?.id ?? null);
  const [engineStatus, setEngineStatus] = useState<AppStateShape["engineStatus"]>("checking");
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  useEffect(() => {
    persist(projects);
  }, [projects]);

  useEffect(() => {
    invoke<string>("check_engine")
      .then(() => setEngineStatus("connected"))
      .catch(() => setEngineStatus("unavailable"));
  }, []);

  // Stream real Claude Code events for whichever project is currently active.
  useEffect(() => {
    if (!activeProjectId) return;
    const channel = `agent-event:${activeProjectId}`;
    let unlisten: (() => void) | undefined;

    listen<{ event: unknown }>(channel, (e) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProjectId) return p;
          const result = applyAgentEvent(
            { agents: p.agents, logs: p.logs, messages: p.messages, sessionId: p.sessionId },
            e.payload.event,
          );
          return {
            ...p,
            agents: result.agents,
            logs: result.logs,
            messages: result.messages,
            sessionId: result.sessionId ?? p.sessionId,
          };
        }),
      );
    }).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, [activeProjectId]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  async function createProject() {
    const selected = await open({ directory: true, multiple: false, title: "Scegli la cartella del progetto" });
    if (!selected || Array.isArray(selected)) return;

    const name = selected.split(/[\\/]/).filter(Boolean).pop() ?? selected;
    const id = `proj-${Date.now()}`;
    const next: Project = { id, name, path: selected, agents: [], logs: [], messages: [], useRuflo: false };
    setProjects((prev) => [...prev, next]);
    setActiveProjectId(id);
  }

  function toggleRuflo(projectId: string) {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, useRuflo: !p.useRuflo } : p)));
  }

  async function sendPrompt(text: string) {
    const project = projects.find((p) => p.id === activeProjectIdRef.current);
    if (!project || project.running || !text.trim()) return;

    const now = new Date().toLocaleTimeString("it-IT", { hour12: false });
    setProjects((prev) =>
      prev.map((p) =>
        p.id === project.id
          ? {
              ...p,
              running: true,
              logs: [...p.logs, { id: `local-${Date.now()}`, time: now, agent: "Tu", message: text, level: "info" }],
              messages: [...p.messages, { id: `local-${Date.now()}`, role: "user", text, time: now }],
            }
          : p,
      ),
    );

    try {
      const sessionId = await invoke<string>("send_prompt", {
        projectId: project.id,
        projectPath: project.path,
        prompt: text,
        resumeSessionId: project.sessionId,
        useRuflo: Boolean(project.useRuflo),
      });
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, running: false, sessionId: sessionId || p.sessionId } : p)),
      );
    } catch (err) {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === project.id
            ? {
                ...p,
                running: false,
                logs: [
                  ...p.logs,
                  {
                    id: `err-${Date.now()}`,
                    time: new Date().toLocaleTimeString("it-IT", { hour12: false }),
                    agent: "sistema",
                    message: String(err),
                    level: "error",
                  },
                ],
              }
            : p,
        ),
      );
    }
  }

  const value: AppStateShape = {
    projects,
    activeProjectId,
    activeProject,
    engineStatus,
    selectProject: setActiveProjectId,
    createProject,
    toggleRuflo,
    sendPrompt,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
