-- ============================================================================
-- 046: Opponents belong to the competition (leagues)
-- ============================================================================
-- The teams a league is played against, so creating a game can offer them as a
-- dropdown instead of asking the coach to retype the one field that genuinely
-- varies from game to game.
--
-- WHY THIS IS text[] AND NOT A TABLE. These are string labels, not entities
-- (owner, 2026-09-11: "that is what they are, just string labels"). Finnish
-- clubs name teams club + colour, so "IPS Punainen" is a stable STRING across
-- competitions while the squad behind it is not: the harraste IPS Punainen and
-- the kilpa one share a name and share nothing else. Give an opponent an id and
-- someone will eventually join statistics on it and merge those two silently.
--
-- Ids become correct only when an external authority can tell them apart, which
-- is Taso - it registers a team per competition. Until then a string maps onto
-- an official id cleanly, whereas a home-made id would have to be reconciled
-- against it. See the roadmap item for the club-scale reasoning.
--
-- Plain ALTER, no function to recreate: seasons are written by a direct
-- insert/update in SupabaseDataStore, not through save_game_with_relations.
--
-- Games are untouched. The dropdown writes the chosen string into
-- games.opponent_name exactly as typing does, so every existing game keeps
-- working and no historical free-text opponent needs migrating.
--
-- Tournaments get the same capability WITHOUT a migration: their `series`
-- column is already jsonb holding {id, level} per level, so the per-level
-- opponent list lives inside it. Deliberately a separate slice.
-- ============================================================================

ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS opponents text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN seasons.opponents IS
  'Opponent team names for this league, as coach-entered string labels. Not entities: no ids, no team data. Offered as a dropdown when creating a game; free text is always still allowed.';
