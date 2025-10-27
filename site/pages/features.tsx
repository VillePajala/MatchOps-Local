import Layout from '@/components/Layout';
import FeaturesSections from '@/components/FeaturesSections';
import Head from 'next/head';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';

export default function Features() {
  const { t } = useTranslation('common');
  return (
    <Layout>
      <Head>
        <title>Features — MatchOps-Local</title>
        <meta name="description" content="Interactive field, live timer and event logging, comprehensive stats, tactics, and team/season management — all offline." />
        <meta property="og:title" content="MatchOps-Local — Features" />
        <meta property="og:description" content="All the tools for match day and beyond, fully local-first." />
      </Head>
      {/* Hero */}
      <section className="py-16">
        <div className="container-custom text-center">
          <h1 className="text-5xl font-bold text-white mb-4">
            {t('features.hero.title')}
          </h1>
          <p className="text-xl text-slate-200 max-w-3xl mx-auto">
            {t('features.hero.subtitle')}
          </p>
        </div>
      </section>

      <FeaturesSections />
    </Layout>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', ['common'])),
  },
});
