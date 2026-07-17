'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiCheckCircle, HiOutlineExclamationCircle, HiChevronRight } from 'react-icons/hi';
import type { GameCompleteness, CountCheck } from '@/utils/gameCompleteness';

interface GameWrapUpCardProps {
  completeness: GameCompleteness;
  /** Routes the settings-backed rows (report, positions, competition/team)
   *  to GAME settings (Ottelun tiedot) - W6: rows navigate to where the
   *  item is completed. */
  onOpenSettings?: () => void;
  /** Routes the assessments row to the player-assessment editor. */
  onOpenAssessments?: () => void;
}

type RowStatus = 'done' | 'todo';

const countStatus = (c: CountCheck): RowStatus => (c.total > 0 && c.done >= c.total ? 'done' : 'todo');

/**
 * Post-game "Finish this game" checklist. A router-with-progress over the
 * existing editors: each row shows whether that part of the record is done and
 * (where it applies) taps into Game Settings. Reads the shared completeness
 * model, so it never disagrees with the badges.
 */
const GameWrapUpCard: React.FC<GameWrapUpCardProps> = ({ completeness, onOpenSettings, onOpenAssessments }) => {
  const { t } = useTranslation();

  interface Row {
    key: string;
    label: string;
    status: RowStatus;
    count?: CountCheck;
    onClick?: () => void;
  }

  const rows: Row[] = [];
  if (!completeness.roster) {
    rows.push({ key: 'roster', label: t('gameStatsModal.wrapUpRoster', 'Squad selected'), status: 'todo', onClick: onOpenSettings });
  }
  rows.push({
    key: 'report',
    label: t('gameStatsModal.wrapUpReport', 'Match report'),
    status: completeness.report ? 'done' : 'todo',
    onClick: onOpenSettings,
  });
  rows.push({
    key: 'positions',
    label: t('gameStatsModal.wrapUpPositions', 'Positions played'),
    status: countStatus(completeness.positions),
    count: completeness.positions,
    onClick: onOpenSettings,
  });
  rows.push({
    key: 'assessments',
    label: t('gameStatsModal.wrapUpAssessments', 'Player assessments'),
    status: countStatus(completeness.assessments),
    count: completeness.assessments,
    onClick: onOpenAssessments,
  });
  rows.push({
    key: 'competition',
    label: t('gameStatsModal.wrapUpCompetition', 'Competition & team'),
    status: completeness.competition && completeness.team ? 'done' : 'todo',
    onClick: onOpenSettings,
  });

  const done = completeness.coreComplete;

  return (
    <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-lg font-semibold text-slate-200">{t('gameStatsModal.wrapUpTitle', 'Finish this game')}</h3>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            done ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                 : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
          }`}
        >
          {done ? t('gameStatsModal.wrapUpComplete', 'Complete') : t('gameStatsModal.wrapUpPartial', 'Needs finishing')}
        </span>
      </div>
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
                {row.status === 'done'
                  ? <HiCheckCircle className="shrink-0 text-emerald-400 text-lg" />
                  : <HiOutlineExclamationCircle className="shrink-0 text-amber-400 text-lg" />}
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
