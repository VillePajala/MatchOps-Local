-- ============================================================================
-- 033_set_active_planning_session
-- ============================================================================
-- Atomic activation of a planning session within a (user_id, team_id,
-- gameIds-set) scope. Without this RPC, the app does the deactivate +
-- activate in two separate UPDATEs, which two clients can interleave and
-- leave multiple rows active — violating the "at most one active session
-- per scope" contract.
--
-- The RPC consolidates both into a single UPDATE statement that PostgreSQL
-- executes atomically at the row level. SECURITY DEFINER scopes the
-- operation to the calling user via auth.uid().
--
-- gameIds-set match: a session is in scope when its game_ids has the same
-- elements as the input array, regardless of order. Using mutual array
-- containment (`@>` in both directions) gives set-equality on arrays of
-- unique strings — gameIds are unique by validator (validatePlanningSession
-- enforces no duplicates).
--
-- @see supabase/migrations/031_planning_sessions.sql
-- @see src/datastore/SupabaseDataStore.ts setActiveSession
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

  -- When activating (non-null target), confirm the target exists in scope
  -- before any update. Returning early with no rows is the API's signal
  -- that the activation was rejected — the caller (SupabaseDataStore)
  -- maps that to null without writing to local state.
  IF p_session_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM planning_sessions
      WHERE user_id = v_user_id
        AND id = p_session_id
        AND team_id = p_team_id
        AND game_ids @> p_game_ids
        AND p_game_ids @> game_ids
    ) INTO v_target_exists;
    IF NOT v_target_exists THEN
      RETURN;
    END IF;
  END IF;

  -- One UPDATE flips every in-scope row in a single transactional step.
  -- IS NOT DISTINCT FROM treats both NULL and equality the same way:
  --   - p_session_id non-null: target gets is_active = true; others get false
  --   - p_session_id null:     every in-scope row gets is_active = false
  -- The is_active <> ... predicate skips rows already in the right state,
  -- avoiding a no-op updated_at bump.
  UPDATE planning_sessions
  SET is_active = (id IS NOT DISTINCT FROM p_session_id),
      updated_at = now()
  WHERE user_id = v_user_id
    AND team_id = p_team_id
    AND game_ids @> p_game_ids
    AND p_game_ids @> game_ids
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
  'Atomically activate one planning session and deactivate other in-scope sessions for the calling user. Pass p_session_id = NULL to deactivate without activating another. Returns the newly active row, or empty when deactivating / when target is out of scope.';
