/**
 * Hook for calculating tournament and season statistics
 * Handles win/loss records, goals for/against, and averages
 */

import { useMemo } from 'react';
import { Season, Tournament } from '@/types';
import type { GameType, Gender } from '@/types/game';
import { StatsTab, TournamentSeasonStats, OverallTournamentSeasonStats } from '../types';
import { SavedGamesCollection } from '@/types';
import { filterGameIds } from '../utils/gameFilters';

interface UseTournamentSeasonStatsParams {
  activeTab: StatsTab;
  savedGames: SavedGamesCollection | null;
  seasons: Season[];
  tournaments: Tournament[];
  selectedSeasonIdFilter: string | 'all';
  selectedTournamentIdFilter: string | 'all';
  selectedTeamIdFilter?: string | 'all' | 'legacy';
  selectedGameTypeFilter?: GameType | 'all';
  selectedGenderFilter?: Gender | 'all';
  // Club season filter params
  selectedClubSeason?: string | 'all';
  clubSeasonStartDate?: string;
  clubSeasonEndDate?: string;
}

export function useTournamentSeasonStats(
  params: UseTournamentSeasonStatsParams
): TournamentSeasonStats[] | OverallTournamentSeasonStats | null {
  const {
    activeTab,
    savedGames,
    seasons,
    tournaments,
    selectedSeasonIdFilter,
    selectedTournamentIdFilter,
    selectedTeamIdFilter = 'all',
    selectedGameTypeFilter = 'all',
    selectedGenderFilter = 'all',
    selectedClubSeason = 'all',
    clubSeasonStartDate = '2000-10-01',
    clubSeasonEndDate = '2000-05-01',
  } = params;

  return useMemo(() => {
    if (activeTab !== 'season' && activeTab !== 'tournament') return null;

    const calculateStats = (gameIds: string[]): TournamentSeasonStats[] | OverallTournamentSeasonStats => {
      if (activeTab === 'season') {
        if (selectedSeasonIdFilter === 'all') {
          // Calculate stats for all seasons
          const seasonStatsMap = new Map<string, TournamentSeasonStats>();

          gameIds.forEach(gameId => {
            const game = savedGames?.[gameId];
            if (!game?.seasonId || game.tournamentId) return;

            const season = seasons.find(s => s.id === game.seasonId);
            if (!season) return;

            if (!seasonStatsMap.has(season.id)) {
              seasonStatsMap.set(season.id, {
                id: season.id,
                name: season.name,
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                ties: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                goalDifference: 0,
                winPercentage: 0,
                averageGoalsFor: 0,
                averageGoalsAgainst: 0,
                lastGameDate: game.gameDate
              });
            }

            const stats = seasonStatsMap.get(season.id)!;
            stats.gamesPlayed++;
            stats.goalsFor += game.homeOrAway === 'home' ? game.homeScore : game.awayScore;
            stats.goalsAgainst += game.homeOrAway === 'home' ? game.awayScore : game.homeScore;

            const ourScore = game.homeOrAway === 'home' ? game.homeScore : game.awayScore;
            const theirScore = game.homeOrAway === 'home' ? game.awayScore : game.homeScore;

            if (ourScore > theirScore) stats.wins++;
            else if (ourScore < theirScore) stats.losses++;
            else stats.ties++;

            if (!stats.lastGameDate || game.gameDate > stats.lastGameDate) {
              stats.lastGameDate = game.gameDate;
            }
          });

          // Calculate derived stats
          const allSeasonStats = Array.from(seasonStatsMap.values()).map(stats => ({
            ...stats,
            goalDifference: stats.goalsFor - stats.goalsAgainst,
            winPercentage: stats.gamesPlayed > 0 ? (stats.wins / stats.gamesPlayed) * 100 : 0,
            averageGoalsFor: stats.gamesPlayed > 0 ? stats.goalsFor / stats.gamesPlayed : 0,
            averageGoalsAgainst: stats.gamesPlayed > 0 ? stats.goalsAgainst / stats.gamesPlayed : 0
          }));

          // Calculate overall stats
          const totalGames = allSeasonStats.reduce((sum, s) => sum + s.gamesPlayed, 0);
          const totalWins = allSeasonStats.reduce((sum, s) => sum + s.wins, 0);
          const totalLosses = allSeasonStats.reduce((sum, s) => sum + s.losses, 0);
          const totalTies = allSeasonStats.reduce((sum, s) => sum + s.ties, 0);
          const totalGoalsFor = allSeasonStats.reduce((sum, s) => sum + s.goalsFor, 0);
          const totalGoalsAgainst = allSeasonStats.reduce((sum, s) => sum + s.goalsAgainst, 0);

          return {
            totalGames,
            totalWins,
            totalLosses,
            totalTies,
            totalGoalsFor,
            totalGoalsAgainst,
            totalGoalDifference: totalGoalsFor - totalGoalsAgainst,
            overallWinPercentage: totalGames > 0 ? (totalWins / totalGames) * 100 : 0,
            averageGoalsFor: totalGames > 0 ? totalGoalsFor / totalGames : 0,
            averageGoalsAgainst: totalGames > 0 ? totalGoalsAgainst / totalGames : 0,
            tournaments: [],
            seasons: allSeasonStats
          } as OverallTournamentSeasonStats;
        } else {
          // Calculate stats for specific season
          const season = seasons.find(s => s.id === selectedSeasonIdFilter);
          if (!season) return [];

          const stats: TournamentSeasonStats = {
            id: season.id,
            name: season.name,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            ties: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            winPercentage: 0,
            averageGoalsFor: 0,
            averageGoalsAgainst: 0
          };

          gameIds.forEach(gameId => {
            const game = savedGames?.[gameId];
            if (!game || game.seasonId !== selectedSeasonIdFilter) return;

            stats.gamesPlayed++;
            stats.goalsFor += game.homeOrAway === 'home' ? game.homeScore : game.awayScore;
            stats.goalsAgainst += game.homeOrAway === 'home' ? game.awayScore : game.homeScore;

            const ourScore = game.homeOrAway === 'home' ? game.homeScore : game.awayScore;
            const theirScore = game.homeOrAway === 'home' ? game.awayScore : game.homeScore;

            if (ourScore > theirScore) stats.wins++;
            else if (ourScore < theirScore) stats.losses++;
            else stats.ties++;

            if (!stats.lastGameDate || game.gameDate > stats.lastGameDate) {
              stats.lastGameDate = game.gameDate;
            }
          });

          stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
          stats.winPercentage = stats.gamesPlayed > 0 ? (stats.wins / stats.gamesPlayed) * 100 : 0;
          stats.averageGoalsFor = stats.gamesPlayed > 0 ? stats.goalsFor / stats.gamesPlayed : 0;
          stats.averageGoalsAgainst = stats.gamesPlayed > 0 ? stats.goalsAgainst / stats.gamesPlayed : 0;

          return [stats];
        }
      } else if (activeTab === 'tournament') {
        if (selectedTournamentIdFilter === 'all') {
          // Calculate stats for all tournaments
          const tournamentStatsMap = new Map<string, TournamentSeasonStats>();

          gameIds.forEach(gameId => {
            const game = savedGames?.[gameId];
            if (!game?.tournamentId || game.seasonId) return;

            const tournament = tournaments.find(t => t.id === game.tournamentId);
            if (!tournament) return;

            if (!tournamentStatsMap.has(tournament.id)) {
              tournamentStatsMap.set(tournament.id, {
                id: tournament.id,
                name: tournament.name,
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                ties: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                goalDifference: 0,
                winPercentage: 0,
                averageGoalsFor: 0,
                averageGoalsAgainst: 0,
                lastGameDate: game.gameDate
              });
            }

            const stats = tournamentStatsMap.get(tournament.id)!;
            stats.gamesPlayed++;
            stats.goalsFor += game.homeOrAway === 'home' ? game.homeScore : game.awayScore;
            stats.goalsAgainst += game.homeOrAway === 'home' ? game.awayScore : game.homeScore;

            const ourScore = game.homeOrAway === 'home' ? game.homeScore : game.awayScore;
            const theirScore = game.homeOrAway === 'home' ? game.awayScore : game.homeScore;

            if (ourScore > theirScore) stats.wins++;
            else if (ourScore < theirScore) stats.losses++;
            else stats.ties++;

            if (!stats.lastGameDate || game.gameDate > stats.lastGameDate) {
              stats.lastGameDate = game.gameDate;
            }
          });

          const allTournamentStats = Array.from(tournamentStatsMap.values()).map(stats => ({
            ...stats,
            goalDifference: stats.goalsFor - stats.goalsAgainst,
            winPercentage: stats.gamesPlayed > 0 ? (stats.wins / stats.gamesPlayed) * 100 : 0,
            averageGoalsFor: stats.gamesPlayed > 0 ? stats.goalsFor / stats.gamesPlayed : 0,
            averageGoalsAgainst: stats.gamesPlayed > 0 ? stats.goalsAgainst / stats.gamesPlayed : 0
          }));

          const totalGames = allTournamentStats.reduce((sum, s) => sum + s.gamesPlayed, 0);
          const totalWins = allTournamentStats.reduce((sum, s) => sum + s.wins, 0);
          const totalLosses = allTournamentStats.reduce((sum, s) => sum + s.losses, 0);
          const totalTies = allTournamentStats.reduce((sum, s) => sum + s.ties, 0);
          const totalGoalsFor = allTournamentStats.reduce((sum, s) => sum + s.goalsFor, 0);
          const totalGoalsAgainst = allTournamentStats.reduce((sum, s) => sum + s.goalsAgainst, 0);

          return {
            totalGames,
            totalWins,
            totalLosses,
            totalTies,
            totalGoalsFor,
            totalGoalsAgainst,
            totalGoalDifference: totalGoalsFor - totalGoalsAgainst,
            overallWinPercentage: totalGames > 0 ? (totalWins / totalGames) * 100 : 0,
            averageGoalsFor: totalGames > 0 ? totalGoalsFor / totalGames : 0,
            averageGoalsAgainst: totalGames > 0 ? totalGoalsAgainst / totalGames : 0,
            tournaments: allTournamentStats,
            seasons: []
          } as OverallTournamentSeasonStats;
        } else {
          // Calculate stats for specific tournament
          const tournament = tournaments.find(t => t.id === selectedTournamentIdFilter);
          if (!tournament) return [];

          const stats: TournamentSeasonStats = {
            id: tournament.id,
            name: tournament.name,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            ties: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            winPercentage: 0,
            averageGoalsFor: 0,
            averageGoalsAgainst: 0
          };

          gameIds.forEach(gameId => {
            const game = savedGames?.[gameId];
            if (!game || game.tournamentId !== selectedTournamentIdFilter) return;

            stats.gamesPlayed++;
            stats.goalsFor += game.homeOrAway === 'home' ? game.homeScore : game.awayScore;
            stats.goalsAgainst += game.homeOrAway === 'home' ? game.awayScore : game.homeScore;

            const ourScore = game.homeOrAway === 'home' ? game.homeScore : game.awayScore;
            const theirScore = game.homeOrAway === 'home' ? game.awayScore : game.homeScore;

            if (ourScore > theirScore) stats.wins++;
            else if (ourScore < theirScore) stats.losses++;
            else stats.ties++;

            if (!stats.lastGameDate || game.gameDate > stats.lastGameDate) {
              stats.lastGameDate = game.gameDate;
            }
          });

          stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
          stats.winPercentage = stats.gamesPlayed > 0 ? (stats.wins / stats.gamesPlayed) * 100 : 0;
          stats.averageGoalsFor = stats.gamesPlayed > 0 ? stats.goalsFor / stats.gamesPlayed : 0;
          stats.averageGoalsAgainst = stats.gamesPlayed > 0 ? stats.goalsAgainst / stats.gamesPlayed : 0;

          return [stats];
        }
      }

      return [];
    };

    // Use shared filtering utility (apply team + context filters)
    const playedGameIds = filterGameIds(savedGames, {
      playedOnly: true,
      teamFilter: selectedTeamIdFilter,
      seasonFilter: activeTab === 'season' ? selectedSeasonIdFilter : undefined,
      tournamentFilter: activeTab === 'tournament' ? selectedTournamentIdFilter : undefined,
      gameTypeFilter: selectedGameTypeFilter,
      genderFilter: selectedGenderFilter,
      activeTab,
      clubSeasonFilter: selectedClubSeason,
      clubSeasonStartDate,
      clubSeasonEndDate,
    });
    return calculateStats(playedGameIds);
  }, [activeTab, savedGames, seasons, tournaments, selectedSeasonIdFilter, selectedTournamentIdFilter, selectedTeamIdFilter, selectedGameTypeFilter, selectedGenderFilter, selectedClubSeason, clubSeasonStartDate, clubSeasonEndDate]);
}
