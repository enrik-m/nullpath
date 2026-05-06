/**
 * RegionView — pixel-art DAG map.
 *
 * Zones render as pixel-art "monuments" connected by stepped orthogonal
 * paths (no bezier — chunky and grid-aligned). Lit edges are bright lime;
 * reachable edges are dim accent; locked edges are dotted gray.
 *
 * Pan/zoom: window-bound mouse listeners so drag survives leaving the SVG;
 * wheel zoom anchors on the cursor.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import * as db from "../db";
import type { ZoneRow, ZoneStats, RegionRow } from "../db/types";
import { useUi } from "../store";
import { sfx } from "../lib/sfx";

interface RegionViewProps { regionId: string; }
interface ZoneNode { zone: ZoneRow; stats: ZoneStats | null; }
interface View { x: number; y: number; scale: number; }

const MIN_SCALE = 0.3;
const MAX_SCALE = 2.4;

// ---------------------------------------------------------------------------
// DAG. Each entry: child → parents that must (in spirit) be done first.
// ---------------------------------------------------------------------------
const ZONE_PARENTS: Record<string, string[]> = {
  Z22: ["Z01"],
  Z02: ["Z01"],
  Z03: ["Z01"],
  Z04: ["Z02"],
  Z05: ["Z02"],
  Z06: ["Z02"],
  Z07: ["Z02", "Z06"],
  Z08: ["Z02"],
  Z09: ["Z02"],
  Z10: ["Z06"],
  Z12: ["Z03", "Z02"],
  Z14: ["Z08", "Z04"],
  Z18: ["Z05"],
  Z19: ["Z05"],
  Z11: ["Z04", "Z06"],
  Z13: ["Z07", "Z06"],
  Z20: ["Z04", "Z08"],
  Z16: ["Z08"],
  Z15: ["Z14"],
  Z17: ["Z04", "Z05", "Z09"],
  Z21: ["Z11", "Z14", "Z17"],
  Z23: ["Z21", "Z15", "Z16", "Z19", "Z20", "Z13", "Z18", "Z22"],
};

// ---------------------------------------------------------------------------
// Stepped orthogonal edge path (chunky / grid-aligned).
// Goes vertical-then-horizontal-then-vertical so it looks like an
// old-school dungeon-map pipe.
// ---------------------------------------------------------------------------
function steppedEdgePath(sx: number, sy: number, tx: number, ty: number): string {
  if (Math.abs(sy - ty) < 1) return `M ${sx} ${sy} L ${tx} ${ty}`;
  const my = sy + (ty - sy) / 2;
  return `M ${sx} ${sy} L ${sx} ${my} L ${tx} ${my} L ${tx} ${ty}`;
}

export function RegionView({ regionId }: RegionViewProps) {
  const go = useUi((s) => s.go);
  const [region, setRegion] = useState<RegionRow | null>(null);
  const [zones, setZones] = useState<ZoneNode[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ x0: number; y0: number; vx0: number; vy0: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const r = await db.getRegion(regionId);
      const zs = await db.getZones(regionId);
      const stats = await db.getZoneStats(regionId);
      const statsMap = new Map(stats.map((s) => [s.zone_id, s]));
      if (cancelled) return;
      setRegion(r);
      setZones(zs.map((z) => ({ zone: z, stats: statsMap.get(z.id) ?? null })));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [regionId]);

  const fitView = useCallback(() => {
    if (!containerRef.current || zones.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const z of zones) {
      const x = z.zone.cx ?? 0;
      const y = z.zone.cy ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const worldW = maxX - minX + 280;
    const worldH = maxY - minY + 320;
    const fitScale = Math.min(rect.width / worldW, rect.height / worldH, 1);
    const worldCx = (minX + maxX) / 2;
    const worldCy = (minY + maxY) / 2;
    setView({
      scale: fitScale,
      x: rect.width / 2 - worldCx * fitScale,
      y: rect.height / 2 - worldCy * fitScale,
    });
  }, [zones]);

  useLayoutEffect(() => { fitView(); }, [fitView]);

  const zoneById = useMemo(() => {
    const m = new Map<string, ZoneNode>();
    for (const z of zones) m.set(z.zone.id, z);
    return m;
  }, [zones]);

  const isZoneComplete = useCallback(
    (id: string) => {
      const z = zoneById.get(id);
      if (!z?.stats) return false;
      return z.stats.total_nodes > 0 && z.stats.completed_nodes === z.stats.total_nodes;
    },
    [zoneById],
  );

  const isZoneStarted = useCallback(
    (id: string) => {
      const z = zoneById.get(id);
      if (!z?.stats) return false;
      return z.stats.completed_nodes > 0 || z.stats.in_progress_nodes > 0;
    },
    [zoneById],
  );

  const isZoneUnlocked = useCallback(
    (id: string): boolean => {
      const parents = ZONE_PARENTS[id];
      if (!parents || parents.length === 0) return true;
      return parents.every((p) => isZoneComplete(p));
    },
    [isZoneComplete],
  );

  const edges = useMemo(() => {
    const out: Array<{ from: string; to: string; lit: boolean; reachable: boolean }> = [];
    for (const [child, parents] of Object.entries(ZONE_PARENTS)) {
      for (const parent of parents) {
        const lit = isZoneComplete(parent);
        const reachable = isZoneStarted(parent);
        out.push({ from: parent, to: child, lit, reachable });
      }
    }
    return out;
  }, [isZoneComplete, isZoneStarted]);

  // Pan / zoom
  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-zone-star]")) return;
    if (e.button !== 0) return;
    dragRef.current = { x0: e.clientX, y0: e.clientY, vx0: view.x, vy0: view.y };
    setIsDragging(true);
    e.preventDefault();
  }

  const onMouseMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.vx0 + (e.clientX - d.x0), y: d.vy0 + (e.clientY - d.y0) }));
  }, []);

  const onMouseUp = useCallback(() => {
    if (dragRef.current) { dragRef.current = null; setIsDragging(false); }
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  function onWheel(e: React.WheelEvent) {
    if (!containerRef.current) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView((v) => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
      const f = newScale / v.scale;
      return { scale: newScale, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
    });
  }

  if (loading || !region) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="np-mono text-[var(--color-fg-2)] text-base np-blink">
          loading constellation...
        </div>
      </div>
    );
  }

  const accent = region.color_accent;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      {/* Region overlay header */}
      <div className="absolute top-0 left-0 right-0 z-10 px-6 py-4 pointer-events-none flex items-start justify-between">
        <div className="np-pixel px-4 py-2 pointer-events-auto" style={{ borderColor: accent }}>
          <div className="np-screen text-[10px] tracking-[0.3em] text-[var(--color-fg-3)]">
            // REGION · {region.id}
          </div>
          <div className="np-display text-base mt-1" style={{ color: accent }}>
            {region.name.toUpperCase()}
          </div>
          <div className="text-[var(--color-fg-2)] text-[12px] mt-1 max-w-md">
            {region.tagline}
          </div>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => { sfx.click(); fitView(); }}
            className="np-btn np-btn-ghost np-btn-sm"
          >
            FIT VIEW
          </button>
          <span className="np-screen text-[10px] tracking-[0.2em] text-[var(--color-fg-3)] hidden md:block">
            DRAG · SCROLL
          </span>
        </div>
      </div>

      {/* Map */}
      <div
        ref={containerRef}
        className={`flex-1 select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
        style={{
          background: `
            radial-gradient(ellipse 50% 50% at 50% 50%, ${accent}11 0%, transparent 70%),
            repeating-linear-gradient(
              0deg,
              var(--color-bg-1) 0,
              var(--color-bg-1) 24px,
              var(--color-bg-2) 24px,
              var(--color-bg-2) 25px
            ),
            repeating-linear-gradient(
              90deg,
              transparent 0,
              transparent 24px,
              var(--color-bg-2) 24px,
              var(--color-bg-2) 25px
            )
          `,
        }}
      >
        <svg width="100%" height="100%" style={{ display: "block" }} shapeRendering="crispEdges">
          <defs>
            <pattern id="dot-pattern" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width="2" height="2" fill="var(--color-fg-3)" />
            </pattern>
          </defs>
          <g
            transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
            style={{ transformOrigin: "0 0" }}
          >
            {/* Edges */}
            {edges.map((e) => {
              const a = zoneById.get(e.from);
              const b = zoneById.get(e.to);
              if (!a || !b) return null;
              const sx = a.zone.cx ?? 0;
              const sy = a.zone.cy ?? 0;
              const tx = b.zone.cx ?? 0;
              const ty = b.zone.cy ?? 0;
              const d = steppedEdgePath(sx, sy, tx, ty);
              const litColor = "var(--color-lime)";
              const reachableColor = accent;
              const lockedColor = "var(--color-border-default)";
              const stroke = e.lit ? litColor : e.reachable ? reachableColor : lockedColor;
              return (
                <g key={`${e.from}->${e.to}`}>
                  {/* Lit halo */}
                  {e.lit && (
                    <path
                      d={d}
                      fill="none"
                      stroke={litColor}
                      strokeOpacity={0.3}
                      strokeWidth={14 / view.scale}
                      strokeLinecap="butt"
                      strokeLinejoin="miter"
                    />
                  )}
                  <path
                    d={d}
                    fill="none"
                    stroke={stroke}
                    strokeOpacity={e.lit ? 1 : e.reachable ? 0.85 : 0.5}
                    strokeWidth={e.lit ? 4 / view.scale : 3 / view.scale}
                    strokeLinecap="butt"
                    strokeLinejoin="miter"
                    strokeDasharray={
                      e.lit
                        ? undefined
                        : e.reachable
                          ? `${6 / view.scale} ${4 / view.scale}`
                          : `${4 / view.scale} ${4 / view.scale}`
                    }
                  />
                </g>
              );
            })}

            {/* Zones */}
            {zones.map((z) => (
              <PixelZoneNode
                key={z.zone.id}
                zone={z}
                accent={accent}
                hovered={hovered === z.zone.id}
                unlocked={isZoneUnlocked(z.zone.id)}
                onHover={(id) => {
                  setHovered(id);
                  if (id) sfx.hover();
                }}
                onSelect={() => {
                  sfx.zoneUnlock();
                  go({ name: "zone", zoneId: z.zone.id });
                }}
              />
            ))}
          </g>
        </svg>
      </div>

      {hovered && (
        <ZoneHoverPanel
          zone={zoneById.get(hovered)!}
          accent={accent}
          unlocked={isZoneUnlocked(hovered)}
          parentNames={(ZONE_PARENTS[hovered] ?? []).map(
            (p) => zoneById.get(p)?.zone.name ?? p,
          )}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PixelZoneNode — pixel-art monument with chunky bordered tile + progress
// segments around the perimeter.
// ---------------------------------------------------------------------------
function PixelZoneNode({
  zone,
  accent,
  hovered,
  unlocked,
  onHover,
  onSelect,
}: {
  zone: ZoneNode;
  accent: string;
  hovered: boolean;
  unlocked: boolean;
  onHover: (id: string | null) => void;
  onSelect: () => void;
}) {
  const cx = zone.zone.cx ?? 0;
  const cy = zone.zone.cy ?? 0;
  const total = zone.stats?.total_nodes ?? 0;
  const completed = zone.stats?.completed_nodes ?? 0;
  const inProgress = zone.stats?.in_progress_nodes ?? 0;
  const pct = total > 0 ? completed / total : 0;
  const isComplete = total > 0 && completed === total;
  const isActive = inProgress > 0;

  const accentColor = isComplete
    ? "#a8ff5c"
    : isActive
      ? accent
      : unlocked
        ? "#b0b8e0"
        : "#4a5485";

  // Tile size — 56x56 unit pixel-art monument
  const W = 56;
  const PAD = 4;

  // Progress bar segments around the bottom (12 cells)
  const SEGMENTS = 12;
  const filled = Math.round(pct * SEGMENTS);

  return (
    <g
      data-zone-star
      transform={`translate(${cx - W / 2} ${cy - W / 2})`}
      style={{ cursor: "pointer", opacity: unlocked ? 1 : 0.55 }}
      onMouseEnter={() => onHover(zone.zone.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onSelect}
    >
      {/* Outer halo glow when hovered or active */}
      {(hovered || isActive || isComplete) && (
        <rect
          x={-12}
          y={-12}
          width={W + 24}
          height={W + 24}
          fill="none"
          stroke={accentColor}
          strokeWidth={2}
          opacity={hovered ? 0.7 : 0.35}
          strokeDasharray="2 4"
        />
      )}

      {/* Outer pixel border (3 layers for chunky bevel) */}
      <rect x={0} y={0} width={W} height={W} fill="#0a0d1f" />
      <rect x={2} y={2} width={W - 4} height={W - 4} fill={accentColor} />
      <rect x={4} y={4} width={W - 8} height={W - 8} fill="#161b3a" />
      {/* Highlight (top-left) and shadow (bot-right) bevel pixels */}
      <rect x={4} y={4} width={W - 8} height={2} fill={accentColor} opacity={0.6} />
      <rect x={4} y={4} width={2} height={W - 8} fill={accentColor} opacity={0.6} />

      {/* Inner emblem area */}
      <g transform={`translate(${PAD + 8} ${PAD + 6})`}>
        {/* Big zone ID */}
        <text
          x={(W - 24) / 2}
          y={14}
          textAnchor="middle"
          fontFamily="'Press Start 2P', monospace"
          fontSize={10}
          fill={accentColor}
          shapeRendering="crispEdges"
        >
          {zone.zone.id}
        </text>

        {/* Diamond accent */}
        <g transform={`translate(${(W - 24) / 2 - 2} ${22})`}>
          <rect x={2} y={0} width={2} height={2} fill={accentColor} />
          <rect x={0} y={2} width={6} height={2} fill={accentColor} />
          <rect x={2} y={4} width={2} height={2} fill={accentColor} />
        </g>

        {/* In-progress pulse dot */}
        {isActive && !isComplete && (
          <rect x={W - 24 - 4} y={0} width={3} height={3} fill={accentColor}>
            <animate attributeName="opacity" values="1;0.2;1" dur="1s" repeatCount="indefinite" />
          </rect>
        )}
        {/* Complete checkmark */}
        {isComplete && (
          <g transform={`translate(${W - 24 - 6} 0)`} fill="#a8ff5c">
            <rect x={0} y={2} width={1} height={1} />
            <rect x={1} y={3} width={1} height={1} />
            <rect x={2} y={4} width={1} height={1} />
            <rect x={3} y={3} width={1} height={1} />
            <rect x={4} y={2} width={1} height={1} />
            <rect x={5} y={1} width={1} height={1} />
          </g>
        )}
      </g>

      {/* Progress segments along the bottom inset */}
      <g transform={`translate(${PAD + 4} ${W - PAD - 6})`}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const segW = (W - 2 * (PAD + 4)) / SEGMENTS;
          return (
            <rect
              key={i}
              x={i * segW + 0.5}
              y={0}
              width={segW - 1}
              height={2}
              fill={i < filled ? accentColor : "#1f2750"}
            />
          );
        })}
      </g>

      {/* Zone name label below the tile */}
      <text
        x={W / 2}
        y={W + 14}
        textAnchor="middle"
        fontFamily="'Pixelify Sans', monospace"
        fontSize={11}
        fontWeight={600}
        fill={hovered ? "#e8ecff" : unlocked ? "#b0b8e0" : "#7280b0"}
        shapeRendering="crispEdges"
      >
        {zone.zone.name.length > 22 ? zone.zone.name.slice(0, 20) + "…" : zone.zone.name}
      </text>
    </g>
  );
}

function ZoneHoverPanel({
  zone,
  accent,
  unlocked,
  parentNames,
}: {
  zone: ZoneNode;
  accent: string;
  unlocked: boolean;
  parentNames: string[];
}) {
  const total = zone.stats?.total_nodes ?? 0;
  const completed = zone.stats?.completed_nodes ?? 0;
  const inProgress = zone.stats?.in_progress_nodes ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.1, ease: "linear" }}
      className="absolute right-6 bottom-6 np-pixel max-w-[320px] pointer-events-none"
      style={{ borderColor: accent }}
    >
      <div
        className="np-screen text-[10px] tracking-[0.2em] px-3 py-1.5 border-b-2 flex items-center gap-2"
        style={{
          background: `${accent}22`,
          borderColor: "var(--color-border-default)",
          color: accent,
        }}
      >
        <span className="inline-block w-2 h-2" style={{ background: accent }} />
        ZONE · {zone.zone.id}
        <span
          className="ml-auto px-1.5 py-0.5 text-[10px]"
          style={{
            background: unlocked ? "var(--color-lime)" : "var(--color-bg-3)",
            color: unlocked ? "var(--color-bg-0)" : "var(--color-fg-3)",
          }}
        >
          {unlocked ? "AVAILABLE" : "GATED"}
        </span>
      </div>
      <div className="p-4">
        <div className="np-display text-sm text-[var(--color-fg-0)] mb-3">
          {zone.zone.name.toUpperCase()}
        </div>
        <div className="space-y-1.5 np-mono text-[13px]">
          <div className="flex justify-between text-[var(--color-fg-1)]">
            <span>NODES</span><span>{total}</span>
          </div>
          <div className="flex justify-between text-[var(--color-cyan)]">
            <span>IN PROGRESS</span><span>{inProgress}</span>
          </div>
          <div className="flex justify-between text-[var(--color-lime)]">
            <span>COMPLETE</span><span>{completed} ({pct}%)</span>
          </div>
        </div>
        {parentNames.length > 0 && (
          <>
            <div className="np-divider my-3" />
            <div className="np-screen text-[10px] tracking-[0.2em] text-[var(--color-fg-3)] mb-1">
              UNLOCKED BY
            </div>
            <div className="text-[10px] text-[var(--color-fg-2)]">
              {parentNames.join(" · ")}
            </div>
          </>
        )}
        <div className="mt-3 np-screen text-[10px] tracking-[0.2em] text-[var(--color-fg-3)] np-blink">
          ▶ CLICK TO ENTER
        </div>
      </div>
    </motion.div>
  );
}
