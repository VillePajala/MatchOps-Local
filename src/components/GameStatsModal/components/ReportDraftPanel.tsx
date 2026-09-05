'use client';

/**
 * Kirjuri report-draft review screen (Phase 3, PR 9b).
 *
 * The only place a draft becomes part of the coach's record, so the whole panel
 * is built around one idea: nothing happens without a deliberate tap.
 *
 * - The cost is shown BEFORE the request, next to a single Draft button.
 * - Every drafted section and player note has its own checkbox. Applying takes
 *   only what is ticked, and everything starts ticked so the coach removes
 *   rather than hunts.
 * - Append is the default and never touches the coach's existing text; Replace
 *   is a separate radio, warns that it overwrites, and offers Undo afterwards.
 * - Warnings the coach must see before applying, not after: the report would be
 *   cut at the length cap, notes that could not be attached to a player, and
 *   the model's own caveat about thin data.
 * - The draft is discarded on close. Nothing persists until Apply.
 */

import React, { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineSparkles } from 'react-icons/hi2';
import type { GameEvent } from '@/types/game';
import type { Player } from '@/types';
import type { AppState } from '@/types/game';
import {
  DraftingError,
  draftMatchReport,
  estimateDraftUsd,
  type DraftingMode,
  type ReportDraft,
} from '@/utils/aiDrafting';
import { applyReportDraft, composeReportText, resolveRefsInText, type ApplyMode } from '@/utils/applyReportDraft';
import { forgetReplacedReport, readReplacedReport, rememberReplacedReport } from '@/utils/reportUndo';
import { UNKNOWN_PLAYER_REF, buildGamePacket } from '@/utils/gamePacket';
import { reportSectionLabel } from '@/utils/reportSections';
import { useAiProviderState } from '@/utils/aiProvider';
import WorkingIndicator from '@/components/WorkingIndicator';
import { recordAiUsage } from '@/utils/aiUsage';
import { useToast } from '@/contexts/ToastProvider';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import logger from '@/utils/logger';

export interface ReportDraftPanelProps {
  /** Opens app settings, where a provider is connected. */
  onOpenSettings?: () => void;
  /** The coach's language: the draft is written in it, not always in Finnish. */
  language: string;
  /**
   * The report text as it is ON SCREEN, which is not the same as the saved
   * value while the editor is open with something unsaved in it. Appending to
   * the saved value would quietly drop whatever the coach had just typed.
   */
  existingReport: string;
  /** The finished game the draft is about. */
  game: AppState;
  /**
   * Which saved game this is. Only used to key the durable undo slot, so an
   * Undo offered here can never revert a different match.
   */
  gameId: string | null;
  /** Full roster, so names outside the squad are redacted too. */
  players: Player[];
  /** Clock stamp for applied notes: where the match ended. */
  stamp: { time: number; period: number };
  /**
   * Applies the approved draft. Returns true when it was stored; the panel only
   * closes and clears on true.
   */
  onApply: (payload: { gameNotes: string; aiMeta?: { model: string; packet: string }; noteEvents: GameEvent[] }) => boolean;
}

const CARD = 'bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner';
const PRIMARY =
  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500 transition-colors';
const SECONDARY =
  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold text-slate-200 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-slate-500 transition-colors';
const CHECKBOX =
  'mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer';

