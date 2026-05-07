/**
 * Route persistence — survives a page refresh.
 *
 * The app's route + selected-node state lives in zustand. On hard
 * reload that state evaporates and the user lands back on the boot
 * screen, then the atlas. That's annoying when you were 3 levels deep
 * in a zone and just wanted to glance at devtools.
 *
 * This module keeps a debounced mirror of (route, selectedNodeId) in
 * localStorage so BootView can restore it as the post-boot
 * destination instead of always sending users to the atlas.
 *
 * Designed to be tolerant: localStorage may be unavailable (Safari
 * private mode, embedded webviews, browser policies); persisted data
 * may be malformed by a hand-edit or version mismatch; the saved
 * route may reference a zone or region that no longer exists in the
 * database. Every reader falls back to null on any error.
 */

import type { Route } from "../store";

const KEY = "nullpath:route:v1";

interface Persisted {
  route: Route;
  selectedNodeId: string | null;
}

/**
 * Validate a parsed JSON object enough to trust it for navigation.
 * We accept only the route shapes the store currently models — a
 * future schema change would require bumping the KEY suffix.
 */
function isValidRoute(value: unknown): value is Route {
  if (!value || typeof value !== "object") return false;
  const v = value as { name?: unknown; regionId?: unknown; zoneId?: unknown };
  if (typeof v.name !== "string") return false;
  switch (v.name) {
    case "boot":
    case "atlas":
    case "codex":
    case "stats":
    case "bounties":
    case "achievements":
    case "settings":
      return true;
    case "region":
      return typeof v.regionId === "string" && v.regionId.length > 0;
    case "zone":
      return typeof v.zoneId === "string" && v.zoneId.length > 0;
    default:
      return false;
  }
}

/**
 * Read the persisted route from localStorage. Returns null if storage
 * is unavailable, the entry is missing/corrupt, or the route shape is
 * invalid. Skips the boot route — restoring "boot" would hang the
 * boot animation in a loop.
 */
export function readPersistedRoute(): Persisted | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (!isValidRoute(parsed.route)) return null;
    if (parsed.route.name === "boot") return null;
    const selectedNodeId = typeof parsed.selectedNodeId === "string" ? parsed.selectedNodeId : null;
    return { route: parsed.route, selectedNodeId };
  } catch {
    return null;
  }
}

/**
 * Write the current route + selected-node to localStorage. Silent on
 * failure — losing persistence is annoying but never fatal.
 */
export function writePersistedRoute(route: Route, selectedNodeId: string | null): void {
  try {
    // Don't persist the boot screen — it's a transient state that
    // would defeat the whole point of restoring to the user's last
    // real view.
    if (route.name === "boot") return;
    const payload: Persisted = { route, selectedNodeId };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be disabled / quota exceeded / etc.
  }
}

/** Clear the persisted route — useful for sign-out or test resets. */
export function clearPersistedRoute(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
