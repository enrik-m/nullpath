-- Nullpath security hardening + post-launch RLS lockdown.
--
-- This migration is purely additive and idempotent — re-running it
-- produces the same end state without errors. It does NOT modify the
-- three earlier migration files (initial_schema, functions, seed_web).
--
-- Audit findings addressed here:
--   1. user_achievement was world-writable from the client. A modified
--      client could forge unlocks, defeating evaluate_achievements as a
--      trust boundary. Drop the INSERT/UPDATE/DELETE policies (keep
--      SELECT) and convert evaluate_achievements to SECURITY DEFINER so
--      it can still write through the now-locked policies.
--   2. evaluate_achievements used `RETURNING *`, leaking any future
--      column on user_achievement. Switch to an explicit RETURNING list.
--   3. `ALTER PUBLICATION supabase_realtime ADD TABLE ...` failed on
--      self-hosted Postgres without that publication and on re-run.
--      Wrap in a guarded DO block.
--   4. handle_new_user had no exception handler — a constraint failure
--      during signup (e.g. a future NOT NULL column) would roll back the
--      whole auth.users insert. Swallow + warn instead.
--   5. idx_uns_user_node duplicates the user_node_state primary key.
--      Drop it; the PK already provides the index.
--   6. Add achievement_context(p_user_id) RPC so the client can render
--      the achievement-progress UI in cloud mode without re-running the
--      raw SQL it uses against sql.js in local mode.

-- ---------------------------------------------------------------------------
-- 1. Lock down user_achievement to read-only from clients.
-- ---------------------------------------------------------------------------
-- The DO block in the initial migration created policies via
--   format('CREATE POLICY "%I: insert own" ...', t)
-- where %I doubles the quoting. The actual policy names in pg_policies
-- end up as:
--     "user_achievement: read own"
--     "user_achievement: insert own"
--     "user_achievement: update own"
--     "user_achievement: delete own"
-- (verified: %I inside a quoted format spec adds inner quotes only when
-- the identifier needs them; for plain ASCII table names like
-- 'user_achievement' the outer "%I:" expands to the literal name).
-- We DROP IF EXISTS for both the bare and double-quoted variants so
-- this migration is robust to either rendering.

