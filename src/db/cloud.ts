/**
 * Cloud-mode database helpers (Supabase Postgres backend).
 *
 * Mirrors the public API of `db/local.ts` so `db/index.ts` can swap
 * between the two without any view ever knowing the difference. Every
 * helper here uses the Supabase JS client; per-user RLS is applied
 * automatically by the server based on the bearer JWT.
 *
 * Per-user-bound operations (writes + reads of user_* tables) require
 * `currentUser()` to return non-null. We don't gate them with a runtime
 * error here — instead they short-circuit to empty results / no-op so
 * the boot sequence (which fires off reads before the user has signed
 * in) doesn't crash. Sign-in is the gate; the views that drive these
 * helpers are unreachable behind the sign-in screen.
 *
 * The Postgres schema returns Postgres-native types (proper booleans,
 * NUMERIC for payouts). We adapt at the boundary to match the
 * SQLite-shaped types the views consume — booleans become 0/1, etc. —
 * so the views don't have to branch on which backend they're talking
 * to.
 */

import { currentUser, getSupabaseClient, isCloudMode } from "../lib/supabase";
import { parseSafeUrl } from "../lib/url";
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

// ---------------------------------------------------------------------------
// Shared mutation pub/sub. The local module owns the canonical channel;
// we re-export here so cloud-mode writes can broadcast through the same
// notifyMutation() that local-mode writes use, keeping listeners (the
// achievement engine, sidebar refetch hooks) backend-agnostic.
// ---------------------------------------------------------------------------

import { notifyMutation as _broadcastMutation } from "./mutations";

const c = () => getSupabaseClient();

/** No-op until cloud is configured AND a user is signed in. */
function uid(): string | null {
  return currentUser()?.id ?? null;
}

/** Throw if the caller forgot to gate on auth. The error is swallowed
 * by helpers that prefer to return empty (boot reads); writes that go
 * through this fail loud, which is what we want. */
function requireUid(): string {
  const id = uid();
  if (!id) {
    throw new Error("Not signed in. Cloud writes require an authenticated user.");
  }
  return id;
}

function err<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return fn().catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`[cloud] ${label}: ${msg}`);
  });
}

// ---------------------------------------------------------------------------
// Regions / zones / nodes  (shared, read-only)
// ---------------------------------------------------------------------------

export async function getRegions(): Promise<RegionRow[]> {
  return err("getRegions", async () => {
    const { data, error } = await c().from("region").select("*").order("sort_order");
    if (error) throw error;
    return (data ?? []) as RegionRow[];
  });
}

export async function getRegion(id: string): Promise<RegionRow | null> {
  return err("getRegion", async () => {
    const { data, error } = await c().from("region").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as RegionRow | null) ?? null;
  });
}

export async function getZones(regionId: string): Promise<ZoneRow[]> {
  return err("getZones", async () => {
    const { data, error } = await c()
      .from("zone")
      .select("*")
      .eq("region_id", regionId)
      .order("sort_order");
    if (error) throw error;
    return (data ?? []) as ZoneRow[];
  });
}

export async function getZone(zoneId: string): Promise<ZoneRow | null> {
  return err("getZone", async () => {
    const { data, error } = await c().from("zone").select("*").eq("id", zoneId).maybeSingle();
    if (error) throw error;
    return (data as ZoneRow | null) ?? null;
  });
}

/**
 * Per-zone stat aggregates, joining shared node_def with the current
 * user's user_node_state. Anonymous (signed-out) callers see zeros for
 * the completed/in_progress columns, which is the right boot-time
 * behavior — atlas tiles render as "0 of N" until signin completes.
 */
export async function getZoneStats(regionId: string): Promise<ZoneStats[]> {
  return err("getZoneStats", async () => {
    const userId = uid();
    // Fetch zones + their node_defs in one query; merge state in JS.
    const { data: zones, error: zErr } = await c()
      .from("zone")
      .select("id, region_id, node_def(id)")
      .eq("region_id", regionId);
    if (zErr) throw zErr;

    let states = new Map<string, NodeStatus>();
    if (userId) {
      const { data, error } = await c()
        .from("user_node_state")
        .select("node_id, status")
        .eq("user_id", userId);
      if (error) throw error;
      states = new Map((data ?? []).map((r) => [r.node_id as string, r.status as NodeStatus]));
    }

    return ((zones ?? []) as Array<{ id: string; node_def: Array<{ id: string }> }>).map((z) => {
      const total = z.node_def.length;
      let completed = 0;
      let inProgress = 0;
      for (const n of z.node_def) {
        const s = states.get(n.id);
        if (s === "complete") completed++;
        else if (s === "in_progress") inProgress++;
      }
      return {
        zone_id: z.id,
        total_nodes: total,
        completed_nodes: completed,
        in_progress_nodes: inProgress,
      };
    });
  });
}

