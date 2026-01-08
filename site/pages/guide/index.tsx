import Link from 'next/link';
import Head from 'next/head';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';
import Layout from '@/components/Layout';
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
        <title>{t('landing.title')} - MatchOps Local</title>
        <meta name="description" content={t('landing.subtitle')} />
      </Head>

      <div className="min-h-screen bg-slate-900">
        {/* Hero Section */}
        <section className="py-12 md:py-16 bg-gradient-to-b from-slate-800 to-slate-900">
          <div className="container-custom">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
                {t('landing.title')}
              </h1>
              <p className="text-lg md:text-xl text-slate-300">
                {t('landing.subtitle')}
              </p>
            </div>
          </div>
        </section>

        {/* Structure Explanation */}
        <section className="py-8 border-b border-slate-800">
          <div className="container-custom">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-xl font-semibold text-white mb-3">
                {t('landing.structureIntro')}
              </h2>
              <p className="text-slate-400">
                {t('landing.structureExplanation')}
              </p>
            </div>
          </div>
        </section>

        {/* Main Paths - Highlighted */}
        <section className="py-12">
          <div className="container-custom">
            <h2 className="text-lg font-semibold text-slate-300 mb-6 text-center">
              {t('landing.mainPaths')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {mainPaths.map((section) => {
                const Icon = section.icon;

                return (
                  <Link
                    key={section.slug}
                    href={`/guide/${section.slug}`}
                    className="group block p-8 rounded-xl bg-gradient-to-br from-slate-800 to-slate-800/50 border-2 border-primary/30 hover:border-primary/60 hover:from-slate-800/80 hover:to-slate-700/50 transition-all"
                  >
                    <div className="flex items-start gap-5">
                      <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                        <Icon className="w-7 h-7 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-semibold text-white group-hover:text-primary transition-colors mb-2">
                          {getTitle(section)}
                        </h3>
                        <p className="text-slate-400">
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
        <section className="py-12 border-t border-slate-800">
          <div className="container-custom">
            <h2 className="text-lg font-semibold text-slate-300 mb-6 text-center">
              {t('landing.referenceGuides')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
              {referenceGuides.map((section) => {
                const Icon = section.icon;

                return (
                  <Link
                    key={section.slug}
                    href={`/guide/${section.slug}`}
                    className="group block p-5 rounded-lg bg-slate-800/30 border border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                        <Icon className="w-5 h-5 text-slate-400 group-hover:text-primary transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-medium text-white group-hover:text-primary transition-colors mb-1">
                          {getTitle(section)}
                        </h3>
                        <p className="text-sm text-slate-500 line-clamp-2">
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
