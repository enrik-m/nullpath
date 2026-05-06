-- Nullpath Postgres schema (cloud mode)
--
-- Translation of the SQLite schema (src/db/migrations/001..005) into
-- Postgres dialect, plus user-scoping (every user-owned row has a
-- user_id column) and Row-Level Security policies.
--
-- The skill graph (region / zone / node tables) is shared / read-only —
-- every user reads the same atlas. Only the per-user state tables get
-- user_id columns and RLS.
--
-- Apply via: Supabase Dashboard → SQL Editor → paste this file → Run.
-- Or: `supabase db push` if using the Supabase CLI.

-- ---------------------------------------------------------------------------
-- Shared (read-only) skill graph tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.region (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  tagline       TEXT,
  color_accent  TEXT,
  is_locked     SMALLINT NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.zone (
  id            TEXT PRIMARY KEY,
  region_id     TEXT NOT NULL REFERENCES public.region(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  tagline       TEXT,
  color_accent  TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  cx            INTEGER,
  cy            INTEGER
);
CREATE INDEX IF NOT EXISTS idx_zone_region ON public.zone(region_id);

CREATE TABLE IF NOT EXISTS public.node_def (
  -- node_def is the immutable definition of a node — its taxonomy
  -- entry. Per-user state lives in user_node_state below.
  id            TEXT PRIMARY KEY,
  zone_id       TEXT NOT NULL REFERENCES public.zone(id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES public.node_def(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  gloss         TEXT,
  kind          TEXT NOT NULL CHECK (kind IN
                  ('foundation','tool','recon','vuln','defense','methodology','capstone')),
  depth         TEXT NOT NULL CHECK (depth IN ('intro','std','adv','res')),
  owasp_tag     TEXT,
  cwe_id        TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_node_zone ON public.node_def(zone_id);
CREATE INDEX IF NOT EXISTS idx_node_parent ON public.node_def(parent_id);
CREATE INDEX IF NOT EXISTS idx_node_kind ON public.node_def(kind);
CREATE INDEX IF NOT EXISTS idx_node_depth ON public.node_def(depth);

-- Read-only access for everybody (signed in or anon).
ALTER TABLE public.region    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zone      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_def  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "region: read for everyone"   ON public.region    FOR SELECT USING (true);
CREATE POLICY "zone: read for everyone"     ON public.zone      FOR SELECT USING (true);
CREATE POLICY "node_def: read for everyone" ON public.node_def  FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- Per-user state tables (RLS-protected)
-- ---------------------------------------------------------------------------

-- App-level user preferences. One row per authenticated user.
CREATE TABLE IF NOT EXISTS public.user_app_state (
  user_id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle                    TEXT NOT NULL DEFAULT 'operator',
  scanlines_enabled         SMALLINT NOT NULL DEFAULT 1,
  sound_enabled             SMALLINT NOT NULL DEFAULT 1,
  freeze_tokens             INTEGER NOT NULL DEFAULT 1,
  freeze_tokens_max         INTEGER NOT NULL DEFAULT 3,
  last_freeze_award_week    TEXT,
  onboarded_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-user node state (status + xp + timestamps). Only rows for nodes
-- the user has touched live here — fresh accounts have zero rows.
-- The `available` default is implied by absence of a row.
CREATE TABLE IF NOT EXISTS public.user_node_state (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id        TEXT NOT NULL REFERENCES public.node_def(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'available'
                 CHECK (status IN ('available','in_progress','complete')),
  user_xp        INTEGER NOT NULL DEFAULT 0,
  completed_at   TIMESTAMPTZ,
  started_at     TIMESTAMPTZ,
  PRIMARY KEY (user_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_uns_user_status ON public.user_node_state(user_id, status);
CREATE INDEX IF NOT EXISTS idx_uns_user_node   ON public.user_node_state(user_id, node_id);

-- Resources attached to a node by a user. Multiple per node allowed.
CREATE TABLE IF NOT EXISTS public.user_node_resource (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id     TEXT NOT NULL REFERENCES public.node_def(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('video','blog','writeup','lab','tool','misc')),
  title       TEXT NOT NULL,
  url         TEXT,
  note        TEXT,
  pinned      SMALLINT NOT NULL DEFAULT 0,
  visibility  TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_unr_user_node ON public.user_node_resource(user_id, node_id);
CREATE INDEX IF NOT EXISTS idx_unr_user_kind ON public.user_node_resource(user_id, kind);

-- One note per (user, node).
CREATE TABLE IF NOT EXISTS public.user_node_note (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id     TEXT NOT NULL REFERENCES public.node_def(id) ON DELETE CASCADE,
  body_md     TEXT NOT NULL DEFAULT '',
  visibility  TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, node_id)
);

-- One streak ledger row per (user, day).
CREATE TABLE IF NOT EXISTS public.user_streak_day (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day          DATE NOT NULL,
  sessions     INTEGER NOT NULL DEFAULT 0,
  used_freeze  SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_usd_user_day ON public.user_streak_day(user_id, day DESC);

-- Spaced-repetition refresher queue.
CREATE TABLE IF NOT EXISTS public.user_refresher (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id    TEXT NOT NULL REFERENCES public.node_def(id) ON DELETE CASCADE,
  streak     INTEGER NOT NULL DEFAULT 0,
  last_at    TIMESTAMPTZ,
  due_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_ur_user_due ON public.user_refresher(user_id, due_at);

-- Bug bounty submission ledger (per user).
CREATE TABLE IF NOT EXISTS public.user_bounty (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program        TEXT NOT NULL,
  title          TEXT NOT NULL,
  severity       TEXT NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
  status         TEXT NOT NULL DEFAULT 'submitted'
                 CHECK (status IN ('submitted','triaged','accepted','resolved','rejected','duplicate','informative')),
  payout_usd     NUMERIC,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cve_id         TEXT,
  related_node   TEXT REFERENCES public.node_def(id) ON DELETE SET NULL,
  notes          TEXT
);
CREATE INDEX IF NOT EXISTS idx_ub_user_submitted ON public.user_bounty(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ub_user_status    ON public.user_bounty(user_id, status);

-- Achievements unlocked per user.
CREATE TABLE IF NOT EXISTS public.user_achievement (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT,
  unlocked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_ua_user ON public.user_achievement(user_id, unlocked_at DESC);

-- ---------------------------------------------------------------------------
-- RLS policies — every per-user table enforces "I can only see my own rows"
-- via auth.uid() = user_id. This is the architectural security boundary;
-- even a SQL injection in client-issued queries can't read or write
-- another user's data.
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_app_state      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_node_state     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_node_resource  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_node_note      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_streak_day     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_refresher      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_bounty         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievement    ENABLE ROW LEVEL SECURITY;

-- Two policies per table: "the user owns their rows" (full access),
-- "anything else is denied by default" (RLS deny-by-default).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'user_app_state','user_node_state','user_node_resource',
    'user_node_note','user_streak_day','user_refresher',
    'user_bounty','user_achievement'
  ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "%I: read own"   ON public.%I FOR SELECT USING (auth.uid() = user_id);',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "%I: insert own" ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id);',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "%I: update own" ON public.%I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "%I: delete own" ON public.%I FOR DELETE USING (auth.uid() = user_id);',
      t, t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Trigger: when a new auth user is created, insert their default app_state row.
-- This ensures every authenticated user has exactly one user_app_state row
-- without the client having to do an upsert dance.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_app_state (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
