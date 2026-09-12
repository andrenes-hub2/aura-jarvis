import { ROLE_LABEL } from "../data/mockData";
import type { SubAgent } from "../types";
import "./AgentDetail.css";

const STATUS_LABEL: Record<string, string> = {
  idle: "In attesa",
  active: "Attivo",
  warning: "Attenzione",
  error: "Errore",
};

export function AgentDetail({ agent, onClose }: { agent: SubAgent; onClose: () => void }) {
  return (
    <div className="agent-detail" data-status={agent.status}>
      <button className="agent-detail-close" onClick={onClose} aria-label="Chiudi">
        ✕
      </button>
      <div className="agent-detail-name">{agent.name}</div>
      <div className="agent-detail-role">{ROLE_LABEL[agent.role]}</div>
      <div className="agent-detail-task">{agent.task}</div>
      <div className="agent-detail-row">
        <span className="agent-detail-status">{STATUS_LABEL[agent.status]}</span>
        <div className="agent-detail-load-track">
          <div className="agent-detail-load-fill" style={{ width: `${Math.round(agent.load * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
