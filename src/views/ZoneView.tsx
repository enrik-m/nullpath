/**
 * ZoneView — node graph for a single zone, rendered with @xyflow/react.
 *
 * Layout flows TOP-TO-BOTTOM within columns. Each top-level subtree
 * (parent + its kid block) is placed in a column-major grid: column 0
 * fills downward from y=0, then column 1, etc. The reading order is
 * vertical-first, which reads more like a list / table-of-contents
 * than a left-to-right grid.
 *
 * Column count is adaptive to the zone's top-level density: tight
 * zones (≤6 parents) collapse to a single vertical stack, big zones
 * (40+) widen to 4 columns. Per-column widths and per-cell heights
 * are sized to their footprints, so by construction no two nodes
 * can overlap regardless of fan-out — see `layoutNodes()` below.
 *
 * Clicking a node opens the side panel.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import * as db from "../db";
import type { NodeRow, RegionRow, ZoneRow, NodeDepth, NodeStatus } from "../db/types";
import { useUi } from "../store";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/cn";
import { NodePanel } from "../components/NodePanel";

interface ZoneViewProps {
  zoneId: string;
}

// ---------------------------------------------------------------------------
// Layout: footprint-aware tree. Each top-level node is allocated
// horizontal space equal to its widest "kid block"; children sit in a
// horizontal row directly below the parent (wrapping into multiple rows
// when the kid count exceeds MAX_KIDS_PER_ROW). Top-level nodes are
// arranged in a √N-ish grid, but column widths and row heights expand
// independently to accommodate each cell's footprint — so a parent
// with 15 kids never bleeds into the neighboring column.
//
// Replaces an earlier "orbit at radius 130" layout that broke once
// any parent had more than ~5 children, since the orbit ring
// (260px diameter) overlapped both the next column (260px parent
// spacing) and the next row (200px parent spacing).
//
// Card dimensions match SkillNode's CSS:
//   top-level: ~210w × ~95h with name + gloss + id row
//   sub:       ~150w × ~60h with name + id row
//
// All overlap is provably impossible: by construction,
//   colW[c] = max(TOP_W, max kid-block-width across cells in column c)
//   rowH[r] = max footprint height across cells in row r
// so a parent's kids fit within its cell, and adjacent cells are
// separated by COL_GAP / ROW_GAP.
// ---------------------------------------------------------------------------

const TOP_W = 220;
const TOP_H = 100;
const SUB_W = 160;
const SUB_H = 72;
const KIDS_GAP_X = 16;
const KIDS_GAP_Y = 16;
const PARENT_TO_KIDS_GAP = 44;
const COL_GAP = 56;
const ROW_GAP = 72;
const MAX_KIDS_PER_ROW = 6;

interface ParentFootprint {
  /** Bounding-box width of the parent + its kid block (whichever wider). */
  width: number;
  /** Bounding-box height including the gap to kids and any kid rows. */
  height: number;
  /** How many kids per row (capped at MAX_KIDS_PER_ROW). */
  kidsPerRow: number;
  /** How many kid rows (0 if no kids). */
  kidRows: number;
}

/**
 * Pick a column count that keeps total height reasonable without
 * sprawling the graph horizontally. Each column fills top-to-bottom
 * before the next one starts, so the user reads vertically first.
 *
 * Tuned to the seed's distribution: most zones have 4–10 top-level
 * parents (1–2 cols), Z01 Foundations Plateau has 43 leaves (3 cols
 * keeps it ~14 nodes tall per column).
 */
function pickColumnCount(topsCount: number): number {
  if (topsCount <= 6) return 1;
  if (topsCount <= 16) return 2;
  if (topsCount <= 30) return 3;
  return 4;
}

