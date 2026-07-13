-- ============================================================================
-- 036: Playing-Time Planner cloud sync — plans, plan links, planned game subs
-- ============================================================================
-- Three tables mirroring the planner's three LOCAL stores (storageKeys:
-- soccerPlaytimePlans / soccerPlaytimePlanLinks / soccerPlaytimeGameSubs).
-- Design per docs/03-active-plans/playing-time-fairness-and-planner.md §11:
--
--   * One row PER PLAN — the conflict unit matches the app's per-plan
--     debounced autosave, so editing plan A on the phone and plan B on the
--     laptop never collide. Last write wins per row.
--   * The plan itself is an opaque JSONB blob in the app's own schema
--     (versioned by data->>'version'); NO field-by-field transforms. Only
--     name/archived are surfaced as columns for cheap list queries.
--   * Links and planned subs are keyed per REAL game — natural LWW units.
--   * Composite PK (user_id, id) like every other user-content table
--     (migration 013): ids are client-generated, so cross-user collisions
--     must be impossible by construction.
-- ============================================================================

-- ── Plans ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS playtime_plans (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id         text NOT NULL,
  name       text NOT NULL DEFAULT '',
  archived   boolean NOT NULL DEFAULT false,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

-- List screens sort by recency.
CREATE INDEX IF NOT EXISTS idx_playtime_plans_user_updated
  ON playtime_plans (user_id, updated_at DESC);

-- ── Plan links (real game -> plan/planned-game that created it) ────────────
CREATE TABLE IF NOT EXISTS playtime_plan_links (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id      text NOT NULL,
  plan_id      text NOT NULL,
  plan_game_id text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

-- Bulk re-apply looks links up by plan.
CREATE INDEX IF NOT EXISTS idx_playtime_plan_links_user_plan
  ON playtime_plan_links (user_id, plan_id);

-- ── Planned subs attached to a REAL game ───────────────────────────────────
CREATE TABLE IF NOT EXISTS playtime_game_subs (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id    text NOT NULL,
  subs       jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

-- ── RLS: users touch only their own rows (house pattern, migration 002) ────
ALTER TABLE playtime_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE playtime_plan_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE playtime_game_subs ENABLE ROW LEVEL SECURITY;

-- (select auth.uid()) — the migration-016 initplan form: evaluated once per
-- statement instead of per row (Supabase advisor: auth_rls_initplan).
-- DROP-first keeps the migration re-runnable, matching every policy-touching
-- migration since 009.
DROP POLICY IF EXISTS "Users can only access their own playtime plans" ON playtime_plans;
CREATE POLICY "Users can only access their own playtime plans"
  ON playtime_plans FOR ALL
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can only access their own playtime plan links" ON playtime_plan_links;
CREATE POLICY "Users can only access their own playtime plan links"
  ON playtime_plan_links FOR ALL
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can only access their own playtime game subs" ON playtime_game_subs;
CREATE POLICY "Users can only access their own playtime game subs"
  ON playtime_game_subs FOR ALL
  USING ((select auth.uid()) = user_id);
