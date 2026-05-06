/**
 * Database row types — kept in lockstep with src-tauri/migrations/001_initial_schema.sql.
 *
 * SQLite returns 0/1 for booleans; we expose them as `number` here and
 * convert at use-sites where it matters.
 */

export type RegionId = "web" | "red-team" | "vuln-research";

export type NodeKind =
  | "foundation"
  | "tool"
  | "recon"
  | "vuln"
  | "defense"
  | "methodology"
  | "capstone";

export type NodeDepth = "intro" | "std" | "adv" | "res";

export type NodeStatus = "available" | "in_progress" | "complete";

export type ResourceKind =
  | "video"
  | "blog"
  | "writeup"
  | "lab"
  | "tool"
  | "misc";

export type Visibility = "private" | "guild" | "public";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface RegionRow {
  id: RegionId;
  name: string;
  tagline: string | null;
  color_accent: string;
  sort_order: number;
  is_locked: number; // 0 | 1
}

export interface ZoneRow {
  id: string;        // 'Z04'
  region_id: RegionId;
  name: string;
  theme: string | null;
  sort_order: number;
  cx: number | null;
  cy: number | null;
}

export interface NodeRow {
  id: string;        // 'W01' | 'W01a'
  zone_id: string;
  parent_id: string | null;
  name: string;
  gloss: string | null;
  kind: NodeKind;
  depth: NodeDepth;
  owasp_tag: string | null;
  cwe_id: string | null;
  sort_order: number;
  status: NodeStatus;
  user_xp: number;
  completed_at: string | null;
  started_at: string | null;
}

export interface NodeResourceRow {
  id: number;
  node_id: string;
  kind: ResourceKind;
  title: string;
  url: string | null;
  note: string | null;
  pinned: number;
  visibility: Visibility;
  added_at: string;
}

export interface NodeNoteRow {
  id: number;
  node_id: string;
  body_md: string;
  visibility: Visibility;
  updated_at: string;
}

export interface StreakDayRow {
  /** YYYY-MM-DD local-day key. */
  day: string;
  /** Completion events recorded on this day. */
  sessions: number;
  /** 1 if the user spent a freeze token to bridge a missed day. */
  used_freeze: number;
}

export interface AppStateRow {
  id: 1;
  handle: string;
  scanlines_enabled: number;
  sound_enabled: number;
  freeze_tokens: number;
  freeze_tokens_max: number;
  last_freeze_award_week: string | null;
  onboarded_at: string | null;
  created_at: string;
}

export interface AchievementRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  unlocked_at: string | null;
}

export type BountySeverity = "info" | "low" | "medium" | "high" | "critical";
export type BountyStatus =
  | "submitted"
  | "triaged"
  | "accepted"
  | "rejected"
  | "duplicate"
  | "informative"
  | "resolved";

export interface BountySubmissionRow {
  id: number;
  program: string;
  title: string;
  severity: BountySeverity;
  status: BountyStatus;
  payout_usd: number | null;
  submitted_at: string;
  resolved_at: string | null;
  cve_id: string | null;
  related_node: string | null;
  notes: string | null;
  visibility: Visibility;
}

export interface RefresherRow {
  id: number;
  node_id: string;
  streak: number;
  last_at: string | null;
  due_at: string;
}

// ---------------------------------------------------------------------------
// Domain shapes used by the UI (decoded from rows)
// ---------------------------------------------------------------------------

export interface ZoneStats {
  zone_id: string;
  total_nodes: number;
  completed_nodes: number;
  in_progress_nodes: number;
}

