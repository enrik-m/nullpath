import { useEffect, useState } from "react";
import { Play, Square, Pause, Zap, ChevronRight, Target, Menu } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useUi, formatHms } from "../store";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/cn";
import * as db from "../db";
import type { NodeRow } from "../db/types";
import { PixelButton } from "./pixel/PixelButton";
import { evaluateAchievements } from "../lib/achievements";
import { useIsMobile } from "../hooks/useMediaQuery";

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
  const setDrawerOpen = useUi((s) => s.setDrawerOpen);
  const isMobile = useIsMobile();

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

  // On mobile, show only the *last* (current) crumb.
  const visibleCrumbs = isMobile ? crumbs.slice(-1) : crumbs;

  return (
    <header
      className="h-14 shrink-0 flex items-center px-3 sm:px-4 gap-2 sm:gap-3"
      style={{
        background: "var(--color-bg-1)",
        borderBottom: "2px solid var(--color-border-default)",
        boxShadow: "inset 0 -2px 0 0 var(--color-border-shadow)",
      }}
    >
      {/* Hamburger (mobile only) */}
      {isMobile && (
        <button
          onClick={() => {
            sfx.click();
            setDrawerOpen(true);
          }}
          className="np-pixel-flat w-9 h-9 flex items-center justify-center text-[var(--color-cyan)] shrink-0"
          aria-label="Open menu"
        >
          <Menu size={16} />
        </button>
      )}

      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
        {visibleCrumbs.map((c, i) => (
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
            {i < visibleCrumbs.length - 1 && (
              <ChevronRight size={11} className="text-[var(--color-fg-3)] shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Encounter — icon-only on mobile to save space */}
      <PixelButton variant="ghost" size="sm" onClick={onRandomKick} aria-label="Random encounter">
        <Zap size={11} />
        <span className="hidden sm:inline">ENCOUNTER</span>
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
                <span className="np-screen text-[10px] tracking-[0.15em] text-[var(--color-magenta)]">
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
                "hidden sm:block np-screen text-[10px] tracking-[0.15em] uppercase px-2 py-1.5 border-2 transition",
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
                "px-2 sm:px-3 py-1 flex items-center gap-2 np-pixel-flat",
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
                className="np-mono text-[14px] sm:text-[15px] tabular-nums"
                style={{ color: session.paused ? "var(--color-amber)" : "var(--color-cyan)" }}
              >
                {formatHms(session.durationSeconds)}
              </span>
            </div>
            <PixelButton variant="danger" size="sm" onClick={endSession} aria-label="End session">
              <Square size={9} fill="currentColor" />
              <span className="hidden sm:inline">END</span>
            </PixelButton>
          </motion.div>
        ) : (
          <motion.div
            key="session-idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <PixelButton variant="primary" size="sm" onClick={() => startSession(null)} aria-label="Start session">
              <Play size={9} fill="currentColor" />
              <span className="hidden sm:inline">START SESSION</span>
              <span className="sm:hidden">START</span>
            </PixelButton>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
