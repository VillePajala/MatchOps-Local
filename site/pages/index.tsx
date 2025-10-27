import Layout from '@/components/Layout';
import FeatureCard from '@/components/FeatureCard';
import TechBadge from '@/components/TechBadge';
import FeaturesSections from '@/components/FeaturesSections';
import Link from 'next/link';
import Image from 'next/image';
import { FaLock, FaBolt, FaDollarSign, FaWifi, FaChartLine, FaCreditCard, FaServer, FaShieldAlt, FaFutbol, FaClock, FaPencilAlt, FaUsers, FaTrophy } from 'react-icons/fa';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';

export default function Home() {
  const { t } = useTranslation('common');
  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative py-20">
        <div className="container-custom">
          <div className="text-center max-w-4xl mx-auto">
            {/* Logo */}
            <div className="mb-8 flex justify-center">
              <div className="relative h-32 md:h-40 w-32 md:w-40">
                <Image
                  src="/logos/app-logo-yellow.png"
                  alt="MatchOps-Local Logo"
                  fill
                  sizes="(max-width: 768px) 8rem, 10rem"
                  className="object-contain"
                  priority
                />
              </div>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
              {t('home.hero.title')}
            </h1>
            <p className="text-lg md:text-xl text-slate-200 mb-8 leading-relaxed">
              {t('home.hero.subtitle')}
            </p>

            {/* CTA Buttons removed */}

            {/* Hero Visual removed */}

            {/* Hero points removed */}
          </div>
        </div>
      </section>

      {/* Why Local-First section removed as requested */}

      <FeaturesSections />

      {/* Feature Highlights */}
      <section id="features" className="py-20">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              {t('home.features.title')}
            </h2>
            <p className="text-xl text-slate-200 max-w-3xl mx-auto">
              {t('home.features.subtitle')}
            </p>
          </div>

          {/* Feature screenshots removed */}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
              <FaFutbol className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-white">{t('home.features.interactiveFieldTitle')}</h3>
              <p className="text-sm text-slate-200">
                {t('home.features.interactiveFieldDesc')}
              </p>
            </div>
            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
              <FaClock className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-white">{t('home.features.timerTitle')}</h3>
              <p className="text-sm text-slate-200">
                {t('home.features.timerDesc')}
              </p>
            </div>
            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
              <FaChartLine className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-white">{t('home.features.statsTitle')}</h3>
              <p className="text-sm text-slate-200">
                {t('home.features.statsDesc')}
              </p>
            </div>
            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
              <FaPencilAlt className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-white">{t('home.features.tacticsTitle')}</h3>
              <p className="text-sm text-slate-200">
                {t('home.features.tacticsDesc')}
              </p>
            </div>
            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
              <FaUsers className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-white">{t('home.features.multiTeamTitle')}</h3>
              <p className="text-sm text-slate-200">
                {t('home.features.multiTeamDesc')}
              </p>
            </div>
            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
              <FaTrophy className="text-primary text-3xl mb-3" />
              <h3 className="font-bold text-lg mb-2 text-white">{t('home.features.seasonTitle')}</h3>
              <p className="text-sm text-slate-200">
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

      {/* Screenshots Gallery removed */}

      {/* Technical Details Section */}
      <section className="py-16">
        <div className="container-custom">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">
              {t('home.technical.title')}
            </h2>
            <p className="text-slate-200">
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

      {/* Final CTA removed */}
    </Layout>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', ['common'])),
  },
});
