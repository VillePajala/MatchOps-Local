/**
 * FilterControls component - displays filters for season, tournament, series, and team
 * Conditionally renders based on active tab
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Season, Tournament, Team } from '@/types';
import type { TranslationKey } from '@/i18n-types';
import { StatsTab } from '../types';

interface FilterControlsProps {
  activeTab: StatsTab;
  seasons: Season[];
  tournaments: Tournament[];
  teams: Team[];
  selectedSeasonIdFilter: string | 'all';
  selectedTournamentIdFilter: string | 'all';
  selectedTeamIdFilter: string | 'all' | 'legacy';
  selectedSeriesIdFilter: string | 'all';
  onSeasonFilterChange: (seasonId: string | 'all') => void;
  onTournamentFilterChange: (tournamentId: string | 'all') => void;
  onTeamFilterChange: (teamId: string | 'all' | 'legacy') => void;
  onSeriesFilterChange: (seriesId: string | 'all') => void;
}

export function FilterControls({
  activeTab,
  seasons,
  tournaments,
  teams,
  selectedSeasonIdFilter,
  selectedTournamentIdFilter,
  selectedTeamIdFilter,
  selectedSeriesIdFilter,
  onSeasonFilterChange,
  onTournamentFilterChange,
  onTeamFilterChange,
  onSeriesFilterChange,
}: FilterControlsProps) {
  const { t } = useTranslation();

  // Get the selected tournament to show its series
  const selectedTournament = selectedTournamentIdFilter !== 'all'
    ? tournaments.find(tour => tour.id === selectedTournamentIdFilter)
    : null;
  const hasSeries = selectedTournament?.series && selectedTournament.series.length > 0;

  // Determine grid columns based on visible filters
  // Tournament tab with series: 3 columns (tournament, series, team)
  // Season/Tournament tabs without series: 2 columns
  // Overall/CurrentGame tabs: 1 column
  const hasSeasonOrTournamentFilter = activeTab === 'season' || activeTab === 'tournament';
  const hasTeamFilter = teams.length > 0;

  let gridCols = 'grid-cols-1';
  if (activeTab === 'tournament' && hasSeries && hasTeamFilter) {
    gridCols = 'grid-cols-3';
  } else if (activeTab === 'tournament' && hasSeries) {
    gridCols = 'grid-cols-2';
  } else if (hasSeasonOrTournamentFilter && hasTeamFilter) {
    gridCols = 'grid-cols-2';
  }

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
          onChange={(e) => {
            onTournamentFilterChange(e.target.value);
            // Reset series filter when tournament changes
            onSeriesFilterChange('all');
          }}
          className="px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">{t('gameStatsModal.filterAllTournaments', 'All Tournaments')}</option>
          {tournaments.map((tour) => (
            <option key={tour.id} value={tour.id}>
              {tour.name}
            </option>
          ))}
        </select>
      )}
      {/* Series filter - only show when a specific tournament with series is selected */}
      {activeTab === 'tournament' && hasSeries && selectedTournament?.series && (
        <select
          value={selectedSeriesIdFilter}
          onChange={(e) => onSeriesFilterChange(e.target.value)}
          className="px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-amber-300 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
        >
          <option value="all">{t('gameStatsModal.filterAllSeries', 'All Series')}</option>
          {selectedTournament.series.map((s) => (
            <option key={s.id} value={s.id}>
              {t(`common.level${s.level}` as TranslationKey, s.level)}
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
