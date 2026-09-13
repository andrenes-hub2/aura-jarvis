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
  logs: LogEntry[];
  messages: ChatMessage[];
  sessionId?: string;
  running?: boolean;
  fullAuto?: boolean;
  /** Opaque bookkeeping for in-flight ruflo tool calls; only read/written by engine/events.ts. */
  pendingToolUse?: Record<string, unknown>;
}

export interface LogEntry {
  id: string;
  time: string;
  agent: string;
  message: string;
  level: "info" | "warning" | "error";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: string;
}
