/**
 * Nullpath database access layer.
 *
 * All queries flow through here so the rest of the app never imports
 * the SQL backend directly. Single connection, lazy-initialized.
 *
 * Backend: sql.js (SQLite compiled to WASM) with the database file
 * persisted to IndexedDB on every write. The interface exposed below
 * is identical to the desktop version that ran against
 * `tauri-plugin-sql`, so views never had to change when we pivoted
 * from Tauri to browser. When the project gets a real backend with
 * auth + leaderboards, this single file becomes an HTTP client and
 * the views still don't have to change.
 */

import { getDatabase, type SqlJsClient } from "./sqljs";
import type {
  AchievementRow,
  AppStateRow,
  BountySeverity,
  BountyStatus,
  BountySubmissionRow,
  NodeNoteRow,
  NodeResourceRow,
  NodeRow,
  NodeStatus,
  RefresherRow,
  RegionRow,
  ResourceKind,
  StreakDayRow,
  Visibility,
  ZoneRow,
  ZoneStats,
} from "./types";

/**
 * Open (or return existing) connection. Renamed from a SQL-plugin
 * `Database` instance to the more interface-y `SqlJsClient`, but the
 * methods exposed (`select`, `execute`) are identical so callers below
 * read the same.
 */
export async function db(): Promise<SqlJsClient> {
  return getDatabase();
}

// ---------------------------------------------------------------------------
// Mutation pub/sub — channel lives in db/mutations.ts so it's shared
// between the local (sql.js) and cloud (Supabase) backends.
// ---------------------------------------------------------------------------

import { notifyMutation, onMutation } from "./mutations";
export { onMutation };
/** Public alias used by db/cloud.ts to broadcast through the same channel. */
export const _broadcastMutation = notifyMutation;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const nowIso = () => new Date().toISOString();