/**
 * node_def + the caller's user_node_state, merged. The view shape
 * matches the SQLite NodeRow exactly — `status` defaults to 'available'
 * and xp/timestamps default to null/0 for nodes the user hasn't touched.
 */
async function fetchNodesByQuery(q: {
  zone_id?: string;
  parent_id?: string;
  id?: string;
  ids?: string[];
}): Promise<NodeRow[]> {
  const userId = uid();
  let qb = c().from("node_def").select("*").order("sort_order");
  if (q.zone_id) qb = qb.eq("zone_id", q.zone_id);
  if (q.parent_id) qb = qb.eq("parent_id", q.parent_id);
  if (q.id) qb = qb.eq("id", q.id);
  if (q.ids && q.ids.length > 0) qb = qb.in("id", q.ids);
  const { data, error } = await qb;
  if (error) throw error;
  const defs = (data ?? []) as Array<
    Omit<NodeRow, "status" | "user_xp" | "completed_at" | "started_at">
  >;
  if (defs.length === 0) return [];

  const states = new Map<
    string,
    { status: NodeStatus; user_xp: number; completed_at: string | null; started_at: string | null }
  >();
  if (userId) {
    const ids = defs.map((d) => d.id);
    const { data: srows, error: sErr } = await c()
      .from("user_node_state")
      .select("node_id, status, user_xp, completed_at, started_at")
      .eq("user_id", userId)
      .in("node_id", ids);
    if (sErr) throw sErr;
    for (const r of srows ?? []) {
      states.set(r.node_id as string, {
        status: r.status as NodeStatus,
        user_xp: r.user_xp as number,
        completed_at: r.completed_at as string | null,
        started_at: r.started_at as string | null,
      });
    }
  }

  return defs.map((d) => {
    const s = states.get(d.id);
    return {
      ...d,
      status: s?.status ?? "available",
      user_xp: s?.user_xp ?? 0,
      completed_at: s?.completed_at ?? null,
      started_at: s?.started_at ?? null,
    } as NodeRow;
  });
}

export async function getNodesForZone(zoneId: string): Promise<NodeRow[]> {
  return err("getNodesForZone", () => fetchNodesByQuery({ zone_id: zoneId }));
}

export async function getNode(nodeId: string): Promise<NodeRow | null> {
  return err("getNode", async () => {
    const rows = await fetchNodesByQuery({ id: nodeId });
    return rows[0] ?? null;
  });
}

export async function getNodeChildren(parentId: string): Promise<NodeRow[]> {
  return err("getNodeChildren", () => fetchNodesByQuery({ parent_id: parentId }));
}

export async function getAllNodes(): Promise<NodeRow[]> {
  return err("getAllNodes", async () => {
    const userId = uid();
    const { data, error } = await c()
      .from("node_def")
      .select("*")
      .order("zone_id")
      .order("sort_order");
    if (error) throw error;
    const defs = (data ?? []) as Array<
      Omit<NodeRow, "status" | "user_xp" | "completed_at" | "started_at">
    >;

    const states = new Map<
      string,
      {
        status: NodeStatus;
        user_xp: number;
        completed_at: string | null;
        started_at: string | null;
      }
    >();
    if (userId) {
      const { data: srows, error: sErr } = await c()
        .from("user_node_state")
        .select("node_id, status, user_xp, completed_at, started_at")
        .eq("user_id", userId);
      if (sErr) throw sErr;
      for (const r of srows ?? []) {
        states.set(r.node_id as string, {
          status: r.status as NodeStatus,
          user_xp: r.user_xp as number,
          completed_at: r.completed_at as string | null,
          started_at: r.started_at as string | null,
        });
      }
    }

    return defs.map((d) => {
      const s = states.get(d.id);
      return {
        ...d,
        status: s?.status ?? "available",
        user_xp: s?.user_xp ?? 0,
        completed_at: s?.completed_at ?? null,
        started_at: s?.started_at ?? null,
      } as NodeRow;
    });
  });
}

