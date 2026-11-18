/**
 * PlayerStatsTable component - displays player statistics in a sortable table
 * Shows goals, assists, total score, games played, and averages
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiArrowUp, HiArrowDown } from 'react-icons/hi2';
import { PlayerStatRow } from '@/types';
import { SortableColumn, SortDirection } from '../types';
import { formatAppDecimal } from '@/utils/localeFormat';

interface PlayerStatsTableProps {
  playerStats: PlayerStatRow[];
  sortColumn: SortableColumn;
  sortDirection: SortDirection;
  totals: {
    gamesPlayed: number;
    goals: number;
    assists: number;
    totalScore: number;
  };
  onSort: (column: SortableColumn) => void;
  onPlayerRowClick: (player: PlayerStatRow) => void;
  /** Whether a name filter is typed - decides the empty-table text (review 7.L4). */
  hasNameFilter?: boolean;
}

export function PlayerStatsTable({
  playerStats,
  sortColumn,
  sortDirection,
  totals,
  onSort,
  onPlayerRowClick,
  hasNameFilter = false,
}: PlayerStatsTableProps) {
  const { t } = useTranslation();

  // Only the sorted column carries an arrow (in amber, the selection colour);
  // every header is still a button that sorts.
  const getSortIcon = (column: SortableColumn) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? (
      <HiArrowUp className="w-3 h-3 flex-none" strokeWidth={1} aria-hidden="true" />
    ) : (
      <HiArrowDown className="w-3 h-3 flex-none" strokeWidth={1} aria-hidden="true" />
    );
  };

  const getAriaSort = (column: SortableColumn): 'ascending' | 'descending' | 'none' => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? 'ascending' : 'descending';
    }
    return 'none';
  };

  const headerButton = (column: SortableColumn, align: 'left' | 'center') =>
    `w-full min-h-10 flex items-center gap-0.5 ${align === 'left' ? 'justify-start' : 'justify-center'} rounded-lg px-0.5 text-xs font-semibold uppercase tracking-[0.06em] transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-action ${
      sortColumn === column ? 'text-action' : 'text-ink-3'
    }`;

  /** A number cell: the sorted column bold white, zeros dimmed, the rest quiet. */
  const valueCell = (column: SortableColumn, value: number, text: React.ReactNode = value) => (
    <td
      className={`px-0.5 py-0 text-center tabular-nums ${
        value === 0
          ? 'font-medium text-ink-3/70'
          : sortColumn === column
            ? 'font-bold text-ink'
            : 'font-semibold text-ink-2'
      }`}
    >
      {text}
    </td>
  );

  const th = (column: SortableColumn, label: React.ReactNode, width: string, align: 'left' | 'center' = 'center') => (
    <th
      className={align === 'left' ? 'pl-4 pr-1 py-0 text-left' : 'px-0.5 py-0 text-center'}
      style={{ width }}
      aria-sort={getAriaSort(column)}
    >
      <button onClick={() => onSort(column)} className={headerButton(column, align)}>
        {label} {getSortIcon(column)}
      </button>
    </th>
  );

  return (
    <table className="w-full font-ui text-base table-fixed">
      <thead>
        <tr className="h-10">
          {th('name', t('common.player', 'Player'), '42%', 'left')}
          {th('gamesPlayed', t('common.gamesPlayedShort', 'GP'), '10%')}
          {th('goals', t('common.goalsShort', 'G'), '10%')}
          {th('assists', t('common.assistsShort', 'A'), '10%')}
          {th('totalScore', t('common.totalScoreShort', 'Pts'), '14%')}
          {th('avgPoints', t('common.avgPointsShort', 'Avg'), '14%')}
        </tr>
      </thead>
      <tbody>
        {playerStats.length > 0 ? (
          playerStats.map((player) => (
            <tr
              key={player.id}
              className="h-12 border-t border-hairline cursor-pointer transition-colors hover:bg-white/[0.03]"
              onClick={() => onPlayerRowClick(player)}
            >
              <td className="pl-4 pr-1 py-0 font-medium text-ink truncate">{player.name}</td>
              {valueCell('gamesPlayed', player.gamesPlayed)}
              {valueCell('goals', player.goals)}
              {valueCell('assists', player.assists)}
              {valueCell('totalScore', player.totalScore)}
              {valueCell('avgPoints', player.avgPoints, formatAppDecimal(player.avgPoints))}
            </tr>
          ))
        ) : (
          <tr className="border-t border-hairline">
            <td colSpan={6} className="px-4 py-5 text-center text-sm text-ink-3">
              {hasNameFilter
                ? t('common.noPlayersMatchFilter', 'No Players Match Filter')
                : t('common.noPlayersToShow', 'No player statistics for this selection.')}
            </td>
          </tr>
        )}
        {playerStats.length > 0 && (
          <tr className="h-12 border-t border-hairline bg-white/[0.03] font-semibold text-ink tabular-nums">
            <td className="pl-4 pr-1 py-0 text-ink-2">{t('playerStats.totalsRow', 'Totals')}</td>
            <td className="px-0.5 py-0 text-center">{totals.gamesPlayed}</td>
            <td className="px-0.5 py-0 text-center">{totals.goals}</td>
            <td className="px-0.5 py-0 text-center">{totals.assists}</td>
            <td className="px-0.5 py-0 text-center font-bold">
              {totals.totalScore}
            </td>
            <td className="px-0.5 py-0 text-center">
              {totals.gamesPlayed > 0 ? formatAppDecimal(totals.totalScore / totals.gamesPlayed) : formatAppDecimal(0)}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
