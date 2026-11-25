'use client';

/**
 * "Turnauspäivän raportti" - one report over the games made from a plan.
 *
 * Opened from the plan (Plan tab, Games section) once at least one of the
 * plan's games has been played. Everything except the coach's own text comes
 * from the games as they are: the day's record, a row per game, and per player
 * the position in each game plus the day's goals and assists (see
 * dayReport.ts). No playing time - the app does not measure it.
 *
 * The coach's text is ONE day report under the same headings as the match
 * report template. While writing, each game's own match report is shown read
 * only below the editor, so the coach can summarise them. The text is saved
 * on the plan (`onSave`), never automatically: an AI draft (labs + the coach's
 * own provider only) lands in the editor and waits for the coach's Save.
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineShare } from 'react-icons/hi';
import {
  CollapsibleModalHeader,
  Z_LAYER,
  cardStyle,
  inputBaseStyle,
  modalContainerStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionLabelStyle,
  subtextStyle,
} from '@/styles/modalStyles';
import GameRecapModal from '@/components/GameRecapModal';
import ConfirmationModal from '@/components/ConfirmationModal';
import WorkingIndicator from '@/components/WorkingIndicator';
import { useToast } from '@/contexts/ToastProvider';
import { useAiProviderState } from '@/utils/aiProvider';
import { recordAiUsage } from '@/utils/aiUsage';
import { DraftingError, draftDaySummary, estimateDaySummaryUsd } from '@/utils/aiDrafting';
import { resolveRefsInText } from '@/utils/applyReportDraft';
import { reportSectionHeadings, reportSectionLabel } from '@/utils/reportSections';
import { RESULT_CLASSES } from '@/utils/gameResult';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import {
  NOT_IN_GAME,
  buildDayReport,
  buildDayReportShareText,
  formatDayRecord,
  formatDayScore,
  type DayReportGameInput,
  type DayReportTranslate,
} from '@/utils/playtimePlanner/dayReport';
import { buildDayPacket } from '@/utils/playtimePlanner/dayReportPacket';
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';
import type { Player } from '@/types';
import logger from '@/utils/logger';

export interface PlanDayReportModalProps {
  plan: PlaytimePlan;
  /** The plan's real games, in plan order (orderDayGames). */
  inputs: DayReportGameInput[];
  /** Master roster: names, and every name the AI request must redact. */
  roster: Player[];
  /** Store the coach's day text on the plan. */
  onSave: (text: string) => void;
  onClose: () => void;
  /**
   * Filled with this modal's own close request (which asks before throwing
   * away unsaved text), so the host's hardware-back ladder can use it.
   */
  closeRequestRef?: React.MutableRefObject<(() => void) | null>;
}

const TOOL_BTN = `${secondaryButtonStyle} flex-1 min-w-0 px-3! text-sm!`;

