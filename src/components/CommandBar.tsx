import { useState, type FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppState } from "../state/AppState";
import "./CommandBar.css";

const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "haiku", label: "Haiku 4.5 — veloce" },
  { value: "sonnet", label: "Sonnet 5 — bilanciato" },
  { value: "opus", label: "Opus 5 — massima capacità" },
];

export function CommandBar() {
  const { activeProject, setCoreModel, sendPrompt } = useAppState();
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);

  const disabled = !activeProject || activeProject.running;

  async function handleAttach() {
    if (disabled) return;
    const selected = await open({
      multiple: true,
      title: "Allega immagini, PDF o documenti",
      filters: [
        { name: "Immagini e documenti", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf", "doc", "docx", "txt", "md", "csv"] },
      ],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    setAttachments((prev) => [...prev, ...paths]);
  }

  function removeAttachment(path: string) {
    setAttachments((prev) => prev.filter((p) => p !== path));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabled || (!value.trim() && attachments.length === 0)) return;
    const attachmentLines = attachments.map((p) => `File allegato: ${p}`).join("\n");
    const text = attachmentLines ? `${attachmentLines}\n\n${value}` : value;
    setValue("");
    setAttachments([]);
    void sendPrompt(text, attachments);
  }

  return (
    <form className="command-bar-wrap" onSubmit={handleSubmit}>
      {attachments.length > 0 && (
        <div className="command-bar-attachments">
          {attachments.map((p) => (
            <span className="command-bar-chip" key={p} title={p}>
              {p.split(/[\\/]/).pop()}
              <button type="button" className="command-bar-chip-remove" onClick={() => removeAttachment(p)} aria-label="Rimuovi allegato">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="command-bar">
        <span className="command-bar-prompt">AURA</span>
        <button
          type="button"
          className="command-bar-attach"
          onClick={handleAttach}
          disabled={disabled}
          title="Allega immagini, PDF o documenti — Claude potra' leggerli"
          aria-label="Allega file"
        >
          📎
        </button>
        <input
          className="command-bar-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            activeProject
              ? activeProject.running
                ? "Claude sta lavorando…"
                : "Descrivi l'obiettivo: analizza, implementa, rivedi, indaga…"
              : "Crea prima un progetto (scegli una cartella reale)"
          }
          disabled={disabled}
        />
        <button className="command-bar-send" type="submit" aria-label="Invia" disabled={disabled}>
          ↵
        </button>
      </div>

      <div className="command-bar-modelrow">
        <span className="command-bar-model-label">Cervello</span>
        <select
          className="command-bar-model-select"
          value={activeProject?.coreModel ?? "sonnet"}
          onChange={(e) => activeProject && setCoreModel(activeProject.id, e.target.value)}
          disabled={!activeProject}
          title="Modello Claude usato come orchestratore per questo progetto"
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}
