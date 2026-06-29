-- 033_assessment_slider_values.sql
--
-- Player development assessment: move per-metric ratings from 10 fixed columns
-- to an id-keyed JSONB map (`slider_values`), so the active metric set can
-- change without a schema migration.
--
-- EXPAND step of an expand/contract migration:
--   - add `slider_values jsonb` (nullable)
--   - backfill it from the existing flat columns
--   - KEEP the 10 flat columns for now (the app dual-writes them as a safety
--     net). A later CONTRACT migration drops the columns once verified in prod.
--
-- The save_game_with_relations RPC populates child rows via
-- jsonb_populate_recordset(null::player_assessments, ...), which is column-
-- agnostic, so no RPC change is needed - it picks up slider_values automatically.

ALTER TABLE player_assessments
  ADD COLUMN IF NOT EXISTS slider_values jsonb;

-- Backfill existing rows from the flat columns into the id-keyed map.
UPDATE player_assessments
SET slider_values = jsonb_build_object(
  'intensity',  intensity,
  'courage',    courage,
  'duels',      duels,
  'technique',  technique,
  'creativity', creativity,
  'decisions',  decisions,
  'awareness',  awareness,
  'teamwork',   teamwork,
  'fair_play',  fair_play,
  'impact',     impact
)
WHERE slider_values IS NULL;

COMMENT ON COLUMN player_assessments.slider_values IS
  'Id-keyed per-metric ratings (metric id -> value). Source of truth; the legacy flat columns are dual-written for one release then dropped.';
