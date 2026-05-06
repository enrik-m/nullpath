/**
 * Global UI store. Backed by Zustand with no persistence — all
 * persistence flows through SQLite. Carries only ephemeral client state:
 * route stack, current modal, theme prefs, mobile drawer.
 */

import { create } from "zustand";
import type { NodeRow } from "./db/types";

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
  | { name: "achievements" }
  | { name: "settings" };

interface UiState {
  // Route stack
  route: Route;
  history: Route[];
  go: (r: Route) => void;
  back: () => void;

  // Selected zone-node for the side panel
  selectedNodeId: string | null;
  selectNode: (id: string | null) => void;

  /**
   * Monotonic counter bumped when persisted user state (XP, completion,
   * streak, achievements, app_state) changes. Components that need to
   * recompute derived stats can subscribe to this rather than polling
   * on every route change.
   */
  dataVersion: number;
  bumpData: () => void;

  // Modals (one at a time)
  modal:
    | null
    | { kind: "daily-briefing" }
    | { kind: "echo-prompt"; nodeId: string }
    | { kind: "level-up"; oldLevel: number; newLevel: number }
    | { kind: "achievement"; id: string; name: string; description: string; icon: string };
  showModal: (m: UiState["modal"]) => void;

  // Theme prefs (mirrored to SQLite app_state)
  scanlinesEnabled: boolean;
  soundEnabled: boolean;
  setScanlines: (v: boolean) => void;
  setSound: (v: boolean) => void;

  // Mobile drawer (sidebar overlay)
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  route: { name: "boot" },
  history: [],
  go: (r) =>
    set((s) => ({
      route: r,
      history: [...s.history, s.route].slice(-20),
      // Clear selection when leaving the zone view, keep it on intra-zone navs
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

  dataVersion: 0,
  bumpData: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),

  modal: null,
  showModal: (m) => set({ modal: m }),

  scanlinesEnabled: true,
  soundEnabled: true,
  setScanlines: (v) => set({ scanlinesEnabled: v }),
  setSound: (v) => set({ soundEnabled: v }),

  drawerOpen: false,
  setDrawerOpen: (v) => set({ drawerOpen: v }),
}));

// ---------------------------------------------------------------------------
// XP / level math (per-account)
//
// Curve: cumulative XP for level N is `500 * N^1.5`.
//   level 1 = 500, level 2 = 1414, level 3 = 2598, level 5 = 5590, level 10 = 15811.
// Inverse: levelForXp(xp) = floor((xp/500)^(2/3)).
// ---------------------------------------------------------------------------

export function levelForXp(xp: number): number {
  if (xp <= 0) return 0;
  const lvl = Math.floor(Math.pow(xp / 500, 2 / 3));
  return Math.max(0, lvl);
}

export function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  return Math.floor(500 * Math.pow(level, 1.5));
}

/**
 * Per-depth XP awarded automatically when a node is marked complete.
 * Manual bonus XP can also be banked via Echo Mode.
 */
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

/**
 * Single source of truth for the operator's XP total: sum of `user_xp`
 * across every node in `complete` status. Anything that needs to display
 * XP (Sidebar, StatsView, OperatorCard) goes through this so there's
 * exactly one definition.
 */
export function computeOperatorXp(nodes: NodeRow[]): number {
  let xp = 0;
  for (const n of nodes) {
    if (n.status === "complete") xp += n.user_xp || 0;
  }
  return xp;
}
