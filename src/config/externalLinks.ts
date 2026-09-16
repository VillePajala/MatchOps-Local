/**
 * Fixed destinations outside the app.
 *
 * Collected here because the same links are offered from two places - the
 * in-match menu and the Home games tab - and one of them is not a web page at
 * all, so "just put the URL in the href" is not true for all of them.
 *
 * Background on what these systems can and cannot do:
 * `docs/10-analysis/taso-torneopal-api.md`.
 *
 * @module externalLinks
 * @category Config
 */

/** Palloliitto's competition system: lineups before a match, result after. */
export const TASO_URL = 'https://taso.palloliitto.fi';

/**
 * myClub on the web.
 *
 * NOT the coach's own club address. myClub is a **per-club subdomain**
 * (`<club>.myclub.fi`, e.g. `hjk.myclub.fi`) and the app does not know which
 * club the coach belongs to, so the central identity login is the only
 * destination that is correct for everybody. It lands them at their own clubs
 * once signed in.
 */
export const MYCLUB_URL = 'https://id.myclub.fi/flow/login';

/**
 * Play listing for myClub Coach.
 *
 * Used as the href on every platform, because it is always a valid page, and as
 * the intent fallback on Android when the app is not installed. Note that
 * `myclub.fi/install-coach` is NOT this - it redirects to a documentation
 * article, not to the store.
 */
export const MYCLUB_COACH_STORE_URL =
  'https://play.google.com/store/apps/details?id=fi.myclub.coach';

/**
 * Opens the installed myClub Coach app rather than its store page.
 *
 * myClub Coach is a native app, so there is no URL that opens it. Android's
 * intent scheme is the way in, and `browser_fallback_url` makes the store page
 * the outcome when the app is absent - so a coach who has it goes straight to
 * marking attendance, and one who does not goes to install it.
 */
export const MYCLUB_COACH_INTENT_URL =
  `intent:#Intent;package=fi.myclub.coach;S.browser_fallback_url=${encodeURIComponent(
    MYCLUB_COACH_STORE_URL,
  )};end`;

/*
 * Callers use this ONLY behind `isAndroid()` from `@/utils/platform`, and only
 * at click time - never while rendering. Choosing the href during render would
 * make the server and the client disagree about it and break hydration, so the
 * store URL stays in the href and the handler overrides it where it can do
 * better. Only Chrome-family Android honours `intent:`, which covers the Play
 * build because a TWA is Chrome; everything else follows the href instead.
 */
