import { calculatePlayerStats } from './playerStats';
import { Player, Season, Tournament, AppState, GameEvent, PlayerStatAdjustment } from '@/types';

describe('calculatePlayerStats', () => {
  const player: Player = { id: 'p1', name: 'John', nickname: 'John', color: '#fff', isGoalie: false };

  const seasons: Season[] = [{ id: 's1', name: 'Season 1' } as Season];
  const tournaments: Tournament[] = [{ id: 't1', name: 'Tourn 1' } as Tournament];

  const game1 = {
    teamName: 'A', opponentName: 'B', gameDate: '2024-01-01', homeScore: 2, awayScore: 1,
    gameNotes: '', homeOrAway: 'home' as const, numberOfPeriods: 2 as const, periodDurationMinutes: 1,
    currentPeriod: 1, gameStatus: 'gameEnd' as const, selectedPlayerIds: ['p1'], seasonId: 's1',
    tournamentId: '', gameLocation: '', gameTime: '',
    gameEvents: [{ id: 'g1', type: 'goal', time: 10, scorerId: 'p1' } as GameEvent],
    timeElapsedInSeconds: 0, startTimestamp: null,
    isTimerRunning: false, subIntervalMinutes: 1, nextSubDueTimeSeconds: 0,
    subAlertLevel: 'none' as const, lastSubConfirmationTimeSeconds: 0,
    completedIntervalDurations: [], showPlayerNames: true,
    assessments: {},
    playersOnField: [],
    opponents: [],
    drawings: [],
    availablePlayers: [],
    tacticalDiscs: [],
    tacticalBallPosition: null,
    tacticalDrawings: [],
  } as AppState;

  const game2 = {
    teamName: 'A', opponentName: 'C', gameDate: '2024-02-01', homeScore: 0, awayScore: 1,
    gameNotes: '', homeOrAway: 'home' as const, numberOfPeriods: 2 as const, periodDurationMinutes: 1,
    currentPeriod: 1, gameStatus: 'gameEnd' as const, selectedPlayerIds: ['p1'], seasonId: '',
    tournamentId: 't1', gameLocation: '', gameTime: '',
    gameEvents: [{ id: 'a1', type: 'goal', time: 20, scorerId: 'other', assisterId: 'p1' } as GameEvent],
    timeElapsedInSeconds: 0, startTimestamp: null,
    isTimerRunning: false, subIntervalMinutes: 1, nextSubDueTimeSeconds: 0,
    subAlertLevel: 'none' as const, lastSubConfirmationTimeSeconds: 0,
    completedIntervalDurations: [], showPlayerNames: true,
    assessments: {},
    playersOnField: [],
    opponents: [],
    drawings: [],
    availablePlayers: [],
    tacticalDiscs: [],
    tacticalBallPosition: null,
    tacticalDrawings: [],
  } as AppState;

  const savedGames = { g1: game1, g2: game2 };

  it('calculates totals correctly', () => {
    const stats = calculatePlayerStats(player, savedGames, seasons, tournaments);
    expect(stats.totalGames).toBe(2);
    expect(stats.totalGoals).toBe(1);
    expect(stats.totalAssists).toBe(1);
    expect(stats.avgGoalsPerGame).toBeCloseTo(0.5);
    expect(stats.performanceBySeason['s1'].gamesPlayed).toBe(1);
    expect(stats.performanceByTournament['t1'].gamesPlayed).toBe(1);
  });

  /**
   * Tests fair play card aggregation from game events
   * @critical
   */
  describe('Fair Play Card Aggregation', () => {
    it('should count fair play cards for a player across games', () => {
      const playerWithFairPlay = { ...player, receivedFairPlayCard: true };
      const gameWithFairPlay = {
        ...game1,
        playersOnField: [playerWithFairPlay],
        availablePlayers: [],
        gameEvents: [
          { id: 'g1', type: 'goal', time: 10, scorerId: 'p1' } as GameEvent,
        ],
      } as AppState;

      const game2WithFairPlay = {
        ...game2,
        playersOnField: [],
        availablePlayers: [playerWithFairPlay],
      } as AppState;

      const gamesWithFairPlay = { g1: gameWithFairPlay, g2: game2WithFairPlay };
      const stats = calculatePlayerStats(player, gamesWithFairPlay, seasons, tournaments);

      expect(stats.totalFairPlayCards).toBe(2);
    });

    it('should not count fair play cards for other players', () => {
      const otherPlayer = { id: 'other', name: 'Other', nickname: 'Other', color: '#fff', isGoalie: false, receivedFairPlayCard: true };
      const gameWithOtherPlayerFairPlay = {
        ...game1,
        playersOnField: [player, otherPlayer],
        availablePlayers: [],
        gameEvents: [
          { id: 'g1', type: 'goal', time: 10, scorerId: 'p1' } as GameEvent,
        ],
      } as AppState;

      const games = { g1: gameWithOtherPlayerFairPlay };
      const stats = calculatePlayerStats(player, games, seasons, tournaments);

      expect(stats.totalFairPlayCards).toBe(0);
    });

    it('should aggregate fair play cards in season performance', () => {
      const playerWithFairPlay = { ...player, receivedFairPlayCard: true };
      const gameWithFairPlay = {
        ...game1,
        seasonId: 's1',
        playersOnField: [playerWithFairPlay],
        availablePlayers: [],
        gameEvents: [
          { id: 'g1', type: 'goal', time: 10, scorerId: 'p1' } as GameEvent,
        ],
      } as AppState;

      const games = { g1: gameWithFairPlay };
      const stats = calculatePlayerStats(player, games, seasons, tournaments);

      expect(stats.performanceBySeason['s1'].fairPlayCards).toBe(1);
    });

    it('should aggregate fair play cards in tournament performance', () => {
      const playerWithFairPlay = { ...player, receivedFairPlayCard: true };
      const gameWithFairPlay = {
        ...game2,
        tournamentId: 't1',
        playersOnField: [],
        availablePlayers: [playerWithFairPlay],
        gameEvents: [
          { id: 'a1', type: 'goal', time: 20, scorerId: 'other', assisterId: 'p1' } as GameEvent,
        ],
      } as AppState;

      const games = { g2: gameWithFairPlay };
      const stats = calculatePlayerStats(player, games, seasons, tournaments);

      expect(stats.performanceByTournament['t1'].fairPlayCards).toBe(1);
    });

    it('should handle games with no fair play cards', () => {
      const stats = calculatePlayerStats(player, savedGames, seasons, tournaments);

      expect(stats.totalFairPlayCards).toBe(0);
      expect(stats.performanceBySeason['s1'].fairPlayCards).toBe(0);
      expect(stats.performanceByTournament['t1'].fairPlayCards).toBe(0);
    });
  });

  /**
   * Tests tournament winner detection
   * @critical
   */
  describe('Tournament Winner Detection', () => {
    it('should detect player as tournament winner when awardedPlayerId matches', () => {
      const tournamentWithAward: Tournament[] = [
        { id: 't1', name: 'Tourn 1', awardedPlayerId: 'p1' } as Tournament,
      ];

      const stats = calculatePlayerStats(player, savedGames, seasons, tournamentWithAward);

      expect(stats.performanceByTournament['t1'].isTournamentWinner).toBe(true);
    });

    it('should not detect player as tournament winner when awardedPlayerId does not match', () => {
      const tournamentWithDifferentAward: Tournament[] = [
        { id: 't1', name: 'Tourn 1', awardedPlayerId: 'other' } as Tournament,
      ];

      const stats = calculatePlayerStats(player, savedGames, seasons, tournamentWithDifferentAward);

      expect(stats.performanceByTournament['t1'].isTournamentWinner).toBe(false);
    });

    it('should handle tournaments with no award', () => {
      const tournamentWithoutAward: Tournament[] = [
        { id: 't1', name: 'Tourn 1' } as Tournament,
      ];

      const stats = calculatePlayerStats(player, savedGames, seasons, tournamentWithoutAward);

      // When awardedPlayerId is undefined, the comparison results in false
      expect(stats.performanceByTournament['t1'].isTournamentWinner).toBe(false);
    });

    it('should correctly identify winner across multiple tournaments', () => {
      const gameInT2 = {
        ...game2,
        tournamentId: 't2',
      } as AppState;

      const multipleTournaments: Tournament[] = [
        { id: 't1', name: 'Tourn 1', awardedPlayerId: 'p1' } as Tournament,
        { id: 't2', name: 'Tourn 2', awardedPlayerId: 'other' } as Tournament,
      ];

      const games = { g1: game2, g2: gameInT2 };
      const stats = calculatePlayerStats(player, games, seasons, multipleTournaments);

      expect(stats.performanceByTournament['t1'].isTournamentWinner).toBe(true);
      expect(stats.performanceByTournament['t2'].isTournamentWinner).toBe(false);
    });
  });

  /**
   * Tests combined scenarios with fair play cards and tournament awards
   * @integration
   */
  describe('Combined Fair Play and Tournament Awards', () => {
    it('should correctly aggregate both fair play cards and tournament winner status', () => {
      const playerWithFairPlay = { ...player, receivedFairPlayCard: true };
      const tournamentWithAward: Tournament[] = [
        { id: 't1', name: 'Championship', awardedPlayerId: 'p1' } as Tournament,
      ];

      const gameWithAll = {
        ...game2,
        tournamentId: 't1',
        playersOnField: [playerWithFairPlay],
        availablePlayers: [],
        gameEvents: [
          { id: 'g1', type: 'goal', time: 10, scorerId: 'p1' } as GameEvent,
        ],
      } as AppState;

      const games = { g1: gameWithAll };
      const stats = calculatePlayerStats(player, games, seasons, tournamentWithAward);

      expect(stats.totalFairPlayCards).toBe(1);
      expect(stats.performanceByTournament['t1'].fairPlayCards).toBe(1);
      expect(stats.performanceByTournament['t1'].isTournamentWinner).toBe(true);
      expect(stats.performanceByTournament['t1'].goals).toBe(1);
    });
  });

  /**
   * Tests fair play cards in manual adjustments (external games)
   * @critical
   */
  describe('Fair Play Cards in Manual Adjustments', () => {
    it('should include fairPlayCardsDelta in total fair play cards', () => {
      const adjustments: PlayerStatAdjustment[] = [
        {
          id: 'adj1',
          playerId: 'p1',
          seasonId: 's1',
          gamesPlayedDelta: 2,
          goalsDelta: 1,
          assistsDelta: 0,
          fairPlayCardsDelta: 3,
          appliedAt: '2024-03-01',
          includeInSeasonTournament: true,
        } as PlayerStatAdjustment,
      ];

      const stats = calculatePlayerStats(player, savedGames, seasons, tournaments, adjustments);

      expect(stats.totalFairPlayCards).toBe(3); // 0 from games + 3 from adjustments
    });

    it('should aggregate fairPlayCardsDelta in season performance', () => {
      const adjustments: PlayerStatAdjustment[] = [
        {
          id: 'adj1',
          playerId: 'p1',
          seasonId: 's1',
          gamesPlayedDelta: 1,
          goalsDelta: 0,
          assistsDelta: 0,
          fairPlayCardsDelta: 2,
          appliedAt: '2024-03-01',
          includeInSeasonTournament: true,
        } as PlayerStatAdjustment,
      ];

      const stats = calculatePlayerStats(player, savedGames, seasons, tournaments, adjustments);

      expect(stats.performanceBySeason['s1'].fairPlayCards).toBe(2);
    });

    it('should aggregate fairPlayCardsDelta in tournament performance', () => {
      const adjustments: PlayerStatAdjustment[] = [
        {
          id: 'adj1',
          playerId: 'p1',
          tournamentId: 't1',
          gamesPlayedDelta: 1,
          goalsDelta: 0,
          assistsDelta: 0,
          fairPlayCardsDelta: 1,
          appliedAt: '2024-03-01',
          includeInSeasonTournament: true,
        } as PlayerStatAdjustment,
      ];

      const stats = calculatePlayerStats(player, savedGames, seasons, tournaments, adjustments);

      expect(stats.performanceByTournament['t1'].fairPlayCards).toBe(1);
    });

    it('should handle undefined fairPlayCardsDelta gracefully', () => {
      const adjustments: PlayerStatAdjustment[] = [
        {
          id: 'adj1',
          playerId: 'p1',
          seasonId: 's1',
          gamesPlayedDelta: 1,
          goalsDelta: 1,
          assistsDelta: 1,
          // fairPlayCardsDelta is undefined
          appliedAt: '2024-03-01',
          includeInSeasonTournament: true,
        } as PlayerStatAdjustment,
      ];

      const stats = calculatePlayerStats(player, savedGames, seasons, tournaments, adjustments);

      expect(stats.totalFairPlayCards).toBe(0);
      expect(stats.performanceBySeason['s1'].fairPlayCards).toBe(0);
    });

    it('should combine game events and manual adjustments for fair play cards', () => {
      const playerWithFairPlay = { ...player, receivedFairPlayCard: true };
      const gameWithFairPlay = {
        ...game1,
        seasonId: 's1',
        playersOnField: [playerWithFairPlay],
        availablePlayers: [],
        gameEvents: [
          { id: 'g1', type: 'goal', time: 10, scorerId: 'p1' } as GameEvent,
        ],
      } as AppState;

      const adjustments: PlayerStatAdjustment[] = [
        {
          id: 'adj1',
          playerId: 'p1',
          seasonId: 's1',
          gamesPlayedDelta: 2,
          goalsDelta: 0,
          assistsDelta: 0,
          fairPlayCardsDelta: 2,
          appliedAt: '2024-03-01',
          includeInSeasonTournament: true,
        } as PlayerStatAdjustment,
      ];

      const games = { g1: gameWithFairPlay };
      const stats = calculatePlayerStats(player, games, seasons, tournaments, adjustments);

      expect(stats.totalFairPlayCards).toBe(3); // 1 from game + 2 from adjustments
      expect(stats.performanceBySeason['s1'].fairPlayCards).toBe(3); // Combined
    });
  });
});
