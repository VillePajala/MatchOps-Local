-- Migration: Optimize RLS policies to use initplan pattern
--
-- Problem: RLS policies using auth.uid() directly re-evaluate the function
-- for EVERY ROW, causing severe performance degradation at scale.
--
-- Solution: Wrap auth.uid() in a subquery (select auth.uid()) to cache
-- the result once per query (PostgreSQL "initplan" optimization).
--
-- This fixes 16 performance warnings from Supabase advisor.
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- NOTE ON WITH CHECK CLAUSES:
-- These policies use FOR ALL with only a USING clause (no explicit WITH CHECK).
-- Per PostgreSQL documentation, when WITH CHECK is omitted for INSERT/UPDATE,
-- the USING expression is applied as the WITH CHECK expression. This means
-- INSERT/UPDATE operations are implicitly checked against the same condition
-- (i.e., user_id must match auth.uid()). This is intentional and functionally
-- equivalent to adding explicit WITH CHECK clauses with the same expression.
-- See: https://www.postgresql.org/docs/current/sql-createpolicy.html
--
-- Exception: subscriptions policy was reverted to FOR SELECT in migration 018
-- because subscriptions should only be written by Edge Functions (service role).

-- 1. game_events
DROP POLICY IF EXISTS "Users can only access their own game events" ON public.game_events;
CREATE POLICY "Users can only access their own game events" ON public.game_events
  FOR ALL USING ((select auth.uid()) = user_id);

-- 2. game_players
DROP POLICY IF EXISTS "Users can only access their own game players" ON public.game_players;
CREATE POLICY "Users can only access their own game players" ON public.game_players
  FOR ALL USING ((select auth.uid()) = user_id);

-- 3. game_tactical_data
DROP POLICY IF EXISTS "Users can only access their own game tactical data" ON public.game_tactical_data;
CREATE POLICY "Users can only access their own game tactical data" ON public.game_tactical_data
  FOR ALL USING ((select auth.uid()) = user_id);

-- 4. games
DROP POLICY IF EXISTS "Users can only access their own games" ON public.games;
CREATE POLICY "Users can only access their own games" ON public.games
  FOR ALL USING ((select auth.uid()) = user_id);

-- 5. personnel
DROP POLICY IF EXISTS "Users can only access their own personnel" ON public.personnel;
CREATE POLICY "Users can only access their own personnel" ON public.personnel
  FOR ALL USING ((select auth.uid()) = user_id);

-- 6. player_adjustments
DROP POLICY IF EXISTS "Users can only access their own player adjustments" ON public.player_adjustments;
CREATE POLICY "Users can only access their own player adjustments" ON public.player_adjustments
  FOR ALL USING ((select auth.uid()) = user_id);

-- 7. player_assessments
DROP POLICY IF EXISTS "Users can only access their own player assessments" ON public.player_assessments;
CREATE POLICY "Users can only access their own player assessments" ON public.player_assessments
  FOR ALL USING ((select auth.uid()) = user_id);

-- 8. players
DROP POLICY IF EXISTS "Users can only access their own players" ON public.players;
CREATE POLICY "Users can only access their own players" ON public.players
  FOR ALL USING ((select auth.uid()) = user_id);

-- 9. seasons
DROP POLICY IF EXISTS "Users can only access their own seasons" ON public.seasons;
CREATE POLICY "Users can only access their own seasons" ON public.seasons
  FOR ALL USING ((select auth.uid()) = user_id);

-- 10. subscriptions
DROP POLICY IF EXISTS "Users can read own subscription" ON public.subscriptions;
CREATE POLICY "Users can read own subscription" ON public.subscriptions
  FOR ALL USING ((select auth.uid()) = user_id);

-- 11. team_players
DROP POLICY IF EXISTS "Users can only access their own team players" ON public.team_players;
CREATE POLICY "Users can only access their own team players" ON public.team_players
  FOR ALL USING ((select auth.uid()) = user_id);

-- 12. teams
DROP POLICY IF EXISTS "Users can only access their own teams" ON public.teams;
CREATE POLICY "Users can only access their own teams" ON public.teams
  FOR ALL USING ((select auth.uid()) = user_id);

-- 13. tournaments
DROP POLICY IF EXISTS "Users can only access their own tournaments" ON public.tournaments;
CREATE POLICY "Users can only access their own tournaments" ON public.tournaments
  FOR ALL USING ((select auth.uid()) = user_id);

-- 14. user_consents (has extra NULL check)
DROP POLICY IF EXISTS "Users can only access their own consents" ON public.user_consents;
CREATE POLICY "Users can only access their own consents" ON public.user_consents
  FOR ALL USING ((user_id IS NOT NULL) AND ((select auth.uid()) = user_id));

-- 15. user_settings
DROP POLICY IF EXISTS "Users can only access their own settings" ON public.user_settings;
CREATE POLICY "Users can only access their own settings" ON public.user_settings
  FOR ALL USING ((select auth.uid()) = user_id);

-- 16. warmup_plans
DROP POLICY IF EXISTS "Users can only access their own warmup plans" ON public.warmup_plans;
CREATE POLICY "Users can only access their own warmup plans" ON public.warmup_plans
  FOR ALL USING ((select auth.uid()) = user_id);
