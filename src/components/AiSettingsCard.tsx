/**
 * Kirjuri settings card (PR 4): connect / disconnect the coach's own AI
 * provider, behind the consent gate; pseudonymization preference; delete all
 * recordings; dictation rules and the parent-information text.
 *
 * The key never leaves this device except inside the Authorization header of
 * requests the coach triggers. It is never shown back in full.
 */

'use client';

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import ConfirmationModal from '@/components/ConfirmationModal';
import AiConsentGate, { DictationRules } from '@/components/AiConsentGate';
import { deleteAllClips } from '@/utils/audioClipStore';
import {
  AI_PROVIDERS,
  clearAiProviderKey,
  setAiProviderKey,
  setPseudonymizeNames,
  testAiProviderKey,
  useAiProviderState,
} from '@/utils/aiProvider';
import logger from '@/utils/logger';

interface AiSettingsCardProps {
  userId?: string;
}

const rowStyle = 'p-3 bg-slate-800/50 rounded-md';
const primary =
  'rounded-md bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/30 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500';
const secondary =
  'rounded-md bg-slate-600 hover:bg-slate-500 border border-slate-400/30 px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500';
const danger =
  'rounded-md bg-red-700 hover:bg-red-600 border border-red-500/30 px-4 py-2 text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-red-500';

