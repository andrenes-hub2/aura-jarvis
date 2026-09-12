import type { LogEntry, Project } from "../types";

export const ROLE_LABEL: Record<string, string> = {
  coordinator: "Coordinatore",
  coder: "Coder",
  reviewer: "Reviewer",
  tester: "Tester",
  architect: "Architect",
  security: "Security",
  researcher: "Researcher",
};

export const mockProjects: Project[] = [
  {
    id: "proj-nebula",
    name: "Nebula API",
    path: "C:/dev/nebula-api",
    agents: [
      { id: "a1", name: "Queen-01", role: "coordinator", status: "active", task: "Orchestrazione swarm", load: 0.8 },
      { id: "a2", name: "Coder-04", role: "coder", status: "active", task: "Refactor auth middleware", load: 0.65 },
      { id: "a3", name: "Coder-07", role: "coder", status: "active", task: "Implementa rate limiter", load: 0.9 },
      { id: "a4", name: "Reviewer-02", role: "reviewer", status: "warning", task: "PR #248 in revisione", load: 0.4 },
      { id: "a5", name: "Tester-01", role: "tester", status: "idle", task: "In attesa di build", load: 0.1 },
      { id: "a6", name: "Architect-01", role: "architect", status: "active", task: "Schema DB v3", load: 0.55 },
      { id: "a7", name: "Security-03", role: "security", status: "error", task: "Scan dipendenze fallito", load: 0.3 },
      { id: "a8", name: "Researcher-01", role: "researcher", status: "idle", task: "Analisi librerie caching", load: 0.15 },
    ],
  },
  {
    id: "proj-orion",
    name: "Orion Dashboard",
    path: "C:/dev/orion-dashboard",
    agents: [
      { id: "b1", name: "Queen-02", role: "coordinator", status: "idle", task: "In pausa", load: 0.05 },
      { id: "b2", name: "Coder-01", role: "coder", status: "idle", task: "Nessun task assegnato", load: 0 },
      { id: "b3", name: "Tester-02", role: "tester", status: "idle", task: "Nessun task assegnato", load: 0 },
    ],
  },
];

export const mockLogs: LogEntry[] = [
  { id: "l1", time: "10:42:03", agent: "Queen-01", message: "Swarm inizializzato — topologia gerarchica, 8 agenti", level: "info" },
  { id: "l2", time: "10:42:11", agent: "Coder-04", message: "Aperto src/middleware/auth.ts per refactor", level: "info" },
  { id: "l3", time: "10:43:02", agent: "Security-03", message: "npm audit: 2 vulnerabilità high in dipendenze transitive", level: "error" },
  { id: "l4", time: "10:43:20", agent: "Reviewer-02", message: "Richiesta modifica su PR #248: mancano i test", level: "warning" },
  { id: "l5", time: "10:44:47", agent: "Coder-07", message: "Rate limiter implementato, in attesa di test", level: "info" },
  { id: "l6", time: "10:45:03", agent: "Architect-01", message: "Schema v3 validato contro le migrazioni esistenti", level: "info" },
];
