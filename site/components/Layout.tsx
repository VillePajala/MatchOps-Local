import { ReactNode } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { FaGithub, FaGlobe } from 'react-icons/fa';
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
        <meta
          name="description"
          content="Run the clock, log events, and track team stats — fully offline. Your data stays on your device."
        />
        <meta property="og:title" content="MatchOps-Local" />
        <meta
          property="og:description"
          content="Local-first soccer coaching app. Works offline. No signup."
        />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/favicon.png" />
        <meta name="twitter:card" content="summary_large_image" />
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
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                MatchOps-Local
              </span>
            </Link>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/features" className="text-slate-300 hover:text-primary transition-colors">
                {t('nav.features')}
              </Link>
              <Link href="/download" className="text-slate-300 hover:text-primary transition-colors">
                {t('nav.download')}
              </Link>
              <Link href="/docs" className="text-slate-300 hover:text-primary transition-colors">
                {t('nav.docs')}
              </Link>

              {/* Language Toggle */}
              <div className="flex items-center space-x-2 text-slate-300">
                <FaGlobe className="h-5 w-5" />
                <button
                  onClick={() => changeLanguage('en')}
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
                  className={`px-2 py-1 rounded transition-colors ${
                    router.locale === 'fi'
                      ? 'text-primary font-semibold'
                      : 'hover:text-primary'
                  }`}
                >
                  FI
                </button>
              </div>

              <a
                href="https://github.com/VillePajala/MatchOps-Local"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-300 hover:text-primary transition-colors"
              >
                <FaGithub className="h-6 w-6" />
              </a>
              <a
                href="https://matchops.app"
                className="btn btn-primary"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('nav.tryItNow')}
              </a>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center space-x-3">
              {/* Mobile Language Toggle */}
              <div className="flex items-center space-x-1 text-sm text-gray-600 dark:text-gray-300">
                <button
                  onClick={() => changeLanguage('en')}
                  className={`px-2 py-1 rounded ${
                    router.locale === 'en' ? 'text-primary font-semibold' : ''
                  }`}
                >
                  EN
                </button>
                <span>|</span>
                <button
                  onClick={() => changeLanguage('fi')}
                  className={`px-2 py-1 rounded ${
                    router.locale === 'fi' ? 'text-primary font-semibold' : ''
                  }`}
                >
                  FI
                </button>
              </div>
              <a
                href="https://matchops.app"
                className="btn btn-primary text-sm px-4 py-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('nav.tryNow')}
              </a>
            </div>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden pb-4 space-y-2">
            <Link href="/features" className="block text-gray-600 dark:text-gray-300 hover:text-primary transition-colors py-2">
              {t('nav.features')}
            </Link>
            <Link href="/download" className="block text-gray-600 dark:text-gray-300 hover:text-primary transition-colors py-2">
              {t('nav.download')}
            </Link>
            <Link href="/docs" className="block text-gray-600 dark:text-gray-300 hover:text-primary transition-colors py-2">
              {t('nav.docs')}
            </Link>
            <a
              href="https://github.com/VillePajala/MatchOps-Local"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-gray-600 dark:text-gray-300 hover:text-primary transition-colors py-2"
            >
              {t('nav.github')}
            </a>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* About */}
            <div>
              <h3 className="font-bold text-white mb-4">MatchOps-Local</h3>
              <p className="text-sm text-slate-300">
                {t('footer.tagline')}
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold text-white mb-4">{t('footer.product')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/features" className="text-slate-300 hover:text-primary">
                    {t('nav.features')}
                  </Link>
                </li>
                <li>
                  <Link href="/download" className="text-slate-300 hover:text-primary">
                    {t('nav.download')}
                  </Link>
                </li>
                <li>
                  <a
                    href="https://matchops.app"
                    className="text-slate-300 hover:text-primary"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('footer.launchApp')}
                  </a>
                </li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-semibold text-white mb-4">{t('footer.resources')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/docs" className="text-slate-300 hover:text-primary">
                    {t('footer.documentation')}
                  </Link>
                </li>
                <li>
                  <a
                    href="https://github.com/VillePajala/MatchOps-Local"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-300 hover:text-primary"
                  >
                    {t('nav.github')}
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/VillePajala/MatchOps-Local/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-300 hover:text-primary"
                  >
                    {t('footer.reportIssue')}
                  </a>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold text-white mb-4">{t('footer.legal')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="https://github.com/VillePajala/MatchOps-Local/blob/master/LICENSE"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-300 hover:text-primary"
                  >
                    {t('footer.license')}
                  </a>
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
