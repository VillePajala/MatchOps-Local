'use client';

/**
 * The coach's own report, in another language, to read and to copy.
 *
 * A squad usually includes at least one family that does not read the language
 * the coach writes in, and until now there was nothing to hand them. This is
 * the whole feature: a translation on screen, and a copy button.
 *
 * Read-only BY CONSTRUCTION. There is no apply path, no write of any kind, and
 * nothing here is passed a setter for the report - so no failure mode of this
 * panel can touch what the coach wrote. That is why it is the safest of the AI
 * additions and why it stays that way: if a later change wants to save a
 * translation, it needs somewhere of its own to save it, not this text box.
 *
 * Names go out as codes like every other request and come back as names here,
 * resolved on the device from a mapping that never left it.
 */

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import { useAiProviderState } from '@/utils/aiProvider';
import { recordAiUsage } from '@/utils/aiUsage';
import {
  DraftingError,
  TRANSLATION_LANGUAGES,
  translateReport,
  type TranslationLanguage,
} from '@/utils/aiDrafting';
import { buildGamePacket, redactPlayerNames } from '@/utils/gamePacket';
import { resolveRefsInText } from '@/utils/applyReportDraft';
import WorkingIndicator from '@/components/WorkingIndicator';
import logger from '@/utils/logger';
import type { AppState } from '@/types/game';
import type { Player } from '@/types';

interface TranslateReportPanelProps {
  /** The report as it stands on screen. Never written back to. */
  report: string;
  game: AppState;
  /** Full roster, so names outside the squad are redacted too. */
  players: Player[];
  pseudonymizeOverride?: boolean;
}

const CARD = 'bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner';
const PRIMARY =
  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500 transition-colors';
const SECONDARY =
  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold text-slate-200 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-slate-500 transition-colors';

const TranslateReportPanel: React.FC<TranslateReportPanelProps> = ({
  report,
  game,
  players,
  pseudonymizeOverride,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const ai = useAiProviderState();

  const [language, setLanguage] = useState<TranslationLanguage>('en');
  const [working, setWorking] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);

  const pseudonymize = pseudonymizeOverride ?? ai.pseudonymize;

  const run = useCallback(async () => {
    if (working) return;
    setWorking(true);
    setTranslated(null);
    try {
      // The packet is built only for its ref mapping and its redaction rules -
      // none of it is sent. The report alone goes out, with names already gone.
      const { refToPlayerId } = buildGamePacket({ game, players, pseudonymize, language: 'fi' });
      const refOf = (playerId: string): string | undefined =>
        Object.keys(refToPlayerId).find((ref) => refToPlayerId[ref] === playerId);
      const outgoing = pseudonymize ? redactPlayerNames(report, players, refOf) : report;

      const result = await translateReport({ text: outgoing, language });
      recordAiUsage('drafting', result.estimatedUsd);

      const nameForRef = (ref: string): string => {
        const player = players.find((p) => p.id === refToPlayerId[ref]);
        return player?.nickname?.trim() || player?.name || ref;
      };
      // Codes back to the children they stand for, on this device.
      setTranslated(
        pseudonymize
          ? resolveRefsInText(result.text, Object.keys(refToPlayerId), nameForRef)
          : result.text,
      );
    } catch (error) {
      const kind = error instanceof DraftingError ? error.kind : 'network';
      // A provider that answered has already billed for it.
      const billed = error instanceof DraftingError ? error.billedUsd : undefined;
      if (billed) recordAiUsage('drafting', billed);
      logger.warn('[translateReport] translation failed', { kind });
      showToast(
        {
          unauthorized: t('reportDraft.errorUnauthorized', 'Connect an AI provider in Settings first.'),
          rateLimited: t('reportDraft.errorRateLimited', 'Your AI provider is rate limiting. Try again shortly.'),
          network: t('reportDraft.errorNetwork', 'Could not reach your AI provider.'),
          rejected: t('reportDraft.errorRejected', 'Your AI provider refused this request.'),
          tooLarge: t('translateReport.errorTooLarge', 'This report is too long to translate in one go.'),
          noOutput: t('translateReport.errorNoOutput', 'The translation came back empty or unfinished.'),
          invalidResponse: t('translateReport.errorNothing', 'There is nothing to translate yet.'),
        }[kind],
        'error',
      );
    } finally {
      setWorking(false);
    }
  }, [game, language, players, pseudonymize, report, showToast, t, working]);

  const copy = useCallback(async () => {
    if (!translated) return;
    try {
      await navigator.clipboard.writeText(translated);
      showToast(t('translateReport.copied', 'Copied.'), 'success');
    } catch {
      // Clipboard access can be refused; the text is on screen to select.
      showToast(t('translateReport.copyFailed', 'Could not copy. Select the text instead.'), 'error');
    }
  }, [showToast, t, translated]);

  // Nothing written yet, or nothing to translate with.
  if (!ai.connected || !report.trim()) return null;

  return (
    <div className={CARD} data-testid="translate-report">
      <h4 className="text-sm font-semibold text-slate-200 mb-1">
        {t('translateReport.title', 'Read this report in another language')}
      </h4>
      <p className="text-xs text-slate-400 mb-3">
        {t(
          'translateReport.blurb',
          'For sharing with a family who reads another language. This never changes your report.',
        )}
      </p>

      <label className="block text-xs text-slate-400 mb-1" htmlFor="translate-language">
        {t('translateReport.language', 'Language')}
      </label>
      <select
        id="translate-language"
        value={language}
        onChange={(e) => setLanguage(e.target.value as TranslationLanguage)}
        data-testid="translate-language"
        className="w-full mb-3 px-3 py-2 rounded-md bg-slate-800 border border-slate-600 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {TRANSLATION_LANGUAGES.map((code) => (
          <option key={code} value={code}>
            {t(`translateReport.lang.${code}` as never, code)}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => void run()}
        disabled={working}
        className={PRIMARY}
        data-testid="translate-start"
      >
        {t('translateReport.action', 'Translate')}
      </button>
      {working && (
        <WorkingIndicator
          label={t('translateReport.working', 'Translating...')}
          className="mt-2"
          data-testid="translate-working"
        />
      )}

      {translated !== null && (
        <div className="mt-3">
          {/* Read-only: this is a view of the translation, not an editor.
              There is nowhere for it to be saved, by design. */}
          <p
            className="whitespace-pre-wrap rounded-md bg-slate-800/70 border border-slate-700 p-3 text-sm text-slate-200"
            data-testid="translate-output"
          >
            {translated}
          </p>
          <button type="button" onClick={() => void copy()} className={`${SECONDARY} mt-2`} data-testid="translate-copy">
            {t('translateReport.copy', 'Copy')}
          </button>
        </div>
      )}
    </div>
  );
};

export default TranslateReportPanel;
