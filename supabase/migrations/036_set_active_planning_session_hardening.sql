-- ============================================================================
-- 036_set_active_planning_session_hardening
-- ============================================================================
-- Three improvements to the set_active_planning_session RPC introduced
-- in migration 033:
--
-- 1. Cap p_game_ids at 100 entries. The mutual @> containment check
--    runs O(n*m) per row. Without a cap, an authenticated client can
--    pass 10,000-element arrays and burn server CPU on a single call —
--    a DoS amplifier hidden inside an otherwise tame RPC.
--
-- 2. Dedupe + sort p_game_ids before scope match. Postgres array
--    containment treats `[a,b,b]` and `[a,b]` as set-equal under
--    bidirectional @>, but LocalDataStore.setActiveSession's
--    sortedGameIdsKey treats them as different (joined string includes
--    duplicates). Two stores must agree on scope membership; canonicalize
--    the input here so the contract matches regardless of caller-side
--    bugs.
--
-- 3. Lock all in-scope rows with SELECT … FOR UPDATE before the
--    EXISTS check + UPDATE. This eliminates the race where two devices
--    of the same user (or two parallel mutations from React Query) can
--    both pass the EXISTS check and both UPDATE — without locking, the
--    "at most one active" invariant is best-effort, not transactional.
--    With the lock, concurrent calls serialize cleanly.
--
-- Full CREATE OR REPLACE per Rule 20 (the entire body must replace the
-- prior definition; no inheritance from migration 033).
--
-- @see supabase/migrations/033_set_active_planning_session.sql (prior body)
-- @see CLAUDE.md Rule 20 for the full-replace invariant
-- ============================================================================

CREATE OR REPLACE FUNCTION set_active_planning_session(
  p_session_id text,
  p_team_id text,
  p_game_ids text[]
) RETURNS SETOF planning_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_target_exists boolean;
  v_canonical_game_ids text[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_team_id IS NULL OR p_team_id = '' THEN
    RAISE EXCEPTION 'team_id required';
  END IF;
  IF p_game_ids IS NULL OR array_length(p_game_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'game_ids required (non-empty)';
  END IF;
  IF array_length(p_game_ids, 1) > 100 THEN
    RAISE EXCEPTION 'too many game_ids (max 100)';
  END IF;

  -- Dedupe + sort. Match LocalDataStore.sortedGameIdsKey semantics so
  -- a caller passing `[a,b,b]` vs `[a,b]` resolves to the same scope
  -- regardless of which DataStore handles the call.
  SELECT array_agg(DISTINCT g ORDER BY g)
  INTO v_canonical_game_ids
  FROM unnest(p_game_ids) AS g
  WHERE g IS NOT NULL AND g <> '';

  IF v_canonical_game_ids IS NULL OR array_length(v_canonical_game_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'game_ids contained no non-empty values';
  END IF;

  -- Lock all in-scope rows up front. Concurrent calls (two devices,
  -- React Query parallel mutations) block here until the first
  -- transaction commits, eliminating the EXISTS-then-UPDATE race that
  -- otherwise allows two activations to both pass the precheck.
  PERFORM 1
  FROM planning_sessions
  WHERE user_id = v_user_id
    AND team_id = p_team_id
    AND game_ids @> v_canonical_game_ids
    AND v_canonical_game_ids @> game_ids
  FOR UPDATE;

  -- When activating (non-null target), confirm the target is one of
  -- the locked rows. Returning early with no rows is the API's signal
  -- that the activation was rejected — the caller maps that to null.
  IF p_session_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM planning_sessions
      WHERE user_id = v_user_id
        AND id = p_session_id
        AND team_id = p_team_id
        AND game_ids @> v_canonical_game_ids
        AND v_canonical_game_ids @> game_ids
    ) INTO v_target_exists;
    IF NOT v_target_exists THEN
      RETURN;
    END IF;
  END IF;

  -- One UPDATE flips every in-scope row in a single transactional step
  -- (against the rows already locked above). IS NOT DISTINCT FROM is
  -- null-safe equality:
  --   - p_session_id non-null: target gets is_active = true; others get false
  --   - p_session_id null:     every in-scope row gets is_active = false
  -- The is_active <> ... predicate skips rows already in the right state,
  -- avoiding a no-op updated_at bump.
  UPDATE planning_sessions
  SET is_active = (id IS NOT DISTINCT FROM p_session_id),
      updated_at = now()
  WHERE user_id = v_user_id
    AND team_id = p_team_id
    AND game_ids @> v_canonical_game_ids
    AND v_canonical_game_ids @> game_ids
    AND is_active <> (id IS NOT DISTINCT FROM p_session_id);

  -- Return the activated row (or empty when deactivating).
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT *
    FROM planning_sessions
    WHERE user_id = v_user_id AND id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION set_active_planning_session FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_active_planning_session TO authenticated;

COMMENT ON FUNCTION set_active_planning_session IS
  'Atomically activate one planning session and deactivate other in-scope sessions for the calling user. Caps p_game_ids at 100 entries. Dedupes/sorts the input before the scope match. Locks all in-scope rows with FOR UPDATE before the EXISTS check + UPDATE so concurrent calls serialize cleanly. Pass p_session_id = NULL to deactivate without activating another.';
