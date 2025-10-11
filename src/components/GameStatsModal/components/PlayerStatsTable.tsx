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

  return (
    <table className="w-full text-sm table-fixed">
      <thead className="text-slate-300">
        <tr className="border-b border-slate-700">
          <th
            className="px-2 py-2 text-left cursor-pointer hover:bg-slate-800/60"
            style={{ width: '40%' }}
            onClick={() => onSort('name')}
          >
            <div className="flex items-center">
              {t('common.player', 'Pelaaja')} {getSortIcon('name')}
            </div>
          </th>
          <th
            className="px-0.5 py-2 text-center cursor-pointer hover:bg-slate-800/60"
            style={{ width: '10%' }}
            onClick={() => onSort('gamesPlayed')}
          >
            <div className="flex items-center justify-center text-xs">
              {t('common.gamesPlayedShort', 'GP')} {getSortIcon('gamesPlayed')}
            </div>
          </th>
          <th
            className="px-0.5 py-2 text-center cursor-pointer hover:bg-slate-800/60"
            style={{ width: '10%' }}
            onClick={() => onSort('goals')}
          >
            <div className="flex items-center justify-center text-xs">
              {t('common.goalsShort', 'M')} {getSortIcon('goals')}
            </div>
          </th>
          <th
            className="px-0.5 py-2 text-center cursor-pointer hover:bg-slate-800/60"
            style={{ width: '10%' }}
            onClick={() => onSort('assists')}
          >
            <div className="flex items-center justify-center text-xs">
              {t('common.assistsShort', 'S')} {getSortIcon('assists')}
            </div>
          </th>
          <th
            className="px-0.5 py-2 text-center cursor-pointer hover:bg-slate-800/60"
            style={{ width: '15%' }}
            onClick={() => onSort('totalScore')}
          >
            <div className="flex items-center justify-center text-xs">
              {t('common.totalScoreShort', 'Pts')} {getSortIcon('totalScore')}
            </div>
          </th>
          <th
            className="px-0.5 py-2 text-center cursor-pointer hover:bg-slate-800/60"
            style={{ width: '15%' }}
            onClick={() => onSort('avgPoints')}
          >
            <div className="flex items-center justify-center text-xs">
              {t('common.avgPointsShort', 'KA')} {getSortIcon('avgPoints')}
            </div>
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
