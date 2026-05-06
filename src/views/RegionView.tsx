/**
 * RegionView — the constellation map for a single region.
 *
 * Renders the 23 zones as stars on a single connected serpentine path —
 * the natural progression order, top to bottom. Pan/zoom is hand-rolled
 * because we want the dragging to feel right and not fight react-flow's
 * graph semantics here.
 *
 * Pan model: a `<g>` transform that translates+scales world coords. The SVG
 * has no viewBox, so 1 SVG unit = 1 screen pixel. World coords are in the
 * `<g>`. To pan we add screen-pixel deltas to view.x / view.y. To zoom we
 * scale the `<g>` and adjust translation so the cursor's world point stays
 * fixed.
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

interface View {
  x: number;
  y: number;
  scale: number;
}

const DEFAULT_VIEW: View = { x: 0, y: 0, scale: 1 };
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.5;

export function RegionView({ regionId }: RegionViewProps) {
  const go = useUi((s) => s.go);
  const [region, setRegion] = useState<RegionRow | null>(null);
  const [zones, setZones] = useState<ZoneNode[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<View>(DEFAULT_VIEW);
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

  // Center the path on first paint and on container resize.
  useLayoutEffect(() => {
    if (!containerRef.current || zones.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Compute world bounds from zone coords
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const z of zones) {
      const x = z.zone.cx ?? 0;
      const y = z.zone.cy ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const worldW = maxX - minX + 200; // padding for star radius + name labels
    const worldH = maxY - minY + 240;
    const fitScale = Math.min(rect.width / worldW, rect.height / worldH, 1);

    const worldCx = (minX + maxX) / 2;
    const worldCy = (minY + maxY) / 2;

    setView({
      scale: fitScale,
      x: rect.width / 2 - worldCx * fitScale,
      y: rect.height / 2 - worldCy * fitScale,
    });
  }, [zones]);

  // ---------------------------------------------------------------------
  // Sequential edges: connect each zone to the next by sort_order.
  // This produces the serpentine path from Z01 → Z23.
  // ---------------------------------------------------------------------
  const edgePath = useMemo(() => {
    if (zones.length < 2) return "";
    const ordered = [...zones].sort((a, b) => a.zone.sort_order - b.zone.sort_order);
    const points = ordered.map((z) => ({ x: z.zone.cx ?? 0, y: z.zone.cy ?? 0 }));

    // Build a smooth path: straight horizontal segments along rows,
    // gentle quadratic curves around row corners.
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const sameRow = Math.abs(prev.y - cur.y) < 1;
      if (sameRow) {
        d += ` L ${cur.x} ${cur.y}`;
      } else {
        // Vertical drop between rows — round the corner using a quadratic
        // curve via the midpoint to give a "river bend" feel.
        const mx = (prev.x + cur.x) / 2;
        const my = (prev.y + cur.y) / 2;
        d += ` Q ${prev.x} ${my} ${mx} ${my}`;
        d += ` Q ${cur.x} ${my} ${cur.x} ${cur.y}`;
      }
    }
    return d;
  }, [zones]);

  // ---------------------------------------------------------------------
  // Pan / zoom
  // ---------------------------------------------------------------------
  function onMouseDown(e: React.MouseEvent) {
    // Don't start panning on a star or a button
    if ((e.target as HTMLElement).closest("[data-zone-star]")) return;
    if (e.button !== 0) return;
    dragRef.current = {
      x0: e.clientX,
      y0: e.clientY,
      vx0: view.x,
      vy0: view.y,
    };
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

  // Bind drag listeners to window so dragging continues even if the cursor
  // briefly leaves the SVG. Bug source #1 in the previous version: drag
  // state was lost on element-leave.
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
      // Keep the world point under the cursor anchored
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
              if (!containerRef.current || zones.length === 0) return;
              const rect = containerRef.current.getBoundingClientRect();
              let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
              for (const z of zones) {
                minX = Math.min(minX, z.zone.cx ?? 0);
                maxX = Math.max(maxX, z.zone.cx ?? 0);
                minY = Math.min(minY, z.zone.cy ?? 0);
                maxY = Math.max(maxY, z.zone.cy ?? 0);
              }
              const worldW = maxX - minX + 200;
              const worldH = maxY - minY + 240;
              const fitScale = Math.min(rect.width / worldW, rect.height / worldH, 1);
              const worldCx = (minX + maxX) / 2;
              const worldCy = (minY + maxY) / 2;
              setView({
                scale: fitScale,
                x: rect.width / 2 - worldCx * fitScale,
                y: rect.height / 2 - worldCy * fitScale,
              });
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
        <svg
          width="100%"
          height="100%"
          style={{ display: "block" }}
        >
          <defs>
            <radialGradient id="star-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
              <stop offset="60%" stopColor={accent} stopOpacity="0.05" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="star-glow-complete" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-lime)" stopOpacity="0.55" />
              <stop offset="60%" stopColor="var(--color-lime)" stopOpacity="0.05" />
              <stop offset="100%" stopColor="var(--color-lime)" stopOpacity="0" />
            </radialGradient>
            {/* Animated gradient along the path for the "live" trail effect */}
            <linearGradient id="path-flow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={accent} stopOpacity="0.05" />
              <stop offset="50%" stopColor={accent} stopOpacity="0.7" />
              <stop offset="100%" stopColor={accent} stopOpacity="0.05" />
              <animate
                attributeName="x1"
                from="-1"
                to="1"
                dur="8s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="x2"
                from="0"
                to="2"
                dur="8s"
                repeatCount="indefinite"
              />
            </linearGradient>
          </defs>

          <g
            transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
            style={{ transformOrigin: "0 0" }}
          >
            {/* The path — drawn behind the stars */}
            {edgePath && (
              <>
                {/* Outer glow */}
                <path
                  d={edgePath}
                  fill="none"
                  stroke={accent}
                  strokeOpacity={0.18}
                  strokeWidth={14 / view.scale}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Base path */}
                <path
                  d={edgePath}
                  fill="none"
                  stroke="var(--color-border-default)"
                  strokeWidth={2.5 / view.scale}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Animated flow */}
                <path
                  d={edgePath}
                  fill="none"
                  stroke="url(#path-flow)"
                  strokeWidth={3.5 / view.scale}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

            {/* Zone stars */}
            {zones.map((z) => (
              <ZoneStar
                key={z.zone.id}
                zone={z}
                accent={accent}
                hovered={hovered === z.zone.id}
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
          zone={zones.find((z) => z.zone.id === hovered)!}
          accent={accent}
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
  onHover,
  onSelect,
}: {
  zone: ZoneNode;
  accent: string;
  hovered: boolean;
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
      : "var(--color-fg-2)";

  const circumference = 2 * Math.PI * STAR_RADIUS;

  return (
    <g
      data-zone-star
      transform={`translate(${cx} ${cy})`}
      style={{ cursor: "pointer" }}
      onMouseEnter={() => onHover(zone.zone.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onSelect}
    >
      {/* Glow halo */}
      <circle
        r={STAR_RADIUS * (hovered ? 2.4 : 2.0)}
        fill={isComplete ? "url(#star-glow-complete)" : "url(#star-glow)"}
        opacity={hovered ? 1 : 0.7}
        style={{ transition: "opacity 200ms, r 200ms" }}
      />
      {/* Outer ring (background) */}
      <circle
        r={STAR_RADIUS}
        fill="var(--color-bg-1)"
        stroke="var(--color-border-default)"
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
        fill={hovered ? "var(--color-fg-0)" : "var(--color-fg-1)"}
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
}: {
  zone: ZoneNode;
  accent: string;
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
      className="absolute right-6 bottom-6 np-glass rounded-md p-4 max-w-[280px] pointer-events-none"
      style={{ borderColor: accent + "55" }}
    >
      <div className="np-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: accent }}>
        {zone.zone.id}
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
      <div className="mt-2 np-mono text-[10px] tracking-widest text-[var(--color-fg-3)]">
        click to enter
      </div>
    </motion.div>
  );
}
