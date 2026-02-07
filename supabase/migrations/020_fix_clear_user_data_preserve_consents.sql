-- ============================================================================
-- Migration: Fix clear_all_user_data to preserve consent records
-- ============================================================================
--
-- GDPR FIX: The clear_all_user_data() RPC was incorrectly deleting
-- user_consents records. Per migration 008 design, consent records must
-- be retained for legal compliance:
--   - "Clear Cloud Data" scenario: User keeps account, consents stay
--   - Account deletion scenario: ON DELETE SET NULL anonymizes records
--
-- This migration updates the RPC to remove the user_consents DELETE.
--
-- @see supabase/migrations/008_user_consents.sql (design intent)
-- @see supabase/migrations/005_clear_all_user_data.sql (original RPC)
-- ============================================================================

CREATE OR REPLACE FUNCTION clear_all_user_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- REQUIRED: Prevents search_path injection
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- CRITICAL: Get authenticated user ID from Supabase Auth
  -- This ensures user can only delete their own data
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete in FK-compliant order: child tables first, then parent tables
  -- This respects foreign key constraints even without CASCADE
  --
  -- FK Constraints (from supabase-schema.md):
  -- - game_events, game_players, game_tactical_data, player_assessments:
  --     game_id REFERENCES games(id) ON DELETE CASCADE
  -- - games:
  --     season_id REFERENCES seasons(id) ON DELETE SET NULL
  --     tournament_id REFERENCES tournaments(id) ON DELETE SET NULL
  --     team_id REFERENCES teams(id) ON DELETE SET NULL
  -- - player_adjustments:
  --     season_id REFERENCES seasons(id) ON DELETE SET NULL
  --     tournament_id REFERENCES tournaments(id) ON DELETE SET NULL
  -- - team_players:
  --     team_id REFERENCES teams(id) ON DELETE CASCADE

  -- Game child tables first (would CASCADE from games, but explicit is clearer)
  DELETE FROM game_events WHERE user_id = v_user_id;
  DELETE FROM game_players WHERE user_id = v_user_id;
  DELETE FROM game_tactical_data WHERE user_id = v_user_id;
  DELETE FROM player_assessments WHERE user_id = v_user_id;

  -- Games next (SET NULL on seasons/tournaments/teams)
  DELETE FROM games WHERE user_id = v_user_id;

  -- Player adjustments (SET NULL on seasons/tournaments)
  DELETE FROM player_adjustments WHERE user_id = v_user_id;

  -- Team players (would CASCADE from teams)
  DELETE FROM team_players WHERE user_id = v_user_id;

  -- Independent entities last
  DELETE FROM teams WHERE user_id = v_user_id;
  DELETE FROM tournaments WHERE user_id = v_user_id;
  DELETE FROM seasons WHERE user_id = v_user_id;
  DELETE FROM personnel WHERE user_id = v_user_id;
  DELETE FROM players WHERE user_id = v_user_id;
  DELETE FROM warmup_plans WHERE user_id = v_user_id;
  DELETE FROM user_settings WHERE user_id = v_user_id;

  -- NOTE: The following tables are intentionally NOT deleted here:
  --
  -- 1. user_consents: GDPR compliance requires retaining consent records.
  --    "Clear Cloud Data" = user keeps account, consents remain linked.
  --    Account deletion = ON DELETE SET NULL anonymizes (user_id → NULL).
  --    See migration 008_user_consents.sql for design rationale.
  --
  -- 2. user_subscriptions (if/when added): Subscription status must survive
  --    data clearing. A user who clears their game data should retain their
  --    paid subscription entitlements.

END;
$$;

-- Restrict execute to authenticated users only
REVOKE ALL ON FUNCTION clear_all_user_data FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clear_all_user_data TO authenticated;
