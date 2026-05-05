import { useEffect, useState } from "react";
import {
  Map,
  BookOpen,
  BarChart3,
  Trophy,
  Settings as SettingsIcon,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useUi, type Route, formatHmShort } from "../store";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/cn";
import * as db from "../db";

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
  { icon: Trophy, label: "BOUNTIES", route: { name: "bounties" }, shortcut: "4" },
];

export function Sidebar({ onSearchClick }: { onSearchClick: () => void }) {
  const route = useUi((s) => s.route);
  const go = useUi((s) => s.go);
  const session = useUi((s) => s.activeSession);
  const [profile, setProfile] = useState<{ handle: string; level: number; xp: number } | null>(null);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const state = await db.getAppState();
        const totalSeconds = await db.totalStudySeconds();
        // Quick XP rough: minutes-based account XP plus completed-node XP.
        const completed = await db.nodesByKind("vuln");
        // For account-level we sum user_xp across all nodes.
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
        const lvl = Math.floor(Math.pow(xp / 500, 2 / 3));
        if (!cancelled) {
          setProfile({ handle: state.handle, level: lvl, xp });
        }
        const st = await db.currentStreak();
        if (!cancelled) setStreak(st);
        // Avoid unused-var compiler errors
        void completed;
      } catch (e) {
        // Pre-DB-init: ignore
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [route, session]);

  const isActive = (r: Route) => {
    if (r.name === "atlas" && route.name === "atlas") return true;
    if (r.name === route.name) return true;
    if ((r.name === "atlas") && (route.name === "region" || route.name === "zone")) return true;
    return false;
  };

  return (
    <aside className="w-[220px] shrink-0 border-r border-[var(--color-border-subtle)] flex flex-col bg-[color-mix(in_oklab,var(--color-bg-1)_95%,transparent)]">
      {/* Wordmark */}
      <div
        className="px-5 py-5 cursor-pointer select-none"
        onClick={() => {
          sfx.navigate();
          go({ name: "atlas" });
        }}
      >
        <div className="flex items-baseline gap-0.5">
          <span className="text-2xl font-bold tracking-tight bg-gradient-to-br from-[var(--color-cyan)] via-[var(--color-fg-0)] to-[var(--color-magenta)] bg-clip-text text-transparent">
            null
          </span>
          <span className="text-2xl font-bold tracking-tight text-[var(--color-fg-0)]">path</span>
          <span className="np-mono text-sm text-[var(--color-cyan)] np-pulse">_</span>
        </div>
      </div>

      {/* Search */}
      <button
        onClick={() => {
          sfx.click();
          onSearchClick();
        }}
        className="mx-3 flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--color-border-default)] text-[var(--color-fg-2)] hover:text-[var(--color-fg-0)] hover:border-[var(--color-border-strong)] np-mono text-[11px] uppercase tracking-[0.15em]"
      >
        <Search size={14} />
        <span>Search</span>
        <span className="ml-auto text-[10px] text-[var(--color-fg-3)]">⌘K</span>
      </button>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-3 mt-5">
        {NAV.map((item) => {
          const active = isActive(item.route);
          return (
            <button
              key={item.label}
              onClick={() => {
                sfx.navigate();
                go(item.route);
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-left transition",
                active
                  ? "bg-[color-mix(in_oklab,var(--color-cyan)_10%,transparent)] text-[var(--color-cyan)]"
                  : "text-[var(--color-fg-2)] hover:text-[var(--color-fg-0)] hover:bg-[var(--color-bg-3)]",
              )}
            >
              <item.icon size={15} />
              <span className="np-mono text-[11px] tracking-[0.15em] flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="np-mono text-[10px] text-[var(--color-fg-3)]">{item.shortcut}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-3 pb-3 flex flex-col gap-2">
        {/* Streak chip */}
        <div className="np-glass rounded-md px-3 py-2.5 flex items-center gap-3">
          <div className="text-2xl">🜂</div>
          <div className="flex-1">
            <div className="np-mono text-[9px] tracking-[0.2em] text-[var(--color-fg-3)]">
              STREAK
            </div>
            <div className="np-mono text-sm text-[var(--color-amber)]">
              {streak}d
            </div>
          </div>
        </div>

        {/* Profile chip */}
        <button
          onClick={() => go({ name: "settings" })}
          className="np-glass rounded-md px-3 py-2.5 flex items-center gap-3 text-left hover:border-[var(--color-cyan-dim)] transition"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-cyan)] to-[var(--color-magenta)] flex items-center justify-center text-[var(--color-bg-0)] font-bold text-xs np-mono">
            {(profile?.handle ?? "OP").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="np-mono text-[10px] tracking-[0.15em] text-[var(--color-fg-1)] truncate">
              {profile?.handle ?? "operator"}
            </div>
            <div className="np-mono text-[10px] text-[var(--color-fg-3)]">
              LVL {profile?.level ?? 0} · {Math.floor((profile?.xp ?? 0) / 1000)}k xp
            </div>
          </div>
          <SettingsIcon size={13} className="text-[var(--color-fg-3)]" />
        </button>

        {/* Session indicator */}
        {session && !session.paused && (
          <div className="np-glass rounded-md px-3 py-2 flex items-center justify-between np-glow-cyan border-[var(--color-cyan-dim)]">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-cyan)] np-pulse" />
              <span className="np-mono text-[10px] tracking-[0.15em] text-[var(--color-cyan)]">
                LIVE
              </span>
            </div>
            <span className="np-mono text-[11px] text-[var(--color-fg-0)]">
              {formatHmShort(session.durationSeconds)}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
