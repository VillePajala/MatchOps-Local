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
 * section 7.5 - read it before adding them back, because `assetlinks.json`
 * makes it look possible and it is not.
 *
 * @module externalLinks
 * @category Config
 */

/** Palloliitto's competition system: lineups before a match, result after. */
export const TASO_URL = 'https://taso.palloliitto.fi';

export default TASO_URL;
