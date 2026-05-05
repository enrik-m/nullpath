/**
 * Nullpath database access layer.
 *
 * All queries flow through here so the rest of the app never imports
 * the SQL plugin directly. Single connection, lazy-initialized.
 */

import Database from "@tauri-apps/plugin-sql";
import type {
  AchievementRow,
  AppStateRow,
  BountySeverity,
  BountyStatus,
  BountySubmissionRow,
  NodeEdgeRow,
  NodeKind,
  NodeNoteRow,
  NodeResourceRow,
  NodeRow,
  NodeStatus,
  RefresherRow,
  RegionRow,
  ResourceKind,
  SessionRow,
  StreakDayRow,
  Visibility,
  ZoneRow,
  ZoneStats,
} from "./types";

let _db: Database | null = null;

/** Open (or return existing) connection to the local SQLite file. */
export async function db(): Promise<Database> {
  if (_db) return _db;
  _db = await Database.load("sqlite:nullpath.db");
  return _db;
}

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
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Regions / zones / nodes
// ---------------------------------------------------------------------------

export async function getRegions(): Promise<RegionRow[]> {
  const conn = await db();
  return conn.select<RegionRow[]>(
    "SELECT * FROM region ORDER BY sort_order ASC",
  );
}

export async function getRegion(id: string): Promise<RegionRow | null> {
  const conn = await db();
  const rows = await conn.select<RegionRow[]>(
    "SELECT * FROM region WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function getZones(regionId: string): Promise<ZoneRow[]> {
  const conn = await db();
  return conn.select<ZoneRow[]>(
    "SELECT * FROM zone WHERE region_id = $1 ORDER BY sort_order ASC",
    [regionId],
  );
}

export async function getZone(zoneId: string): Promise<ZoneRow | null> {
  const conn = await db();
  const rows = await conn.select<ZoneRow[]>(
    "SELECT * FROM zone WHERE id = $1",
    [zoneId],
  );
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
  return conn.select<NodeRow[]>(
    "SELECT * FROM node WHERE zone_id = $1 ORDER BY sort_order ASC",
    [zoneId],
  );
}

export async function getNode(nodeId: string): Promise<NodeRow | null> {
  const conn = await db();
  const rows = await conn.select<NodeRow[]>(
    "SELECT * FROM node WHERE id = $1",
    [nodeId],
  );
  return rows[0] ?? null;
}

export async function getNodeChildren(parentId: string): Promise<NodeRow[]> {
  const conn = await db();
  return conn.select<NodeRow[]>(
    "SELECT * FROM node WHERE parent_id = $1 ORDER BY sort_order ASC",
    [parentId],
  );
}

export async function setNodeStatus(
  nodeId: string,
  status: NodeStatus,
): Promise<void> {
  const conn = await db();
  if (status === "complete") {
    await conn.execute(
      "UPDATE node SET status = $1, completed_at = $2 WHERE id = $3",
      [status, nowIso(), nodeId],
    );
  } else if (status === "in_progress") {
    await conn.execute(
      "UPDATE node SET status = $1, started_at = COALESCE(started_at, $2) WHERE id = $3",
      [status, nowIso(), nodeId],
    );
  } else {
    await conn.execute(
      "UPDATE node SET status = $1 WHERE id = $2",
      [status, nodeId],
    );
  }
}

export async function setNodeXp(nodeId: string, xp: number): Promise<void> {
  const conn = await db();
  await conn.execute("UPDATE node SET user_xp = $1 WHERE id = $2", [xp, nodeId]);
}

export async function searchNodes(query: string, limit = 50): Promise<NodeRow[]> {
  const conn = await db();
  const wildcard = `%${query}%`;
  return conn.select<NodeRow[]>(
    `SELECT * FROM node
     WHERE name LIKE $1 OR gloss LIKE $1 OR id LIKE $1
     ORDER BY
       CASE WHEN id LIKE $1 THEN 0 WHEN name LIKE $1 THEN 1 ELSE 2 END,
       sort_order
     LIMIT $2`,
    [wildcard, limit],
  );
}

export async function nodesByKind(kind: NodeKind): Promise<NodeRow[]> {
  const conn = await db();
  return conn.select<NodeRow[]>(
    "SELECT * FROM node WHERE kind = $1 ORDER BY zone_id, sort_order",
    [kind],
  );
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
  return r.lastInsertId ?? 0;
}

export async function deleteResource(id: number): Promise<void> {
  const conn = await db();
  await conn.execute("DELETE FROM node_resource WHERE id = $1", [id]);
}

export async function togglePinResource(id: number): Promise<void> {
  const conn = await db();
  await conn.execute(
    "UPDATE node_resource SET pinned = 1 - pinned WHERE id = $1",
    [id],
  );
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
  const rows = await conn.select<NodeNoteRow[]>(
    "SELECT * FROM node_note WHERE node_id = $1",
    [nodeId],
  );
  return rows[0] ?? null;
}

export async function upsertNote(nodeId: string, body: string): Promise<void> {
  const conn = await db();
  await conn.execute(
    `INSERT INTO node_note (node_id, body_md, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT(node_id) DO UPDATE SET body_md = excluded.body_md, updated_at = excluded.updated_at`,
    [nodeId, body, nowIso()],
  );
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function startSession(focusNodeId: string | null): Promise<number> {
  const conn = await db();
  const r = await conn.execute(
    "INSERT INTO session (started_at, focus_node_id) VALUES ($1, $2)",
    [nowIso(), focusNodeId],
  );
  return r.lastInsertId ?? 0;
}

export async function updateSession(
  id: number,
  patch: { duration_seconds?: number; idle_seconds?: number; focus_node_id?: string | null; note?: string | null },
): Promise<void> {
  const conn = await db();
  const sets: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    sets.push(`${k} = $${i}`);
    args.push(v);
    i++;
  }
  if (sets.length === 0) return;
  args.push(id);
  await conn.execute(`UPDATE session SET ${sets.join(", ")} WHERE id = $${i}`, args);
}

export async function endSession(
  id: number,
  duration_seconds: number,
  idle_seconds: number,
  auto_ended: boolean,
): Promise<void> {
  const conn = await db();
  await conn.execute(
    `UPDATE session
     SET ended_at = $1, duration_seconds = $2, idle_seconds = $3, auto_ended = $4
     WHERE id = $5`,
    [nowIso(), duration_seconds, idle_seconds, auto_ended ? 1 : 0, id],
  );
}

export async function recentSessions(limit = 20): Promise<SessionRow[]> {
  const conn = await db();
  return conn.select<SessionRow[]>(
    "SELECT * FROM session WHERE ended_at IS NOT NULL ORDER BY started_at DESC LIMIT $1",
    [limit],
  );
}

export async function totalStudySeconds(): Promise<number> {
  const conn = await db();
  const rows = await conn.select<{ total: number }[]>(
    "SELECT COALESCE(SUM(duration_seconds), 0) AS total FROM session",
  );
  return rows[0]?.total ?? 0;
}

export async function studySecondsByZone(): Promise<Array<{ zone_id: string; seconds: number }>> {
  const conn = await db();
  return conn.select<Array<{ zone_id: string; seconds: number }>>(
    `SELECT n.zone_id AS zone_id, COALESCE(SUM(s.duration_seconds), 0) AS seconds
     FROM session s
     JOIN node n ON n.id = s.focus_node_id
     WHERE s.ended_at IS NOT NULL
     GROUP BY n.zone_id`,
  );
}

// ---------------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------------

export async function recordStudyDay(seconds: number): Promise<void> {
  const conn = await db();
  const day = localDayKey();
  await conn.execute(
    `INSERT INTO streak_day (day, sessions, seconds_studied) VALUES ($1, 1, $2)
     ON CONFLICT(day) DO UPDATE SET sessions = sessions + 1, seconds_studied = seconds_studied + excluded.seconds_studied`,
    [day, seconds],
  );
}

export async function getStreakDays(limit = 90): Promise<StreakDayRow[]> {
  const conn = await db();
  return conn.select<StreakDayRow[]>(
    "SELECT * FROM streak_day ORDER BY day DESC LIMIT $1",
    [limit],
  );
}

/** Compute current streak length from streak_day rows. */
export async function currentStreak(): Promise<number> {
  const days = await getStreakDays(365);
  if (days.length === 0) return 0;

  // Walk back from today (or yesterday if no entry today yet); allow days
  // that used a freeze token to bridge the gap.
  let count = 0;
  let cursor = new Date();
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
  return rows[0]!;
}

export async function updateAppState(patch: Partial<AppStateRow>): Promise<void> {
  const conn = await db();
  const sets: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id") continue;
    sets.push(`${k} = $${i}`);
    args.push(v);
    i++;
  }
  if (sets.length === 0) return;
  await conn.execute(`UPDATE app_state SET ${sets.join(", ")} WHERE id = 1`, args);
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
  const existing = await conn.select<AchievementRow[]>(
    "SELECT * FROM achievement WHERE id = $1",
    [input.id],
  );
  if (existing[0]?.unlocked_at) return false;
  if (existing[0]) {
    await conn.execute(
      "UPDATE achievement SET unlocked_at = $1 WHERE id = $2",
      [nowIso(), input.id],
    );
  } else {
    await conn.execute(
      "INSERT INTO achievement (id, name, description, icon, unlocked_at) VALUES ($1, $2, $3, $4, $5)",
      [input.id, input.name, input.description ?? null, input.icon ?? null, nowIso()],
    );
  }
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
  return r.lastInsertId ?? 0;
}

