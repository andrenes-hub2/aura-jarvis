export type AgentStatus = "idle" | "active" | "warning" | "error";

export type AgentRole =
  | "coordinator"
  | "coder"
  | "reviewer"
  | "tester"
  | "architect"
  | "security"
  | "researcher";

export interface SubAgent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  task: string;
  load: number; // 0-1, drives the node's activity ring
}

export interface Project {
  id: string;
  name: string;
  path: string;
  agents: SubAgent[];
}

export interface LogEntry {
  id: string;
  time: string;
  agent: string;
  message: string;
  level: "info" | "warning" | "error";
}
