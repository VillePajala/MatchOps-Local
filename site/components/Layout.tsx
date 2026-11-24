import { ReactNode } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { FaGlobe } from 'react-icons/fa';
import { useTranslation } from 'next-i18next';
import {
  CONTACT_EMAIL,
  YOUTUBE_CHANNEL_URL,
  absoluteUrl,
  ogImage,
  playBadge,
  playStoreUrl,
} from '@/lib/site';

interface LayoutProps {
  children: ReactNode;
  /** Page <title>; also used as og:title. */
  title: string;
  /** Meta description; also used as og:description. */
  description: string;
  /** JSON-LD objects to emit as structured data. */
  jsonLd?: object[];
}

/**
 * Every page's head lives here so each page has exactly one title, one
 * description, one og:* set, a canonical URL and absolute hreflang links.
 */
export default function Layout({ children, title, description, jsonLd }: LayoutProps) {
  const router = useRouter();
  const { t } = useTranslation('common');
  const locale = router.locale === 'en' ? 'en' : 'fi';
  // asPath never includes the locale prefix with Next's i18n routing.
  const path = (router.asPath || '/').split(/[?#]/)[0] || '/';
  const canonical = absoluteUrl(path, locale);
  const image = ogImage(locale);

  const changeLanguage = (locale: string) => {
    router.push(router.pathname, router.asPath, { locale });
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-slate-800 bg-noise-texture text-slate-100 overflow-hidden">
      {/* Background Effects to match app visuals */}
      <div className="pointer-events-none absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <link rel="alternate" hrefLang="fi" href={absoluteUrl(path, 'fi')} />
        <link rel="alternate" hrefLang="en" href={absoluteUrl(path, 'en')} />
        <link rel="alternate" hrefLang="x-default" href={absoluteUrl(path, 'fi')} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="MatchOps" />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={image} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={t('seo.ogImageAlt')} />
        <meta property="og:locale" content={locale === 'en' ? 'en_GB' : 'fi_FI'} />
        <meta property="og:locale:alternate" content={locale === 'en' ? 'fi_FI' : 'en_GB'} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={image} />
        {jsonLd?.map((data, i) => (
          <script
            key={i}
            type="application/ld+json"
            // JSON-LD built from our own constants and locale strings.
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
          />
        ))}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </Head>
      {/* Navigation */}
      <nav className="backdrop-blur-sm bg-slate-900/40 border-b border-slate-700/20 relative z-10">
        <div className="container-custom">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <Image
                src="/logos/matchops-badge.svg"
                alt="MatchOps Logo"
                width={40}
                height={40}
                priority
                unoptimized
              />
              <span className="text-xl font-bold text-white drop-shadow-lg">
                MatchOps
              </span>
            </Link>

            {/* Navigation Links (desktop) */}
            <div className="hidden md:flex items-center space-x-8">
              <Link
                href="/guide"
                aria-current={router.pathname.startsWith('/guide') ? 'page' : undefined}
                className={`nav-link transition-colors ${
                  router.pathname.startsWith('/guide')
                    ? 'text-primary font-semibold nav-link--active'
                    : 'text-slate-300 hover:text-primary'
                }`}
              >
                {t('nav.guide')}
              </Link>
              <Link href="/#faq" className="nav-link transition-colors text-slate-300 hover:text-primary">
                {t('nav.faq')}
              </Link>

              {/* Language Toggle */}
              <div className="flex items-center space-x-2 text-slate-300" role="group" aria-label="Language selector">
                <FaGlobe className="h-5 w-5" aria-hidden="true" />
                <button
                  onClick={() => changeLanguage('en')}
                  aria-pressed={router.locale === 'en'}
                  aria-label="Switch language to English"
                  className={`px-2 py-1 rounded transition-colors ${
                    router.locale === 'en'
                      ? 'text-primary font-semibold'
                      : 'hover:text-primary'
                  }`}
                >
                  EN
                </button>
                <span className="text-gray-400">|</span>
                <button
                  onClick={() => changeLanguage('fi')}
                  aria-pressed={router.locale === 'fi'}
                  aria-label="Vaihda kieleen suomi"
                  className={`px-2 py-1 rounded transition-colors ${
                    router.locale === 'fi'
                      ? 'text-primary font-semibold'
                      : 'hover:text-primary'
                  }`}
                >
                  FI
                </button>
              </div>
            </div>

            {/* Mobile: Guide link + language toggle */}
            <div className="md:hidden flex items-center gap-3">
              <Link
                href="/guide"
                aria-current={router.pathname.startsWith('/guide') ? 'page' : undefined}
                className={`text-sm nav-link transition-colors ${
                  router.pathname.startsWith('/guide')
                    ? 'text-primary font-semibold nav-link--active'
                    : 'text-slate-300 hover:text-primary'
                }`}
              >
                {t('nav.guide')}
              </Link>
              <Link href="/#faq" className="text-sm nav-link transition-colors text-slate-300 hover:text-primary">
                {t('nav.faq')}
              </Link>
              <button
                onClick={() => changeLanguage(router.locale === 'fi' ? 'en' : 'fi')}
                aria-label={router.locale === 'fi' ? 'Switch language to English' : 'Vaihda kieleen suomi'}
                className="px-2 py-1 text-xs rounded border border-slate-600 text-slate-200 hover:text-white hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {router.locale === 'fi' ? 'EN' : 'FI'}
              </button>
            </div>
          </div>

        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow">
        {children}
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-slate-700/20 bg-slate-900/40 backdrop-blur-sm relative z-10">
        <div className="container-custom py-8 text-center">
          <a
            href={playStoreUrl('footer', locale)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mb-4"
          >
            <Image
              src={playBadge(locale)}
              alt={t('info.cta.googlePlayAlt')}
              width={646}
              height={250}
              className="mx-auto w-36 h-auto drop-shadow-md hover:scale-105 transition-transform"
            />
          </a>
          <nav
            aria-label={t('footer.navigation')}
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-slate-300"
          >
            <Link href="/guide" className="hover:text-primary transition-colors">
              {t('nav.guide')}
            </Link>
            <Link href="/#faq" className="hover:text-primary transition-colors">
              {t('nav.faq')}
            </Link>
            <a
              href={YOUTUBE_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              YouTube
            </a>
            <Link href="/privacy" className="hover:text-primary transition-colors">
              {t('footer.privacyPolicy')}
            </Link>
            <Link href="/terms" className="hover:text-primary transition-colors">
              {t('footer.termsOfService')}
            </Link>
          </nav>
          <p className="mt-3 text-sm text-slate-400">
            {t('footer.contact')} {CONTACT_EMAIL}
          </p>
          <p className="mt-3 text-xs text-slate-500" suppressHydrationWarning>
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </footer>
    </div>
  );
}
