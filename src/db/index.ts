/**
 * Nullpath database access layer (router).
 *
 * Two backends supported:
 *   - LOCAL  — sql.js (SQLite compiled to WASM) persisted to IndexedDB.
 *              Default. Runs offline. No account required.
 *   - CLOUD  — Supabase Postgres with row-level security per user.
 *              Activated when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 *              are set at build time.
 *
 * `isCloudMode()` is read once at module load; the chosen backend is
 * frozen for the session. Every public helper here is a thin alias to
 * the matching function in `db/local.ts` or `db/cloud.ts` so consumers
 * (`import { getRegions } from '../db'`) don't have to know which
 * backend is live.
 *
 * The mutation pub/sub channel (`onMutation`) is shared between the
 * two backends — see db/mutations.ts.
 */

import { isCloudMode } from "../lib/supabase";
import * as cloud from "./cloud";
import * as local from "./local";

// ---------------------------------------------------------------------------
// Re-exports — types + the shared pub/sub channel.
// ---------------------------------------------------------------------------

export { onMutation } from "./mutations";
export { localDayKey, isoWeek } from "./local";
export type { BackupSnapshot } from "./local";

// ---------------------------------------------------------------------------
// Internal: pick a backend module once at load time and route through
// it. We deliberately bind every exported function to the chosen
// backend at module-load so a hot reload or env-flip doesn't strand
// callers between two halves of the same operation.
// ---------------------------------------------------------------------------

const impl = isCloudMode() ? cloud : local;

/**
 * Direct connection access. Local mode returns the sql.js client;
 * cloud mode has no equivalent (everything routes through helpers and
 * RPC) so callers must guard with `isCloudMode()` before using this.
 *
 * Used by `lib/achievements.ts` for aggregate count queries — the
 * cloud path doesn't need this because `evaluate_achievements` runs
 * server-side and returns the unlocked rows directly.
 */
export const db = local.db;

// Regions / zones / nodes
export const getRegions = impl.getRegions;
export const getRegion = impl.getRegion;
export const getZones = impl.getZones;
export const getZone = impl.getZone;
export const getZoneStats = impl.getZoneStats;
export const getNodesForZone = impl.getNodesForZone;
export const getNode = impl.getNode;
export const getNodeChildren = impl.getNodeChildren;
export const setNodeStatus = impl.setNodeStatus;
export const setNodeXp = impl.setNodeXp;
export const searchNodes = impl.searchNodes;
export const getAllNodes = impl.getAllNodes;

// Resources & notes
export const getResources = impl.getResources;
export const addResource = impl.addResource;
export const deleteResource = impl.deleteResource;
export const togglePinResource = impl.togglePinResource;
export const getAllResources = impl.getAllResources;
export const getNote = impl.getNote;
export const upsertNote = impl.upsertNote;

// Streak
export const recordCompletionDay = impl.recordCompletionDay;
export const getStreakDays = impl.getStreakDays;
export const currentStreak = impl.currentStreak;

// App state
export const getAppState = impl.getAppState;
export const updateAppState = impl.updateAppState;

// Achievements
export const getAchievements = impl.getAchievements;
export const unlockAchievement = impl.unlockAchievement;

// Bounties
export const getBounties = impl.getBounties;
export const addBounty = impl.addBounty;
export const updateBounty = impl.updateBounty;
export const deleteBounty = impl.deleteBounty;
export const bountyTotals = impl.bountyTotals;

// Refreshers
export const scheduleRefresher = impl.scheduleRefresher;
export const dueRefreshers = impl.dueRefreshers;
export const dueRefreshersWithNode = impl.dueRefreshersWithNode;
export const ackRefresher = impl.ackRefresher;

// Reset / backup
export const resetAllProgress = impl.resetAllProgress;
export const exportBackup = impl.exportBackup;
export const importBackup = impl.importBackup;

/**
 * Cloud-only: full account deletion via the delete-account Edge Function.
 * Wipes auth.users which CASCADEs to every per-user row. No-op in local
 * mode (callers should branch on isCloudMode() before invoking).
 */
export const deleteAccount = isCloudMode() ? cloud.deleteAccount : async () => {};

// ---------------------------------------------------------------------------
// Cloud-specific extras — exported as no-ops in local mode so callers
// can use them unconditionally.
// ---------------------------------------------------------------------------

/** Trigger server-side achievement evaluation. No-op in local mode. */
export const evaluateAchievementsCloud = isCloudMode()
  ? cloud.evaluateAchievementsRpc
  : async () => [];

/** True when a fresh cloud signin still needs the local→cloud first-sync. */
export const isFirstSyncNeeded = isCloudMode() ? cloud.isFirstSyncNeeded : async () => false;

/** Push a local snapshot to the cloud account. Cloud-only. */
export const performFirstSync = isCloudMode()
  ? cloud.performFirstSync
  : async (_snap: cloud.BackupSnapshot) => {};

export const markFirstSyncDone = isCloudMode() ? cloud.markFirstSyncDone : () => {};
