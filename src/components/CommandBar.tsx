import { useState, type FormEvent } from "react";
import { useAppState } from "../state/AppState";
import "./CommandBar.css";

export function CommandBar() {
  const { activeProject, sendPrompt } = useAppState();
  const [value, setValue] = useState("");

  const disabled = !activeProject || activeProject.running;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabled || !value.trim()) return;
    const text = value;
    setValue("");
    void sendPrompt(text);
  }

  return (
    <form className="command-bar" onSubmit={handleSubmit}>
      <span className="command-bar-prompt">AURA</span>
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
    </form>
  );
}