export async function updateBounty(
  id: number,
  patch: Partial<BountySubmissionRow>,
): Promise<void> {
  const conn = await db();
  const sets: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id") continue;
    sets.push(`${k} = $${i}`);
    args.push(v);
    i++;
  }
  if (sets.length === 0) return;
  args.push(id);
  await conn.execute(`UPDATE bounty_submission SET ${sets.join(", ")} WHERE id = $${i}`, args);
}

export async function deleteBounty(id: number): Promise<void> {
  const conn = await db();
  await conn.execute("DELETE FROM bounty_submission WHERE id = $1", [id]);
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

const REFRESHER_INTERVALS_DAYS = [1, 3, 7, 21, 60, 180];

function refresherDueDate(streak: number): string {
  const idx = Math.min(streak, REFRESHER_INTERVALS_DAYS.length - 1);
  const days = REFRESHER_INTERVALS_DAYS[idx];
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
}

export async function dueRefreshers(limit = 10): Promise<RefresherRow[]> {
  const conn = await db();
  return conn.select<RefresherRow[]>(
    "SELECT * FROM refresher WHERE due_at <= datetime('now') ORDER BY due_at ASC LIMIT $1",
    [limit],
  );
}

export async function ackRefresher(nodeId: string, recalled: boolean): Promise<void> {
  const conn = await db();
  const rows = await conn.select<RefresherRow[]>(
    "SELECT * FROM refresher WHERE node_id = $1",
    [nodeId],
  );
  const cur = rows[0];
  if (!cur) return;
  const newStreak = recalled ? cur.streak + 1 : 0;
  await conn.execute(
    "UPDATE refresher SET streak = $1, last_at = $2, due_at = $3 WHERE node_id = $4",
    [newStreak, nowIso(), refresherDueDate(newStreak), nodeId],
  );
}

// ---------------------------------------------------------------------------
// Edges (for Trail mode and graph rendering)
// ---------------------------------------------------------------------------

export async function getEdgesForZone(zoneId: string): Promise<NodeEdgeRow[]> {
  const conn = await db();
  return conn.select<NodeEdgeRow[]>(
    `SELECT e.from_id, e.to_id FROM node_edge e
     JOIN node f ON f.id = e.from_id
     JOIN node t ON t.id = e.to_id
     WHERE f.zone_id = $1 AND t.zone_id = $1`,
    [zoneId],
  );
}
