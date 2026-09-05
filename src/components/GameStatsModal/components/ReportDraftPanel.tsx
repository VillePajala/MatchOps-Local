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

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineSparkles } from 'react-icons/hi2';
import type { GameEvent } from '@/types/game';
import type { Player } from '@/types';
import type { AppState } from '@/types/game';
import { DraftingError, draftMatchReport, estimateDraftUsd, type ReportDraft } from '@/utils/aiDrafting';
import { applyReportDraft, composeReportText, type ApplyMode } from '@/utils/applyReportDraft';
import { buildGamePacket } from '@/utils/gamePacket';
import { reportSectionLabel } from '@/utils/reportSections';
import { useAiProviderState } from '@/utils/aiProvider';
import { recordAiUsage } from '@/utils/aiUsage';
import { useToast } from '@/contexts/ToastProvider';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import logger from '@/utils/logger';

export interface ReportDraftPanelProps {
  /** The finished game the draft is about. */
  game: AppState;
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

const ReportDraftPanel: React.FC<ReportDraftPanelProps> = ({ game, players, stamp, onApply }) => {
  const { t } = useTranslation();
  const ai = useAiProviderState();
  const { showToast } = useToast();

  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [refMap, setRefMap] = useState<Record<string, string>>({});
  const [skippedSections, setSkippedSections] = useState<Set<string>>(new Set());
  const [skippedNotes, setSkippedNotes] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<ApplyMode>('append');
  const [undoText, setUndoText] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Built fresh for the estimate so a settings change (pseudonymization) is
  // reflected before the coach sees a number.
  const estimate = useMemo(() => {
    if (!ai.connected) return 0;
    try {
      const { packet } = buildGamePacket({ game, players, pseudonymize: ai.pseudonymize });
      return estimateDraftUsd(packet);
    } catch {
      return 0;
    }
  }, [ai.connected, ai.pseudonymize, game, players]);

  /**
   * Codes are what the provider saw; the coach should see the child. The
   * mapping never left the device, so resolving it for display costs nothing.
   */
  const nameForRef = useCallback(
    (ref: string): string => {
      const player = players.find((p) => p.id === refMap[ref]);
      return player?.nickname?.trim() || player?.name || t('reportDraft.unknownPlayer', 'Unidentified player');
    },
    [players, refMap, t],
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
      existingReport: game.gameNotes ?? '',
      mode,
      labelFor: (section) => reportSectionLabel(t, section),
      refToPlayerId: refMap,
      stamp,
    });
  }, [draft, approvedSections, approvedNoteIndexes, game.gameNotes, mode, refMap, stamp, t]);

  const runDraft = useCallback(async () => {
    if (drafting) return;
    setDrafting(true);
    setUndoText(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { packet, refToPlayerId } = buildGamePacket({ game, players, pseudonymize: ai.pseudonymize });
      const result = await draftMatchReport({ packet, signal: controller.signal });
      // Real token usage when the provider reported it, else our own estimate.
      recordAiUsage('drafting', result.usage?.estimatedUsd ?? estimateDraftUsd(packet));
      setDraft(result);
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
      abortRef.current = null;
      setDrafting(false);
    }
  }, [ai.pseudonymize, drafting, game, players, showToast, t]);

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
      setUndoText(preview.replacedReport ?? null);
      setDraft(null);
      showToast(t('reportDraft.applied', 'Draft saved to the match report.'), 'success');
    } finally {
      setApplying(false);
    }
  }, [applying, onApply, preview, showToast, t]);

  const undo = useCallback(() => {
    if (undoText === null) return;
    const stored = onApply({ gameNotes: undoText, aiMeta: undefined, noteEvents: [] });
    if (stored) {
      setUndoText(null);
      showToast(t('reportDraft.undone', 'Your earlier report text is back.'), 'success');
    }
  }, [onApply, showToast, t, undoText]);

  const discard = useCallback(() => {
    setDraft(null);
    setUndoText(null);
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
            <button type="button" onClick={cancel} className={SECONDARY} data-testid="report-draft-cancel">
              {t('reportDraft.cancel', 'Cancel')}
            </button>
          ) : (
            <button type="button" onClick={() => void runDraft()} className={PRIMARY} data-testid="report-draft-start">
              <HiOutlineSparkles className="text-base" />
              {t('reportDraft.start', 'Draft the report')}
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
            {t('reportDraft.reviewHint', 'Untick anything you do not want. Only ticked items are saved.')}
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
                  {text}
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
                    {note.text}
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
            {mode === 'replace' && (game.gameNotes ?? '').trim() && (
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
                {composeReportText(draft, approvedSections, (section) => reportSectionLabel(t, section))}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportDraftPanel;
