'use client';

/**
 * The coach's own notes about one player, read back as prose.
 *
 * They wrote it all, a line at a time, over months. As a list it is a pile of
 * fragments; as a few paragraphs it is what they have actually observed. This
 * organises and adds nothing - the same contract as tidying a report.
 *
 * TWO THINGS ARE DELIBERATE HERE.
 *
 * It is read-only, like the translation panel: no apply path, nothing that can
 * overwrite a note. What comes back is a reading of the record, not part of it.
 *
 * And it says what it is about to send BEFORE sending it. This is the first
 * request that carries observations about one child from several matches at
 * once rather than from one, which is a real widening of what leaves the
 * device. A count of notes and matches on the button is the difference between
 * a coach choosing that and a coach discovering it.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import { useAiProviderState } from '@/utils/aiProvider';
import { recordAiUsage } from '@/utils/aiUsage';
import { DraftingError, groupPlayerNotes, MAX_GROUPED_NOTES, MAX_GROUPING_CHARS } from '@/utils/aiDrafting';
import { redactPlayerNames, playerRedactionHandles } from '@/utils/gamePacket';
import { resolveRefsInText } from '@/utils/applyReportDraft';
import WorkingIndicator from '@/components/WorkingIndicator';
import logger from '@/utils/logger';
import type { Player } from '@/types';

export interface PlayerNoteEntry {
  id: string;
  /** Which match it came from. Counts matches, so two games on one date count as two. */
  gameId: string;
  gameDate: string;
  text: string;
}

interface PlayerNotesSummaryCardProps {
  player: Player;
  /** Notes about this player, newest game first (as the timeline shows them). */
  notes: PlayerNoteEntry[];
  /** Full roster, so other children named in a note are redacted too. */
  roster: Player[];
  language: string;
}

const CARD = 'bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner';
const PRIMARY =
  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500 transition-colors';
const SECONDARY =
  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold text-slate-200 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-slate-500 transition-colors';

