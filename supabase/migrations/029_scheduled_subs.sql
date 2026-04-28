-- ============================================================================
-- 029_scheduled_subs
-- ============================================================================
-- Adds the scheduled_subs JSONB column to the games table. Each row stores a
-- list of pre-planned substitutions that the live-game timer banner consumes
-- (Phase 0 of the tournament-planner integration).
--
-- Shape of each entry (validated at the app layer in
-- src/datastore/validation.ts):
--   {
--     "id": "string",
--     "timeSeconds": number,
--     "outPlayer": "playerId",
--     "inPlayer": "playerId",
--     "positionRole": "string",        // free-form until the roles map lands
--     "status": "pending" | "fired" | "skipped"
--   }
--
-- Additive only. Existing rows get the default `[]` and old code that does
-- not know about the column is unaffected. Migration 030 updates
-- save_game_with_relations so RPC writes persist this field.
--
-- @see docs/03-active-plans/tournament-planner-integration.md
-- @see docs/03-active-plans/tournament-planner-integration-pr-plan.md (PR 2)
-- ============================================================================

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS scheduled_subs jsonb NOT NULL DEFAULT '[]'::jsonb;

-- No GIN index added: current usage reads/writes the whole array (no JSONB
-- path or containment queries). If a future feature filters by sub id or
-- player across many games, add `CREATE INDEX … ON games USING GIN
-- (scheduled_subs)` in a separate migration rather than retro-fitting here.

COMMENT ON COLUMN games.scheduled_subs IS
  'Pre-planned substitutions consumed by the live-game timer banner. JSONB array of {id, timeSeconds, outPlayer, inPlayer, positionRole, status}. See migration 029 header.';
