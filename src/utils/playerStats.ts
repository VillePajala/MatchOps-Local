import { Player, Season, Tournament, PlayerStatAdjustment } from '@/types';
import { AppState } from '@/types';

// Define a type for the processed stats
export interface PlayerStats {
  totalGames: number;
  totalGoals: number;
  totalAssists: number;
  avgGoalsPerGame: number;
  avgAssistsPerGame: number;
  totalFairPlayCards: number;  // NEW - aggregated from game events
  gameByGameStats: GameStats[];
  performanceBySeason: { [seasonId: string]: { name: string; gamesPlayed: number; goals: number; assists: number; points: number; fairPlayCards: number } };
  performanceByTournament: { [tournamentId: string]: { name: string; gamesPlayed: number; goals: number; assists: number; points: number; fairPlayCards: number; isTournamentWinner?: boolean } };
}

export interface GameStats {
  gameId: string;
  date: string;
  opponentName: string;
  goals: number;
  assists: number;
  points: number;
  result: 'W' | 'L' | 'D' | 'N/A';
}

/**
 * Processes all saved games to calculate stats for a single player.
 * @param player - The player to calculate stats for.
 * @param savedGames - The collection of all saved games.
 * @param seasons - The collection of all seasons.
 * @param tournaments - The collection of all tournaments.
 * @returns The calculated stats for the player.
 */
