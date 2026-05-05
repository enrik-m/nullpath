import { useEffect, useState } from "react";
import { Play, Square, Pause, Zap, ChevronRight, Target } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useUi, formatHms } from "../store";
import { sfx } from "../lib/sfx";
import { evaluateAchievements } from "../lib/achievements";
import { cn } from "../lib/cn";
import * as db from "../db";
import type { NodeRow } from "../db/types";
import { Button } from "./ui/Button";

/**
 * Top action bar — shows breadcrumbs, the live session timer, and the
 * Random Kick button.
 */
export function TopBar({ onRandomKick }: { onRandomKick: () => void }) {
  const route = useUi((s) => s.route);
  const go = useUi((s) => s.go);
  const session = useUi((s) => s.activeSession);
  const setSession = useUi((s) => s.setSession);
  const patchSession = useUi((s) => s.patchSession);
  const showModal = useUi((s) => s.showModal);

  const [crumbs, setCrumbs] = useState<{ label: string; route: any | null }[]>([]);
  const [focusNode, setFocusNode] = useState<NodeRow | null>(null);

  // Build breadcrumbs from current route
  useEffect(() => {
    let cancelled = false;
    async function build() {
      const trail: { label: string; route: any | null }[] = [
        { label: "ATLAS", route: { name: "atlas" } },
      ];
      if (route.name === "region") {
        const r = await db.getRegion(route.regionId);
        trail.push({ label: r?.name.toUpperCase() ?? route.regionId, route: null });
      } else if (route.name === "zone") {
        const z = await db.getZone(route.zoneId);
        if (z) {
          const r = await db.getRegion(z.region_id);
          trail.push({
            label: r?.name.toUpperCase() ?? z.region_id,
            route: { name: "region", regionId: z.region_id },
          });
          trail.push({ label: z.name.toUpperCase(), route: null });
        }
      } else if (route.name === "codex") {
        trail.length = 0;
        trail.push({ label: "CODEX", route: null });
      } else if (route.name === "stats") {
        trail.length = 0;
        trail.push({ label: "STATS", route: null });
      } else if (route.name === "bounties") {
        trail.length = 0;
        trail.push({ label: "BOUNTIES", route: null });
      } else if (route.name === "settings") {
        trail.length = 0;
        trail.push({ label: "SETTINGS", route: null });
      }
      if (!cancelled) setCrumbs(trail);
    }
    build();
    return () => {
      cancelled = true;
    };
  }, [route]);

  // Resolve focus node display
  useEffect(() => {
    let cancelled = false;
    if (!session?.focusNodeId) {
      setFocusNode(null);
      return;
    }
    db.getNode(session.focusNodeId).then((n) => {
      if (!cancelled) setFocusNode(n);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.focusNodeId]);

  async function startSession(focus: string | null = null) {
    sfx.success();
    const id = await db.startSession(focus);
    setSession({
      id,
      startedAtMs: Date.now(),
      durationSeconds: 0,
      idleSeconds: 0,
      paused: false,
      focusNodeId: focus,
      huntMode: false,
      pausedAtMs: null,
    });
  }

  async function endSession() {
    if (!session) return;
    sfx.complete();
    await db.endSession(
      session.id,
      session.durationSeconds,
      session.idleSeconds,
      false,
    );
    await db.recordStudyDay(session.durationSeconds);
    showModal({
      kind: "session-end",
      durationSeconds: session.durationSeconds,
      xpEarned: Math.floor(session.durationSeconds / 60) * 4,
      nodeId: session.focusNodeId,
    });
    setSession(null);
    // Evaluate achievements after session-end modal
    window.setTimeout(() => evaluateAchievements(), 3500);
  }

  async function toggleHunt() {
    if (!session) return;
    patchSession({ huntMode: !session.huntMode });
    sfx.click();
  }

  return (
    <header className="h-14 shrink-0 border-b border-[var(--color-border-subtle)] flex items-center px-5 gap-3 bg-[color-mix(in_oklab,var(--color-bg-1)_85%,transparent)] backdrop-blur">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {crumbs.map((c, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            {c.route ? (
              <button
                onClick={() => {
                  sfx.click();
                  go(c.route);
                }}
                className="np-mono text-[11px] tracking-[0.2em] text-[var(--color-fg-2)] hover:text-[var(--color-cyan)] transition truncate"
              >
                {c.label}
              </button>
            ) : (
              <span className="np-mono text-[11px] tracking-[0.2em] text-[var(--color-fg-0)] truncate">
                {c.label}
              </span>
            )}
            {i < crumbs.length - 1 && (
              <ChevronRight size={12} className="text-[var(--color-fg-3)] shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Random Kick */}
      <Button variant="ghost" size="sm" onClick={onRandomKick}>
        <Zap size={13} />
        Random Kick
      </Button>

      {/* Session controls */}
      <AnimatePresence mode="wait">
        {session ? (
          <motion.div
            key="session-active"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="flex items-center gap-2"
          >
            {focusNode && (
              <div className="np-mono text-[10px] uppercase text-[var(--color-fg-2)] tracking-[0.15em] hidden md:flex items-center gap-1.5">
                <Target size={11} />
                <span className="text-[var(--color-fg-1)]">{focusNode.id}</span>
                <span className="text-[var(--color-fg-2)] truncate max-w-[160px]">
                  {focusNode.name}
                </span>
              </div>
            )}
            <button
              onClick={toggleHunt}
              className={cn(
                "np-mono text-[10px] uppercase px-2 py-1 rounded border transition",
                session.huntMode
                  ? "text-[var(--color-magenta)] border-[var(--color-magenta-dim)] bg-[color-mix(in_oklab,var(--color-magenta)_10%,transparent)]"
                  : "text-[var(--color-fg-3)] border-[var(--color-border-default)] hover:text-[var(--color-fg-1)]",
              )}
              title="Tag this session as live bug-bounty work"
            >
              HUNT
            </button>
            <div
              className={cn(
                "np-mono px-3 py-1.5 rounded-md border flex items-center gap-2",
                session.paused
                  ? "border-[var(--color-amber)] text-[var(--color-amber)]"
                  : "border-[var(--color-cyan-dim)] text-[var(--color-cyan)] np-glow-cyan",
              )}
            >
              {session.paused ? (
                <Pause size={12} />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-cyan)] np-pulse" />
              )}
              <span className="text-sm tabular-nums">
                {formatHms(session.durationSeconds)}
              </span>
            </div>
            <Button variant="danger" size="sm" onClick={endSession}>
              <Square size={11} fill="currentColor" />
              End
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="session-idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Button variant="primary" size="sm" onClick={() => startSession(null)}>
              <Play size={11} fill="currentColor" />
              Start Session
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
