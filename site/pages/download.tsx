import Layout from '@/components/Layout';
import Head from 'next/head';
import { FaChrome, FaFirefox, FaSafari, FaEdge, FaMobileAlt, FaDesktop, FaCheckCircle, FaQuestionCircle } from 'react-icons/fa';
import { useTranslation, Trans } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';

export default function Download() {
  const { t } = useTranslation('common');
  return (
    <Layout>
      <Head>
        <title>Download — MatchOps-Local</title>
        <meta name="description" content="Open in your browser and optionally install as a PWA. iOS Safari and Android Chrome supported, plus desktop browsers." />
        <meta property="og:title" content="MatchOps-Local — Download" />
        <meta property="og:description" content="Install steps for mobile and desktop. Works fully offline after first load." />
      </Head>
      {/* Hero */}
      <section className="py-16">
        <div className="container-custom text-center">
          <h1 className="text-5xl font-bold text-white mb-4">
            {t('download.hero.title')}
          </h1>
          <p className="text-xl text-slate-200 max-w-3xl mx-auto">
            {t('download.hero.subtitle')}
          </p>
        </div>
      </section>

      {/* Installation Steps */}
      <section className="py-20">
        <div className="container-custom max-w-4xl">
          <div className="space-y-12">
            {/* Step 1 */}
            <div className="flex items-start space-x-6">
              <div className="flex-shrink-0 w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white text-2xl font-bold">
                1
              </div>
              <div>
                <h2 className="text-3xl font-bold text-white mb-3">
                  {t('download.step1.title')}
                </h2>
                <p className="text-lg text-slate-200 mb-4">
                  <Trans i18nKey="download.step1.description" components={{
                    1: <a href="https://matchops.app" className="text-primary hover:underline font-semibold" target="_blank" rel="noopener noreferrer" />
                  }} />
                </p>
                <a
                  href="https://matchops.app"
                  className="btn btn-primary inline-block"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('download.step1.button')}
                </a>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start space-x-6">
              <div className="flex-shrink-0 w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white text-2xl font-bold">
                2
              </div>
              <div>
                <h2 className="text-3xl font-bold text-white mb-3">
                  {t('download.step2.title')}
                </h2>
                <p className="text-lg text-slate-200 mb-4">
                  {t('download.step2.description')}
                </p>
                <div className="space-y-4">
                  <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
                    <div className="flex items-center mb-3">
                      <FaMobileAlt className="text-primary text-2xl mr-3" />
                      <h3 className="font-bold text-white">{t('download.step2.mobileTitle')}</h3>
                    </div>
                    <ul className="space-y-2 text-slate-200">
                      <li className="flex items-start">
                        <FaCheckCircle className="text-green-500 mr-2 mt-1 flex-shrink-0" />
                        <span><strong>iOS Safari:</strong> Tap the Share button, then &quot;Add to Home Screen&quot;</span>
                      </li>
                      <li className="flex items-start">
                        <FaCheckCircle className="text-green-500 mr-2 mt-1 flex-shrink-0" />
                        <span><strong>Android Chrome:</strong> Tap the menu (⋮), then &quot;Install App&quot; or &quot;Add to Home Screen&quot;</span>
                      </li>
                    </ul>
                  </div>
                  <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
                    <div className="flex items-center mb-3">
                      <FaDesktop className="text-primary text-2xl mr-3" />
                      <h3 className="font-bold text-white">{t('download.step2.desktopTitle')}</h3>
                    </div>
                    <ul className="space-y-2 text-slate-200">
                      <li className="flex items-start">
                        <FaCheckCircle className="text-green-500 mr-2 mt-1 flex-shrink-0" />
                        <span><strong>Chrome/Edge:</strong> Look for the install icon (⊕) in the address bar, or open menu → &quot;Install MatchOps-Local&quot;</span>
                      </li>
                      <li className="flex items-start">
                        <FaCheckCircle className="text-green-500 mr-2 mt-1 flex-shrink-0" />
                        <span><strong>Firefox:</strong> Click the install prompt that appears, or check the address bar for install option</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start space-x-6">
              <div className="flex-shrink-0 w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white text-2xl font-bold">
                3
              </div>
              <div>
                <h2 className="text-3xl font-bold text-white mb-3">
                  {t('download.step3.title')}
                </h2>
                <p className="text-lg text-slate-200 mb-4">
                  {t('download.step3.description')}
                </p>
                <ul className="space-y-2 text-slate-200">
                  <li className="flex items-start">
                    <FaCheckCircle className="text-green-500 mr-2 mt-1" />
                    <span>{t('download.step3.point1')}</span>
                  </li>
                  <li className="flex items-start">
                    <FaCheckCircle className="text-green-500 mr-2 mt-1" />
                    <span>{t('download.step3.point2')}</span>
                  </li>
                  <li className="flex items-start">
                    <FaCheckCircle className="text-green-500 mr-2 mt-1" />
                    <span>{t('download.step3.point3')}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Browser Support */}
      <section className="py-20">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              {t('download.browserSupport.title')}
            </h2>
            <p className="text-lg text-slate-200">
              {t('download.browserSupport.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4 text-center">
              <FaChrome className="text-5xl text-blue-500 mx-auto mb-3" />
              <h3 className="font-bold text-white mb-1">{t('download.browserSupport.chrome')}</h3>
              <p className="text-sm text-slate-200">90+</p>
            </div>
            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4 text-center">
              <FaFirefox className="text-5xl text-orange-500 mx-auto mb-3" />
              <h3 className="font-bold text-white mb-1">{t('download.browserSupport.firefox')}</h3>
              <p className="text-sm text-slate-200">88+</p>
            </div>
            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4 text-center">
              <FaSafari className="text-5xl text-blue-400 mx-auto mb-3" />
              <h3 className="font-bold text-white mb-1">{t('download.browserSupport.safari')}</h3>
              <p className="text-sm text-slate-200">14+</p>
            </div>
            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4 text-center">
              <FaEdge className="text-5xl text-blue-600 mx-auto mb-3" />
              <h3 className="font-bold text-white mb-1">{t('download.browserSupport.edge')}</h3>
              <p className="text-sm text-slate-200">90+</p>
            </div>
          </div>
        </div>
      </section>

      {/* System Requirements */}
      <section className="py-20">
        <div className="container-custom max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              {t('download.systemRequirements.title')}
            </h2>
          </div>

          <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
            <ul className="space-y-4 text-slate-200">
              <li className="flex items-start">
                <FaCheckCircle className="text-green-500 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <strong className="text-white">Modern Web Browser:</strong>
                  <span className="text-slate-200"> Chrome 90+, Firefox 88+, Safari 14+, or Edge 90+</span>
                </div>
              </li>
              <li className="flex items-start">
                <FaCheckCircle className="text-green-500 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <strong className="text-white">JavaScript Enabled:</strong>
                  <span className="text-slate-200"> Standard for all modern browsers</span>
                </div>
              </li>
              <li className="flex items-start">
                <FaCheckCircle className="text-green-500 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <strong className="text-white">IndexedDB Support:</strong>
                  <span className="text-slate-200"> Available in all supported browsers</span>
                </div>
              </li>
              <li className="flex items-start">
                <FaCheckCircle className="text-green-500 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <strong className="text-white">Storage Space:</strong>
                  <span className="text-slate-200"> ~50MB available (typical usage is much less)</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20">
        <div className="container-custom max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              {t('download.faq.title')}
            </h2>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
              <div className="flex items-start">
                <FaQuestionCircle className="text-primary text-xl mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg text-white mb-2">
                    {t('download.faq.q1')}
                  </h3>
                  <p className="text-slate-200">
                    {t('download.faq.a1')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
              <div className="flex items-start">
                <FaQuestionCircle className="text-primary text-xl mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg text-white mb-2">
                    {t('download.faq.q2')}
                  </h3>
                  <p className="text-slate-200">
                    {t('download.faq.a2')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
              <div className="flex items-start">
                <FaQuestionCircle className="text-primary text-xl mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg text-white mb-2">
                    {t('download.faq.q3')}
                  </h3>
                  <p className="text-slate-200">
                    {t('download.faq.a3')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
              <div className="flex items-start">
                <FaQuestionCircle className="text-primary text-xl mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg text-white mb-2">
                    {t('download.faq.q4')}
                  </h3>
                  <p className="text-slate-200">
                    {t('download.faq.a4')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
              <div className="flex items-start">
                <FaQuestionCircle className="text-primary text-xl mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-lg text-white mb-2">
                    {t('download.faq.q5')}
                  </h3>
                  <p className="text-slate-200">
                    {t('download.faq.a5')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-primary to-primary-dark text-white">
        <div className="container-custom text-center">
          <h2 className="text-4xl font-bold mb-4">
            {t('download.cta.title')}
          </h2>
          <p className="text-xl mb-8 opacity-90">
            {t('download.cta.subtitle')}
          </p>
          <a
            href="https://matchops.app"
            className="btn bg-white text-primary hover:bg-gray-100 text-lg px-8 py-4"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('download.cta.button')}
          </a>
          <p className="text-sm mt-4 opacity-75">
            {t('download.cta.disclaimer')}
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
