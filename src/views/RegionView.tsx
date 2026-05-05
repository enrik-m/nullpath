/**
 * RegionView — the constellation map for a single region.
 *
 * Renders zones as nodes on a pannable/zoomable SVG canvas, drawn at the
 * coordinates seeded by the build-seed.mjs layout table. Each star pulses
 * when in-progress, glows lime when complete, and on hover reveals a panel
 * with name + progress + node counts.
 *
 * No graph library — a hand-rolled SVG plus a small pan/zoom hook. We control
 * the styling end-to-end and the perf cost is trivial for ~25 zones.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import * as db from "../db";
import type { ZoneRow, ZoneStats, RegionRow } from "../db/types";
import { useUi } from "../store";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/cn";

interface RegionViewProps {
  regionId: string;
}

interface ZoneNode {
  zone: ZoneRow;
  stats: ZoneStats | null;
}

const VIEWPORT_W = 1800; // logical map width
const VIEWPORT_H = 1600;
const STAR_RADIUS = 38;

export function RegionView({ regionId }: RegionViewProps) {
  const go = useUi((s) => s.go);
  const [region, setRegion] = useState<RegionRow | null>(null);
  const [zones, setZones] = useState<ZoneNode[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Pan/zoom state for the SVG viewBox
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null,
  );
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

  // Build edges: connect zones within the same row/column visually for atlas feel
  const edges = useMemo(() => {
    if (zones.length === 0) return [];
    // Hand-curated connection lines for the layout — keeps the constellation
    // readable instead of a fully connected graph.
    const groups: string[][] = [
      ["Z01", "Z03", "Z06", "Z14", "Z15", "Z16"], // left spine
      ["Z02", "Z05", "Z10", "Z13", "Z19"], // right spine
      ["Z01", "Z04", "Z02"], // top web
      ["Z03", "Z04", "Z05"], // top web inner
      ["Z06", "Z07", "Z08", "Z09", "Z10"], // mid arc
      ["Z07", "Z11", "Z12"], // central column
      ["Z11", "Z16", "Z20"], // left descent
      ["Z12", "Z17", "Z21"], // central descent
      ["Z13", "Z18", "Z19"], // right descent
      ["Z22", "Z01"], // methodology link
      ["Z23", "Z02"], // capstones link
      ["Z14", "Z16"], // source review to cloud
      ["Z15", "Z14"], // supply chain to source review
      ["Z21", "Z19"], // defenses to modern browser
      ["Z20", "Z21"], // ai to defenses
      ["Z17", "Z18"], // waf to frontend
    ];
    const lines: { from: string; to: string }[] = [];
    for (const g of groups) {
      for (let i = 0; i < g.length - 1; i++) {
        lines.push({ from: g[i], to: g[i + 1] });
      }
    }
    return lines;
  }, [zones]);

  // Map zone id to coords
  const zoneById = useMemo(() => {
    const m = new Map<string, ZoneNode>();
    for (const z of zones) m.set(z.zone.id, z);
    return m;
  }, [zones]);

  // Pan handlers
  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-zone-star]")) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }
  function onMouseMove(e: React.MouseEvent) {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) });
  }
  function onMouseUp() {
    dragRef.current = null;
  }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const next = Math.max(0.4, Math.min(2.5, zoom * (1 + (e.deltaY < 0 ? 0.08 : -0.08))));
    setZoom(next);
  }

  // Recenter on load
  useEffect(() => {
    if (!containerRef.current) return;
    setPan({ x: containerRef.current.clientWidth / 2, y: containerRef.current.clientHeight / 2 });
  }, [zones]);

  if (loading || !region) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="np-mono text-[var(--color-fg-2)] text-xs tracking-[0.3em]">
          loading constellation...
        </div>
      </div>
    );
  }

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
            style={{ color: region.color_accent }}
          >
            {region.name}
          </div>
          <div className="text-[var(--color-fg-2)] text-[12px] mt-1 max-w-md">
            {region.tagline}
          </div>
        </div>
        <div className="np-mono text-[10px] tracking-[0.2em] text-[var(--color-fg-3)] uppercase">
          drag to pan · scroll to zoom
        </div>
      </div>

      {/* Map */}
      <div
        ref={containerRef}
        className="flex-1 cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        <svg
          width="100%"
          height="100%"
          style={{ display: "block" }}
          viewBox={`${-VIEWPORT_W / 2} ${-VIEWPORT_H / 2} ${VIEWPORT_W} ${VIEWPORT_H}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <radialGradient id="star-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={region.color_accent} stopOpacity="0.5" />
              <stop offset="60%" stopColor={region.color_accent} stopOpacity="0.05" />
              <stop offset="100%" stopColor={region.color_accent} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="star-glow-complete" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-lime)" stopOpacity="0.5" />
              <stop offset="60%" stopColor="var(--color-lime)" stopOpacity="0.05" />
              <stop offset="100%" stopColor="var(--color-lime)" stopOpacity="0" />
            </radialGradient>
          </defs>

          <g
            transform={`translate(${pan.x - (containerRef.current?.clientWidth ?? 0) / 2} ${pan.y - (containerRef.current?.clientHeight ?? 0) / 2}) scale(${zoom})`}
          >
            {/* Edges */}
            {edges.map((e, i) => {
              const a = zoneById.get(e.from);
              const b = zoneById.get(e.to);
              if (!a || !b || a.zone.cx == null || b.zone.cx == null) return null;
              return (
                <line
                  key={i}
                  x1={a.zone.cx}
                  y1={a.zone.cy ?? 0}
                  x2={b.zone.cx}
                  y2={b.zone.cy ?? 0}
                  stroke="var(--color-border-subtle)"
                  strokeWidth={1.5}
                  strokeDasharray="3 6"
                  opacity={0.6}
                />
              );
            })}

            {/* Zone stars */}
            {zones.map((z) => (
              <ZoneStar
                key={z.zone.id}
                zone={z}
                accent={region.color_accent}
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
          zone={zoneById.get(hovered)!}
          accent={region.color_accent}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Star + tooltip components
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
      : "var(--color-fg-3)";

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
        r={STAR_RADIUS * 2.2}
        fill={isComplete ? "url(#star-glow-complete)" : "url(#star-glow)"}
        opacity={hovered ? 1 : 0.6}
      />
      {/* Outer ring (progress) */}
      <circle
        r={STAR_RADIUS}
        fill="none"
        stroke="var(--color-border-default)"
        strokeWidth={2}
      />
      <circle
        r={STAR_RADIUS}
        fill="none"
        stroke={fillColor}
        strokeWidth={2.5}
        strokeDasharray={`${pct * (2 * Math.PI * STAR_RADIUS)} ${(1 - pct) * (2 * Math.PI * STAR_RADIUS)}`}
        transform={`rotate(-90)`}
      />
      {/* Inner star */}
      <circle
        r={STAR_RADIUS * 0.55}
        fill="var(--color-bg-1)"
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
        y={STAR_RADIUS + 18}
        fontFamily="var(--font-sans)"
        fontSize={11}
        fontWeight={500}
        fill="var(--color-fg-1)"
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
      <div className={cn("mt-2 np-mono text-[10px] tracking-widest", "text-[var(--color-fg-3)]")}>
        click to enter
      </div>
    </motion.div>
  );
}
