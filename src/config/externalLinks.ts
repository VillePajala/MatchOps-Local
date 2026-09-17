/**
 * Fixed destinations outside the app.
 *
 * Kept as a module rather than inlined because Taso is offered from two places
 * - the in-match menu and the Home games tab - and was previously hardcoded in
 * both.
 *
 * THERE ARE NO myCLUB LINKS HERE, and that is a decision rather than an
 * oversight. They were built, shipped to a preview and removed again: a link
 * that lands in a browser is slower than tapping the app's own icon, so they
 * only earned their place if they opened the apps, and neither app can be
 * opened from a URL. The evidence is in `docs/10-analysis/taso-torneopal-api.md`
 * section 7.6 - read it before adding them back, because `assetlinks.json`
 * makes it look possible and it is not.
 *
 * @module externalLinks
 * @category Config
 */

/** Palloliitto's competition system: lineups before a match, result after. */
export const TASO_URL = 'https://taso.palloliitto.fi';

/**
 * A Google Maps link for a match venue.
 *
 * NO MAPS API, DELIBERATELY. This is Google's documented universal URL, which
 * is a plain link: no key, no billing account, no quota, and nothing sent
 * anywhere until the coach actually taps it. On Android, Google Maps claims
 * these URLs as App Links - so unlike the myClub experiment, the tap really
 * does open the app.
 *
 * WHAT IT DOES AND DOES NOT DO. `query` runs a Maps search, the same as typing
 * into the search box - it does not resolve a place for us. A named venue
 * ("Kimpisen kentta") lands correctly; something generic ("Keskuskentta")
 * offers a list to pick from. Exactness, when it is wanted, comes from the
 * coach pasting a share link or coordinates into the field instead, which this
 * passes through untouched.
 *
 * THE VENUE ONLY. Never pass the pitch number - "Kimpisen kentta TN 2" finds
 * nothing, which is the whole reason `fieldNumber` is a separate field.
 *
 * @returns the URL, or null when there is nothing to search for.
 */
export function mapsSearchUrl(
  venue: string | undefined,
  latitude?: number,
  longitude?: number,
): string | null {
  // COORDINATES WIN WHEN WE HAVE THEM. A picked venue is an exact position, so
  // there is nothing left to search for and nothing to get wrong - which is the
  // entire reason the lookup stores them.
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }

  const trimmed = venue?.trim();
  if (!trimmed) return null;
  // Already a link (a Maps share URL, most likely): send them exactly there
  // rather than searching for the text of a URL.
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}
