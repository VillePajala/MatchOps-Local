/**
 * FilterControls component - displays filters for season, tournament, and team
 * Conditionally renders based on active tab
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Season, Tournament, Team } from '@/types';
import { StatsTab } from '../types';

interface FilterControlsProps {
  activeTab: StatsTab;
  seasons: Season[];
  tournaments: Tournament[];
  teams: Team[];
  selectedSeasonIdFilter: string | 'all';
  selectedTournamentIdFilter: string | 'all';
  selectedTeamIdFilter: string | 'all' | 'legacy';
  onSeasonFilterChange: (seasonId: string | 'all') => void;
  onTournamentFilterChange: (tournamentId: string | 'all') => void;
  onTeamFilterChange: (teamId: string | 'all' | 'legacy') => void;
}

export function FilterControls({
  activeTab,
  seasons,
  tournaments,
  teams,
  selectedSeasonIdFilter,
  selectedTournamentIdFilter,
  selectedTeamIdFilter,
  onSeasonFilterChange,
  onTournamentFilterChange,
  onTeamFilterChange,
}: FilterControlsProps) {
  const { t } = useTranslation();

  // Determine grid columns based on visible filters
  // Season/Tournament tabs: Show both primary filter and team filter (if teams exist) = 2 columns
  // Overall/CurrentGame tabs: Only team filter (if teams exist) = 1 column
  const hasSeasonOrTournamentFilter = activeTab === 'season' || activeTab === 'tournament';
  const hasTeamFilter = teams.length > 0;
  const gridCols = hasSeasonOrTournamentFilter && hasTeamFilter ? 'grid-cols-2' : 'grid-cols-1';

  return (
    <div className={`mb-4 mx-1 grid ${gridCols} gap-2`}>
      {activeTab === 'season' && (
        <select
          value={selectedSeasonIdFilter}
          onChange={(e) => onSeasonFilterChange(e.target.value)}
          className="px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">{t('gameStatsModal.filterAllSeasons', 'All Seasons')}</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      {activeTab === 'tournament' && (
        <select
          value={selectedTournamentIdFilter}
          onChange={(e) => onTournamentFilterChange(e.target.value)}
          className="px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">{t('gameStatsModal.filterAllTournaments', 'All Tournaments')}</option>
          {tournaments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {teams.length > 0 && (
        <select
          value={selectedTeamIdFilter}
          onChange={(e) =>
            onTeamFilterChange(e.target.value as 'all' | 'legacy' | string)
          }
          className="px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">{t('loadGameModal.allTeamsFilter', 'All Teams')}</option>
          <option value="legacy">{t('loadGameModal.legacyGamesFilter', 'Legacy Games')}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
