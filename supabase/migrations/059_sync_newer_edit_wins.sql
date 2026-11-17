-- ============================================================================
-- 059: Non-game sync - the newer edit wins; a record deleted on another device
--      stays deleted (review 3.13b; owner decision 2026-11-17)
-- ============================================================================
-- Before: a queued edit (players, teams, seasons, tournaments, personnel,
-- settings, stat adjustments, warmup plan) that waited on an offline device was
-- written blindly when it finally synced - over a newer edit made on another
-- device - and could re-create a record deleted there. Cloud `updated_at` is the
-- PUSH time, so it could not tell which edit was newer.
--
-- Design (reviewed twice independently):
--   * `edited_at` = when the change was made, on the SERVER's clock. Sync writes
--     first call sync_write_check() with the edit's AGE (measured on one device
--     clock, so device clock offset cancels out); the server computes
--     edit_at = now() - age and answers apply / stale / deleted. Only 'apply' then
--     upserts, carrying edited_at = that server value.
--   * Every other writer (restore, migration, push-all, older app versions) never
--     calls the check: the trigger stamps edited_at = now() -> never refused, and
--     behaviour is unchanged for them.
--   * sync_tombstones records deletions (AFTER DELETE triggers). They survive
--     clear_all_user_data, so another device's stale edit cannot resurrect a
--     record removed by a reset/restore.
--   * `updated_at` keeps meaning push time (hydration relies on it).
-- Additive and idempotent: new columns, a table, functions and triggers.
-- ============================================================================

-- 1. edited_at on the eight tables, backfilled so existing rows keep their order.
ALTER TABLE players            ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE teams              ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE seasons            ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE tournaments        ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE personnel          ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE user_settings      ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE player_adjustments ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE warmup_plans       ADD COLUMN IF NOT EXISTS edited_at timestamptz;

UPDATE players       SET edited_at = updated_at WHERE edited_at IS NULL;
UPDATE teams         SET edited_at = updated_at WHERE edited_at IS NULL;
UPDATE seasons       SET edited_at = updated_at WHERE edited_at IS NULL;
UPDATE tournaments   SET edited_at = updated_at WHERE edited_at IS NULL;
UPDATE personnel     SET edited_at = updated_at WHERE edited_at IS NULL;
UPDATE user_settings SET edited_at = updated_at WHERE edited_at IS NULL;
-- warmup_plans.updated_at is never re-sent after insert; last_modified is.
UPDATE warmup_plans  SET edited_at = GREATEST(updated_at, last_modified) WHERE edited_at IS NULL;
-- No write time on legacy adjustments: never refuse a write against them (as today).
UPDATE player_adjustments SET edited_at = '-infinity' WHERE edited_at IS NULL;

-- 2. Deletions record.
CREATE TABLE IF NOT EXISTS sync_tombstones (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_name text NOT NULL,
  row_id     text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, table_name, row_id)
);
-- No client access: only the SECURITY DEFINER functions below touch it.
ALTER TABLE sync_tombstones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sync_tombstones FROM anon, authenticated;

