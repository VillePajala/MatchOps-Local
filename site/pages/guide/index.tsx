import Link from 'next/link';
import Head from 'next/head';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';
import Layout from '@/components/Layout';
import { guideSections, type GuideSection } from '@/lib/guide/guideConfig';

export default function GuideLanding() {
  const { t } = useTranslation('guide');
  const { locale } = useRouter();

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

        {/* Section Cards */}
        <section className="py-12">
          <div className="container-custom">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {guideSections.map((section) => {
                const Icon = section.icon;

                return (
                  <Link
                    key={section.slug}
                    href={`/guide/${section.slug}`}
                    className="group block p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:bg-slate-800 hover:border-slate-600 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-semibold text-white group-hover:text-primary transition-colors mb-2">
                          {getTitle(section)}
                        </h2>
                        <p className="text-sm text-slate-400 line-clamp-2">
                          {getDescription(section)}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Quick Start CTA */}
            <div className="mt-12 text-center">
              <p className="text-slate-400 mb-4">{t('landing.quickStart')}</p>
              <Link
                href="/guide/getting-started"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-slate-900 font-semibold rounded-lg transition-colors"
              >
                {t('landing.startButton')}
                <span aria-hidden="true">→</span>
              </Link>
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
