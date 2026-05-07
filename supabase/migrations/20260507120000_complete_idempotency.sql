-- Patch `complete_node` so re-completing a node that was previously
-- completed-then-reopened doesn't award XP again. The earlier function
-- only guarded `was_status = 'complete'`; a node with status='available'
-- but completed_at != NULL (the re-opened state) was still treated as
-- a fresh completion, so RE-OPEN → COMPLETE → RE-OPEN → COMPLETE could
-- be spammed for unbounded XP, streak bumps, and achievement triggers.
--
-- New behavior:
--   - was_status = 'complete'              → no-op (return awarded=0,already=true)
--   - completed_at IS NOT NULL (re-open)   → just flip status to complete,
--                                            don't re-award XP, don't bump streak,
--                                            don't reset refresher
--   - completed_at IS NULL (first complete) → full atomic award flow
--
-- Mirrors the new local-mode setNodeStatus behavior exactly.

CREATE OR REPLACE FUNCTION public.complete_node(p_user_id UUID, p_node_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  node_depth        TEXT;
  awarded           INTEGER;
  was_status        TEXT;
  was_completed_at  TIMESTAMPTZ;
BEGIN
  PERFORM public._assert_self(p_user_id);

  SELECT depth INTO node_depth FROM public.node_def WHERE id = p_node_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown node_id: %', p_node_id USING ERRCODE = '23503';
  END IF;

  -- Read current state (status + completed_at) so we know whether
  -- this is a fresh complete, a re-complete after re-open, or a
  -- redundant click on an already-complete row.
  SELECT status, completed_at INTO was_status, was_completed_at
    FROM public.user_node_state
   WHERE user_id = p_user_id AND node_id = p_node_id;

  IF was_status = 'complete' THEN
    -- True no-op. Already complete; spamming COMPLETE can't bump XP.
    RETURN jsonb_build_object('awarded', 0, 'already', true, 're_complete', false);
  END IF;

  IF was_completed_at IS NOT NULL THEN
    -- Re-completing after a RE-OPEN. Just flip the status; the user
    -- already collected the XP, streak day, and achievements on the
    -- original completion.
    UPDATE public.user_node_state
       SET status = 'complete'
     WHERE user_id = p_user_id AND node_id = p_node_id;
    RETURN jsonb_build_object('awarded', 0, 'already', false, 're_complete', true);
  END IF;

  -- First-time complete: full atomic award.
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

  RETURN jsonb_build_object('awarded', awarded, 'already', false, 're_complete', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_node(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_node(UUID, TEXT) TO authenticated;