DROP POLICY IF EXISTS "user_achievement: insert own" ON public.user_achievement;
DROP POLICY IF EXISTS "user_achievement: update own" ON public.user_achievement;
DROP POLICY IF EXISTS "user_achievement: delete own" ON public.user_achievement;
DROP POLICY IF EXISTS """user_achievement"": insert own" ON public.user_achievement;
DROP POLICY IF EXISTS """user_achievement"": update own" ON public.user_achievement;
DROP POLICY IF EXISTS """user_achievement"": delete own" ON public.user_achievement;

-- ---------------------------------------------------------------------------
-- 2. Recreate evaluate_achievements as SECURITY DEFINER with an explicit
--    RETURNING list. Body is otherwise identical to the original; the
--    _assert_self(p_user_id) gate at the top still ensures a user can
--    only evaluate their own achievements (auth.uid() drives that check
--    regardless of definer/invoker).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_achievements(p_user_id UUID)
RETURNS SETOF public.user_achievement
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  v_zones_completed   INTEGER;
  v_zones_touched     INTEGER;
  v_streak            INTEGER;
  v_xp                INTEGER;
  v_level             INTEGER;
  v_max_in_one_day    INTEGER;
  v_resources_total   INTEGER;
  v_resources_pinned  INTEGER;
  v_notes_total       INTEGER;
  v_longest_note      INTEGER;
  v_refresher_acks    INTEGER;
  v_refresher_max     INTEGER;
  v_bounties_accepted INTEGER;
  v_bounties_payout   NUMERIC;
  v_bounties_cves     INTEGER;
BEGIN
  PERFORM public._assert_self(p_user_id);

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

  v_streak := public.current_streak(p_user_id);
  v_xp := public.operator_xp(p_user_id);
  v_level := public.operator_level(v_xp);

  SELECT COALESCE(MAX(sessions), 0) INTO v_max_in_one_day
    FROM public.user_streak_day WHERE user_id = p_user_id;

  SELECT COUNT(*), COALESCE(SUM(pinned), 0)
    INTO v_resources_total, v_resources_pinned
    FROM public.user_node_resource WHERE user_id = p_user_id;

  SELECT COUNT(*), COALESCE(MAX(LENGTH(body_md)), 0)
    INTO v_notes_total, v_longest_note
    FROM public.user_node_note WHERE user_id = p_user_id;

  SELECT COALESCE(SUM(streak), 0), COALESCE(MAX(streak), 0)
    INTO v_refresher_acks, v_refresher_max
    FROM public.user_refresher WHERE user_id = p_user_id;

  SELECT
    COUNT(*) FILTER (WHERE status IN ('accepted', 'resolved')),
    COALESCE(SUM(payout_usd), 0),
    COUNT(*) FILTER (WHERE cve_id IS NOT NULL AND cve_id <> '')
  INTO v_bounties_accepted, v_bounties_payout, v_bounties_cves
    FROM public.user_bounty WHERE user_id = p_user_id;

  RETURN QUERY
  INSERT INTO public.user_achievement (user_id, achievement_id, name, description, icon)
  SELECT p_user_id, t.id, t.name, t.description, t.icon
    FROM (VALUES
      ('first-node',           'First Move',              'Mark your first node complete. The path begins.',                                  'Footprints',     1,         v_completed),
      ('first-zone',           'Zone Cleared',            'Every node in a zone — done. The constellation glows.',                            'Trophy',         1,         v_zones_completed),
      ('first-resource',       'Pack Rat',                'Attach your first resource to a node. Build the library.',                         'BookOpen',       1,         v_resources_total),
      ('first-note',           'Field Notes',             'Wrote your first node note. Synthesis beats re-reading.',                          'Pencil',         1,         v_notes_total),
      ('ten-nodes',            'Operator In Training',    '10 nodes complete. Your kit is taking shape.',                                     'Zap',            10,        v_completed),
      ('twenty-five-nodes',    'Pattern Forming',         '25 nodes. The vocabulary is starting to click.',                                   'Hexagon',        25,        v_completed),
      ('fifty-nodes',          'Tradecraft',              '50 nodes. You''re done with foundations — now hunt.',                              'Target',         50,        v_completed),
      ('hundred-nodes',        'Specialist',              '100 nodes complete. Most pentesters never get here.',                              'Award',          100,       v_completed),
      ('two-fifty-nodes',      'Senior Operator',         '250 nodes. Real depth across the discipline.',                                     'Medal',          250,       v_completed),
      ('five-hundred-nodes',   'Encyclopedic',            '500 nodes. You can teach this.',                                                   'Library',        500,       v_completed),
      ('five-zones-touched',   'Wide Surface',            'Started progress in 5 different zones.',                                           'Map',            5,         v_zones_touched),
      ('ten-zones-touched',    'Cartographer',            '10 zones with at least one node touched.',                                         'Compass',        10,        v_zones_touched),
      ('five-zones',           'Five Constellations',     'Five zones cleared. The atlas is filling in.',                                     'Star',           5,         v_zones_completed),
      ('ten-zones-cleared',    'Half the Sky',            'Ten zones fully cleared. Specialist territory.',                                   'Telescope',      10,        v_zones_completed),
      ('all-zones-web',        'Web Master',              'Every zone in the Web region cleared. Senior territory.',                          'Crown',          23,        v_zones_completed),
      ('intro-graduate',       'Foundations Laid',        '25 intro-tier nodes complete. The basics are in your bones.',                      'BookOpen',       25,        v_depth_intro),
      ('std-operator',         'Standard Issue',          '25 standard-tier nodes complete. Day-to-day operator chops.',                      'ShieldCheck',    25,        v_depth_std),
      ('adv-tradecraft',       'Advanced Tradecraft',     '10 advanced-tier nodes complete. Senior-level techniques.',                        'Sword',          10,        v_depth_adv),
      ('research-tier',        'Researcher',              '5 research-tier nodes complete. You''re chasing the edges.',                       'Microscope',     5,         v_depth_res),
      ('bedrock',              'Bedrock',                 '10 foundation nodes complete. Theory before tooling.',                             'Anchor',         10,        v_kind_foundation),
      ('toolsmith',            'Toolsmith',               '10 tool nodes complete. Burp, ffuf, sqlmap — comfortable.',                        'Wrench',         10,        v_kind_tool),
      ('recon-master',         'Reconnaissance',          '10 recon nodes complete. You see the attack surface clearly.',                     'Search',         10,        v_kind_recon),
      ('vuln-hunter',          'Vuln Hunter',             '15 vulnerability nodes complete. Finding bugs is muscle memory.',                  'Bug',            15,        v_kind_vuln),
      ('blue-aware',           'Blue-Team Aware',         '5 defense nodes complete. You know what gets you caught.',                         'Shield',         5,         v_kind_defense),
      ('methodologist',        'Methodologist',           '5 methodology nodes complete. Process beats vibes.',                               'ClipboardList',  5,         v_kind_methodology),
      ('capstone-climber',     'Capstone Climber',        '3 capstone nodes complete. You''re chaining attacks end-to-end.',                  'Mountain',       3,         v_kind_capstone),
      ('first-mastery',        'Signature Move',          'Cleared every sub-technique under one top-level skill.',                           'Sparkles',       1,         v_top_mastered),
      ('five-masteries',       'Polymath',                'Mastered 5 top-level skills end-to-end.',                                          'BrainCircuit',   5,         v_top_mastered),
      ('ten-masteries',        'Generalist',              '10 mastered top-level skills. Few pivots stop you now.',                           'Atom',           10,        v_top_mastered),
      ('twenty-five-masteries','Apex Generalist',         '25 mastered top-level skills. Real range.',                                        'Gem',            25,        v_top_mastered),
      ('streak-3',             'Three Sun Cycles',        '3-day streak. The habit is forming.',                                              'Flame',          3,         v_streak),
      ('streak-7',             'A Week Unbroken',         '7-day streak. You showed up every day.',                                           'Flame',          7,         v_streak),
      ('streak-14',            'Fortnight',               '14-day streak. Two weeks straight, no excuses.',                                   'Flame',          14,        v_streak),
      ('streak-30',            'Month of Mondays',        '30-day streak. Discipline made visible.',                                          'Flame',          30,        v_streak),
      ('streak-100',           'Centurion',               '100-day streak. This is who you are now.',                                         'Crown',          100,       v_streak),
      ('level-5',              'Operator Tier 5',         'Level 5 reached. First major bracket cleared.',                                    'ArrowUp',        5,         v_level),
      ('level-10',             'Operator Tier 10',        'Level 10 reached. Solid mid-game.',                                                'ArrowUp',        10,        v_level),
      ('level-15',             'Operator Tier 15',        'Level 15 reached. Late-mid territory.',                                            'ArrowUp',        15,        v_level),
      ('level-25',             'Operator Tier 25',        'Level 25 reached. Few make it this far.',                                          'ArrowUp',        25,        v_level),
      ('level-50',             'Apex Operator',           'Level 50. You''ve gone past the curve into the long tail.',                        'Crown',          50,        v_level),
      ('five-in-a-day',        'Productive Day',          'Completed 5 nodes in a single day.',                                               'Sun',            5,         v_max_in_one_day),
      ('ten-in-a-day',         'Crunch Mode',             'Completed 10 nodes in a single day. Lock-in achieved.',                            'Cpu',            10,        v_max_in_one_day),
      ('twenty-in-a-day',      'Marathon',                'Completed 20 nodes in a single day. Touch grass after this one.',                  'Rocket',         20,        v_max_in_one_day),
      ('ten-resources',        'Library Card',            '10 resources attached across the graph.',                                          'BookOpen',       10,        v_resources_total),
      ('fifty-resources',      'Stack Builder',           '50 resources attached. Your codex is loaded.',                                     'Library',        50,        v_resources_total),
      ('hundred-resources',    'Reference Operator',      '100 resources attached. Source-of-truth grade.',                                   'Database',       100,       v_resources_total),
      ('five-pinned',          'Curated',                 'Pinned 5 resources. The cream of the codex.',                                      'Pin',            5,         v_resources_pinned),
      ('ten-notes',            'Operator''s Journal',     'Wrote notes on 10 different nodes.',                                               'Scroll',         10,        v_notes_total),
      ('fifty-notes',          'Field Researcher',        '50 nodes documented in your own words.',                                           'FileText',       50,        v_notes_total),
      ('long-note',            'Deep Dive',               'Wrote a 2,000+ character note on a single topic.',                                 'Pencil',         2000,      v_longest_note),
      ('ten-refresher-acks',   'Recall Trained',          'Cleanly recalled 10 refresher prompts. Memory is sharpening.',                     'Brain',          10,        v_refresher_acks),
      ('fifty-refresher-acks', 'Long-Term Storage',       'Cleanly recalled 50 refreshers. You don''t lose what you learn.',                  'Brain',          50,        v_refresher_acks),
      ('refresher-streak-5',   'Steel Trap',              'Hit a 5-deep recall streak on a single node. It''s fully internalized.',           'Lock',           5,         v_refresher_max),
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
  RETURNING user_id, achievement_id, name, description, icon, unlocked_at;
END;
$$;

-- Lock down execution: only authenticated users may invoke; anon and
-- public roles cannot reach it. The function body still asserts
-- auth.uid() = p_user_id so even a logged-in user can't pass another
-- user's id.
REVOKE EXECUTE ON FUNCTION public.evaluate_achievements(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.evaluate_achievements(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Idempotent + self-host-safe realtime publication add.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'user_achievement'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_achievement;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. handle_new_user: don't fail signup on a downstream constraint error.
--    Body is otherwise the original — INSERT default user_app_state row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_app_state (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Drop the duplicate (user_id, node_id) index on user_node_state.
--    The PRIMARY KEY on (user_id, node_id) already provides this index.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_uns_user_node;

-- ---------------------------------------------------------------------------
-- 6. achievement_context(p_user_id) — single-row context for the client's
--    achievement-progress UI. Mirrors the aggregate computation inside
--    evaluate_achievements so the client doesn't have to re-derive these
--    counters from raw tables (which it can't anyway in cloud mode —
--    several of the local-mode aggregates run against sql.js tables that
--    don't exist server-side).
--
--    SECURITY INVOKER + STABLE + _assert_self gate. Read-only; RLS on
--    the underlying per-user tables is the actual access control.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.achievement_context(p_user_id UUID)
RETURNS TABLE (
  total_completed       INTEGER,
  depth_intro           INTEGER,
  depth_std             INTEGER,
  depth_adv             INTEGER,
  depth_res             INTEGER,
  kind_foundation       INTEGER,
  kind_tool             INTEGER,
  kind_recon            INTEGER,
  kind_vuln             INTEGER,
  kind_defense          INTEGER,
  kind_methodology      INTEGER,
  kind_capstone         INTEGER,
  top_levels_mastered   INTEGER,
  zones_completed       INTEGER,
  zones_touched         INTEGER,
  streak                INTEGER,
  xp                    INTEGER,
  level                 INTEGER,
  max_in_one_day        INTEGER,
  resources_total       INTEGER,
  resources_pinned      INTEGER,
  notes_total           INTEGER,
  longest_note_length   INTEGER,
  refresher_acks        INTEGER,
  refresher_max_streak  INTEGER,
  bounties_accepted     INTEGER,
  bounties_payout       NUMERIC,
  bounties_cves         INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
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
  v_zones_completed   INTEGER;
  v_zones_touched     INTEGER;
  v_streak            INTEGER;
  v_xp                INTEGER;
  v_level             INTEGER;
  v_max_in_one_day    INTEGER;
  v_resources_total   INTEGER;
  v_resources_pinned  INTEGER;
  v_notes_total       INTEGER;
  v_longest_note      INTEGER;
  v_refresher_acks    INTEGER;
  v_refresher_max     INTEGER;
  v_bounties_accepted INTEGER;
  v_bounties_payout   NUMERIC;
  v_bounties_cves     INTEGER;
BEGIN
  PERFORM public._assert_self(p_user_id);

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

  v_streak := public.current_streak(p_user_id);
  v_xp := public.operator_xp(p_user_id);
  v_level := public.operator_level(v_xp);

  SELECT COALESCE(MAX(sessions), 0) INTO v_max_in_one_day
    FROM public.user_streak_day WHERE user_id = p_user_id;

  SELECT COUNT(*), COALESCE(SUM(pinned), 0)
    INTO v_resources_total, v_resources_pinned
    FROM public.user_node_resource WHERE user_id = p_user_id;

  SELECT COUNT(*), COALESCE(MAX(LENGTH(body_md)), 0)
    INTO v_notes_total, v_longest_note
    FROM public.user_node_note WHERE user_id = p_user_id;

  SELECT COALESCE(SUM(streak), 0), COALESCE(MAX(streak), 0)
    INTO v_refresher_acks, v_refresher_max
    FROM public.user_refresher WHERE user_id = p_user_id;

  SELECT
    COUNT(*) FILTER (WHERE status IN ('accepted', 'resolved')),
    COALESCE(SUM(payout_usd), 0),
    COUNT(*) FILTER (WHERE cve_id IS NOT NULL AND cve_id <> '')
  INTO v_bounties_accepted, v_bounties_payout, v_bounties_cves
    FROM public.user_bounty WHERE user_id = p_user_id;

  total_completed      := v_completed;
  depth_intro          := v_depth_intro;
  depth_std            := v_depth_std;
  depth_adv            := v_depth_adv;
  depth_res            := v_depth_res;
  kind_foundation      := v_kind_foundation;
  kind_tool            := v_kind_tool;
  kind_recon           := v_kind_recon;
  kind_vuln            := v_kind_vuln;
  kind_defense         := v_kind_defense;
  kind_methodology     := v_kind_methodology;
  kind_capstone        := v_kind_capstone;
  top_levels_mastered  := v_top_mastered;
  zones_completed      := v_zones_completed;
  zones_touched        := v_zones_touched;
  streak               := v_streak;
  xp                   := v_xp;
  level                := v_level;
  max_in_one_day       := v_max_in_one_day;
  resources_total      := v_resources_total;
  resources_pinned     := v_resources_pinned;
  notes_total          := v_notes_total;
  longest_note_length  := v_longest_note;
  refresher_acks       := v_refresher_acks;
  refresher_max_streak := v_refresher_max;
  bounties_accepted    := v_bounties_accepted;
  bounties_payout      := v_bounties_payout;
  bounties_cves        := v_bounties_cves;

  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.achievement_context(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.achievement_context(uuid) TO authenticated;
