import { useEffect, useRef, useState } from "react";
import { useAppState } from "../state/AppState";
import { ROLE_LABEL } from "../data/mockData";
import { RoleIcon } from "./RoleIcons";
import auraCoreLogo from "../assets/aura-core-logo.svg";
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


type NodeShape = "circle" | "rect" | "diamond";

interface NodePos {
  agent: SubAgent;
  x: number;
  y: number;
  labelSide: "top" | "bottom";
  depth: number;
  parentX: number;
  parentY: number;
  shape: NodeShape;
  seed: number;
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

// The core is the AURA wordmark logo (a provided asset, rendered verbatim,
// never redrawn — see src/assets/aura-core-logo.svg) sized to its own
// portrait aspect ratio (696x1042). Every beam to a depth-1 agent launches
// from a pin sitting directly on the logo's own outer stroke (the bolt
// silhouette), not an abstract bounding box, so the wires read as soldered
// straight onto the artwork — a fixed ring of slots is sampled once off
// that path, and each root agent claims the free slot closest to its own
// angle around the core.
const CORE_LOGO_ASPECT = 696 / 1042;
const CORE_RECT_H = 190;
const CORE_RECT_W = CORE_RECT_H * CORE_LOGO_ASPECT;
const CORE_PIN_LEG = 30;

// Sampled from the logo's outer <path> (the `stroke:aqua` bolt outline) via
// SVGPathElement.getPointAtLength at 26 even arc-length steps, in the
// asset's own 696x1042 coordinate space — `nx`/`ny` is that point's
// outward normal (perpendicular to the path's local tangent, pointing away
// from the shape's centroid). Static because the asset is static; re-sample
// if the logo file ever changes.
const LOGO_OUTLINE_POINTS: { x: number; y: number; nx: number; ny: number }[] = [
  { x: 532.25, y: 466.7, nx: 0.03, ny: -1 },
  { x: 458.11, y: 466.24, nx: 0, ny: -1 },
  { x: 407.28, y: 437.54, nx: 1, ny: -0.001 },
  { x: 407.22, y: 363.4, nx: 1, ny: -0.001 },
  { x: 407.17, y: 289.26, nx: 1, ny: -0.001 },
  { x: 407.11, y: 215.12, nx: 1, ny: -0.001 },
  { x: 391.06, y: 152.84, nx: -0.089, ny: -0.996 },
  { x: 346.59, y: 204.86, nx: -0.875, ny: -0.484 },
  { x: 310.65, y: 269.7, nx: -0.874, ny: -0.485 },
  { x: 274.67, y: 334.53, nx: -0.874, ny: -0.485 },
  { x: 238.71, y: 399.37, nx: -0.875, ny: -0.485 },
  { x: 202.76, y: 464.2, nx: -0.875, ny: -0.485 },
  { x: 172.67, y: 514.48, nx: -1, ny: 0 },
  { x: 166.64, y: 574, nx: -0.015, ny: 1 },
  { x: 240.78, y: 574.03, nx: -0.001, ny: 1 },
  { x: 281.23, y: 613.93, nx: -1, ny: 0 },
  { x: 281.23, y: 688.07, nx: -1, ny: 0 },
  { x: 281.18, y: 762.16, nx: -1, ny: 0 },
  { x: 281.18, y: 836.3, nx: -1, ny: -0.001 },
  { x: 305.22, y: 890.03, nx: 0.075, ny: 0.997 },
  { x: 346.46, y: 831.01, nx: 0.873, ny: 0.488 },
  { x: 382.68, y: 766.31, nx: 0.873, ny: 0.489 },
  { x: 418.93, y: 701.64, nx: 0.872, ny: 0.489 },
  { x: 455.17, y: 636.96, nx: 0.872, ny: 0.489 },
  { x: 491.97, y: 573.28, nx: 0, ny: 1 },
  { x: 524.31, y: 527.08, nx: 1, ny: 0 },
];

interface PinSlot {
  x: number;
  y: number;
  nx: number;
  ny: number;
  legX: number;
  legY: number;
  angle: number;
}

function buildPinSlots(cx: number, cy: number, leg: number): PinSlot[] {
  // Asset space -> chip-local space: uniform scale (CORE_RECT_H/1042, same
  // on both axes since CORE_RECT_W was derived to preserve the asset's own
  // aspect ratio) around the asset's own center (348, 521).
  const scale = CORE_RECT_H / 1042;
  return LOGO_OUTLINE_POINTS.map((p) => {
    const x = (p.x - 348) * scale;
    const y = (p.y - 521) * scale;
    return {
      x: cx + x,
      y: cy + y,
      nx: p.nx,
      ny: p.ny,
      legX: cx + x + p.nx * leg,
      legY: cy + y + p.ny * leg,
      angle: Math.atan2(y, x),
    };
  });
}

const PIN_SLOTS = buildPinSlots(WORLD_CENTER, WORLD_CENTER, CORE_PIN_LEG);

function nearestFreeSlot(angle: number, used: Set<number>): number {
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < PIN_SLOTS.length; i++) {
    if (used.has(i)) continue;
    let diff = Math.abs(PIN_SLOTS[i].angle - angle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

// Sub-agents branch out locally from their own parent instead of sharing
// the core's ring, so the graph reads as an actual tree: depth 1 (direct
// children of the core) keeps the full-circle layout around the chip.
// Every deeper level keeps travelling in the exact same direction its
// root first launched in (no widening fan) and lays its siblings out as a
// straight row perpendicular to that direction — the "column of boxes
// hanging off a branch" look, at a shape picked by depth (circle ->
// rectangle -> diamond, AURA's own convention).
const CHILD_FORWARD: Record<number, number> = { 2: 100, 3: 90 };
const SIBLING_GAP: Record<number, number> = { 2: 68, 3: 60 };
const SHAPE_BY_DEPTH: Record<number, NodeShape> = { 1: "circle", 2: "rect", 3: "diamond" };

function shapeForDepth(depth: number): NodeShape {
  return SHAPE_BY_DEPTH[Math.min(depth, 3)] ?? "diamond";
}

/** Cheap stable hash so each beam gets its own fixed wiggle "personality"
 * instead of every line waving in lockstep. */
function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return h;
}

/** Builds a radial tree layout from each agent's `parentId`, falling back
 * to treating an agent as a direct child of the core if its parent is
 * missing (pruned, or never seen) rather than dropping it. */
function layoutAgentTree(agents: SubAgent[], cx: number, cy: number, rootRadius: number): NodePos[] {
  const ids = new Set(agents.map((a) => a.id));
  const childrenOf = new Map<string, SubAgent[]>();
  const roots: SubAgent[] = [];

  for (const agent of agents) {
    const parentId = agent.parentId && ids.has(agent.parentId) ? agent.parentId : undefined;
    if (!parentId) {
      roots.push(agent);
      continue;
    }
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId)!.push(agent);
  }

  const positions: NodePos[] = [];
  const usedSlots = new Set<number>();

  function place(list: SubAgent[], originX: number, originY: number, dirAngle: number, depth: number) {
    const n = list.length;
    if (n === 0) return;
    const isRoot = depth === 1;
    const shape = shapeForDepth(depth);

    if (isRoot) {
      // Roots still fan freely around the whole core, one per pin.
      list.forEach((agent, i) => {
        const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const x = originX + rootRadius * Math.cos(angle);
        const y = originY + rootRadius * Math.sin(angle);

        let parentX = originX;
        let parentY = originY;
        const slotIdx = nearestFreeSlot(angle, usedSlots);
        if (slotIdx !== -1) {
          usedSlots.add(slotIdx);
          parentX = PIN_SLOTS[slotIdx].legX;
          parentY = PIN_SLOTS[slotIdx].legY;
        }

        positions.push({
          agent,
          x,
          y,
          labelSide: Math.sin(angle) < 0 ? "top" : "bottom",
          depth,
          parentX,
          parentY,
          shape,
          seed: seedFromId(agent.id),
        });

        const kids = childrenOf.get(agent.id);
        if (kids) place(kids, x, y, angle, depth + 1);
      });
      return;
    }

    // Every level below root keeps the same outward direction its root
    // picked (no widening angle) and lays siblings out as a straight row
    // perpendicular to that direction, one forward-step further out.
    const forward = CHILD_FORWARD[Math.min(depth, 3)] ?? 80;
    const gap = SIBLING_GAP[Math.min(depth, 3)] ?? 55;
    const rowX = originX + forward * Math.cos(dirAngle);
    const rowY = originY + forward * Math.sin(dirAngle);
    const perpX = -Math.sin(dirAngle);
    const perpY = Math.cos(dirAngle);

    list.forEach((agent, i) => {
      const offset = (i - (n - 1) / 2) * gap;
      const x = rowX + perpX * offset;
      const y = rowY + perpY * offset;

      positions.push({
        agent,
        x,
        y,
        labelSide: Math.sin(dirAngle) < 0 ? "top" : "bottom",
        depth,
        parentX: originX,
        parentY: originY,
        shape,
        seed: seedFromId(agent.id),
      });

      const kids = childrenOf.get(agent.id);
      if (kids) place(kids, x, y, dirAngle, depth + 1);
    });
  }

  place(roots, cx, cy, -Math.PI / 2, 1);
  return positions;
}

function hexToRgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Two control points offset perpendicular to the straight parent->child
 * line, wandering slowly over time — this is what makes a beam read as an
 * organic neural tendril instead of a ruler-straight wire. Amplitude and
 * phase are seeded per-beam so lines don't all wave in unison. */
function organicControls(x0: number, y0: number, x1: number, y1: number, seed: number, t: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const amp = Math.min(34, len * 0.22) * (0.6 + 0.4 * Math.sin(t * 0.35 + seed));
  const w1 = amp * Math.sin(seed * 2.1 + t * 0.5);
  const w2 = -amp * Math.sin(seed * 1.3 + 1.7 + t * 0.4);
  return [
    { x: x0 + dx * 0.32 + nx * w1, y: y0 + dy * 0.32 + ny * w1 },
    { x: x0 + dx * 0.68 + nx * w2, y: y0 + dy * 0.68 + ny * w2 },
  ];
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
  const rootCount = agents.filter((a) => !a.parentId || !agents.some((other) => other.id === a.parentId)).length;
  // The root ring grows with how many *direct* core children there are
  // (enough arc-length per node to stay clickable) instead of staying a
  // fixed size agents pile up and overlap on — sub-agents no longer share
  // this ring at all, they branch off their own parent's position instead.
  const radius = Math.min(MAX_RADIUS, Math.max(BASE_RADIUS, (rootCount * MIN_ARC_SPACING) / (2 * Math.PI)));

  const positions: NodePos[] = layoutAgentTree(agents, cx, cy, radius);

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

      // beams parent -> agent, drawn as wandering neon tendrils (organic
      // bezier wiggle, always slowly animating) rather than straight
      // spokes — the parent is the core for depth-1 agents, but each
      // deeper agent's own parent node for everything below that.
      for (const pos of positions) {
        const color = STATUS_COLOR[pos.agent.status];
        const { parentX, parentY } = pos;
        const idle = pos.agent.status === "idle";
        const [c1, c2] = organicControls(parentX, parentY, pos.x, pos.y, pos.seed, t);

        ctx!.beginPath();
        ctx!.moveTo(parentX, parentY);
        ctx!.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, pos.x, pos.y);

        // Glow pass: wide, soft, blurred halo beneath the crisp line —
        // canvas has no CSS filter equivalent per-stroke, so bloom is
        // faked with a second, fatter, low-alpha stroke plus shadowBlur.
        ctx!.save();
        ctx!.shadowColor = color;
        ctx!.shadowBlur = idle ? 6 : 14;
        ctx!.strokeStyle = hexToRgba(color, idle ? 0.16 : 0.4);
        ctx!.lineWidth = idle ? 2.5 : 4;
        ctx!.lineCap = "round";
        ctx!.stroke();
        ctx!.restore();

        // Crisp core line on top.
        ctx!.strokeStyle = hexToRgba(color, idle ? 0.3 : 0.75);
        ctx!.lineWidth = 1.2;
        ctx!.lineCap = "round";
        ctx!.stroke();

        if (!idle && !reduceMotion) {
          const speed = 0.3 + pos.agent.load * 0.7;
          const p = (t * speed + pos.seed * 0.01) % 1;
          const u = 1 - p;
          const px = u * u * u * parentX + 3 * u * u * p * c1.x + 3 * u * p * p * c2.x + p * p * p * pos.x;
          const py = u * u * u * parentY + 3 * u * u * p * c1.y + 3 * u * p * p * c2.y + p * p * p * pos.y;
          ctx!.beginPath();
          ctx!.arc(px, py, 3, 0, Math.PI * 2);
          ctx!.fillStyle = hexToRgba(color, 0.95);
          ctx!.shadowColor = color;
          ctx!.shadowBlur = 8;
          ctx!.fill();
          ctx!.shadowBlur = 0;
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
          <div className="jarvis-core-glow" />
          <svg
            className="jarvis-core-chip"
            viewBox={`${-(CORE_RECT_W / 2 + CORE_PIN_LEG + 16)} ${-(CORE_RECT_H / 2 + CORE_PIN_LEG + 16)} ${CORE_RECT_W + 2 * CORE_PIN_LEG + 32} ${CORE_RECT_H + 2 * CORE_PIN_LEG + 32}`}
            aria-hidden="true"
          >
            {PIN_SLOTS.map((slot, i) => {
              const lx = slot.x - WORLD_CENTER;
              const ly = slot.y - WORLD_CENTER;
              const legX = slot.legX - WORLD_CENTER;
              const legY = slot.legY - WORLD_CENTER;
              const midX = (lx + legX) / 2 + slot.ny * 4;
              const midY = (ly + legY) / 2 - slot.nx * 4;
              return (
                <g key={i} className="jarvis-chip-pin">
                  <path d={`M${lx},${ly} Q${midX},${midY} ${legX},${legY}`} />
                  <circle cx={legX} cy={legY} r={3.2} />
                </g>
              );
            })}
          </svg>
          <img src={auraCoreLogo} alt="AURA" className="jarvis-core-logo" />
          {activeProject?.running && <span className="jarvis-core-subtitle">al lavoro…</span>}
        </div>

        {positions.map((pos) => (
          <button
            key={pos.agent.id}
            className="jarvis-agent-node"
            data-label-side={pos.labelSide}
            data-depth={pos.depth}
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
            <span className="jarvis-agent-shape" data-shape={pos.shape}>
              <span className="jarvis-agent-shape-inner" />
              <span className="jarvis-agent-shape-icon" aria-hidden="true">
                <RoleIcon role={pos.agent.role} />
              </span>
              <span className="jarvis-agent-shape-dot" data-status={pos.agent.status} />
            </span>
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
