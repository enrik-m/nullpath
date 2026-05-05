-- Nullpath — initial schema
-- ==========================================================================
-- Storage layout follows the data model in plans/00-overview.md.
-- All tables use TEXT IDs that match the plan-file IDs (e.g. "Z04", "W01a")
-- so seed data can round-trip from the markdown source of truth.

PRAGMA foreign_keys = ON;

-- --------------------------------------------------------------------------
-- Regions: top-level career disciplines (Web / Red Team / Vuln Research)
-- --------------------------------------------------------------------------
CREATE TABLE region (
    id           TEXT PRIMARY KEY,           -- 'web' | 'red-team' | 'vuln-research'
    name         TEXT NOT NULL,
    tagline      TEXT,
    color_accent TEXT NOT NULL,              -- hex
    sort_order   INTEGER NOT NULL,
    is_locked    INTEGER NOT NULL DEFAULT 0  -- 1 = visible but unclickable
);

-- --------------------------------------------------------------------------
-- Zones: constellations within a region (e.g. "Injection Caves")
-- --------------------------------------------------------------------------
CREATE TABLE zone (
    id          TEXT PRIMARY KEY,            -- 'Z04'
    region_id   TEXT NOT NULL REFERENCES region(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    theme       TEXT,                         -- short tagline
    sort_order  INTEGER NOT NULL,
    -- canvas layout coords for the constellation view (set by seed)
    cx          REAL,
    cy          REAL
);

-- --------------------------------------------------------------------------
-- Nodes: individual skills / techniques / sub-techniques.
-- --------------------------------------------------------------------------
CREATE TABLE node (
    id          TEXT PRIMARY KEY,            -- 'W01' / 'W01a' / 'F03'
    zone_id     TEXT NOT NULL REFERENCES zone(id) ON DELETE CASCADE,
    parent_id   TEXT REFERENCES node(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    gloss       TEXT,                         -- short description from the plan
    kind        TEXT NOT NULL,                -- foundation | tool | recon | vuln | defense | methodology | capstone
    depth       TEXT NOT NULL DEFAULT 'std',  -- intro | std | adv | res
    owasp_tag   TEXT,                         -- 'A03' etc.
    cwe_id      TEXT,                         -- 'CWE-89' etc.
    sort_order  INTEGER NOT NULL DEFAULT 0,
    -- user state
    status      TEXT NOT NULL DEFAULT 'available',  -- available | in_progress | complete
    user_xp     INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,                         -- ISO 8601
    started_at  TEXT
);

CREATE INDEX idx_node_zone ON node(zone_id);
CREATE INDEX idx_node_parent ON node(parent_id);
CREATE INDEX idx_node_kind ON node(kind);
CREATE INDEX idx_node_depth ON node(depth);
CREATE INDEX idx_node_status ON node(status);

-- --------------------------------------------------------------------------
-- Soft prerequisite edges (advisory, not blocking)
-- --------------------------------------------------------------------------
CREATE TABLE node_edge (
    from_id TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
    to_id   TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
    PRIMARY KEY (from_id, to_id)
);

-- --------------------------------------------------------------------------
-- User-attached resources per node (videos, blogs, writeups, labs, tools)
-- --------------------------------------------------------------------------
CREATE TABLE node_resource (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id     TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,                -- video | blog | writeup | lab | tool | misc
    title       TEXT NOT NULL,
    url         TEXT,
    note        TEXT,                          -- short pinned excerpt / why
    pinned      INTEGER NOT NULL DEFAULT 0,
    visibility  TEXT NOT NULL DEFAULT 'private',  -- private | guild | public
    added_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_resource_node ON node_resource(node_id);
CREATE INDEX idx_resource_kind ON node_resource(kind);

-- --------------------------------------------------------------------------
-- User-attached freeform notes per node (markdown)
-- --------------------------------------------------------------------------
CREATE TABLE node_note (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id     TEXT NOT NULL UNIQUE REFERENCES node(id) ON DELETE CASCADE,
    body_md     TEXT NOT NULL DEFAULT '',
    visibility  TEXT NOT NULL DEFAULT 'private',
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --------------------------------------------------------------------------
-- Sessions: study time blocks
-- --------------------------------------------------------------------------
CREATE TABLE session (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at      TEXT NOT NULL,            -- ISO 8601
    ended_at        TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    idle_seconds   INTEGER NOT NULL DEFAULT 0,
    -- optional pinned focus node — what the user said they were working on
    focus_node_id   TEXT REFERENCES node(id) ON DELETE SET NULL,
    note            TEXT,
    auto_ended      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_session_started ON session(started_at);

-- --------------------------------------------------------------------------
-- Daily streak ledger (one row per day the user studied)
-- --------------------------------------------------------------------------
CREATE TABLE streak_day (
    day             TEXT PRIMARY KEY,        -- 'YYYY-MM-DD' local
    sessions        INTEGER NOT NULL DEFAULT 0,
    seconds_studied INTEGER NOT NULL DEFAULT 0,
    used_freeze     INTEGER NOT NULL DEFAULT 0
);

-- --------------------------------------------------------------------------
-- Single-row settings & profile
-- --------------------------------------------------------------------------
CREATE TABLE app_state (
    id                       INTEGER PRIMARY KEY CHECK (id = 1),
    handle                   TEXT NOT NULL DEFAULT 'operator',
    idle_threshold_seconds   INTEGER NOT NULL DEFAULT 600,    -- 10 min
    idle_hard_cap_seconds    INTEGER NOT NULL DEFAULT 3600,   -- 60 min
    scanlines_enabled        INTEGER NOT NULL DEFAULT 1,
    sound_enabled            INTEGER NOT NULL DEFAULT 1,
    freeze_tokens            INTEGER NOT NULL DEFAULT 0,
    freeze_tokens_max        INTEGER NOT NULL DEFAULT 3,
    last_freeze_award_week   TEXT,                            -- ISO week 'YYYY-Www'
    onboarded_at             TEXT,
    created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO app_state (id) VALUES (1);

-- --------------------------------------------------------------------------
-- Achievements (in-app cosmetic milestones)
-- --------------------------------------------------------------------------
CREATE TABLE achievement (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT,
    icon         TEXT,                        -- lucide icon name
    unlocked_at  TEXT
);
