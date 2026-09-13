import { confirm } from "@tauri-apps/plugin-dialog";
import { useAppState } from "../state/AppState";
import { openPromptOptimizer } from "../engine/optimizerWindow";
import { UpdateBadge } from "./UpdateBadge";
import "./TopBar.css";

const ENGINE_LABEL: Record<string, string> = {
  checking: "Claude — verifica…",
  connected: "Claude — connesso",
  unavailable: "Claude — non trovato",
};

export function TopBar({
  onToggleLog,
  logOpen,
  onOpenSetup,
  onOpenRemote,
}: {
  onToggleLog: () => void;
  logOpen: boolean;
  onOpenSetup: () => void;
  onOpenRemote: () => void;
}) {
  const { activeProject, engineStatus, toggleRuflo, toggleFullAuto } = useAppState();
  const activeCount = activeProject?.agents.filter((a) => a.status === "active").length ?? 0;

  async function handleFullAutoClick() {
    if (!activeProject) return;
    if (!activeProject.fullAuto) {
      const confirmed = await confirm(
        "Con Full Auto attivo, Claude (e ruflo) eseguirà comandi shell, modificherà o eliminerà file e installerà pacchetti in questo progetto senza chiedere conferma. Usalo solo su una cartella di cui ti fidi completamente.",
        { title: "Attivare Full Auto?", kind: "warning" },
      );
      if (!confirmed) return;
    }
    toggleFullAuto(activeProject.id);
  }

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-mark" />
        <span className="topbar-word">AURA</span>
      </div>

      {activeProject ? (
        <div className="topbar-project">
          <span className="topbar-project-name">{activeProject.name}</span>
          <span className="topbar-project-sep">·</span>
          <span className="topbar-project-agents">
            {activeProject.running ? "in esecuzione…" : `${activeCount} agenti attivi`}
          </span>
        </div>
      ) : (
        <div className="topbar-project">
          <span className="topbar-project-agents">Nessun progetto selezionato</span>
        </div>
      )}

      <div className="topbar-actions">
        <UpdateBadge />
        {activeProject && (
          <button
            className="topbar-btn"
            data-active={Boolean(activeProject.useRuflo)}
            onClick={() => toggleRuflo(activeProject.id)}
            title="Carica il server MCP di ruflo in questa sessione per lo swarm di sub-agenti"
          >
            Ruflo
          </button>
        )}
        {activeProject && (
          <button
            className="topbar-btn topbar-btn-danger"
            data-active={Boolean(activeProject.fullAuto)}
            onClick={handleFullAutoClick}
            title="Nessuna conferma richiesta: comandi, modifiche a file e installazioni procedono da soli, senza fermarsi per chiedere nulla"
          >
            Full Auto
          </button>
        )}
        <div className="topbar-auth" data-status={engineStatus} title="Autenticazione via Claude Code (OAuth), nessuna API key a consumo">
          <span className="topbar-auth-dot" />
          {ENGINE_LABEL[engineStatus]}
        </div>
        <button className="topbar-btn" data-active={logOpen} onClick={onToggleLog}>
          Log
        </button>
        <button
          className="topbar-btn"
          onClick={() => void openPromptOptimizer()}
          title="Apri una finestra separata per trasformare un'idea informale in un prompt ottimizzato per ruflo"
        >
          ✨ Ottimizza prompt
        </button>
        <button
          className="topbar-btn"
          onClick={onOpenRemote}
          title="Vedi lo stato di questo progetto da un altro dispositivo sulla stessa rete"
        >
          📡 Remoto
        </button>
        <button className="topbar-btn topbar-btn-icon" title="Impostazioni / Setup" aria-label="Impostazioni" onClick={onOpenSetup}>
          ⚙
        </button>
      </div>
    </header>
  );
}
