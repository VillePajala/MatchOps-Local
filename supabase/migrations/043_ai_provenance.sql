-- Migration 043: provenance for anything an AI drafted and the coach approved
--
-- Two nullable JSONB columns, both metadata about text that already exists:
--   game_events.ai_meta   - on a note the coach accepted from a draft
--   games.game_notes_ai_meta - on a match report composed from a draft
-- Shape: {"model": "<model id>", "packet": "<GamePacket fingerprint>"}, so a
-- later and better model's work can be told apart from today's, and a re-draft
-- from identical data is recognisable.
--
-- Additive: ADD COLUMN, nullable, no default, so no table rewrite. The
-- save_game_with_relations RPC populates child rows via
-- jsonb_populate_recordset(null::game_events, ...) and picks the new event
-- column up without being recreated.
--
-- NOTE: the games column is NOT picked up automatically. The RPC's INSERT is
-- column-agnostic but its ON CONFLICT DO UPDATE path names every column, and
-- this one was missing - see migration 044, which adds it.

ALTER TABLE game_events
  ADD COLUMN IF NOT EXISTS ai_meta jsonb;

-- Provenance belongs to notes; every other event type leaves it NULL.
ALTER TABLE game_events DROP CONSTRAINT IF EXISTS game_events_ai_meta_note_only_check;
ALTER TABLE game_events ADD CONSTRAINT game_events_ai_meta_note_only_check
  CHECK (ai_meta IS NULL OR event_type = 'note');

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS game_notes_ai_meta jsonb;

COMMENT ON COLUMN game_events.ai_meta IS
  'Kirjuri: {model, packet} for a note accepted from an AI draft; NULL for coach-written notes.';
COMMENT ON COLUMN games.game_notes_ai_meta IS
  'Kirjuri: {model, packet} when the match report was composed from an AI draft; NULL otherwise.';