function layoutNodes(rows: NodeRow[]): Node[] {
  const tops = rows.filter((r) => !r.parent_id);

  // Bucket subs by parent_id, preserving sort_order via the input order.
  const subsByParent = new Map<string, NodeRow[]>();
  for (const r of rows) {
    if (!r.parent_id) continue;
    const arr = subsByParent.get(r.parent_id) ?? [];
    arr.push(r);
    subsByParent.set(r.parent_id, arr);
  }

  // Phase 1: footprints (per-parent bounding box including kid block).
  const footprints = new Map<string, ParentFootprint>();
  for (const top of tops) {
    const kids = subsByParent.get(top.id) ?? [];
    const kidsPerRow = Math.min(kids.length, MAX_KIDS_PER_ROW);
    const kidRows = kids.length === 0 ? 0 : Math.ceil(kids.length / MAX_KIDS_PER_ROW);
    const kidsBlockW = kidsPerRow === 0 ? 0 : kidsPerRow * SUB_W + (kidsPerRow - 1) * KIDS_GAP_X;
    const kidsBlockH = kidRows === 0 ? 0 : kidRows * SUB_H + (kidRows - 1) * KIDS_GAP_Y;
    const width = Math.max(TOP_W, kidsBlockW);
    const height = TOP_H + (kidRows === 0 ? 0 : PARENT_TO_KIDS_GAP + kidsBlockH);
    footprints.set(top.id, { width, height, kidsPerRow, kidRows });
  }

  // Phase 2: column-major fill.
  // - Reading order: top-to-bottom within column 0, then top-to-bottom
  //   within column 1, etc. The eye flows down naturally; reaching the
  //   bottom of a column means "next subtree group" rather than "back
  //   up to the top".
  // - Per-column width = max footprint width in that column (so the
  //   widest parent's kid block fits without bleeding into the next).
  // - Each cell's height = its parent's footprint height (NOT a
  //   uniform row height like the row-major grid had — different
  //   columns can have different per-cell heights, and parents stack
  //   vertically using their own footprints, not a shared row max).
  const cols = pickColumnCount(tops.length);
  const rowsPerCol = Math.ceil(tops.length / cols);

  const colW = new Array<number>(cols).fill(TOP_W);
  // cellH[c] is an array of per-cell heights down column c.
  const cellH: number[][] = Array.from({ length: cols }, () => []);

  tops.forEach((top, i) => {
    const c = Math.floor(i / rowsPerCol);
    const r = i % rowsPerCol;
    const fp = footprints.get(top.id);
    if (!fp) return;
    if (fp.width > colW[c]!) colW[c] = fp.width;
    cellH[c]![r] = fp.height;
  });

  // Cumulative x for each column.
  const colX: number[] = [];
  let xAcc = 0;
  for (let c = 0; c < cols; c++) {
    colX.push(xAcc);
    xAcc += colW[c]! + COL_GAP;
  }

  // Cumulative y per (column, cell) — each column has its own
  // top-to-bottom flow, independent of other columns' heights.
  const cellY: number[][] = Array.from({ length: cols }, () => []);
  for (let c = 0; c < cols; c++) {
    let yAcc = 0;
    for (let r = 0; r < cellH[c]!.length; r++) {
      cellY[c]![r] = yAcc;
      yAcc += cellH[c]![r]! + ROW_GAP;
    }
  }

  // Phase 3: place every parent + its kids.
  const nodes: Node[] = [];
  tops.forEach((top, i) => {
    const c = Math.floor(i / rowsPerCol);
    const r = i % rowsPerCol;
    const fp = footprints.get(top.id);
    if (!fp) return;
    const cellLeft = colX[c]!;
    const cellTop = cellY[c]![r]!;
    const cellCenterX = cellLeft + colW[c]! / 2;
    const parentX = cellCenterX - TOP_W / 2;

    nodes.push({
      id: top.id,
      type: "skill",
      position: { x: parentX, y: cellTop },
      data: { row: top, isSub: false },
    });

    const kids = subsByParent.get(top.id) ?? [];
    if (kids.length === 0) return;

    const kidsBlockW = fp.kidsPerRow * SUB_W + (fp.kidsPerRow - 1) * KIDS_GAP_X;
    const kidsLeft = cellCenterX - kidsBlockW / 2;
    const kidsTop = cellTop + TOP_H + PARENT_TO_KIDS_GAP;

    kids.forEach((k, j) => {
      const kc = j % fp.kidsPerRow;
      const kr = Math.floor(j / fp.kidsPerRow);
      nodes.push({
        id: k.id,
        type: "skill",
        position: {
          x: kidsLeft + kc * (SUB_W + KIDS_GAP_X),
          y: kidsTop + kr * (SUB_H + KIDS_GAP_Y),
        },
        data: { row: k, isSub: true },
      });
    });
  });

  return nodes;
}

function buildEdges(rows: NodeRow[]): Edge[] {
  const edges: Edge[] = [];
  for (const r of rows) {
    if (r.parent_id) {
      edges.push({
        id: `${r.parent_id}->${r.id}`,
        source: r.parent_id,
        target: r.id,
        type: "straight",
        animated: false,
        style: {
          stroke: "var(--color-border-default)",
          strokeWidth: 1.5,
          strokeDasharray: "3 4",
        },
      });
    }
  }
  return edges;
}

// ---------------------------------------------------------------------------
// Custom node renderer — chunky pixel card
// ---------------------------------------------------------------------------
const DEPTH_RING: Record<NodeDepth, string> = {
  intro: "#7280b0",
  std: "#5cf2ff",
  adv: "#ff66e0",
  res: "#ff5c7a",
};

