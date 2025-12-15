/**
 * Hook for calculating player statistics based on game events
 * Handles current game, season, tournament, and overall stats
 */

import { useMemo } from 'react';
import { GameEvent, PlayerStatRow } from '@/types';
import { GameStatsParams, SavedGame } from '../types';
import { filterGameIds } from '../utils/gameFilters';

interface UseGameStatsResult {
  stats: PlayerStatRow[];
  gameIds: string[];
  totals: {
    gamesPlayed: number;
    goals: number;
    assists: number;
    totalScore: number;
  };
}

export function useGameStats(params: GameStatsParams): UseGameStatsResult {
  const {
    activeTab,
    savedGames,
    availablePlayers,
    selectedPlayerIds,
    localGameEvents,
    currentGameId,
    selectedSeasonIdFilter,
    selectedTournamentIdFilter,
    selectedTeamIdFilter,
    selectedSeriesIdFilter,
    selectedGameTypeFilter,
    selectedGenderFilter,
    sortColumn,
    sortDirection,
    filterText,
  } = params;

  // Calculate player stats
  const { stats: playerStats, gameIds: processedGameIds } = useMemo(() => {
    // Initialize stats map
    const statsMap: { [key: string]: PlayerStatRow } = {};
    let relevantGameEvents: GameEvent[] = [];
    let processedGameIds: string[] = [];

    if (activeTab === 'currentGame') {
      // Current game: Only include players that were selected
      const playersInGame = availablePlayers.filter(p => selectedPlayerIds?.includes(p.id));
      playersInGame.forEach(player => {
        statsMap[player.id] = {
          ...player,
          goals: 0,
          assists: 0,
          totalScore: 0,
          gamesPlayed: 1,
          avgPoints: 0,
        };
      });

      relevantGameEvents = localGameEvents || [];
      if (currentGameId) {
        processedGameIds = [currentGameId];
      }
    } else {
      // Handle 'season', 'tournament', 'overall' tabs
      // Use shared filtering utility
      processedGameIds = filterGameIds(savedGames, {
        playedOnly: true,
        teamFilter: selectedTeamIdFilter,
        seasonFilter: activeTab === 'season' ? selectedSeasonIdFilter : undefined,
        tournamentFilter: activeTab === 'tournament' ? selectedTournamentIdFilter : undefined,
        seriesFilter: activeTab === 'tournament' ? selectedSeriesIdFilter : undefined,
        gameTypeFilter: selectedGameTypeFilter,
        genderFilter: selectedGenderFilter,
        activeTab
      });

      // Early return if no games to process - avoids expensive operations
      if (processedGameIds.length === 0) {
        return { stats: [], gameIds: [] };
      }

      // Aggregate views: Build statsMap from players that actually played
      processedGameIds.forEach(gameId => {
        const game: SavedGame | undefined = savedGames?.[gameId];
        game?.selectedPlayerIds?.forEach(playerId => {
          const playerInGame = game.availablePlayers?.find(p => p.id === playerId);
          if (playerInGame && !statsMap[playerId]) {
            statsMap[playerId] = {
              ...playerInGame,
              goals: 0,
              assists: 0,
              totalScore: 0,
              gamesPlayed: 0,
              avgPoints: 0,
            };
          }
        });
      });

      // Collect events from the filtered games
      relevantGameEvents = processedGameIds.flatMap(id => (savedGames?.[id] as SavedGame)?.gameEvents || []);

      // Calculate Games Played
      processedGameIds.forEach(gameId => {
        const game: SavedGame | undefined = savedGames?.[gameId];
        if (game) {
          game.selectedPlayerIds?.forEach(playerId => {
            if (statsMap[playerId]) {
              statsMap[playerId].gamesPlayed = (statsMap[playerId].gamesPlayed || 0) + 1;
            }
          });
        }
      });
    }

    // Process relevant events
    relevantGameEvents.forEach(event => {
      if (event.type === 'goal') {
        if (event.scorerId && statsMap[event.scorerId]) {
          statsMap[event.scorerId].goals = (statsMap[event.scorerId].goals || 0) + 1;
          statsMap[event.scorerId].totalScore = (statsMap[event.scorerId].totalScore || 0) + 1;
        }
        if (event.assisterId && statsMap[event.assisterId]) {
          statsMap[event.assisterId].assists = (statsMap[event.assisterId].assists || 0) + 1;
          statsMap[event.assisterId].totalScore = (statsMap[event.assisterId].totalScore || 0) + 1;
        }
      }
    });

    // Calculate average points
    Object.values(statsMap).forEach(player => {
      player.avgPoints = player.gamesPlayed > 0 ? player.totalScore / player.gamesPlayed : 0;
    });

    // Filter and sort
    const filteredAndSortedStats = Object.values(statsMap)
      .filter(player => player.gamesPlayed > 0 && player.name.toLowerCase().includes(filterText.toLowerCase()));

    // Apply sorting
    if (sortColumn) {
      filteredAndSortedStats.sort((a, b) => {
        // Primary sort: by gamesPlayed
        if (a.gamesPlayed > 0 && b.gamesPlayed === 0) return -1;
        if (a.gamesPlayed === 0 && b.gamesPlayed > 0) return 1;

        // Secondary sort: by the selected sortColumn
        let aValue: string | number = '';
        let bValue: string | number = '';

        switch (sortColumn) {
          case 'name':
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
            break;
          case 'goals':
            aValue = a.goals;
            bValue = b.goals;
            break;
          case 'assists':
            aValue = a.assists;
            bValue = b.assists;
            break;
          case 'totalScore':
            aValue = a.totalScore;
            bValue = b.totalScore;
            break;
          case 'fpAwards':
            aValue = a.fpAwards ?? 0;
            bValue = b.fpAwards ?? 0;
            break;
          case 'gamesPlayed':
            aValue = a.gamesPlayed;
            bValue = b.gamesPlayed;
            break;
          case 'avgPoints':
            aValue = a.avgPoints;
            bValue = b.avgPoints;
            break;
        }

        // Apply direction
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }
        return 0;
      });
    }

    return { stats: filteredAndSortedStats, gameIds: processedGameIds };
  }, [
    activeTab,
    localGameEvents,
    savedGames,
    availablePlayers,
    sortColumn,
    sortDirection,
    filterText,
    selectedSeasonIdFilter,
    selectedTournamentIdFilter,
    selectedTeamIdFilter,
    selectedSeriesIdFilter,
    selectedGameTypeFilter,
    selectedGenderFilter,
    currentGameId,
    selectedPlayerIds
  ]);

  // Calculate totals
  const totals = useMemo(() => {
    return playerStats.reduce(
      (acc, p) => {
        acc.gamesPlayed += p.gamesPlayed;
        acc.goals += p.goals;
        acc.assists += p.assists;
        acc.totalScore += p.totalScore;
        return acc;
      },
      { gamesPlayed: 0, goals: 0, assists: 0, totalScore: 0 }
    );
  }, [playerStats]);

  return {
    stats: playerStats,
    gameIds: processedGameIds,
    totals,
  };
}
