/**
 * FilterControls component - displays filters for season, tournament, series, and team
 * Conditionally renders based on active tab
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Season, Tournament, Team } from '@/types';
import type { TranslationKey } from '@/i18n-types';
import type { GameType } from '@/types/game';
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
  selectedGameTypeFilter?: GameType | 'all';
  onSeasonFilterChange: (seasonId: string | 'all') => void;
  onTournamentFilterChange: (tournamentId: string | 'all') => void;
  onTeamFilterChange: (teamId: string | 'all' | 'legacy') => void;
  onSeriesFilterChange: (seriesId: string | 'all') => void;
  onGameTypeFilterChange?: (gameType: GameType | 'all') => void;
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
  selectedGameTypeFilter = 'all',
  onSeasonFilterChange,
  onTournamentFilterChange,
  onTeamFilterChange,
  onSeriesFilterChange,
  onGameTypeFilterChange,
}: FilterControlsProps) {
  const { t } = useTranslation();

  // Get the selected tournament to show its series
  const selectedTournament = selectedTournamentIdFilter !== 'all'
    ? tournaments.find(tour => tour.id === selectedTournamentIdFilter)
    : null;
  const hasSeries = selectedTournament?.series && selectedTournament.series.length > 0;

  // Determine grid columns based on visible filters
  // Count visible filters: season/tournament + series (if applicable) + team + game type
  const hasSeasonOrTournamentFilter = activeTab === 'season' || activeTab === 'tournament';
  const hasTeamFilter = teams.length > 0 && activeTab !== 'currentGame';
  const hasGameTypeFilter = !!onGameTypeFilterChange && activeTab !== 'currentGame';

  let filterCount = 0;
  if (hasSeasonOrTournamentFilter) filterCount++;
  if (activeTab === 'tournament' && hasSeries) filterCount++;
  if (hasTeamFilter) filterCount++;
  if (hasGameTypeFilter) filterCount++;

  let gridCols = 'grid-cols-1';
  if (filterCount === 4) gridCols = 'grid-cols-4';
  else if (filterCount === 3) gridCols = 'grid-cols-3';
  else if (filterCount === 2) gridCols = 'grid-cols-2';

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
      {/* Team filter - not shown for currentGame tab (only shows current game stats) */}
      {teams.length > 0 && activeTab !== 'currentGame' && (
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
      {/* Game Type filter - not shown for currentGame tab */}
      {hasGameTypeFilter && (
        <select
          value={selectedGameTypeFilter}
          onChange={(e) => onGameTypeFilterChange?.(e.target.value as GameType | 'all')}
          className="px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">{t('gameStatsModal.filterAllGameTypes', 'All Sports')}</option>
          <option value="soccer">{t('common.gameTypeSoccer', 'Soccer')}</option>
          <option value="futsal">{t('common.gameTypeFutsal', 'Futsal')}</option>
        </select>
      )}
    </div>
  );
}
