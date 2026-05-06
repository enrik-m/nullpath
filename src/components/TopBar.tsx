import { useEffect, useState } from "react";
import { Play, Square, Pause, Zap, ChevronRight, Target } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useUi, formatHms } from "../store";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/cn";
import * as db from "../db";
import type { NodeRow } from "../db/types";
import { PixelButton } from "./pixel/PixelButton";
import { evaluateAchievements } from "../lib/achievements";

/**
 * TopBar — RPG-HUD-flavored. Breadcrumbs read like a navigation trail,
 * Random Kick is the "encounter" button, the timer panel looks like an
 * NES status display.
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
        trail.push({ label: "QUEST LOG", route: null });
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
    await db.endSession(session.id, session.durationSeconds, session.idleSeconds, false);
    await db.recordStudyDay(session.durationSeconds);
    showModal({
      kind: "session-end",
      durationSeconds: session.durationSeconds,
      xpEarned: Math.floor(session.durationSeconds / 60) * 4,
      nodeId: session.focusNodeId,
    });
    setSession(null);
    window.setTimeout(() => evaluateAchievements(), 3500);
  }

  function toggleHunt() {
    if (!session) return;
    patchSession({ huntMode: !session.huntMode });
    sfx.click();
  }

  return (
    <header
      className="h-14 shrink-0 flex items-center px-4 gap-3"
      style={{
        background: "var(--color-bg-1)",
        borderBottom: "2px solid var(--color-border-default)",
        boxShadow: "inset 0 -2px 0 0 var(--color-border-shadow)",
      }}
    >
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
                className="np-screen text-[10px] tracking-[0.2em] text-[var(--color-fg-2)] hover:text-[var(--color-cyan)] transition truncate"
              >
                {c.label}
              </button>
            ) : (
              <span className="np-screen text-[10px] tracking-[0.2em] text-[var(--color-cyan)] truncate">
                ▸ {c.label}
              </span>
            )}
            {i < crumbs.length - 1 && (
              <ChevronRight size={11} className="text-[var(--color-fg-3)] shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Random Kick */}
      <PixelButton variant="ghost" size="sm" onClick={onRandomKick}>
        <Zap size={11} />
        ENCOUNTER
      </PixelButton>

      {/* Session controls */}
      <AnimatePresence mode="wait">
        {session ? (
          <motion.div
            key="session-active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2"
          >
            {focusNode && (
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 np-pixel-flat">
                <Target size={10} className="text-[var(--color-magenta)]" />
                <span className="np-screen text-[9px] tracking-[0.15em] text-[var(--color-magenta)]">
                  {focusNode.id}
                </span>
                <span className="text-[10px] text-[var(--color-fg-2)] truncate max-w-[140px]">
                  {focusNode.name}
                </span>
              </div>
            )}
            <button
              onClick={toggleHunt}
              className={cn(
                "np-screen text-[9px] tracking-[0.15em] uppercase px-2 py-1.5 border-2 transition",
                session.huntMode
                  ? "text-[var(--color-bg-0)] bg-[var(--color-magenta)] border-[var(--color-magenta)]"
                  : "text-[var(--color-fg-3)] border-[var(--color-border-default)] hover:text-[var(--color-magenta)] hover:border-[var(--color-magenta-dim)]",
              )}
              title="Tag this session as live bug-bounty work"
            >
              HUNT
            </button>
            <div
              className={cn(
                "px-3 py-1 flex items-center gap-2 np-pixel-flat",
                session.paused
                  ? "border-[var(--color-amber)]"
                  : "border-[var(--color-cyan)]",
              )}
            >
              {session.paused ? (
                <Pause size={10} className="text-[var(--color-amber)]" />
              ) : (
                <span className="w-2 h-2 bg-[var(--color-cyan)] np-pulse" />
              )}
              <span
                className="np-mono text-[14px] tabular-nums"
                style={{ color: session.paused ? "var(--color-amber)" : "var(--color-cyan)" }}
              >
                {formatHms(session.durationSeconds)}
              </span>
            </div>
            <PixelButton variant="danger" size="sm" onClick={endSession}>
              <Square size={9} fill="currentColor" />
              END
            </PixelButton>
          </motion.div>
        ) : (
          <motion.div
            key="session-idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <PixelButton variant="primary" size="sm" onClick={() => startSession(null)}>
              <Play size={9} fill="currentColor" />
              START SESSION
            </PixelButton>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
