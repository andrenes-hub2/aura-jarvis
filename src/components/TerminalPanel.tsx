import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "./TerminalPanel.css";

export function TerminalPanel({ projectId, cwd }: { projectId: string; cwd: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      convertEol: true,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 13,
      theme: {
        background: "#05070c",
        foreground: "#e8ecf5",
        cursor: "#55e6c1",
        selectionBackground: "rgba(85, 230, 193, 0.3)",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    void invoke("open_terminal", { projectId, cwd });

    const dataSub = term.onData((data) => {
      void invoke("write_terminal", { projectId, data });
    });

    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<string>(`terminal-output:${projectId}`, (e) => term.write(e.payload)).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      void invoke("resize_terminal", { projectId, cols: term.cols, rows: term.rows });
    });
    resizeObserver.observe(container);

    return () => {
      cancelled = true;
      unlisten?.();
      dataSub.dispose();
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [projectId, cwd]);

  return <div className="terminal-panel" ref={containerRef} />;
}
