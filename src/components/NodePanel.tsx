/**
 * NodePanel — slide-in side drawer for a selected node.
 *
 * Sections:
 *  1. Header: id, name, depth/status/kind chips, close button
 *  2. Action bar: Mark in-progress / Mark complete / Set as session focus
 *  3. Resources: list with add form (video/blog/writeup/lab/tool/misc + url)
 *  4. Notes: markdown freeform, autosaving
 *  5. Sub-nodes (if any): mini list with status, click to select
 *  6. Meta footer: OWASP/CWE tags, completion date, time spent
 */

import { useCallback, useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  CheckCircle2,
  PlayCircle,
  Target,
  Plus,
  Pin,
  PinOff,
  ExternalLink,
  Trash2,
  Save,
} from "lucide-react";
import * as db from "../db";
import type { NodeRow, NodeResourceRow, ResourceKind } from "../db/types";
import { useUi, xpForCompletingNode } from "../store";
import { sfx } from "../lib/sfx";
import { evaluateAchievements } from "../lib/achievements";
import { cn } from "../lib/cn";
import { DepthTag, StatusTag, KindTag } from "./ui/Tag";
import { Button } from "./ui/Button";

interface NodePanelProps {
  nodeId: string;
  accent: string;
  onClose: () => void;
  onChanged: () => void;
}

const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = {
  video: "Video",
  blog: "Blog",
  writeup: "Writeup",
  lab: "Lab",
  tool: "Tool",
  misc: "Misc",
};

const RESOURCE_KIND_COLOR: Record<ResourceKind, string> = {
  video: "#fb7185",
  blog: "#22d3ee",
  writeup: "#a3e635",
  lab: "#e879f9",
  tool: "#fbbf24",
  misc: "#6b7088",
};

