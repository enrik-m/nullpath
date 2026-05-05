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

export interface NodeEdgeRow {
  from_id: string;
  to_id: string;
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

export interface SessionRow {
  id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  idle_seconds: number;
  focus_node_id: string | null;
  note: string | null;
  auto_ended: number;
}

export interface StreakDayRow {
  day: string;       // 'YYYY-MM-DD'
  sessions: number;
  seconds_studied: number;
  used_freeze: number;
}

export interface AppStateRow {
  id: 1;
  handle: string;
  idle_threshold_seconds: number;
  idle_hard_cap_seconds: number;
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

// ---------------------------------------------------------------------------
// Domain shapes used by the UI (decoded from rows)
// ---------------------------------------------------------------------------

export interface ZoneStats {
  zone_id: string;
  total_nodes: number;
  completed_nodes: number;
  in_progress_nodes: number;
}

export interface RegionWithStats extends RegionRow {
  zones: number;
  total_nodes: number;
  completed_nodes: number;
}

export interface NodeWithChildren extends NodeRow {
  children: NodeRow[];
  resources_count: number;
  has_note: boolean;
}
