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

// Fixed world size the agent graph is laid out in, independent of the
// viewport — the viewport pans/zooms into it instead of the layout
// resizing to fit whatever's visible. Keeps the core's world position
// constant as agents come and go, so panning/zoom never jumps around.
const WORLD = 3000;
const WORLD_CENTER = WORLD / 2;
const BASE_RADIUS = 170;
const MIN_ARC_SPACING = 100;
const MAX_RADIUS = 1300;
const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;

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
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const hasCenteredRef = useRef(false);
  const dragRef = useRef<{ startX: number; startY: number; startViewX: number; startViewY: number } | null>(null);
  const dragMovedRef = useRef(false);

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

  // Center the view on the core exactly once, as soon as the viewport has
  // a real size — afterwards the user's own pan/zoom takes over and we
  // never fight it, even as more agents are added and the layout grows.
  useEffect(() => {
    if (hasCenteredRef.current || size.w === 0 || size.h === 0) return;
    hasCenteredRef.current = true;
    setView({ x: size.w / 2 - WORLD_CENTER, y: size.h / 2 - WORLD_CENTER, scale: 1 });
  }, [size]);

  const agents = activeProject?.agents ?? [];
  const activeCount = agents.filter((a) => a.status === "active").length;
  const cx = WORLD_CENTER;
  const cy = WORLD_CENTER;
  // The ring grows with the agent count (enough arc-length per node to
  // stay clickable) instead of staying a fixed size that agents pile up
  // and overlap on — that's what made a busy project's agents impossible
  // to make out individually. Pan/zoom is how you go see them all now.
  const radius = Math.min(MAX_RADIUS, Math.max(BASE_RADIUS, (agents.length * MIN_ARC_SPACING) / (2 * Math.PI)));

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

    // Cap the backing-store DPR for this canvas specifically: it's sized
    // to the whole fixed WORLD, not the viewport, so a naive full-devicePixelRatio
    // backing store here would be several times larger than any real
    // screen — this keeps per-frame clear/redraw cost bounded.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = WORLD * dpr;
    canvas.height = WORLD * dpr;
    canvas.style.width = `${WORLD}px`;
    canvas.style.height = `${WORLD}px`;
    ctx.scale(dpr, dpr);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const startRef = { t: performance.now() };

    function frame(now: number) {
      const t = reduceMotion ? 0 : (now - startRef.t) / 1000;

      // Only clear/redraw the slice of the world actually visible through
      // the current pan/zoom — the canvas itself covers the whole WORLD,
      // but repainting all of it every frame regardless of zoom would be
      // wasted fill-rate once agents spread the world out.
      const v = viewRef.current;
      const pad = 8;
      const viewLeft = -v.x / v.scale - pad;
      const viewTop = -v.y / v.scale - pad;
      const viewW = size.w / v.scale + pad * 2;
      const viewH = size.h / v.scale + pad * 2;
      ctx!.clearRect(viewLeft, viewTop, viewW, viewH);

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

  // Wheel-zoom is wired as a native, non-passive listener: React attaches
  // its own onWheel as passive, which silently ignores preventDefault and
  // lets the page/host scroll instead of just zooming the graph.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        const worldX = (px - v.x) / v.scale;
        const worldY = (py - v.y) / v.scale;
        return { x: px - worldX * newScale, y: py - worldY * newScale, scale: newScale };
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragMovedRef.current = false;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startViewX: view.x, startViewY: view.y };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMovedRef.current = true;
    setView((v) => ({ ...v, x: d.startViewX + dx, y: d.startViewY + dy }));
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function zoomBy(factor: number) {
    setView((v) => {
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const px = size.w / 2;
      const py = size.h / 2;
      const worldX = (px - v.x) / v.scale;
      const worldY = (py - v.y) / v.scale;
      return { x: px - worldX * newScale, y: py - worldY * newScale, scale: newScale };
    });
  }

  function recenter() {
    setView({ x: size.w / 2 - WORLD_CENTER, y: size.h / 2 - WORLD_CENTER, scale: 1 });
  }

  return (
    <div
      className="jarvis-stage"
      ref={stageRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      data-dragging={Boolean(dragRef.current)}
    >
      <div
        className="jarvis-world"
        style={{ width: WORLD, height: WORLD, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        <canvas ref={canvasRef} className="jarvis-canvas" />

        <div className="jarvis-core-node" data-running={Boolean(activeProject?.running)} style={{ left: cx, top: cy }}>
          <div className="jarvis-core-ring" />
          <div className="jarvis-core-glow" />
          <div className="jarvis-core-label">
            <span className="jarvis-core-title">AURA</span>
            <span className="jarvis-core-subtitle">{activeProject?.running ? "al lavoro…" : "core"}</span>
          </div>
        </div>

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
            onClick={() => {
              if (dragMovedRef.current) {
                dragMovedRef.current = false;
                return;
              }
              onSelectAgent(pos.agent);
            }}
          >
            <span className="jarvis-agent-ring" data-status={pos.agent.status} />
            <span className="jarvis-agent-name">{pos.agent.name}</span>
            <span className="jarvis-agent-role">{ROLE_LABEL[pos.agent.role]}</span>
          </button>
        ))}
      </div>

      {!activeProject && (
        <p className="jarvis-empty-hint">Crea un progetto (cartella reale) per iniziare a lavorare con Claude.</p>
      )}

      {activeProject && (
        <div className="jarvis-view-controls">
          <span className="jarvis-view-count">
            {agents.length} agent{agents.length === 1 ? "e" : "i"}
            {activeCount > 0 ? ` · ${activeCount} attiv${activeCount === 1 ? "o" : "i"}` : ""}
          </span>
          <button type="button" onClick={() => zoomBy(1.25)} title="Zoom avanti" aria-label="Zoom avanti">
            +
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.25)} title="Zoom indietro" aria-label="Zoom indietro">
            −
          </button>
          <button type="button" onClick={recenter} title="Centra la vista" aria-label="Centra la vista">
            ⟲
          </button>
        </div>
      )}
    </div>
  );
}
