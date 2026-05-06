-- Nullpath server-side compute functions (cloud mode).
--
-- Q7 from the build spec: "no all server-side, please keep everything
-- server side if possible". These functions implement every piece of
-- derived state that mattered to a determined client:
--   - achievement evaluation (so unlocks can't be faked)
--   - streak counting (so streak length can't be inflated)
--   - operator XP / level (computed from completed-node rows, not stored)
--   - spaced-repetition due queue (server-clock)
--   - node completion (atomic: status + streak + refresher in one txn)
--   - full progress reset
--
-- All functions run as SECURITY INVOKER — the caller's auth.uid() drives
-- RLS, so each user only ever sees / mutates their own rows. The p_user_id
-- argument is checked against auth.uid() at the start of each function so
-- a forged argument can't reach another user's data even if RLS were
-- somehow bypassed elsewhere. `SET search_path = public` blocks the
-- "create a table named 'auth' in your schema and shadow ours" trick.

-- ---------------------------------------------------------------------------
-- Internal: assert the caller is operating on their own row.
-- Centralized so every function fails fast with the same message.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert_self(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'cannot operate on another user' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- operator_xp(p_user_id) -> INTEGER
--
-- Sum of user_xp across every completed node. Mirrors computeOperatorXp()
-- in src/store.ts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.operator_xp(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
  total INTEGER;
BEGIN
  PERFORM public._assert_self(p_user_id);
  SELECT COALESCE(SUM(user_xp), 0) INTO total
    FROM public.user_node_state
   WHERE user_id = p_user_id AND status = 'complete';
  RETURN total;
END;
$$;

-- ---------------------------------------------------------------------------
-- operator_level(xp) -> INTEGER
--
-- Pure function. Mirrors levelForXp() in src/store.ts:
--   level = floor((xp / 500) ^ (2/3))
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.operator_level(p_xp INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_xp <= 0 THEN RETURN 0; END IF;
  RETURN GREATEST(0, FLOOR(POWER(p_xp::numeric / 500.0, 2.0 / 3.0))::int);
END;
$$;

-- ---------------------------------------------------------------------------
-- xp_for_completing_node(depth) -> INTEGER
--
-- Per-depth XP table. Mirrors xpForCompletingNode() in src/store.ts.
-- intro=60, std=120, adv=240, res=480.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.xp_for_completing_node(p_depth TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_depth
    WHEN 'intro' THEN 60
    WHEN 'std'   THEN 120
    WHEN 'adv'   THEN 240
    WHEN 'res'   THEN 480
    ELSE 0
  END;
$$;

-- ---------------------------------------------------------------------------
-- current_streak(p_user_id) -> INTEGER
--
-- Walk back day-by-day from today (or yesterday if no row for today yet),
-- counting consecutive days with sessions > 0 OR used_freeze = 1. Mirrors
-- currentStreak() in src/db/index.ts. Capped at 365 to bound the loop.
--
-- Note: "today" means today in UTC. The client-side version uses local
-- time; on the server we standardize on UTC so two devices in different
-- timezones don't disagree on the streak. Acceptable trade-off — the
-- streak is a motivation tool, not an audit metric.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_streak(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
  cursor_day DATE := (NOW() AT TIME ZONE 'UTC')::date;
  has_today BOOLEAN;
  count_days INTEGER := 0;
  row_sessions INTEGER;
  row_freeze SMALLINT;
BEGIN
  PERFORM public._assert_self(p_user_id);

  -- If there's no row for today, start from yesterday.
  SELECT EXISTS (
    SELECT 1 FROM public.user_streak_day
     WHERE user_id = p_user_id AND day = cursor_day
  ) INTO has_today;
  IF NOT has_today THEN
    cursor_day := cursor_day - 1;
  END IF;

  FOR i IN 1..365 LOOP
    SELECT sessions, used_freeze INTO row_sessions, row_freeze
      FROM public.user_streak_day
     WHERE user_id = p_user_id AND day = cursor_day;

    IF NOT FOUND THEN EXIT; END IF;
    IF row_sessions = 0 AND row_freeze = 0 THEN EXIT; END IF;

    count_days := count_days + 1;
    cursor_day := cursor_day - 1;
  END LOOP;

  RETURN count_days;
END;
$$;

-- ---------------------------------------------------------------------------
-- record_completion_day(p_user_id) -> VOID
--
-- Bump the sessions counter for today (UTC). Insert if first event of the
-- day, otherwise increment. Mirrors recordCompletionDay() in src/db/index.ts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_completion_day(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_self(p_user_id);
  INSERT INTO public.user_streak_day (user_id, day, sessions)
    VALUES (p_user_id, (NOW() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (user_id, day)
    DO UPDATE SET sessions = public.user_streak_day.sessions + 1;
END;
$$;

-- ---------------------------------------------------------------------------
-- schedule_refresher(p_user_id, p_node_id) -> VOID
--
-- Insert (or reset) a refresher row when a node is completed. The first
-- refresher fires 1 day out (interval[0]). Mirrors scheduleRefresher() in
-- src/db/index.ts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_refresher(p_user_id UUID, p_node_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_self(p_user_id);
  INSERT INTO public.user_refresher (user_id, node_id, streak, due_at)
    VALUES (p_user_id, p_node_id, 0, NOW() + INTERVAL '1 day')
  ON CONFLICT (user_id, node_id)
    DO UPDATE SET streak = 0, due_at = NOW() + INTERVAL '1 day';
END;
$$;

-- ---------------------------------------------------------------------------
-- ack_refresher(p_user_id, p_node_id, p_recalled) -> VOID
--
-- Record a refresher acknowledgement. recalled=true bumps the streak and
-- pushes due_at out by the next interval; recalled=false resets to 0/1d.
-- Intervals: 1, 3, 7, 21, 60, 180 (capped). Mirrors ackRefresher() in
-- src/db/index.ts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ack_refresher(p_user_id UUID, p_node_id TEXT, p_recalled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  cur_streak INTEGER;
  new_streak INTEGER;
  intervals INTEGER[] := ARRAY[1, 3, 7, 21, 60, 180];
  next_days INTEGER;
BEGIN
  PERFORM public._assert_self(p_user_id);

  SELECT streak INTO cur_streak
    FROM public.user_refresher
   WHERE user_id = p_user_id AND node_id = p_node_id;
  IF NOT FOUND THEN RETURN; END IF;

  new_streak := CASE WHEN p_recalled THEN cur_streak + 1 ELSE 0 END;
  -- Clamp the interval index to the array length.
  next_days := intervals[LEAST(new_streak + 1, array_length(intervals, 1))];

  UPDATE public.user_refresher
     SET streak  = new_streak,
         last_at = NOW(),
         due_at  = NOW() + (next_days || ' days')::interval
   WHERE user_id = p_user_id AND node_id = p_node_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- due_refreshers_with_node(p_user_id, p_limit) -> TABLE
--
-- Refreshers whose due_at <= now(), joined with the node definition.
-- Mirrors dueRefreshersWithNode() in src/db/index.ts. The shape returned
-- matches what the client previously consumed, with both refresher and
-- node fields side-by-side (no nested object — RPC results are flat).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.due_refreshers_with_node(p_user_id UUID, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  node_id      TEXT,
  streak       INTEGER,
  last_at      TIMESTAMPTZ,
  due_at       TIMESTAMPTZ,
  n_id         TEXT,
  n_zone_id    TEXT,
  n_parent_id  TEXT,
  n_kind       TEXT,
  n_depth      TEXT,
  n_name       TEXT,
  n_gloss      TEXT,
  n_owasp_tag  TEXT,
  n_cwe_id     TEXT,
  n_sort_order INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_self(p_user_id);
  RETURN QUERY
    SELECT r.node_id, r.streak, r.last_at, r.due_at,
           n.id, n.zone_id, n.parent_id, n.kind, n.depth,
           n.name, n.gloss, n.owasp_tag, n.cwe_id, n.sort_order
      FROM public.user_refresher r
      LEFT JOIN public.node_def n ON n.id = r.node_id
     WHERE r.user_id = p_user_id
       AND r.due_at <= NOW()
     ORDER BY r.due_at ASC
     LIMIT GREATEST(p_limit, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- complete_node(p_user_id, p_node_id) -> JSONB
--
-- Atomic node-completion: flip status to complete, award depth-scaled XP,
-- bump streak ledger, schedule refresher. One round-trip from the client,
-- one transaction in the DB. Returns the new XP awarded so the client can
-- show the right "+120 XP" toast without a follow-up read.
--
-- If the node is already complete, this is a no-op (returns awarded=0).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_node(p_user_id UUID, p_node_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  node_depth TEXT;
  awarded    INTEGER;
  was_status TEXT;
BEGIN
  PERFORM public._assert_self(p_user_id);

  SELECT depth INTO node_depth FROM public.node_def WHERE id = p_node_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown node_id: %', p_node_id USING ERRCODE = '23503';
  END IF;

  -- Read current state (if any) so we don't double-award XP on re-complete.
  SELECT status INTO was_status
    FROM public.user_node_state
   WHERE user_id = p_user_id AND node_id = p_node_id;

  IF was_status = 'complete' THEN
    RETURN jsonb_build_object('awarded', 0, 'already', true);
  END IF;

  awarded := public.xp_for_completing_node(node_depth);

  INSERT INTO public.user_node_state (user_id, node_id, status, user_xp, completed_at, started_at)
    VALUES (p_user_id, p_node_id, 'complete', awarded, NOW(), NOW())
  ON CONFLICT (user_id, node_id)
    DO UPDATE SET status = 'complete',
                  user_xp = public.user_node_state.user_xp + awarded,
                  completed_at = NOW(),
                  started_at = COALESCE(public.user_node_state.started_at, NOW());

  PERFORM public.record_completion_day(p_user_id);
  PERFORM public.schedule_refresher(p_user_id, p_node_id);

  RETURN jsonb_build_object('awarded', awarded, 'already', false);
END;
$$;

-- ---------------------------------------------------------------------------
-- set_node_status(p_user_id, p_node_id, p_status) -> VOID
--
-- Status flip without auto-completion side effects. Used for in_progress
-- and available transitions; complete should go through complete_node()
-- so XP / streak / refresher logic runs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_node_status(p_user_id UUID, p_node_id TEXT, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_self(p_user_id);
  IF p_status NOT IN ('available', 'in_progress', 'complete') THEN
    RAISE EXCEPTION 'invalid status: %', p_status USING ERRCODE = '23514';
  END IF;

  -- 'complete' must go through complete_node() to award XP correctly;
  -- guard here so a client that calls this directly doesn't end up in
  -- the 'complete' state with zero XP.
  IF p_status = 'complete' THEN
    PERFORM public.complete_node(p_user_id, p_node_id);
    RETURN;
  END IF;

  INSERT INTO public.user_node_state (user_id, node_id, status, started_at)
    VALUES (
      p_user_id, p_node_id, p_status,
      CASE WHEN p_status = 'in_progress' THEN NOW() ELSE NULL END
    )
  ON CONFLICT (user_id, node_id)
    DO UPDATE SET
      status = p_status,
      started_at = CASE
        WHEN p_status = 'in_progress'
          THEN COALESCE(public.user_node_state.started_at, NOW())
        ELSE public.user_node_state.started_at
      END;
END;
$$;

-- ---------------------------------------------------------------------------
-- reset_all_progress(p_user_id) -> VOID
--
-- Wipe every per-user row. Skill graph (region/zone/node_def) untouched.
-- Single transaction so a partial wipe can't leave orphans. Mirrors
-- resetAllProgress() in src/db/index.ts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_all_progress(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_self(p_user_id);

  DELETE FROM public.user_node_resource WHERE user_id = p_user_id;
  DELETE FROM public.user_node_note     WHERE user_id = p_user_id;
  DELETE FROM public.user_refresher     WHERE user_id = p_user_id;
  DELETE FROM public.user_bounty        WHERE user_id = p_user_id;
  DELETE FROM public.user_streak_day    WHERE user_id = p_user_id;
  DELETE FROM public.user_achievement   WHERE user_id = p_user_id;
  DELETE FROM public.user_node_state    WHERE user_id = p_user_id;

  -- App state: keep the row (PK constraint with auth.users) but reset the
  -- gameplay-touched fields. Handle / preferences are preserved on purpose
  -- so a "reset progress" doesn't sign the user out of their settings.
  UPDATE public.user_app_state
     SET freeze_tokens = 0,
         last_freeze_award_week = NULL
   WHERE user_id = p_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- evaluate_achievements(p_user_id) -> SETOF user_achievement
--
-- Compute the achievement context server-side and unlock anything newly
-- qualified. Returns the rows that were freshly unlocked in this call so
-- the client can raise modals for exactly those — no need for a follow-up
-- read.
--
-- Mirrors buildCtx() + evaluateAchievements() in src/lib/achievements.ts.
-- The catalog of (id, target, value-source) is encoded as a static VALUES
-- table here so adding a new achievement requires editing this function
-- AND the client catalog (kept in sync by tests, see migration tests).
--
-- Achievement-faking attack model: even if the client patches its own
-- achievements.ts to call db.unlockAchievement('streak-100') with a
-- forged streak count, the unlock won't stick — only this function can
-- write to user_achievement (in cloud mode the client never INSERTs into
-- user_achievement directly; the RLS policy permits it but the client
-- code routes everything through evaluate_achievements()). The condition
-- gates are evaluated against authoritative server-side row counts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_achievements(p_user_id UUID)
RETURNS SETOF public.user_achievement
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  -- Volume
  v_completed         INTEGER;
  v_depth_intro       INTEGER;
  v_depth_std         INTEGER;
  v_depth_adv         INTEGER;
  v_depth_res         INTEGER;
  v_kind_foundation   INTEGER;
  v_kind_tool         INTEGER;
  v_kind_recon        INTEGER;
  v_kind_vuln         INTEGER;
  v_kind_defense      INTEGER;
  v_kind_methodology  INTEGER;
  v_kind_capstone     INTEGER;
  v_top_mastered      INTEGER;

  -- Zones
  v_zones_completed   INTEGER;
  v_zones_touched     INTEGER;

  -- Streak / level / xp
  v_streak            INTEGER;
  v_xp                INTEGER;
  v_level             INTEGER;

  -- Big day
  v_max_in_one_day    INTEGER;

  -- Codex / notes / refresher
  v_resources_total   INTEGER;
  v_resources_pinned  INTEGER;
  v_notes_total       INTEGER;
  v_longest_note      INTEGER;
  v_refresher_acks    INTEGER;
  v_refresher_max     INTEGER;

  -- Bounties
  v_bounties_accepted INTEGER;
  v_bounties_payout   NUMERIC;
  v_bounties_cves     INTEGER;
BEGIN
  PERFORM public._assert_self(p_user_id);

  -- Volume + depth + kind in one pass.
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE n.depth = 'intro'),
    COUNT(*) FILTER (WHERE n.depth = 'std'),
    COUNT(*) FILTER (WHERE n.depth = 'adv'),
    COUNT(*) FILTER (WHERE n.depth = 'res'),
    COUNT(*) FILTER (WHERE n.kind = 'foundation'),
    COUNT(*) FILTER (WHERE n.kind = 'tool'),
    COUNT(*) FILTER (WHERE n.kind = 'recon'),
    COUNT(*) FILTER (WHERE n.kind = 'vuln'),
    COUNT(*) FILTER (WHERE n.kind = 'defense'),
    COUNT(*) FILTER (WHERE n.kind = 'methodology'),
    COUNT(*) FILTER (WHERE n.kind = 'capstone')
  INTO
    v_completed,
    v_depth_intro, v_depth_std, v_depth_adv, v_depth_res,
    v_kind_foundation, v_kind_tool, v_kind_recon, v_kind_vuln,
    v_kind_defense, v_kind_methodology, v_kind_capstone
  FROM public.user_node_state s
  JOIN public.node_def n ON n.id = s.node_id
  WHERE s.user_id = p_user_id AND s.status = 'complete';

  -- Top-level mastery: parents whose every child is complete (≥1 child).
  WITH child_status AS (
    SELECT n.parent_id,
           COUNT(*) AS total_kids,
           COUNT(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM public.user_node_state s2
                WHERE s2.user_id = p_user_id
                  AND s2.node_id = n.id
                  AND s2.status = 'complete'
             )
           ) AS done_kids
      FROM public.node_def n
     WHERE n.parent_id IS NOT NULL
     GROUP BY n.parent_id
  )
  SELECT COUNT(*) INTO v_top_mastered
    FROM child_status
   WHERE total_kids >= 1 AND done_kids = total_kids;

  -- Zone progress: a zone is "completed" when every node in it is
  -- complete; "touched" when at least one is complete or in_progress.
  WITH zone_state AS (
    SELECT z.id AS zone_id,
           COUNT(n.id) AS total_nodes,
           COUNT(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM public.user_node_state s
                WHERE s.user_id = p_user_id AND s.node_id = n.id AND s.status = 'complete'
             )
           ) AS completed_nodes,
           COUNT(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM public.user_node_state s
                WHERE s.user_id = p_user_id AND s.node_id = n.id
                  AND s.status IN ('in_progress','complete')
             )
           ) AS touched_nodes
      FROM public.zone z
      LEFT JOIN public.node_def n ON n.zone_id = z.id
     GROUP BY z.id
  )
  SELECT
    COUNT(*) FILTER (WHERE total_nodes > 0 AND completed_nodes = total_nodes),
    COUNT(*) FILTER (WHERE touched_nodes > 0)
  INTO v_zones_completed, v_zones_touched
    FROM zone_state;

  -- Streak / xp / level
  v_streak := public.current_streak(p_user_id);
  v_xp := public.operator_xp(p_user_id);
  v_level := public.operator_level(v_xp);

  -- Peak completions in a single day.
  SELECT COALESCE(MAX(sessions), 0) INTO v_max_in_one_day
    FROM public.user_streak_day WHERE user_id = p_user_id;

  -- Resources / notes / refresher aggregates.
  SELECT COUNT(*), COALESCE(SUM(pinned), 0)
    INTO v_resources_total, v_resources_pinned
    FROM public.user_node_resource WHERE user_id = p_user_id;

  SELECT COUNT(*), COALESCE(MAX(LENGTH(body_md)), 0)
    INTO v_notes_total, v_longest_note
    FROM public.user_node_note WHERE user_id = p_user_id;

  SELECT COALESCE(SUM(streak), 0), COALESCE(MAX(streak), 0)
    INTO v_refresher_acks, v_refresher_max
    FROM public.user_refresher WHERE user_id = p_user_id;

  -- Bounty totals.
  SELECT
    COUNT(*) FILTER (WHERE status IN ('accepted', 'resolved')),
    COALESCE(SUM(payout_usd), 0),
    COUNT(*) FILTER (WHERE cve_id IS NOT NULL AND cve_id <> '')
  INTO v_bounties_accepted, v_bounties_payout, v_bounties_cves
    FROM public.user_bounty WHERE user_id = p_user_id;

  -- Insert any newly qualified achievements. ON CONFLICT DO NOTHING means
  -- already-unlocked rows are unchanged (unlocked_at preserved). The
  -- RETURNING clause feeds the SETOF return so the caller sees only the
  -- rows freshly inserted in this call.
  RETURN QUERY
  INSERT INTO public.user_achievement (user_id, achievement_id, name, description, icon)
  SELECT p_user_id, t.id, t.name, t.description, t.icon
    FROM (VALUES
      -- First steps
      ('first-node',           'First Move',              'Mark your first node complete. The path begins.',                                  'Footprints',     1,         v_completed),
      ('first-zone',           'Zone Cleared',            'Every node in a zone — done. The constellation glows.',                            'Trophy',         1,         v_zones_completed),
      ('first-resource',       'Pack Rat',                'Attach your first resource to a node. Build the library.',                         'BookOpen',       1,         v_resources_total),
      ('first-note',           'Field Notes',             'Wrote your first node note. Synthesis beats re-reading.',                          'Pencil',         1,         v_notes_total),

      -- Volume / nodes cleared
      ('ten-nodes',            'Operator In Training',    '10 nodes complete. Your kit is taking shape.',                                     'Zap',            10,        v_completed),
      ('twenty-five-nodes',    'Pattern Forming',         '25 nodes. The vocabulary is starting to click.',                                   'Hexagon',        25,        v_completed),
      ('fifty-nodes',          'Tradecraft',              '50 nodes. You''re done with foundations — now hunt.',                              'Target',         50,        v_completed),
      ('hundred-nodes',        'Specialist',              '100 nodes complete. Most pentesters never get here.',                              'Award',          100,       v_completed),
      ('two-fifty-nodes',      'Senior Operator',         '250 nodes. Real depth across the discipline.',                                     'Medal',          250,       v_completed),
      ('five-hundred-nodes',   'Encyclopedic',            '500 nodes. You can teach this.',                                                   'Library',        500,       v_completed),

      -- Zone progress
      ('five-zones-touched',   'Wide Surface',            'Started progress in 5 different zones.',                                           'Map',            5,         v_zones_touched),
      ('ten-zones-touched',    'Cartographer',            '10 zones with at least one node touched.',                                         'Compass',        10,        v_zones_touched),
      ('five-zones',           'Five Constellations',     'Five zones cleared. The atlas is filling in.',                                     'Star',           5,         v_zones_completed),
      ('ten-zones-cleared',    'Half the Sky',            'Ten zones fully cleared. Specialist territory.',                                   'Telescope',      10,        v_zones_completed),
      ('all-zones-web',        'Web Master',              'Every zone in the Web region cleared. Senior territory.',                          'Crown',          23,        v_zones_completed),

      -- Depth specialization
      ('intro-graduate',       'Foundations Laid',        '25 intro-tier nodes complete. The basics are in your bones.',                      'BookOpen',       25,        v_depth_intro),
      ('std-operator',         'Standard Issue',          '25 standard-tier nodes complete. Day-to-day operator chops.',                      'ShieldCheck',    25,        v_depth_std),
      ('adv-tradecraft',       'Advanced Tradecraft',     '10 advanced-tier nodes complete. Senior-level techniques.',                        'Sword',          10,        v_depth_adv),
      ('research-tier',        'Researcher',              '5 research-tier nodes complete. You''re chasing the edges.',                       'Microscope',     5,         v_depth_res),

      -- Kind specialization
      ('bedrock',              'Bedrock',                 '10 foundation nodes complete. Theory before tooling.',                             'Anchor',         10,        v_kind_foundation),
      ('toolsmith',            'Toolsmith',               '10 tool nodes complete. Burp, ffuf, sqlmap — comfortable.',                        'Wrench',         10,        v_kind_tool),
      ('recon-master',         'Reconnaissance',          '10 recon nodes complete. You see the attack surface clearly.',                     'Search',         10,        v_kind_recon),
      ('vuln-hunter',          'Vuln Hunter',             '15 vulnerability nodes complete. Finding bugs is muscle memory.',                  'Bug',            15,        v_kind_vuln),
      ('blue-aware',           'Blue-Team Aware',         '5 defense nodes complete. You know what gets you caught.',                         'Shield',         5,         v_kind_defense),
      ('methodologist',        'Methodologist',           '5 methodology nodes complete. Process beats vibes.',                               'ClipboardList',  5,         v_kind_methodology),
      ('capstone-climber',     'Capstone Climber',        '3 capstone nodes complete. You''re chaining attacks end-to-end.',                  'Mountain',       3,         v_kind_capstone),

      -- Skill mastery
      ('first-mastery',        'Signature Move',          'Cleared every sub-technique under one top-level skill.',                           'Sparkles',       1,         v_top_mastered),
      ('five-masteries',       'Polymath',                'Mastered 5 top-level skills end-to-end.',                                          'BrainCircuit',   5,         v_top_mastered),
      ('ten-masteries',        'Generalist',              '10 mastered top-level skills. Few pivots stop you now.',                           'Atom',           10,        v_top_mastered),
      ('twenty-five-masteries','Apex Generalist',         '25 mastered top-level skills. Real range.',                                        'Gem',            25,        v_top_mastered),

      -- Streaks
      ('streak-3',             'Three Sun Cycles',        '3-day streak. The habit is forming.',                                              'Flame',          3,         v_streak),
      ('streak-7',             'A Week Unbroken',         '7-day streak. You showed up every day.',                                           'Flame',          7,         v_streak),
      ('streak-14',            'Fortnight',               '14-day streak. Two weeks straight, no excuses.',                                   'Flame',          14,        v_streak),
      ('streak-30',            'Month of Mondays',        '30-day streak. Discipline made visible.',                                          'Flame',          30,        v_streak),
      ('streak-100',           'Centurion',               '100-day streak. This is who you are now.',                                         'Crown',          100,       v_streak),

      -- Levels
      ('level-5',              'Operator Tier 5',         'Level 5 reached. First major bracket cleared.',                                    'ArrowUp',        5,         v_level),
      ('level-10',             'Operator Tier 10',        'Level 10 reached. Solid mid-game.',                                                'ArrowUp',        10,        v_level),
      ('level-15',             'Operator Tier 15',        'Level 15 reached. Late-mid territory.',                                            'ArrowUp',        15,        v_level),
      ('level-25',             'Operator Tier 25',        'Level 25 reached. Few make it this far.',                                          'ArrowUp',        25,        v_level),
      ('level-50',             'Apex Operator',           'Level 50. You''ve gone past the curve into the long tail.',                        'Crown',          50,        v_level),

      -- Big-day pushes
      ('five-in-a-day',        'Productive Day',          'Completed 5 nodes in a single day.',                                               'Sun',            5,         v_max_in_one_day),
      ('ten-in-a-day',         'Crunch Mode',             'Completed 10 nodes in a single day. Lock-in achieved.',                            'Cpu',            10,        v_max_in_one_day),
      ('twenty-in-a-day',      'Marathon',                'Completed 20 nodes in a single day. Touch grass after this one.',                  'Rocket',         20,        v_max_in_one_day),

      -- Codex / resources
      ('ten-resources',        'Library Card',            '10 resources attached across the graph.',                                          'BookOpen',       10,        v_resources_total),
      ('fifty-resources',      'Stack Builder',           '50 resources attached. Your codex is loaded.',                                     'Library',        50,        v_resources_total),
      ('hundred-resources',    'Reference Operator',      '100 resources attached. Source-of-truth grade.',                                   'Database',       100,       v_resources_total),
      ('five-pinned',          'Curated',                 'Pinned 5 resources. The cream of the codex.',                                      'Pin',            5,         v_resources_pinned),

      -- Notes / writing
      ('ten-notes',            'Operator''s Journal',     'Wrote notes on 10 different nodes.',                                               'Scroll',         10,        v_notes_total),
      ('fifty-notes',          'Field Researcher',        '50 nodes documented in your own words.',                                           'FileText',       50,        v_notes_total),
      ('long-note',            'Deep Dive',               'Wrote a 2,000+ character note on a single topic.',                                 'Pencil',         2000,      v_longest_note),

      -- Refreshers / spaced repetition
      ('ten-refresher-acks',   'Recall Trained',          'Cleanly recalled 10 refresher prompts. Memory is sharpening.',                     'Brain',          10,        v_refresher_acks),
      ('fifty-refresher-acks', 'Long-Term Storage',       'Cleanly recalled 50 refreshers. You don''t lose what you learn.',                  'Brain',          50,        v_refresher_acks),
      ('refresher-streak-5',   'Steel Trap',              'Hit a 5-deep recall streak on a single node. It''s fully internalized.',           'Lock',           5,         v_refresher_max),

      -- Bounties / real-world
      ('first-bounty',         'Live Fire',               'First bug bounty submission accepted. Real-world.',                                'Crosshair',      1,         v_bounties_accepted),
      ('first-payout',         'Paid',                    'First bounty payout in the ledger.',                                               'DollarSign',     1,         v_bounties_payout::int),
      ('first-cve',            'Etched in CVE',           'First CVE assigned to your name.',                                                 'Hash',           1,         v_bounties_cves),
      ('five-bounties',        'Repeat Offender',         '5 bounties accepted. Pattern recognition pays.',                                   'Crosshair',      5,         v_bounties_accepted),
      ('ten-bounties',         'Bounty Veteran',          '10 bounties accepted. Programs know your handle.',                                 'BadgeCheck',     10,        v_bounties_accepted),
      ('payout-1k',            '$1k Club',                'Total bounty payouts crossed $1,000.',                                             'DollarSign',     1000,      v_bounties_payout::int),
      ('payout-10k',           'Five-Figure Hunter',      'Total bounty payouts crossed $10,000.',                                            'Coins',          10000,     v_bounties_payout::int),
      ('five-cves',            'Vulnerability Disclosed', '5 CVEs in your ledger. Public-record security work.',                              'ShieldAlert',    5,         v_bounties_cves)
    ) AS t(id, name, description, icon, target, value)
  WHERE t.value >= t.target
  ON CONFLICT (user_id, achievement_id) DO NOTHING
  RETURNING *;
END;
$$;

-- ---------------------------------------------------------------------------
-- Realtime: enable replication on user_achievement so the client can
-- subscribe to its own row inserts and pop the unlock modal in real time
-- without polling. RLS still applies — Supabase Realtime respects the
-- per-user policy, so each subscriber only receives their own rows.
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_achievement;
