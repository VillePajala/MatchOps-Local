import type { AppState } from '@/types/game';

/**
 * The venues this coach has actually used, learned from their own matches.
 *
 * WHY THIS EXISTS. OpenStreetMap knows buildings by their real names and not
 * their sponsors, so "Mitta-Keittiöt Areena" is unfindable by search no matter
 * how it is spelled. But a coach types it once, pins it to its street address,
 * and then plays there eight more times that season - so the second time should
 * not be a search at all. It should be recognition.
 *
 * DERIVED, NEVER STORED. The book is computed from saved games on demand. That
 * means it can never disagree with the matches it came from, it needs no
 * schema, no migration and no sync, and a venue disappears from it exactly when
 * the last match using it is deleted. For the scale involved - tens of venues
 * across a hundred games - recomputing is far cheaper than keeping a second
 * copy honest.
 *
 * IT ALSO KEEPS SPELLING STABLE, which is the same job the opponent-name work
 * does. One pitch typed as "Kimpinen", "Kimpisen kenttä" and "kimpisen" is
 * three venues to anything that groups by location; offering back the spelling
 * already in use collapses them before they diverge.
 *
 * @module venueBook
 */

export interface KnownVenue {
  /** The spelling the coach used most recently - theirs, not the map's. */
  name: string;
  /** The pin, when any match at this venue ever had one. */
  latitude?: number;
  longitude?: number;
  /** The address that pin came from, so a renamed venue still shows it. */
  address?: string;
  /** How many matches were played here. Ties break toward the familiar. */
  timesUsed: number;
  /** ISO date of the most recent match here; the primary ordering. */
  lastUsed: string;
}

/**
 * Fold a name for MATCHING ONLY - never for storage or display.
 *
 * Strips case and diacritics, so a coach who types "mitta-keittiot" on a
 * keyboard without umlauts still finds "Mitta-Keittiöt Areena". Treating ä and
 * a as the same letter is linguistically wrong in Finnish and exactly right
 * for a search box, because it only ever widens what matches.
 */
const fold = (s: string): string =>
  s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** The date a match is filed under, for "most recent venue" ordering. */
const dateOf = (g: Partial<AppState>): string =>
  (g.gameDate as string | undefined) ?? '';

/**
 * Build the venue book from saved games, most recently used first.
 *
 * A venue's PIN is taken from the most recent match that had one, not
 * necessarily the most recent match: pinning it once should not be undone by
 * later matches where the coach typed the name from memory.
 */
export function buildVenueBook(games: readonly Partial<AppState>[]): KnownVenue[] {
  const byName = new Map<string, KnownVenue>();

  // Oldest first, so each later match overwrites the name and date with the
  // newer one and the final spelling is the most recent.
  const ordered = [...games].sort((a, b) => dateOf(a).localeCompare(dateOf(b)));

  for (const game of ordered) {
    const name = game.gameLocation?.trim();
    if (!name) continue;

    const key = fold(name);
    const existing = byName.get(key);
    const hasPin =
      typeof game.locationLat === 'number' && typeof game.locationLng === 'number';

    byName.set(key, {
      name,
      // A pin from this match wins; otherwise whatever we had is kept.
      latitude: hasPin ? game.locationLat : existing?.latitude,
      longitude: hasPin ? game.locationLng : existing?.longitude,
      address: hasPin ? game.locationAddress : existing?.address,
      timesUsed: (existing?.timesUsed ?? 0) + 1,
      lastUsed: dateOf(game) || existing?.lastUsed || '',
    });
  }

  return [...byName.values()].sort(
    (a, b) => b.lastUsed.localeCompare(a.lastUsed) || b.timesUsed - a.timesUsed,
  );
}

/**
 * The venues worth offering for what the coach has typed so far.
 *
 * An empty query returns the most recent ones rather than nothing, because
 * "tap the field and pick where we play" is the whole point of having a book -
 * a coach who has to type before being recognised is still doing the typing.
 *
 * A name that STARTS with the query outranks one that merely contains it:
 * typing "kim" means Kimpinen, not "Savonlinnan kisapuisto (Kimmo)".
 */
export function matchVenues(
  book: readonly KnownVenue[],
  query: string,
  limit = 5,
): KnownVenue[] {
  const q = fold(query);
  if (!q) return book.slice(0, limit);

  const starts: KnownVenue[] = [];
  const contains: KnownVenue[] = [];
  for (const venue of book) {
    const name = fold(venue.name);
    if (name.startsWith(q)) starts.push(venue);
    else if (name.includes(q)) contains.push(venue);
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * True when a suggestion from the map is already in the book - so the same
 * pitch is not offered twice, once as the coach's name and once as the map's.
 */
export function isKnownVenue(book: readonly KnownVenue[], name: string): boolean {
  const key = fold(name);
  return book.some((v) => fold(v.name) === key);
}