const PlanDayReportModal: React.FC<PlanDayReportModalProps> = ({
  plan,
  inputs,
  roster,
  onSave,
  onClose,
  closeRequestRef,
}) => {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const ai = useAiProviderState();
  const titleId = useId();

  const tr: DayReportTranslate = useCallback(
    (key, fallback, options) => t(key, { defaultValue: fallback, ...(options ?? {}) }) as string,
    [t],
  );

  const report = useMemo(() => buildDayReport(plan, inputs, roster, tr), [plan, inputs, roster, tr]);
  const saved = plan.dayReport ?? '';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved);
  const [showShare, setShowShare] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [aiWorking, setAiWorking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Leaving mid-request must not leave a request running on the coach's key.
  useEffect(() => () => abortRef.current?.abort(), []);

  const dirty = editing && draft !== saved;
  const onScreenText = editing ? draft : saved;
  const shareText = useMemo(
    () => buildDayReportShareText(report, onScreenText, tr),
    [report, onScreenText, tr],
  );

  const requestClose = useCallback(() => {
    if (showShare) {
      setShowShare(false);
      return;
    }
    if (confirmDiscard) {
      setConfirmDiscard(false);
      return;
    }
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }, [confirmDiscard, dirty, onClose, showShare]);

  useEffect(() => {
    if (!closeRequestRef) return;
    closeRequestRef.current = requestClose;
    return () => {
      closeRequestRef.current = null;
    };
  }, [closeRequestRef, requestClose]);

  // Escape: the share view closes itself (its own listener); a focused field
  // is dismissed first; otherwise the same ladder as hardware back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || showShare) return;
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && (focused.tagName === 'TEXTAREA' || focused.tagName === 'INPUT')) {
        focused.blur();
        return;
      }
      requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose, showShare]);

  const startEdit = () => {
    setDraft(saved);
    setEditing(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleSave = () => {
    onSave(draft.trim() ? draft : '');
    setEditing(false);
    showToast(t('planDayReport.saved', 'Day report saved.'), 'success');
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setDraft(saved);
    setEditing(false);
  };

  const handleUseTemplate = () => {
    // The same seven headings as the match report template (and the AI draft).
    const template = `${reportSectionHeadings(t).map(({ label }) => `${label}:`).join('\n\n')}\n`;
    setDraft((current) => (current.trim() ? `${current.trimEnd()}\n\n${template}` : template));
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const playedCount = report.playedGameNumbers.length;
  const aiPacket = useMemo(
    () =>
      ai.connected && playedCount > 0
        ? buildDayPacket({ report, inputs, roster, pseudonymize: ai.pseudonymize, language: i18n.language || 'fi' })
        : null,
    [ai.connected, ai.pseudonymize, i18n.language, inputs, playedCount, report, roster],
  );
  const aiEstimate = aiPacket ? estimateDaySummaryUsd(aiPacket.packet) : 0;

  const handleAiDraft = useCallback(async () => {
    if (!aiPacket || aiWorking) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setAiWorking(true);
    try {
      const result = await draftDaySummary({ packet: aiPacket.packet, signal: controller.signal });
      recordAiUsage('drafting', result.usage?.estimatedUsd ?? aiEstimate);
      const refs = Object.keys(aiPacket.refToName);
      const nameFor = (ref: string) => aiPacket.refToName[ref] ?? ref;
      const composed = result.sections
        .map(({ section, text }) => `${reportSectionLabel(t, section)}:\n${resolveRefsInText(text.trim(), refs, nameFor)}`)
        .join('\n\n');
      if (controller.signal.aborted) return;
      // Into the editor only: the coach reads it, edits it, and saves it.
      setDraft((current) =>
        (current.trim() ? `${current.trimEnd()}\n\n${composed}` : composed).slice(0, VALIDATION_LIMITS.GAME_NOTES_MAX),
      );
      showToast(t('planDayReport.aiInserted', 'Draft added to the text. Check it and save.'), 'success');
    } catch (error) {
      if (controller.signal.aborted) return;
      const kind = error instanceof DraftingError ? error.kind : 'network';
      const billed = error instanceof DraftingError ? error.billedUsd : undefined;
      if (billed) recordAiUsage('drafting', billed);
      logger.warn('[planDayReport] AI draft failed', { kind });
      showToast(
        {
          unauthorized: t('reportDraft.errorUnauthorized', 'Connect an AI provider in Settings first.'),
          rateLimited: t('reportDraft.errorRateLimited', 'Your AI provider is rate limiting. Try again shortly.'),
          network: t('reportDraft.errorNetwork', 'Could not reach your AI provider.'),
          rejected: t('reportDraft.errorRejected', 'Your AI provider refused this request.'),
          tooLarge: t('planDayReport.aiTooLarge', 'These games have more text than one request can carry.'),
          noOutput: t('reportDraft.errorNoOutput', 'Your AI provider answered but wrote nothing. It may have spent its budget thinking. Try again, or tell me which model your account offers.'),
          invalidResponse: t('reportDraft.errorInvalid', 'The draft came back unreadable. Try again.'),
        }[kind],
        'error',
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setAiWorking(false);
    }
  }, [aiEstimate, aiPacket, aiWorking, showToast, t]);

  const gk = tr('positions.GK', 'GK');
  const subtitle = [
    report.teamName,
    report.venue,
    t('planDayReport.gameCount', '{{count}} games', { count: report.games.length }),
    playedCount > 0 ? formatDayRecord(report.record, tr) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const resultLetter = (r: 'W' | 'D' | 'L') =>
    r === 'W' ? tr('export.winShort', 'W') : r === 'D' ? tr('export.tieShort', 'D') : tr('export.lossShort', 'L');

  return (
    <div
      className={`fixed inset-0 ${Z_LAYER.modalNested} flex`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="plan-day-report"
    >
      <div className={`${modalContainerStyle} relative h-full w-full flex flex-col`}>
        <CollapsibleModalHeader
          title={t('planDayReport.title', 'Tournament day report')}
          titleId={titleId}
          onClose={requestClose}
          closeLabel={t('common.close', 'Close')}
        />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-8 space-y-4 font-ui">
          <div className="px-1">
            <h3 className="font-display font-bold text-2xl text-ink leading-tight" data-testid="day-report-name">
              {report.planName}
            </h3>
            <p className={subtextStyle} data-testid="day-report-subtitle">{subtitle}</p>
          </div>

          {/* Results, one row per game in plan order. */}
          <section className={cardStyle} aria-labelledby={`${titleId}-games`}>
            <h4 id={`${titleId}-games`} className={`${sectionLabelStyle} mb-2`}>
              {t('planDayReport.gamesHeading', 'Games')}
            </h4>
            <ul className="divide-y divide-hairline">
              {report.games.map((g, i) => (
                <li key={g.gameId} className="flex items-center gap-3 py-2.5" data-testid={`day-report-game-${i + 1}`}>
                  <span
                    className={`w-7 h-7 rounded-full grid place-items-center text-[13px] font-bold shrink-0 ${
                      RESULT_CLASSES[g.result ?? 'N/A'].disc
                    }`}
                    aria-hidden="true"
                  >
                    {g.result ? resultLetter(g.result) : NOT_IN_GAME}
                  </span>
                  <span className="flex-1 min-w-0 text-[15px] text-ink truncate">
                    <span className="text-ink-3 mr-1.5">{i + 1}.</span>
                    {g.opponentName || t('planDayReport.unknownOpponent', 'Opponent')}
                  </span>
                  {g.played ? (
                    <span
                      className={`font-display font-bold text-xl tabular-nums ${RESULT_CLASSES[g.result ?? 'N/A'].numeral}`}
                    >
                      {formatDayScore(g, tr)}
                    </span>
                  ) : (
                    <span className="text-sm text-ink-3">{t('planDayReport.notPlayedYet', 'not played yet')}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Players: position per played game + the day's goals and assists. */}
          {report.players.length > 0 && (
            <section className={cardStyle} aria-labelledby={`${titleId}-players`}>
              <h4 id={`${titleId}-players`} className={`${sectionLabelStyle} mb-2`}>
                {t('planDayReport.playersHeading', 'Players')}
              </h4>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm tabular-nums" data-testid="day-report-players">
                  <thead>
                    <tr className="text-ink-3 text-[11px] uppercase tracking-[0.06em]">
                      <th scope="col" className="text-left font-semibold px-1 py-1">
                        {t('planDayReport.playerColumn', 'Player')}
                      </th>
                      {report.playedGameNumbers.map((n) => (
                        <th key={n} scope="col" className="text-center font-semibold px-1 py-1">
                          {t('planDayReport.gameColumn', 'G{{n}}', { n })}
                        </th>
                      ))}
                      <th scope="col" className="text-center font-semibold px-1 py-1">
                        {t('planDayReport.goalsAssistsColumn', 'G+A')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {report.players.map((p) => (
                      <tr key={p.playerId}>
                        <td className="px-1 py-1.5 text-ink whitespace-nowrap">{p.name}</td>
                        {p.positions.map((pos, i) => {
                          const tone =
                            pos === NOT_IN_GAME
                              ? 'text-ink-3'
                              : pos.split(', ').includes(gk)
                                ? 'bg-action/20 text-action'
                                : 'bg-white/[0.08] text-ink';
                          return (
                            <td key={i} className="px-1 py-1.5 text-center">
                              <span className={`inline-block min-w-[2rem] px-1.5 rounded-md text-[11px] font-semibold ${tone}`}>
                                {pos}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-1 py-1.5 text-center text-ink-2">
                          {p.goals}+{p.assists}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={`${subtextStyle} mt-2 text-[13px]`}>
                {t(
                  'planDayReport.playersHint',
                  'G1, G2 … = the games in the order above · – = not in that game · G+A = goals + assists over the day',
                )}
              </p>
            </section>
          )}

          {/* The coach's own day text. */}
          <section className={cardStyle} aria-labelledby={`${titleId}-text`}>
            <h4 id={`${titleId}-text`} className="text-base font-semibold text-ink mb-3">
              {t('planDayReport.textHeading', 'Day report')}
            </h4>
            {editing ? (
              <div className="space-y-3">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={VALIDATION_LIMITS.GAME_NOTES_MAX}
                  aria-label={t('planDayReport.textHeading', 'Day report')}
                  data-testid="day-report-text"
                  className={`${inputBaseStyle} h-64 min-h-[10rem] resize-y text-[15px]! leading-relaxed`}
                  placeholder={t('planDayReport.textPlaceholder', 'How did the day go?')}
                />
                <p className="text-sm text-ink-3">
                  {t('privacyHints.noHealthData', 'Do not record health information.')}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={handleUseTemplate} className={TOOL_BTN} data-testid="day-report-template">
                    {t('gameSettingsModal.useTemplate', 'Template')}
                  </button>
                </div>
                {aiPacket && (
                  <div className="space-y-2" data-testid="day-report-ai">
                    <button
                      type="button"
                      onClick={() => void handleAiDraft()}
                      disabled={aiWorking}
                      className={`${secondaryButtonStyle} w-full`}
                      data-testid="day-report-ai-draft"
                    >
                      {aiEstimate > 0
                        ? t('planDayReport.aiDraftWithCost', 'Draft a summary with AI (~${{usd}})', {
                            usd: aiEstimate.toFixed(2),
                          })
                        : t('planDayReport.aiDraft', 'Draft a summary with AI')}
                    </button>
                    <p className={`${subtextStyle} text-[13px]`}>
                      {ai.pseudonymize
                        ? t(
                            'planDayReport.aiScope',
                            'Sends the results and match reports of {{count}} games to your own AI provider. Player names are replaced with codes. The draft goes into the text above - nothing is saved until you press Save.',
                            { count: playedCount },
                          )
                        : t(
                            'planDayReport.aiScopeNames',
                            'Sends the results and match reports of {{count}} games, with player names, to your own AI provider. The draft goes into the text above - nothing is saved until you press Save.',
                            { count: playedCount },
                          )}
                    </p>
                    {aiWorking && (
                      <WorkingIndicator
                        label={t('reportDraft.working', 'Writing the draft on your AI provider. This takes a few seconds.')}
                        data-testid="day-report-ai-working"
                      />
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={handleCancel} className={`${secondaryButtonStyle} flex-1 min-w-0 px-3!`}>
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className={`${primaryButtonStyle} flex-[2] min-w-0 px-3!`}
                    data-testid="day-report-save"
                  >
                    {t('common.save', 'Save')}
                  </button>
                </div>

                {/* The games' own reports, read only, to summarise from. */}
                <div className="pt-2" data-testid="day-report-game-reports">
                  <h5 className={`${sectionLabelStyle} mb-1`}>
                    {t('planDayReport.gameReportsHeading', "The games' own reports")}
                  </h5>
                  <div className="divide-y divide-hairline">
                    {report.games
                      .map((g, i) => ({ g, n: i + 1 }))
                      .filter(({ g }) => g.played)
                      .map(({ g, n }) => (
                        <details key={g.gameId} className="py-2" data-testid={`day-report-game-report-${n}`}>
                          <summary className="cursor-pointer min-h-11 flex items-center text-[15px] font-semibold text-ink">
                            {n}. {g.opponentName || t('planDayReport.unknownOpponent', 'Opponent')} {formatDayScore(g, tr)}
                          </summary>
                          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2 pb-1">
                            {g.gameNotes || (
                              <span className="italic text-ink-3">
                                {t('planDayReport.noGameReport', 'No match report written for this game.')}
                              </span>
                            )}
                          </p>
                        </details>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={startEdit}
                  data-testid="day-report-open-editor"
                  className="block w-full text-left whitespace-pre-wrap min-h-[6rem] p-3.5 rounded-[14px] bg-carbon text-[15px] leading-relaxed text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10)] hover:text-ink transition-colors"
                >
                  {saved || (
                    <span className="italic text-ink-3">
                      {t('planDayReport.noText', 'Nothing written yet. Press here to write the day report.')}
                    </span>
                  )}
                </button>
              </>
            )}
          </section>

          <button
            type="button"
            onClick={() => setShowShare(true)}
            className={`${primaryButtonStyle} w-full`}
            data-testid="day-report-share"
          >
            <HiOutlineShare aria-hidden="true" />
            {t('planDayReport.share', 'Share report')}
          </button>
        </div>
      </div>

      <GameRecapModal
        isOpen={showShare}
        onClose={() => setShowShare(false)}
        recap={shareText}
        title={t('planDayReport.shareTitle', 'Share day report')}
        subtitle={t('recap.subtitle', 'Ready to paste into the team chat. Edit if you like.')}
      />
      <ConfirmationModal
        isOpen={confirmDiscard}
        title={t('planDayReport.discardTitle', 'Discard changes?')}
        message={t('planDayReport.discardMessage', 'The day report text you wrote has not been saved.')}
        confirmLabel={t('planDayReport.discardConfirm', 'Discard')}
        cancelLabel={t('planDayReport.keepEditing', 'Keep writing')}
        variant="danger"
        onConfirm={() => {
          setConfirmDiscard(false);
          abortRef.current?.abort();
          onClose();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
};

export default PlanDayReportModal;
