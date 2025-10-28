import { ReactNode } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { FaGlobe } from 'react-icons/fa';
import { useTranslation } from 'next-i18next';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const { t } = useTranslation('common');

  const changeLanguage = (locale: string) => {
    router.push(router.pathname, router.asPath, { locale });
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-slate-800 bg-noise-texture text-slate-100 overflow-hidden">
      {/* Background Effects to match app visuals */}
      <div className="pointer-events-none absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
      <Head>
        <title>MatchOps-Local — Local-first match management</title>
        <meta name="description" content={t('footer.tagline')} />
        <meta property="og:title" content="MatchOps-Local" />
        <meta property="og:description" content={t('footer.tagline')} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/favicon.png" />
        <meta property="og:locale" content={router.locale === 'en' ? 'en_US' : 'fi_FI'} />
        <meta property="og:locale:alternate" content={router.locale === 'en' ? 'fi_FI' : 'en_US'} />
        <meta name="twitter:card" content="summary_large_image" />
        {(() => {
          const path = router.asPath || '/';
          const basePath = path.replace(/^\/(en|fi)(?=\/|$)/, '');
          const fiHref = basePath || '/';
          const enHref = `/en${basePath || '/'}`;
          return (
            <>
              <link rel="alternate" hrefLang="fi" href={fiHref} />
              <link rel="alternate" hrefLang="en" href={enHref} />
              <link rel="alternate" hrefLang="x-default" href={fiHref} />
            </>
          );
        })()}
        <link rel="icon" href="/favicon.png" />
      </Head>
      {/* Navigation */}
      <nav className="backdrop-blur-sm bg-slate-900/40 border-b border-slate-700/20 relative z-10">
        <div className="container-custom">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <Image
                src="/logos/app-logo-yellow.png"
                alt="MatchOps Logo"
                width={40}
                height={40}
                priority
              />
              <span className="text-xl font-bold text-white drop-shadow-lg">
                MatchOps Local
              </span>
            </Link>

            {/* Navigation Links (desktop) */}
            <div className="hidden md:flex items-center space-x-8">
              <Link
                href="/technical"
                aria-current={router.pathname === '/technical' ? 'page' : undefined}
                className={`nav-link transition-colors ${
                  router.pathname === '/technical'
                    ? 'text-primary font-semibold nav-link--active'
                    : 'text-slate-300 hover:text-primary'
                }`}
              >
                {t('nav.technical')}
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

            {/* Mobile: inline link + quick language toggle (no hamburger) */}
            <div className="md:hidden flex items-center gap-3">
              <Link
                href="/technical"
                aria-current={router.pathname === '/technical' ? 'page' : undefined}
                className={`text-sm nav-link transition-colors ${
                  router.pathname === '/technical'
                    ? 'text-primary font-semibold nav-link--active'
                    : 'text-slate-300 hover:text-primary'
                }`}
              >
                {t('nav.technical')}
              </Link>
              <button
                onClick={() => changeLanguage(router.locale === 'fi' ? 'en' : 'fi')}
                aria-label={router.locale === 'fi' ? 'Switch language to English' : 'Vaihda kieleen suomi'}
                className="px-2 py-1 text-xs rounded border border-slate-600 text-slate-200 hover:text-white hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {router.locale?.toUpperCase() ?? 'EN'}
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
        <div className="container-custom py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* About */}
            <div>
              <h3 className="font-bold text-white mb-4">MatchOps-Local</h3>
              <p className="text-sm text-slate-300">
                {t('footer.tagline')}
              </p>
            </div>

            {/* Navigation */}
            <div>
              <h4 className="font-semibold text-white mb-4">{t('footer.navigation')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/" className="text-slate-300 hover:text-primary">
                    {t('footer.home')}
                  </Link>
                </li>
                <li>
                  <Link href="/technical" className="text-slate-300 hover:text-primary">
                    {t('nav.technical')}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold text-white mb-4">{t('footer.legal')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <span className="text-slate-300">{t('footer.license')}</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Copyright */}
          <div className="border-t border-slate-700/20 mt-8 pt-8 text-center">
            <p className="text-sm text-slate-300">
              {t('footer.copyright', { year: new Date().getFullYear() })}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              {t('footer.dataStays')}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
