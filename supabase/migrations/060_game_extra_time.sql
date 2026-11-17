-- ============================================================================
-- 060: Extra time on games (review 11.1, owner decisions 2026-11-17)
-- ============================================================================
-- A match could only be regulation periods (+ a penalty shootout). Extra time is
-- played as further periods after regulation, each with its own length:
--   extra_time_periods  0 = none (default; every existing game), 1 or 2
--   extra_time_minutes  length of each extra-time period (NULL when none)
-- number_of_periods stays the REGULATION count (1|2) - its CHECK is unchanged.
-- went_to_overtime (021) remains the result flag; starting extra time sets it.
--
-- Additive, idempotent. The save RPC learns the columns in 061 (separate migration,
-- per the 021/022 lesson).
-- ============================================================================

ALTER TABLE games ADD COLUMN IF NOT EXISTS extra_time_periods smallint NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS extra_time_minutes smallint;

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_extra_time_periods_check;
ALTER TABLE games ADD CONSTRAINT games_extra_time_periods_check
  CHECK (extra_time_periods BETWEEN 0 AND 2);
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_extra_time_minutes_check;
ALTER TABLE games ADD CONSTRAINT games_extra_time_minutes_check
  CHECK (extra_time_minutes IS NULL OR extra_time_minutes BETWEEN 1 AND 60);

COMMENT ON COLUMN games.extra_time_periods IS
  'Extra-time periods after regulation: 0 none, 1 or 2 (migration 060).';
COMMENT ON COLUMN games.extra_time_minutes IS
  'Length of each extra-time period in minutes; NULL when none (migration 060).';
