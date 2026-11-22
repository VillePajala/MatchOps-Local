-- ============================================================================
-- 066: game_themes - the Pelitapa concepts a coach picked for a game
-- ============================================================================
-- A game can have one or more Pelitapa concepts ("themes") to go through with
-- the kids. The selection is the COACH'S OWN data: one row per picked concept,
-- ordered by `sort` (the order they were picked in). See
-- docs/03-active-plans/UNIFIED-ROADMAP.md, "Pelitapa library".
--
-- Stored OUTSIDE the game model, the same way as the playing-time planner's
-- per-game stores (036): never on the games row, never in the game transforms
-- or save_game_with_relations. Locally it is its own IndexedDB collection
-- (storageKeys GAME_THEMES_KEY), pushed by the sync queue as its own entity.
--
-- Design:
--   * PK (user_id, game_id, playbook_id, concept_id): a concept is picked at
--     most once per game; ids are client-chosen, the user_id in the key keeps
--     users apart by construction (migration 013's rule).
--   * No FK to games: a theme row may reach the cloud before its game row
--     (the queue pushes entities independently). Game deletion removes the
--     rows explicitly (SupabaseDataStore.deleteGame), like the planner's.
--   * No FK to playbooks: losing a grant must not delete the coach's
--     selection (the app shows it as unavailable), and the built-in example
--     playbook is not in the database at all.
--   * set_game_themes() replaces a game's whole selection in one transaction
--     (delete + insert), so another device never sees half a selection. It
--     runs as the CALLER (SECURITY INVOKER): RLS applies as for direct writes.
--
-- Access: RLS, own rows only, for every command (users manage their own
-- themes). anon has no privileges.
--
-- Lifetime:
--   * Account deletion: auth.users ON DELETE CASCADE.
--   * clear_all_user_data ("delete all cloud data", account kept): deletes
--     them - redefined below as VERBATIM migration 037 plus ONE DELETE line.
--     (Not the "never rewrite an RPC when adding columns" case: no column is
--     added to anything this function writes; a new table must be cleared.)
--     Before applying to PROD: diff prod's live definition against 037's and
--     apply only when the differences are comments/whitespace.
--
-- Additive and re-runnable (IF NOT EXISTS / DROP POLICY IF EXISTS / OR REPLACE).
-- ============================================================================

CREATE TABLE IF NOT EXISTS game_themes (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id     text NOT NULL CHECK (length(game_id) BETWEEN 1 AND 200),
  playbook_id text NOT NULL CHECK (length(playbook_id) BETWEEN 1 AND 128),
  concept_id  text NOT NULL CHECK (length(concept_id) BETWEEN 1 AND 128),
  sort        int  NOT NULL DEFAULT 0 CHECK (sort >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id, playbook_id, concept_id)
);

COMMENT ON TABLE game_themes IS
  'Pelitapa concepts picked for a game (the coach''s own data). One row per concept, ordered by sort. Replaced per game by set_game_themes(); cleared by clear_all_user_data; removed with the account.';

ALTER TABLE game_themes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON game_themes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON game_themes TO authenticated;

DROP POLICY IF EXISTS "Users can only access their own game themes" ON game_themes;
CREATE POLICY "Users can only access their own game themes"
  ON game_themes FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── Replace one game's selection atomically ───────────────────────────────
-- p_themes: [{ "playbookId": "...", "conceptId": "..." }, ...] in display
-- order; [] clears the game. A repeated concept keeps its first position.
CREATE OR REPLACE FUNCTION set_game_themes(p_game_id text, p_themes jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_themes IS NULL OR jsonb_typeof(p_themes) <> 'array' THEN
    RAISE EXCEPTION 'p_themes must be a JSON array';
  END IF;
  IF jsonb_array_length(p_themes) > 12 THEN
    RAISE EXCEPTION 'Too many themes for one game';
  END IF;

  DELETE FROM game_themes WHERE user_id = v_user_id AND game_id = p_game_id;

  INSERT INTO game_themes (user_id, game_id, playbook_id, concept_id, sort, updated_at)
  SELECT v_user_id, p_game_id, x.elem->>'playbookId', x.elem->>'conceptId', (x.ord - 1)::int, now()
  FROM jsonb_array_elements(p_themes) WITH ORDINALITY AS x(elem, ord)
  ORDER BY x.ord
  ON CONFLICT (user_id, game_id, playbook_id, concept_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION set_game_themes(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_game_themes(text, jsonb) TO authenticated;

-- ── clear_all_user_data: + game_themes ─────────────────────────────────────
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

  -- Playtime planner stores (036; delete order matters since 038's link->plan FK)
  DELETE FROM playtime_game_subs WHERE user_id = v_user_id;
  DELETE FROM playtime_plan_links WHERE user_id = v_user_id;
  DELETE FROM playtime_plans WHERE user_id = v_user_id;

  -- Pelitapa game themes (066; no FKs)
  DELETE FROM game_themes WHERE user_id = v_user_id;

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
  --
  -- 3. account_features (064) and playbook_access (065): granted to the
  --    account by the owner/club, not the coach's data.

END;
$$;

-- Restrict execute to authenticated users only
REVOKE ALL ON FUNCTION clear_all_user_data FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clear_all_user_data TO authenticated;
