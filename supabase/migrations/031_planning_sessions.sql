-- ============================================================================
-- 031_planning_sessions
-- ============================================================================
-- Creates the planning_sessions table: persistent storage for the tournament
-- planner's saved sessions (Phase 3 of the tournament-planner integration).
--
-- A PlanningSession is a coach-facing "plan" that points at a set of games
-- and carries a per-game draft snapshot of starting XI, bench, and scheduled
-- substitutions. Plans are reopenable, renamable, and versionable
-- ("Jasper-sick contingency" alongside "default") without mutating the
-- underlying game records — Apply is the explicit action that pushes a
-- draft into Game.playersOnField / Game.scheduledSubs.
--
-- See docs/03-active-plans/tournament-planner-integration.md
-- (section "PlanningSession — the coach-facing plan entity") for the full
-- design. JSON shapes are validated at the app layer in
-- src/datastore/validation.ts.
--
-- Key columns:
--   game_ids   — text[] of Game.id values (1..N) the session covers
--   draft      — JSONB keyed by gameId. Each value is { startingXI,
--                bench, scheduledSubs } (PlanDraft from planSwapEngine.ts).
--                Snapshot, not a live reference; contingencies coexist.
--   is_active  — drives live banner firing. Soft constraint: at most one
--                active plan per (team, gameIds-set) at a time, enforced by
--                the app handler in setActiveSession (no DB-level uniqueness
--                because gameIds-set membership is a sorted-array equality
--                check that doesn't fit a unique index cleanly). A weaker
--                unique on (user_id, team_id) WHERE is_active = true was
--                considered as a backstop, but rejected: a coach legitimately
--                holds multiple active plans for the same team across
--                different game-sets (e.g. tournament A and tournament B),
--                so the partial unique would reject valid state.
--   applied_at — null until first Apply; updated by the handler each Apply.
--
-- RLS mirrors every other user-scoped table: a session is visible only to
-- its owning user, and CASCADE-deleted with the user account.
-- ============================================================================

CREATE TABLE IF NOT EXISTS planning_sessions (
  id text PRIMARY KEY, -- Format: planningSession_{timestamp}_{random}
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id text NOT NULL, -- Soft FK to teams.id (no FK constraint — matches games.team_id pattern; orphans surface in the app's reference checks)
  name text NOT NULL,
  game_ids text[] NOT NULL DEFAULT '{}',
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planning_sessions_user_id
  ON planning_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_planning_sessions_user_team
  ON planning_sessions(user_id, team_id);
CREATE INDEX IF NOT EXISTS idx_planning_sessions_user_active
  ON planning_sessions(user_id, team_id, is_active)
  WHERE is_active = true;

ALTER TABLE planning_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only access their own planning sessions"
  ON planning_sessions;
CREATE POLICY "Users can only access their own planning sessions"
  ON planning_sessions FOR ALL
  USING (auth.uid() = user_id);

COMMENT ON TABLE planning_sessions IS
  'Coach-facing plan entity. Holds per-game draft snapshots (startingXI/bench/scheduledSubs) for a set of games. Reopenable, versionable, applied explicitly to Game records. See migration 031 header.';
COMMENT ON COLUMN planning_sessions.draft IS
  'JSONB map { [gameId]: { startingXI, bench, scheduledSubs } }. Validated at app layer (src/datastore/validation.ts).';
COMMENT ON COLUMN planning_sessions.game_ids IS
  'Soft references to games.id. Orphan handling in the app: missing games surface in the editor as an unresolvable-game warning rather than blocking session load.';
