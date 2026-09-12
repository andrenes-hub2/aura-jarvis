import { useEffect, useRef } from "react";
import { useAppState } from "../state/AppState";
import "./Transcript.css";

export function Transcript() {
  const { activeProject } = useAppState();
  const bodyRef = useRef<HTMLDivElement>(null);
  const messages = activeProject?.messages ?? [];

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages.length]);

  if (messages.length === 0) return null;

  return (
    <div className="transcript">
      <div className="transcript-body" ref={bodyRef}>
        {messages.map((m) => (
          <div key={m.id} className="transcript-message" data-role={m.role}>
            <span className="transcript-author">{m.role === "user" ? "Tu" : "Claude"}</span>
            <p className="transcript-text">{m.text}</p>
          </div>
        ))}
        {activeProject?.running && (
          <div className="transcript-message" data-role="assistant" data-pending="true">
            <span className="transcript-author">Claude</span>
            <p className="transcript-text transcript-thinking">
              <span />
              <span />
              <span />
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
