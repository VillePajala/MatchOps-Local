import Layout from '@/components/Layout';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetStaticProps } from 'next';

export default function TechnicalPage() {
  const { t } = useTranslation('common');
  const router = useRouter();

  return (
    <Layout>
      <Head>
        <title>{t('seo.technical.title')}</title>
        <meta name="description" content={t('seo.technical.description')} />
        <meta property="og:title" content={t('seo.technical.title')} />
        <meta property="og:description" content={t('seo.technical.description')} />
        <meta property="og:url" content={`https://www.match-ops.com${router.locale === 'en' ? '/en' : ''}/technical`} />
      </Head>

      {/* Hero */}
      <section className="section bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
              {t('technical.hero.title')}
            </h1>
            <p className="text-xl text-slate-300">
              {t('technical.hero.subtitle')}
            </p>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('technical.techStack.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.techStack.frontend')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.techStack.frontendDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.techStack.language')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.techStack.languageDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.techStack.styling')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.techStack.stylingDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.techStack.storage')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.techStack.storageDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.techStack.stateManagement')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.techStack.stateManagementDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.techStack.pwa')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.techStack.pwaDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700 md:col-span-2">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.techStack.i18n')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.techStack.i18nDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('technical.architecture.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.architecture.localFirst')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.architecture.localFirstDesc')}
                </p>
              </div>
              <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.architecture.offlineFirst')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.architecture.offlineFirstDesc')}
                </p>
              </div>
              <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.architecture.singleUser')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.architecture.singleUserDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture Deep Dive */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('technical.architectureDetails.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.architectureDetails.componentPattern')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.architectureDetails.componentPatternDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.architectureDetails.stateFlow')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.architectureDetails.stateFlowDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.architectureDetails.dataLayer')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.architectureDetails.dataLayerDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.architectureDetails.errorHandling')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.architectureDetails.errorHandlingDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PWA Features */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('technical.pwaFeatures.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.pwaFeatures.installable')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.pwaFeatures.installableDesc')}
                </p>
              </div>
              <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.pwaFeatures.offline')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.pwaFeatures.offlineDesc')}
                </p>
              </div>
              <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.pwaFeatures.autoUpdate')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.pwaFeatures.autoUpdateDesc')}
                </p>
              </div>
              <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.pwaFeatures.wakeLock')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.pwaFeatures.wakeLockDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Data Management */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('technical.dataFeatures.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.dataFeatures.migration')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.dataFeatures.migrationDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.dataFeatures.backup')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.dataFeatures.backupDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.dataFeatures.memory')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.dataFeatures.memoryDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Code Quality */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('technical.codeQuality.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.codeQuality.typescript')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.codeQuality.typescriptDesc')}
                </p>
              </div>
              <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.codeQuality.testing')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.codeQuality.testingDesc')}
                </p>
              </div>
              <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.codeQuality.linting')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.codeQuality.lintingDesc')}
                </p>
              </div>
              <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-2">
                  {t('technical.codeQuality.cicd')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.codeQuality.cicdDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Accessibility & UX */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('technical.accessibility.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.accessibility.wcag')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.accessibility.wcagDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.accessibility.i18n')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.accessibility.i18nDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.accessibility.mobile')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.accessibility.mobileDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Developer Setup */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('technical.devSetup.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                <h3 className="text-sm font-semibold text-primary mb-2">
                  {t('technical.devSetup.install')}
                </h3>
                <code className="block text-sm text-slate-300 bg-slate-900/50 p-3 rounded font-mono">
                  {t('technical.devSetup.installCmd')}
                </code>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                <h3 className="text-sm font-semibold text-primary mb-2">
                  {t('technical.devSetup.dev')}
                </h3>
                <code className="block text-sm text-slate-300 bg-slate-900/50 p-3 rounded font-mono">
                  {t('technical.devSetup.devCmd')}
                </code>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                <h3 className="text-sm font-semibold text-primary mb-2">
                  {t('technical.devSetup.test')}
                </h3>
                <code className="block text-sm text-slate-300 bg-slate-900/50 p-3 rounded font-mono">
                  {t('technical.devSetup.testCmd')}
                </code>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                <h3 className="text-sm font-semibold text-primary mb-2">
                  {t('technical.devSetup.build')}
                </h3>
                <code className="block text-sm text-slate-300 bg-slate-900/50 p-3 rounded font-mono">
                  {t('technical.devSetup.buildCmd')}
                </code>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 md:col-span-2">
                <h3 className="text-sm font-semibold text-primary mb-2">
                  {t('technical.devSetup.lint')}
                </h3>
                <code className="block text-sm text-slate-300 bg-slate-900/50 p-3 rounded font-mono overflow-x-auto">
                  {t('technical.devSetup.lintCmd')}
                </code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Storage & Data */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('technical.storage.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.storage.deviceStorage')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.storage.deviceStorageDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.storage.dataScale')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.storage.dataScaleDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.storage.backup')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.storage.backupDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.storage.privacy')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.storage.privacyDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* System Requirements */}
      <section className="section section-divider bg-slate-900">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('technical.requirements.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.requirements.browser')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.requirements.browserList')}
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.requirements.javascript')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.requirements.javascriptDesc')}
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.requirements.storageSupport')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.requirements.storageSupportDesc')}
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.requirements.storageSpace')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.requirements.storageSpaceDesc')}
                </p>
              </div>
              <div className="md:col-span-2">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.requirements.privateMode')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.requirements.privateModeDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Performance */}
      <section className="section section-divider bg-slate-800/50">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">
              {t('technical.performance.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.performance.responseTime')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.performance.responseTimeDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.performance.offline')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.performance.offlineDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.performance.battery')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.performance.batteryDesc')}
                </p>
              </div>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-bold text-primary mb-2">
                  {t('technical.performance.bundleSize')}
                </h3>
                <p className="text-slate-300">
                  {t('technical.performance.bundleSizeDesc')}
                </p>
              </div>
            </div>
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
