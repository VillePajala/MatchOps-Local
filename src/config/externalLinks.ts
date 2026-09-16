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

/*
 * NO INTENT LINKS HERE, and that is a conclusion rather than an omission.
 *
 * Both myClub apps publish Android App Links for myclub.fi
 * (/.well-known/assetlinks.json grants `handle_all_urls` to `fi.myclub.member`
 * and `fi.myclub.coach`), which makes deep linking look available. It is not,
 * for two different reasons, both established on a device with both apps
 * installed via Android's "Tuetut verkko-osoitteet" screen:
 *
 * - **myClub Coach claims no web addresses at all** - the list is empty and
 *   greyed out. No URL can reach it, so its store page is the destination and
 *   an installed app shows "Avaa" there. The statement file and the shipped
 *   manifest simply disagree, and the phone is the authority.
 *
 * - **myClub claims `*.myclub.fi` and `www.myclub.fi`**, with link opening
 *   switched on, and an intent aimed at `id.myclub.fi/flow/login` STILL fell
 *   through to its fallback - in a plain Chrome tab, not only inside the
 *   installed app, so the PWA context was not the cause. The host matches; the
 *   path is the problem. `id.myclub.fi` is the identity service, and an app
 *   claiming its own login URLs would break signing in through a browser, so
 *   that page is very likely excluded on purpose.
 *
 * Which leaves the honest position: the one myClub address correct for every
 * user is the one address that cannot open the app. A club-specific
 * `<club>.myclub.fi` would stand a real chance - that is the setting deferred
 * in the roadmap, and this is the argument for building it.
 *
 * Until then these are plain links. If the apps ever do claim a URL we use,
 * Android opens them by itself and no intent is needed anyway.
 */

