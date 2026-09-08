-- Migration 042: optional category on a Kirjuri note event
--
-- A note can carry a category: 'halftime' and 'debrief' come from the capture
-- surface, the technique/attitude/gameSense labels may be assigned later from
-- the note's own text. Additive and metadata-only (ADD COLUMN, nullable, no
-- default), so no table rewrite and no RPC change: save_game_with_relations
-- inserts child rows via jsonb_populate_recordset(null::game_events, ...) and
-- therefore picks the new column up on its own.
--
-- Same shape as migration 041, which added note_text/period/source.

ALTER TABLE game_events
  ADD COLUMN IF NOT EXISTS tag text
    CHECK (tag IS NULL OR tag IN ('halftime', 'debrief', 'technique', 'attitude', 'gameSense'));

-- Only notes are categorised; every other event type leaves the column NULL.
ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_tag_note_only_check;
ALTER TABLE game_events ADD CONSTRAINT game_events_tag_note_only_check
  CHECK (tag IS NULL OR event_type = 'note');

COMMENT ON COLUMN game_events.tag IS
  'Kirjuri note category (halftime/debrief/technique/attitude/gameSense); NULL for every non-note event.';