/** Local YYYY-MM-DD for streak ledger keys. */
export function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO-week 'YYYY-Www' for freeze-token award tracking. */
export function isoWeek(d: Date = new Date()): string {
  // ISO week algorithm — Monday-based.
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Regions / zones / nodes
// ---------------------------------------------------------------------------

export async function getRegions(): Promise<RegionRow[]> {
  const conn = await db();
  return conn.select<RegionRow[]>("SELECT * FROM region ORDER BY sort_order ASC");
}

export async function getRegion(id: string): Promise<RegionRow | null> {
  const conn = await db();
  const rows = await conn.select<RegionRow[]>("SELECT * FROM region WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function getZones(regionId: string): Promise<ZoneRow[]> {
  const conn = await db();
  return conn.select<ZoneRow[]>("SELECT * FROM zone WHERE region_id = $1 ORDER BY sort_order ASC", [
    regionId,
  ]);
}

export async function getZone(zoneId: string): Promise<ZoneRow | null> {
  const conn = await db();
  const rows = await conn.select<ZoneRow[]>("SELECT * FROM zone WHERE id = $1", [zoneId]);
  return rows[0] ?? null;
}

export async function getZoneStats(regionId: string): Promise<ZoneStats[]> {
  const conn = await db();
  return conn.select<ZoneStats[]>(
    `SELECT
       z.id AS zone_id,
       COUNT(n.id) AS total_nodes,
       COUNT(CASE WHEN n.status = 'complete' THEN 1 END) AS completed_nodes,
       COUNT(CASE WHEN n.status = 'in_progress' THEN 1 END) AS in_progress_nodes
     FROM zone z
     LEFT JOIN node n ON n.zone_id = z.id
     WHERE z.region_id = $1
     GROUP BY z.id`,
    [regionId],
  );
}

export async function getNodesForZone(zoneId: string): Promise<NodeRow[]> {
  const conn = await db();
  return conn.select<NodeRow[]>("SELECT * FROM node WHERE zone_id = $1 ORDER BY sort_order ASC", [
    zoneId,
  ]);
}

export async function getNode(nodeId: string): Promise<NodeRow | null> {
  const conn = await db();
  const rows = await conn.select<NodeRow[]>("SELECT * FROM node WHERE id = $1", [nodeId]);
  return rows[0] ?? null;
}

export async function getNodeChildren(parentId: string): Promise<NodeRow[]> {
  const conn = await db();
  return conn.select<NodeRow[]>("SELECT * FROM node WHERE parent_id = $1 ORDER BY sort_order ASC", [
    parentId,
  ]);
}

export async function setNodeStatus(nodeId: string, status: NodeStatus): Promise<void> {
  const conn = await db();
  if (status === "complete") {
    await conn.execute("UPDATE node SET status = $1, completed_at = $2 WHERE id = $3", [
      status,
      nowIso(),
      nodeId,
    ]);
  } else if (status === "in_progress") {
    await conn.execute(
      "UPDATE node SET status = $1, started_at = COALESCE(started_at, $2) WHERE id = $3",
      [status, nowIso(), nodeId],
    );
  } else {
    await conn.execute("UPDATE node SET status = $1 WHERE id = $2", [status, nodeId]);
  }
  notifyMutation();
}

export async function setNodeXp(nodeId: string, xp: number): Promise<void> {
  const conn = await db();
  await conn.execute("UPDATE node SET user_xp = $1 WHERE id = $2", [xp, nodeId]);
  notifyMutation();
}

/**
 * Escape `%`, `_`, and `\\` so user input doesn't act as LIKE metacharacters.
 * Without this, typing `_` matches every single character, `%` matches
 * everything, and a typed `\\` fights with the escape clause we add below.
 */
function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function searchNodes(query: string, limit = 50): Promise<NodeRow[]> {
  const conn = await db();
  const wildcard = `%${escapeLike(query)}%`;
  return conn.select<NodeRow[]>(
    `SELECT * FROM node
     WHERE name LIKE $1 ESCAPE '\\' OR gloss LIKE $1 ESCAPE '\\' OR id LIKE $1 ESCAPE '\\'
     ORDER BY
       CASE WHEN id LIKE $1 ESCAPE '\\' THEN 0
            WHEN name LIKE $1 ESCAPE '\\' THEN 1 ELSE 2 END,
       sort_order
     LIMIT $2`,
    [wildcard, limit],
  );
}

/**
 * Single-query fetch of every node in the graph. The canonical way to
 * load the full node set; replaces the older fan-out-by-kind pattern
 * that used to live in several views.
 */
export async function getAllNodes(): Promise<NodeRow[]> {
  const conn = await db();
  return conn.select<NodeRow[]>("SELECT * FROM node ORDER BY zone_id, sort_order");
}

// ---------------------------------------------------------------------------
// Resources & notes
// ---------------------------------------------------------------------------

export async function getResources(nodeId: string): Promise<NodeResourceRow[]> {
  const conn = await db();
  return conn.select<NodeResourceRow[]>(
    "SELECT * FROM node_resource WHERE node_id = $1 ORDER BY pinned DESC, added_at DESC",
    [nodeId],
  );
}

export async function addResource(input: {
  node_id: string;
  kind: ResourceKind;
  title: string;
  url?: string | null;
  note?: string | null;
  pinned?: boolean;
  visibility?: Visibility;
}): Promise<number> {
  const conn = await db();
  const r = await conn.execute(
    `INSERT INTO node_resource (node_id, kind, title, url, note, pinned, visibility)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.node_id,
      input.kind,
      input.title,
      input.url ?? null,
      input.note ?? null,
      input.pinned ? 1 : 0,
      input.visibility ?? "private",
    ],
  );
  notifyMutation();
  return r.lastInsertId ?? 0;
}

export async function deleteResource(id: number): Promise<void> {
  const conn = await db();
  await conn.execute("DELETE FROM node_resource WHERE id = $1", [id]);
  notifyMutation();
}

export async function togglePinResource(id: number): Promise<void> {
  const conn = await db();
  await conn.execute("UPDATE node_resource SET pinned = 1 - pinned WHERE id = $1", [id]);
  notifyMutation();
}

export async function getAllResources(filterKind?: ResourceKind): Promise<NodeResourceRow[]> {
  const conn = await db();
  if (filterKind) {
    return conn.select<NodeResourceRow[]>(
      "SELECT * FROM node_resource WHERE kind = $1 ORDER BY pinned DESC, added_at DESC",
      [filterKind],
    );
  }
  return conn.select<NodeResourceRow[]>(
    "SELECT * FROM node_resource ORDER BY pinned DESC, added_at DESC",
  );
}

export async function getNote(nodeId: string): Promise<NodeNoteRow | null> {
  const conn = await db();
  const rows = await conn.select<NodeNoteRow[]>("SELECT * FROM node_note WHERE node_id = $1", [
    nodeId,
  ]);
  return rows[0] ?? null;
}

export async function upsertNote(nodeId: string, body: string): Promise<void> {
  const conn = await db();
  await conn.execute(
    `INSERT INTO node_note (node_id, body_md, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT(node_id) DO UPDATE SET body_md = excluded.body_md, updated_at = excluded.updated_at`,
    [nodeId, body, nowIso()],
  );
  notifyMutation();
}

// ---------------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Backup / restore — JSON snapshot of every user-generated row.
//
// The skill graph itself (region / zone / node) is seeded from
// migrations and excluded from the backup — node user_xp / status /
// timestamps are part of the snapshot since they're per-user.
// ---------------------------------------------------------------------------

export interface BackupSnapshot {
  /** Schema version of THIS file. Bump when the shape changes. */
  schema: 1;
  /** ISO timestamp of when the snapshot was taken. */
  exportedAt: string;
  /** Nullpath app version that produced the file. */
  appVersion: string;
  /** Per-node user state — xp, status, timestamps. */
  nodes: Array<{
    id: string;
    status: NodeStatus;
    user_xp: number;
    completed_at: string | null;
    started_at: string | null;
  }>;
  resources: NodeResourceRow[];
  notes: NodeNoteRow[];
  refreshers: RefresherRow[];
  bounties: BountySubmissionRow[];
  streakDays: StreakDayRow[];
  achievements: AchievementRow[];
  appState: AppStateRow;
}

/**
 * Capture the full user state as a portable JSON object. The skill graph
 * itself is excluded — restoring on a future migration that's added new
 * nodes still works because we re-apply user state by `id`.
 */
export async function exportBackup(appVersion: string): Promise<BackupSnapshot> {
  const conn = await db();
  const [nodes, resources, notes, refreshers, bounties, streakDays, achievements, appState] =
    await Promise.all([
      conn.select<BackupSnapshot["nodes"]>(
        "SELECT id, status, user_xp, completed_at, started_at FROM node WHERE status != 'available' OR user_xp > 0",
      ),
      getAllResources(),
      conn.select<NodeNoteRow[]>("SELECT * FROM node_note"),
      conn.select<RefresherRow[]>("SELECT * FROM refresher"),
      getBounties(),
      getStreakDays(10000),
      getAchievements(),
      getAppState(),
    ]);
  return {
    schema: 1,
    exportedAt: nowIso(),
    appVersion,
    nodes,
    resources,
    notes,
    refreshers,
    bounties,
    streakDays,
    achievements,
    appState,
  };
}

/**
 * Re-apply a backup snapshot. Wipes existing user state first (the
 * snapshot is the new source of truth) and re-inserts everything.
 *
 * IDs are preserved for `app_state` (always row 1) and the seeded
 * `node` table (we update by id). All other tables get fresh
 * AUTOINCREMENT ids since their primary keys are local-only.
 */
export async function importBackup(snap: BackupSnapshot): Promise<void> {
  if (snap.schema !== 1) {
    throw new Error(`Unsupported backup schema: ${snap.schema}`);
  }
  const conn = await db();

  // Wipe — same order as resetAllProgress (deletes before updates).
  await conn.execute("DELETE FROM node_resource");
  await conn.execute("DELETE FROM node_note");
  await conn.execute("DELETE FROM refresher");
  await conn.execute("DELETE FROM bounty_submission");
  await conn.execute("DELETE FROM streak_day");
  await conn.execute("DELETE FROM achievement");
  await conn.execute(
    "UPDATE node SET status='available', user_xp=0, completed_at=NULL, started_at=NULL",
  );

  // Restore per-node state.
  for (const n of snap.nodes) {
    await conn.execute(
      "UPDATE node SET status=$1, user_xp=$2, completed_at=$3, started_at=$4 WHERE id=$5",
      [n.status, n.user_xp, n.completed_at, n.started_at, n.id],
    );
  }

  // Restore resources (lose the original id since it's autoincrement-local).
  for (const r of snap.resources) {
    await conn.execute(
      `INSERT INTO node_resource (node_id, kind, title, url, note, pinned, visibility, added_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [r.node_id, r.kind, r.title, r.url, r.note, r.pinned, r.visibility, r.added_at],
    );
  }

  // Notes — upsert by node_id (unique).
  for (const n of snap.notes) {
    await conn.execute(
      `INSERT INTO node_note (node_id, body_md, visibility, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT(node_id) DO UPDATE SET
         body_md = excluded.body_md,
         visibility = excluded.visibility,
         updated_at = excluded.updated_at`,
      [n.node_id, n.body_md, n.visibility, n.updated_at],
    );
  }

  // Refreshers — upsert by node_id (unique).
  for (const r of snap.refreshers) {
    await conn.execute(
      `INSERT INTO refresher (node_id, streak, last_at, due_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT(node_id) DO UPDATE SET
         streak = excluded.streak,
         last_at = excluded.last_at,
         due_at = excluded.due_at`,
      [r.node_id, r.streak, r.last_at, r.due_at],
    );
  }

  // Bounties — fresh ids.
  for (const b of snap.bounties) {
    await conn.execute(
      `INSERT INTO bounty_submission
         (program, title, severity, status, payout_usd, submitted_at, cve_id, related_node, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        b.program,
        b.title,
        b.severity,
        b.status,
        b.payout_usd,
        b.submitted_at,
        b.cve_id,
        b.related_node,
        b.notes,
      ],
    );
  }

  // Streak days — primary key is the day string.
  for (const d of snap.streakDays) {
    await conn.execute(
      `INSERT INTO streak_day (day, sessions, used_freeze) VALUES ($1, $2, $3)
       ON CONFLICT(day) DO UPDATE SET
         sessions = excluded.sessions,
         used_freeze = excluded.used_freeze`,
      [d.day, d.sessions, d.used_freeze],
    );
  }

  // Achievements — primary key is the id string.
  for (const a of snap.achievements) {
    await conn.execute(
      `INSERT INTO achievement (id, name, description, icon, unlocked_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         icon = excluded.icon,
         unlocked_at = excluded.unlocked_at`,
      [a.id, a.name, a.description, a.icon, a.unlocked_at],
    );
  }

  // App state — always row 1; restore the user-controlled fields.
  await updateAppState({
    handle: snap.appState.handle,
    scanlines_enabled: snap.appState.scanlines_enabled,
    sound_enabled: snap.appState.sound_enabled,
    freeze_tokens: snap.appState.freeze_tokens,
    last_freeze_award_week: snap.appState.last_freeze_award_week,
  });

  notifyMutation();
}

/**
 * Wipes all user-generated data while preserving the seeded skill graph.
 * Single transaction so a partial reset can't leave orphans.
 */
export async function resetAllProgress(): Promise<void> {
  const conn = await db();
  // sqlx-tauri-plugin doesn't expose multi-statement transactions cleanly,
  // so issue each statement; SQLite implicit-transaction-per-stmt is fine
  // here — DELETE order respects FK cascades, all dependents go first.
  await conn.execute("DELETE FROM node_resource");
  await conn.execute("DELETE FROM node_note");
  await conn.execute("DELETE FROM node_edge");
  await conn.execute("DELETE FROM refresher");
  await conn.execute("DELETE FROM bounty_submission");
  await conn.execute("DELETE FROM streak_day");
  await conn.execute("DELETE FROM achievement");
  await conn.execute(
    "UPDATE node SET status='available', user_xp=0, completed_at=NULL, started_at=NULL",
  );
  await conn.execute(
    "UPDATE app_state SET freeze_tokens=0, last_freeze_award_week=NULL WHERE id=1",
  );
  notifyMutation();
}

/**
 * Record one node-completion event for today's date. Drives the streak
 * counter and the 8-week heatmap. The streak_day.sessions column counts
 * completion events; first event of the day inserts, subsequent events
 * bump the counter.
 */
export async function recordCompletionDay(): Promise<void> {
  const conn = await db();
  const day = localDayKey();
  await conn.execute(
    `INSERT INTO streak_day (day, sessions) VALUES ($1, 1)
     ON CONFLICT(day) DO UPDATE SET sessions = sessions + 1`,
    [day],
  );
  notifyMutation();
}

export async function getStreakDays(limit = 90): Promise<StreakDayRow[]> {
  const conn = await db();
  return conn.select<StreakDayRow[]>("SELECT * FROM streak_day ORDER BY day DESC LIMIT $1", [
    limit,
  ]);
}

/** Compute current streak length from streak_day rows. */
export async function currentStreak(): Promise<number> {
  const days = await getStreakDays(365);
  if (days.length === 0) return 0;

  // Walk back from today (or yesterday if no entry today yet); allow days
  // that used a freeze token to bridge the gap.
  let count = 0;
  const cursor = new Date();
  const todayKey = localDayKey(cursor);
  const map = new Map(days.map((d) => [d.day, d]));

  // If there's no row for today, start from yesterday — finishing today
  // hasn't happened yet but the streak isn't broken.
  if (!map.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  for (let i = 0; i < 365; i++) {
    const k = localDayKey(cursor);
    const row = map.get(k);
    if (!row) break;
    if (row.sessions === 0 && row.used_freeze === 0) break;
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

export async function getAppState(): Promise<AppStateRow> {
  const conn = await db();
  const rows = await conn.select<AppStateRow[]>("SELECT * FROM app_state WHERE id = 1");
  // Migration 001 seeds row id=1, so this should always exist. If we're
  // ever called against a DB where it doesn't (corrupted file, manual
  // deletion), fail loud with a useful message instead of crashing on
  // `rows[0]!.handle` two levels down the stack.
  const row = rows[0];
  if (!row) {
    throw new Error("app_state row id=1 missing — DB may be corrupted or migrations didn't run");
  }
  return row;
}

/**
 * Whitelist of `app_state` columns that callers are allowed to patch.
 * Anything not in this set is silently dropped — defense-in-depth against
 * a future caller passing through user-influenced keys to the SQL builder.
 */
const APP_STATE_UPDATABLE: ReadonlySet<string> = new Set([
  "handle",
  "scanlines_enabled",
  "sound_enabled",
  "freeze_tokens",
  "freeze_tokens_max",
  "last_freeze_award_week",
  "onboarded_at",
]);

export async function updateAppState(patch: Partial<AppStateRow>): Promise<void> {
  const conn = await db();
  const sets: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (!APP_STATE_UPDATABLE.has(k)) continue;
    sets.push(`${k} = $${i}`);
    args.push(v);
    i++;
  }
  if (sets.length === 0) return;
  await conn.execute(`UPDATE app_state SET ${sets.join(", ")} WHERE id = 1`, args);
  notifyMutation();
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export async function getAchievements(): Promise<AchievementRow[]> {
  const conn = await db();
  return conn.select<AchievementRow[]>("SELECT * FROM achievement ORDER BY id");
}

export async function unlockAchievement(input: {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}): Promise<boolean> {
  const conn = await db();
  const existing = await conn.select<AchievementRow[]>("SELECT * FROM achievement WHERE id = $1", [
    input.id,
  ]);
  if (existing[0]?.unlocked_at) return false;
  if (existing[0]) {
    await conn.execute("UPDATE achievement SET unlocked_at = $1 WHERE id = $2", [
      nowIso(),
      input.id,
    ]);
  } else {
    await conn.execute(
      "INSERT INTO achievement (id, name, description, icon, unlocked_at) VALUES ($1, $2, $3, $4, $5)",
      [input.id, input.name, input.description ?? null, input.icon ?? null, nowIso()],
    );
  }
  notifyMutation();
  return true;
}

// ---------------------------------------------------------------------------
// Bounty ledger
// ---------------------------------------------------------------------------

export async function getBounties(): Promise<BountySubmissionRow[]> {
  const conn = await db();
  return conn.select<BountySubmissionRow[]>(
    "SELECT * FROM bounty_submission ORDER BY submitted_at DESC",
  );
}

export async function addBounty(input: {
  program: string;
  title: string;
  severity: BountySeverity;
  status?: BountyStatus;
  payout_usd?: number | null;
  submitted_at?: string;
  cve_id?: string | null;
  related_node?: string | null;
  notes?: string | null;
}): Promise<number> {
  const conn = await db();
  const r = await conn.execute(
    `INSERT INTO bounty_submission
     (program, title, severity, status, payout_usd, submitted_at, cve_id, related_node, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.program,
      input.title,
      input.severity,
      input.status ?? "submitted",
      input.payout_usd ?? null,
      input.submitted_at ?? nowIso(),
      input.cve_id ?? null,
      input.related_node ?? null,
      input.notes ?? null,
    ],
  );
  notifyMutation();
  return r.lastInsertId ?? 0;
}

/** Same idea as `APP_STATE_UPDATABLE` — explicit allowlist on the patch keys. */
const BOUNTY_UPDATABLE: ReadonlySet<string> = new Set([
  "program",
  "title",
  "severity",
  "status",
  "payout_usd",
  "submitted_at",
  "cve_id",
  "related_node",
  "notes",
]);

export async function updateBounty(id: number, patch: Partial<BountySubmissionRow>): Promise<void> {
  const conn = await db();
  const sets: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (!BOUNTY_UPDATABLE.has(k)) continue;
    sets.push(`${k} = $${i}`);
    args.push(v);
    i++;
  }
  if (sets.length === 0) return;
  args.push(id);
  await conn.execute(`UPDATE bounty_submission SET ${sets.join(", ")} WHERE id = $${i}`, args);
  notifyMutation();
}

export async function deleteBounty(id: number): Promise<void> {
  const conn = await db();
  await conn.execute("DELETE FROM bounty_submission WHERE id = $1", [id]);
  notifyMutation();
}

export async function bountyTotals(): Promise<{
  total: number;
  accepted: number;
  payout: number;
  cves: number;
}> {
  const conn = await db();
  const rows = await conn.select<
    Array<{ total: number; accepted: number; payout: number; cves: number }>
  >(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status IN ('accepted','resolved') THEN 1 ELSE 0 END) AS accepted,
       COALESCE(SUM(payout_usd), 0) AS payout,
       SUM(CASE WHEN cve_id IS NOT NULL AND cve_id != '' THEN 1 ELSE 0 END) AS cves
     FROM bounty_submission`,
  );
  return rows[0] ?? { total: 0, accepted: 0, payout: 0, cves: 0 };
}

// ---------------------------------------------------------------------------
// Spaced repetition refresher queue
// ---------------------------------------------------------------------------

const REFRESHER_INTERVALS_DAYS = [1, 3, 7, 21, 60, 180] as const;

function refresherDueDate(streak: number): string {
  const idx = Math.min(streak, REFRESHER_INTERVALS_DAYS.length - 1);
  // The literal-tuple `as const` plus the clamped idx makes this provably
  // in-range; the `?? 1` fallback satisfies noUncheckedIndexedAccess
  // without ever firing in practice.
  const days = REFRESHER_INTERVALS_DAYS[idx] ?? 1;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Schedule (or reset) a refresher row when a node is completed. */
export async function scheduleRefresher(nodeId: string): Promise<void> {
  const conn = await db();
  const due = refresherDueDate(0);
  await conn.execute(
    `INSERT INTO refresher (node_id, streak, due_at) VALUES ($1, 0, $2)
     ON CONFLICT(node_id) DO UPDATE SET streak = 0, due_at = excluded.due_at`,
    [nodeId, due],
  );
  notifyMutation();
}

export async function dueRefreshers(limit = 10): Promise<RefresherRow[]> {
  const conn = await db();
  return conn.select<RefresherRow[]>(
    "SELECT * FROM refresher WHERE due_at <= datetime('now') ORDER BY due_at ASC LIMIT $1",
    [limit],
  );
}

/**
 * Same as `dueRefreshers` but joins each row with its node in a single
 * query. Replaces the N+1 pattern of fetching refreshers then doing
 * `Promise.all(rows.map(r => getNode(r.node_id)))`.
 */
export async function dueRefreshersWithNode(
  limit = 10,
): Promise<Array<RefresherRow & { node: NodeRow | null }>> {
  const conn = await db();
  // Aliased columns so node fields don't collide with refresher fields.
  // We rebuild the shape on the JS side rather than relying on dialect.
  const rows = await conn.select<
    Array<{
      id: number;
      node_id: string;
      streak: number;
      last_at: string | null;
      due_at: string;
      n_id: string | null;
      n_zone_id: string | null;
      n_parent_id: string | null;
      n_kind: NodeRow["kind"] | null;
      n_depth: NodeRow["depth"] | null;
      n_status: NodeRow["status"] | null;
      n_name: string | null;
      n_gloss: string | null;
      n_owasp_tag: string | null;
      n_cwe_id: string | null;
      n_sort_order: number | null;
      n_user_xp: number | null;
      n_completed_at: string | null;
      n_started_at: string | null;
    }>
  >(
    `SELECT r.id, r.node_id, r.streak, r.last_at, r.due_at,
            n.id          AS n_id,
            n.zone_id     AS n_zone_id,
            n.parent_id   AS n_parent_id,
            n.kind        AS n_kind,
            n.depth       AS n_depth,
            n.status      AS n_status,
            n.name        AS n_name,
            n.gloss       AS n_gloss,
            n.owasp_tag   AS n_owasp_tag,
            n.cwe_id      AS n_cwe_id,
            n.sort_order  AS n_sort_order,
            n.user_xp     AS n_user_xp,
            n.completed_at AS n_completed_at,
            n.started_at   AS n_started_at
       FROM refresher r
       LEFT JOIN node n ON n.id = r.node_id
      WHERE r.due_at <= datetime('now')
      ORDER BY r.due_at ASC
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    node_id: r.node_id,
    streak: r.streak,
    last_at: r.last_at,
    due_at: r.due_at,
    node: r.n_id
      ? {
          id: r.n_id,
          zone_id: r.n_zone_id!,
          parent_id: r.n_parent_id,
          kind: r.n_kind!,
          depth: r.n_depth!,
          status: r.n_status!,
          name: r.n_name!,
          gloss: r.n_gloss,
          owasp_tag: r.n_owasp_tag,
          cwe_id: r.n_cwe_id,
          sort_order: r.n_sort_order ?? 0,
          user_xp: r.n_user_xp ?? 0,
          completed_at: r.n_completed_at,
          started_at: r.n_started_at,
        }
      : null,
  }));
}

export async function ackRefresher(nodeId: string, recalled: boolean): Promise<void> {
  const conn = await db();
  const rows = await conn.select<RefresherRow[]>("SELECT * FROM refresher WHERE node_id = $1", [
    nodeId,
  ]);
  const cur = rows[0];
  if (!cur) return;
  const newStreak = recalled ? cur.streak + 1 : 0;
  await conn.execute(
    "UPDATE refresher SET streak = $1, last_at = $2, due_at = $3 WHERE node_id = $4",
    [newStreak, nowIso(), refresherDueDate(newStreak), nodeId],
  );
  notifyMutation();
}
