-- Migration 041: game_events gains the 'note' type (Kirjuri voice notes)
--
-- A note is a coach observation stamped to the game clock: entity_id is the
-- player it is about (NULL = a note about the game), plus three new nullable
-- columns. Additive and metadata-only: ADD COLUMN with no default/NOT NULL, so
-- no table rewrite. The save_game_with_relations RPC inserts child rows via
-- jsonb_populate_recordset(null::game_events, ...) and therefore picks the new
-- columns up without being recreated. Only the event_type CHECK must change;
-- its auto-generated name (unnamed inline CHECK in 000_schema) was verified on
-- staging as game_events_event_type_check.

ALTER TABLE game_events
  ADD COLUMN IF NOT EXISTS note_text text,
  ADD COLUMN IF NOT EXISTS period integer,
  ADD COLUMN IF NOT EXISTS source text
    CHECK (source IS NULL OR source IN ('dictation', 'ai', 'manual'));

ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_event_type_check;
ALTER TABLE game_events ADD CONSTRAINT game_events_event_type_check CHECK (event_type IN (
  'goal', 'opponentGoal', 'substitution', 'periodEnd', 'gameEnd', 'fairPlayCard', 'note'
));

-- A note without words is not a note (the app validates the same rule).
ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_note_text_check;
ALTER TABLE game_events ADD CONSTRAINT game_events_note_text_check
  CHECK (event_type <> 'note' OR note_text IS NOT NULL);
