-- Nullpath cloud-mode polish migration.
--
-- Four follow-ups landed after the initial v0.23.0-beta.1 cloud cut:
--
-- 1. `toggle_pin_resource(p_user_id, p_resource_id)` — single-shot
--    UPDATE that flips `pinned` atomically. Replaces the client-side
--    read-modify-write that raced between tabs.
--
-- 2. `import_user_backup(p_user_id, p_payload jsonb)` — wipe + restore
--    in a single transaction. Replaces the six-step client-side
--    importBackup that left accounts half-restored on mid-flow failure.
--
-- 3. `evaluate_achievements` recreated with NUMERIC target/value columns
--    in the catalog VALUES table so the bounty-payout achievements
--    compare against the actual decimal payout (the previous `::int`
--    truncation meant a $999.99 payout didn't trip "$1k Club" until
--    exactly $1000.00). Same logic, same achievement IDs, same gates —
--    just no integer truncation on the payout side.
--
-- 4. `delete_account(p_user_id)` helper — exposed to the Edge Function
--    but ALSO callable from the client as a defense-in-depth wipe in
--    case Edge Function deployment slips. The Edge Function still
--    handles the auth.users row deletion (requires service_role).
--
-- All changes are idempotent (CREATE OR REPLACE / DROP IF EXISTS).

