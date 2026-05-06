/**
 * RegionView — top-down zone DAG.
 *
 * Z01 Foundations is the root. Each child zone connects to one or more
 * parents that represent its prerequisites. Completing a parent lights up
 * its outgoing edges so what's "unlocked next" is always visually obvious.
 *
 * No hard locking — every zone stays clickable. The lit edges are an
 * advisory progression hint, not a gate.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import * as db from "../db";
import type { ZoneRow, ZoneStats, RegionRow } from "../db/types";
import { useUi } from "../store";
import { sfx } from "../lib/sfx";

interface RegionViewProps {
  regionId: string;
}

interface ZoneNode {
  zone: ZoneRow;
  stats: ZoneStats | null;
}

const STAR_RADIUS = 38;
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.5;

interface View {
  x: number;
  y: number;
  scale: number;
}

// ---------------------------------------------------------------------------
// The DAG. Each entry: child → parents that must (in spirit) be done first.
// These are advisory, not enforcing — every zone is always clickable.
// ---------------------------------------------------------------------------
type EdgeMap = Record<string, string[]>;

const ZONE_PARENTS: EdgeMap = {
  // Layer 1 — first branches off Foundations
  Z22: ["Z01"], // Methodology
  Z02: ["Z01"], // Tooling
  Z03: ["Z01"], // Recon

  // Layer 2 — vuln basics, mostly under Tooling, with Recon feeding Misconfig
  Z04: ["Z02"],
  Z05: ["Z02"],
  Z06: ["Z02"],
  Z07: ["Z02", "Z06"],
  Z08: ["Z02"],
  Z09: ["Z02"],
  Z10: ["Z06"],
  Z12: ["Z03", "Z02"],

  // Layer 3 — specializations grown out of vuln basics
  Z14: ["Z08", "Z04"],            // Source review off Server-Side + Injection
  Z18: ["Z05"],                    // Frontend frameworks off Client-Side
  Z19: ["Z05"],                    // Modern browser off Client-Side
  Z11: ["Z04", "Z06"],            // API Gateway off Injection + Auth
  Z13: ["Z07", "Z06"],            // Business Logic off Access + Auth
  Z20: ["Z04", "Z08"],            // AI/LLM off Injection + Server-Side
  Z16: ["Z08"],                    // Cloud-Native off Server-Side

  // Layer 4 — research-grade specialties
  Z15: ["Z14"],                    // Supply Chain off Source review
  Z17: ["Z04", "Z05", "Z09"],     // WAF/CDN bypass off Inj + Client + HTTP
  Z21: ["Z11", "Z14", "Z17"],     // Defenses off API + Source + WAF

  // Layer 5 — endgame
  Z23: ["Z21", "Z15", "Z16", "Z19", "Z20", "Z13", "Z18", "Z22"],
};

// ---------------------------------------------------------------------------
// Edge geometry helpers
// ---------------------------------------------------------------------------
function bezierEdgePath(sx: number, sy: number, tx: number, ty: number): string {
  // Vertical drop: simple S-curve via y-midpoint control points.
  const my = (sy + ty) / 2;
  return `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`;
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

  // Load
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
    return () => {
      cancelled = true;
    };
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
    const worldW = maxX - minX + 240;
    const worldH = maxY - minY + 280;
    const fitScale = Math.min(rect.width / worldW, rect.height / worldH, 1);
    const worldCx = (minX + maxX) / 2;
    const worldCy = (minY + maxY) / 2;
    setView({
      scale: fitScale,
      x: rect.width / 2 - worldCx * fitScale,
      y: rect.height / 2 - worldCy * fitScale,
    });
  }, [zones]);

  useLayoutEffect(() => {
    fitView();
  }, [fitView]);

  // ---------------------------------------------------------------------
  // Resolve coords + per-zone completion + edge "lit" state
  // ---------------------------------------------------------------------
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

  /** All ancestor parents complete → zone is "unlocked." */
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

  // ---------------------------------------------------------------------
  // Pan / zoom (window-level listeners so drag survives leaving the SVG)
  // ---------------------------------------------------------------------
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
    setView((v) => ({
      ...v,
      x: d.vx0 + (e.clientX - d.x0),
      y: d.vy0 + (e.clientY - d.y0),
    }));
  }, []);

  const onMouseUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      setIsDragging(false);
    }
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
      return {
        scale: newScale,
        x: cx - (cx - v.x) * f,
        y: cy - (cy - v.y) * f,
      };
    });
  }

  if (loading || !region) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="np-mono text-[var(--color-fg-2)] text-xs tracking-[0.3em]">
          loading constellation...
        </div>
      </div>
    );
  }

  const accent = region.color_accent;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      {/* Region overlay header */}
      <div className="absolute top-0 left-0 right-0 z-10 px-8 py-4 pointer-events-none flex items-start justify-between">
        <div>
          <div className="np-mono text-[10px] tracking-[0.3em] text-[var(--color-fg-3)] uppercase">
            // region · {region.id}
          </div>
          <div
            className="text-2xl font-bold tracking-tight"
            style={{ color: accent }}
          >
            {region.name}
          </div>
          <div className="text-[var(--color-fg-2)] text-[12px] mt-1 max-w-md">
            {region.tagline}
          </div>
        </div>
        <div className="np-mono text-[10px] tracking-[0.2em] text-[var(--color-fg-3)] uppercase pointer-events-auto flex items-center gap-3">
          <button
            onClick={() => {
              sfx.click();
              fitView();
            }}
            className="hover:text-[var(--color-fg-0)] transition"
          >
            fit view
          </button>
          <span className="opacity-50">drag to pan · scroll to zoom</span>
        </div>
      </div>

      {/* Map */}
      <div
        ref={containerRef}
        className={`flex-1 select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
      >
        <svg width="100%" height="100%" style={{ display: "block" }}>
          <defs>
            <radialGradient id="star-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
              <stop offset="60%" stopColor={accent} stopOpacity="0.05" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="star-glow-complete" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-lime)" stopOpacity="0.6" />
              <stop offset="60%" stopColor="var(--color-lime)" stopOpacity="0.05" />
              <stop offset="100%" stopColor="var(--color-lime)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="star-glow-locked" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-fg-3)" stopOpacity="0.18" />
              <stop offset="80%" stopColor="var(--color-fg-3)" stopOpacity="0" />
            </radialGradient>
            {/* Lit (parent-complete) edge — a flowing gradient */}
            <linearGradient id="edge-lit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-lime)" stopOpacity="0.95" />
              <stop offset="100%" stopColor={accent} stopOpacity="0.95" />
            </linearGradient>
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
              const d = bezierEdgePath(sx, sy, tx, ty);
              const stroke = e.lit
                ? "url(#edge-lit)"
                : e.reachable
                  ? accent
                  : "var(--color-border-default)";
              const opacity = e.lit ? 1 : e.reachable ? 0.55 : 0.4;
              const width = e.lit ? 2.8 : 1.5;
              return (
                <g key={`${e.from}->${e.to}`}>
                  {/* Soft halo behind lit edges */}
                  {e.lit && (
                    <path
                      d={d}
                      fill="none"
                      stroke={accent}
                      strokeOpacity={0.25}
                      strokeWidth={10 / view.scale + 4}
                      strokeLinecap="round"
                    />
                  )}
                  <path
                    d={d}
                    fill="none"
                    stroke={stroke}
                    strokeOpacity={opacity}
                    strokeWidth={width / view.scale + (e.lit ? 1 : 0)}
                    strokeLinecap="round"
                    strokeDasharray={e.lit ? undefined : `${4 / view.scale} ${4 / view.scale}`}
                  />
                </g>
              );
            })}

            {/* Zone stars */}
            {zones.map((z) => (
              <ZoneStar
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

      {/* Hover tooltip */}
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
// Star + tooltip
// ---------------------------------------------------------------------------

function ZoneStar({
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
  const fillColor = isComplete
    ? "var(--color-lime)"
    : isActive
      ? accent
      : unlocked
        ? "var(--color-fg-1)"
        : "var(--color-fg-3)";

  const circumference = 2 * Math.PI * STAR_RADIUS;
  const haloId = isComplete
    ? "star-glow-complete"
    : unlocked
      ? "star-glow"
      : "star-glow-locked";

  return (
    <g
      data-zone-star
      transform={`translate(${cx} ${cy})`}
      style={{ cursor: "pointer", opacity: unlocked ? 1 : 0.65 }}
      onMouseEnter={() => onHover(zone.zone.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onSelect}
    >
      {/* Glow halo */}
      <circle
        r={STAR_RADIUS * (hovered ? 2.4 : 2.0)}
        fill={`url(#${haloId})`}
        opacity={hovered ? 1 : 0.7}
        style={{ transition: "opacity 200ms, r 200ms" }}
      />
      {/* Outer ring (background) */}
      <circle
        r={STAR_RADIUS}
        fill="var(--color-bg-1)"
        stroke={unlocked ? "var(--color-border-default)" : "var(--color-border-subtle)"}
        strokeWidth={2}
      />
      {/* Progress arc */}
      {pct > 0 && (
        <circle
          r={STAR_RADIUS}
          fill="none"
          stroke={fillColor}
          strokeWidth={3}
          strokeDasharray={`${pct * circumference} ${circumference}`}
          transform="rotate(-90)"
          strokeLinecap="round"
        />
      )}
      {/* Inner pulse for in-progress */}
      {isActive && !isComplete && (
        <circle
          r={STAR_RADIUS * 0.6}
          fill="none"
          stroke={accent}
          strokeWidth={1}
          opacity={0.5}
        >
          <animate
            attributeName="r"
            from={STAR_RADIUS * 0.55}
            to={STAR_RADIUS * 0.75}
            dur="2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            from="0.6"
            to="0"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      )}
      {/* Inner dot */}
      <circle
        r={STAR_RADIUS * 0.4}
        fill="var(--color-bg-2)"
        stroke={fillColor}
        strokeWidth={1.5}
      />
      {/* Zone id */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-mono)"
        fontSize={11}
        fontWeight={700}
        fill={fillColor}
      >
        {zone.zone.id}
      </text>
      {/* Zone name beneath */}
      <text
        textAnchor="middle"
        y={STAR_RADIUS + 22}
        fontFamily="var(--font-sans)"
        fontSize={11}
        fontWeight={500}
        fill={hovered ? "var(--color-fg-0)" : unlocked ? "var(--color-fg-1)" : "var(--color-fg-3)"}
        style={{ transition: "fill 150ms" }}
      >
        {zone.zone.name}
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute right-6 bottom-6 np-glass rounded-md p-4 max-w-[320px] pointer-events-none"
      style={{ borderColor: accent + "55" }}
    >
      <div className="flex items-baseline justify-between">
        <div className="np-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: accent }}>
          {zone.zone.id}
        </div>
        <div
          className="np-mono text-[9px] tracking-[0.2em] uppercase"
          style={{ color: unlocked ? "var(--color-lime)" : "var(--color-fg-3)" }}
        >
          {unlocked ? "AVAILABLE" : "GATED"}
        </div>
      </div>
      <div className="text-base font-bold text-[var(--color-fg-0)] mt-0.5 mb-2">
        {zone.zone.name}
      </div>
      <div className="np-divider mb-2" />
      <div className="np-mono text-[11px] text-[var(--color-fg-1)] flex items-center justify-between">
        <span>nodes</span>
        <span>{total}</span>
      </div>
      <div className="np-mono text-[11px] text-[var(--color-cyan)] flex items-center justify-between">
        <span>in progress</span>
        <span>{inProgress}</span>
      </div>
      <div className="np-mono text-[11px] text-[var(--color-lime)] flex items-center justify-between">
        <span>complete</span>
        <span>
          {completed} ({pct}%)
        </span>
      </div>
      {parentNames.length > 0 && (
        <>
          <div className="np-divider my-2" />
          <div className="np-mono text-[9px] tracking-[0.2em] uppercase text-[var(--color-fg-3)] mb-1">
            unlocked by
          </div>
          <div className="np-mono text-[10.5px] text-[var(--color-fg-2)] leading-tight">
            {parentNames.join("  ·  ")}
          </div>
        </>
      )}
      <div className="mt-2 np-mono text-[10px] tracking-widest text-[var(--color-fg-3)]">
        click to enter
      </div>
    </motion.div>
  );
}
