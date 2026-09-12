import { useAppState } from "../state/AppState";
import "./LogDrawer.css";

export function LogDrawer({ open }: { open: boolean }) {
  const { logs } = useAppState();

  return (
    <aside className={`log-drawer ${open ? "is-open" : ""}`}>
      <div className="log-drawer-header">Log agenti</div>
      <div className="log-drawer-body">
        {logs.map((l) => (
          <div key={l.id} className="log-line" data-level={l.level}>
            <span className="log-time">{l.time}</span>
            <span className="log-agent">{l.agent}</span>
            <span className="log-message">{l.message}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
