-- 034_assessment_slider_scale_version.sql
--
-- Player development assessment: per-metric ratings move from a 1-10 numeric
-- scale to a 1-5 developmental word scale (Working on it / Emerging / Developing
-- / Consistent / A strength).
--
-- This is an ADDITIVE column only - NO data is rewritten. Existing rows have a
-- NULL scale version, which the app treats as the legacy 1-10 scale and maps to
-- 1-5 on read (non-destructive); rows adopt the new scale the next time they are
-- saved (the app then writes slider_scale_version = 2). 1-5 values fit within
-- the existing 1-10 CHECK constraints on the legacy columns.
--
-- The save_game_with_relations RPC populates child rows via
-- jsonb_populate_recordset(null::player_assessments, ...), which is column-
-- agnostic, so it picks up slider_scale_version automatically - no RPC change.

ALTER TABLE player_assessments
  ADD COLUMN IF NOT EXISTS slider_scale_version smallint;

COMMENT ON COLUMN player_assessments.slider_scale_version IS
  'Scale version of slider_values: NULL/1 = legacy 1-10, 2 = 1-5 developmental word scale. Legacy rows are migrated to 1-5 on read.';
