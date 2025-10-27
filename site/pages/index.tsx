import Layout from '@/components/Layout';
import FeatureCard from '@/components/FeatureCard';
import TechBadge from '@/components/TechBadge';
import Link from 'next/link';
import { FaLock, FaBolt, FaDollarSign, FaWifi, FaChartLine, FaCreditCard, FaServer, FaShieldAlt, FaFutbol, FaClock, FaPencilAlt, FaUsers, FaTrophy } from 'react-icons/fa';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';

export default function Home() {
  const { t } = useTranslation('common');
  return (
    <Layout>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-20">
        <div className="container-custom">
          <div className="text-center max-w-4xl mx-auto">
            {/* Logo */}
            <div className="mb-8 flex justify-center">
              <img
                src="/logos/match_ops_local_logo_transparent.png"
                alt="MatchOps-Local Logo"
                className="h-32 md:h-40 w-auto"
              />
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t('home.hero.title')}
            </h1>
            <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
              {t('home.hero.subtitle')}
            </p>
            <p className="text-base md:text-lg text-gray-700 dark:text-gray-400 mb-8">
              {t('home.hero.subtitleBold')}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <a
                href="https://matchops.app"
                className="btn btn-primary text-lg"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('home.hero.tryItNow')}
              </a>
              <a
                href="#features"
                className="btn btn-outline text-lg"
              >
                {t('home.hero.seeHowItWorks')}
              </a>
            </div>

            {/* Hero Screenshot Placeholder */}
            <div className="mt-12 max-w-5xl mx-auto">
              <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-xl shadow-2xl border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center overflow-hidden">
                <div className="text-center px-6">
                  <p className="text-gray-600 dark:text-gray-400 text-lg font-semibold mb-2">
                    {t('home.hero.screenshotTitle')}
                  </p>
                  <p className="text-gray-500 dark:text-gray-500 text-sm">
                    {t('home.hero.screenshotPlaceholder')}
                  </p>
                </div>
              </div>
            </div>

            {/* Hero Points */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
              <div className="flex flex-col items-center">
                <FaLock className="text-primary text-3xl mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">{t('home.hero.privacyTitle')}</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">{t('home.hero.privacyDesc')}</p>
              </div>
              <div className="flex flex-col items-center">
                <FaBolt className="text-primary text-3xl mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">{t('home.hero.offlineTitle')}</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">{t('home.hero.offlineDesc')}</p>
              </div>
              <div className="flex flex-col items-center">
                <FaDollarSign className="text-primary text-3xl mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">{t('home.hero.freeTitle')}</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">{t('home.hero.freeDesc')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Local-First Section */}
      <section className="py-20 bg-white dark:bg-gray-800">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t('home.whyLocalFirst.title')}
            </h2>
            <p className="text-xl text-gray-700 dark:text-gray-300 max-w-3xl mx-auto">
              {t('home.whyLocalFirst.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Data Privacy & Control */}
            <div className="card border-2 border-green-200 dark:border-green-900">
              <FaShieldAlt className="text-green-500 text-3xl mb-4" />
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                {t('home.whyLocalFirst.privacyTitle')}
              </h3>
              <ul className="space-y-3 text-gray-700 dark:text-gray-300">
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>{t('home.whyLocalFirst.privacyPoint1')}</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>{t('home.whyLocalFirst.privacyPoint2')}</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>{t('home.whyLocalFirst.privacyPoint3')}</span>
                </li>
              </ul>
            </div>

            {/* Works Anywhere */}
            <div className="card border-2 border-green-200 dark:border-green-900">
              <FaBolt className="text-green-500 text-3xl mb-4" />
              <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                {t('home.whyLocalFirst.worksAnywhereTitle')}
              </h3>
              <ul className="space-y-3 text-gray-700 dark:text-gray-300">
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>{t('home.whyLocalFirst.worksPoint1')}</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>{t('home.whyLocalFirst.worksPoint2')}</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span>{t('home.whyLocalFirst.worksPoint3')}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t('home.solution.title')}
            </h2>
            <p className="text-xl text-gray-700 dark:text-gray-300 max-w-3xl mx-auto">
              {t('home.solution.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<FaShieldAlt />}
              title={t('home.solution.deviceTitle')}
              description={t('home.solution.deviceDesc')}
              highlights={[
                t('home.solution.deviceHighlight1'),
                t('home.solution.deviceHighlight2'),
                t('home.solution.deviceHighlight3')
              ]}
            />
            <FeatureCard
              icon={<FaBolt />}
              title={t('home.solution.sidelineTitle')}
              description={t('home.solution.sidelineDesc')}
              highlights={[
                t('home.solution.sidelineHighlight1'),
                t('home.solution.sidelineHighlight2'),
                t('home.solution.sidelineHighlight3')
              ]}
            />
            <FeatureCard
              icon={<FaChartLine />}
              title={t('home.solution.proFeaturesTitle')}
              description={t('home.solution.proFeaturesDesc')}
              highlights={[
                t('home.solution.proFeaturesHighlight1'),
                t('home.solution.proFeaturesHighlight2'),
                t('home.solution.proFeaturesHighlight3')
              ]}
            />
            <FeatureCard
              icon={<FaDollarSign />}
              title={t('home.solution.freeVersionTitle')}
              description={t('home.solution.freeVersionDesc')}
              highlights={[
                t('home.solution.freeVersionHighlight1'),
                t('home.solution.freeVersionHighlight2'),
                t('home.solution.freeVersionHighlight3')
              ]}
            />
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section id="features" className="py-20 bg-white dark:bg-gray-800">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t('home.features.title')}
            </h2>
            <p className="text-xl text-gray-700 dark:text-gray-300 max-w-3xl mx-auto">
              {t('home.features.subtitle')}
            </p>
          </div>

          {/* Feature Screenshots Placeholders */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-lg shadow-lg border border-gray-300 dark:border-gray-600 flex items-center justify-center">
              <div className="text-center px-4">
                <p className="text-gray-600 dark:text-gray-400 text-sm font-semibold">
                  {t('home.features.screenshot1')}
                </p>
                <p className="text-gray-500 dark:text-gray-500 text-xs mt-1">
                  {t('home.features.screenshotLabel')}
                </p>
              </div>
            </div>
            <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-lg shadow-lg border border-gray-300 dark:border-gray-600 flex items-center justify-center">
              <div className="text-center px-4">
                <p className="text-gray-600 dark:text-gray-400 text-sm font-semibold">
                  {t('home.features.screenshot2')}
                </p>
                <p className="text-gray-500 dark:text-gray-500 text-xs mt-1">
                  {t('home.features.screenshotLabel')}
                </p>
              </div>
            </div>
            <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-lg shadow-lg border border-gray-300 dark:border-gray-600 flex items-center justify-center">
              <div className="text-center px-4">
                <p className="text-gray-600 dark:text-gray-400 text-sm font-semibold">
                  {t('home.features.screenshot3')}
                </p>
                <p className="text-gray-500 dark:text-gray-500 text-xs mt-1">
                  {t('home.features.screenshotLabel')}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="card">
              <FaFutbol className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">{t('home.features.interactiveFieldTitle')}</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t('home.features.interactiveFieldDesc')}
              </p>
            </div>
            <div className="card">
              <FaClock className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">{t('home.features.timerTitle')}</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t('home.features.timerDesc')}
              </p>
            </div>
            <div className="card">
              <FaChartLine className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">{t('home.features.statsTitle')}</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t('home.features.statsDesc')}
              </p>
            </div>
            <div className="card">
              <FaPencilAlt className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">{t('home.features.tacticsTitle')}</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t('home.features.tacticsDesc')}
              </p>
            </div>
            <div className="card">
              <FaUsers className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">{t('home.features.multiTeamTitle')}</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t('home.features.multiTeamDesc')}
              </p>
            </div>
            <div className="card">
              <FaTrophy className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">{t('home.features.seasonTitle')}</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t('home.features.seasonDesc')}
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Link href="/features" className="btn btn-primary">
              {t('home.features.exploreAll')}
            </Link>
          </div>
        </div>
      </section>

      {/* Technical Details Section */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
        <div className="container-custom">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              {t('home.technical.title')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {t('home.technical.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-4xl mx-auto">
            <TechBadge name="React 19" />
            <TechBadge name="Next.js 15" />
            <TechBadge name="TypeScript" />
            <TechBadge name="IndexedDB" />
            <TechBadge name="PWA" />
            <TechBadge name="Tailwind CSS" />
          </div>
          <div className="text-center mt-8">
            <a
              href="https://github.com/VillePajala/MatchOps-Local"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-dark text-sm font-semibold"
            >
              {t('home.technical.viewSource')}
            </a>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-br from-primary to-primary-dark text-white">
        <div className="container-custom text-center">
          <h2 className="text-4xl font-bold mb-4">
            {t('home.cta.title')}
          </h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            {t('home.cta.subtitle')}
          </p>
          <a
            href="https://matchops.app"
            className="btn bg-white text-primary hover:bg-gray-100 text-lg px-8 py-4"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('home.cta.getStarted')}
          </a>
          <p className="text-sm mt-4 opacity-75">
            {t('home.cta.disclaimer')}
          </p>
        </div>
      </section>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', ['common'])),
  },
});
