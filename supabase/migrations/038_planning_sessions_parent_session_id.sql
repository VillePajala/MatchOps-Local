-- ============================================================================
-- 038_planning_sessions_parent_session_id
-- ============================================================================
-- Adds the `parent_session_id` column used by the named-versions feature
-- in the rebuilt planner. A "tournament plan" becomes a parent session;
-- named versions are child sessions referencing the parent. The
-- single-active invariant moves from the (team, gameIds-set) scope to
-- the parent-children scope: at most one child of a given parent can
-- be `is_active = true` at any time.
--
-- Migration semantics:
--   - NULL parent_session_id  → this row is a top-level "parent" plan.
--     Existing pre-038 sessions all become parents (no data backfill;
--     the column defaults to NULL, which is the legacy/parent meaning).
--   - non-NULL parent_session_id → this row is a named version (child)
--     of the row whose `id` matches. Children inherit the parent's
--     team_id and game_ids-set on write (enforcement deferred to the
--     DataStore boundary in PR-C-2; validatePlanningSession checks
--     only structural violations of parent_session_id today).
--
-- Soft FK rather than a real REFERENCES constraint because the parent
-- row may be deleted before its children are migrated in batch updates;
-- the validator + RPC 033/036 enforce the parent-exists invariant at
-- the application boundary, matching the soft-FK approach used for
-- planning_sessions.game_ids → games.id.
--
-- ⚠️  Single-active enforcement gap — RESOLVED by migration 039
--   in this same deploy batch. Historical context preserved below.
--
--   The current set_active_planning_session RPC (033 + 036 hardening)
--   scopes its uniqueness check to (team_id, sorted_game_ids). When
--   named versions land, the scope shifts to "siblings of the same
--   parent_session_id" — a child being activated should deactivate
--   ONLY its sibling children, not children of unrelated parents that
--   happen to share the same gameIds-set.
--   Migration 039 ships the updated 4-arg RPC that closes this gap;
--   when 038 + 039 are applied together (the only supported deploy
--   order), no double-active window exists for child sessions.
--
-- @see docs/03-active-plans/tournament-planner-rebuild-plan.md (PR-C)
-- @see src/types/planningSession.ts (PlanningSession.parentSessionId)
-- ============================================================================

BEGIN;

ALTER TABLE planning_sessions
  ADD COLUMN IF NOT EXISTS parent_session_id text;

COMMENT ON COLUMN planning_sessions.parent_session_id IS
  'Soft pointer to the parent PlanningSession.id when this row is a named version (child). NULL = top-level parent plan. Validator + RPCs enforce parent-exists at the app boundary; no SQL FK so batch deletes can land before children are migrated. See migration 038 header.';

-- Index supports the per-parent fan-out query (list children for a
-- parent) and the active-version lookup. Covering both columns lets
-- the planner read the active child for a given parent in a single
-- index scan; partial-index on (parent_session_id, is_active) where
-- is_active = true would be marginally tighter but loses the listing
-- query's coverage.
CREATE INDEX IF NOT EXISTS idx_planning_sessions_parent
  ON planning_sessions (user_id, parent_session_id)
  WHERE parent_session_id IS NOT NULL;

-- Schema-level self-parent guard: a row pointing at itself would
-- create an apparent cycle and confuse the children-listing query.
-- The validator catches this on app-layer writes; the CHECK is a
-- belt-and-suspenders defense for any path that bypasses the
-- validator (RPC body, direct SQL, future bulk import).
-- IF NOT EXISTS isn't valid for ADD CONSTRAINT in PG, so guard with
-- a DO block. Idempotent across migration re-runs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'planning_sessions_parent_not_self'
      AND conrelid = 'public.planning_sessions'::regclass
  ) THEN
    ALTER TABLE planning_sessions
      ADD CONSTRAINT planning_sessions_parent_not_self
      CHECK (parent_session_id IS NULL OR parent_session_id <> id);
  END IF;
END $$;

-- RLS unchanged: the existing per-user-id policy already scopes child
-- visibility correctly because RLS filters by user_id, and parents +
-- children always share the same user_id (validator enforces).

COMMIT;
