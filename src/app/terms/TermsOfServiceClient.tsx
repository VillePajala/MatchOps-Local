'use client';

import { useTranslation } from 'react-i18next';
import Link from 'next/link';

export function TermsOfServiceClient() {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-900 text-slate-100 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">{t('termsOfService.title')}</h1>
        <p className="text-slate-400 mb-1">{t('termsOfService.lastUpdated')}</p>
        <p className="text-slate-500 text-sm mb-8">{t('termsOfService.version')}</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.agreement.title')}</h2>
          <p className="text-slate-300">{t('termsOfService.agreement.content')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.description.title')}</h2>
          <p className="text-slate-300 mb-3">{t('termsOfService.description.intro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>{t('termsOfService.description.items.trackTime')}</li>
            <li>{t('termsOfService.description.items.manageRosters')}</li>
            <li>{t('termsOfService.description.items.recordStats')}</li>
            <li>{t('termsOfService.description.items.organizeSeasons')}</li>
          </ul>
          <p className="text-slate-300 mt-3">{t('termsOfService.description.note')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.license.title')}</h2>
          <p className="text-slate-300 mb-3">{t('termsOfService.license.intro')}</p>
          <p className="text-slate-300 mb-2">{t('termsOfService.license.restrictionsIntro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>{t('termsOfService.license.restrictions.reverseEngineer')}</li>
            <li>{t('termsOfService.license.restrictions.modify')}</li>
            <li>{t('termsOfService.license.restrictions.distribute')}</li>
            <li>{t('termsOfService.license.restrictions.illegal')}</li>
            <li>{t('termsOfService.license.restrictions.removeNotices')}</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.userResponsibilities.title')}</h2>
          <p className="text-slate-300 mb-2">{t('termsOfService.userResponsibilities.intro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>{t('termsOfService.userResponsibilities.items.data')}</li>
            <li>{t('termsOfService.userResponsibilities.items.backups')}</li>
            <li>{t('termsOfService.userResponsibilities.items.compliance')}</li>
            <li>{t('termsOfService.userResponsibilities.items.activity')}</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.dataAndPrivacy.title')}</h2>
          <p className="text-slate-300 mb-4">
            {t('termsOfService.dataAndPrivacy.content')}{' '}
            <Link href="/privacy-policy" className="text-indigo-400 hover:underline">
              {t('settingsModal.privacyPolicy')}
            </Link>
          </p>
          <h3 className="text-lg font-medium mb-2 text-slate-300">{t('termsOfService.dataAndPrivacy.securityAcknowledgmentTitle')}</h3>
          <p className="text-slate-300 mb-2">{t('termsOfService.dataAndPrivacy.securityAcknowledgmentIntro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1 mb-3">
            <li>{t('termsOfService.dataAndPrivacy.securityAcknowledgmentItems.localMode')}</li>
            <li>{t('termsOfService.dataAndPrivacy.securityAcknowledgmentItems.deviceSecurity')}</li>
            <li>{t('termsOfService.dataAndPrivacy.securityAcknowledgmentItems.backupFiles')}</li>
            <li>{t('termsOfService.dataAndPrivacy.securityAcknowledgmentItems.personnelData')}</li>
            <li>{t('termsOfService.dataAndPrivacy.securityAcknowledgmentItems.yourResponsibility')}</li>
          </ul>
          <p className="text-slate-300">{t('termsOfService.dataAndPrivacy.securityAcknowledgmentNote')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.intellectualProperty.title')}</h2>
          <p className="text-slate-300">{t('termsOfService.intellectualProperty.content')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.disclaimer.title')}</h2>
          <p className="text-slate-300 mb-3 uppercase text-sm">{t('termsOfService.disclaimer.intro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1 mb-4">
            <li>{t('termsOfService.disclaimer.items.merchantability')}</li>
            <li>{t('termsOfService.disclaimer.items.fitness')}</li>
            <li>{t('termsOfService.disclaimer.items.nonInfringement')}</li>
            <li>{t('termsOfService.disclaimer.items.accuracy')}</li>
          </ul>
          <p className="text-slate-300">{t('termsOfService.disclaimer.note')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.liability.title')}</h2>
          <p className="text-slate-300 mb-3 uppercase text-sm">{t('termsOfService.liability.intro')}</p>
          <p className="text-slate-300">{t('termsOfService.liability.note')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.dataLoss.title')}</h2>
          <p className="text-slate-300 mb-2">{t('termsOfService.dataLoss.intro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>{t('termsOfService.dataLoss.items.localStorage')}</li>
            <li>{t('termsOfService.dataLoss.items.notResponsible')}</li>
            <li>{t('termsOfService.dataLoss.items.backupAdvice')}</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.thirdPartyServices.title')}</h2>
          <p className="text-slate-300 mb-2">{t('termsOfService.thirdPartyServices.intro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>
              <strong>{t('termsOfService.thirdPartyServices.googlePlay')}</strong> - {t('termsOfService.thirdPartyServices.googlePlayDesc')}
            </li>
            <li>
              <strong>{t('termsOfService.thirdPartyServices.sentry')}</strong> - {t('termsOfService.thirdPartyServices.sentryDesc')}
            </li>
            <li>
              <strong>{t('termsOfService.thirdPartyServices.supabase')}</strong> - {t('termsOfService.thirdPartyServices.supabaseDesc')}
            </li>
            <li>
              <strong>{t('termsOfService.thirdPartyServices.vercel')}</strong> - {t('termsOfService.thirdPartyServices.vercelDesc')}
            </li>
          </ul>
          <p className="text-slate-300 mt-2">{t('termsOfService.thirdPartyServices.note')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.premiumSubscription.title')}</h2>
          <p className="text-slate-300 mb-3">{t('termsOfService.premiumSubscription.intro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1 mb-3">
            <li>{t('termsOfService.premiumSubscription.features.cloudSync')}</li>
            <li>{t('termsOfService.premiumSubscription.features.unlimitedEntities')}</li>
            <li>{t('termsOfService.premiumSubscription.features.prioritySupport')}</li>
          </ul>
          <p className="text-slate-300 mb-2">{t('termsOfService.premiumSubscription.billing')}</p>
          <p className="text-slate-300 mb-2">{t('termsOfService.premiumSubscription.cancellation')}</p>
          <p className="text-slate-300">{t('termsOfService.premiumSubscription.dataAfterCancel')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.cloudSync.title')}</h2>
          <p className="text-slate-300 mb-3">{t('termsOfService.cloudSync.intro')}</p>
          <ul className="list-disc list-inside text-slate-300 space-y-1 mb-3">
            <li>{t('termsOfService.cloudSync.items.ownership')}</li>
            <li>{t('termsOfService.cloudSync.items.availability')}</li>
            <li>{t('termsOfService.cloudSync.items.backups')}</li>
            <li>{t('termsOfService.cloudSync.items.security')}</li>
          </ul>
          <p className="text-slate-300">{t('termsOfService.cloudSync.deletion')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.changes.title')}</h2>
          <p className="text-slate-300">{t('termsOfService.changes.content')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.changesToTerms.title')}</h2>
          <p className="text-slate-300">{t('termsOfService.changesToTerms.content')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.termination.title')}</h2>
          <p className="text-slate-300 mb-2">{t('termsOfService.termination.content')}</p>
          <p className="text-slate-300 mb-2">{t('termsOfService.termination.cloudTermination')}</p>
          <p className="text-slate-300">{t('termsOfService.termination.voluntaryDeletion')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.governingLaw.title')}</h2>
          <p className="text-slate-300">{t('termsOfService.governingLaw.content')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.severability.title')}</h2>
          <p className="text-slate-300">{t('termsOfService.severability.content')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.entireAgreement.title')}</h2>
          <p className="text-slate-300">{t('termsOfService.entireAgreement.content')}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('termsOfService.contact.title')}</h2>
          <p className="text-slate-300 mb-2">{t('termsOfService.contact.intro')}</p>
          <p className="text-slate-300">
            {t('termsOfService.contact.email')}:{' '}
            <a href="mailto:valoraami@gmail.com" className="text-indigo-400 hover:underline">
              valoraami@gmail.com
            </a>
          </p>
        </section>

        <hr className="border-slate-700 my-8" />
        <p className="text-slate-500 text-sm italic">{t('termsOfService.footer')}</p>

        <div className="mt-8">
          <Link href="/" className="text-indigo-400 hover:underline">
            ← {t('common.backButton')}
          </Link>
        </div>
      </div>
    </div>
  );
}
