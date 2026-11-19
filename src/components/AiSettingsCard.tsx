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
  listAiModels,
  setAiModel,
  setPseudonymizeNames,
  testAiProviderKey,
  useAiProviderState,
} from '@/utils/aiProvider';
import logger from '@/utils/logger';
import {
  groupedListStyle,
  sectionLabelStyle,
  subtextStyle,
  secondaryButtonStyle,
  dangerButtonStyle,
  inputBaseStyle,
  selectStyle,
  textareaStyle,
  switchInputStyle,
  linkStyle,
  neutralBadgeStyle,
  pillQuietStyle,
} from '@/styles/modalStyles';
import { resetAiUsage, useAiUsage } from '@/utils/aiUsage';
import { DRAFTING_MODEL } from '@/utils/aiDrafting';

interface AiSettingsCardProps {
  userId?: string;
}

// A row of the group: 56px minimum, inset divider above it (not the first).
const rowStyle =
  'relative min-h-14 py-3 pl-[18px] pr-4 font-ui before:absolute before:top-0 before:left-[18px] before:right-0 before:h-px before:bg-hairline first:before:hidden';
// A row's own button: the ghost pill (settings has no single primary action).
const secondary = `${secondaryButtonStyle} shrink-0 min-h-10! px-4! text-sm!`;
// No amber pill here: settings has no single primary action (ghost, as in the mock).
const primary = secondary;
// Destructive but not final (a confirmation follows): the house tinted danger
// pill; the solid red is only on the confirm dialog's final button.
const danger = `${dangerButtonStyle} shrink-0 min-h-11! px-4! text-sm!`;
const rowKey = 'font-ui text-base font-medium text-ink';

