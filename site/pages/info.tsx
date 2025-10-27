import Layout from '@/components/Layout';
import Image from 'next/image';
import { FaCheckCircle, FaFutbol, FaClock, FaChartLine, FaDatabase, FaMobileAlt, FaDownload } from 'react-icons/fa';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';

export default function InfoPage() {
  const { t } = useTranslation('common');

  return (
    <Layout>
      {/* What Is This? */}
      <section className="py-16 md:py-20 bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
              {t('info.whatIsThis.title')}
            </h1>
            <p className="text-xl text-slate-200 mb-4 leading-relaxed">
              {t('info.whatIsThis.description')}
            </p>
            <p className="text-lg text-slate-300 mb-12">
              {t('info.whatIsThis.oneLine')}
            </p>

            {/* Hero Screenshot */}
            <div className="rounded-xl overflow-hidden border border-slate-700 shadow-xl">
              <Image
                src="/screenshots/StatsModalappInHandAtSoccerField.png"
                alt="Coach using MatchOps Local at soccer field"
                width={800}
                height={600}
                className="w-full h-auto"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* The Coach's Challenge */}
      <section className="py-16 bg-slate-800/50">
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
            </div>
          </div>
        </div>
      </section>

      {/* What You Can Do */}
      <section className="py-16 bg-slate-900">
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
              <ul className="space-y-3">
                <li className="flex gap-3 items-start text-slate-200">
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                  <span>{t('info.whatYouCanDo.beforeGame.item1')}</span>
                </li>
                <li className="flex gap-3 items-start text-slate-200">
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                  <span>{t('info.whatYouCanDo.beforeGame.item2')}</span>
                </li>
                <li className="flex gap-3 items-start text-slate-200">
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                  <span>{t('info.whatYouCanDo.beforeGame.item3')}</span>
                </li>
                <li className="flex gap-3 items-start text-slate-200">
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                  <span>{t('info.whatYouCanDo.beforeGame.item4')}</span>
                </li>
              </ul>
            </div>

            {/* During the Game */}
            <div className="mb-12">
              <h3 className="text-xl font-bold text-indigo-400 mb-4">
                {t('info.whatYouCanDo.duringGame.title')}
              </h3>
              <ul className="space-y-3">
                <li className="flex gap-3 items-start text-slate-200">
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                  <span>{t('info.whatYouCanDo.duringGame.item1')}</span>
                </li>
                <li className="flex gap-3 items-start text-slate-200">
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                  <span>{t('info.whatYouCanDo.duringGame.item2')}</span>
                </li>
                <li className="flex gap-3 items-start text-slate-200">
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                  <span>{t('info.whatYouCanDo.duringGame.item3')}</span>
                </li>
                <li className="flex gap-3 items-start text-slate-200">
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                  <span>{t('info.whatYouCanDo.duringGame.item4')}</span>
                </li>
                <li className="flex gap-3 items-start text-slate-200">
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                  <span>{t('info.whatYouCanDo.duringGame.item5')}</span>
                </li>
                <li className="flex gap-3 items-start text-slate-200">
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                  <span>{t('info.whatYouCanDo.duringGame.item6')}</span>
                </li>
              </ul>
            </div>

            {/* After the Game */}
            <div>
              <h3 className="text-xl font-bold text-green-400 mb-4">
                {t('info.whatYouCanDo.afterGame.title')}
              </h3>
              <ul className="space-y-3">
                <li className="flex gap-3 items-start text-slate-200">
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                  <span>{t('info.whatYouCanDo.afterGame.item1')}</span>
                </li>
                <li className="flex gap-3 items-start text-slate-200">
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                  <span>{t('info.whatYouCanDo.afterGame.item2')}</span>
                </li>
                <li className="flex gap-3 items-start text-slate-200">
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                  <span>{t('info.whatYouCanDo.afterGame.item3')}</span>
                </li>
                <li className="flex gap-3 items-start text-slate-200">
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                  <span>{t('info.whatYouCanDo.afterGame.item4')}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('info.howItWorks.title')}
            </h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold">1</div>
                <div>
                  <p className="text-lg text-slate-200">{t('info.howItWorks.step1')}</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold">2</div>
                <div>
                  <p className="text-lg text-slate-200">{t('info.howItWorks.step2')}</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold">3</div>
                <div>
                  <p className="text-lg text-slate-200">{t('info.howItWorks.step3')}</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold">4</div>
                <div>
                  <p className="text-lg text-slate-200">{t('info.howItWorks.step4')}</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold">5</div>
                <div>
                  <p className="text-lg text-slate-200">{t('info.howItWorks.step5')}</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold">6</div>
                <div>
                  <p className="text-lg text-slate-200">{t('info.howItWorks.step6')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Reference */}
      <section className="py-16 bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('info.features.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex gap-3 items-start">
                <FaFutbol className="text-primary mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-white mb-1">{t('info.features.feature1.title')}</h4>
                  <p className="text-sm text-slate-300">{t('info.features.feature1.desc')}</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <FaClock className="text-indigo-400 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-white mb-1">{t('info.features.feature2.title')}</h4>
                  <p className="text-sm text-slate-300">{t('info.features.feature2.desc')}</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <FaChartLine className="text-green-400 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-white mb-1">{t('info.features.feature3.title')}</h4>
                  <p className="text-sm text-slate-300">{t('info.features.feature3.desc')}</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <FaDatabase className="text-blue-400 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-white mb-1">{t('info.features.feature4.title')}</h4>
                  <p className="text-sm text-slate-300">{t('info.features.feature4.desc')}</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <FaMobileAlt className="text-purple-400 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-white mb-1">{t('info.features.feature5.title')}</h4>
                  <p className="text-sm text-slate-300">{t('info.features.feature5.desc')}</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <FaDownload className="text-primary mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-white mb-1">{t('info.features.feature6.title')}</h4>
                  <p className="text-sm text-slate-300">{t('info.features.feature6.desc')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Technical Details */}
      <section className="py-16 bg-slate-800/50">
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
      <section className="py-16 bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('info.faq.title')}
            </h2>
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-bold text-white mb-2">{t('info.faq.q1')}</h4>
                <p className="text-slate-300">{t('info.faq.a1')}</p>
              </div>
              <div>
                <h4 className="text-lg font-bold text-white mb-2">{t('info.faq.q2')}</h4>
                <p className="text-slate-300">{t('info.faq.a2')}</p>
              </div>
              <div>
                <h4 className="text-lg font-bold text-white mb-2">{t('info.faq.q3')}</h4>
                <p className="text-slate-300">{t('info.faq.a3')}</p>
              </div>
              <div>
                <h4 className="text-lg font-bold text-white mb-2">{t('info.faq.q4')}</h4>
                <p className="text-slate-300">{t('info.faq.a4')}</p>
              </div>
              <div>
                <h4 className="text-lg font-bold text-white mb-2">{t('info.faq.q5')}</h4>
                <p className="text-slate-300">{t('info.faq.a5')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Simple CTA */}
      <section className="py-16 bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-2xl mx-auto text-center">
            <a
              href="https://matchops.app"
              className="btn btn-primary text-lg px-10 py-4 inline-block mb-4"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('info.cta.button')}
            </a>
            <p className="text-slate-400">{t('info.cta.subtitle')}</p>
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
