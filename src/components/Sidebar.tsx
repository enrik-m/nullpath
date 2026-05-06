import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Map,
  BookOpen,
  BarChart3,
  Trophy,
  Crosshair,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { useUi, type Route, computeOperatorXp, levelForXp, xpForLevel } from "../store";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/cn";
import * as db from "../db";
import { useIsMobile } from "../hooks/useMediaQuery";
import { APP_VERSION } from "../lib/version";
import { PixelBar } from "./pixel/PixelBar";
import { PixelSprite } from "./pixel/PixelSprite";

interface NavItem {
  icon: LucideIcon;
  label: string;
  route: Route;
  shortcut?: string;
}

const NAV: NavItem[] = [
  { icon: Map, label: "ATLAS", route: { name: "atlas" }, shortcut: "1" },
  { icon: BookOpen, label: "CODEX", route: { name: "codex" }, shortcut: "2" },
  { icon: BarChart3, label: "STATS", route: { name: "stats" }, shortcut: "3" },
  { icon: Crosshair, label: "BOUNTIES", route: { name: "bounties" }, shortcut: "4" },
  { icon: Trophy, label: "TROPHIES", route: { name: "achievements" }, shortcut: "5" },
];

export function Sidebar({ onSearchClick }: { onSearchClick: () => void }) {
  const route = useUi((s) => s.route);
  const go = useUi((s) => s.go);
  const drawerOpen = useUi((s) => s.drawerOpen);
  const setDrawerOpen = useUi((s) => s.setDrawerOpen);
  // Subscribing to dataVersion (bumped on completion / streak / settings
  // mutation) means we don't refetch all 820 nodes on every navigation.
  const dataVersion = useUi((s) => s.dataVersion);
  const isMobile = useIsMobile();
  const [profile, setProfile] = useState<{ handle: string; level: number; xp: number; xpInLvl: number; xpNeeded: number } | null>(null);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [state, allNodes, st] = await Promise.all([
          db.getAppState(),
          db.getAllNodes(),
          db.currentStreak(),
        ]);
        const xp = computeOperatorXp(allNodes);
        const lvl = levelForXp(xp);
        const cur = xpForLevel(lvl);
        const next = xpForLevel(lvl + 1);
        if (cancelled) return;
        setProfile({
          handle: state.handle,
          level: lvl,
          xp,
          xpInLvl: xp - cur,
          xpNeeded: next - cur,
        });
        setStreak(st);
      } catch {
        // Pre-DB-init: ignore. Migrations apply on the first DB call,
        // and the subsequent dataVersion bump will retrigger this load.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  const isActive = (r: Route) => {
    if (r.name === "atlas" && (route.name === "atlas" || route.name === "region" || route.name === "zone"))
      return true;
    return r.name === route.name;
  };

  // Close drawer when navigating on mobile
  function navigate(r: Route) {
    sfx.navigate();
    go(r);
    if (isMobile) setDrawerOpen(false);
  }

  const inner = (
    <>
      {/* Wordmark — pixel display font with glitch */}
      <div
        className="px-4 py-4 select-none flex items-start justify-between gap-2"
        style={{ borderBottom: "2px solid var(--color-border-default)" }}
      >
        <button
          onClick={() => navigate({ name: "atlas" })}
          className="text-left flex-1"
        >
          <div className="np-display text-xl text-[var(--color-cyan)] np-flicker leading-none">
            nullpath
            <span className="np-blink ml-1">_</span>
          </div>
          <div className="np-screen text-[10px] tracking-[0.3em] text-[var(--color-fg-3)] mt-2">
            v{APP_VERSION}
          </div>
        </button>
        {isMobile && (
          <button
            onClick={() => {
              sfx.click();
              setDrawerOpen(false);
            }}
            className="text-[var(--color-fg-2)] hover:text-[var(--color-fg-0)] p-1"
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Search */}
      <button
        onClick={() => {
          sfx.click();
          onSearchClick();
          if (isMobile) setDrawerOpen(false);
        }}
        className="np-pixel-inset mx-3 mt-3 flex items-center gap-2 px-3 py-2 text-[var(--color-fg-2)] hover:text-[var(--color-cyan)] np-screen text-[10px] tracking-[0.15em]"
      >
        <Search size={12} className="shrink-0" />
        <span>SEARCH</span>
        <span className="ml-auto text-[10px] text-[var(--color-fg-3)]">⌘K</span>
      </button>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-3 mt-4">
        {NAV.map((item) => {
          const active = isActive(item.route);
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.route)}
              onMouseEnter={() => sfx.hover()}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-left transition-colors np-screen text-[12px] tracking-[0.15em]",
                "border-2 border-transparent",
                active
                  ? "bg-[var(--color-cyan-deep)] text-[var(--color-cyan)] border-[var(--color-cyan-dim)]"
                  : "text-[var(--color-fg-2)] hover:text-[var(--color-fg-0)] hover:bg-[var(--color-bg-3)]",
              )}
              style={
                active
                  ? {
                      boxShadow:
                        "inset 2px 2px 0 0 var(--color-cyan), inset -2px -2px 0 0 var(--color-bg-0)",
                    }
                  : undefined
              }
            >
              {active && <span className="text-[var(--color-cyan)]">▶</span>}
              <item.icon size={13} />
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="text-[10px] text-[var(--color-fg-3)] np-mono">{item.shortcut}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-3 pb-3 flex flex-col gap-2">
        {/* Streak chip */}
        <div className="np-pixel px-3 py-2 flex items-center gap-3">
          <PixelSprite name="flame" size={20} color="var(--color-amber)" secondary="var(--color-rose)" highlight="var(--color-fg-0)" />
          <div className="flex-1">
            <div className="np-screen text-[10px] tracking-[0.2em] text-[var(--color-fg-3)]">STREAK</div>
            <div className="np-display text-base text-[var(--color-amber)]">{streak}d</div>
          </div>
        </div>

        {/* Profile / level chip */}
        <button
          onClick={() => navigate({ name: "settings" })}
          onMouseEnter={() => sfx.hover()}
          className="np-pixel px-3 py-2 flex items-center gap-2 text-left hover:bg-[var(--color-bg-3)] transition"
        >
          <div
            className="w-8 h-8 flex items-center justify-center np-display text-[10px] text-[var(--color-bg-0)] shrink-0"
            style={{
              background:
                "linear-gradient(135deg, var(--color-cyan) 0%, var(--color-magenta) 100%)",
              boxShadow:
                "inset 2px 2px 0 0 #ffffff44, inset -2px -2px 0 0 #00000088",
            }}
          >
            {(profile?.handle ?? "OP").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-[var(--color-fg-0)] truncate">
              {profile?.handle ?? "operator"}
            </div>
            <div className="np-screen text-[10px] tracking-[0.15em] text-[var(--color-fg-3)] flex items-center gap-1">
              <span className="text-[var(--color-cyan)]">LVL {profile?.level ?? 0}</span>
              <span>·</span>
              <span>{profile?.xp.toLocaleString() ?? 0} XP</span>
            </div>
          </div>
        </button>

        {profile && (
          <PixelBar
            value={profile.xpNeeded > 0 ? profile.xpInLvl / profile.xpNeeded : 0}
            color="var(--color-cyan)"
            segments={20}
            height={4}
          />
        )}

      </div>
    </>
  );

  // Desktop: inline column. Mobile: slide-in drawer overlay with backdrop.
  if (!isMobile) {
    return (
      <aside
        className="w-[240px] shrink-0 flex flex-col"
        style={{
          background: "var(--color-bg-1)",
          borderRight: "2px solid var(--color-border-default)",
          boxShadow: "inset -2px 0 0 0 var(--color-border-shadow)",
        }}
      >
        {inner}
      </aside>
    );
  }

  return (
    <AnimatePresence>
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(7, 9, 26, 0.65)", backdropFilter: "blur(2px)" }}
          />
          {/* Drawer */}
          <motion.aside
            initial={{ x: -260 }}
            animate={{ x: 0 }}
            exit={{ x: -260 }}
            transition={{ type: "tween", duration: 0.18, ease: "linear" }}
            className="fixed top-0 left-0 bottom-0 w-[260px] z-50 flex flex-col"
            style={{
              background: "var(--color-bg-1)",
              borderRight: "2px solid var(--color-border-default)",
              boxShadow: "8px 0 0 0 rgba(0,0,0,0.4)",
            }}
          >
            {inner}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
