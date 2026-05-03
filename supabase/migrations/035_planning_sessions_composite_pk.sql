-- ============================================================================
-- 035_planning_sessions_composite_pk
-- ============================================================================
-- Brings planning_sessions into line with the composite-PK pattern from
-- migration 013, which deliberately moved every user-scoped table from
-- PRIMARY KEY (id) to PRIMARY KEY (user_id, id) so user A and user B
-- can hold rows with the same id (e.g. cross-account backup-restore,
-- or just collision-by-coincidence on the timestamp+random id format).
--
-- Migration 031 created planning_sessions with PRIMARY KEY (id) only,
-- silently breaking the pattern. This migration corrects that.
--
-- Safe to apply with no data migration:
--   - Existing ids are unique by themselves (text format
--     `planningSession_{ts}_{rand}`), so promoting the PK to a composite
--     accepts every row as-is.
--   - The non-unique idx_planning_sessions_user_id index becomes
--     redundant once the composite PK exists (PG can use the leading
--     column for user_id-only lookups), so this migration drops it.
--   - All existing query paths already filter by both user_id AND id
--     (RLS + explicit WHERE clauses); no app-side updates required.
--
-- Wrapped in a transaction so the table is never PK-less mid-flight.
--
-- @see supabase/migrations/013_composite_primary_keys.sql (the pattern)
-- @see supabase/migrations/031_planning_sessions.sql (the table)
-- ============================================================================

BEGIN;

ALTER TABLE planning_sessions DROP CONSTRAINT IF EXISTS planning_sessions_pkey;
ALTER TABLE planning_sessions ADD PRIMARY KEY (user_id, id);

-- The composite PK auto-creates a btree index on (user_id, id). Queries
-- on user_id alone use the leading-column scan from that index, so the
-- old idx_planning_sessions_user_id is redundant.
DROP INDEX IF EXISTS idx_planning_sessions_user_id;

COMMIT;
