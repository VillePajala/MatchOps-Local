/**
 * PlayerStatsTable component - displays player statistics in a sortable table
 * Shows goals, assists, total score, games played, and averages
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaSort, FaSortUp, FaSortDown } from 'react-icons/fa';
import { PlayerStatRow } from '@/types';
import { SortableColumn, SortDirection } from '../types';

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
}

export function PlayerStatsTable({
  playerStats,
  sortColumn,
  sortDirection,
  totals,
  onSort,
  onPlayerRowClick,
}: PlayerStatsTableProps) {
  const { t } = useTranslation();

  const getSortIcon = (column: SortableColumn) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? (
        <FaSortUp className="ml-1 w-3 h-3" />
      ) : (
        <FaSortDown className="ml-1 w-3 h-3" />
      );
    }
    return <FaSort className="ml-1 w-3 h-3 opacity-30" />;
  };

  const getAriaSort = (column: SortableColumn): 'ascending' | 'descending' | 'none' => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? 'ascending' : 'descending';
    }
    return 'none';
  };

  return (
    <table className="w-full text-sm table-fixed">
      <thead className="text-slate-300">
        <tr className="border-b border-slate-700">
          <th
            className="px-2 py-2 text-left"
            style={{ width: '40%' }}
            aria-sort={getAriaSort('name')}
          >
            <button
              onClick={() => onSort('name')}
              className="w-full flex items-center hover:bg-slate-800/60 rounded px-1 py-1 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {t('common.player', 'Pelaaja')} {getSortIcon('name')}
            </button>
          </th>
          <th
            className="px-0.5 py-2 text-center"
            style={{ width: '10%' }}
            aria-sort={getAriaSort('gamesPlayed')}
          >
            <button
              onClick={() => onSort('gamesPlayed')}
              className="w-full flex items-center justify-center text-xs hover:bg-slate-800/60 rounded px-1 py-1 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {t('common.gamesPlayedShort', 'GP')} {getSortIcon('gamesPlayed')}
            </button>
          </th>
          <th
            className="px-0.5 py-2 text-center"
            style={{ width: '10%' }}
            aria-sort={getAriaSort('goals')}
          >
            <button
              onClick={() => onSort('goals')}
              className="w-full flex items-center justify-center text-xs hover:bg-slate-800/60 rounded px-1 py-1 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {t('common.goalsShort', 'M')} {getSortIcon('goals')}
            </button>
          </th>
          <th
            className="px-0.5 py-2 text-center"
            style={{ width: '10%' }}
            aria-sort={getAriaSort('assists')}
          >
            <button
              onClick={() => onSort('assists')}
              className="w-full flex items-center justify-center text-xs hover:bg-slate-800/60 rounded px-1 py-1 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {t('common.assistsShort', 'S')} {getSortIcon('assists')}
            </button>
          </th>
          <th
            className="px-0.5 py-2 text-center"
            style={{ width: '15%' }}
            aria-sort={getAriaSort('totalScore')}
          >
            <button
              onClick={() => onSort('totalScore')}
              className="w-full flex items-center justify-center text-xs hover:bg-slate-800/60 rounded px-1 py-1 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {t('common.totalScoreShort', 'Pts')} {getSortIcon('totalScore')}
            </button>
          </th>
          <th
            className="px-0.5 py-2 text-center"
            style={{ width: '15%' }}
            aria-sort={getAriaSort('avgPoints')}
          >
            <button
              onClick={() => onSort('avgPoints')}
              className="w-full flex items-center justify-center text-xs hover:bg-slate-800/60 rounded px-1 py-1 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {t('common.avgPointsShort', 'KA')} {getSortIcon('avgPoints')}
            </button>
          </th>
        </tr>
      </thead>
      <tbody className="text-slate-100">
        {playerStats.length > 0 ? (
          playerStats.map((player) => (
            <tr
              key={player.id}
              className="border-b border-slate-800 hover:bg-slate-800/40 cursor-pointer"
              onClick={() => onPlayerRowClick(player)}
            >
              <td className="px-2 py-2 font-medium truncate">{player.name}</td>
              <td className="px-0.5 py-2 text-center text-yellow-400 font-semibold">
                {player.gamesPlayed}
              </td>
              <td className="px-0.5 py-2 text-center text-yellow-400 font-semibold">
                {player.goals}
              </td>
              <td className="px-0.5 py-2 text-center text-yellow-400 font-semibold">
                {player.assists}
              </td>
              <td className="px-0.5 py-2 text-center text-yellow-400 font-bold">
                {player.totalScore}
              </td>
              <td className="px-0.5 py-2 text-center text-yellow-400 font-semibold">
                {player.avgPoints.toFixed(1)}
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={6} className="py-4 text-center text-slate-400">
              {t('common.noPlayersMatchFilter', 'Ei pelaajia hakusuodattimella')}
            </td>
          </tr>
        )}
        {playerStats.length > 0 && (
          <tr className="border-t border-slate-700 bg-slate-800/60 font-semibold">
            <td className="px-2 py-2">{t('playerStats.totalsRow', 'Totals')}</td>
            <td className="px-0.5 py-2 text-center text-yellow-400">{totals.gamesPlayed}</td>
            <td className="px-0.5 py-2 text-center text-yellow-400">{totals.goals}</td>
            <td className="px-0.5 py-2 text-center text-yellow-400">{totals.assists}</td>
            <td className="px-0.5 py-2 text-center text-yellow-400 font-bold">
              {totals.totalScore}
            </td>
            <td className="px-0.5 py-2 text-center text-yellow-400">
              {totals.gamesPlayed > 0 ? (totals.totalScore / totals.gamesPlayed).toFixed(1) : '0.0'}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
