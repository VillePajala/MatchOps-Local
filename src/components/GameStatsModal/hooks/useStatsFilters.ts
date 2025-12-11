import { useCallback, useEffect, useState } from 'react';
import type { GameType } from '@/types/game';
import type { StatsTab } from '../types';

export interface StatsFiltersState {
  selectedSeasonIdFilter: string | 'all';
  selectedTournamentIdFilter: string | 'all';
  selectedTeamIdFilter: string | 'all' | 'legacy';
  selectedSeriesIdFilter: string | 'all';
  selectedGameTypeFilter: GameType | 'all';
  selectedClubSeason: string;
}

export interface StatsFiltersHandlers {
  onSeasonFilterChange: (seasonId: string | 'all') => void;
  onTournamentFilterChange: (tournamentId: string | 'all') => void;
  onTeamFilterChange: (teamId: string | 'all' | 'legacy') => void;
  onSeriesFilterChange: (seriesId: string | 'all') => void;
  onGameTypeFilterChange: (gameType: GameType | 'all') => void;
  onClubSeasonChange: (season: string) => void;
  clearCollapsibleFilters: (options?: {
    resetSeries?: boolean;
    resetTeam?: boolean;
    resetGameType?: boolean;
    resetClubSeason?: boolean;
  }) => void;
}

interface UseStatsFiltersParams {
  activeTab: StatsTab;
}

export function useStatsFilters({ activeTab }: UseStatsFiltersParams) {
  const [selectedSeasonIdFilter, setSelectedSeasonIdFilter] = useState<string | 'all'>('all');
  const [selectedTournamentIdFilter, setSelectedTournamentIdFilter] = useState<string | 'all'>('all');
  const [selectedTeamIdFilter, setSelectedTeamIdFilter] = useState<string | 'all' | 'legacy'>('all');
  const [selectedSeriesIdFilter, setSelectedSeriesIdFilter] = useState<string | 'all'>('all');
  const [selectedGameTypeFilter, setSelectedGameTypeFilter] = useState<GameType | 'all'>('all');
  const [selectedClubSeason, setSelectedClubSeason] = useState<string>('all');

  // Reset all filters when the active tab changes to keep each tab isolated.
  useEffect(() => {
    setSelectedSeasonIdFilter('all');
    setSelectedTournamentIdFilter('all');
    setSelectedTeamIdFilter('all');
    setSelectedSeriesIdFilter('all');
    setSelectedGameTypeFilter('all');
    setSelectedClubSeason('all');
  }, [activeTab]);

  const onSeasonFilterChange = useCallback((seasonId: string | 'all') => {
    setSelectedSeasonIdFilter(seasonId);
  }, []);

  const onTournamentFilterChange = useCallback((tournamentId: string | 'all') => {
    setSelectedTournamentIdFilter(tournamentId);
    setSelectedSeriesIdFilter('all'); // ensure series resets when switching tournaments
  }, []);

  const onTeamFilterChange = useCallback((teamId: string | 'all' | 'legacy') => {
    setSelectedTeamIdFilter(teamId);
  }, []);

  const onSeriesFilterChange = useCallback((seriesId: string | 'all') => {
    setSelectedSeriesIdFilter(seriesId);
  }, []);

  const onGameTypeFilterChange = useCallback((gameType: GameType | 'all') => {
    setSelectedGameTypeFilter(gameType);
  }, []);

  const onClubSeasonChange = useCallback((season: string) => {
    setSelectedClubSeason(season);
  }, []);

  const clearCollapsibleFilters = useCallback(
    ({
      resetSeries = true,
      resetTeam = true,
      resetGameType = true,
      resetClubSeason = true,
    }: {
      resetSeries?: boolean;
      resetTeam?: boolean;
      resetGameType?: boolean;
      resetClubSeason?: boolean;
    } = {}) => {
      if (resetSeries) setSelectedSeriesIdFilter('all');
      if (resetTeam) setSelectedTeamIdFilter('all');
      if (resetGameType) setSelectedGameTypeFilter('all');
      if (resetClubSeason) setSelectedClubSeason('all');
    },
    []
  );

  return {
    filters: {
      selectedSeasonIdFilter,
      selectedTournamentIdFilter,
      selectedTeamIdFilter,
      selectedSeriesIdFilter,
      selectedGameTypeFilter,
      selectedClubSeason,
    },
    handlers: {
      onSeasonFilterChange,
      onTournamentFilterChange,
      onTeamFilterChange,
      onSeriesFilterChange,
      onGameTypeFilterChange,
      onClubSeasonChange,
      clearCollapsibleFilters,
    },
  };
}
