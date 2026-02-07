-- ============================================================================
-- MatchOps-Local Row Level Security (RLS) Policies
-- ============================================================================
-- Run this AFTER 000_schema.sql and 001_rpc_functions.sql
--
-- This enables RLS on all 14 tables and creates policies for user isolation.
-- Every user can only access their own data.
--
-- @see docs/02-technical/database/supabase-schema.md for full documentation
-- ============================================================================

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE warmup_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_tactical_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_adjustments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CREATE POLICIES
-- ============================================================================

-- Players
CREATE POLICY "Users can only access their own players"
  ON players FOR ALL
  USING (auth.uid() = user_id);

-- Seasons
CREATE POLICY "Users can only access their own seasons"
  ON seasons FOR ALL
  USING (auth.uid() = user_id);

-- Tournaments
CREATE POLICY "Users can only access their own tournaments"
  ON tournaments FOR ALL
  USING (auth.uid() = user_id);

-- Personnel
CREATE POLICY "Users can only access their own personnel"
  ON personnel FOR ALL
  USING (auth.uid() = user_id);

-- Warmup Plans
CREATE POLICY "Users can only access their own warmup plans"
  ON warmup_plans FOR ALL
  USING (auth.uid() = user_id);

-- User Settings
CREATE POLICY "Users can only access their own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id);

-- Teams
CREATE POLICY "Users can only access their own teams"
  ON teams FOR ALL
  USING (auth.uid() = user_id);

-- Team Players
CREATE POLICY "Users can only access their own team players"
  ON team_players FOR ALL
  USING (auth.uid() = user_id);

-- Games
CREATE POLICY "Users can only access their own games"
  ON games FOR ALL
  USING (auth.uid() = user_id);

-- Game Players
CREATE POLICY "Users can only access their own game players"
  ON game_players FOR ALL
  USING (auth.uid() = user_id);

-- Game Events
CREATE POLICY "Users can only access their own game events"
  ON game_events FOR ALL
  USING (auth.uid() = user_id);

-- Player Assessments
CREATE POLICY "Users can only access their own player assessments"
  ON player_assessments FOR ALL
  USING (auth.uid() = user_id);

-- Game Tactical Data
CREATE POLICY "Users can only access their own game tactical data"
  ON game_tactical_data FOR ALL
  USING (auth.uid() = user_id);

-- Player Adjustments
CREATE POLICY "Users can only access their own player adjustments"
  ON player_adjustments FOR ALL
  USING (auth.uid() = user_id);
