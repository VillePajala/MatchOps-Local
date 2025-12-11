/**
 * CollapsibleFilters component - shows primary filter + collapsible panel
 * Primary filter (Tournament/Season) is always visible
 * Secondary filters (Series, Team, Game Type) are behind a Filters button
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HiAdjustmentsHorizontal } from 'react-icons/hi2';
import { Season, Tournament, Team } from '@/types';
import type { TranslationKey } from '@/i18n-types';
import type { GameType } from '@/types/game';
import { StatsTab } from '../types';
import { ClubSeasonFilter } from './ClubSeasonFilter';
import type { StatsFiltersHandlers, StatsFiltersState } from '../hooks/useStatsFilters';

interface CollapsibleFiltersProps {
  activeTab: StatsTab;
  seasons: Season[];
  tournaments: Tournament[];
  teams: Team[];
  filters: StatsFiltersState;
  handlers: StatsFiltersHandlers;
  availableClubSeasons?: string[];
  hasConfiguredSeasonDates?: boolean;
  isLoadingSettings?: boolean;
  onOpenSettings?: () => void;
  // Optional custom primary filter (e.g., Player combobox)
  children?: React.ReactNode;
}

export function CollapsibleFilters({
  activeTab,
  seasons,
  tournaments,
  teams,
  filters,
  handlers,
  availableClubSeasons = [],
  hasConfiguredSeasonDates = false,
  isLoadingSettings = false,
  onOpenSettings,
  // Custom primary filter (e.g., Player combobox)
  children,
}: CollapsibleFiltersProps) {
  const {
    selectedSeasonIdFilter,
    selectedTournamentIdFilter,
    selectedTeamIdFilter,
    selectedSeriesIdFilter,
    selectedGameTypeFilter = 'all',
    selectedClubSeason,
  } = filters;

  const {
    onSeasonFilterChange,
    onTournamentFilterChange,
    onTeamFilterChange,
    onSeriesFilterChange,
    onGameTypeFilterChange,
    onClubSeasonChange,
    clearCollapsibleFilters,
  } = handlers;

  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Get the selected tournament to show its series
  const selectedTournament = selectedTournamentIdFilter !== 'all'
    ? tournaments.find(tour => tour.id === selectedTournamentIdFilter)
    : null;
  const hasSeries = selectedTournament?.series && selectedTournament.series.length > 0;

  // Determine which filters are visible
  // Team filter is in collapsible panel for tournament/season tabs, but visible on overall tab
  // Player tab doesn't show team filter (it's player-specific stats)
  const hasTeamFilterInPanel = teams.length > 0 && activeTab !== 'currentGame' && activeTab !== 'overall' && activeTab !== 'player';
  const hasGameTypeFilter = activeTab !== 'currentGame';
  const hasClubSeasonFilter = !!onClubSeasonChange && !!onOpenSettings && (activeTab === 'tournament' || activeTab === 'season' || activeTab === 'overall' || activeTab === 'player');

  // Count active (non-default) filters for badge (only filters in collapsible panel)
  // Primary filters (Tournament/Season/Team) are visible, so don't count them in the badge
  let activeFilterCount = 0;
  // Series is in the collapsible panel (tournament tab)
  if (activeTab === 'tournament' && hasSeries && selectedSeriesIdFilter !== 'all') activeFilterCount++;
  // Team is in the collapsible panel for tournament/season tabs only (not overall)
  if (hasTeamFilterInPanel && selectedTeamIdFilter !== 'all') activeFilterCount++;
  // Game Type and Club Season are always in the collapsible panel
  if (hasGameTypeFilter && selectedGameTypeFilter !== 'all') activeFilterCount++;
  if (hasClubSeasonFilter && selectedClubSeason !== 'all') activeFilterCount++;

  // Check if there are any filters to show in the collapsible panel
  const hasCollapsibleFilters = (activeTab === 'tournament' && hasSeries) || hasTeamFilterInPanel || hasGameTypeFilter || hasClubSeasonFilter;

  return (
    <div className="mb-4 mx-1 flex items-center gap-2">
      {/* Tournament Filter - Always visible on tournament tab */}
      {activeTab === 'tournament' && (
        <select
          value={selectedTournamentIdFilter}
          onChange={(e) => {
                      onTournamentFilterChange(e.target.value);
          }}
          className="flex-1 min-w-0 px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">{t('gameStatsModal.filterAllTournaments', 'All Tournaments')}</option>
          {tournaments.map((tour) => (
            <option key={tour.id} value={tour.id}>
              {tour.name}
            </option>
          ))}
        </select>
      )}

      {/* Season Filter - Always visible on season tab */}
      {activeTab === 'season' && (
        <select
          value={selectedSeasonIdFilter}
          onChange={(e) => onSeasonFilterChange(e.target.value)}
          className="flex-1 min-w-0 px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">{t('gameStatsModal.filterAllSeasons', 'All Seasons')}</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {/* Team Filter - Always visible on overall tab */}
      {activeTab === 'overall' && teams.length > 0 && (
        <select
          value={selectedTeamIdFilter}
          onChange={(e) => onTeamFilterChange(e.target.value as 'all' | 'legacy' | string)}
          className="flex-1 min-w-0 px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
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

      {/* Custom primary filter (e.g., Player combobox) */}
      {children}

      {/* Filter Button - Only show if there are collapsible filters */}
      {hasCollapsibleFilters && (
        <div className="relative flex-shrink-0" ref={panelRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={`flex items-center gap-2 px-3 py-1 rounded-md border transition-colors ${
              isOpen
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : activeFilterCount > 0
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 hover:bg-indigo-600/30'
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <HiAdjustmentsHorizontal className="w-4 h-4" />
            <span className="text-sm font-medium">
              {t('gameStatsModal.filtersButton', 'Filters')}
            </span>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-indigo-500 text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Collapsible Filter Panel */}
          {isOpen && (
            <div className="absolute top-full right-0 mt-2 z-50 min-w-[280px] max-w-[320px] bg-slate-800 border border-slate-600 rounded-lg shadow-xl">
              {/* Panel Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-600">
                <span className="text-sm font-medium text-slate-200">
                  {t('gameStatsModal.filtersTitle', 'Filter Options')}
                </span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => clearCollapsibleFilters({
                      resetSeries: activeTab === 'tournament',
                      resetTeam: hasTeamFilterInPanel,
                      resetGameType: hasGameTypeFilter,
                      resetClubSeason: hasClubSeasonFilter,
                    })}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    {t('gameStatsModal.clearFilters', 'Clear all')}
                  </button>
                )}
              </div>

              {/* Filter Options */}
              <div className="p-3 space-y-3">
                {/* Series Filter */}
                {activeTab === 'tournament' && hasSeries && selectedTournament?.series && (
                  <div>
                    <label className="block text-xs font-medium text-amber-400 mb-1">
                      {t('gameStatsModal.seriesFilterLabel', 'Series')}
                    </label>
                    <select
                      value={selectedSeriesIdFilter}
                      onChange={(e) => onSeriesFilterChange(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-amber-300 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="all">{t('gameStatsModal.filterAllSeries', 'All Series')}</option>
                      {selectedTournament.series.map((s) => (
                        <option key={s.id} value={s.id}>
                          {t(`common.level${s.level}` as TranslationKey, s.level)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Team Filter - only in panel for tournament/season tabs (visible outside on overall tab) */}
                {hasTeamFilterInPanel && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      {t('gameStatsModal.teamFilterLabel', 'Team')}
                    </label>
                    <select
                      value={selectedTeamIdFilter}
                      onChange={(e) => onTeamFilterChange(e.target.value as 'all' | 'legacy' | string)}
                      className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="all">{t('loadGameModal.allTeamsFilter', 'All Teams')}</option>
                      <option value="legacy">{t('loadGameModal.legacyGamesFilter', 'Legacy Games')}</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Game Type Filter */}
                {hasGameTypeFilter && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      {t('common.gameTypeLabel', 'Sport Type')}
                    </label>
                    <select
                      value={selectedGameTypeFilter}
                    onChange={(e) => onGameTypeFilterChange(e.target.value as GameType | 'all')}
                      className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="all">{t('gameStatsModal.filterAllGameTypes', 'All Sports')}</option>
                      <option value="soccer">{t('common.gameTypeSoccer', 'Soccer')}</option>
                      <option value="futsal">{t('common.gameTypeFutsal', 'Futsal')}</option>
                    </select>
                  </div>
                )}

                {/* Club Season Filter (Vuosi) - for Tournament and Season tabs */}
                {hasClubSeasonFilter && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      {t('playerStats.periodLabel', 'Period')}
                    </label>
                    <ClubSeasonFilter
                      selectedSeason={selectedClubSeason}
                      onChange={onClubSeasonChange}
                      seasons={availableClubSeasons}
                      hasConfigured={hasConfiguredSeasonDates}
                      isLoading={isLoadingSettings}
                      onOpenSettings={onOpenSettings!}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
