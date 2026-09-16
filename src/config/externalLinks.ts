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
 * Hands an https URL to a named Android app instead of to the browser.
 *
 * BOTH myClub apps publish Android App Links for `myclub.fi`
 * (`/.well-known/assetlinks.json` on `id.`, `www.` and the club subdomains
 * grants `handle_all_urls` to `fi.myclub.member` and `fi.myclub.coach`), so
 * these URLs genuinely do belong to the apps. Naming the package makes the
 * hand-off unconditional: Android launches that app directly rather than
 * depending on whether the coach has ever switched on "Open supported links"
 * for it.
 *
 * THE SHAPE MATTERS, and the first attempt got it wrong. A bare
 * `intent:#Intent;package=...;end` carries no action and no data, so Chrome
 * cannot resolve an activity from it and goes straight to the fallback - which
 * is exactly what happened on the owner's phone: myClub Coach opened the Play
 * listing even though the app was installed. The working form carries the host
 * and path as intent data plus `scheme=https`, which makes it the ACTION_VIEW
 * the app's own intent filter is waiting for.
 *
 * `browser_fallback_url` is what happens when the app is absent, so it differs
 * per app: the member app falls back to the perfectly good web login, while
 * Coach - which has no web equivalent - falls back to its store page.
 */
function androidAppLink(httpsUrl: string, androidPackage: string, fallbackUrl: string): string {
  const { host, pathname, search } = new URL(httpsUrl);
  return (
    `intent://${host}${pathname}${search}#Intent;scheme=https;package=${androidPackage};` +
    `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`
  );
}

/** Opens the myClub member app on the sign-in screen; falls back to the web. */
export const MYCLUB_INTENT_URL = androidAppLink(MYCLUB_URL, 'fi.myclub.member', MYCLUB_URL);

/** Opens myClub Coach; falls back to installing it, since it has no web twin. */
export const MYCLUB_COACH_INTENT_URL = androidAppLink(
  'https://www.myclub.fi/',
  'fi.myclub.coach',
  MYCLUB_COACH_STORE_URL,
);

/*
 * Callers use these ONLY behind `isAndroid()` from `@/utils/platform`, and only
 * at click time - never while rendering. Choosing the href during render would
 * make the server and the client disagree about it and break hydration, so the
 * web URL stays in the href and the handler overrides it where it can do
 * better. Only Chrome-family Android honours `intent://`, which covers the Play
 * build because a TWA is Chrome; everything else follows the href instead.
 */
