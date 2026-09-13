import { useEffect, useRef, useState } from "react";
import { useAppState } from "../state/AppState";
import { ROLE_LABEL } from "../data/mockData";
import type { AgentRole, AgentStatus, SubAgent } from "../types";
import "./JarvisCore.css";

const ROLE_COLOR: Record<AgentRole, string> = {
  coordinator: "#8d7bf5",
  coder: "#55e6c1",
  reviewer: "#5eb8ef",
  tester: "#7fd858",
  architect: "#c98ff2",
  security: "#ef5169",
  researcher: "#e3a53d",
};

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: "#47536e",
  active: "#4dd8b0",
  warning: "#e3a53d",
  error: "#ef5169",
};

interface NodePos {
  agent: SubAgent;
  x: number;
  y: number;
  labelSide: "top" | "bottom";
}

function hexToRgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function JarvisCore({ onSelectAgent }: { onSelectAgent: (agent: SubAgent) => void }) {
  const { activeProject } = useAppState();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const agents = activeProject?.agents ?? [];
  const cx = size.w / 2;
  const cy = size.h / 2;
  const radius = Math.min(size.w, size.h) * 0.34;

  const positions: NodePos[] = agents.map((agent, i) => {
    const angle = -Math.PI / 2 + (i / Math.max(agents.length, 1)) * Math.PI * 2;
    return {
      agent,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      labelSide: Math.sin(angle) < 0 ? "top" : "bottom",
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.scale(dpr, dpr);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();

    function frame(now: number) {
      const t = reduceMotion ? 0 : (now - start) / 1000;
      ctx!.clearRect(0, 0, size.w, size.h);

      // ambient sonar rings from the core
      for (let ring = 0; ring < 3; ring++) {
        const phase = (t * 0.25 + ring / 3) % 1;
        const r = 40 + phase * radius * 1.1;
        ctx!.beginPath();
        ctx!.arc(cx, cy, r, 0, Math.PI * 2);
        ctx!.strokeStyle = hexToRgba("#55e6c1", 0.14 * (1 - phase));
        ctx!.lineWidth = 1.5;
        ctx!.stroke();
      }

      // beams core -> agent
      for (const pos of positions) {
        const color = STATUS_COLOR[pos.agent.status];
        const midX = (cx + pos.x) / 2 + (pos.y - cy) * 0.08;
        const midY = (cy + pos.y) / 2 - (pos.x - cx) * 0.08;

        ctx!.beginPath();
        ctx!.moveTo(cx, cy);
        ctx!.quadraticCurveTo(midX, midY, pos.x, pos.y);
        ctx!.strokeStyle = hexToRgba(color, pos.agent.status === "idle" ? 0.12 : 0.34);
        ctx!.lineWidth = 1.2;
        ctx!.stroke();

        if (pos.agent.status !== "idle" && !reduceMotion) {
          const speed = 0.3 + pos.agent.load * 0.7;
          const p = (t * speed + pos.x * 0.001) % 1;
          const px = (1 - p) * (1 - p) * cx + 2 * (1 - p) * p * midX + p * p * pos.x;
          const py = (1 - p) * (1 - p) * cy + 2 * (1 - p) * p * midY + p * p * pos.y;
          ctx!.beginPath();
          ctx!.arc(px, py, 2.4, 0, Math.PI * 2);
          ctx!.fillStyle = hexToRgba(color, 0.9);
          ctx!.fill();
        }
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size, positions, cx, cy, radius]);

  return (
    <div className="jarvis-stage" ref={stageRef}>
      <canvas ref={canvasRef} className="jarvis-canvas" />

      <div className="jarvis-core-node" data-running={Boolean(activeProject?.running)} style={{ left: cx, top: cy }}>
        <div className="jarvis-core-ring" />
        <div className="jarvis-core-glow" />
        <div className="jarvis-core-label">
          <span className="jarvis-core-title">AURA</span>
          <span className="jarvis-core-subtitle">{activeProject?.running ? "al lavoro…" : "core"}</span>
        </div>
      </div>

      {!activeProject && (
        <p className="jarvis-empty-hint">Crea un progetto (cartella reale) per iniziare a lavorare con Claude.</p>
      )}

      {positions.map((pos) => (
        <button
          key={pos.agent.id}
          className="jarvis-agent-node"
          data-label-side={pos.labelSide}
          style={{
            left: pos.x,
            top: pos.y,
            ["--role-color" as string]: ROLE_COLOR[pos.agent.role],
            ["--status-color" as string]: STATUS_COLOR[pos.agent.status],
          }}
          onClick={() => onSelectAgent(pos.agent)}
        >
          <span className="jarvis-agent-ring" data-status={pos.agent.status} />
          <span className="jarvis-agent-name">{pos.agent.name}</span>
          <span className="jarvis-agent-role">{ROLE_LABEL[pos.agent.role]}</span>
        </button>
      ))}
    </div>
  );
}
