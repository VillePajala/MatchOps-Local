import Link from 'next/link';
import Head from 'next/head';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';
import Layout from '@/components/Layout';
import { GlowBg } from '@/components/marketing';
import {
  getMainPaths,
  getReferenceGuides,
  type GuideSection,
} from '@/lib/guide/guideConfig';

export default function GuideLanding() {
  const { t } = useTranslation('guide');
  const { locale } = useRouter();

  const mainPaths = getMainPaths();
  const referenceGuides = getReferenceGuides();

  const getTitle = (section: GuideSection) => {
    return locale === 'fi' ? section.titleFi : section.title;
  };

  const getDescription = (section: GuideSection) => {
    return locale === 'fi' ? section.descriptionFi : section.description;
  };

  return (
    <Layout>
      <Head>
        <title>{t('landing.title')} - MatchOps</title>
        <meta name="description" content={t('landing.subtitle')} />
      </Head>

      <div className="min-h-screen bg-slate-900">
        {/* Hero Section */}
        <section className="py-16 md:py-24 relative overflow-hidden bg-gradient-to-b from-slate-800/50 to-slate-900">
          {/* Ambient glow effects */}
          <div className="hidden md:block">
            <GlowBg color="primary" position="top-right" size="md" blur={150} />
            <GlowBg color="amber" position="bottom-left" size="sm" blur={130} />
          </div>
          <div className="container-custom relative z-10">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                <span className="text-primary">MatchOps</span>{' '}
                <span className="text-white">{t('landing.title')}</span>
              </h1>
              <p className="text-lg md:text-xl text-slate-300 mb-8">
                {t('landing.subtitle')}
              </p>
              <p className="text-slate-400 max-w-2xl mx-auto">
                {t('landing.structureExplanation')}
              </p>
            </div>
          </div>
        </section>

        {/* Main Paths - Highlighted */}
        <section className="py-12">
          <div className="container-custom">
            <h2 className="text-primary text-sm font-semibold mb-2 text-center">{t('landing.mainPaths')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {mainPaths.map((section) => {
                const Icon = section.icon;

                return (
                  <Link
                    key={section.slug}
                    href={`/guide/${section.slug}`}
                    className="group block p-6 md:p-8 rounded-lg bg-gradient-to-br from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-white group-hover:text-primary transition-colors mb-2">
                          {getTitle(section)}
                        </h3>
                        <p className="text-gray-400">
                          {getDescription(section)}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Reference Guides */}
        <section className="py-12">
          <div className="container-custom">
            <h2 className="text-primary text-sm font-semibold mb-2 text-center">
              {t('landing.referenceGuides')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
              {referenceGuides.map((section) => {
                const Icon = section.icon;

                return (
                  <Link
                    key={section.slug}
                    href={`/guide/${section.slug}`}
                    className="group block p-5 rounded-lg bg-gradient-to-br from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-white group-hover:text-primary transition-colors mb-1">
                          {getTitle(section)}
                        </h3>
                        <p className="text-sm text-gray-400 line-clamp-2">
                          {getDescription(section)}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale || 'en', ['common', 'guide'])),
    },
  };
};
