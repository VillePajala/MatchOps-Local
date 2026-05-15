-- ============================================================================
-- 037_planning_sessions_included_game_ids
-- ============================================================================
-- Adds the `included_game_ids` column used by per-game include-in-totals
-- toggles in the rebuilt planner editor. NULL means "all gameIds
-- included" — matches the most-permissive read for legacy sessions and
-- brand-new sessions, so existing rows need no data migration.
--
-- The column is a `text[]` of gameId values. Population is a subset of
-- `planning_sessions.game_ids` (validator enforces this on write); a
-- non-NULL empty array is allowed and means "no games included" — the
-- minutes dashboard renders zeroes for that session.
--
-- @see docs/03-active-plans/tournament-planner-rebuild-plan.md (PR-A)
-- @see src/types/planningSession.ts (resolveIncludedGameIds — central
--      NULL→"all" interpreter)
-- ============================================================================

ALTER TABLE planning_sessions
  ADD COLUMN IF NOT EXISTS included_game_ids text[];

COMMENT ON COLUMN planning_sessions.included_game_ids IS
  'Per-game include-in-totals flags for the minutes dashboard. NULL means "all gameIds included" (default for legacy + new rows); a non-NULL array enumerates the included subset. Validator enforces array ⊆ game_ids on write. See migration 037 header.';
