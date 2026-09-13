import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { Project } from "../types";
import { applyAgentEvent, nextLogId, nextMessageId, type EngineState } from "../engine/events";

const STORAGE_KEY = "aura.projects.v1";
const HISTORY_LIMIT = 300;

function loadPersisted(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Project[];
    return parsed.map((p) => ({ ...p, agents: [], logs: p.logs ?? [], messages: p.messages ?? [], running: false }));
  } catch {
    return [];
  }
}

function persist(projects: Project[]) {
  const slim = projects.map(({ id, name, path, fullAuto, sessionId, logs, messages }) => ({
    id,
    name,
    path,
    fullAuto,
    sessionId,
    logs: logs.slice(-HISTORY_LIMIT),
    messages: messages.slice(-HISTORY_LIMIT),
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
  toggleFullAuto: (projectId: string) => void;
  sendPrompt: (text: string, attachmentPaths?: string[]) => Promise<void>;
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

  // Stream real Claude Code events for every project, not just the active
  // one — a project left running in the background while the user switches
  // tabs keeps emitting on its own `agent-event:<id>` channel, and Tauri's
  // emit doesn't queue events for a channel with no listener, so a
  // subscription scoped to only `activeProjectId` silently dropped every
  // event a background project produced while it wasn't in focus.
  const projectIdsKey = projects.map((p) => p.id).join(",");
  useEffect(() => {
    const ids = projectIdsKey ? projectIdsKey.split(",") : [];
    const subs = ids.map((id) => {
      const channel = `agent-event:${id}`;
      const state = { cancelled: false, unlisten: undefined as (() => void) | undefined };

      listen<{ event: unknown }>(channel, (e) => {
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== id) return p;
            const result = applyAgentEvent(
              {
                agents: p.agents,
                logs: p.logs,
                messages: p.messages,
                sessionId: p.sessionId,
                pendingToolUse: (p.pendingToolUse as EngineState["pendingToolUse"]) ?? {},
              },
              e.payload.event,
            );
            return {
              ...p,
              agents: result.agents,
              logs: result.logs,
              messages: result.messages,
              sessionId: result.sessionId ?? p.sessionId,
              pendingToolUse: result.pendingToolUse,
            };
          }),
        );
      }).then((fn) => {
        // React (StrictMode, in dev) can mount -> cleanup -> mount again before
        // this promise settles; the first cleanup runs while `unlisten` is
        // still undefined and can't call it, so without this check that first
        // subscription leaks and every event gets applied twice.
        if (state.cancelled) fn();
        else state.unlisten = fn;
      });

      return state;
    });

    return () => {
      for (const state of subs) {
        state.cancelled = true;
        state.unlisten?.();
      }
    };
  }, [projectIdsKey]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  // Mirror the visible state to the Rust side so the remote-view page (if
  // started) always shows the same thing this window does, without Rust
  // ever having to re-derive agent/chat state itself.
  useEffect(() => {
    const snapshot = activeProject
      ? {
          name: activeProject.name,
          running: Boolean(activeProject.running),
          agents: activeProject.agents,
          messages: activeProject.messages.slice(-30),
        }
      : null;
    invoke("push_remote_snapshot", { snapshot: JSON.stringify(snapshot) }).catch(() => {});
  }, [activeProject]);

  async function createProject() {
    const selected = await open({ directory: true, multiple: false, title: "Scegli la cartella del progetto" });
    if (!selected || Array.isArray(selected)) return;

    const name = selected.split(/[\\/]/).filter(Boolean).pop() ?? selected;
    const id = `proj-${Date.now()}`;
    const next: Project = { id, name, path: selected, agents: [], logs: [], messages: [] };
    setProjects((prev) => [...prev, next]);
    setActiveProjectId(id);
  }

  function toggleFullAuto(projectId: string) {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, fullAuto: !p.fullAuto } : p)));
  }

  async function sendPrompt(text: string, attachmentPaths: string[] = []) {
    const project = projects.find((p) => p.id === activeProjectIdRef.current);
    if (!project || project.running || !text.trim()) return;

    const now = new Date().toLocaleTimeString("it-IT", { hour12: false });
    setProjects((prev) =>
      prev.map((p) =>
        p.id === project.id
          ? {
              ...p,
              running: true,
              logs: [...p.logs, { id: nextLogId(), time: now, agent: "Tu", message: text, level: "info" }],
              messages: [...p.messages, { id: nextMessageId(), role: "user", text, time: now }],
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
        fullAuto: Boolean(project.fullAuto),
        attachmentPaths,
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
                    id: nextLogId(),
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
    toggleFullAuto,
    sendPrompt,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
