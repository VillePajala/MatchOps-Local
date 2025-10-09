import { calculatePlayerStats } from './playerStats';
import { Player, Season, Tournament, AppState, GameEvent } from '@/types';

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
      const gameWithFairPlay = {
        ...game1,
        gameEvents: [
          { id: 'g1', type: 'goal', time: 10, scorerId: 'p1' } as GameEvent,
          { id: 'fp1', type: 'fairPlayCard', time: 15, entityId: 'p1' } as GameEvent,
          { id: 'fp2', type: 'fairPlayCard', time: 25, entityId: 'p1' } as GameEvent,
        ],
      } as AppState;

      const gamesWithFairPlay = { g1: gameWithFairPlay, g2: game2 };
      const stats = calculatePlayerStats(player, gamesWithFairPlay, seasons, tournaments);

      expect(stats.totalFairPlayCards).toBe(2);
    });

    it('should not count fair play cards for other players', () => {
      const gameWithOtherPlayerFairPlay = {
        ...game1,
        gameEvents: [
          { id: 'g1', type: 'goal', time: 10, scorerId: 'p1' } as GameEvent,
          { id: 'fp1', type: 'fairPlayCard', time: 15, entityId: 'other' } as GameEvent,
        ],
      } as AppState;

      const games = { g1: gameWithOtherPlayerFairPlay };
      const stats = calculatePlayerStats(player, games, seasons, tournaments);

      expect(stats.totalFairPlayCards).toBe(0);
    });

    it('should aggregate fair play cards in season performance', () => {
      const gameWithFairPlay = {
        ...game1,
        seasonId: 's1',
        gameEvents: [
          { id: 'g1', type: 'goal', time: 10, scorerId: 'p1' } as GameEvent,
          { id: 'fp1', type: 'fairPlayCard', time: 15, entityId: 'p1' } as GameEvent,
        ],
      } as AppState;

      const games = { g1: gameWithFairPlay };
      const stats = calculatePlayerStats(player, games, seasons, tournaments);

      expect(stats.performanceBySeason['s1'].fairPlayCards).toBe(1);
    });

    it('should aggregate fair play cards in tournament performance', () => {
      const gameWithFairPlay = {
        ...game2,
        tournamentId: 't1',
        gameEvents: [
          { id: 'a1', type: 'goal', time: 20, scorerId: 'other', assisterId: 'p1' } as GameEvent,
          { id: 'fp1', type: 'fairPlayCard', time: 25, entityId: 'p1' } as GameEvent,
          { id: 'fp2', type: 'fairPlayCard', time: 30, entityId: 'p1' } as GameEvent,
        ],
      } as AppState;

      const games = { g2: gameWithFairPlay };
      const stats = calculatePlayerStats(player, games, seasons, tournaments);

      expect(stats.performanceByTournament['t1'].fairPlayCards).toBe(2);
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
      const tournamentWithAward: Tournament[] = [
        { id: 't1', name: 'Championship', awardedPlayerId: 'p1' } as Tournament,
      ];

      const gameWithAll = {
        ...game2,
        tournamentId: 't1',
        gameEvents: [
          { id: 'g1', type: 'goal', time: 10, scorerId: 'p1' } as GameEvent,
          { id: 'fp1', type: 'fairPlayCard', time: 15, entityId: 'p1' } as GameEvent,
          { id: 'fp2', type: 'fairPlayCard', time: 20, entityId: 'p1' } as GameEvent,
        ],
      } as AppState;

      const games = { g1: gameWithAll };
      const stats = calculatePlayerStats(player, games, seasons, tournamentWithAward);

      expect(stats.totalFairPlayCards).toBe(2);
      expect(stats.performanceByTournament['t1'].fairPlayCards).toBe(2);
      expect(stats.performanceByTournament['t1'].isTournamentWinner).toBe(true);
      expect(stats.performanceByTournament['t1'].goals).toBe(1);
    });
  });
});
