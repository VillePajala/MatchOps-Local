import React from 'react';
import { useTranslation } from 'react-i18next';
import type { HeadToHeadRow } from '@/utils/headToHead';
import { sectionLabelStyle, secondaryButtonStyle } from '@/styles/modalStyles';

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
    <div className="font-ui" data-testid="head-to-head-card">
      <h3 className={`${sectionLabelStyle} px-1 mb-1`}>
        {t('gameStatsModal.headToHead', 'By opponent')}
      </h3>
      <p className="px-1 mb-2.5 text-[13px] text-ink-3">
        {t('gameStatsModal.headToHeadHint', 'Your record against each team in this view.')}
      </p>

      {/* Fixed layout: the number columns get set widths and the team column
          takes the rest, truncating a long name - so the numbers always fit
          on a 320-412px phone. overflow-x-auto stays as a last resort for very
          large text; the page itself must never scroll sideways. */}
      <div className="s1-list overflow-x-auto py-1">
        <table className="w-full table-fixed">
          <thead>
            <tr className="h-[34px] text-xs font-semibold uppercase tracking-[0.03em] text-ink-3">
              <th scope="col" className="text-left font-semibold py-0 pl-3.5 pr-1.5">
                {t('gameStatsModal.headToHeadTeam', 'Team')}
              </th>
              <th scope="col" className="w-8 text-center font-semibold py-0 px-1.5">
                {t('gameStatsModal.headToHeadPlayed', 'P')}
              </th>
              <th scope="col" className="w-16 text-center font-semibold py-0 px-1.5 whitespace-nowrap">
                {t('gameStatsModal.headToHeadRecord', 'W-D-L')}
              </th>
              <th scope="col" className="w-[4.25rem] text-right font-semibold py-0 px-1.5 whitespace-nowrap">
                {t('gameStatsModal.headToHeadGoals', 'Goals')}
              </th>
              <th scope="col" className="w-12 text-right font-semibold py-0 pl-1.5 pr-3.5">
                {t('gameStatsModal.headToHeadGd', 'GD')}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.key}
                className="h-11 border-t border-hairline tabular-nums"
                data-testid={`head-to-head-row-${row.key}`}
              >
                <td className="py-0 pl-3.5 pr-1.5 text-[15px] font-semibold text-ink truncate" title={row.opponent}>
                  {row.opponent}
                </td>
                <td className="py-0 px-1.5 text-center text-[15px] text-ink-2">
                  {row.gamesPlayed}
                </td>
                {/* Green-grey-red is the app's own W-D-L convention, so the
                    shape of a row reads before any of it is actually read. */}
                <td className="py-0 px-1.5 text-center text-[15px] font-bold whitespace-nowrap">
                  <span className={row.wins > 0 ? 'text-win' : 'text-ink-3'}>{row.wins}</span>
                  <span className="font-medium text-ink-3/60">-</span>
                  <span className={row.ties > 0 ? 'text-draw' : 'text-ink-3'}>{row.ties}</span>
                  <span className="font-medium text-ink-3/60">-</span>
                  <span className={row.losses > 0 ? 'text-loss' : 'text-ink-3'}>{row.losses}</span>
                </td>
                <td className="py-0 px-1.5 text-right text-[15px] text-ink-2 whitespace-nowrap">
                  {row.goalsFor}–{row.goalsAgainst}
                </td>
                <td
                  className={`py-0 pl-1.5 pr-3.5 text-right font-display text-xl font-bold italic ${
                    row.goalDifference > 0
                      ? 'text-win'
                      : row.goalDifference < 0
                        ? 'text-loss'
                        : 'text-draw'
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
          className={`${secondaryButtonStyle} mt-2.5 w-full`}
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
