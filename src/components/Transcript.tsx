import { useEffect, useRef, useState } from "react";
import { useAppState } from "../state/AppState";
import { InlineMarkdown } from "./InlineMarkdown";
import "./Transcript.css";

export function Transcript() {
  const { activeProject } = useAppState();
  const [minimized, setMinimized] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const messages = activeProject?.messages ?? [];

  useEffect(() => {
    const el = bodyRef.current;
    if (!minimized && el) el.scrollTo({ top: el.scrollHeight });
  }, [messages.length, minimized]);

  if (messages.length === 0) return null;

  return (
    <div className={`transcript ${minimized ? "is-minimized" : ""}`}>
      <button
        className="transcript-toggle"
        onClick={() => setMinimized((v) => !v)}
        title={minimized ? "Espandi la conversazione" : "Minimizza per goderti la scena"}
      >
        {minimized ? `💬 ${messages.length}` : "conversazione ⌄"}
      </button>

      {!minimized && (
        <div className="transcript-body" ref={bodyRef}>
          {messages.map((m) => (
            <div key={m.id} className="transcript-message" data-role={m.role}>
              <span className="transcript-author">{m.role === "user" ? "Tu" : "Aura"}</span>
              <p className="transcript-text">
                <InlineMarkdown text={m.text} />
              </p>
            </div>
          ))}
          {activeProject?.running && (
            <div className="transcript-message" data-role="assistant" data-pending="true">
              <span className="transcript-author">Aura</span>
              <p className="transcript-text transcript-thinking">
                <span />
                <span />
                <span />
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
