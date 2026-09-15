import React from 'react';
import { useTranslation } from 'react-i18next';
import type { HeadToHeadRow } from '@/utils/headToHead';

/**
 * Your record against each opponent in the current scope.
 *
 * A TABLE, not a row of cards. Every row carries the same five numbers and the
 * question a coach asks of it is comparative - "who do we struggle with" - so
 * the figures have to line up in columns to be read at all. Tabular numerals
 * for the same reason.
 *
 * ONLY SHOWN WHEN THERE IS SOMETHING TO COMPARE. With a single opponent the
 * table says exactly what the record card above it already said, in more
 * space; the caller decides, and the empty case renders nothing.
 *
 * Scope belongs to the caller (see `utils/headToHead.ts`): these rows mean
 * "in this competition", because a club name does not denote the same squad
 * across different ones.
 */
export interface HeadToHeadCardProps {
  rows: HeadToHeadRow[];
  /** Caps the rows shown; the rest sit behind "show all". */
  initialRows?: number;
}

export function HeadToHeadCard({ rows, initialRows = 6 }: HeadToHeadCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(false);

  if (rows.length < 2) return null;

  const visible = expanded ? rows : rows.slice(0, initialRows);

  return (
    <div
      className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-4"
      data-testid="head-to-head-card"
    >
      <h3 className="text-xl font-semibold text-slate-200 mb-1">
        {t('gameStatsModal.headToHead', 'By opponent')}
      </h3>
      <p className="text-xs text-slate-400 mb-3">
        {t('gameStatsModal.headToHeadHint', 'Your record against each team in this view.')}
      </p>

      {/* Its own scroller: a long team name must not push the numbers off the
          page, and the page itself must never scroll sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-white/10">
              <th scope="col" className="text-left font-medium py-1.5 px-2">
                {t('gameStatsModal.headToHeadTeam', 'Team')}
              </th>
              <th scope="col" className="text-right font-medium py-1.5 px-2">
                {t('gameStatsModal.headToHeadPlayed', 'P')}
              </th>
              <th scope="col" className="text-right font-medium py-1.5 px-2 whitespace-nowrap">
                {t('gameStatsModal.headToHeadRecord', 'W-D-L')}
              </th>
              <th scope="col" className="text-right font-medium py-1.5 px-2 whitespace-nowrap">
                {t('gameStatsModal.headToHeadGoals', 'Goals')}
              </th>
              <th scope="col" className="text-right font-medium py-1.5 px-2">
                {t('gameStatsModal.headToHeadGd', 'GD')}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.key}
                className="border-b border-white/5"
                data-testid={`head-to-head-row-${row.key}`}
              >
                <td className="py-1.5 px-2 text-slate-200 max-w-[10rem] truncate" title={row.opponent}>
                  {row.opponent}
                </td>
                <td className="py-1.5 px-2 text-right text-slate-300 tabular-nums">
                  {row.gamesPlayed}
                </td>
                {/* Green-grey-red is the app's own W-D-L convention, so the
                    shape of a row reads before any of it is actually read. */}
                <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                  <span className="text-green-400 font-bold">{row.wins}</span>
                  <span className="text-slate-500">-{row.ties}-</span>
                  <span className="text-red-400 font-bold">{row.losses}</span>
                </td>
                <td className="py-1.5 px-2 text-right text-slate-300 tabular-nums whitespace-nowrap">
                  {row.goalsFor}–{row.goalsAgainst}
                </td>
                <td
                  className={`py-1.5 px-2 text-right font-bold tabular-nums ${
                    row.goalDifference > 0
                      ? 'text-green-400'
                      : row.goalDifference < 0
                        ? 'text-red-400'
                        : 'text-slate-300'
                  }`}
                >
                  {row.goalDifference > 0 ? '+' : ''}
                  {row.goalDifference}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > initialRows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          data-testid="head-to-head-toggle"
          className="mt-3 w-full px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-semibold transition-colors"
        >
          {expanded
            ? t('gameStatsModal.headToHeadShowLess', 'Show less')
            : t('gameStatsModal.headToHeadShowAll', 'Show all {{count}} teams', {
                count: rows.length,
              })}
        </button>
      )}
    </div>
  );
}

export default HeadToHeadCard;
