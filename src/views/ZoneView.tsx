/**
 * ZoneView — node graph for a single zone, rendered with @xyflow/react.
 *
 * Top-level nodes are arranged in a force-friendly grid; sub-nodes orbit
 * their parent. Clicking a node opens the side panel.
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
// Layout: top-level nodes in a grid, sub-nodes orbiting their parent.
// ---------------------------------------------------------------------------
function layoutNodes(rows: NodeRow[]): Node[] {
  const tops = rows.filter((r) => !r.parent_id);
  const subs = rows.filter((r) => r.parent_id);

  const cols = Math.max(3, Math.ceil(Math.sqrt(tops.length)));
  const dx = 260;
  const dy = 200;

  const nodes: Node[] = [];

  // Top-level grid
  tops.forEach((row, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    nodes.push({
      id: row.id,
      type: "skill",
      position: { x: c * dx, y: r * dy },
      data: { row, isSub: false },
    });
  });

  // Sub-nodes orbit
  const subsByParent = new Map<string, NodeRow[]>();
  for (const s of subs) {
    if (!s.parent_id) continue;
    const arr = subsByParent.get(s.parent_id) ?? [];
    arr.push(s);
    subsByParent.set(s.parent_id, arr);
  }

  for (const [parentId, kids] of subsByParent) {
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent) continue;
    const radius = 130;
    const startAngle = -Math.PI / 2;
    kids.forEach((k, i) => {
      const angle = startAngle + (i * (Math.PI * 2)) / Math.max(kids.length, 5);
      nodes.push({
        id: k.id,
        type: "skill",
        position: {
          x: parent.position.x + Math.cos(angle) * radius,
          y: parent.position.y + Math.sin(angle) * radius,
        },
        data: { row: k, isSub: true },
      });
    });
  }

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
  complete: "#0e2a14",
};

function SkillNode({ data, selected }: NodeProps) {
  const row = (data as any).row as NodeRow;
  const isSub = (data as any).isSub as boolean;
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
        <span
          className="np-screen text-[10px] tracking-[0.15em]"
          style={{ color: borderColor }}
        >
          {row.id}
        </span>
        {row.owasp_tag && (
          <span className="np-screen text-[9px] text-[var(--color-fg-3)] tracking-wider">
            {row.owasp_tag}
          </span>
        )}
        {isComplete && <span className="ml-auto np-display text-[10px] text-[var(--color-lime)]">✓</span>}
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
  const [trailMode, setTrailMode] = useState(false);

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
      hidden: ((n.data as any).row as NodeRow).status !== filter,
    }));
  }, [nodes, filter]);

  // Trail mode: highlight a heuristic recommended path through nodes that
  // are currently `available` and have `intro` or `std` depth.
  const trailEdges = useMemo<Edge[]>(() => {
    if (!trailMode) return edges;
    const tops = rows.filter((r) => !r.parent_id && r.status !== "complete");
    const trail: Edge[] = [];
    for (let i = 0; i < tops.length - 1; i++) {
      trail.push({
        id: `trail-${tops[i].id}-${tops[i + 1].id}`,
        source: tops[i].id,
        target: tops[i + 1].id,
        type: "straight",
        animated: true,
        style: { stroke: "#a3e635", strokeWidth: 2 },
      });
    }
    return [...edges, ...trail];
  }, [trailMode, edges, rows]);

  const onNodeClick = useCallback(
    (_e: any, n: Node) => {
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
              const row = (n.data as any).row as NodeRow;
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

function FilterButtons({
  value,
  onChange,
}: {
  value: "all" | "available" | "in_progress" | "complete";
  onChange: (v: any) => void;
}) {
  const items: Array<{ id: any; label: string }> = [
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
