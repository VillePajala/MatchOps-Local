'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import ProgressBar from '@/components/ProgressBar';
import { completenessProgress, countRowStatus, goalLogStatus } from '@/utils/gameCompleteness';
import { HiCheckCircle, HiOutlineCheckCircle, HiOutlineExclamationCircle, HiChevronRight } from 'react-icons/hi';
import type { GameCompleteness, CountCheck, CompletenessRowStatus } from '@/utils/gameCompleteness';

interface GameWrapUpCardProps {
  completeness: GameCompleteness;
  /** Routes the settings-backed rows to GAME settings (Ottelun tiedot),
   *  scrolled to the row's own section (W6 + R3). */
  onOpenSettings?: (section: 'roster' | 'competition') => void;
  /** Report and positions live on this same page (Phase 1b): scroll, don't leave. */
  onOpenReport?: () => void;
  onOpenPositions?: () => void;
  /** Routes the assessments row to the player-assessment editor. */
  onOpenAssessments?: () => void;
  /** Kirjuri: recorded clips not yet turned into notes (0 = banner hidden). */
  voiceClipCount?: number;
  /** Opens the goal log, for the two goal rows. */
  onAddGoal?: () => void;
  /** Opens the notes step, for the notes-coverage row. */
  onOpenNotes?: () => void;
  onOpenVoiceNotes?: () => void;
}

type RowStatus = CompletenessRowStatus;

/**
 * Post-game "Finish this game" checklist. A router-with-progress over the
 * existing editors: each row shows whether that part of the record is done and
 * (where it applies) taps into Game Settings. Reads the shared completeness
 * model, so it never disagrees with the badges.
 */