export const calculatePlayerStats = (
  player: Player,
  savedGames: { [key: string]: AppState },
  seasons: Season[],
  tournaments: Tournament[],
  adjustments?: PlayerStatAdjustment[],
  teamId?: string  // Optional team filtering
): PlayerStats => {
  const gameByGameStats: GameStats[] = [];
  const performanceBySeason: { [seasonId: string]: { name: string; gamesPlayed: number; goals: number; assists: number; points: number; fairPlayCards: number } } = {};
  const performanceByTournament: { [tournamentId: string]: { name: string; gamesPlayed: number; goals: number; assists: number; points: number; fairPlayCards: number; isTournamentWinner?: boolean } } = {};
  let totalFairPlayCards = 0;

  Object.entries(savedGames).forEach(([gameId, game]) => {
    if (game.isPlayed === false) {
      return;
    }
    
    // Filter by team if specified
    if (teamId && game.teamId !== teamId) {
      return;
    }
    
    // Check if the player was part of this game's roster
    if (game.selectedPlayerIds?.includes(player.id)) {
      const goals = game.gameEvents?.filter(e => e.type === 'goal' && e.scorerId === player.id).length || 0;
      const assists = game.gameEvents?.filter(e => e.type === 'goal' && e.assisterId === player.id).length || 0;
      const points = goals + assists;

      // Fair play cards are stored in Player.receivedFairPlayCard, not in gameEvents
      // Check both playersOnField and availablePlayers arrays
      const playerInGame = [...(game.playersOnField || []), ...(game.availablePlayers || [])].find(p => p.id === player.id);
      const fairPlayCards = playerInGame?.receivedFairPlayCard ? 1 : 0;

      // Add to total fair play cards
      totalFairPlayCards += fairPlayCards;

      // Aggregate stats by season
      if (game.seasonId) {
        if (!performanceBySeason[game.seasonId]) {
          const seasonInfo = seasons.find(s => s.id === game.seasonId);
          performanceBySeason[game.seasonId] = { name: seasonInfo?.name || 'Unknown Season', gamesPlayed: 0, goals: 0, assists: 0, points: 0, fairPlayCards: 0 };
        }
        performanceBySeason[game.seasonId].gamesPlayed += 1;
        performanceBySeason[game.seasonId].goals += goals;
        performanceBySeason[game.seasonId].assists += assists;
        performanceBySeason[game.seasonId].points += points;
        performanceBySeason[game.seasonId].fairPlayCards += fairPlayCards;
      }

      // Aggregate stats by tournament
      if (game.tournamentId) {
        if (!performanceByTournament[game.tournamentId]) {
          const tournamentInfo = tournaments.find(t => t.id === game.tournamentId);
          const tournament = tournaments.find(t => t.id === game.tournamentId);
          performanceByTournament[game.tournamentId] = {
            name: tournamentInfo?.name || 'Unknown Tournament',
            gamesPlayed: 0,
            goals: 0,
            assists: 0,
            points: 0,
            fairPlayCards: 0,
            isTournamentWinner: tournament?.awardedPlayerId === player.id
          };
        }
        performanceByTournament[game.tournamentId].gamesPlayed += 1;
        performanceByTournament[game.tournamentId].goals += goals;
        performanceByTournament[game.tournamentId].assists += assists;
        performanceByTournament[game.tournamentId].points += points;
        performanceByTournament[game.tournamentId].fairPlayCards += fairPlayCards;
      }

      let result: 'W' | 'L' | 'D' | 'N/A' = 'N/A';
      if (game.homeScore > game.awayScore) {
        result = game.homeOrAway === 'home' ? 'W' : 'L';
      } else if (game.awayScore > game.homeScore) {
        result = game.homeOrAway === 'home' ? 'L' : 'W';
      } else if (game.homeScore === game.awayScore) {
        result = 'D';
      }

      gameByGameStats.push({
        gameId,
        date: game.gameDate,
        opponentName: game.opponentName,
        goals,
        assists,
        points,
        result,
      });
    }
  });

  // Apply adjustments (external games) scoped by season and tournament
  // Filter adjustments by player and optionally by team
  const adjustmentsForPlayer = (adjustments || []).filter(a => {
    if (a.playerId !== player.id) return false;
    // If team filter is active, only include adjustments for that team or legacy adjustments without teamId
    if (teamId) {
      return a.teamId === teamId || !a.teamId; // Include legacy adjustments
    }
    return true;
  });

  // Merge adjustments into season and tournament performance
  adjustmentsForPlayer.forEach(adj => {
    // Only add to season/tournament stats if includeInSeasonTournament is true
    // This prevents external games from different teams polluting team-specific statistics
    if (adj.includeInSeasonTournament) {
      // Add to season performance if seasonId exists
      if (adj.seasonId) {
        if (!performanceBySeason[adj.seasonId]) {
          const seasonInfo = seasons.find(s => s.id === adj.seasonId);
          performanceBySeason[adj.seasonId] = { name: seasonInfo?.name || 'Unknown Season', gamesPlayed: 0, goals: 0, assists: 0, points: 0, fairPlayCards: 0 };
        }
        performanceBySeason[adj.seasonId].gamesPlayed += (adj.gamesPlayedDelta || 0);
        performanceBySeason[adj.seasonId].goals += (adj.goalsDelta || 0);
        performanceBySeason[adj.seasonId].assists += (adj.assistsDelta || 0);
        performanceBySeason[adj.seasonId].points += (adj.goalsDelta || 0) + (adj.assistsDelta || 0);
        performanceBySeason[adj.seasonId].fairPlayCards += (adj.fairPlayCardsDelta || 0);
      }

      // Add to tournament performance if tournamentId exists
      if (adj.tournamentId) {
        if (!performanceByTournament[adj.tournamentId]) {
          const tournamentInfo = tournaments.find(t => t.id === adj.tournamentId);
          const tournament = tournaments.find(t => t.id === adj.tournamentId);
          performanceByTournament[adj.tournamentId] = {
            name: tournamentInfo?.name || 'Unknown Tournament',
            gamesPlayed: 0,
            goals: 0,
            assists: 0,
            points: 0,
            fairPlayCards: 0,
            isTournamentWinner: tournament?.awardedPlayerId === player.id
          };
        }
        performanceByTournament[adj.tournamentId].gamesPlayed += (adj.gamesPlayedDelta || 0);
        performanceByTournament[adj.tournamentId].goals += (adj.goalsDelta || 0);
        performanceByTournament[adj.tournamentId].assists += (adj.assistsDelta || 0);
        performanceByTournament[adj.tournamentId].points += (adj.goalsDelta || 0) + (adj.assistsDelta || 0);
        performanceByTournament[adj.tournamentId].fairPlayCards += (adj.fairPlayCardsDelta || 0);
      }
    }
    // Note: Stats always count toward overall totals regardless of includeInSeasonTournament flag
  });

  const totalGoals = gameByGameStats.reduce((sum, game) => sum + game.goals, 0) + adjustmentsForPlayer.reduce((s, a) => s + (a.goalsDelta || 0), 0);
  const totalAssists = gameByGameStats.reduce((sum, game) => sum + game.assists, 0) + adjustmentsForPlayer.reduce((s, a) => s + (a.assistsDelta || 0), 0);
  const totalGames = gameByGameStats.length + adjustmentsForPlayer.reduce((s, a) => s + (a.gamesPlayedDelta || 0), 0);

  // Add fair play cards from manual adjustments to total
  totalFairPlayCards += adjustmentsForPlayer.reduce((s, a) => s + (a.fairPlayCardsDelta || 0), 0);
  const avgGoalsPerGame = totalGames > 0 ? totalGoals / totalGames : 0;
  const avgAssistsPerGame = totalGames > 0 ? totalAssists / totalGames : 0;

  // Sort games by date, most recent first
  gameByGameStats.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    totalGames,
    totalGoals,
    totalAssists,
    avgGoalsPerGame,
    avgAssistsPerGame,
    totalFairPlayCards,
    gameByGameStats,
    performanceBySeason,
    performanceByTournament,
  };
}; 