export function NodePanel({ nodeId, accent, onClose, onChanged }: NodePanelProps) {
  const showModal = useUi((s) => s.showModal);
  const session = useUi((s) => s.activeSession);
  const setSession = useUi((s) => s.setSession);
  const patchSession = useUi((s) => s.patchSession);
  const selectNode = useUi((s) => s.selectNode);

  const [node, setNode] = useState<NodeRow | null>(null);
  const [children, setChildren] = useState<NodeRow[]>([]);
  const [resources, setResources] = useState<NodeResourceRow[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [noteSaved, setNoteSaved] = useState(true);
  const noteSaveTimer = useRef<number | null>(null);

  const [adding, setAdding] = useState(false);
  const [newRes, setNewRes] = useState<{ kind: ResourceKind; title: string; url: string; note: string }>({
    kind: "video",
    title: "",
    url: "",
    note: "",
  });

  // Load
  const reload = useCallback(async () => {
    const n = await db.getNode(nodeId);
    setNode(n);
    if (n) {
      const kids = await db.getNodeChildren(nodeId);
      setChildren(kids);
      const res = await db.getResources(nodeId);
      setResources(res);
      const note = await db.getNote(nodeId);
      setNoteBody(note?.body_md ?? "");
      setNoteSaved(true);
    }
  }, [nodeId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Autosave note (debounced 700ms)
  function onNoteChange(v: string) {
    setNoteBody(v);
    setNoteSaved(false);
    if (noteSaveTimer.current) window.clearTimeout(noteSaveTimer.current);
    noteSaveTimer.current = window.setTimeout(async () => {
      await db.upsertNote(nodeId, v);
      setNoteSaved(true);
    }, 700);
  }

  async function flushNote() {
    if (noteSaveTimer.current) window.clearTimeout(noteSaveTimer.current);
    await db.upsertNote(nodeId, noteBody);
    setNoteSaved(true);
  }

  // Status actions
  async function markInProgress() {
    if (!node) return;
    sfx.click();
    await db.setNodeStatus(node.id, "in_progress");
    await reload();
    onChanged();
  }

  async function markComplete() {
    if (!node) return;
    sfx.complete();
    const xp = xpForCompletingNode(node.depth);
    await db.setNodeStatus(node.id, "complete");
    await db.setNodeXp(node.id, (node.user_xp || 0) + xp);
    await db.scheduleRefresher(node.id);
    await reload();
    onChanged();
    // Echo Mode prompt — fires first, then achievement engine after dismiss
    showModal({ kind: "echo-prompt", nodeId: node.id });
    // Evaluate after a short delay so the echo modal stacks first
    window.setTimeout(() => evaluateAchievements(), 4000);
  }

  async function markAvailable() {
    if (!node) return;
    sfx.click();
    await db.setNodeStatus(node.id, "available");
    await reload();
    onChanged();
  }

  // Session focus
  async function setAsFocus() {
    if (!node) return;
    sfx.success();
    if (session) {
      await db.updateSession(session.id, { focus_node_id: node.id });
      patchSession({ focusNodeId: node.id });
    } else {
      const id = await db.startSession(node.id);
      setSession({
        id,
        startedAtMs: Date.now(),
        durationSeconds: 0,
        idleSeconds: 0,
        paused: false,
        focusNodeId: node.id,
        huntMode: false,
        pausedAtMs: null,
      });
    }
    if (node.status === "available") {
      await db.setNodeStatus(node.id, "in_progress");
      await reload();
      onChanged();
    }
  }

  // Resource actions
  async function addResource() {
    if (!newRes.title.trim()) return;
    sfx.click();
    await db.addResource({
      node_id: nodeId,
      kind: newRes.kind,
      title: newRes.title.trim(),
      url: newRes.url.trim() || null,
      note: newRes.note.trim() || null,
    });
    setNewRes({ kind: newRes.kind, title: "", url: "", note: "" });
    setAdding(false);
    const res = await db.getResources(nodeId);
    setResources(res);
  }

  async function deleteResource(id: number) {
    sfx.warn();
    await db.deleteResource(id);
    const res = await db.getResources(nodeId);
    setResources(res);
  }

  async function togglePin(id: number) {
    sfx.click();
    await db.togglePinResource(id);
    const res = await db.getResources(nodeId);
    setResources(res);
  }

  async function openUrl(url: string) {
    try {
      await invoke("plugin:opener|open_url", { url });
    } catch {
      window.open(url, "_blank");
    }
  }

  if (!node) return null;

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ x: 460 }}
        animate={{ x: 0 }}
        exit={{ x: 460 }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="w-[460px] shrink-0 h-full bg-[color-mix(in_oklab,var(--color-bg-1)_98%,transparent)] border-l border-[var(--color-border-subtle)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-[var(--color-border-subtle)]">
          <div className="flex items-start gap-2">
            <div
              className="np-mono text-[10px] tracking-[0.2em] uppercase"
              style={{ color: accent }}
            >
              {node.id}
            </div>
            <button
              onClick={() => {
                sfx.click();
                onClose();
              }}
              className="ml-auto text-[var(--color-fg-2)] hover:text-[var(--color-fg-0)]"
            >
              <X size={16} />
            </button>
          </div>
          <div className="text-xl font-bold tracking-tight text-[var(--color-fg-0)] mt-1">
            {node.name}
          </div>
          {node.gloss && (
            <div className="text-[var(--color-fg-2)] text-[12px] mt-2 leading-relaxed">
              {node.gloss}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            <DepthTag depth={node.depth} />
            <StatusTag status={node.status} />
            <KindTag kind={node.kind} />
            {node.owasp_tag && (
              <span className="np-mono text-[9px] tracking-[0.2em] border px-1.5 py-0.5 rounded-sm border-[var(--color-amber)] text-[var(--color-amber)]">
                OWASP {node.owasp_tag}
              </span>
            )}
            {node.cwe_id && (
              <span className="np-mono text-[9px] tracking-[0.2em] border px-1.5 py-0.5 rounded-sm border-[var(--color-fg-3)] text-[var(--color-fg-2)]">
                {node.cwe_id}
              </span>
            )}
          </div>
        </div>

        {/* Action bar */}
        <div className="px-5 py-3 border-b border-[var(--color-border-subtle)] flex items-center gap-2 flex-wrap">
          {node.status === "available" && (
            <Button variant="outline" size="sm" onClick={markInProgress}>
              <PlayCircle size={12} />
              Start
            </Button>
          )}
          {node.status === "in_progress" && (
            <Button variant="ghost" size="sm" onClick={markAvailable}>
              <X size={12} />
              Pause
            </Button>
          )}
          {node.status !== "complete" ? (
            <Button variant="lime" size="sm" onClick={markComplete}>
              <CheckCircle2 size={12} />
              Complete
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={markAvailable}>
              <X size={12} />
              Re-open
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={setAsFocus}>
            <Target size={12} />
            Set as focus
          </Button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Sub-nodes */}
          {children.length > 0 && (
            <section>
              <SectionHeader title="Sub-techniques" count={children.length} />
              <div className="space-y-1.5">
                {children.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      sfx.click();
                      selectNode(c.id);
                    }}
                    className="w-full text-left np-glass rounded px-3 py-2 hover:border-[var(--color-cyan-dim)] transition flex items-center gap-2"
                  >
                    <span className="np-mono text-[9px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
                      {c.id}
                    </span>
                    <span
                      className={cn(
                        "text-[12px] flex-1 truncate",
                        c.status === "complete"
                          ? "text-[var(--color-lime)]"
                          : c.status === "in_progress"
                            ? "text-[var(--color-cyan)]"
                            : "text-[var(--color-fg-1)]",
                      )}
                    >
                      {c.name}
                    </span>
                    <DepthTag depth={c.depth} />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Resources */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <SectionHeader title="Resources" count={resources.length} noMargin />
              {!adding && (
                <button
                  onClick={() => {
                    sfx.click();
                    setAdding(true);
                  }}
                  className="np-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-cyan)] hover:text-[var(--color-fg-0)]"
                >
                  <Plus size={12} className="inline mr-1" /> Add
                </button>
              )}
            </div>

            {/* Add form */}
            {adding && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="np-glass rounded p-3 mb-3 space-y-2"
              >
                <div className="flex gap-1.5 flex-wrap">
                  {(["video", "blog", "writeup", "lab", "tool", "misc"] as ResourceKind[]).map(
                    (k) => (
                      <button
                        key={k}
                        onClick={() => {
                          sfx.hover();
                          setNewRes({ ...newRes, kind: k });
                        }}
                        className={cn(
                          "np-mono text-[10px] tracking-[0.1em] uppercase px-2 py-1 rounded transition",
                          newRes.kind === k
                            ? "text-[var(--color-bg-0)]"
                            : "text-[var(--color-fg-2)] hover:text-[var(--color-fg-0)]",
                        )}
                        style={{
                          background:
                            newRes.kind === k ? RESOURCE_KIND_COLOR[k] : "var(--color-bg-3)",
                        }}
                      >
                        {RESOURCE_KIND_LABEL[k]}
                      </button>
                    ),
                  )}
                </div>
                <input
                  autoFocus
                  placeholder="Title"
                  value={newRes.title}
                  onChange={(e) => setNewRes({ ...newRes, title: e.target.value })}
                  className="w-full bg-[var(--color-bg-3)] border border-[var(--color-border-default)] rounded px-2 py-1.5 text-sm text-[var(--color-fg-0)] focus:border-[var(--color-cyan-dim)]"
                />
                <input
                  placeholder="URL (optional)"
                  value={newRes.url}
                  onChange={(e) => setNewRes({ ...newRes, url: e.target.value })}
                  className="w-full bg-[var(--color-bg-3)] border border-[var(--color-border-default)] rounded px-2 py-1.5 text-[12px] text-[var(--color-fg-1)] np-mono focus:border-[var(--color-cyan-dim)]"
                />
                <input
                  placeholder="Quick note (optional)"
                  value={newRes.note}
                  onChange={(e) => setNewRes({ ...newRes, note: e.target.value })}
                  className="w-full bg-[var(--color-bg-3)] border border-[var(--color-border-default)] rounded px-2 py-1.5 text-[12px] text-[var(--color-fg-1)] focus:border-[var(--color-cyan-dim)]"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" onClick={addResource}>
                    Save
                  </Button>
                </div>
              </motion.div>
            )}

            <div className="space-y-1.5">
              {resources.length === 0 && !adding && (
                <div className="text-[12px] text-[var(--color-fg-3)] np-mono py-2">
                  no resources yet — paste a youtube link, blog url, or writeup
                </div>
              )}
              {resources.map((r) => (
                <div
                  key={r.id}
                  className="np-glass rounded px-3 py-2 flex items-start gap-2"
                  style={{ borderLeftWidth: 3, borderLeftColor: RESOURCE_KIND_COLOR[r.kind] }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="np-mono text-[9px] tracking-[0.2em] uppercase"
                        style={{ color: RESOURCE_KIND_COLOR[r.kind] }}
                      >
                        {RESOURCE_KIND_LABEL[r.kind]}
                      </span>
                      {r.pinned === 1 && (
                        <Pin size={10} className="text-[var(--color-amber)]" />
                      )}
                    </div>
                    <div className="text-[12.5px] text-[var(--color-fg-0)] mt-0.5 truncate">
                      {r.title}
                    </div>
                    {r.note && (
                      <div className="text-[11px] text-[var(--color-fg-2)] mt-0.5 line-clamp-2">
                        {r.note}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {r.url && (
                      <button
                        onClick={() => {
                          sfx.click();
                          openUrl(r.url!);
                        }}
                        className="text-[var(--color-fg-3)] hover:text-[var(--color-cyan)] p-1"
                      >
                        <ExternalLink size={12} />
                      </button>
                    )}
                    <button
                      onClick={() => togglePin(r.id)}
                      className="text-[var(--color-fg-3)] hover:text-[var(--color-amber)] p-1"
                    >
                      {r.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                    </button>
                    <button
                      onClick={() => deleteResource(r.id)}
                      className="text-[var(--color-fg-3)] hover:text-[var(--color-rose)] p-1"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Notes */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <SectionHeader title="Notes" noMargin />
              <span className="np-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-fg-3)]">
                {noteSaved ? (
                  <span className="text-[var(--color-lime)]">saved</span>
                ) : (
                  <span className="text-[var(--color-amber)]">saving...</span>
                )}
              </span>
            </div>
            <textarea
              value={noteBody}
              onChange={(e) => onNoteChange(e.target.value)}
              onBlur={flushNote}
              placeholder="freeform markdown notes — concepts, payloads, links, anything"
              className="w-full bg-[var(--color-bg-2)] border border-[var(--color-border-default)] rounded px-3 py-2 text-[12.5px] text-[var(--color-fg-0)] np-mono leading-[1.6] focus:border-[var(--color-cyan-dim)] focus:outline-none min-h-[140px] resize-y"
            />
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--color-border-subtle)] np-mono text-[10px] tracking-[0.15em] text-[var(--color-fg-3)] uppercase flex items-center justify-between">
          <span>
            xp {node.user_xp ?? 0}
            {node.completed_at && (
              <>
                {" · "}
                completed {new Date(node.completed_at).toLocaleDateString()}
              </>
            )}
          </span>
          <button
            onClick={flushNote}
            className="hover:text-[var(--color-fg-0)] flex items-center gap-1"
            title="Force-save notes"
          >
            <Save size={10} /> save
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

function SectionHeader({
  title,
  count,
  noMargin = false,
}: {
  title: string;
  count?: number;
  noMargin?: boolean;
}) {
  return (
    <div
      className={cn(
        "np-mono text-[10px] tracking-[0.25em] uppercase text-[var(--color-fg-2)] flex items-center gap-2",
        !noMargin && "mb-2",
      )}
    >
      <span>// {title}</span>
      {typeof count === "number" && (
        <span className="text-[var(--color-fg-3)]">({count})</span>
      )}
    </div>
  );
}