const STATUS_FILL: Record<NodeStatus, string> = {
  available: "#161b3a",
  in_progress: "#0d2840",
  // Distinctly green — was #0e2a14, too close in luminance to the
  // available navy fill #161b3a, so completed nodes blended in with
  // the rest of the grid. New value reads obviously green at a glance.
  complete: "#1f4d28",
};

interface SkillNodeData {
  row: NodeRow;
  isSub: boolean;
}

function SkillNode({ data, selected }: NodeProps) {
  const { row, isSub } = data as unknown as SkillNodeData;
  const ring = DEPTH_RING[row.depth];
  const fill = STATUS_FILL[row.status];

  const isComplete = row.status === "complete";
  const isInProgress = row.status === "in_progress";
  const borderColor = isComplete ? "#a8ff5c" : isInProgress ? "#5cf2ff" : ring;

  return (
    <div
      className={cn(
        "relative",
        isSub ? "min-w-[120px] max-w-[150px] px-2 py-1.5" : "min-w-[190px] max-w-[210px] px-3 py-2",
      )}
      style={{
        background: fill,
        border: `2px solid ${borderColor}`,
        boxShadow: `
          inset 2px 2px 0 0 ${borderColor}66,
          inset -2px -2px 0 0 #00000088,
          0 3px 0 0 #0a0d1f
          ${selected ? `, 0 0 0 2px var(--color-cyan), 0 0 12px var(--color-cyan-glow)` : ""}
          ${isComplete ? `, 0 0 12px ${borderColor}55` : ""}
          ${isInProgress ? `, 0 0 12px ${borderColor}55` : ""}
        `,
        imageRendering: "pixelated",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <div className="flex items-center gap-1.5">
        <span className="np-screen text-[10px] tracking-[0.15em]" style={{ color: borderColor }}>
          {row.id}
        </span>
        {row.owasp_tag && (
          <span className="np-screen text-[9px] text-[var(--color-fg-3)] tracking-wider">
            {row.owasp_tag}
          </span>
        )}
        {isComplete && (
          // Chunky DONE chip — the small ✓ in the previous build was easy
          // to miss against a busy graph. The pill makes "this node is
          // complete" unmistakable at a glance, with the checkmark
          // doubled-up for anyone who's pattern-matching on glyphs.
          <span
            className="ml-auto np-screen text-[9px] tracking-[0.15em] px-1.5 py-0.5 leading-none"
            style={{
              background: "var(--color-lime)",
              color: "#0a1f0a",
              borderRadius: 0,
              boxShadow: "0 0 8px var(--color-lime-glow)",
            }}
          >
            ✓ DONE
          </span>
        )}
        {isInProgress && <span className="ml-auto w-2 h-2 bg-[var(--color-cyan)] np-pulse" />}
      </div>
      <div
        className={cn(
          "leading-tight font-semibold mt-1",
          isSub ? "text-[12px]" : "text-[13px]",
          isComplete ? "text-[var(--color-lime)]" : "text-[var(--color-fg-0)]",
        )}
      >
        {row.name}
      </div>
      {!isSub && row.gloss && (
        <div className="text-[10px] text-[var(--color-fg-2)] mt-1 line-clamp-2 leading-tight">
          {row.gloss}
        </div>
      )}
    </div>
  );
}

const NODE_TYPES = { skill: SkillNode };

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export function ZoneView({ zoneId }: ZoneViewProps) {
  const selectNode = useUi((s) => s.selectNode);
  const selectedNodeId = useUi((s) => s.selectedNodeId);
  const [zone, setZone] = useState<ZoneRow | null>(null);
  const [region, setRegion] = useState<RegionRow | null>(null);
  const [rows, setRows] = useState<NodeRow[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [filter, setFilter] = useState<"all" | "available" | "in_progress" | "complete">("all");
  // Trail mode (heuristic suggested-path overlay) is on by default —
  // new visitors see the suggested progression edges immediately
  // instead of having to discover the toggle. Users who want a
  // distraction-free graph can flip it off via the TRAIL button.
  const [trailMode, setTrailMode] = useState(true);

  // Load zone + nodes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const z = await db.getZone(zoneId);
      const r = z ? await db.getRegion(z.region_id) : null;
      const ns = await db.getNodesForZone(zoneId);
      if (cancelled) return;
      setZone(z);
      setRegion(r);
      setRows(ns);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [zoneId]);

  // Recompute layout whenever rows change
  useEffect(() => {
    setNodes(layoutNodes(rows));
    setEdges(buildEdges(rows));
  }, [rows, setNodes, setEdges]);

  const filteredNodes = useMemo(() => {
    if (filter === "all") return nodes;
    return nodes.map((n) => ({
      ...n,
      hidden: (n.data as unknown as SkillNodeData).row.status !== filter,
    }));
  }, [nodes, filter]);

  // Trail mode: highlight a heuristic recommended path through nodes that
  // are currently `available` and have `intro` or `std` depth.
  const trailEdges = useMemo<Edge[]>(() => {
    if (!trailMode) return edges;
    const tops = rows.filter((r) => !r.parent_id && r.status !== "complete");
    const trail: Edge[] = [];
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i];
      const b = tops[i + 1];
      if (!a || !b) continue;
      trail.push({
        id: `trail-${a.id}-${b.id}`,
        source: a.id,
        target: b.id,
        type: "straight",
        animated: true,
        style: { stroke: "#a3e635", strokeWidth: 2 },
      });
    }
    return [...edges, ...trail];
  }, [trailMode, edges, rows]);

  const onNodeClick = useCallback(
    (_e: React.MouseEvent, n: Node) => {
      sfx.click();
      selectNode(n.id);
    },
    [selectNode],
  );

  // Reload selected node row when panel acts on it
  async function refresh() {
    const ns = await db.getNodesForZone(zoneId);
    setRows(ns);
  }

  if (!zone) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="np-mono text-[var(--color-fg-2)] text-xs tracking-[0.3em]">
          loading zone...
        </div>
      </div>
    );
  }

  const accent = region?.color_accent ?? "#22d3ee";

  return (
    <div className="flex-1 flex min-h-0 relative">
      {/* Graph */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={filteredNodes}
          edges={trailEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1.4, minZoom: 0.4 }}
          minZoom={0.25}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          style={{ background: "transparent" }}
        >
          <Background color="#2a3358" gap={32} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => {
              const { row } = n.data as unknown as SkillNodeData;
              if (row.status === "complete") return "#a8ff5c";
              if (row.status === "in_progress") return "#5cf2ff";
              return "#3a4480";
            }}
            maskColor="rgba(7, 9, 26, 0.85)"
          />
        </ReactFlow>

        {/* Floating header */}
        <div className="absolute top-4 left-4 right-4 flex items-start justify-between pointer-events-none">
          <div className="pointer-events-auto np-pixel px-4 py-2" style={{ borderColor: accent }}>
            <div className="np-screen text-[10px] tracking-[0.3em] text-[var(--color-fg-3)]">
              // ZONE · {zone.id}
            </div>
            <div className="np-display text-base mt-1" style={{ color: accent }}>
              {zone.name.toUpperCase()}
            </div>
            <div className="np-mono text-[13px] text-[var(--color-fg-2)] mt-1">
              {rows.length} NODES · {rows.filter((r) => r.status === "complete").length} DONE
            </div>
          </div>
          <div className="flex items-center gap-2 pointer-events-auto">
            <FilterButtons value={filter} onChange={setFilter} />
            <button
              onClick={() => {
                sfx.click();
                setTrailMode((v) => !v);
              }}
              className={cn(
                "np-screen text-[10px] tracking-[0.2em] uppercase px-3 py-2 border-2 transition",
                trailMode
                  ? "bg-[var(--color-lime)] text-[var(--color-bg-0)] border-[var(--color-lime)]"
                  : "text-[var(--color-fg-2)] border-[var(--color-border-default)] bg-[var(--color-bg-2)] hover:text-[var(--color-lime)] hover:border-[var(--color-lime-dim)]",
              )}
            >
              TRAIL
            </button>
          </div>
        </div>
      </div>

      {/* Side panel */}
      {selectedNodeId && (
        <NodePanel
          nodeId={selectedNodeId}
          accent={accent}
          onClose={() => selectNode(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

type FilterValue = "all" | "available" | "in_progress" | "complete";

function FilterButtons({
  value,
  onChange,
}: {
  value: FilterValue;
  onChange: (v: FilterValue) => void;
}) {
  const items: Array<{ id: FilterValue; label: string }> = [
    { id: "all", label: "All" },
    { id: "available", label: "Open" },
    { id: "in_progress", label: "Active" },
    { id: "complete", label: "Done" },
  ];
  return (
    <div className="np-screen text-[10px] flex border-2 border-[var(--color-border-default)] bg-[var(--color-bg-2)]">
      {items.map((it, i) => (
        <button
          key={it.id}
          onClick={() => {
            sfx.click();
            onChange(it.id);
          }}
          className={cn(
            "px-3 py-2 tracking-[0.2em] uppercase transition",
            i > 0 && "border-l-2 border-[var(--color-border-default)]",
            value === it.id
              ? "bg-[var(--color-cyan-deep)] text-[var(--color-cyan)]"
              : "text-[var(--color-fg-2)] hover:text-[var(--color-fg-0)] hover:bg-[var(--color-bg-3)]",
          )}
        >
          {it.label.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
