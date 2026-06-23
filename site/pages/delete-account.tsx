import Layout from '@/components/Layout';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';

export default function DeleteAccountPage() {
  const { t } = useTranslation('common');
  const router = useRouter();

  return (
    <Layout>
      <Head>
        <title>{t('seo.deleteAccount.title')}</title>
        <meta name="description" content={t('seo.deleteAccount.description')} />
        <meta property="og:title" content={t('seo.deleteAccount.title')} />
        <meta property="og:description" content={t('seo.deleteAccount.description')} />
        <meta property="og:url" content={`https://www.match-ops.com${router.locale === 'en' ? '/en' : ''}/delete-account`} />
      </Head>

      <div className="section bg-slate-900">
        <div className="container-custom">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold mb-2">{t('deleteAccount.title')}</h1>
            <p className="text-slate-300 mb-8">{t('deleteAccount.intro')}</p>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('deleteAccount.inAppTitle')}</h2>
              <ol className="list-decimal list-inside text-slate-300 space-y-1 mb-3">
                <li>{t('deleteAccount.step1')}</li>
                <li>{t('deleteAccount.step2')}</li>
                <li>{t('deleteAccount.step3')}</li>
              </ol>
              <p className="text-slate-300">{t('deleteAccount.inAppNote')}</p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('deleteAccount.whatTitle')}</h2>
              <p className="text-slate-300">{t('deleteAccount.whatContent')}</p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('deleteAccount.keepTitle')}</h2>
              <p className="text-slate-300">{t('deleteAccount.keepContent')}</p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('deleteAccount.cantAccessTitle')}</h2>
              <p className="text-slate-300">
                {t('deleteAccount.cantAccessContent')}{' '}
                <a href="mailto:support@match-ops.com" className="text-indigo-400 hover:underline">
                  support@match-ops.com
                </a>
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('deleteAccount.timelineTitle')}</h2>
              <p className="text-slate-300">{t('deleteAccount.timelineContent')}</p>
            </section>

            <p className="text-slate-500 text-sm">
              <Link href="/privacy" className="text-indigo-400 hover:underline">{t('privacyPolicy.title')}</Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale || 'en', ['common'])),
    },
  };
};
