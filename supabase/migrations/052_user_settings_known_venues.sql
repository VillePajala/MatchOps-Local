-- ============================================================================
-- 052: The venue book, kept
-- ============================================================================
-- The venues a coach has used were only ever rebuilt from saved games, so
-- deleting the last match at a ground forgot the ground - the owner deleted a
-- test fixture and the next day the app no longer knew "Mitta-Keittiöt Areena".
--
-- The book now lives in settings and is LEARNED from matches (see
-- learnVenues): a match adds or refreshes an entry, deleting one changes
-- nothing. One JSONB column holding an array of {name, latitude, longitude,
-- address, timesUsed, lastUsed}; the app checks every entry's shape on read.
--
-- Nullable, no backfill: an absent book is an empty one, and the first refresh
-- after this ships fills it from the matches that still exist. Settings are a
-- plain upsert, so no function is recreated.
-- ============================================================================

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS known_venues jsonb;

COMMENT ON COLUMN user_settings.known_venues IS
  'Venues the coach has used, learned from matches and kept when the matches are deleted. Array of {name, latitude, longitude, address, timesUsed, lastUsed}.';
