import { useState, type FormEvent } from "react";
import "./CommandBar.css";

export function CommandBar() {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    // TODO: inoltrare il comando al core Claude Code / ruflo quando collegato al motore reale.
    setValue("");
  }

  return (
    <form className="command-bar" onSubmit={handleSubmit}>
      <span className="command-bar-prompt">AURA</span>
      <input
        className="command-bar-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Descrivi l'obiettivo: analizza, implementa, rivedi, indaga…"
      />
      <button className="command-bar-send" type="submit" aria-label="Invia">
        ↵
      </button>
    </form>
  );
}
