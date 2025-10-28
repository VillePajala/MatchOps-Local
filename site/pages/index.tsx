import Layout from '@/components/Layout';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
// Polished lists now use CSS-based checkmarks via .list-checked
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';

export default function HomePage() {
  const { t } = useTranslation('common');
  const router = useRouter();

  return (
    <Layout>
      <Head>
        <title>{t('seo.home.title')}</title>
        <meta name="description" content={t('seo.home.description')} />
        <meta property="og:title" content={t('seo.home.title')} />
        <meta property="og:description" content={t('seo.home.description')} />
        <meta property="og:url" content={`https://matchops-local.vercel.app${router.locale === 'en' ? '/en' : ''}`} />
      </Head>
      {/* What Is This? */}
      <section className="section bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
              {t('info.whatIsThis.title')}
            </h1>
            <div className="prose prose-invert max-w-none">
              <p>
                {t('info.whatIsThis.description')}
              </p>
              <p>
                {t('info.whatIsThis.oneLine')}
              </p>
            </div>

            {/* Hero Screenshot */}
            <div className="screenshot-frame mt-8">
              <Image
                src="/screenshots/StatsModalappInHandAtSoccerField.png"
                alt="Coach using MatchOps Local at soccer field"
                width={800}
                height={600}
                sizes="(max-width: 900px) 100vw, 800px"
                className="w-full h-auto"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* The Coach's Challenge */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('info.challenges.title')}
            </h2>
            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-lg text-slate-200">{t('info.challenges.challenge1')}</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-lg text-slate-200">{t('info.challenges.challenge2')}</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-lg text-slate-200">{t('info.challenges.challenge3')}</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-lg text-slate-200">{t('info.challenges.challenge4')}</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-lg text-slate-200">{t('info.challenges.challenge5')}</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-lg text-slate-200">{t('info.challenges.challenge6')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What You Can Do */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-12">
              {t('info.whatYouCanDo.title')}
            </h2>

            {/* Before the Game */}
            <div className="mb-12">
              <h3 className="text-xl font-bold text-primary mb-4">
                {t('info.whatYouCanDo.beforeGame.title')}
              </h3>
              <ul className="list-checked space-y-3 text-slate-200">
                <li><span>{t('info.whatYouCanDo.beforeGame.item1')}</span></li>
                <li><span>{t('info.whatYouCanDo.beforeGame.item2')}</span></li>
                <li><span>{t('info.whatYouCanDo.beforeGame.item3')}</span></li>
                <li><span>{t('info.whatYouCanDo.beforeGame.item4')}</span></li>
              </ul>
            </div>

            {/* During the Game */}
            <div className="mb-12">
              <h3 className="text-xl font-bold text-indigo-400 mb-4">
                {t('info.whatYouCanDo.duringGame.title')}
              </h3>
              <ul className="list-checked space-y-3 text-slate-200">
                <li><span>{t('info.whatYouCanDo.duringGame.item1')}</span></li>
                <li><span>{t('info.whatYouCanDo.duringGame.item2')}</span></li>
                <li><span>{t('info.whatYouCanDo.duringGame.item3')}</span></li>
                <li><span>{t('info.whatYouCanDo.duringGame.item4')}</span></li>
                <li><span>{t('info.whatYouCanDo.duringGame.item5')}</span></li>
              </ul>
            </div>

            {/* After the Game */}
            <div>
              <h3 className="text-xl font-bold text-green-400 mb-4">
                {t('info.whatYouCanDo.afterGame.title')}
              </h3>
              <ul className="list-checked space-y-3 text-slate-200">
                <li><span>{t('info.whatYouCanDo.afterGame.item1')}</span></li>
                <li><span>{t('info.whatYouCanDo.afterGame.item2')}</span></li>
                <li><span>{t('info.whatYouCanDo.afterGame.item3')}</span></li>
                <li><span>{t('info.whatYouCanDo.afterGame.item4')}</span></li>
                <li><span>{t('info.whatYouCanDo.afterGame.item5')}</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Technical Details */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
              {t('info.technical.title')}
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-lg text-slate-200 mb-4">{t('info.technical.desc1')}</p>
              <p className="text-lg text-slate-200 mb-4">{t('info.technical.desc2')}</p>
              <p className="text-lg text-slate-200">{t('info.technical.desc3')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Common Questions */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('info.faq.title')}
            </h2>
            <div className="space-y-4 prose prose-invert max-w-none">
              {(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const).map((key) => (
                <details key={key} className="group rounded-lg border border-slate-700 bg-slate-800/40 p-4">
                  <summary className="cursor-pointer list-none text-white font-semibold">
                    {t(`info.faq.${key}`)}
                  </summary>
                  <div className="mt-2 text-slate-300">
                    {t(`info.faq.a${key.slice(1)}`)}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Limited Testing Notice */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-2xl mx-auto text-center">
            <h3 className="text-2xl font-bold text-white">
              {t('info.cta.title')}
            </h3>
          </div>
        </div>
      </section>
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
