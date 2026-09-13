import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { InlineMarkdown } from "./components/InlineMarkdown";
import "./styles/theme.css";
import "./PromptOptimizerApp.css";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const FINAL_MARKER = "PROMPT FINALE:";

function extractFinalPrompt(text: string): string | null {
  const idx = text.indexOf(FINAL_MARKER);
  if (idx === -1) return null;
  return text.slice(idx + FINAL_MARKER.length).trim();
}

export function PromptOptimizerApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    listen<{ event: any }>("optimizer-event", (e) => {
      const event = e.payload.event;
      if (event?.type !== "assistant") return;
      const parentId = event.parent_tool_use_id ?? null;
      if (parentId) return; // ignore any nested tool activity, this window is chat-only

      const blocks: any[] = event.message?.content ?? [];
      for (const block of blocks) {
        if (block.type === "text" && block.text?.trim()) {
          const text = block.text.trim();
          setMessages((prev) => [...prev, { id: `a-${Date.now()}-${prev.length}`, role: "assistant", text }]);
          const final = extractFinalPrompt(text);
          if (final) setFinalPrompt(final);
        }
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages.length]);

  async function send() {
    const text = input.trim();
    if (!text || running) return;
    setInput("");
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text }]);
    setRunning(true);
    try {
      const sessionId = await invoke<string>("send_optimizer_prompt", {
        prompt: text,
        resumeSessionId: sessionIdRef.current,
      });
      if (sessionId) sessionIdRef.current = sessionId;
    } catch (err) {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "assistant", text: `Errore: ${String(err)}` }]);
    } finally {
      setRunning(false);
    }
  }

  async function copyFinal() {
    if (!finalPrompt) return;
    try {
      await navigator.clipboard.writeText(finalPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — user can still select and copy manually */
    }
  }

  return (
    <div className="optimizer-app">
      <header className="optimizer-header">
        <span className="optimizer-title">Ottimizzatore prompt per ruflo</span>
        <span className="optimizer-subtitle">
          Trasforma un'idea informale in un prompt orientato all'obiettivo — la composizione dello swarm resta sempre decisione
          autonoma di ruflo.
        </span>
      </header>

      <div className="optimizer-body" ref={bodyRef}>
        {messages.length === 0 && (
          <p className="optimizer-empty">Descrivi cosa vuoi ottenere, in modo informale. Farò le domande che servono e ti darò un prompt pronto.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="optimizer-message" data-role={m.role}>
            <span className="optimizer-author">{m.role === "user" ? "Tu" : "Ottimizzatore"}</span>
            <p className="optimizer-text">
              <InlineMarkdown text={m.text} />
            </p>
          </div>
        ))}
        {running && (
          <div className="optimizer-message" data-role="assistant">
            <span className="optimizer-author">Ottimizzatore</span>
            <p className="optimizer-thinking">
              <span />
              <span />
              <span />
            </p>
          </div>
        )}
      </div>

      {finalPrompt && (
        <div className="optimizer-final">
          <div className="optimizer-final-header">
            <span>Prompt finale pronto</span>
            <button onClick={() => void copyFinal()}>{copied ? "Copiato ✓" : "Copia"}</button>
          </div>
          <pre className="optimizer-final-text">{finalPrompt}</pre>
        </div>
      )}

      <form
        className="optimizer-input-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          className="optimizer-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={running ? "Sto elaborando…" : "Descrivi cosa vuoi costruire…"}
          disabled={running}
          autoFocus
        />
        <button type="submit" className="optimizer-send" disabled={running || !input.trim()}>
          ↵
        </button>
      </form>
    </div>
  );
}
