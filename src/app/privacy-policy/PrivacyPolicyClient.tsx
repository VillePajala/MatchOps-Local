'use client';

import { useTranslation } from 'react-i18next';
import Link from 'next/link';

export function PrivacyPolicyClient() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">{t('privacyPolicy.title')}</h1>
        <p className="text-slate-400 mb-8">{t('privacyPolicy.lastUpdated')}</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.overview.title')}</h2>
          <p className="text-slate-300">{t('privacyPolicy.overview.content')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.dataStorage.title')}</h2>
          <h3 className="text-lg font-medium mb-2 text-slate-300">{t('privacyPolicy.dataStorage.localDataTitle')}</h3>
          <p className="text-slate-300 mb-3">{t('privacyPolicy.dataStorage.localDataIntro')}</p>
          <ul className="list-disc list-inside text-slate-300 mb-4 space-y-1">
            <li>{t('privacyPolicy.dataStorage.localDataItems.playerRosters')}</li>
            <li>{t('privacyPolicy.dataStorage.localDataItems.gameRecords')}</li>
            <li>{t('privacyPolicy.dataStorage.localDataItems.settings')}</li>
            <li>{t('privacyPolicy.dataStorage.localDataItems.seasonData')}</li>
          </ul>
          <p className="text-slate-300 font-medium mb-4">{t('privacyPolicy.dataStorage.localDataNote')}</p>
          <h3 className="text-lg font-medium mb-2 text-slate-300">{t('privacyPolicy.dataStorage.noAccountTitle')}</h3>
          <p className="text-slate-300">{t('privacyPolicy.dataStorage.noAccountContent')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.dataWeCollect.title')}</h2>
          <h3 className="text-lg font-medium mb-2 text-slate-300">{t('privacyPolicy.dataWeCollect.errorReportingTitle')}</h3>
          <p className="text-slate-300 mb-2">{t('privacyPolicy.dataWeCollect.errorReportingIntro')}</p>
          <ul className="list-disc list-inside text-slate-300 mb-3 space-y-1">
            <li>{t('privacyPolicy.dataWeCollect.errorReportingItems.errorType')}</li>
            <li>{t('privacyPolicy.dataWeCollect.errorReportingItems.deviceType')}</li>
            <li>{t('privacyPolicy.dataWeCollect.errorReportingItems.appVersion')}</li>
            <li>{t('privacyPolicy.dataWeCollect.errorReportingItems.sessionInfo')}</li>
          </ul>
          <p className="text-slate-300 mb-4">{t('privacyPolicy.dataWeCollect.errorReportingNote')}</p>
          <h3 className="text-lg font-medium mb-2 text-slate-300">{t('privacyPolicy.dataWeCollect.licenseValidationTitle')}</h3>
          <p className="text-slate-300">{t('privacyPolicy.dataWeCollect.licenseValidationContent')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.dataWeDoNotCollect.title')}</h2>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>{t('privacyPolicy.dataWeDoNotCollect.items.playerNames')}</li>
            <li>{t('privacyPolicy.dataWeDoNotCollect.items.gameContent')}</li>
            <li>{t('privacyPolicy.dataWeDoNotCollect.items.location')}</li>
            <li>{t('privacyPolicy.dataWeDoNotCollect.items.photos')}</li>
            <li>{t('privacyPolicy.dataWeDoNotCollect.items.contacts')}</li>
            <li>{t('privacyPolicy.dataWeDoNotCollect.items.deviceIds')}</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.thirdPartyServices.title')}</h2>
          <div className="space-y-3 text-slate-300">
            <p>
              <strong>{t('privacyPolicy.thirdPartyServices.googlePlay')}</strong> - {t('privacyPolicy.thirdPartyServices.googlePlayDesc')}{' '}
              <a href="https://policies.google.com/privacy" className="text-indigo-400 hover:underline">
                Google&apos;s Privacy Policy
              </a>
            </p>
            <p>
              <strong>{t('privacyPolicy.thirdPartyServices.sentry')}</strong> - {t('privacyPolicy.thirdPartyServices.sentryDesc')}{' '}
              <a href="https://sentry.io/privacy/" className="text-indigo-400 hover:underline">
                Sentry&apos;s Privacy Policy
              </a>
            </p>
            <p>
              <strong>{t('privacyPolicy.thirdPartyServices.vercel')}</strong> - {t('privacyPolicy.thirdPartyServices.vercelDesc')}{' '}
              <a href="https://vercel.com/legal/privacy-policy" className="text-indigo-400 hover:underline">
                Vercel&apos;s Privacy Policy
              </a>
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.yourRights.title')}</h2>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li><strong>{t('privacyPolicy.yourRights.export')}</strong></li>
            <li><strong>{t('privacyPolicy.yourRights.delete')}</strong></li>
            <li><strong>{t('privacyPolicy.yourRights.contactUs')}</strong></li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.childrensPrivacy.title')}</h2>
          <p className="text-slate-300">{t('privacyPolicy.childrensPrivacy.content')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.dataSecurity.title')}</h2>
          <p className="text-slate-300 mb-2">{t('privacyPolicy.dataSecurity.intro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>{t('privacyPolicy.dataSecurity.items.encryption')}</li>
            <li>{t('privacyPolicy.dataSecurity.items.localStorage')}</li>
            <li>{t('privacyPolicy.dataSecurity.items.noTransmission')}</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.changes.title')}</h2>
          <p className="text-slate-300">{t('privacyPolicy.changes.content')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.contact.title')}</h2>
          <p className="text-slate-300">{t('privacyPolicy.contact.intro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>
              {t('privacyPolicy.contact.email')}:{' '}
              <a href="mailto:valoraami@gmail.com" className="text-indigo-400 hover:underline">
                valoraami@gmail.com
              </a>
            </li>
            <li>
              {t('privacyPolicy.contact.github')}:{' '}
              <a
                href="https://github.com/VillePajala/MatchOps-Local/issues"
                className="text-indigo-400 hover:underline"
              >
                github.com/VillePajala/MatchOps-Local/issues
              </a>
            </li>
          </ul>
        </section>

        <hr className="border-slate-700 my-8" />
        <p className="text-slate-500 text-sm italic">{t('privacyPolicy.footer')}</p>

        <div className="mt-8">
          <Link href="/" className="text-indigo-400 hover:underline">
            ← {t('common.backButton')}
          </Link>
        </div>
      </div>
    </div>
  );
}
