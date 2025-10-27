import { ReactNode } from 'react';
import Link from 'next/link';
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
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="container-custom">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <img
                src="/logos/app-logo-yellow.png"
                alt="MatchOps Logo"
                className="h-10 w-10"
              />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                MatchOps-Local
              </span>
            </Link>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/features" className="text-gray-600 dark:text-gray-300 hover:text-primary transition-colors">
                {t('nav.features')}
              </Link>
              <Link href="/download" className="text-gray-600 dark:text-gray-300 hover:text-primary transition-colors">
                {t('nav.download')}
              </Link>
              <Link href="/docs" className="text-gray-600 dark:text-gray-300 hover:text-primary transition-colors">
                {t('nav.docs')}
              </Link>

              {/* Language Toggle */}
              <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-300">
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
                className="text-gray-600 dark:text-gray-300 hover:text-primary transition-colors"
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
      <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-20">
        <div className="container-custom py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* About */}
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-4">MatchOps-Local</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('footer.tagline')}
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4">{t('footer.product')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/features" className="text-gray-600 dark:text-gray-400 hover:text-primary">
                    {t('nav.features')}
                  </Link>
                </li>
                <li>
                  <Link href="/download" className="text-gray-600 dark:text-gray-400 hover:text-primary">
                    {t('nav.download')}
                  </Link>
                </li>
                <li>
                  <a
                    href="https://matchops.app"
                    className="text-gray-600 dark:text-gray-400 hover:text-primary"
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
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4">{t('footer.resources')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/docs" className="text-gray-600 dark:text-gray-400 hover:text-primary">
                    {t('footer.documentation')}
                  </Link>
                </li>
                <li>
                  <a
                    href="https://github.com/VillePajala/MatchOps-Local"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 dark:text-gray-400 hover:text-primary"
                  >
                    {t('nav.github')}
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/VillePajala/MatchOps-Local/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 dark:text-gray-400 hover:text-primary"
                  >
                    {t('footer.reportIssue')}
                  </a>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4">{t('footer.legal')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="https://github.com/VillePajala/MatchOps-Local/blob/master/LICENSE"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 dark:text-gray-400 hover:text-primary"
                  >
                    {t('footer.license')}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Copyright */}
          <div className="border-t border-gray-200 dark:border-gray-800 mt-8 pt-8 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('footer.copyright', { year: new Date().getFullYear() })}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
              {t('footer.dataStays')}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
