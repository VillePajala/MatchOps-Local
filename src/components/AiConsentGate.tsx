/**
 * Kirjuri consent gate (PR 4): the versioned acknowledgement a coach must
 * pass before an AI provider can be connected at all. Same anatomy as
 * ReConsentModal. Every box must be ticked; the text is versioned via
 * AI_CONSENT_VERSION and a bump re-gates everyone.
 *
 * Plain language on purpose - the user is an individual coach, not a club
 * with a data officer. See kirjuri-ai-plan.md "Consent gate".
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogBackdrop, primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { AI_CONSENT_VERSION, acceptAiConsent } from '@/utils/aiProvider';

interface AiConsentGateProps {
  isOpen: boolean;
  onAccepted: () => void;
  onCancel: () => void;
}

const checkboxStyle =
  'mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer';

export const DictationRules: React.FC = () => {
  const { t } = useTranslation();
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm text-slate-300">
      <li>{t('aiConsent.rule1', 'Talk about football actions, not people\'s lives.')}</li>
      <li>{t('aiConsent.rule2', 'Use first names or nicknames, never full names.')}</li>
      <li>{t('aiConsent.rule3', 'Never dictate health, injuries, family matters, or anything about parents, referees or opponents by name.')}</li>
      <li>{t('aiConsent.rule4', 'Keep clips short; delete anything you would not want a parent to read.')}</li>
      <li>{t('aiConsent.rule5', 'You are responsible for what you dictate and for informing families where your situation requires it.')}</li>
    </ul>
  );
};

const AiConsentGate: React.FC<AiConsentGateProps> = ({ isOpen, onAccepted, onCancel }) => {
  const { t } = useTranslation();
  const [box1, setBox1] = useState(false);
  const [box2, setBox2] = useState(false);
  const [box3, setBox3] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;
  const allTicked = box1 && box2 && box3;

  return (
    <DialogBackdrop className="z-[100]">
      <div
        ref={modalRef}
        className="bg-slate-800 rounded-lg shadow-2xl max-w-lg w-full border border-slate-600 overflow-hidden max-h-[92vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-consent-title"
        data-testid="ai-consent-gate"
      >
        <div className="px-6 py-4 bg-slate-900/50 border-b border-slate-600">
          <h2 id="ai-consent-title" className="text-xl font-bold text-yellow-400">
            {t('aiConsent.title', 'Before you connect an AI provider')}
          </h2>
          <p className="text-xs text-slate-400 mt-1">{t('aiConsent.version', 'Version')}: {AI_CONSENT_VERSION}</p>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">{t('aiConsent.dataTitle', 'What happens with your data')}</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-300">
              <li>{t('aiConsent.data1', 'Recordings stay on this phone. MatchOps never receives your audio.')}</li>
              <li>{t('aiConsent.data1b', 'A note or report you choose to SAVE is ordinary match data from then on. If you use MatchOps with an account, it syncs and is backed up like the rest of your match notes.')}</li>
              <li>{t('aiConsent.data2', 'When you press Transcribe or Draft, the recording or notes are sent from this phone to the AI provider YOU connected, under YOUR account and YOUR key.')}</li>
              <li>{t('aiConsent.data3', 'The provider may keep the data for a limited time under its own terms (OpenAI: not used for training, abuse-monitoring logs up to 30 days, processed in the US). Read your provider\'s terms - MatchOps is not a party to them.')}</li>
              <li>{t('aiConsent.data4', 'Costs are billed to your provider account. Create a dedicated key with a monthly spend cap.')}</li>
              <li>{t('aiConsent.data5', 'Player names are replaced with codes before any drafting request (you can turn this off). Transcription necessarily contains what you said, and the first names of the players in that match are sent with the audio so the provider spells them correctly.')}</li>
              <li>{t('aiConsent.data6', 'You can disconnect the provider and delete all recordings at any time from Settings.')}</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">{t('aiConsent.rulesTitle', 'Dictation rules')}</h3>
            <DictationRules />
          </section>

          <section className="space-y-3 pt-2 border-t border-slate-700">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={box1} onChange={(e) => setBox1(e.target.checked)} className={checkboxStyle} data-testid="ai-consent-box-1" />
              <span className="text-sm text-slate-300">{t('aiConsent.box1', 'I understand recordings and notes go to my own AI provider, under my account, and MatchOps never receives them.')}</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={box2} onChange={(e) => setBox2(e.target.checked)} className={checkboxStyle} data-testid="ai-consent-box-2" />
              <span className="text-sm text-slate-300">{t('aiConsent.box2', 'I have read my provider\'s data terms and accept that they may retain data for a limited time.')}</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={box3} onChange={(e) => setBox3(e.target.checked)} className={checkboxStyle} data-testid="ai-consent-box-3" />
              <span className="text-sm text-slate-300">{t('aiConsent.box3', 'I will follow the dictation rules and not dictate health or other sensitive data.')}</span>
            </label>
          </section>
        </div>

        <div className="px-6 py-4 bg-slate-900/30 border-t border-slate-600 flex gap-3">
          <button type="button" onClick={onCancel} className={`flex-1 ${secondaryButtonStyle}`}>
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!allTicked) return;
              acceptAiConsent();
              onAccepted();
            }}
            disabled={!allTicked}
            data-testid="ai-consent-accept"
            className={`flex-1 ${primaryButtonStyle}`}
          >
            {t('aiConsent.accept', 'I understand, continue')}
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
};

export default AiConsentGate;
