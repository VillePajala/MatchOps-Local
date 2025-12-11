import { useCallback, useState } from 'react';
import type { GameType, Gender } from '@/types/game';

export interface StatsFiltersState {
  selectedSeasonIdFilter: string | 'all';
  selectedTournamentIdFilter: string | 'all';
  selectedTeamIdFilter: string | 'all' | 'legacy';
  selectedSeriesIdFilter: string | 'all';
  selectedGameTypeFilter: GameType | 'all';
  selectedGenderFilter: Gender | 'all';
  selectedClubSeason: string;
}

export interface StatsFiltersHandlers {
  onSeasonFilterChange: (seasonId: string | 'all') => void;
  onTournamentFilterChange: (tournamentId: string | 'all') => void;
  onTeamFilterChange: (teamId: string | 'all' | 'legacy') => void;
  onSeriesFilterChange: (seriesId: string | 'all') => void;
  onGameTypeFilterChange: (gameType: GameType | 'all') => void;
  onGenderFilterChange: (gender: Gender | 'all') => void;
  onClubSeasonChange: (season: string) => void;
  clearCollapsibleFilters: (options?: {
    resetSeries?: boolean;
    resetTeam?: boolean;
    resetGameType?: boolean;
    resetGender?: boolean;
    resetClubSeason?: boolean;
  }) => void;
  /**
   * Resets all filters to their default 'all' values.
   * Call this from tab button onClick handlers to ensure each tab starts clean.
   */
  resetAllFilters: () => void;
}

export function useStatsFilters() {
  const [selectedSeasonIdFilter, setSelectedSeasonIdFilter] = useState<string | 'all'>('all');
  const [selectedTournamentIdFilter, setSelectedTournamentIdFilter] = useState<string | 'all'>('all');
  const [selectedTeamIdFilter, setSelectedTeamIdFilter] = useState<string | 'all' | 'legacy'>('all');
  const [selectedSeriesIdFilter, setSelectedSeriesIdFilter] = useState<string | 'all'>('all');
  const [selectedGameTypeFilter, setSelectedGameTypeFilter] = useState<GameType | 'all'>('all');
  const [selectedGenderFilter, setSelectedGenderFilter] = useState<Gender | 'all'>('all');
  const [selectedClubSeason, setSelectedClubSeason] = useState<string>('all');

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

  const onGenderFilterChange = useCallback((gender: Gender | 'all') => {
    setSelectedGenderFilter(gender);
  }, []);

  const onClubSeasonChange = useCallback((season: string) => {
    setSelectedClubSeason(season);
  }, []);

  const clearCollapsibleFilters = useCallback(
    ({
      resetSeries = true,
      resetTeam = true,
      resetGameType = true,
      resetGender = true,
      resetClubSeason = true,
    }: {
      resetSeries?: boolean;
      resetTeam?: boolean;
      resetGameType?: boolean;
      resetGender?: boolean;
      resetClubSeason?: boolean;
    } = {}) => {
      if (resetSeries) setSelectedSeriesIdFilter('all');
      if (resetTeam) setSelectedTeamIdFilter('all');
      if (resetGameType) setSelectedGameTypeFilter('all');
      if (resetGender) setSelectedGenderFilter('all');
      if (resetClubSeason) setSelectedClubSeason('all');
    },
    []
  );

  const resetAllFilters = useCallback(() => {
    setSelectedSeasonIdFilter('all');
    setSelectedTournamentIdFilter('all');
    setSelectedTeamIdFilter('all');
    setSelectedSeriesIdFilter('all');
    setSelectedGameTypeFilter('all');
    setSelectedGenderFilter('all');
    setSelectedClubSeason('all');
  }, []);

  return {
    filters: {
      selectedSeasonIdFilter,
      selectedTournamentIdFilter,
      selectedTeamIdFilter,
      selectedSeriesIdFilter,
      selectedGameTypeFilter,
      selectedGenderFilter,
      selectedClubSeason,
    },
    handlers: {
      onSeasonFilterChange,
      onTournamentFilterChange,
      onTeamFilterChange,
      onSeriesFilterChange,
      onGameTypeFilterChange,
      onGenderFilterChange,
      onClubSeasonChange,
      clearCollapsibleFilters,
      resetAllFilters,
    },
  };
}