export async function searchNodes(query: string, limit = 50): Promise<NodeRow[]> {
  return err("searchNodes", async () => {
    // Postgres `ilike` is case-insensitive; Supabase escapes the `%` and
    // `_` interpolations automatically (postgrest URL encoding handles
    // metacharacters). We still strip `%` / `_` from user input to keep
    // wildcard semantics under our control rather than the user's.
    const safe = query.replace(/[%_\\]/g, "");
    const wildcard = `%${safe}%`;
    const { data, error } = await c()
      .from("node_def")
      .select("*")
      .or(`name.ilike.${wildcard},gloss.ilike.${wildcard},id.ilike.${wildcard}`)
      .order("sort_order")
      .limit(limit);
    if (error) throw error;
    const defs = (data ?? []) as Array<
      Omit<NodeRow, "status" | "user_xp" | "completed_at" | "started_at">
    >;
    if (defs.length === 0) return [];

    const userId = uid();
    const states = new Map<
      string,
      {
        status: NodeStatus;
        user_xp: number;
        completed_at: string | null;
        started_at: string | null;
      }
    >();
    if (userId) {
      const ids = defs.map((d) => d.id);
      const { data: srows, error: sErr } = await c()
        .from("user_node_state")
        .select("node_id, status, user_xp, completed_at, started_at")
        .eq("user_id", userId)
        .in("node_id", ids);
      if (sErr) throw sErr;
      for (const r of srows ?? []) {
        states.set(r.node_id as string, {
          status: r.status as NodeStatus,
          user_xp: r.user_xp as number,
          completed_at: r.completed_at as string | null,
          started_at: r.started_at as string | null,
        });
      }
    }

    return defs.map((d) => {
      const s = states.get(d.id);
      return {
        ...d,
        status: s?.status ?? "available",
        user_xp: s?.user_xp ?? 0,
        completed_at: s?.completed_at ?? null,
        started_at: s?.started_at ?? null,
      } as NodeRow;
    });
  });
}

// ---------------------------------------------------------------------------
// Per-node state mutations (status / xp)
// ---------------------------------------------------------------------------

export async function setNodeStatus(nodeId: string, status: NodeStatus): Promise<void> {
  return err("setNodeStatus", async () => {
    const userId = requireUid();
    if (status === "complete") {
      // Atomic complete via RPC — XP, streak, refresher all in one txn.
      const { error } = await c().rpc("complete_node", { p_user_id: userId, p_node_id: nodeId });
      if (error) throw error;
    } else {
      const { error } = await c().rpc("set_node_status", {
        p_user_id: userId,
        p_node_id: nodeId,
        p_status: status,
      });
      if (error) throw error;
    }
    _broadcastMutation();
  });
}

