/**
 * CodexView — global archive of every resource attached anywhere in the
 * skill graph. Filterable by kind, sortable, openable.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Pin, PinOff, Trash2 } from "lucide-react";
import * as db from "../db";
import type { NodeResourceRow, ResourceKind } from "../db/types";
import { useUi } from "../store";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/cn";
import {
  RESOURCE_KIND_LABEL as KIND_LABEL,
  RESOURCE_KIND_COLOR as KIND_COLOR,
  RESOURCE_KINDS as ALL_KINDS,
} from "../lib/resourceKinds";
import { openSafeUrl } from "../lib/url";
import { toast } from "../lib/toast";
import { MaybeVirtualList } from "../components/VirtualList";

/**
 * Each resource row is rendered at this fixed pixel height. Used by the
 * virtualizer to compute scrollable extent — must match the actual
 * rendered height (np-pixel padding + content + a slot of vertical
 * gap). If the row layout changes, update this constant.
 */
const ROW_HEIGHT = 96;
/**
 * Below this many filtered items we render a plain column (no
 * virtualization overhead). Above it we hand off to react-window.
 */
const VIRT_THRESHOLD = 100;
/**
 * Pixel height of the scrollable region the virtual list mounts in.
 * Page is overflow-auto so this is just the inner viewport budget.
 */
const VIRT_VIEWPORT = 720;

interface ResourceWithNode extends NodeResourceRow {
  node_name: string;
  node_zone: string;
}