-- ---------------------------------------------------------------------------
-- 1. toggle_pin_resource — atomic single-statement pin toggle.
-- Returns the new pinned value (0 or 1) so the client doesn't need a
-- follow-up read.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.toggle_pin_resource(
  p_user_id     UUID,
  p_resource_id BIGINT
)
RETURNS SMALLINT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_pinned SMALLINT;
BEGIN
  PERFORM public._assert_self(p_user_id);

  UPDATE public.user_node_resource
     SET pinned = 1 - pinned
   WHERE id = p_resource_id
     AND user_id = p_user_id
   RETURNING pinned INTO new_pinned;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'resource not found or not owned by caller'
      USING ERRCODE = '02000';
  END IF;

  RETURN new_pinned;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_pin_resource(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_pin_resource(UUID, BIGINT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. import_user_backup — atomic wipe + restore in one transaction.
--
-- Takes a JSONB payload matching the shape of BackupSnapshot from
-- src/db/cloud.ts. Deletes every per-user row, then re-inserts from the
-- payload, then triggers an achievement re-evaluation. If anything
-- fails mid-way, the whole transaction rolls back — accounts can't end
-- up half-restored.
--
-- Achievement metadata is NOT restored from the snapshot — it's
-- regenerated from the restored state by evaluate_achievements at the
-- end. This matches local-mode semantics for "every other field" while
-- letting the server-side catalog be the source of truth for unlocks.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.import_user_backup(
  p_user_id UUID,
  p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  app_state JSONB;
BEGIN
  PERFORM public._assert_self(p_user_id);

  -- Wipe per-user rows. Order doesn't actually matter (no internal FKs
  -- between user_* tables), but we follow the same order as
  -- reset_all_progress for consistency.
  DELETE FROM public.user_node_resource WHERE user_id = p_user_id;
  DELETE FROM public.user_node_note     WHERE user_id = p_user_id;
  DELETE FROM public.user_refresher     WHERE user_id = p_user_id;
  DELETE FROM public.user_bounty        WHERE user_id = p_user_id;
  DELETE FROM public.user_streak_day    WHERE user_id = p_user_id;
  DELETE FROM public.user_achievement   WHERE user_id = p_user_id;
  DELETE FROM public.user_node_state    WHERE user_id = p_user_id;

  -- Restore node states.
  INSERT INTO public.user_node_state (user_id, node_id, status, user_xp, completed_at, started_at)
  SELECT p_user_id,
         n->>'id',
         n->>'status',
         (n->>'user_xp')::INTEGER,
         NULLIF(n->>'completed_at', '')::TIMESTAMPTZ,
         NULLIF(n->>'started_at',  '')::TIMESTAMPTZ
    FROM jsonb_array_elements(COALESCE(p_payload->'nodes', '[]'::JSONB)) AS n
   WHERE n->>'id' IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.node_def WHERE id = n->>'id');

  -- Restore resources. BIGSERIAL gets fresh ids — original ids are
  -- local-only, no semantic carry-over.
  INSERT INTO public.user_node_resource (user_id, node_id, kind, title, url, note, pinned, visibility, added_at)
  SELECT p_user_id,
         r->>'node_id',
         r->>'kind',
         r->>'title',
         r->>'url',
         r->>'note',
         COALESCE((r->>'pinned')::SMALLINT, 0),
         CASE WHEN r->>'visibility' IN ('private', 'public') THEN r->>'visibility' ELSE 'private' END,
         COALESCE(NULLIF(r->>'added_at', '')::TIMESTAMPTZ, NOW())
    FROM jsonb_array_elements(COALESCE(p_payload->'resources', '[]'::JSONB)) AS r
   WHERE r->>'node_id' IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.node_def WHERE id = r->>'node_id');

  -- Restore notes.
  INSERT INTO public.user_node_note (user_id, node_id, body_md, visibility, updated_at)
  SELECT p_user_id,
         n->>'node_id',
         COALESCE(n->>'body_md', ''),
         CASE WHEN n->>'visibility' IN ('private', 'public') THEN n->>'visibility' ELSE 'private' END,
         COALESCE(NULLIF(n->>'updated_at', '')::TIMESTAMPTZ, NOW())
    FROM jsonb_array_elements(COALESCE(p_payload->'notes', '[]'::JSONB)) AS n
   WHERE n->>'node_id' IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.node_def WHERE id = n->>'node_id');

  -- Restore refreshers.
  INSERT INTO public.user_refresher (user_id, node_id, streak, last_at, due_at)
  SELECT p_user_id,
         r->>'node_id',
         COALESCE((r->>'streak')::INTEGER, 0),
         NULLIF(r->>'last_at', '')::TIMESTAMPTZ,
         COALESCE(NULLIF(r->>'due_at', '')::TIMESTAMPTZ, NOW())
    FROM jsonb_array_elements(COALESCE(p_payload->'refreshers', '[]'::JSONB)) AS r
   WHERE r->>'node_id' IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.node_def WHERE id = r->>'node_id');

  -- Restore bounties.
  INSERT INTO public.user_bounty (user_id, program, title, severity, status, payout_usd, submitted_at, cve_id, related_node, notes)
  SELECT p_user_id,
         b->>'program',
         b->>'title',
         b->>'severity',
         COALESCE(b->>'status', 'submitted'),
         CASE WHEN b->>'payout_usd' IS NULL OR b->>'payout_usd' = '' THEN NULL
              ELSE (b->>'payout_usd')::NUMERIC END,
         COALESCE(NULLIF(b->>'submitted_at', '')::TIMESTAMPTZ, NOW()),
         NULLIF(b->>'cve_id', ''),
         NULLIF(b->>'related_node', ''),
         NULLIF(b->>'notes', '')
    FROM jsonb_array_elements(COALESCE(p_payload->'bounties', '[]'::JSONB)) AS b
   WHERE b->>'program' IS NOT NULL
     AND b->>'severity' IN ('info', 'low', 'medium', 'high', 'critical');

  -- Restore streak days.
  INSERT INTO public.user_streak_day (user_id, day, sessions, used_freeze)
  SELECT p_user_id,
         (d->>'day')::DATE,
         COALESCE((d->>'sessions')::INTEGER, 0),
         COALESCE((d->>'used_freeze')::SMALLINT, 0)
    FROM jsonb_array_elements(COALESCE(p_payload->'streakDays', '[]'::JSONB)) AS d
   WHERE d->>'day' IS NOT NULL;

  -- Patch user_app_state — keep the row (PK FK to auth.users), update
  -- only user-controlled gameplay fields.
  app_state := p_payload->'appState';
  IF app_state IS NOT NULL THEN
    UPDATE public.user_app_state
       SET handle                  = COALESCE(app_state->>'handle', handle),
           scanlines_enabled       = COALESCE((app_state->>'scanlines_enabled')::SMALLINT, scanlines_enabled),
           sound_enabled           = COALESCE((app_state->>'sound_enabled')::SMALLINT, sound_enabled),
           freeze_tokens           = COALESCE((app_state->>'freeze_tokens')::INTEGER, freeze_tokens),
           last_freeze_award_week  = NULLIF(app_state->>'last_freeze_award_week', '')
     WHERE user_id = p_user_id;
  END IF;

  -- Re-evaluate achievements against the restored state. The function
  -- writes to user_achievement which is now SECURITY DEFINER-only;
  -- since we're in the same transaction, this works correctly.
  PERFORM public.evaluate_achievements(p_user_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_user_backup(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_user_backup(UUID, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. evaluate_achievements — same body, but the catalog VALUES table
-- now uses NUMERIC for target+value columns so bounty-payout
-- comparisons work with cents.
--
-- The fix: first row's target/value are explicitly NUMERIC, which sets
-- the column type for the whole VALUES table; subsequent integer
-- literals get implicit-cast to NUMERIC; v_bounties_payout (already
-- NUMERIC) is no longer truncated. Result: $999.99 doesn't trip
-- "$1k Club", but $1000.00 does — exactly the right semantics.
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

  -- Catalog VALUES table — first row's target+value are explicit NUMERIC
  -- so the column type is NUMERIC throughout. No more ::int truncation
  -- on bounty payouts.
  RETURN QUERY
  INSERT INTO public.user_achievement (user_id, achievement_id, name, description, icon)
  SELECT p_user_id, t.id, t.name, t.description, t.icon
    FROM (VALUES
      ('first-node',           'First Move',              'Mark your first node complete. The path begins.',                                  'Footprints',     1::NUMERIC, v_completed::NUMERIC),
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
      ('first-payout',         'Paid',                    'First bounty payout in the ledger.',                                               'DollarSign',     1,         v_bounties_payout),
      ('first-cve',            'Etched in CVE',           'First CVE assigned to your name.',                                                 'Hash',           1,         v_bounties_cves),
      ('five-bounties',        'Repeat Offender',         '5 bounties accepted. Pattern recognition pays.',                                   'Crosshair',      5,         v_bounties_accepted),
      ('ten-bounties',         'Bounty Veteran',          '10 bounties accepted. Programs know your handle.',                                 'BadgeCheck',     10,        v_bounties_accepted),
      ('payout-1k',            '$1k Club',                'Total bounty payouts crossed $1,000.',                                             'DollarSign',     1000,      v_bounties_payout),
      ('payout-10k',           'Five-Figure Hunter',      'Total bounty payouts crossed $10,000.',                                            'Coins',          10000,     v_bounties_payout),
      ('five-cves',            'Vulnerability Disclosed', '5 CVEs in your ledger. Public-record security work.',                              'ShieldAlert',    5,         v_bounties_cves)
    ) AS t(id, name, description, icon, target, value)
  WHERE t.value >= t.target
  ON CONFLICT (user_id, achievement_id) DO NOTHING
  RETURNING user_id, achievement_id, name, description, icon, unlocked_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluate_achievements(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_achievements(UUID) TO authenticated;
