import { useState } from "react";
import { useAppState } from "../state/AppState";
import { FileExplorer } from "./FileExplorer";
import { TerminalPanel } from "./TerminalPanel";
import { WebPreview } from "./WebPreview";
import "./SidePanel.css";

type SideMode = "terminal" | "files" | "web";

export function SidePanel() {
  const { activeProject } = useAppState();
  const [mode, setMode] = useState<SideMode | null>(null);
  const [everOpened, setEverOpened] = useState<Set<SideMode>>(new Set());

  if (!activeProject) return null;

  function toggle(next: SideMode) {
    setMode((current) => (current === next ? null : next));
    setEverOpened((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }

  return (
    <>
      <div className="side-toolbar">
        <button className="side-toolbar-btn" data-active={mode === "terminal"} onClick={() => toggle("terminal")} title="Terminale">
          ⌨
        </button>
        <button className="side-toolbar-btn" data-active={mode === "files"} onClick={() => toggle("files")} title="File del progetto">
          🗂
        </button>
        <button className="side-toolbar-btn" data-active={mode === "web"} onClick={() => toggle("web")} title="Anteprima web">
          🌐
        </button>
      </div>

      <aside className={`side-panel ${mode ? "is-open" : ""}`}>
        {everOpened.has("terminal") && (
          <div className="side-panel-pane" hidden={mode !== "terminal"}>
            <TerminalPanel projectId={activeProject.id} cwd={activeProject.path} />
          </div>
        )}
        {everOpened.has("files") && (
          <div className="side-panel-pane" hidden={mode !== "files"}>
            <FileExplorer projectPath={activeProject.path} />
          </div>
        )}
        {everOpened.has("web") && (
          <div className="side-panel-pane" hidden={mode !== "web"}>
            <WebPreview projectId={activeProject.id} projectPath={activeProject.path} />
          </div>
        )}
      </aside>
    </>
  );
}
