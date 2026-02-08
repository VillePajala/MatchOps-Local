'use client';

import { useTranslation } from 'react-i18next';

export function PrivacyPolicyClient() {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-900 text-slate-100 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">{t('privacyPolicy.title')}</h1>
        <p className="text-slate-400 mb-1">{t('privacyPolicy.lastUpdated')}</p>
        <p className="text-slate-500 text-sm mb-8">{t('privacyPolicy.version')}</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.dataController.title')}</h2>
          <p className="text-slate-300">{t('privacyPolicy.dataController.content')}</p>
        </section>

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
            <li>{t('privacyPolicy.dataStorage.localDataItems.personnelInfo')}</li>
          </ul>
          <p className="text-slate-300 font-medium mb-4">{t('privacyPolicy.dataStorage.localDataNote')}</p>
          <h3 className="text-lg font-medium mb-2 text-slate-300">{t('privacyPolicy.dataStorage.noAccountTitle')}</h3>
          <p className="text-slate-300 mb-4">{t('privacyPolicy.dataStorage.noAccountContent')}</p>

          <h3 className="text-lg font-medium mb-2 text-slate-300">{t('privacyPolicy.dataStorage.cloudDataTitle')}</h3>
          <p className="text-slate-300 mb-3">{t('privacyPolicy.dataStorage.cloudDataIntro')}</p>
          <ul className="list-disc list-inside text-slate-300 mb-4 space-y-1">
            <li>{t('privacyPolicy.dataStorage.cloudDataItems.syncedData')}</li>
            <li>{t('privacyPolicy.dataStorage.cloudDataItems.encryption')}</li>
            <li>{t('privacyPolicy.dataStorage.cloudDataItems.rowLevelSecurity')}</li>
            <li>{t('privacyPolicy.dataStorage.cloudDataItems.multiDevice')}</li>
            <li>{t('privacyPolicy.dataStorage.cloudDataItems.dataOwnership')}</li>
          </ul>
          <p className="text-slate-300 font-medium mb-4">{t('privacyPolicy.dataStorage.cloudDataNote')}</p>

          <h3 className="text-lg font-medium mb-2 text-slate-300">{t('privacyPolicy.dataStorage.dataRetentionTitle')}</h3>
          <p className="text-slate-300">{t('privacyPolicy.dataStorage.dataRetentionContent')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.legalBasis.title')}</h2>
          <p className="text-slate-300 mb-3">{t('privacyPolicy.legalBasis.intro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>{t('privacyPolicy.legalBasis.contract')}</li>
            <li>{t('privacyPolicy.legalBasis.consent')}</li>
            <li>{t('privacyPolicy.legalBasis.legitimateInterest')}</li>
          </ul>
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
          <p className="text-slate-300 mb-4">{t('privacyPolicy.dataWeCollect.licenseValidationContent')}</p>
          <h3 className="text-lg font-medium mb-2 text-slate-300">{t('privacyPolicy.dataWeCollect.consentTrackingTitle')}</h3>
          <p className="text-slate-300 mb-2">{t('privacyPolicy.dataWeCollect.consentTrackingIntro')}</p>
          <ul className="list-disc list-inside text-slate-300 mb-3 space-y-1">
            <li>{t('privacyPolicy.dataWeCollect.consentTrackingItems.timestamp')}</li>
            <li>{t('privacyPolicy.dataWeCollect.consentTrackingItems.policyVersion')}</li>
            <li>{t('privacyPolicy.dataWeCollect.consentTrackingItems.ipAddress')}</li>
            <li>{t('privacyPolicy.dataWeCollect.consentTrackingItems.userAgent')}</li>
          </ul>
          <p className="text-slate-300 mb-4">{t('privacyPolicy.dataWeCollect.consentTrackingNote')}</p>
          <h3 className="text-lg font-medium mb-2 text-slate-300">{t('privacyPolicy.dataWeCollect.personnelDataTitle')}</h3>
          <p className="text-slate-300 mb-2">{t('privacyPolicy.dataWeCollect.personnelDataIntro')}</p>
          <ul className="list-disc list-inside text-slate-300 mb-3 space-y-1">
            <li>{t('privacyPolicy.dataWeCollect.personnelDataItems.name')}</li>
            <li>{t('privacyPolicy.dataWeCollect.personnelDataItems.email')}</li>
            <li>{t('privacyPolicy.dataWeCollect.personnelDataItems.phone')}</li>
            <li>{t('privacyPolicy.dataWeCollect.personnelDataItems.certifications')}</li>
          </ul>
          <p className="text-slate-300">{t('privacyPolicy.dataWeCollect.personnelDataNote')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.dataWeDoNotCollect.title')}</h2>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>{t('privacyPolicy.dataWeDoNotCollect.items.gameContent')}</li>
            <li>{t('privacyPolicy.dataWeDoNotCollect.items.location')}</li>
            <li>{t('privacyPolicy.dataWeDoNotCollect.items.photos')}</li>
            <li>{t('privacyPolicy.dataWeDoNotCollect.items.deviceIds')}</li>
            <li>{t('privacyPolicy.dataWeDoNotCollect.items.playerNames')}</li>
          </ul>
          <p className="text-slate-400 text-sm mt-3 italic">{t('privacyPolicy.dataWeDoNotCollect.personnelNote')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.thirdPartyServices.title')}</h2>
          <p className="text-slate-300 mb-3">{t('privacyPolicy.thirdPartyServices.intro')}</p>
          <div className="space-y-3 text-slate-300">
            <p>
              <strong>{t('privacyPolicy.thirdPartyServices.googlePlay')}</strong> - {t('privacyPolicy.thirdPartyServices.googlePlayDesc')}{' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                {t('privacyPolicy.thirdPartyServices.googlePlayLink')}
              </a>
            </p>
            <p>
              <strong>{t('privacyPolicy.thirdPartyServices.sentry')}</strong> - {t('privacyPolicy.thirdPartyServices.sentryDesc')}{' '}
              <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                {t('privacyPolicy.thirdPartyServices.sentryLink')}
              </a>
            </p>
            <p>
              <strong>{t('privacyPolicy.thirdPartyServices.supabase')}</strong> - {t('privacyPolicy.thirdPartyServices.supabaseDesc')}{' '}
              <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                {t('privacyPolicy.thirdPartyServices.supabaseLink')}
              </a>
            </p>
            <p>
              <strong>{t('privacyPolicy.thirdPartyServices.vercel')}</strong> - {t('privacyPolicy.thirdPartyServices.vercelDesc')}{' '}
              <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                {t('privacyPolicy.thirdPartyServices.vercelLink')}
              </a>
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.yourRights.title')}</h2>
          <p className="text-slate-300 mb-3">{t('privacyPolicy.yourRights.intro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1 mb-4">
            <li><strong>{t('privacyPolicy.yourRights.access')}</strong></li>
            <li><strong>{t('privacyPolicy.yourRights.rectification')}</strong></li>
            <li><strong>{t('privacyPolicy.yourRights.erasure')}</strong></li>
            <li><strong>{t('privacyPolicy.yourRights.portability')}</strong></li>
            <li><strong>{t('privacyPolicy.yourRights.restriction')}</strong></li>
            <li><strong>{t('privacyPolicy.yourRights.objection')}</strong></li>
            <li><strong>{t('privacyPolicy.yourRights.withdrawConsent')}</strong></li>
          </ul>
          <p className="text-slate-300 mb-2">{t('privacyPolicy.yourRights.deleteLocal')}</p>
          <p className="text-slate-300 mb-2">{t('privacyPolicy.yourRights.deleteCloud')}</p>
          <p className="text-slate-300 mb-4">{t('privacyPolicy.yourRights.contactUs')}</p>
          <p className="text-slate-300">
            {t('privacyPolicy.yourRights.supervisoryAuthority')}:{' '}
            <a
              href={t('privacyPolicy.yourRights.supervisoryAuthorityUrl')}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:underline"
            >
              tietosuoja.fi
            </a>
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.childrensPrivacy.title')}</h2>
          <p className="text-slate-300">{t('privacyPolicy.childrensPrivacy.content')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.dataSecurity.title')}</h2>
          <p className="text-slate-300 mb-2">{t('privacyPolicy.dataSecurity.localIntro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1 mb-3">
            <li>{t('privacyPolicy.dataSecurity.localItems.deviceProtection')}</li>
            <li>{t('privacyPolicy.dataSecurity.localItems.noAdditionalEncryption')}</li>
            <li>{t('privacyPolicy.dataSecurity.localItems.noTransmission')}</li>
          </ul>
          <p className="text-slate-300 font-medium mb-4">{t('privacyPolicy.dataSecurity.localNote')}</p>
          <p className="text-slate-300 mb-2">{t('privacyPolicy.dataSecurity.cloudIntro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1 mb-4">
            <li>{t('privacyPolicy.dataSecurity.cloudItems.tlsEncryption')}</li>
            <li>{t('privacyPolicy.dataSecurity.cloudItems.atRestEncryption')}</li>
            <li>{t('privacyPolicy.dataSecurity.cloudItems.rowLevelSecurity')}</li>
            <li>{t('privacyPolicy.dataSecurity.cloudItems.soc2')}</li>
          </ul>
          <h3 className="text-lg font-medium mb-2 text-slate-300">{t('privacyPolicy.dataSecurity.backupTitle')}</h3>
          <p className="text-slate-300">{t('privacyPolicy.dataSecurity.backupContent')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.changes.title')}</h2>
          <p className="text-slate-300">{t('privacyPolicy.changes.content')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('privacyPolicy.contact.title')}</h2>
          <p className="text-slate-300 mb-2">{t('privacyPolicy.contact.intro')}</p>
          <p className="text-slate-300">
            {t('privacyPolicy.contact.email')}:{' '}
            <a href="mailto:valoraami@gmail.com" className="text-indigo-400 hover:underline">
              valoraami@gmail.com
            </a>
          </p>
        </section>

        <hr className="border-slate-700 my-8" />
        <p className="text-slate-500 text-sm italic">{t('privacyPolicy.footer')}</p>

        <div className="mt-8">
          <button
            onClick={() => window.close()}
            className="text-indigo-400 hover:underline"
          >
            ← {t('common.backButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
