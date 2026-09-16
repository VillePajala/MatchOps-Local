'use client';

/**
 * TEMPORARY DIAGNOSTIC PAGE - delete once the myClub link question is settled.
 *
 * Every remaining way to open the myClub apps, on one page, so the question
 * costs one pass on a real phone instead of one deployment per guess.
 *
 * WHY THESE CARRY NO `browser_fallback_url`: the fallback is what made every
 * previous test ambiguous. With one, a failed intent quietly loads a web page,
 * which looks identical to "the app opened something". Without one, a failure
 * is visibly a failure - Chrome refuses or does nothing - so each row gives a
 * clean yes or no.
 *
 * WHAT IS ACTUALLY NEW HERE: rows 1-3. A plain link relies on Android's
 * app-link AUTO-OPEN layer, which Chrome declines for many reasons - myClub's
 * own site shows a "download our app" banner rather than handing off, so it
 * fails for them too. An intent naming the package skips that layer and
 * resolves directly against the app's declared filters. That has never been
 * tried against a club subdomain, only against the identity login.
 *
 * The club is hard-coded because this page is disposable.
 *
 * @module link-test
 */

const CLUB = 'pepo.myclub.fi';
const MEMBER = 'fi.myclub.member';
const COACH = 'fi.myclub.coach';

/** No fallback, on purpose: a failure must look like a failure. */
const httpsIntent = (url: string, pkg: string) => {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=${pkg};end`;
};

const schemeIntent = (scheme: string, pkg: string) =>
  `intent://open#Intent;scheme=${scheme};package=${pkg};end`;

interface Candidate {
  n: number;
  label: string;
  tests: string;
  href: string;
}

const CANDIDATES: Candidate[] = [
  {
    n: 1,
    label: 'Member app - intent at your club dashboard',
    tests: 'The untested one. Explicit package against the URL you actually land on.',
    href: httpsIntent(`https://${CLUB}/flow/`, MEMBER),
  },
  {
    n: 2,
    label: 'Member app - intent at your club root',
    tests: 'Same, in case /flow/ is too deep a path to be claimed.',
    href: httpsIntent(`https://${CLUB}/`, MEMBER),
  },
  {
    n: 3,
    label: 'Coach app - intent at your club dashboard',
    tests: 'Coach claims no addresses in Settings, but that screen shows only verified ones.',
    href: httpsIntent(`https://${CLUB}/flow/`, COACH),
  },
  {
    n: 4,
    label: 'Member app - custom scheme myclub://',
    tests: 'Whether a private scheme exists at all. Nothing public documents one.',
    href: schemeIntent('myclub', MEMBER),
  },
  {
    n: 5,
    label: 'Coach app - custom scheme myclubcoach://',
    tests: 'Same guess for Coach.',
    href: schemeIntent('myclubcoach', COACH),
  },
  {
    n: 6,
    label: 'Member app - bare myclub:// link',
    tests: 'The scheme with no package named, in case the intent form is what is refused.',
    href: 'myclub://',
  },
  {
    n: 7,
    label: 'CONTROL - plain link to your club dashboard',
    tests: 'Known to stay in the browser. If THIS opens the app, something changed.',
    href: `https://${CLUB}/flow/`,
  },
];

export default function LinkTestPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0f172a',
        color: '#e2e8f0',
        padding: '20px 16px 48px',
        font: '16px/1.5 system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 22, margin: '0 0 8px', fontWeight: 700 }}>myClub link test</h1>
      <p style={{ color: '#94a3b8', margin: '0 0 4px' }}>
        Tap each one in order. For every row, note only:{' '}
        <strong style={{ color: '#e2e8f0' }}>did an app open?</strong>
      </p>
      <p style={{ color: '#94a3b8', margin: '0 0 24px' }}>
        A refusal, an error, or nothing happening all mean <em>no</em> - and that is a useful
        answer, not a broken page. These deliberately have no fallback, so nothing quietly
        loads a web page and pretends to be a success.
      </p>

      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 14 }}>
        {CANDIDATES.map((c) => (
          <li key={c.n}>
            <a
              href={c.href}
              style={{
                display: 'block',
                padding: '14px 16px',
                borderRadius: 12,
                background: c.n === 7 ? '#334155' : '#4338ca',
                color: '#fff',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              {c.n}. {c.label}
            </a>
            <p style={{ color: '#94a3b8', fontSize: 13, margin: '6px 2px 0' }}>{c.tests}</p>
            <code
              style={{
                display: 'block',
                color: '#64748b',
                fontSize: 11,
                margin: '4px 2px 0',
                wordBreak: 'break-all',
              }}
            >
              {c.href}
            </code>
          </li>
        ))}
      </ol>

      <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 28 }}>
        If every row says no, that is the answer: the apps cannot be opened from a link, and the
        myClub rows should come out of the app rather than cost a tap for nothing.
      </p>
    </main>
  );
}
