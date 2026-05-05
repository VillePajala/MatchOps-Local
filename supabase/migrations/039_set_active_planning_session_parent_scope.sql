-- ============================================================================
-- 039_set_active_planning_session_parent_scope
-- ============================================================================
-- Adds the parent-children scope to set_active_planning_session so the
-- "at most one active per scope" invariant survives the named-versions
-- feature (migration 038's parent_session_id column).
--
-- Scope evolution:
--   - p_parent_session_id IS NULL → legacy (team_id, gameIds-set) scope.
--     Top-level / pre-PR-C parent rows continue to behave exactly as
--     they did under migration 036.
--   - p_parent_session_id IS NOT NULL → children-of-parent scope. At
--     most one row with parent_session_id = p_parent_session_id can
--     hold is_active = true. The legacy team/gameIds match is bypassed
--     for child rows because every child shares the parent's team_id +
--     game_ids by construction (validator enforces this in the app
--     layer; PR-C-2's UI is what actually creates children).
--
-- The two scopes are disjoint by row:
--   - Top-level rows (parent_session_id IS NULL) only ever match the
--     legacy scope.
--   - Child rows (parent_session_id IS NOT NULL) only ever match the
--     parent-children scope.
-- A child cannot accidentally collide with a top-level row because the
-- WHERE clauses use parent_session_id IS NULL vs = $parent.
--
-- Full CREATE OR REPLACE per CLAUDE.md Rule 20 — the entire body
-- replaces migration 036's; no inheritance.
--
-- @see supabase/migrations/036_set_active_planning_session_hardening.sql (prior body)
-- @see supabase/migrations/038_planning_sessions_parent_session_id.sql (column)
-- ============================================================================

DROP FUNCTION IF EXISTS set_active_planning_session(text, text, text[]);

CREATE OR REPLACE FUNCTION set_active_planning_session(
  p_session_id text,
  p_team_id text,
  p_game_ids text[],
  p_parent_session_id text DEFAULT NULL
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

  -- ── Lock the in-scope rows up front ──────────────────────────────
  -- Two disjoint scopes:
  --   - Parent-children scope (when p_parent_session_id IS NOT NULL):
  --     siblings of the same parent. team_id + gameIds are still
  --     required from the caller for parameter consistency, but the
  --     scope match is parent_session_id-only since every sibling
  --     shares the parent's team + games by construction.
  --   - Legacy scope (when p_parent_session_id IS NULL): top-level
  --     rows with matching team + canonical gameIds. parent_session_id
  --     IS NULL filter prevents accidentally locking child rows.
  IF p_parent_session_id IS NOT NULL THEN
    PERFORM 1
    FROM planning_sessions
    WHERE user_id = v_user_id
      AND parent_session_id = p_parent_session_id
    FOR UPDATE;
  ELSE
    PERFORM 1
    FROM planning_sessions
    WHERE user_id = v_user_id
      AND parent_session_id IS NULL
      AND team_id = p_team_id
      AND game_ids @> v_canonical_game_ids
      AND v_canonical_game_ids @> game_ids
    FOR UPDATE;
  END IF;

  -- ── Confirm the target is in scope when activating ──────────────
  IF p_session_id IS NOT NULL THEN
    IF p_parent_session_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM planning_sessions
        WHERE user_id = v_user_id
          AND id = p_session_id
          AND parent_session_id = p_parent_session_id
      ) INTO v_target_exists;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM planning_sessions
        WHERE user_id = v_user_id
          AND id = p_session_id
          AND parent_session_id IS NULL
          AND team_id = p_team_id
          AND game_ids @> v_canonical_game_ids
          AND v_canonical_game_ids @> game_ids
      ) INTO v_target_exists;
    END IF;
    IF NOT v_target_exists THEN
      RETURN;
    END IF;
  END IF;

  -- ── Flip is_active across the locked scope in one UPDATE ────────
  IF p_parent_session_id IS NOT NULL THEN
    UPDATE planning_sessions
    SET is_active = (id IS NOT DISTINCT FROM p_session_id),
        updated_at = now()
    WHERE user_id = v_user_id
      AND parent_session_id = p_parent_session_id
      AND is_active <> (id IS NOT DISTINCT FROM p_session_id);
  ELSE
    UPDATE planning_sessions
    SET is_active = (id IS NOT DISTINCT FROM p_session_id),
        updated_at = now()
    WHERE user_id = v_user_id
      AND parent_session_id IS NULL
      AND team_id = p_team_id
      AND game_ids @> v_canonical_game_ids
      AND v_canonical_game_ids @> game_ids
      AND is_active <> (id IS NOT DISTINCT FROM p_session_id);
  END IF;

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
GRANT EXECUTE ON FUNCTION set_active_planning_session(text, text, text[], text) TO authenticated;

COMMENT ON FUNCTION set_active_planning_session IS
  'Atomically activate one planning session and deactivate other in-scope sessions. Two scopes: when p_parent_session_id is NULL, scope = (team, canonical gameIds, parent_session_id IS NULL) — legacy / top-level plans. When p_parent_session_id is non-null, scope = siblings sharing that parent (named-versions feature). FOR UPDATE lock + dedupe/sort + 100-entry cap carry forward from migration 036.';
