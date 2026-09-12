import type { AgentRole, ChatMessage, LogEntry, SubAgent } from "../types";

let logCounter = 0;
function nextLogId() {
  logCounter += 1;
  return `log-${Date.now()}-${logCounter}`;
}

let messageCounter = 0;
function nextMessageId() {
  messageCounter += 1;
  return `msg-${Date.now()}-${messageCounter}`;
}

function nowTime() {
  return new Date().toLocaleTimeString("it-IT", { hour12: false });
}

function makeLog(agent: string, message: string, level: LogEntry["level"] = "info"): LogEntry {
  return { id: nextLogId(), time: nowTime(), agent, message, level };
}

function guessRole(subagentType: string | undefined): AgentRole {
  const t = (subagentType ?? "").toLowerCase();
  if (t.includes("test")) return "tester";
  if (t.includes("review")) return "reviewer";
  if (t.includes("secur")) return "security";
  if (t.includes("plan") || t.includes("architect")) return "architect";
  if (t.includes("explore") || t.includes("research") || t.includes("guide")) return "researcher";
  if (t.includes("queen") || t.includes("coordinat") || t.includes("swarm")) return "coordinator";
  return "coder";
}

function truncate(text: string, max = 90) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export interface EngineState {
  agents: SubAgent[];
  logs: LogEntry[];
  messages: ChatMessage[];
  sessionId?: string;
}

/** Reduces one Claude Code stream-json event into the next engine state for a project. */
export function applyAgentEvent(state: EngineState, event: any): EngineState {
  const agents = [...state.agents];
  const logs = [...state.logs];
  const messages = [...state.messages];
  let sessionId = state.sessionId;

  if (typeof event.session_id === "string") {
    sessionId = event.session_id;
  }

  function upsertAgent(id: string, patch: Partial<SubAgent>, fallback: Omit<SubAgent, "id">) {
    const idx = agents.findIndex((a) => a.id === id);
    if (idx === -1) agents.push({ id, ...fallback, ...patch });
    else agents[idx] = { ...agents[idx], ...patch };
  }

  switch (event.type) {
    case "system": {
      if (event.subtype === "init") {
        logs.push(makeLog("sistema", `Sessione avviata (${String(event.session_id ?? "").slice(0, 8)})`));
      }
      break;
    }

    case "assistant": {
      const parentId: string | null = event.parent_tool_use_id ?? null;
      const blocks: any[] = event.message?.content ?? [];

      for (const block of blocks) {
        if (block.type === "text" && block.text?.trim()) {
          if (parentId) {
            upsertAgent(
              parentId,
              { task: truncate(block.text), status: "active" },
              { name: parentId.slice(0, 8), role: "coder", status: "active", task: truncate(block.text), load: 0.5 },
            );
            const agent = agents.find((a) => a.id === parentId);
            logs.push(makeLog(agent?.name ?? "sub-agente", truncate(block.text, 160)));
          } else {
            logs.push(makeLog("Claude", truncate(block.text, 160)));
            messages.push({ id: nextMessageId(), role: "assistant", text: block.text.trim(), time: nowTime() });
          }
        }

        if (block.type === "tool_use") {
          if (block.name === "Task") {
            const subagentType: string | undefined = block.input?.subagent_type;
            const description: string = block.input?.description ?? block.input?.prompt ?? "Nuovo task";
            upsertAgent(
              block.id,
              { status: "active", task: truncate(description), load: 0.6 },
              {
                name: subagentType ? subagentType.replace(/[-_]/g, " ") : `agente-${block.id.slice(0, 6)}`,
                role: guessRole(subagentType),
                status: "active",
                task: truncate(description),
                load: 0.6,
              },
            );
            logs.push(
              makeLog("Claude", `Avvia sub-agente: ${subagentType ?? block.id.slice(0, 8)} — ${truncate(description, 100)}`),
            );
          } else {
            const label = parentId ? agents.find((a) => a.id === parentId)?.name ?? "sub-agente" : "Claude";
            logs.push(makeLog(label, `Tool: ${block.name}`));
          }
        }
      }
      break;
    }

    case "user": {
      const blocks: any[] = event.message?.content ?? [];
      for (const block of blocks) {
        if (block.type === "tool_result" && block.tool_use_id) {
          const idx = agents.findIndex((a) => a.id === block.tool_use_id);
          if (idx !== -1) {
            const isError = Boolean(block.is_error);
            agents[idx] = {
              ...agents[idx],
              status: isError ? "error" : "idle",
              load: 0,
              task: isError ? "Errore nel task" : "Completato",
            };
            logs.push(
              makeLog(agents[idx].name, isError ? "Task terminato con errore" : "Task completato", isError ? "error" : "info"),
            );
          }
        }
      }
      break;
    }

    case "stderr": {
      logs.push(makeLog("stderr", event.text, "warning"));
      break;
    }

    case "result": {
      const cost = typeof event.total_cost_usd === "number" ? `$${event.total_cost_usd.toFixed(3)}` : "n/d";
      const spawned = event.subagent_stats?.spawned ?? 0;
      logs.push(makeLog("sistema", `Turno completato — costo ${cost}, sub-agenti generati: ${spawned}`));
      break;
    }

    default:
      break;
  }

  return { agents, logs, messages, sessionId };
}
