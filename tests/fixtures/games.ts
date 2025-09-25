/**
 * Game State Test Fixtures
 *
 * Centralized game state data for testing various game scenarios,
 * from initial setup to completed matches with full event history.
 */

import { AppState, GameEvent } from '@/types';
import { TestIdGenerator, BaseFixture } from './base';
import * as players from './players';

/**
 * Game state fixture factory
 */
class GameStateFixture extends BaseFixture<AppState> {
  protected getDefaults(): AppState {
    return {
      teamName: 'Test Team',
      opponentName: 'Test Opponent',
      homeScore: 0,
      awayScore: 0,
      homeOrAway: 'home',
      gameStatus: 'notStarted',
      currentPeriod: 1,
      numberOfPeriods: 2,
      periodDurationMinutes: 25,
      playersOnField: [],
      opponents: [],
      availablePlayers: players.fullTeam({ count: 11 }),
      selectedPlayerIds: [],
      drawings: [],
      gameDate: new Date().toISOString().split('T')[0],
      seasonId: TestIdGenerator.generate('season'),
      tournamentId: TestIdGenerator.generate('tournament'),
      gameEvents: [],
      gameNotes: '',
      showPlayerNames: true,
      tacticalDiscs: [],
      tacticalDrawings: [],
      tacticalBallPosition: null,
    };
  }
}

const fixture = new GameStateFixture();

/**
 * Creates a new game in setup phase
 *
 * @param overrides - Optional property overrides
 * @returns Game state ready for player selection and setup
 *
 * @example
 * ```typescript
 * const newGame = newGame({
 *   teamName: 'FC Barcelona',
 *   opponentName: 'Real Madrid'
 * });
 * ```
 */
export function newGame(overrides: Partial<AppState> = {}): AppState {
  return fixture.create({
    gameStatus: 'notStarted',
    homeScore: 0,
    awayScore: 0,
    currentPeriod: 1,
    gameEvents: [],
    ...overrides,
  });
}

/**
 * Creates a game in progress with realistic state
 *
 * @param overrides - Optional property overrides
 * @returns Game state during active play
 */
export function inProgress(overrides: Partial<AppState> = {}): AppState {
  const roster = players.fullTeam({ count: 11 });
  const startingEleven = roster.slice(0, 11);

  return fixture.create({
    gameStatus: 'inProgress',
    playersOnField: startingEleven.map(p => ({
      ...p,
      relX: 0.3 + Math.random() * 0.4,
      relY: 0.2 + Math.random() * 0.6,
    })),
    availablePlayers: roster,
    selectedPlayerIds: startingEleven.map(p => p.id),
    currentPeriod: 1,
    gameEvents: [
      createGoalEvent({ time: 450, scorerId: startingEleven[1].id }),
      createSubstitutionEvent({ time: 900, playerId: startingEleven[5].id }),
    ],
    homeScore: 1,
    ...overrides,
  });
}

/**
 * Creates a completed game with full match data
 *
 * @param overrides - Optional property overrides
 * @returns Complete game state with events and final score
 */
export function completed(overrides: Partial<AppState> = {}): AppState {
  const roster = players.fullTeam({ count: 16 });
  const startingEleven = roster.slice(0, 11);

  return fixture.create({
    gameStatus: 'gameEnd',
    playersOnField: startingEleven.map(p => ({
      ...p,
      relX: 0.4 + Math.random() * 0.2,
      relY: 0.3 + Math.random() * 0.4,
    })),
    availablePlayers: roster,
    selectedPlayerIds: startingEleven.map(p => p.id),
    currentPeriod: 2,
    numberOfPeriods: 2,
    homeScore: 2,
    awayScore: 1,
    gameEvents: [
      createGoalEvent({ time: 450, scorerId: startingEleven[1].id }),
      createSubstitutionEvent({ time: 900, playerId: startingEleven[5].id }),
      createGoalEvent({ time: 1350, scorerId: startingEleven[9].id }),
      createGoalEvent({ time: 1800, scorerId: 'opponent_player_1', isOpponent: true }),
    ],
    gameNotes: 'Great match with excellent teamwork. Good defensive play in the second half.',
    ...overrides,
  });
}

/**
 * Creates a game with specific status
 *
 * @param status - Desired game status
 * @param overrides - Optional property overrides
 * @returns Game state with specified status
 */
export function withCustomStatus(
  status: AppState['gameStatus'],
  overrides: Partial<AppState> = {}
): AppState {
  const baseState = (() => {
    switch (status) {
      case 'notStarted':
        return newGame();
      case 'inProgress':
        return inProgress();
      case 'periodEnd':
        return { ...inProgress(), gameStatus: 'periodEnd' as const };
      case 'gameEnd':
        return completed();
      default:
        return newGame();
    }
  })();

  return fixture.create({ ...baseState, ...overrides });
}

/**
 * Creates a high-scoring game for testing score display limits
 */
export function highScoring(overrides: Partial<AppState> = {}): AppState {
  return completed({
    homeScore: 7,
    awayScore: 5,
    gameEvents: Array.from({ length: 12 }, (_, i) =>
      createGoalEvent({
        time: 200 + i * 200,
        scorerId: `player_${i % 5 + 1}`,
        isOpponent: i % 3 === 0
      })
    ),
    ...overrides,
  });
}

