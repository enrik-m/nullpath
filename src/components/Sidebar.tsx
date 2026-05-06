import { useEffect, useState } from "react";
import {
  Map,
  BookOpen,
  BarChart3,
  Trophy,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useUi, type Route, formatHmShort, levelForXp, xpForLevel } from "../store";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/cn";
import * as db from "../db";
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
  { icon: Trophy, label: "QUESTS", route: { name: "bounties" }, shortcut: "4" },
];

export function Sidebar({ onSearchClick }: { onSearchClick: () => void }) {
  const route = useUi((s) => s.route);
  const go = useUi((s) => s.go);
  const session = useUi((s) => s.activeSession);
  const [profile, setProfile] = useState<{ handle: string; level: number; xp: number; xpInLvl: number; xpNeeded: number } | null>(null);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const state = await db.getAppState();
        const totalSeconds = await db.totalStudySeconds();
        const all = await Promise.all([
          ...["foundation", "tool", "recon", "vuln", "defense", "methodology", "capstone"].map(
            (k) => db.nodesByKind(k as any),
          ),
        ]);
        const allNodes = all.flat();
        const completedXp = allNodes
          .filter((n) => n.status === "complete")
          .reduce((s, n) => s + (n.user_xp || 0), 0);
        const minuteXp = Math.floor(totalSeconds / 60) * 4;
        const xp = completedXp + minuteXp;
        const lvl = levelForXp(xp);
        const cur = xpForLevel(lvl);
        const next = xpForLevel(lvl + 1);
        if (!cancelled) {
          setProfile({
            handle: state.handle,
            level: lvl,
            xp,
            xpInLvl: xp - cur,
            xpNeeded: next - cur,
          });
        }
        const st = await db.currentStreak();
        if (!cancelled) setStreak(st);
      } catch {
        // pre-DB-init: ignore
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [route, session]);

  const isActive = (r: Route) => {
    if (r.name === "atlas" && (route.name === "atlas" || route.name === "region" || route.name === "zone"))
      return true;
    return r.name === route.name;
  };

  return (
    <aside
      className="w-[240px] shrink-0 flex flex-col"
      style={{
        background: "var(--color-bg-1)",
        borderRight: "2px solid var(--color-border-default)",
        boxShadow: "inset -2px 0 0 0 var(--color-border-shadow)",
      }}
    >
      {/* Wordmark — pixel display font with glitch */}
      <div
        className="px-4 py-4 cursor-pointer select-none"
        style={{ borderBottom: "2px solid var(--color-border-default)" }}
        onClick={() => {
          sfx.navigate();
          go({ name: "atlas" });
        }}
      >
        <div className="np-display text-xl text-[var(--color-cyan)] np-flicker">
          nullpath
          <span className="np-blink ml-1">_</span>
        </div>
        <div className="np-screen text-[8px] tracking-[0.3em] text-[var(--color-fg-3)] mt-1.5">
          v0.1.0 · OPERATOR OS
        </div>
      </div>

      {/* Search */}
      <button
        onClick={() => {
          sfx.click();
          onSearchClick();
        }}
        className="np-pixel-inset mx-3 mt-3 flex items-center gap-2 px-3 py-2 text-[var(--color-fg-2)] hover:text-[var(--color-cyan)] np-screen text-[10px] tracking-[0.15em]"
      >
        <Search size={12} className="shrink-0" />
        <span>SEARCH</span>
        <span className="ml-auto text-[8px] text-[var(--color-fg-3)]">⌘K</span>
      </button>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-3 mt-4">
        {NAV.map((item) => {
          const active = isActive(item.route);
          return (
            <button
              key={item.label}
              onClick={() => {
                sfx.navigate();
                go(item.route);
              }}
              onMouseEnter={() => sfx.hover()}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-left transition-colors np-screen text-[11px] tracking-[0.15em]",
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
                <span className="text-[8px] text-[var(--color-fg-3)] np-mono">{item.shortcut}</span>
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
            <div className="np-screen text-[8px] tracking-[0.2em] text-[var(--color-fg-3)]">STREAK</div>
            <div className="np-display text-base text-[var(--color-amber)]">{streak}d</div>
          </div>
        </div>

        {/* Profile / level chip */}
        <button
          onClick={() => go({ name: "settings" })}
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
            <div className="np-pixel-text text-[12px] text-[var(--color-fg-0)] truncate">
              {profile?.handle ?? "operator"}
            </div>
            <div className="np-screen text-[8px] tracking-[0.15em] text-[var(--color-fg-3)] flex items-center gap-1">
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

        {/* Live session indicator */}
        {session && !session.paused && (
          <div className="np-pixel-flat px-3 py-2 flex items-center justify-between border-[var(--color-cyan)]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[var(--color-cyan)] np-pulse" />
              <span className="np-screen text-[9px] tracking-[0.2em] text-[var(--color-cyan)]">
                LIVE
              </span>
            </div>
            <span className="np-mono text-[14px] text-[var(--color-fg-0)]">
              {formatHmShort(session.durationSeconds)}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