const PlayerNotesSummaryCard: React.FC<PlayerNotesSummaryCardProps> = ({
  player,
  notes,
  roster,
  language,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const ai = useAiProviderState();

  const [working, setWorking] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const scope = useMemo(() => {
    const withText = notes.filter((n) => n.text.trim());
    // Two caps bound this request, and the coach is shown the result of BOTH.
    // Counting notes but not their length meant a coach with sixty long notes
    // read an accurate-looking disclosure, pressed the button, and only then
    // was told the request was too big.
    const capped: PlayerNoteEntry[] = [];
    let chars = 0;
    for (const note of withText.slice(0, MAX_GROUPED_NOTES)) {
      // +4 for the "12. " the request numbers each line with.
      const cost = note.text.trim().length + 4;
      if (chars + cost > MAX_GROUPING_CHARS) break;
      chars += cost;
      capped.push(note);
    }
    return {
      notes: capped,
      // By game, not by date: two matches on one Saturday are two matches, and
      // this number is a disclosure, so it has to be right.
      matches: new Set(capped.map((n) => n.gameId).filter(Boolean)).size,
      // Told plainly rather than silently dropped.
      omitted: withText.length - capped.length,
    };
  }, [notes]);

  const run = useCallback(async () => {
    if (working) return;
    setWorking(true);
    setSummary(null);
    try {
      // This player is P1; everyone else the coach may have named is a code too.
      const refFor = new Map<string, string>();
      refFor.set(player.id, 'P1');
      roster
        .filter((p) => p.id !== player.id && playerRedactionHandles(p).length > 0)
        .forEach((p, i) => refFor.set(p.id, `P${i + 2}`));
      const refOf = (playerId: string): string | undefined => refFor.get(playerId);

      // Oldest first: the model is told the order, and a development account
      // read backwards would say the opposite of what happened.
      const ordered = [...scope.notes].reverse();
      const outgoing = ordered.map((n) =>
        ai.pseudonymize ? redactPlayerNames(n.text, roster, refOf) : n.text,
      );

      const result = await groupPlayerNotes({ notes: outgoing, language });
      // Not a report draft: this is text to read, and nothing is saved.
      recordAiUsage('readback', result.estimatedUsd);
      if (result.noteCount !== outgoing.length) {
        // The disclosure said one number and the request carried another. Not
        // worth failing over, but it means the two caps have drifted.
        logger.warn('[playerNotesSummary] sent a different number of notes than disclosed', {
          disclosed: outgoing.length,
          sent: result.noteCount,
        });
      }

      const nameFor = (ref: string): string => {
        for (const [id, r] of refFor) {
          if (r !== ref) continue;
          const found = roster.find((p) => p.id === id);
          return found?.nickname?.trim() || found?.name || ref;
        }
        return ref;
      };
      setSummary(
        ai.pseudonymize ? resolveRefsInText(result.text, [...refFor.values()], nameFor) : result.text,
      );
    } catch (error) {
      const kind = error instanceof DraftingError ? error.kind : 'network';
      const billed = error instanceof DraftingError ? error.billedUsd : undefined;
      if (billed) recordAiUsage('readback', billed);
      logger.warn('[playerNotesSummary] grouping failed', { kind });
      showToast(
        {
          unauthorized: t('reportDraft.errorUnauthorized', 'Connect an AI provider in Settings first.'),
          rateLimited: t('reportDraft.errorRateLimited', 'Your AI provider is rate limiting. Try again shortly.'),
          network: t('reportDraft.errorNetwork', 'Could not reach your AI provider.'),
          rejected: t('reportDraft.errorRejected', 'Your AI provider refused this request.'),
          tooLarge: t('playerNotesSummary.errorTooLarge', 'There are more notes here than one request can carry.'),
          noOutput: t('playerNotesSummary.errorNoOutput', 'The summary came back empty or unfinished.'),
          invalidResponse: t('playerNotesSummary.errorNothing', 'There are no notes about this player yet.'),
        }[kind],
        'error',
      );
    } finally {
      setWorking(false);
    }
  }, [ai.pseudonymize, language, player.id, roster, scope.notes, showToast, t, working]);

  const copy = useCallback(async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      showToast(t('translateReport.copied', 'Copied.'), 'success');
    } catch {
      showToast(t('translateReport.copyFailed', 'Could not copy. Select the text instead.'), 'error');
    }
  }, [showToast, summary, t]);

  // Without a roster there is nothing to build handles from, so redaction would
  // return every name untouched while the card still implied codes. Refusing to
  // offer the button is the only honest option; silently sending cleartext is not.
  const canRedact = !ai.pseudonymize || roster.some((p) => p.id === player.id);

  if (!ai.connected || scope.notes.length < 2 || !canRedact) return null;

  return (
    <div className={CARD} data-testid="player-notes-summary">
      <h3 className="text-lg font-semibold text-slate-200 mb-1">
        {t('playerNotesSummary.title', 'Read these notes as one account')}
      </h3>
      {/* The coach sees the scope before deciding, not afterwards. */}
      <p className="text-xs text-slate-400 mb-3" data-testid="player-notes-summary-scope">
        {t(
          'playerNotesSummary.scope',
          'Sends {{notes}} of your notes about this player, from {{matches}} matches, to your AI provider. Nothing is saved or changed.',
          { notes: scope.notes.length, count: scope.matches },
        )}
      </p>
      {scope.omitted > 0 && (
        <p className="text-xs text-amber-300 mb-3" data-testid="player-notes-summary-omitted">
          {t('playerNotesSummary.omitted', 'The {{count}} oldest notes are left out of this request.', {
            count: scope.omitted,
          })}
        </p>
      )}

      <button
        type="button"
        onClick={() => void run()}
        disabled={working}
        className={PRIMARY}
        data-testid="player-notes-summary-start"
      >
        {t('playerNotesSummary.action', 'Group these notes')}
      </button>
      {working && (
        <WorkingIndicator
          label={t('playerNotesSummary.working', 'Reading your notes...')}
          className="mt-2"
          data-testid="player-notes-summary-working"
        />
      )}

      {summary !== null && (
        <div className="mt-3">
          <p
            className="whitespace-pre-wrap rounded-md bg-slate-800/70 border border-slate-700 p-3 text-sm text-slate-200"
            data-testid="player-notes-summary-output"
          >
            {summary}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {t('playerNotesSummary.footer', 'Your own notes, organised. Nothing here was added to the record.')}
          </p>
          <button
            type="button"
            onClick={() => void copy()}
            className={`${SECONDARY} mt-2`}
            data-testid="player-notes-summary-copy"
          >
            {t('translateReport.copy', 'Copy')}
          </button>
        </div>
      )}
    </div>
  );
};

export default PlayerNotesSummaryCard;