/**
 * Creates a game with no score (defensive battle)
 */
export function scoreless(overrides: Partial<AppState> = {}): AppState {
  return completed({
    homeScore: 0,
    awayScore: 0,
    gameEvents: [
      createSubstitutionEvent({ time: 900 }),
      createSubstitutionEvent({ time: 1200 }),
      createSubstitutionEvent({ time: 1500 }),
    ],
    gameNotes: 'Defensive masterclass from both teams.',
    ...overrides,
  });
}

/**
 * Game Event Factory Functions
 */

/**
 * Creates a goal event
 *
 * @param options - Goal event configuration
 * @returns GameEvent for a goal
 */
export function createGoalEvent(options: {
  time?: number;
  scorerId?: string;
  assisterId?: string;
  isOpponent?: boolean;
} = {}): GameEvent {
  const {
    time = 450, // 7.5 minutes
    scorerId = TestIdGenerator.generate('player'),
    assisterId,
    isOpponent = false
  } = options;

  return {
    id: TestIdGenerator.generate('event'),
    type: isOpponent ? 'opponentGoal' : 'goal',
    time,
    scorerId,
    assisterId,
  };
}

/**
 * Creates a substitution event
 *
 * @param options - Substitution event configuration
 * @returns GameEvent for a substitution
 */
export function createSubstitutionEvent(options: {
  time?: number;
  playerId?: string;
  replacedById?: string;
} = {}): GameEvent {
  return {
    id: TestIdGenerator.generate('event'),
    type: 'substitution',
    time: options.time || 900, // 15 minutes
    entityId: options.playerId || TestIdGenerator.generate('player'),
  };
}

/**
 * Creates a card event (yellow/red card)
 *
 * @param options - Card event configuration
 * @returns GameEvent for a card
 */
export function createCardEvent(options: {
  time?: number;
  playerId?: string;
  reason?: string;
} = {}): GameEvent {
  return {
    id: TestIdGenerator.generate('event'),
    type: 'fairPlayCard',
    time: options.time || 1200, // 20 minutes
    entityId: options.playerId || TestIdGenerator.generate('player'),
  };
}

/**
 * Pre-configured game scenarios for common test cases
 */
export const scenarios = {
  /**
   * Derby match - intense local rivalry
   */
  derbyMatch: () => completed({
    teamName: 'City FC',
    opponentName: 'United FC',
    homeScore: 2,
    awayScore: 2,
    gameEvents: [
      createGoalEvent({ time: 300 }),
      createGoalEvent({ time: 600, isOpponent: true }),
      createCardEvent({ time: 900 }),
      createGoalEvent({ time: 1200 }),
      createGoalEvent({ time: 1650, isOpponent: true }),
      createCardEvent({ time: 1800 }),
    ],
    gameNotes: 'Intense derby match with high emotions and great atmosphere.',
  }),

  /**
   * Cup final - high-stakes match
   */
  cupFinal: () => completed({
    teamName: 'Finalists FC',
    opponentName: 'Champions United',
    homeScore: 1,
    awayScore: 0,
    tournamentId: TestIdGenerator.generate('tournament'),
    gameEvents: [
      createGoalEvent({ time: 2100 }), // Late winner
      createCardEvent({ time: 1800 }),
      createSubstitutionEvent({ time: 1950 }),
    ],
    gameNotes: 'Cup final victory with a dramatic late winner!',
  }),

  /**
   * Training match - low stakes practice game
   */
  trainingMatch: () => inProgress({
    teamName: 'First Team',
    opponentName: 'Reserves',
    homeScore: 3,
    awayScore: 1,
    gameNotes: 'Training session focusing on attacking patterns.',
  }),

  /**
   * Season opener - first game of the season
   */
  seasonOpener: () => newGame({
    teamName: 'New Season FC',
    opponentName: 'Opening Day United',
    gameDate: '2025-01-15',
    gameNotes: 'First match of the new season. High expectations!',
  }),
};

/**
 * Edge cases for error testing and boundary conditions
 */
export const edgeCases = {
  /**
   * Game with maximum allowed score
   */
  maxScore: () => completed({
    homeScore: 99,
    awayScore: 88,
  }),

  /**
   * Game with second period completed
   */
  secondPeriod: () => completed({
    numberOfPeriods: 2,
    currentPeriod: 2,
  }),

  /**
   * Game with very long names
   */
  longNames: () => newGame({
    teamName: 'This Is An Extremely Long Team Name That Should Test UI Boundaries',
    opponentName: 'Another Very Long Opponent Name For Testing Purposes',
  }),

  /**
   * Game with special characters
   */
  specialCharacters: () => newGame({
    teamName: 'FC Español & Friends',
    opponentName: 'München 1860 ñÑ',
  }),

  /**
   * Game with no available players (edge case)
   */
  noPlayers: () => newGame({
    availablePlayers: [],
    playersOnField: [],
    selectedPlayerIds: [],
  }),

  /**
   * Game with future date
   */
  futureDate: () => newGame({
    gameDate: '2030-12-31',
  }),
};

// Export fixture for direct access
export { fixture as gameStateFixture };