const AiSettingsCard: React.FC<AiSettingsCardProps> = ({ userId }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const state = useAiProviderState();
  const usage = useAiUsage();
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Listed from the coach's own account, so the picker can never offer a model
  // they do not have. The models endpoint is free, so this costs nothing.
  const loadModels = useCallback(async () => {
    if (loadingModels) return;
    setLoadingModels(true);
    try {
      setModels(await listAiModels());
    } finally {
      setLoadingModels(false);
    }
  }, [loadingModels]);
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
    <section data-testid="ai-settings-card" className="space-y-2">
      <h3 className={`${sectionLabelStyle} px-1`}>
        {t('aiSettings.title', 'Voice notes and AI')}
      </h3>
      <div className={groupedListStyle}>
      <div className="px-[18px] pt-4 pb-3.5 font-ui space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Says who this is for before anyone reads further: a coach without
              an API key should not expect a one-button AI here. */}
          <span className={neutralBadgeStyle} data-testid="ai-experimental">
            {t('aiSettings.experimentalTag', 'Experimental')}
          </span>
          <span
            data-testid="ai-status"
            className={state.connected ? `${pillQuietStyle} text-win!` : pillQuietStyle}
          >
            {state.connected ? t('aiSettings.statusConnected', 'Connected') : t('aiSettings.statusNotConnected', 'Not connected')}
          </span>
        </div>
        <p className="font-ui text-sm leading-relaxed text-ink-2">
          {t('aiSettings.intro', 'Voice notes work without this. Transcription and drafts need your own AI provider account - the recordings then go from your phone to that provider only, on your key, only when you press the button.')}
        </p>
        <p className={`${subtextStyle} leading-relaxed`}>
          {t('aiSettings.experimentalNote', 'Needs your own OpenAI account and API key. Built for coaches comfortable with that; not for everyone yet.')}{' '}
          <a href="/voice-notes" target="_blank" rel="noopener noreferrer" className={linkStyle} data-testid="ai-parent-page">
            {t('aiSettings.parentPageLink', 'Page for families: what leaves the phone')}
          </a>
        </p>
      </div>

      {!state.hasConsent && (
        <div className={`${rowStyle} flex items-center gap-3`}>
          <p className={`flex-1 ${rowKey}`}>{t('aiSettings.setUpLabel', 'Set up transcription and drafts')}</p>
          <button type="button" onClick={() => setGateOpen(true)} className={primary} data-testid="ai-setup">
            {t('aiSettings.setUp', 'Set up')}
          </button>
        </div>
      )}

      {state.hasConsent && !state.hasKey && (
        <div className={`${rowStyle} space-y-2`}>
          <label htmlFor="ai-key-input" className={`block ${rowKey}`}>
            {t('aiSettings.keyLabel', '{{provider}} API key', { provider: provider.label })}
          </label>
          <p className={subtextStyle}>
            {t('aiSettings.keyHint', 'Create a dedicated key for MatchOps and set a monthly spend cap on it.')}{' '}
            <a href={provider.keysUrl} target="_blank" rel="noopener noreferrer" className={linkStyle}>
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
              className={`${inputBaseStyle} flex-1 min-w-0 w-auto! min-h-11!`}
            />
            <button type="button" onClick={() => void connect()} disabled={!keyInput.trim() || testing} className={primary} data-testid="ai-connect">
              {testing ? t('aiSettings.testing', 'Checking...') : t('aiSettings.connect', 'Connect')}
            </button>
          </div>
        </div>
      )}

      {state.connected && (
        <div className={`${rowStyle} flex flex-wrap items-center gap-2`}>
          <p className="flex-1 min-w-[12rem] font-ui text-base text-ink" data-testid="ai-connected-line">
            {t('aiSettings.connectedLine', 'Requests go to {{provider}} on your own key (••••{{hint}}).', { provider: provider.label, hint: state.keyHint ?? '' })}
          </p>
          <button type="button" onClick={disconnect} className={secondary} data-testid="ai-disconnect">
            {t('aiSettings.disconnect', 'Disconnect')}
          </button>
        </div>
      )}

      {state.hasConsent && (
        <label className={`${rowStyle} flex items-center gap-3 cursor-pointer`}>
          <span className="flex-1 min-w-0">
            <span className={`block ${rowKey}`}>{t('aiSettings.pseudonymizeLabel', 'Replace player names with codes before drafting')}</span>
            <span className={`block ${subtextStyle} mt-1`}>{t('aiSettings.pseudonymizeHint', 'On by default. Transcription still contains what you said.')}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={state.pseudonymize}
            onChange={(e) => setPseudonymizeNames(e.target.checked)}
            className={switchInputStyle}
            data-testid="ai-pseudonymize"
          />
        </label>
      )}

      {state.connected && (
        <div className={`${rowStyle} space-y-2`} data-testid="ai-model">
          <label htmlFor="ai-model-select" className={`block ${rowKey}`}>
            {t('aiSettings.modelLabel', 'Model used for report drafts')}
          </label>
          <select
            id="ai-model-select"
            value={state.model ?? DRAFTING_MODEL}
            onChange={(e) => setAiModel(e.target.value === DRAFTING_MODEL ? null : e.target.value)}
            className={selectStyle}
            data-testid="ai-model-select"
          >
            <option value={DRAFTING_MODEL}>
              {t('aiSettings.modelDefault', '{{model}} (default)', { model: DRAFTING_MODEL })}
            </option>
            {/* The stored choice first, even before the list loads: otherwise the
                only option is the default and the dropdown claims a model the
                coach is not using. */}
            {state.model && state.model !== DRAFTING_MODEL && !models.includes(state.model) && (
              <option value={state.model}>{state.model}</option>
            )}
            {models
              .filter((m) => m !== DRAFTING_MODEL)
              .map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
          </select>
          {models.length === 0 && (
            <button
              type="button"
              onClick={() => void loadModels()}
              disabled={loadingModels}
              className={secondary}
              data-testid="ai-model-load"
            >
              {loadingModels
                ? t('aiSettings.modelLoading', 'Reading your model list...')
                : t('aiSettings.modelLoad', 'Show the models on my account')}
            </button>
          )}
          <p className={subtextStyle}>
            {state.model && state.model !== DRAFTING_MODEL
              ? t('aiSettings.modelCustomHint', 'The cost figures here are the default model\'s prices, so they are only a rough guide for {{model}}. Larger models write better and cost more.', { model: state.model })
              : t('aiSettings.modelHint', 'Only the low-cost models on your account are offered, so a mis-tap here cannot run up a bill. There is no automatic fallback either: if a model stops working the draft says so, rather than quietly using another one.')}
          </p>
        </div>
      )}

      <div className={`${rowStyle} space-y-1`} data-testid="ai-usage">
        <p className={rowKey}>
          {t('aiSettings.usageLabel', 'Estimated cost on your provider account')}
        </p>
        {usage.since ? (
          <>
            <p className="font-ui text-base font-semibold text-ink">
              {t('aiSettings.usageAmount', '~${{usd}} since {{since}}', {
                usd: usage.estimatedUsd.toFixed(2),
                since: usage.since,
              })}
            </p>
            <p className={subtextStyle}>
              {t('aiSettings.usageBreakdown', '{{transcriptions}} transcriptions, {{drafts}} report drafts, {{readbacks}} translations and summaries. An estimate from list prices - your provider\'s bill is the real number.', {
                transcriptions: usage.transcriptions,
                drafts: usage.drafts,
                readbacks: usage.readbacks,
              })}
            </p>
            <button type="button" onClick={resetAiUsage} className={`${secondary} mt-1`} data-testid="ai-usage-reset">
              {t('aiSettings.usageReset', 'Start counting again')}
            </button>
          </>
        ) : (
          <p className={subtextStyle}>{t('aiSettings.usageNone', 'Nothing used on this device yet.')}</p>
        )}
      </div>

      <div className={`${rowStyle} flex items-center gap-3`}>
        <p className={`flex-1 ${rowKey}`}>{t('aiSettings.deleteRecordingsLabel', 'Delete all voice recordings on this device')}</p>
        <button type="button" onClick={() => setConfirmDelete(true)} className={danger} data-testid="ai-delete-recordings">
          {t('aiSettings.deleteRecordings', 'Delete')}
        </button>
      </div>

      <details className={rowStyle}>
        <summary className={`${rowKey} cursor-pointer min-h-8 flex items-center`}>{t('aiConsent.rulesTitle', 'Dictation rules')}</summary>
        <div className="mt-2">
          <DictationRules />
        </div>
      </details>

      <details className={rowStyle}>
        <summary className={`${rowKey} cursor-pointer min-h-8 flex items-center`}>{t('aiSettings.parentTextTitle', 'Notice to families about AI use')}</summary>
        <p className={`${subtextStyle} mt-2 mb-2`}>{t('aiSettings.parentTextHint', 'A ready-made note you can send to families about the notes you keep.')}</p>
        <textarea readOnly value={parentText} rows={6} className={textareaStyle} aria-label={t('aiSettings.parentTextTitle', 'Notice to families about AI use')} />
        <button type="button" onClick={() => void copyParentText()} className={`${secondary} mt-2`} data-testid="ai-copy-parent-text">
          {t('aiSettings.copy', 'Copy')}
        </button>
      </details>

      </div>

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
    </section>
  );
};

export default AiSettingsCard;
