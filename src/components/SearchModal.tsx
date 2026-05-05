/**
 * SearchModal — global search across all nodes (⌘K / Ctrl+K).
 * Live-filters as you type, supports keyboard navigation.
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Search, ArrowRight, Hash } from "lucide-react";
import * as db from "../db";
import type { NodeRow } from "../db/types";
import { useUi } from "../store";
import { sfx } from "../lib/sfx";
import { DepthTag } from "./ui/Tag";
import { cn } from "../lib/cn";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function SearchModal({ open, onClose }: SearchModalProps) {
  const go = useUi((s) => s.go);
  const selectNode = useUi((s) => s.selectNode);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<NodeRow[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [recents, setRecents] = useState<NodeRow[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQ("");
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 30);
      // Show recently in-progress as default state
      Promise.all(
        (
          ["foundation", "tool", "recon", "vuln", "defense", "methodology", "capstone"] as const
        ).map((k) => db.nodesByKind(k)),
      ).then((groups) => {
        const all = groups.flat();
        const inProg = all.filter((n) => n.status === "in_progress");
        const recent = all
          .filter((n) => n.completed_at)
          .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
          .slice(0, 5);
        setRecents([...inProg.slice(0, 5), ...recent].slice(0, 8));
      });
    }
  }, [open]);

  // Search debounced
  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await db.searchNodes(q.trim(), 30);
      setResults(r);
      setHighlight(0);
    }, 100);
    return () => clearTimeout(t);
  }, [q]);

  function pick(node: NodeRow) {
    sfx.navigate();
    go({ name: "zone", zoneId: node.zone_id });
    selectNode(node.id);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const list = q.trim() ? results : recents;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = list[highlight];
      if (target) pick(target);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;

  const list = q.trim() ? results : recents;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] px-4"
      style={{
        background: "color-mix(in oklab, #06070b 70%, transparent)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97, y: -8 }}
        animate={{ scale: 1, y: 0 }}
        className="w-[640px] max-w-full np-glass rounded-lg overflow-hidden border-[var(--color-cyan-dim)] np-glow-cyan"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border-subtle)]">
          <Search size={16} className="text-[var(--color-fg-2)]" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search 700+ nodes — try 'sqli', 'jwt', 'ssrf', or an id like W01"
            className="flex-1 bg-transparent border-none outline-none text-[14px] text-[var(--color-fg-0)] np-mono placeholder:text-[var(--color-fg-3)]"
          />
          <kbd className="np-mono text-[9px] text-[var(--color-fg-3)] border border-[var(--color-border-default)] rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {!q.trim() && recents.length > 0 && (
            <div className="np-mono text-[9px] tracking-[0.25em] uppercase text-[var(--color-fg-3)] px-4 pt-3 pb-1">
              // jump to recent
            </div>
          )}
          {q.trim() && results.length === 0 && (
            <div className="px-4 py-10 text-center np-mono text-[12px] text-[var(--color-fg-3)]">
              no nodes match "{q}"
            </div>
          )}

          {list.map((n, i) => (
            <button
              key={n.id}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(n)}
              className={cn(
                "w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors border-l-2",
                i === highlight
                  ? "bg-[color-mix(in_oklab,var(--color-cyan)_8%,transparent)] border-[var(--color-cyan)]"
                  : "border-transparent hover:bg-[var(--color-bg-3)]",
              )}
            >
              <Hash size={11} className="text-[var(--color-fg-3)]" />
              <span className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-cyan)] w-12 shrink-0">
                {n.id}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-[var(--color-fg-0)] truncate">{n.name}</div>
                {n.gloss && (
                  <div className="text-[11px] text-[var(--color-fg-2)] truncate np-mono">
                    {n.gloss}
                  </div>
                )}
              </div>
              <DepthTag depth={n.depth} />
              <span className="np-mono text-[9px] text-[var(--color-fg-3)]">{n.zone_id}</span>
              {i === highlight && (
                <ArrowRight size={12} className="text-[var(--color-cyan)]" />
              )}
            </button>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-[var(--color-border-subtle)] flex items-center gap-3 np-mono text-[9px] tracking-[0.15em] uppercase text-[var(--color-fg-3)]">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span className="ml-auto">{list.length} result{list.length === 1 ? "" : "s"}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