const AiSettingsCard: React.FC<AiSettingsCardProps> = ({ userId }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const state = useAiProviderState();
  const [gateOpen, setGateOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const provider = AI_PROVIDERS[state.provider];

  const connect = useCallback(async () => {
    const key = keyInput.trim();
    if (!key || testing) return;
    setTesting(true);
    try {
      const result = await testAiProviderKey(key, state.provider);
      if (result === 'ok') {
        setAiProviderKey(key, state.provider);
        setKeyInput('');
        showToast(t('aiSettings.connected', 'AI provider connected.'), 'success');
      } else if (result === 'unauthorized') {
        showToast(t('aiSettings.keyRejected', 'The provider rejected this key. Check it and try again.'), 'error');
      } else if (result === 'rateLimited') {
        showToast(t('aiSettings.rateLimited', 'The provider is rate-limiting requests right now. Try again in a minute.'), 'error');
      } else {
        showToast(t('aiSettings.testFailed', 'Could not reach the provider. Check your connection and try again.'), 'error');
      }
    } finally {
      setTesting(false);
    }
  }, [keyInput, testing, state.provider, showToast, t]);

  const disconnect = useCallback(() => {
    clearAiProviderKey();
    showToast(t('aiSettings.disconnected', 'AI provider disconnected. The key was removed from this device.'), 'info');
  }, [showToast, t]);

  const deleteRecordings = useCallback(async () => {
    setConfirmDelete(false);
    try {
      await deleteAllClips(userId);
      showToast(t('aiSettings.recordingsDeleted', 'All voice recordings deleted from this device.'), 'success');
    } catch (error) {
      logger.warn('[aiSettings] delete all clips failed', error);
      showToast(t('aiSettings.recordingsDeleteFailed', 'Could not delete the recordings.'), 'error');
    }
  }, [userId, showToast, t]);

  const parentText = t(
    'aiSettings.parentText',
    'Hi! As the coach I keep short notes about the players during and after games - who did what well, what we are working on. The notes are written or dictated on my phone and stay in my coaching app. If I use an AI tool to tidy them into a match report, the players\' names are replaced with codes before anything is sent. You can ask me at any time what I have noted about your child, and I will delete it if you wish.',
  );

  const copyParentText = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(parentText);
      showToast(t('aiSettings.copied', 'Copied.'), 'success');
    } catch {
      showToast(t('aiSettings.copyFailed', 'Could not copy. Select the text and copy it manually.'), 'error');
    }
  }, [parentText, showToast, t]);

  return (
    <div data-testid="ai-settings-card" className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner space-y-2">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-lg font-semibold text-slate-200">{t('aiSettings.title', 'Voice notes and AI')}</h3>
        <span
          data-testid="ai-status"
          className={`shrink-0 whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold border ${
            state.connected
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'bg-slate-700/60 text-slate-300 border-slate-600'
          }`}
        >
          {state.connected ? t('aiSettings.statusConnected', 'Connected') : t('aiSettings.statusNotConnected', 'Not connected')}
        </span>
      </div>

      <p className="text-xs text-slate-400 mb-2">
        {t('aiSettings.intro', 'Voice notes work without this. Transcription and drafts need your own AI provider account - the recordings then go from your phone to that provider only, on your key, only when you press the button.')}
      </p>

      {!state.hasConsent && (
        <div className={`${rowStyle} flex items-center gap-3`}>
          <p className="flex-1 text-sm text-slate-200">{t('aiSettings.setUpLabel', 'Set up transcription and drafts')}</p>
          <button type="button" onClick={() => setGateOpen(true)} className={primary} data-testid="ai-setup">
            {t('aiSettings.setUp', 'Set up')}
          </button>
        </div>
      )}

      {state.hasConsent && !state.hasKey && (
        <div className={`${rowStyle} space-y-2`}>
          <label htmlFor="ai-key-input" className="block text-sm font-medium text-slate-200">
            {t('aiSettings.keyLabel', '{{provider}} API key', { provider: provider.label })}
          </label>
          <p className="text-xs text-slate-400">
            {t('aiSettings.keyHint', 'Create a dedicated key for MatchOps and set a monthly spend cap on it.')}{' '}
            <a href={provider.keysUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline">
              {t('aiSettings.keyLink', 'Open the provider\'s key page')}
            </a>
          </p>
          <div className="flex gap-2">
            <input
              id="ai-key-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk-..."
              className="flex-1 min-w-0 bg-slate-700 border border-slate-600 rounded-md py-1.5 px-3 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button type="button" onClick={() => void connect()} disabled={!keyInput.trim() || testing} className={primary} data-testid="ai-connect">
              {testing ? t('aiSettings.testing', 'Checking...') : t('aiSettings.connect', 'Connect')}
            </button>
          </div>
        </div>
      )}

      {state.connected && (
        <div className={`${rowStyle} flex flex-wrap items-center gap-2`}>
          <p className="flex-1 min-w-[12rem] text-sm text-slate-200" data-testid="ai-connected-line">
            {t('aiSettings.connectedLine', 'Requests go to {{provider}} on your own key (••••{{hint}}).', { provider: provider.label, hint: state.keyHint ?? '' })}
          </p>
          <button type="button" onClick={disconnect} className={secondary} data-testid="ai-disconnect">
            {t('aiSettings.disconnect', 'Disconnect')}
          </button>
        </div>
      )}

      {state.hasConsent && (
        <label className={`${rowStyle} flex items-start gap-3 cursor-pointer`}>
          <input
            type="checkbox"
            checked={state.pseudonymize}
            onChange={(e) => setPseudonymizeNames(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900"
            data-testid="ai-pseudonymize"
          />
          <span>
            <span className="block text-sm font-medium text-slate-200">{t('aiSettings.pseudonymizeLabel', 'Replace player names with codes before drafting')}</span>
            <span className="block text-xs text-slate-400">{t('aiSettings.pseudonymizeHint', 'On by default. Transcription still contains what you said.')}</span>
          </span>
        </label>
      )}

      <div className={`${rowStyle} flex items-center gap-3`}>
        <p className="flex-1 text-sm text-slate-200">{t('aiSettings.deleteRecordingsLabel', 'Delete all voice recordings on this device')}</p>
        <button type="button" onClick={() => setConfirmDelete(true)} className={danger} data-testid="ai-delete-recordings">
          {t('aiSettings.deleteRecordings', 'Delete')}
        </button>
      </div>

      <details className={rowStyle}>
        <summary className="text-sm font-medium text-slate-200 cursor-pointer">{t('aiConsent.rulesTitle', 'Dictation rules')}</summary>
        <div className="mt-2">
          <DictationRules />
        </div>
      </details>

      <details className={rowStyle}>
        <summary className="text-sm font-medium text-slate-200 cursor-pointer">{t('aiSettings.parentTextTitle', 'Text for parents')}</summary>
        <p className="text-xs text-slate-400 mt-2 mb-2">{t('aiSettings.parentTextHint', 'A ready-made note you can send to families about the notes you keep.')}</p>
        <textarea readOnly value={parentText} rows={6} className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100" aria-label={t('aiSettings.parentTextTitle', 'Text for parents')} />
        <button type="button" onClick={() => void copyParentText()} className={`${secondary} mt-2`} data-testid="ai-copy-parent-text">
          {t('aiSettings.copy', 'Copy')}
        </button>
      </details>

      <AiConsentGate isOpen={gateOpen} onAccepted={() => setGateOpen(false)} onCancel={() => setGateOpen(false)} />
      <ConfirmationModal
        isOpen={confirmDelete}
        title={t('aiSettings.deleteRecordingsTitle', 'Delete all recordings?')}
        message={t('aiSettings.deleteRecordingsBody', 'Every voice recording on this device is removed. Notes you have already saved are kept.')}
        confirmLabel={t('aiSettings.deleteRecordings', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        onConfirm={() => void deleteRecordings()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
};

export default AiSettingsCard;
