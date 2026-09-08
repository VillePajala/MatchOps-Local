'use client';

import { useTranslation } from 'react-i18next';
import type { TranslationKey } from '@/i18n-types';

const list = (t: (k: TranslationKey) => string, keys: TranslationKey[]) => (
  <ul className="list-disc list-inside text-slate-300 space-y-2">
    {keys.map((k) => (
      <li key={k}>{t(k)}</li>
    ))}
  </ul>
);

export function VoiceNotesInfoClient() {
  const { t } = useTranslation();
  const tk = (k: TranslationKey) => t(k);

  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-900 text-slate-100 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">{t('voiceNotesInfo.title')}</h1>
        <p className="text-slate-400 mb-8">{t('voiceNotesInfo.subtitle')}</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('voiceNotesInfo.keepsTitle')}</h2>
          {list(tk, ['voiceNotesInfo.keeps1', 'voiceNotesInfo.keeps2', 'voiceNotesInfo.keeps3'])}
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('voiceNotesInfo.recordingsTitle')}</h2>
          {list(tk, ['voiceNotesInfo.recordings1', 'voiceNotesInfo.recordings2'])}
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('voiceNotesInfo.aiTitle')}</h2>
          <p className="text-slate-300 mb-3">{t('voiceNotesInfo.aiIntro')}</p>
          {list(tk, ['voiceNotesInfo.ai1', 'voiceNotesInfo.ai2', 'voiceNotesInfo.ai3', 'voiceNotesInfo.ai4', 'voiceNotesInfo.ai5'])}
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">{t('voiceNotesInfo.rightsTitle')}</h2>
          {list(tk, ['voiceNotesInfo.rights1', 'voiceNotesInfo.rights2', 'voiceNotesInfo.rights3'])}
        </section>

        <footer className="pt-6 border-t border-slate-700 text-sm text-slate-500">
          <p className="mb-2">{t('voiceNotesInfo.asOf')}</p>
          <a href="/privacy-policy" className="text-indigo-400 hover:text-indigo-300 underline">
            {t('voiceNotesInfo.policyLink')}
          </a>
        </footer>
      </div>
    </div>
  );
}