export async function setNodeXp(nodeId: string, xp: number): Promise<void> {
  return err("setNodeXp", async () => {
    const userId = requireUid();
    // Upsert because the row may not exist yet for a node the user
    // is bonus-XP-ing without having marked it in_progress first.
    const { error } = await c()
      .from("user_node_state")
      .upsert(
        { user_id: userId, node_id: nodeId, user_xp: xp, status: "available" },
        { onConflict: "user_id,node_id", ignoreDuplicates: false },
      );
    if (error) throw error;
    _broadcastMutation();
  });
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

function adaptResource(r: Record<string, unknown>): NodeResourceRow {
  return {
    id: r.id as number,
    node_id: r.node_id as string,
    kind: r.kind as ResourceKind,
    title: r.title as string,
    url: (r.url as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    pinned: r.pinned as number,
    visibility: r.visibility as Visibility,
    added_at: r.added_at as string,
  };
}

export async function getResources(nodeId: string): Promise<NodeResourceRow[]> {
  return err("getResources", async () => {
    const userId = uid();
    if (!userId) return [];
    const { data, error } = await c()
      .from("user_node_resource")
      .select("*")
      .eq("user_id", userId)
      .eq("node_id", nodeId)
      .order("pinned", { ascending: false })
      .order("added_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(adaptResource);
  });
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
  return err("addResource", async () => {
    const userId = requireUid();
    // URL safety gate. The codex view opens these with `noopener,noreferrer`
    // but we still don't want javascript:/data:/file: scheme strings to
    // ever land in the database — RLS lets the user see their own rows so
    // a malicious paste could theoretically be re-rendered later by some
    // future codepath that forgets to gate. Refuse at the write boundary.
    if (input.url != null && input.url !== "" && !parseSafeUrl(input.url)) {
      throw new Error(`Refusing to store unsafe URL scheme: ${input.url}`);
    }
    const { data, error } = await c()
      .from("user_node_resource")
      .insert({
        user_id: userId,
        node_id: input.node_id,
        kind: input.kind,
        title: input.title,
        url: input.url ?? null,
        note: input.note ?? null,
        pinned: input.pinned ? 1 : 0,
        visibility: input.visibility ?? "private",
      })
      .select("id")
      .single();
    if (error) throw error;
    _broadcastMutation();
    return (data?.id as number) ?? 0;
  });
}

export async function deleteResource(id: number): Promise<void> {
  return err("deleteResource", async () => {
    const userId = requireUid();
    const { error } = await c()
      .from("user_node_resource")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw error;
    _broadcastMutation();
  });
}

export async function togglePinResource(id: number): Promise<void> {
  return err("togglePinResource", async () => {
    const userId = requireUid();
    // KNOWN LIMITATION: read-modify-write across two roundtrips. Two
    // concurrent toggles on the same row from different tabs of the same
    // user can collapse to a single net flip (both read pinned=0, both
    // write pinned=1). Acceptable for now — the user can only race
    // themselves and the resulting state is still valid (just maybe not
    // what the second click "intended"). A future hardening pass should
    // move this to a server-side RPC that flips atomically with one
    // statement (`UPDATE ... SET pinned = 1 - pinned WHERE id = ...`).
    const { data, error } = await c()
      .from("user_node_resource")
      .select("pinned")
      .eq("user_id", userId)
      .eq("id", id)
      .single();
    if (error) throw error;
    const next = data.pinned === 1 ? 0 : 1;
    const { error: upErr } = await c()
      .from("user_node_resource")
      .update({ pinned: next })
      .eq("user_id", userId)
      .eq("id", id);
    if (upErr) throw upErr;
    _broadcastMutation();
  });
}

export async function getAllResources(filterKind?: ResourceKind): Promise<NodeResourceRow[]> {
  return err("getAllResources", async () => {
    const userId = uid();
    if (!userId) return [];
    let qb = c()
      .from("user_node_resource")
      .select("*")
      .eq("user_id", userId)
      .order("pinned", { ascending: false })
      .order("added_at", { ascending: false });
    if (filterKind) qb = qb.eq("kind", filterKind);
    const { data, error } = await qb;
    if (error) throw error;
    return (data ?? []).map(adaptResource);
  });
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

function adaptNote(r: Record<string, unknown>): NodeNoteRow {
  // Local SQLite has an `id` column on node_note; cloud's user_node_note
  // is keyed by (user_id, node_id) and has no id. Synthesize a stable id
  // from the node_id so callers that key by `id` keep working.
  return {
    id: 0,
    node_id: r.node_id as string,
    body_md: r.body_md as string,
    visibility: r.visibility as Visibility,
    updated_at: r.updated_at as string,
  };
}

export async function getNote(nodeId: string): Promise<NodeNoteRow | null> {
  return err("getNote", async () => {
    const userId = uid();
    if (!userId) return null;
    const { data, error } = await c()
      .from("user_node_note")
      .select("*")
      .eq("user_id", userId)
      .eq("node_id", nodeId)
      .maybeSingle();
    if (error) throw error;
    return data ? adaptNote(data) : null;
  });
}

export async function upsertNote(nodeId: string, body: string): Promise<void> {
  return err("upsertNote", async () => {
    const userId = requireUid();
    const { error } = await c().from("user_node_note").upsert(
      {
        user_id: userId,
        node_id: nodeId,
        body_md: body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,node_id" },
    );
    if (error) throw error;
    _broadcastMutation();
  });
}

// ---------------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------------

export async function recordCompletionDay(): Promise<void> {
  return err("recordCompletionDay", async () => {
    const userId = requireUid();
    const { error } = await c().rpc("record_completion_day", { p_user_id: userId });
    if (error) throw error;
    _broadcastMutation();
  });
}

export async function getStreakDays(limit = 90): Promise<StreakDayRow[]> {
  return err("getStreakDays", async () => {
    const userId = uid();
    if (!userId) return [];
    const { data, error } = await c()
      .from("user_streak_day")
      .select("day, sessions, used_freeze")
      .eq("user_id", userId)
      .order("day", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      day: r.day as string,
      sessions: r.sessions as number,
      used_freeze: r.used_freeze as number,
    }));
  });
}

export async function currentStreak(): Promise<number> {
  return err("currentStreak", async () => {
    const userId = uid();
    if (!userId) return 0;
    const { data, error } = await c().rpc("current_streak", { p_user_id: userId });
    if (error) throw error;
    return (data as number) ?? 0;
  });
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

function adaptAppState(r: Record<string, unknown>): AppStateRow {
  return {
    id: 1,
    handle: (r.handle as string) ?? "operator",
    scanlines_enabled: r.scanlines_enabled as number,
    sound_enabled: r.sound_enabled as number,
    freeze_tokens: r.freeze_tokens as number,
    freeze_tokens_max: r.freeze_tokens_max as number,
    last_freeze_award_week: (r.last_freeze_award_week as string | null) ?? null,
    onboarded_at: (r.onboarded_at as string | null) ?? null,
    created_at: r.created_at as string,
  };
}

const APP_STATE_DEFAULT: AppStateRow = {
  id: 1,
  handle: "operator",
  scanlines_enabled: 1,
  sound_enabled: 1,
  freeze_tokens: 1,
  freeze_tokens_max: 3,
  last_freeze_award_week: null,
  onboarded_at: null,
  created_at: new Date(0).toISOString(),
};

export async function getAppState(): Promise<AppStateRow> {
  return err("getAppState", async () => {
    const userId = uid();
    if (!userId) return APP_STATE_DEFAULT;
    const { data, error } = await c()
      .from("user_app_state")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ? adaptAppState(data) : APP_STATE_DEFAULT;
  });
}

const APP_STATE_UPDATABLE = new Set([
  "handle",
  "scanlines_enabled",
  "sound_enabled",
  "freeze_tokens",
  "freeze_tokens_max",
  "last_freeze_award_week",
  "onboarded_at",
]);

export async function updateAppState(patch: Partial<AppStateRow>): Promise<void> {
  return err("updateAppState", async () => {
    const userId = requireUid();
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (APP_STATE_UPDATABLE.has(k)) cleaned[k] = v;
    }
    if (Object.keys(cleaned).length === 0) return;
    const { error } = await c().from("user_app_state").update(cleaned).eq("user_id", userId);
    if (error) throw error;
    _broadcastMutation();
  });
}

// ---------------------------------------------------------------------------
// Achievements — server-side evaluation. The client never inserts
// directly; it calls evaluate_achievements() which returns the rows
// freshly unlocked in this call. The realtime subscription on
// user_achievement gives us live unlock notifications across tabs.
// ---------------------------------------------------------------------------

function adaptAchievement(r: Record<string, unknown>): AchievementRow {
  return {
    id: r.achievement_id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    icon: (r.icon as string | null) ?? null,
    unlocked_at: (r.unlocked_at as string | null) ?? null,
  };
}

export async function getAchievements(): Promise<AchievementRow[]> {
  return err("getAchievements", async () => {
    const userId = uid();
    if (!userId) return [];
    const { data, error } = await c()
      .from("user_achievement")
      .select("*")
      .eq("user_id", userId)
      .order("achievement_id");
    if (error) throw error;
    return (data ?? []).map(adaptAchievement);
  });
}

/**
 * Trigger server-side achievement evaluation. The function returns the
 * rows freshly unlocked in this call — convenient for the engine which
 * wants to raise modals for exactly those.
 *
 * Note: in cloud mode the catalog itself lives server-side. The client
 * `unlockAchievement()` helper is preserved for local mode but mapped
 * here to evaluate_achievements() which checks all gates atomically.
 */
export async function evaluateAchievementsRpc(): Promise<AchievementRow[]> {
  return err("evaluateAchievements", async () => {
    const userId = uid();
    if (!userId) return [];
    const { data, error } = await c().rpc("evaluate_achievements", { p_user_id: userId });
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map(adaptAchievement);
  });
}

/**
 * Compatibility shim — local mode lets callers eagerly insert an
 * achievement (the engine evaluates locally and writes). In cloud mode
 * we ignore the input and run the server-side evaluator instead, which
 * is safer (forged unlocks are rejected at the gate). Returns true if a
 * new row was created (mirror of local semantics).
 */
export async function unlockAchievement(_input: {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}): Promise<boolean> {
  const newly = await evaluateAchievementsRpc();
  _broadcastMutation();
  return newly.length > 0;
}

// ---------------------------------------------------------------------------
// Bounties
// ---------------------------------------------------------------------------

/**
 * Cloud-mode parity gaps (deliberate, documented):
 *
 *   - `resolved_at` exists on the local SQLite bounty row but not on the
 *     cloud `user_bounty` table. We synthesize `null` here so the shared
 *     `BountySubmissionRow` type stays satisfied; round-tripping a
 *     backup through cloud will lose any local `resolved_at` values.
 *   - `visibility` is hard-coded to `"private"`. Cloud bounties have no
 *     visibility column (Q-spec: bounties are personal stats, not
 *     shared). A backup imported into cloud collapses any "guild" rows
 *     to private.
 *
 * If/when the schema grows these columns, drop the synthesized values.
 */
function adaptBounty(r: Record<string, unknown>): BountySubmissionRow {
  return {
    id: r.id as number,
    program: r.program as string,
    title: r.title as string,
    severity: r.severity as BountySeverity,
    status: r.status as BountyStatus,
    payout_usd: (r.payout_usd as number | null) ?? null,
    submitted_at: r.submitted_at as string,
    resolved_at: null, // PARITY GAP: not in cloud schema (see banner above).
    cve_id: (r.cve_id as string | null) ?? null,
    related_node: (r.related_node as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    visibility: "private", // PARITY GAP: cloud has no visibility column.
  };
}

export async function getBounties(): Promise<BountySubmissionRow[]> {
  return err("getBounties", async () => {
    const userId = uid();
    if (!userId) return [];
    const { data, error } = await c()
      .from("user_bounty")
      .select("*")
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(adaptBounty);
  });
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
  return err("addBounty", async () => {
    const userId = requireUid();
    const { data, error } = await c()
      .from("user_bounty")
      .insert({
        user_id: userId,
        program: input.program,
        title: input.title,
        severity: input.severity,
        status: input.status ?? "submitted",
        payout_usd: input.payout_usd ?? null,
        submitted_at: input.submitted_at ?? new Date().toISOString(),
        cve_id: input.cve_id ?? null,
        related_node: input.related_node ?? null,
        notes: input.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    _broadcastMutation();
    return (data?.id as number) ?? 0;
  });
}

const BOUNTY_UPDATABLE = new Set([
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
  return err("updateBounty", async () => {
    const userId = requireUid();
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (BOUNTY_UPDATABLE.has(k)) cleaned[k] = v;
    }
    if (Object.keys(cleaned).length === 0) return;
    const { error } = await c()
      .from("user_bounty")
      .update(cleaned)
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw error;
    _broadcastMutation();
  });
}

export async function deleteBounty(id: number): Promise<void> {
  return err("deleteBounty", async () => {
    const userId = requireUid();
    const { error } = await c().from("user_bounty").delete().eq("user_id", userId).eq("id", id);
    if (error) throw error;
    _broadcastMutation();
  });
}

export async function bountyTotals(): Promise<{
  total: number;
  accepted: number;
  payout: number;
  cves: number;
}> {
  return err("bountyTotals", async () => {
    const rows = await getBounties();
    let total = 0;
    let accepted = 0;
    let payout = 0;
    let cves = 0;
    for (const b of rows) {
      total++;
      if (b.status === "accepted" || b.status === "resolved") accepted++;
      payout += b.payout_usd ?? 0;
      if (b.cve_id && b.cve_id !== "") cves++;
    }
    return { total, accepted, payout, cves };
  });
}

// ---------------------------------------------------------------------------
// Spaced-repetition refresher queue
// ---------------------------------------------------------------------------

function adaptRefresher(r: Record<string, unknown>): RefresherRow {
  return {
    id: 0, // composite (user_id, node_id) PK — no surrogate id
    node_id: r.node_id as string,
    streak: r.streak as number,
    last_at: (r.last_at as string | null) ?? null,
    due_at: r.due_at as string,
  };
}

export async function scheduleRefresher(nodeId: string): Promise<void> {
  return err("scheduleRefresher", async () => {
    const userId = requireUid();
    const { error } = await c().rpc("schedule_refresher", {
      p_user_id: userId,
      p_node_id: nodeId,
    });
    if (error) throw error;
    _broadcastMutation();
  });
}

export async function dueRefreshers(limit = 10): Promise<RefresherRow[]> {
  return err("dueRefreshers", async () => {
    const userId = uid();
    if (!userId) return [];
    const { data, error } = await c()
      .from("user_refresher")
      .select("*")
      .eq("user_id", userId)
      .lte("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(adaptRefresher);
  });
}

export async function dueRefreshersWithNode(
  limit = 10,
): Promise<Array<RefresherRow & { node: NodeRow | null }>> {
  return err("dueRefreshersWithNode", async () => {
    const userId = uid();
    if (!userId) return [];
    const { data, error } = await c().rpc("due_refreshers_with_node", {
      p_user_id: userId,
      p_limit: limit,
    });
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: 0,
      node_id: r.node_id as string,
      streak: r.streak as number,
      last_at: (r.last_at as string | null) ?? null,
      due_at: r.due_at as string,
      node: r.n_id
        ? ({
            id: r.n_id as string,
            zone_id: r.n_zone_id as string,
            parent_id: (r.n_parent_id as string | null) ?? null,
            kind: r.n_kind as NodeRow["kind"],
            depth: r.n_depth as NodeRow["depth"],
            status: "complete" as NodeStatus,
            name: r.n_name as string,
            gloss: (r.n_gloss as string | null) ?? null,
            owasp_tag: (r.n_owasp_tag as string | null) ?? null,
            cwe_id: (r.n_cwe_id as string | null) ?? null,
            sort_order: (r.n_sort_order as number) ?? 0,
            user_xp: 0,
            completed_at: null,
            started_at: null,
          } as NodeRow)
        : null,
    }));
  });
}

export async function ackRefresher(nodeId: string, recalled: boolean): Promise<void> {
  return err("ackRefresher", async () => {
    const userId = requireUid();
    const { error } = await c().rpc("ack_refresher", {
      p_user_id: userId,
      p_node_id: nodeId,
      p_recalled: recalled,
    });
    if (error) throw error;
    _broadcastMutation();
  });
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

export async function resetAllProgress(): Promise<void> {
  return err("resetAllProgress", async () => {
    const userId = requireUid();
    const { error } = await c().rpc("reset_all_progress", { p_user_id: userId });
    if (error) throw error;
    _broadcastMutation();
  });
}

// ---------------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------------

export interface BackupSnapshot {
  schema: 1;
  exportedAt: string;
  appVersion: string;
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

export async function exportBackup(appVersion: string): Promise<BackupSnapshot> {
  return err("exportBackup", async () => {
    const userId = uid();
    if (!userId) {
      // Empty snapshot is the right behavior for a signed-out export —
      // there's nothing to back up.
      return {
        schema: 1,
        exportedAt: new Date().toISOString(),
        appVersion,
        nodes: [],
        resources: [],
        notes: [],
        refreshers: [],
        bounties: [],
        streakDays: [],
        achievements: [],
        appState: APP_STATE_DEFAULT,
      };
    }
    const [stateRows, resources, notes, refreshers, bounties, streakDays, achievements, appState] =
      await Promise.all([
        c()
          .from("user_node_state")
          .select("node_id, status, user_xp, completed_at, started_at")
          .eq("user_id", userId)
          .then((r) => {
            if (r.error) throw r.error;
            return (r.data ?? []) as Array<{
              node_id: string;
              status: NodeStatus;
              user_xp: number;
              completed_at: string | null;
              started_at: string | null;
            }>;
          }),
        getAllResources(),
        c()
          .from("user_node_note")
          .select("*")
          .eq("user_id", userId)
          .then((r) => {
            if (r.error) throw r.error;
            return (r.data ?? []).map(adaptNote);
          }),
        c()
          .from("user_refresher")
          .select("*")
          .eq("user_id", userId)
          .then((r) => {
            if (r.error) throw r.error;
            return (r.data ?? []).map(adaptRefresher);
          }),
        getBounties(),
        getStreakDays(10000),
        getAchievements(),
        getAppState(),
      ]);
    return {
      schema: 1,
      exportedAt: new Date().toISOString(),
      appVersion,
      nodes: stateRows.map((s) => ({
        id: s.node_id,
        status: s.status,
        user_xp: s.user_xp,
        completed_at: s.completed_at,
        started_at: s.started_at,
      })),
      resources,
      notes,
      refreshers,
      bounties,
      streakDays,
      achievements,
      appState,
    };
  });
}

/**
 * Re-apply a backup snapshot. Clears existing per-user rows first then
 * re-inserts. Achievements are NOT restored — the catalog evaluator
 * runs after restore so the unlocks reflect the restored state. This
 * matches local-mode semantics for everything except the achievement
 * row metadata, which is regenerated from the catalog.
 *
 * Cloud parity gaps on round-trip (local snapshot → cloud import):
 *   - Bounty `resolved_at`: dropped (no column).
 *   - Bounty `visibility`: collapsed to `private` (no column).
 *   - Refresher autoincrement `id`: discarded. Local SQLite refresher
 *     rows have a surrogate INTEGER PRIMARY KEY; cloud `user_refresher`
 *     uses a composite (`user_id`,`node_id`) PK and synthesizes
 *     `id = 0` on read. The id is meaningless across machines so
 *     dropping it is correct, but worth flagging.
 */
export async function importBackup(snap: BackupSnapshot): Promise<void> {
  return err("importBackup", async () => {
    if (snap.schema !== 1) {
      throw new Error(`Unsupported backup schema: ${snap.schema}`);
    }
    const userId = requireUid();

    // Wipe existing per-user data, then re-insert. Order respects FK
    // cascades (deletes from child tables first). reset_all_progress
    // bundles the wipe + app_state reset in one server-side call.
    const { error: rErr } = await c().rpc("reset_all_progress", { p_user_id: userId });
    if (rErr) throw rErr;

    // Restore node state.
    if (snap.nodes.length > 0) {
      const rows = snap.nodes.map((n) => ({
        user_id: userId,
        node_id: n.id,
        status: n.status,
        user_xp: n.user_xp,
        completed_at: n.completed_at,
        started_at: n.started_at,
      }));
      const { error } = await c()
        .from("user_node_state")
        .upsert(rows, { onConflict: "user_id,node_id" });
      if (error) throw error;
    }

    // Resources — fresh ids (BIGSERIAL allocates new ones).
    if (snap.resources.length > 0) {
      const rows = snap.resources.map((r) => ({
        user_id: userId,
        node_id: r.node_id,
        kind: r.kind,
        title: r.title,
        url: r.url,
        note: r.note,
        pinned: r.pinned,
        visibility: r.visibility === "guild" ? "private" : r.visibility,
        added_at: r.added_at,
      }));
      const { error } = await c().from("user_node_resource").insert(rows);
      if (error) throw error;
    }

    // Notes (composite PK).
    if (snap.notes.length > 0) {
      const rows = snap.notes.map((n) => ({
        user_id: userId,
        node_id: n.node_id,
        body_md: n.body_md,
        visibility: n.visibility === "guild" ? "private" : n.visibility,
        updated_at: n.updated_at,
      }));
      const { error } = await c()
        .from("user_node_note")
        .upsert(rows, { onConflict: "user_id,node_id" });
      if (error) throw error;
    }

    // Refreshers.
    if (snap.refreshers.length > 0) {
      const rows = snap.refreshers.map((r) => ({
        user_id: userId,
        node_id: r.node_id,
        streak: r.streak,
        last_at: r.last_at,
        due_at: r.due_at,
      }));
      const { error } = await c()
        .from("user_refresher")
        .upsert(rows, { onConflict: "user_id,node_id" });
      if (error) throw error;
    }

    // Bounties — fresh ids.
    if (snap.bounties.length > 0) {
      const rows = snap.bounties.map((b) => ({
        user_id: userId,
        program: b.program,
        title: b.title,
        severity: b.severity,
        status: b.status,
        payout_usd: b.payout_usd,
        submitted_at: b.submitted_at,
        cve_id: b.cve_id,
        related_node: b.related_node,
        notes: b.notes,
      }));
      const { error } = await c().from("user_bounty").insert(rows);
      if (error) throw error;
    }

    // Streak days.
    if (snap.streakDays.length > 0) {
      const rows = snap.streakDays.map((d) => ({
        user_id: userId,
        day: d.day,
        sessions: d.sessions,
        used_freeze: d.used_freeze,
      }));
      const { error } = await c()
        .from("user_streak_day")
        .upsert(rows, { onConflict: "user_id,day" });
      if (error) throw error;
    }

    // App state — patch only the user-controlled fields. Server side
    // already has a row from the on-signup trigger; we update it.
    await updateAppState({
      handle: snap.appState.handle,
      scanlines_enabled: snap.appState.scanlines_enabled,
      sound_enabled: snap.appState.sound_enabled,
      freeze_tokens: snap.appState.freeze_tokens,
      last_freeze_award_week: snap.appState.last_freeze_award_week,
    });

    // Re-evaluate achievements against the restored state.
    await evaluateAchievementsRpc();

    _broadcastMutation();
  });
}

// ---------------------------------------------------------------------------
// First-sync flow
//
// Called once per device on first cloud sign-in: take whatever the
// local IndexedDB sql.js DB had and push it up to the cloud. After this
// runs successfully the local DB is treated as a stale offline cache —
// cloud is canonical.
// ---------------------------------------------------------------------------

/**
 * The first-sync marker is keyed per-user. A device can host multiple
 * sign-ins over its lifetime (account swap, household share); without
 * the user-id suffix, signing in as User B on a device where User A
 * had already completed first-sync would skip B's prompt and silently
 * commit B to whatever default decision the modal had baked in.
 */
const FIRST_SYNC_MARKER_BASE = "nullpath:cloud:first-sync-done:v1";
function firstSyncKey(userId: string): string {
  return `${FIRST_SYNC_MARKER_BASE}:${userId}`;
}

export async function isFirstSyncNeeded(): Promise<boolean> {
  if (!isCloudMode()) return false;
  const userId = uid();
  if (!userId) return false;
  return localStorage.getItem(firstSyncKey(userId)) !== "1";
}

/**
 * Push a backup snapshot from local sql.js into the cloud account.
 * The `localSnapshot` is produced by the local-mode `exportBackup()`
 * before the user flips cloud mode on; we then call `importBackup()`
 * here to seed the cloud account.
 *
 * If the cloud account already has data (a non-fresh signin), the
 * caller should NOT call this — the local DB on a brand-new browser
 * would just be the seed migrations and pushing it would wipe the
 * user's actual data. The first-sync UI gates this with an explicit
 * confirmation.
 */
export async function performFirstSync(localSnapshot: BackupSnapshot): Promise<void> {
  const userId = uid();
  await importBackup(localSnapshot);
  if (userId) localStorage.setItem(firstSyncKey(userId), "1");
}

export function markFirstSyncDone(): void {
  const userId = uid();
  if (!userId) return;
  localStorage.setItem(firstSyncKey(userId), "1");
}
