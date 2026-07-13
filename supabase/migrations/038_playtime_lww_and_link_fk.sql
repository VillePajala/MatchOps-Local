-- ============================================================================
-- 038: True per-plan LWW on push + FK cascade for plan links
-- ============================================================================
-- Deep review findings (plan doc §11 addendum #2):
--
-- 1. The client pushed plans with a BLIND upsert: last-pusher-wins. A device
--    coming online with an old queued edit overwrote a genuinely newer cloud
--    row, and because hydration is pull-only the divergence healed only if the
--    newer device happened to edit that plan again. save_playtime_plan makes
--    the write conditional: it applies only when the incoming edit-time stamp
--    is >= the stored row's (ties go to the writer, matching upsert semantics
--    for retries of the same op).
--
-- 2. playtime_plan_links.plan_id had no FK. A plan delete whose companion
--    delete-links op was lost (the sync queue is deliberately cleared on
--    close) left orphan link rows that hydration resurrected forever. The FK
--    cascades link deletion server-side with the plan row. (A link pushed
--    before its plan lands FK-fails and retries with backoff - benign, both
--    bulk paths already push plans first, and incremental priority does too.)
-- ============================================================================

CREATE OR REPLACE FUNCTION save_playtime_plan(
  p_id text,
  p_name text,
  p_archived boolean,
  p_data jsonb,
  p_updated_at timestamptz
)
RETURNS boolean  -- true = write applied, false = a newer row already exists
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_count integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO playtime_plans (user_id, id, name, archived, data, updated_at)
  VALUES (v_user_id, p_id, p_name, COALESCE(p_archived, false), p_data, p_updated_at)
  ON CONFLICT (user_id, id) DO UPDATE
    SET name = EXCLUDED.name,
        archived = EXCLUDED.archived,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
    WHERE playtime_plans.updated_at <= EXCLUDED.updated_at;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION save_playtime_plan FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_playtime_plan TO authenticated;

-- Server-side cascade: deleting a plan deletes its link rows even when the
-- client's companion delete op was lost.
--
-- ADD CONSTRAINT validates EXISTING rows, so orphans (the exact failure mode
-- this FK prevents) would abort the whole apply - clean them up first. The
-- DROP-first guard keeps the migration re-runnable (house pattern, 017/028).
DELETE FROM playtime_plan_links l
WHERE NOT EXISTS (
  SELECT 1 FROM playtime_plans p
  WHERE p.user_id = l.user_id AND p.id = l.plan_id
);

ALTER TABLE playtime_plan_links
  DROP CONSTRAINT IF EXISTS playtime_plan_links_plan_fk;
ALTER TABLE playtime_plan_links
  ADD CONSTRAINT playtime_plan_links_plan_fk
  FOREIGN KEY (user_id, plan_id)
  REFERENCES playtime_plans (user_id, id)
  ON DELETE CASCADE;
