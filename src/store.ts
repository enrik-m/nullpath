/**
 * Global UI store. Backed by Zustand with no persistence — all
 * persistence flows through SQLite. The store carries only ephemeral
 * client state: current route, modals, transient session counters.
 */

import { create } from "zustand";
import type { RegionRow, ZoneRow } from "./db/types";

// ---------------------------------------------------------------------------
// Routes — desktop app, no real URLs. View enum + side params.
// ---------------------------------------------------------------------------
export type Route =
  | { name: "boot" }
  | { name: "atlas" }
  | { name: "region"; regionId: string }
  | { name: "zone"; zoneId: string }
  | { name: "codex" }
  | { name: "stats" }
  | { name: "bounties" }
  | { name: "settings" };

// ---------------------------------------------------------------------------
// Session state — held client-side; persisted to SQLite on tick + on end.
// ---------------------------------------------------------------------------
export interface ActiveSession {
  id: number;                    // session row id
  startedAtMs: number;           // wall-clock for duration calc
  durationSeconds: number;       // updated by tick
  idleSeconds: number;           // accumulated idle deducted from "real" study time
  paused: boolean;               // true while idle modal is visible
  focusNodeId: string | null;
  huntMode: boolean;             // tagged as live bug-bounty work
  pausedAtMs: number | null;     // when current pause began
}

interface UiState {
  // Route
  route: Route;
  go: (r: Route) => void;
  back: () => void;
  history: Route[];

  // Selected zone / node for side-panel work
  selectedNodeId: string | null;
  selectNode: (id: string | null) => void;

  // Session
  activeSession: ActiveSession | null;
  setSession: (s: ActiveSession | null) => void;
  patchSession: (patch: Partial<ActiveSession>) => void;

  // Modals
  modal:
    | null
    | { kind: "daily-briefing" }
    | { kind: "echo-prompt"; nodeId: string }
    | { kind: "idle-resume"; idleSeconds: number }
    | { kind: "session-end"; durationSeconds: number; xpEarned: number; nodeId: string | null }
    | { kind: "level-up"; oldLevel: number; newLevel: number }
    | { kind: "achievement"; id: string; name: string; description: string };
  showModal: (m: UiState["modal"]) => void;

  // Cached lookups (refreshed by hooks)
  regions: RegionRow[];
  zonesByRegion: Record<string, ZoneRow[]>;
  setRegions: (r: RegionRow[]) => void;
  setZonesForRegion: (regionId: string, z: ZoneRow[]) => void;

  // Settings cache
  scanlinesEnabled: boolean;
  soundEnabled: boolean;
  setScanlines: (v: boolean) => void;
  setSound: (v: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  route: { name: "boot" },
  history: [],
  go: (r) =>
    set((s) => ({
      route: r,
      history: [...s.history, s.route].slice(-20),
      selectedNodeId: r.name === "zone" ? s.selectedNodeId : null,
    })),
  back: () =>
    set((s) => {
      const prev = s.history[s.history.length - 1];
      if (!prev) return s;
      return { route: prev, history: s.history.slice(0, -1) };
    }),

  selectedNodeId: null,
  selectNode: (id) => set({ selectedNodeId: id }),

  activeSession: null,
  setSession: (s) => set({ activeSession: s }),
  patchSession: (patch) =>
    set((s) =>
      s.activeSession
        ? { activeSession: { ...s.activeSession, ...patch } as ActiveSession }
        : s,
    ),

  modal: null,
  showModal: (m) => set({ modal: m }),

  regions: [],
  zonesByRegion: {},
  setRegions: (r) => set({ regions: r }),
  setZonesForRegion: (regionId, z) =>
    set((s) => ({ zonesByRegion: { ...s.zonesByRegion, [regionId]: z } })),

  scanlinesEnabled: true,
  soundEnabled: true,
  setScanlines: (v) => {
    document.body.dataset.scanlines = v ? "on" : "off";
    set({ scanlinesEnabled: v });
  },
  setSound: (v) => set({ soundEnabled: v }),
}));

// ---------------------------------------------------------------------------
// Convenience selectors (memo-friendly)
// ---------------------------------------------------------------------------

export function useRoute() {
  return useUi((s) => s.route);
}

export function useActiveSession() {
  return useUi((s) => s.activeSession);
}

// Helpers — XP/level math lives here so it's importable everywhere.
// ---------------------------------------------------------------------------
// XP curve (per-account):
//   level N requires `500 * N^1.5` cumulative XP.
//   level 1 = 500, level 2 = 1414, level 3 = 2598, level 5 = 5590, level 10 = 15811
// ---------------------------------------------------------------------------
export function levelForXp(xp: number): number {
  if (xp <= 0) return 0;
  // Inverse of cum = 500 * N^1.5  →  N = (cum/500)^(2/3)
  const lvl = Math.floor(Math.pow(xp / 500, 2 / 3));
  return Math.max(0, lvl);
}

export function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  return Math.floor(500 * Math.pow(level, 1.5));
}

export function xpProgressInLevel(xp: number): {
  level: number;
  intoLevel: number;
  totalForLevel: number;
  pct: number;
} {
  const level = levelForXp(xp);
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const intoLevel = xp - cur;
  const totalForLevel = next - cur;
  const pct = totalForLevel === 0 ? 0 : (intoLevel / totalForLevel) * 100;
  return { level, intoLevel, totalForLevel, pct };
}

// XP awarded automatically on node completion. User can also bank manual
// XP per node via the Echo Mode prompt or the time tracker.
export function xpForCompletingNode(depth: string): number {
  switch (depth) {
    case "intro":
      return 60;
    case "std":
      return 120;
    case "adv":
      return 250;
    case "res":
      return 500;
    default:
      return 100;
  }
}

// XP awarded for time spent during a focused session (per minute).
export function xpForMinute(minutes: number): number {
  // Diminishing returns past 90 minutes — protects against runaway
  // grinds inflating XP for low-density work.
  if (minutes <= 0) return 0;
  if (minutes <= 60) return Math.floor(minutes * 4);
  if (minutes <= 120) return Math.floor(60 * 4 + (minutes - 60) * 2);
  return Math.floor(60 * 4 + 60 * 2 + (minutes - 120) * 1);
}

// ---------------------------------------------------------------------------
// Streak XP multiplier
// ---------------------------------------------------------------------------
export function streakMultiplier(streakDays: number): number {
  // +5% per consecutive day, capped at +50% (10-day streak).
  const cappedDays = Math.min(streakDays, 10);
  return 1 + cappedDays * 0.05;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------
export function formatHms(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatHmShort(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
