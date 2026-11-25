-- ============================================================================
-- 068: The coach's report text on a league and a tournament
-- ============================================================================
-- "Sarjaraportti" (seasons) and "Turnauksen raportti" (tournaments) are opened
-- from Kilpailut. Until now their coach text was written, shared and thrown
-- away - there was no column for it. This adds one per table, so the text is
-- saved (Tallenna) and synced like every other season/tournament field.
--
-- Numbering: 064-067 are taken by the unmerged feat/pelitapa branch, so this
-- is 068. Apply order between the two is free: they touch different objects.
--
-- Additive only: nullable, no default, no backfill. NULL = no report (the app
-- never stores a blank one; LocalDataStore drops it, SupabaseDataStore writes
-- NULL). Length is capped in the app (GAME_NOTES_MAX, shared validation), as
-- with games.game_notes - no CHECK, so a later cap change needs no migration.
--
-- Nothing else needs recreating:
-- - seasons/tournaments are written by direct insert/update/upsert in
--   SupabaseDataStore and read with select('*'); no RPC lists their columns.
-- - RLS is per row (user_id = auth.uid()), so the new column is covered; table
--   grants are table-level, so authenticated already has it.
-- - The sync triggers/RPCs of migration 059 (edited_at stamp, tombstones,
--   sync_write_check) are column-agnostic.
-- - clear_all_user_data / delete-account delete whole rows.
-- - An older app version that does not know the column omits it from its
--   upserts, and a PostgREST upsert only sets the columns it is sent, so an
--   old client's edit never clears a saved report.
--
-- DEPLOY ORDER: apply to the database BEFORE the client that writes the
-- column is released - a client sending report_text to a table without it is
-- refused by PostgREST (unknown column), and every season/tournament write
-- from that client would fail.
-- ============================================================================

ALTER TABLE public.seasons ADD COLUMN IF NOT EXISTS report_text text;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS report_text text;

COMMENT ON COLUMN public.seasons.report_text IS
  'Coach''s league report text (Sarjaraportti). NULL = none. Capped in the app (GAME_NOTES_MAX).';
COMMENT ON COLUMN public.tournaments.report_text IS
  'Coach''s tournament report text (Turnauksen raportti). NULL = none. Capped in the app (GAME_NOTES_MAX).';
