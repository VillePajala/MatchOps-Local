// Site-wide constants: canonical origin, Play Store links, YouTube videos.
// One place, so every page and the sitemap agree.

export const SITE_URL = 'https://www.match-ops.com';

export const CONTACT_EMAIL = 'hello@match-ops.com';

const PLAY_APP_ID = 'com.matchops.local';

/**
 * Google Play link for one placement on the site (hero, final_cta, footer...).
 * utm_source/utm_medium are readable in our own links; Play Console only
 * attributes installs through the `referrer` parameter, so it carries the
 * same values URL-encoded. `hl` opens the listing in the page's language.
 */
export function playStoreUrl(placement: string, locale: string | undefined): string {
  const hl = locale === 'en' ? 'en' : 'fi';
  const utm = `utm_source=site&utm_medium=${placement}`;
  return (
    `https://play.google.com/store/apps/details?id=${PLAY_APP_ID}` +
    `&hl=${hl}&${utm}&referrer=${encodeURIComponent(utm)}`
  );
}

/** Official Google Play badge in the page's language (646x250 PNG). */
export function playBadge(locale: string | undefined): string {
  return locale === 'en' ? '/badges/google-play-badge-en.png' : '/badges/google-play-badge-fi.png';
}

export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@MatchOps-soccer';

// The videos are YouTube Shorts (vertical 9:16).
export const YOUTUBE_VIDEOS = {
  /** "MatchOps: suunnitelmasta otteluraporttiin" / "MatchOps: from game plan to match report" */
  hero: { fi: 'LdlFPWpYdTQ', en: 'mPytHzX4Sqg' },
  /** "Ottelupäivä MatchOpsilla..." / "Match day with MatchOps..." */
  matchDay: { fi: 'iIC5COidnwI', en: '6Itxy4bZ-y0' },
} as const;

export function youtubeId(video: keyof typeof YOUTUBE_VIDEOS, locale: string | undefined): string {
  return YOUTUBE_VIDEOS[video][locale === 'en' ? 'en' : 'fi'];
}

/** Absolute URL of a page path ('/' or '/guide/faq') in a locale (fi is the default, unprefixed). */
export function absoluteUrl(path: string, locale: string | undefined): string {
  const clean = path.split(/[?#]/)[0] || '/';
  const prefix = locale === 'en' ? '/en' : '';
  if (clean === '/') return `${SITE_URL}${prefix || '/'}`;
  return `${SITE_URL}${prefix}${clean}`;
}

export function ogImage(locale: string | undefined): string {
  return `${SITE_URL}/og/og-${locale === 'en' ? 'en' : 'fi'}.png`;
}
