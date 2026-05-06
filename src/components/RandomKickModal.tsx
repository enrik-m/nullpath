/**
 * RandomKickModal — "I have N minutes, what should I do?"
 *
 * User picks a time window; we pick a node to start that fits and kicks them
 * straight into a session focused on it.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Zap, X, ArrowRight } from "lucide-react";
import * as db from "../db";
import type { NodeRow } from "../db/types";
import { useUi } from "../store";
import { sfx } from "../lib/sfx";
import { Button } from "./ui/Button";
import { DepthTag } from "./ui/Tag";

interface KickProps {
  open: boolean;
  onClose: () => void;
}

const WINDOWS = [
  { label: "Skirmish", minutes: 15, desc: "one drill, one short lab", depths: ["intro", "std"] as const },
  { label: "Patrol", minutes: 60, desc: "an apprentice lab module, a chapter", depths: ["intro", "std"] as const },
  { label: "Expedition", minutes: 180, desc: "an HTB box, an advanced lab category", depths: ["std", "adv"] as const },
  { label: "Raid", minutes: 480, desc: "a capstone push, deep research", depths: ["adv", "res"] as const },
];

export function RandomKickModal({ open, onClose }: KickProps) {
  const go = useUi((s) => s.go);
  const selectNode = useUi((s) => s.selectNode);
  const setSession = useUi((s) => s.setSession);

  const [picked, setPicked] = useState<typeof WINDOWS[number] | null>(null);
  const [target, setTarget] = useState<NodeRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setTarget(null);
    }
  }, [open]);

  async function chooseWindow(w: typeof WINDOWS[number]) {
    sfx.click();
    setPicked(w);
    setLoading(true);
    // Source candidate pool: any node that's available or in_progress at one
    // of the depths in the window's range.
    const groups = (
      ["foundation", "tool", "recon", "vuln", "defense", "methodology", "capstone"] as const
    ).map((k) => db.nodesByKind(k));
    const all = (await Promise.all(groups)).flat();
    const candidates = all.filter(
      (n) =>
        (n.status === "available" || n.status === "in_progress") &&
        (w.depths as readonly string[]).includes(n.depth),
    );
    // Prefer in_progress > available; randomize within tier.
    const inProg = candidates.filter((n) => n.status === "in_progress");
    const open = candidates.filter((n) => n.status === "available");
    const pool = inProg.length > 0 ? inProg : open;
    const choice = pool[Math.floor(Math.random() * pool.length)] ?? null;
    setTarget(choice);
    setLoading(false);
  }

  async function commit() {
    if (!target) return;
    sfx.success();
    // Start a session focused on it
    const id = await db.startSession(target.id);
    setSession({
      id,
      startedAtMs: Date.now(),
      durationSeconds: 0,
      idleSeconds: 0,
      paused: false,
      focusNodeId: target.id,
      huntMode: false,
      pausedAtMs: null,
    });
    if (target.status === "available") {
      await db.setNodeStatus(target.id, "in_progress");
    }
    go({ name: "zone", zoneId: target.zone_id });
    selectNode(target.id);
    onClose();
  }

  function reroll() {
    if (picked) chooseWindow(picked);
  }

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{
        background: "color-mix(in oklab, #06070b 65%, transparent)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97 }}
        animate={{ scale: 1 }}
        className="np-pixel rounded-lg w-[560px] max-w-full p-6 border-[var(--color-magenta-dim)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-[var(--color-magenta)]" />
            <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-magenta)]">
              RANDOM KICK
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-fg-2)] hover:text-[var(--color-fg-0)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-2 text-2xl font-bold text-[var(--color-fg-0)] tracking-tight">
          How much time do you have?
        </div>
        <div className="text-[var(--color-fg-2)] text-[14px] mt-1">
          Pick a window. We pick a node that fits.
        </div>

        {!picked && (
          <div className="grid grid-cols-2 gap-2 mt-5">
            {WINDOWS.map((w) => (
              <button
                key={w.label}
                onClick={() => chooseWindow(w)}
                className="np-pixel rounded p-4 text-left hover:border-[var(--color-magenta-dim)] transition group"
              >
                <div className="flex items-baseline justify-between">
                  <div className="text-base font-bold text-[var(--color-fg-0)]">{w.label}</div>
                  <div className="np-mono text-[12px] text-[var(--color-magenta)]">
                    ~{w.minutes < 60 ? `${w.minutes}m` : `${Math.floor(w.minutes / 60)}h`}
                  </div>
                </div>
                <div className="text-[12px] text-[var(--color-fg-2)] mt-1">{w.desc}</div>
              </button>
            ))}
          </div>
        )}

        {picked && (
          <div className="mt-5">
            <div className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
              picked: {picked.label.toLowerCase()} · ~{picked.minutes}m
            </div>
            {loading ? (
              <div className="np-mono text-[13px] text-[var(--color-fg-2)] mt-3">
                rolling the dice...
              </div>
            ) : target ? (
              <div className="mt-3 np-pixel rounded p-4 border-[var(--color-magenta-dim)]">
                <div className="flex items-center gap-2">
                  <span className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-magenta)]">
                    {target.id}
                  </span>
                  <DepthTag depth={target.depth} />
                </div>
                <div className="text-lg font-bold text-[var(--color-fg-0)] mt-1">
                  {target.name}
                </div>
                {target.gloss && (
                  <div className="text-[13px] text-[var(--color-fg-2)] mt-1.5 np-mono leading-relaxed">
                    {target.gloss}
                  </div>
                )}
              </div>
            ) : (
              <div className="np-mono text-[13px] text-[var(--color-fg-3)] mt-3">
                no candidates at this size — try a different window
              </div>
            )}
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
                Back
              </Button>
              <Button variant="ghost" size="sm" onClick={reroll}>
                Reroll
              </Button>
              {target && (
                <Button variant="primary" size="sm" onClick={commit}>
                  Start <ArrowRight size={11} />
                </Button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