const ReportDraftPanel: React.FC<ReportDraftPanelProps> = ({
  game,
  gameId,
  players,
  stamp,
  onApply,
  onOpenSettings,
  language,
  existingReport,
}) => {
  const { t } = useTranslation();
  const ai = useAiProviderState();
  const { showToast } = useToast();

  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [refMap, setRefMap] = useState<Record<string, string>>({});
  const [skippedSections, setSkippedSections] = useState<Set<string>>(new Set());
  const [skippedNotes, setSkippedNotes] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<ApplyMode>('append');
  /** Which job produced the draft on screen, for wording and for the default. */
  const [draftedAs, setDraftedAs] = useState<DraftingMode>('full');
  // Read from the device, not just from this component: every hand-off this
  // panel offers closes the modal it lives in, and the replaced report has no
  // other copy once the notes are overwritten.
  const [undoText, setUndoText] = useState<string | null>(() =>
    gameId ? readReplacedReport(gameId) : null,
  );
  const [applying, setApplying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Built fresh for the estimate so a settings change (pseudonymization) is
  // reflected before the coach sees a number.
  // The estimate has to reflect the text that will actually be sent, but that
  // text is the textarea buffer and changes on every keystroke. Deferring it
  // keeps typing responsive: the number catches up a beat later, which is all a
  // "roughly $X" hint needs.
  const estimateReport = useDeferredValue(existingReport);
  const estimate = useMemo(() => {
    if (!ai.connected) return 0;
    try {
      // Same packet the request will send, on-screen report included, so the
      // number the coach reads is an estimate of the job they are about to run.
      const { packet } = buildGamePacket({
        game,
        players,
        pseudonymize: ai.pseudonymize,
        language,
        coachReport: estimateReport,
      });
      return estimateDraftUsd(packet);
    } catch {
      return 0;
    }
  }, [ai.connected, ai.pseudonymize, estimateReport, game, players, language]);

  /**
   * Codes are what the provider saw; the coach should see the child. The mapping
   * never left the device, so resolving it costs nothing.
   *
   * A report says "Emma", not "Emma Virtanen": nickname first, then the first
   * name. A surname in a match report about a nine-year-old reads like a police
   * statement.
   */
  const nameForRef = useCallback(
    (ref: string): string => {
      const player = players.find((p) => p.id === refMap[ref]);
      if (!player) return t('reportDraft.unknownPlayer', 'Unidentified player');
      return player.nickname?.trim() || player.name.trim().split(/\s+/)[0] || player.name;
    },
    [players, refMap, t],
  );

  /**
   * Draft text as the coach should read it.
   *
   * The refs were resolved when a draft was APPLIED, but not in this review
   * list - so the screen where the coach decides showed "P5 ja P3" while the
   * saved report showed the names. The place a decision is made is exactly
   * where the text has to be readable.
   */
  const display = useCallback(
    (text: string): string => resolveRefsInText(text, [...Object.keys(refMap), UNKNOWN_PLAYER_REF], nameForRef),
    [refMap, nameForRef],
  );

  const approvedSections = useMemo(
    () => (draft?.sections ?? []).filter((s) => !skippedSections.has(s.section)).map((s) => s.section),
    [draft, skippedSections],
  );
  const approvedNoteIndexes = useMemo(
    () => (draft?.playerNotes ?? []).map((_, i) => i).filter((i) => !skippedNotes.has(i)),
    [draft, skippedNotes],
  );

  /** The exact result Apply would produce - so warnings are shown beforehand. */
  const preview = useMemo(() => {
    if (!draft) return null;
    return applyReportDraft({
      draft,
      approvedSections,
      approvedPlayerNoteIndexes: approvedNoteIndexes,
      existingReport,
      mode,
      labelFor: (section) => reportSectionLabel(t, section),
      refToPlayerId: refMap,
      nameForRef,
      stamp,
    });
  }, [draft, approvedSections, approvedNoteIndexes, existingReport, mode, refMap, nameForRef, stamp, t]);

  const runDraft = useCallback(async (job: DraftingMode = 'full') => {
    if (drafting) return;
    setDrafting(true);
    // Deliberately does NOT clear the undo. Asking for another draft says
    // nothing about whether the coach still wants the report a previous
    // Replace overwrote, and that text has no other copy. It is cleared by
    // using it, by a Replace that supersedes it, or by going stale.
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // `existingReport` is the textarea's live buffer, which the saved game
      // does not have until the coach presses Save. Tidying is defined as
      // "organise what is on my screen", so the packet has to carry that text
      // and not the older saved copy.
      const { packet, refToPlayerId } = buildGamePacket({
        game,
        players,
        pseudonymize: ai.pseudonymize,
        language,
        coachReport: existingReport,
      });
      const result = await draftMatchReport({ packet, signal: controller.signal, mode: job });
      // Real token usage when the provider reported it, else our own estimate.
      recordAiUsage('drafting', result.usage?.estimatedUsd ?? estimateDraftUsd(packet));
      setDraft(result);
      setDraftedAs(job);
      // Tidying returns the coach's own words organised, so keeping the untidy
      // original above it would defeat the point. Replace is the intent here,
      // and it still warns and still offers undo.
      setMode(job === 'tidy' ? 'replace' : 'append');
      setRefMap(refToPlayerId);
      setSkippedSections(new Set());
      setSkippedNotes(new Set());
    } catch (error) {
      if (controller.signal.aborted) return;
      const kind = error instanceof DraftingError ? error.kind : 'network';
      // A provider that answered has already billed for it: count it, or the
      // running total quietly under-reports what the coach spent.
      const billed = error instanceof DraftingError ? error.billedUsd : undefined;
      if (billed) recordAiUsage('drafting', billed);
      logger.warn('[reportDraft] drafting failed', { kind });
      showToast(
        {
          unauthorized: t('reportDraft.errorUnauthorized', 'Connect an AI provider in Settings first.'),
          rateLimited: t('reportDraft.errorRateLimited', 'Your AI provider is rate limiting. Try again shortly.'),
          network: t('reportDraft.errorNetwork', 'Could not reach your AI provider.'),
          rejected: t('reportDraft.errorRejected', 'Your AI provider refused this request.'),
          tooLarge: t('reportDraft.errorTooLarge', 'This match has too much data for one draft.'),
          noOutput: t(
            'reportDraft.errorNoOutput',
            'Your AI provider answered but wrote nothing. It may have spent its budget thinking. Try again, or tell me which model your account offers.',
          ),
          invalidResponse: t('reportDraft.errorInvalid', 'The draft came back unreadable. Try again.'),
        }[kind],
        'error',
      );
    } finally {
      // Only clear what THIS request owns. Cancelling and pressing Draft again
      // starts a second request; the first one's finally would otherwise wipe
      // the new controller and put the UI back to "Draft", leaving the coach
      // unable to cancel a request they are still paying for.
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted) setDrafting(false);
    }
  }, [ai.pseudonymize, drafting, existingReport, game, players, showToast, t, language]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setDrafting(false);
  }, []);

  const apply = useCallback(() => {
    if (!preview || applying) return;
    setApplying(true);
    try {
      const stored = onApply({
        gameNotes: preview.report,
        aiMeta: preview.reportAiMeta,
        noteEvents: preview.noteEvents,
      });
      if (!stored) {
        showToast(t('reportDraft.applyFailed', 'Could not save the draft.'), 'error');
        return;
      }
      // Only a Replace produces an undo, and only a Replace should disturb one.
      // Blanking it on an append hid a still-valid undo for an earlier Replace,
      // while the stored slot survived - so the button came back on a remount
      // and vanished again on the next apply.
      if (preview.replacedReport) {
        setUndoText(preview.replacedReport);
        // Outlive this component: the coach can leave the screen from inside it.
        if (gameId) rememberReplacedReport(gameId, preview.replacedReport);
      }
      setDraft(null);
      showToast(t('reportDraft.applied', 'Draft saved to the match report.'), 'success');
    } finally {
      setApplying(false);
    }
  }, [applying, gameId, onApply, preview, showToast, t]);

  const undo = useCallback(() => {
    if (undoText === null) return;
    const stored = onApply({ gameNotes: undoText, aiMeta: undefined, noteEvents: [] });
    if (stored) {
      setUndoText(null);
      forgetReplacedReport();
      showToast(t('reportDraft.undone', 'Your earlier report text is back.'), 'success');
    }
  }, [onApply, showToast, t, undoText]);

  const discard = useCallback(() => {
    // Throws away the DRAFT on screen and nothing else.
    //
    // It used to clear the undo as well, which conflated two unrelated things:
    // a coach who applied a Replace, drafted again and then discarded the
    // second draft lost the safety net for the first one, silently. The undo
    // belongs to the applied report, not to whichever draft is being reviewed.
    setDraft(null);
  }, []);

  if (!ai.connected) {
    return (
      <div className={CARD} data-testid="report-draft-unavailable">
        <h4 className="text-sm font-semibold text-slate-200 mb-1">
          {t('reportDraft.title', 'Draft with AI')}
        </h4>
        <p className="text-xs text-slate-400">
          {t(
            'reportDraft.notConnected',
            'Connect your own AI provider in Settings to draft a report from this match. Your notes stay on this phone until you press Draft.',
          )}
        </p>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className={`${SECONDARY} mt-3`}
            data-testid="report-draft-open-settings"
          >
            {t('reportDraft.openSettings', 'Open settings')}
          </button>
        )}
      </div>
    );
  }

  const nothingApproved = approvedSections.length === 0 && approvedNoteIndexes.length === 0;

  return (
    <div className={CARD} data-testid="report-draft-panel">
      <h4 className="text-sm font-semibold text-slate-200 mb-1">{t('reportDraft.title', 'Draft with AI')}</h4>

      {!draft && (
        <>
          <p className="text-xs text-slate-400 mb-3">
            {t(
              'reportDraft.intro',
              'Sends this match to your own AI provider and brings back a draft. Nothing is saved until you approve it.',
            )}{' '}
            {t('reportDraft.costHint', 'Roughly ${{usd}} on your account.', { usd: estimate.toFixed(2) })}
          </p>
          {drafting ? (
            <>
              <WorkingIndicator
                label={t('reportDraft.working', 'Writing the draft on your AI provider. This takes a few seconds.')}
                className="mb-2"
                data-testid="report-draft-working"
              />
              <button type="button" onClick={cancel} className={SECONDARY} data-testid="report-draft-cancel">
                {t('reportDraft.cancel', 'Cancel')}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void runDraft('full')} className={PRIMARY} data-testid="report-draft-start">
              <HiOutlineSparkles className="text-base" />
              {t('reportDraft.start', 'Draft the report')}
            </button>
          )}
          {!drafting && existingReport.trim() && (
            // Only offered when there IS something to tidy: a different job
            // from writing one, and the one that removes the main reason a
            // report never gets written at all.
            <button
              type="button"
              onClick={() => void runDraft('tidy')}
              className={`${SECONDARY} mt-2`}
              data-testid="report-draft-tidy"
            >
              {t('reportDraft.tidy', 'Tidy up what I wrote')}
            </button>
          )}
          {undoText !== null && (
            <button type="button" onClick={undo} className={`${SECONDARY} mt-2`} data-testid="report-draft-undo">
              {t('reportDraft.undo', 'Undo: bring my earlier text back')}
            </button>
          )}
        </>
      )}

      {draft && preview && (
        <div className="space-y-4" data-testid="report-draft-review">
          <p className="text-xs text-slate-400">
            {draftedAs === 'tidy'
              ? t('reportDraft.reviewHintTidy', 'Your own account, organised under the headings. Untick anything that lost your meaning.')
              : t('reportDraft.reviewHint', 'Untick anything you do not want. Only ticked items are saved.')}
          </p>

          {draft.dataCaveat && (
            <p className="text-xs text-amber-300" data-testid="report-draft-caveat">
              {draft.dataCaveat}
            </p>
          )}

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              {t('reportDraft.sectionsTitle', 'Report')}
            </legend>
            {draft.sections.map(({ section, text }) => (
              <label key={section} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className={CHECKBOX}
                  checked={!skippedSections.has(section)}
                  onChange={(e) =>
                    setSkippedSections((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.delete(section);
                      else next.add(section);
                      return next;
                    })
                  }
                  data-testid={`report-draft-section-${section}`}
                />
                <span className="text-sm text-slate-200">
                  <span className="font-semibold">{reportSectionLabel(t, section)}: </span>
                  {display(text)}
                </span>
              </label>
            ))}
          </fieldset>

          {draft.playerNotes.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                {t('reportDraft.notesTitle', 'Player notes')}
              </legend>
              {draft.playerNotes.map((note, index) => (
                <label key={`${note.ref}-${index}`} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className={CHECKBOX}
                    checked={!skippedNotes.has(index)}
                    onChange={(e) =>
                      setSkippedNotes((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.delete(index);
                        else next.add(index);
                        return next;
                      })
                    }
                    data-testid={`report-draft-note-${index}`}
                  />
                  <span className="text-sm text-slate-200">
                    <span className="font-semibold">{nameForRef(note.ref)}: </span>
                    {display(note.text)}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <fieldset className="space-y-1">
            <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              {t('reportDraft.modeTitle', 'Existing report text')}
            </legend>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200">
              <input
                type="radio"
                name="report-draft-mode"
                checked={mode === 'append'}
                onChange={() => setMode('append')}
                className={CHECKBOX}
                data-testid="report-draft-mode-append"
              />
              {t('reportDraft.modeAppend', 'Keep it and add the draft below')}
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200">
              <input
                type="radio"
                name="report-draft-mode"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
                className={CHECKBOX}
                data-testid="report-draft-mode-replace"
              />
              {t('reportDraft.modeReplace', 'Replace it with the draft')}
            </label>
            {mode === 'append' && existingReport.trim() && (
              // The coach's own report was sent as source material, so the draft
              // can cover the same ground. Say so where the choice is made,
              // rather than after they are looking at it twice.
              <p className="text-xs text-slate-400" data-testid="report-draft-duplication-note">
                {t('reportDraft.duplicationNote', 'The draft was written knowing what you already wrote, so it may cover the same ground twice. Replace avoids that, and you can undo it.')}
              </p>
            )}
            {mode === 'replace' && existingReport.trim() && (
              <p className="text-xs text-amber-300" data-testid="report-draft-replace-warning">
                {t('reportDraft.replaceWarning', 'Your current report text will be overwritten. You can undo it right after.')}
              </p>
            )}
          </fieldset>

          {preview.reportTruncated && (
            <p className="text-xs text-amber-300" data-testid="report-draft-truncation-warning">
              {t('reportDraft.truncationWarning', 'This would exceed the {{max}} character limit, so the end would be cut. Untick a section or choose Replace.', {
                max: VALIDATION_LIMITS.GAME_NOTES_MAX,
              })}
            </p>
          )}

          {preview.droppedRefs.length > 0 && (
            <p className="text-xs text-amber-300" data-testid="report-draft-dropped-warning">
              {t('reportDraft.droppedWarning', '{{count}} note(s) could not be matched to a player and will not be saved.', {
                count: new Set(preview.droppedRefs).size,
              })}
            </p>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={apply}
              disabled={applying || nothingApproved}
              className={PRIMARY}
              data-testid="report-draft-apply"
            >
              {t('reportDraft.apply', 'Save what I ticked')}
            </button>
            <button type="button" onClick={discard} className={SECONDARY} data-testid="report-draft-discard">
              {t('reportDraft.discard', 'Discard this draft')}
            </button>
          </div>

          {approvedSections.length > 0 && (
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer">{t('reportDraft.previewToggle', 'Preview the text')}</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-300" data-testid="report-draft-preview">
                {composeReportText(
                  draft,
                  approvedSections,
                  (section) => reportSectionLabel(t, section),
                  [...Object.keys(refMap), UNKNOWN_PLAYER_REF],
                  nameForRef,
                )}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportDraftPanel;