export function CodexView() {
  const go = useUi((s) => s.go);
  const selectNode = useUi((s) => s.selectNode);
  const [items, setItems] = useState<ResourceWithNode[]>([]);
  const [filter, setFilter] = useState<ResourceKind | "all">("all");
  const [q, setQ] = useState("");

  async function reload() {
    const all = await db.getAllResources();
    // Hydrate node names. Use the public getAllNodes() helper rather than
    // raw SQL so this works in both backends — cloud mode's table is
    // `node_def` (not `node`) and is read-only via PostgREST.
    const allNodes = await db.getAllNodes();
    const nodes = allNodes.map((n) => ({ id: n.id, name: n.name, zone_id: n.zone_id }));
    const map = new Map(nodes.map((n) => [n.id, n]));
    const enriched = all.map((r) => {
      const n = map.get(r.node_id);
      return { ...r, node_name: n?.name ?? r.node_id, node_zone: n?.zone_id ?? "" };
    });
    setItems(enriched);
  }

  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    let out = items;
    if (filter !== "all") out = out.filter((r) => r.kind === filter);
    if (q.trim()) {
      const lq = q.toLowerCase();
      out = out.filter(
        (r) =>
          r.title.toLowerCase().includes(lq) ||
          r.url?.toLowerCase().includes(lq) ||
          r.note?.toLowerCase().includes(lq) ||
          r.node_name.toLowerCase().includes(lq) ||
          r.node_id.toLowerCase().includes(lq),
      );
    }
    return out;
  }, [items, filter, q]);

  const counts = useMemo(() => {
    const c: Record<ResourceKind | "all", number> = {
      all: items.length,
      video: 0,
      blog: 0,
      writeup: 0,
      lab: 0,
      tool: 0,
      misc: 0,
    };
    for (const r of items) c[r.kind]++;
    return c;
  }, [items]);

  async function openExternal(url: string) {
    try {
      await openSafeUrl(url);
    } catch {
      sfx.warn();
      toast.warn("Refused to open link — only http/https URLs allowed.");
    }
  }

  async function togglePin(id: number) {
    sfx.click();
    await db.togglePinResource(id);
    reload();
  }

  async function deleteOne(id: number) {
    sfx.warn();
    await db.deleteResource(id);
    reload();
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-4 sm:px-10 py-6 sm:py-10 max-w-[1100px]">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="np-mono text-[10px] tracking-[0.4em] text-[var(--color-fg-3)] uppercase mb-2">
            // codex / archive
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--color-fg-0)]">
            Every resource you've collected.
          </h1>
          <p className="text-[var(--color-fg-2)] mt-2 text-sm max-w-xl">
            Videos, blogs, writeups, labs — pulled from every node in your skill graph.
          </p>
        </motion.div>

        {/* Filter strip */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <button
            onClick={() => {
              sfx.click();
              setFilter("all");
            }}
            className={cn(
              "np-mono text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 rounded transition",
              filter === "all"
                ? "bg-[var(--color-cyan-dim)] text-[var(--color-bg-0)]"
                : "text-[var(--color-fg-2)] hover:text-[var(--color-fg-0)] border border-[var(--color-border-default)]",
            )}
          >
            All ({counts.all})
          </button>
          {ALL_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => {
                sfx.click();
                setFilter(k);
              }}
              className={cn(
                "np-mono text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 rounded transition",
                filter === k
                  ? "text-[var(--color-bg-0)]"
                  : "text-[var(--color-fg-2)] hover:text-[var(--color-fg-0)] border border-[var(--color-border-default)]",
              )}
              style={{
                background: filter === k ? KIND_COLOR[k] : undefined,
              }}
            >
              {KIND_LABEL[k]} ({counts[k]})
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="filter..."
            maxLength={200}
            aria-label="Filter resources"
            className="ml-auto bg-[var(--color-bg-2)] border border-[var(--color-border-default)] rounded px-3 py-1.5 text-[13px] text-[var(--color-fg-0)] np-mono focus:border-[var(--color-cyan-dim)] focus:outline-none w-48"
          />
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="np-pixel rounded-lg p-12 text-center">
            <div className="np-mono text-[13px] text-[var(--color-fg-3)] tracking-widest">
              {items.length === 0
                ? "no resources yet — open a node and start attaching videos / blogs / writeups"
                : `no resources match these filters`}
            </div>
          </div>
        ) : (
          <MaybeVirtualList
            items={filtered}
            rowHeight={ROW_HEIGHT}
            height={VIRT_VIEWPORT}
            threshold={VIRT_THRESHOLD}
            className="space-y-1.5"
          >
            {({ item: r, style }) => (
              <div
                key={r.id}
                style={{ ...style, borderLeftWidth: 3, borderLeftColor: KIND_COLOR[r.kind] }}
                className="np-pixel rounded p-3 flex items-start gap-3 hover:border-[var(--color-cyan-dim)] transition"
              >
                <span
                  className="np-mono text-[10px] tracking-[0.2em] uppercase shrink-0 w-14 mt-1"
                  style={{ color: KIND_COLOR[r.kind] }}
                >
                  {KIND_LABEL[r.kind]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] text-[var(--color-fg-0)] truncate">{r.title}</div>
                  {r.note && (
                    <div className="text-[13px] text-[var(--color-fg-2)] mt-0.5 line-clamp-2">
                      {r.note}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      sfx.click();
                      go({ name: "zone", zoneId: r.node_zone });
                      selectNode(r.node_id);
                    }}
                    className="np-mono text-[10px] text-[var(--color-cyan)] hover:underline tracking-[0.15em] uppercase mt-1.5 inline-flex items-center gap-1"
                  >
                    → {r.node_id} {r.node_name}
                  </button>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {r.url && (
                    <button
                      onClick={() => openExternal(r.url!)}
                      aria-label="Open link"
                      title="Open link"
                      className="text-[var(--color-fg-3)] hover:text-[var(--color-cyan)] p-1.5"
                    >
                      <ExternalLink size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => togglePin(r.id)}
                    aria-label={r.pinned ? "Unpin resource" : "Pin resource"}
                    title={r.pinned ? "Unpin" : "Pin"}
                    className="text-[var(--color-fg-3)] hover:text-[var(--color-amber)] p-1.5"
                  >
                    {r.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                  </button>
                  <button
                    onClick={() => deleteOne(r.id)}
                    aria-label="Delete resource"
                    title="Delete"
                    className="text-[var(--color-fg-3)] hover:text-[var(--color-rose)] p-1.5"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}
          </MaybeVirtualList>
        )}
      </div>
    </div>
  );
}
