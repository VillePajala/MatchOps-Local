-- ============================================================================
-- Verification script: migrations 036-038 (playtime planner cloud sync)
-- Manual script for the Supabase SQL editor (same convention as 013_014).
-- Run as an AUTHENTICATED user session where possible; the RLS checks note
-- where a second user is needed.
-- ============================================================================

-- 1. Tables + RLS enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename LIKE 'playtime%' ORDER BY tablename;
-- Expect 3 rows, rowsecurity = true on all.

-- 2. Policies use the initplan form (016 house pattern)
SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy WHERE polrelid::regclass::text LIKE 'playtime%';
-- Expect: ( SELECT auth.uid() ... ) = user_id  (subquery form, not bare auth.uid()).

-- 3. Conditional LWW (as an authenticated user)
SELECT save_playtime_plan('vfy_plan', 'v1', false,
  '{"id":"vfy_plan","name":"v1","version":1,"createdAt":"x","updatedAt":"2026-01-01T10:05:00Z","players":[],"games":[]}'::jsonb,
  '2026-01-01T10:05:00Z');                             -- expect true (insert)
SELECT save_playtime_plan('vfy_plan', 'stale', false,
  '{"id":"vfy_plan","name":"stale","version":1,"createdAt":"x","updatedAt":"2026-01-01T10:00:00Z","players":[],"games":[]}'::jsonb,
  '2026-01-01T10:00:00Z');                             -- expect false (older skipped)
SELECT name, updated_at FROM playtime_plans WHERE id = 'vfy_plan';
-- Expect name = 'v1', updated_at = 10:05.
SELECT save_playtime_plan('vfy_plan', 'v2', false,
  '{"id":"vfy_plan","name":"v2","version":1,"createdAt":"x","updatedAt":"2026-01-01T10:10:00Z","players":[],"games":[]}'::jsonb,
  '2026-01-01T10:10:00Z');                             -- expect true (newer applies)

-- 4. FK blocks orphans and cascades with the plan
INSERT INTO playtime_plan_links (user_id, game_id, plan_id, plan_game_id)
VALUES (auth.uid(), 'vfy_game', 'NO_SUCH_PLAN', 'pg');  -- expect FK violation
INSERT INTO playtime_plan_links (user_id, game_id, plan_id, plan_game_id)
VALUES (auth.uid(), 'vfy_game', 'vfy_plan', 'pg');      -- expect success
DELETE FROM playtime_plans WHERE id = 'vfy_plan';
SELECT count(*) FROM playtime_plan_links WHERE game_id = 'vfy_game';
-- Expect 0 (cascaded).

-- 5. Cross-user isolation (run as a SECOND authenticated user)
SELECT count(*) FROM playtime_plans;   -- expect only that user's rows (0 on fresh)
-- And an INSERT with another user's user_id must fail with an RLS violation.

-- 6. clear_all_user_data covers the playtime tables (as the data's owner)
-- SELECT clear_all_user_data();
-- SELECT count(*) FROM playtime_plans;      -- expect 0
-- SELECT count(*) FROM playtime_plan_links; -- expect 0
-- SELECT count(*) FROM playtime_game_subs;  -- expect 0