-- 3. Stamp now() for every write that does not carry a fresh sync edit time.
--    On UPDATE a writer that omits the column keeps OLD's value - so "unchanged"
--    also means "not a sync write" (a sync write never carries OLD's exact value).
CREATE OR REPLACE FUNCTION sync_stamp_edited_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.edited_at IS NULL THEN NEW.edited_at := now(); END IF;
    -- The record exists again: forget its deletion - only once it really is
    -- (re)inserted, so a write that then fails cannot lose the deletion record.
    IF TG_TABLE_NAME <> 'user_settings' THEN
      DELETE FROM sync_tombstones t
      WHERE t.user_id = NEW.user_id AND t.table_name = TG_TABLE_NAME AND t.row_id = NEW.id;
    END IF;
  ELSIF NEW.edited_at IS NULL OR NEW.edited_at IS NOT DISTINCT FROM OLD.edited_at THEN
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_record_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- The whole account is being deleted (auth.users cascade): no record needed, and
  -- inserting one would point at the user row being deleted.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN
    RETURN OLD;
  END IF;
  INSERT INTO sync_tombstones (user_id, table_name, row_id, deleted_at)
  VALUES (OLD.user_id, TG_TABLE_NAME, OLD.id, now())
  ON CONFLICT (user_id, table_name, row_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION sync_record_tombstone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sync_stamp_edited_at() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['players','teams','seasons','tournaments','personnel','user_settings','player_adjustments','warmup_plans'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS sync_stamp_edited_at ON %I', t);
    EXECUTE format('CREATE TRIGGER sync_stamp_edited_at BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION sync_stamp_edited_at()', t);
  END LOOP;
  -- user_settings has no id and is never deleted except by a clear: no tombstones.
  FOREACH t IN ARRAY ARRAY['players','teams','seasons','tournaments','personnel','player_adjustments','warmup_plans'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS sync_record_tombstone ON %I', t);
    EXECUTE format('CREATE TRIGGER sync_record_tombstone AFTER DELETE ON %I FOR EACH ROW EXECUTE FUNCTION sync_record_tombstone()', t);
  END LOOP;
END $$;

-- 4. The check a sync write makes first.
--    Tolerance 30 s, biased to the writer: both stamps are on the server's clock, so
--    only the measurement jitter of the age remains.
CREATE OR REPLACE FUNCTION sync_write_check(p_table text, p_row_id text, p_edit_age_ms bigint)
RETURNS TABLE (verdict text, edit_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_edit_at timestamptz := now() - make_interval(secs => GREATEST(COALESCE(p_edit_age_ms, 0), 0) / 1000.0);
  v_tolerance interval := interval '30 seconds';
  v_row_edited timestamptz;
  v_found boolean;
  v_deleted_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_table NOT IN ('players','teams','seasons','tournaments','personnel','user_settings','player_adjustments','warmup_plans') THEN
    RAISE EXCEPTION 'Unsupported table';
  END IF;

  -- The warmup plan's row id is derived from the user (the app's id is 'default').
  IF p_table = 'warmup_plans' THEN
    p_row_id := 'warmup_plan_' || v_user_id;
  END IF;

  -- One row per user: settings (no id) and the warmup plan.
  IF p_table IN ('user_settings', 'warmup_plans') THEN
    EXECUTE format('SELECT edited_at, true FROM %I WHERE user_id = $1 LIMIT 1', p_table)
      INTO v_row_edited, v_found USING v_user_id;
  ELSE
    EXECUTE format('SELECT edited_at, true FROM %I WHERE user_id = $1 AND id = $2', p_table)
      INTO v_row_edited, v_found USING v_user_id, p_row_id;
  END IF;

  IF v_found THEN
    IF v_row_edited IS NOT NULL AND v_edit_at < v_row_edited - v_tolerance THEN
      RETURN QUERY SELECT 'stale'::text, v_edit_at;
    ELSE
      RETURN QUERY SELECT 'apply'::text, v_edit_at;
    END IF;
    RETURN;
  END IF;

  SELECT t.deleted_at INTO v_deleted_at
  FROM sync_tombstones t
  WHERE t.user_id = v_user_id AND t.table_name = p_table AND t.row_id = p_row_id;

  IF v_deleted_at IS NOT NULL AND v_deleted_at > v_edit_at + v_tolerance THEN
    RETURN QUERY SELECT 'deleted'::text, v_edit_at;
    RETURN;
  END IF;

  -- (Re)creating: the edit is newer than any deletion. The deletion record is
  -- removed by the insert itself (sync_stamp_edited_at), not here.
  RETURN QUERY SELECT 'apply'::text, v_edit_at;
END;
$$;

REVOKE ALL ON FUNCTION sync_write_check(text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sync_write_check(text, text, bigint) TO authenticated;