const GameWrapUpCard: React.FC<GameWrapUpCardProps> = ({ onAddGoal, onOpenNotes, completeness, onOpenSettings, onOpenReport, onOpenPositions, onOpenAssessments, voiceClipCount = 0, onOpenVoiceNotes }) => {
  const { t } = useTranslation();
  const progress = completenessProgress(completeness, { voiceClipsPending: voiceClipCount });

  interface Row {
    key: string;
    label: string;
    status: RowStatus;
    count?: CountCheck;
    onClick?: () => void;
  }

  const rows: Row[] = [];
  // Unhandled audio is real unfinished work: the clip is deleted after 30 days
  // and the coach's words go with it. The row appears for a game that has
  // audio or had some, so a coach who never records collects no free tick, and
  // it turns green the moment the last clip is written out.
  if (voiceClipCount > 0 || completeness.dictatedNotes > 0) {
    rows.push({
      key: 'voiceNotes',
      label: voiceClipCount > 0
        ? t('gameStatsModal.wrapUpVoiceNotes', '{{count}} voice notes to review', { count: voiceClipCount })
        : t('gameStatsModal.wrapUpVoiceNotesDone', 'Voice notes written out'),
      status: voiceClipCount > 0 ? 'todo' : 'done',
      onClick: onOpenVoiceNotes,
    });
  }
  // Always a row, done or not: the counter counts it, so the list must show
  // it. Hiding it when done left three rows under a "3/4" (owner, 2026-09-09).
  rows.push({
    key: 'roster',
    label: t('gameStatsModal.wrapUpRoster', 'Squad selected'),
    status: completeness.roster ? 'done' : 'todo',
    onClick: onOpenSettings && (() => onOpenSettings('roster')),
  });
  // The goal log against the scoreboard. Wrong here and the player's goals,
  // the recap, the Taso report and the player summary are all wrong with it.
  rows.push({
    key: 'goals',
    label: t('gameStatsModal.wrapUpGoals', 'Goals logged'),
    status: goalLogStatus(completeness.goalsLogged),
    count: completeness.goalsLogged,
    onClick: onAddGoal,
  });
  if (completeness.goalsAttributed.total > 0) {
    rows.push({
      key: 'scorers',
      label: t('gameStatsModal.wrapUpScorers', 'Goal scorers named'),
      status: countRowStatus(completeness.goalsAttributed) === 'done' ? 'done' : 'partial',
      count: completeness.goalsAttributed,
      onClick: onAddGoal,
    });
  }
  rows.push({
    key: 'report',
    label: t('gameStatsModal.wrapUpReport', 'Match report'),
    status: completeness.report ? 'done' : 'todo',
    onClick: onOpenReport,
  });
  rows.push({
    key: 'positions',
    label: t('gameStatsModal.wrapUpPositions', 'Positions played'),
    status: countRowStatus(completeness.positions),
    count: completeness.positions,
    onClick: onOpenPositions,
  });
  // 0/0 means the feature is off (see computeGameCompleteness), or no squad
  // yet, which the Squad row already says: no row, rather than a permanently
  // unfinished one pointing at a hidden editor.
  if (completeness.assessments.total > 0) {
    rows.push({
      key: 'assessments',
      label: t('gameStatsModal.wrapUpAssessments', 'Player assessments'),
      status: countRowStatus(completeness.assessments),
      count: completeness.assessments,
      onClick: onOpenAssessments,
    });
  }
  rows.push({
    key: 'competition',
    label: t('gameStatsModal.wrapUpCompetition', 'Competition & team'),
    status: completeness.competition && completeness.team ? 'done' : 'todo',
    onClick: onOpenSettings && (() => onOpenSettings('competition')),
  });

  // Clips waiting are unfinished work even when the record itself is complete.
  const done = completeness.coreComplete && voiceClipCount === 0;

  return (
    <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-lg font-semibold text-slate-200">{t('gameStatsModal.wrapUpTitle', 'Checklist')}</h3>
        <span
          className="ml-auto text-sm font-semibold text-slate-300 tabular-nums"
          data-testid="wrap-up-progress-count"
        >
          {progress.done}/{progress.total}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            done ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                 : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
          }`}
        >
          {done ? t('gameStatsModal.wrapUpComplete', 'Complete') : t('gameStatsModal.wrapUpPartial', 'Needs finishing')}
        </span>
      </div>
      {progress.total > 0 && (
        <div className="mb-3" data-testid="wrap-up-progress-bar">
          <ProgressBar current={progress.done} total={progress.total} />
        </div>
      )}
      {/* Notes are shown, not scored: no tick, no amber, not in the fraction.
          A coach owes nobody an observation about every child in every match. */}
      {completeness.notesCoverage.total > 0 && (() => {
        // A button with nothing behind it invites a tap that does nothing, so
        // it is only a button when a caller gave it somewhere to go - the same
        // rule the rows below follow.
        const Tag = onOpenNotes ? 'button' : 'div';
        return (
          <Tag
            {...(onOpenNotes ? { type: 'button' as const, onClick: onOpenNotes } : {})}
            data-testid="wrap-up-notes-line"
            className={`w-full mb-2 px-2 py-1.5 rounded-md text-left text-xs text-slate-400 ${
              onOpenNotes ? 'hover:bg-slate-800/50 transition-colors' : ''
            }`}
          >
            {t('gameStatsModal.wrapUpNotes', 'Notes about players')}{' '}
            <span className="text-slate-300 font-semibold tabular-nums">
              {completeness.notesCoverage.done}/{completeness.notesCoverage.total}
            </span>
          </Tag>
        );
      })()}
      <ul className="space-y-0.5">
        {rows.map(row => {
          const Tag = row.onClick ? 'button' : 'div';
          return (
            <li key={row.key}>
              <Tag
                {...(row.onClick ? { type: 'button' as const, onClick: row.onClick } : {})}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-md text-left ${
                  row.onClick ? 'hover:bg-slate-800/50 transition-colors' : ''
                }`}
              >
                {/* Amber means nothing recorded, and amber is exactly what the
                    progress bar does not count - see countRowStatus. */}
                {row.status === 'done'
                  ? <HiCheckCircle className="shrink-0 text-emerald-400 text-lg" data-testid={`wrap-up-status-${row.key}-done`} />
                  : row.status === 'partial'
                    ? <HiOutlineCheckCircle className="shrink-0 text-emerald-400 text-lg" data-testid={`wrap-up-status-${row.key}-partial`} />
                    : <HiOutlineExclamationCircle className="shrink-0 text-amber-400 text-lg" data-testid={`wrap-up-status-${row.key}-todo`} />}
                <span className="flex-1 text-sm text-slate-200">{row.label}</span>
                {row.count && row.count.total > 0 && (
                  <span className="text-xs font-medium text-slate-400">{row.count.done}/{row.count.total}</span>
                )}
                {row.onClick && <HiChevronRight className="shrink-0 text-slate-500" />}
              </Tag>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default GameWrapUpCard;
