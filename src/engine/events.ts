import type { AgentRole, ChatMessage, LogEntry, SubAgent } from "../types";

let logCounter = 0;
export function nextLogId() {
  logCounter += 1;
  return `log-${Date.now()}-${logCounter}`;
}

let messageCounter = 0;
export function nextMessageId() {
  messageCounter += 1;
  return `msg-${Date.now()}-${messageCounter}`;
}

// logs/messages are already capped by AppState's HISTORY_LIMIT on
// persistence; `agents` never was, and now that ruflo runs for every
// prompt (not just opt-in ones) a long session spawns one every request —
// unbounded growth in memory otherwise. Idle/error/done agents get dropped
// first so a node that's actually still working never disappears.
const AGENT_HISTORY_LIMIT = 200;

function pruneAgents(agents: SubAgent[]): SubAgent[] {
  if (agents.length <= AGENT_HISTORY_LIMIT) return agents;
  const active = agents.filter((a) => a.status === "active");
  const inactive = agents.filter((a) => a.status !== "active");
  const keepInactive = inactive.slice(-Math.max(0, AGENT_HISTORY_LIMIT - active.length));
  const keepIds = new Set([...active, ...keepInactive].map((a) => a.id));
  return agents.filter((a) => keepIds.has(a.id));
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

/** MCP tool names arrive as `mcp__<server>__<tool>` (e.g. `mcp__ruflo__agent_spawn`). */
function bareToolName(name: string): string {
  const parts = name.split("__");
  return parts[parts.length - 1] ?? name;
}

/** ruflo returns `{"agentId": "agent-..."}` as text inside the tool_result content. */
function extractAgentId(block: any): string | undefined {
  const content = block?.content;
  let text: string | undefined;
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) text = content.find((c: any) => c?.type === "text")?.text;
  if (!text) return undefined;

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.agentId === "string") return parsed.agentId;
  } catch {
    /* not JSON, fall through to a loose scan */
  }
  return text.match(/"agentId"\s*:\s*"([^"]+)"/)?.[1];
}

type PendingToolUse = { kind: "spawn" } | { kind: "execute"; agentId: string };

export interface EngineState {
  agents: SubAgent[];
  logs: LogEntry[];
  messages: ChatMessage[];
  sessionId?: string;
  /**
   * ruflo assigns a real agentId only once `agent_spawn`'s result comes
   * back — different from the tool_use id we used as a temporary node key
   * to show it immediately — and `agent_execute` calls reference that
   * real id as an *argument*, while its own result only carries its own
   * tool_use id. This tracks in-flight calls so both cases resolve back
   * to the right node when their result arrives as a separate event.
   */
  pendingToolUse: Record<string, PendingToolUse>;
}

export function createEngineState(): EngineState {
  return { agents: [], logs: [], messages: [], pendingToolUse: {} };
}

/** Reduces one Claude Code stream-json event into the next engine state for a project. */
export function applyAgentEvent(state: EngineState, event: any): EngineState {
  const agents = [...state.agents];
  const logs = [...state.logs];
  const messages = [...state.messages];
  const pendingToolUse = { ...state.pendingToolUse };
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
            logs.push(makeLog("Aura", truncate(block.text, 160)));
            messages.push({ id: nextMessageId(), role: "assistant", text: block.text.trim(), time: nowTime() });
          }
        }

        if (block.type === "tool_use") {
          const bare = bareToolName(block.name ?? "");

          if (block.name === "Task") {
            // Claude Code's own native sub-agent mechanism.
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
              makeLog("Aura", `Avvia sub-agente: ${subagentType ?? block.id.slice(0, 8)} — ${truncate(description, 100)}`),
            );
          } else if (bare === "agent_spawn") {
            // ruflo registers a tracked agent. Its real agentId is only known
            // once the result comes back, so key it by this tool_use's own
            // id for now — the tool_result handler below re-keys it.
            const agentType: string | undefined = block.input?.agentType;
            const task: string = block.input?.task ?? "Registrato nello swarm ruflo";
            pendingToolUse[block.id] = { kind: "spawn" };
            upsertAgent(
              block.id,
              { task: truncate(task) },
              {
                name: agentType ? agentType.replace(/[-_]/g, " ") : block.id.slice(0, 10),
                role: guessRole(agentType),
                status: "idle",
                task: truncate(task),
                load: 0.15,
              },
            );
            logs.push(makeLog("Aura", `ruflo: registra agente ${agentType ?? block.id}`));
          } else if (bare === "agent_execute") {
            // ruflo runs a tracked agent for real, via a direct Anthropic API call.
            const agentId: string | undefined = block.input?.agentId;
            const prompt: string = block.input?.prompt ?? "Esecuzione task";
            if (agentId) {
              pendingToolUse[block.id] = { kind: "execute", agentId };
              upsertAgent(
                agentId,
                { status: "active", task: truncate(prompt), load: 0.75 },
                {
                  name: agentId.replace(/[-_]/g, " ").slice(0, 20),
                  role: guessRole(agentId),
                  status: "active",
                  task: truncate(prompt),
                  load: 0.75,
                },
              );
              const label = agents.find((a) => a.id === agentId)?.name ?? agentId;
              logs.push(makeLog(label, `Esecuzione: ${truncate(prompt, 120)}`));
            }
          } else if (bare === "agent_terminate") {
            const agentId: string | undefined = block.input?.agentId;
            if (agentId) {
              upsertAgent(
                agentId,
                { status: "idle", task: "Terminato", load: 0 },
                { name: agentId.slice(0, 10), role: "coder", status: "idle", task: "Terminato", load: 0 },
              );
            }
          } else {
            const label = parentId ? agents.find((a) => a.id === parentId)?.name ?? "sub-agente" : "Aura";
            logs.push(makeLog(label, `Tool: ${bare}`));
          }
        }
      }
      break;
    }

    case "user": {
      const blocks: any[] = event.message?.content ?? [];
      for (const block of blocks) {
        if (block.type === "tool_result" && block.tool_use_id) {
          const pending = pendingToolUse[block.tool_use_id];
          delete pendingToolUse[block.tool_use_id];

          if (pending?.kind === "spawn") {
            // Fold the placeholder node into the real ruflo agentId, if we
            // got one, so the next agent_execute call (which references
            // that real id) updates this same node instead of creating a
            // visually duplicate one.
            const realId = extractAgentId(block);
            const idx = agents.findIndex((a) => a.id === block.tool_use_id);
            if (idx !== -1 && realId && realId !== block.tool_use_id) {
              agents[idx] = { ...agents[idx], id: realId };
            }
            continue;
          }

          const targetId = pending?.kind === "execute" ? pending.agentId : block.tool_use_id;
          const idx = agents.findIndex((a) => a.id === targetId);
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

  return { agents: pruneAgents(agents), logs, messages, sessionId, pendingToolUse };
}
