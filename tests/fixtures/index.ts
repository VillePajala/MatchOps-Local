/**
 * Centralized Test Data Management System
 *
 * This module provides a unified interface for all test data fixtures,
 * ensuring consistency and reusability across the entire test suite.
 *
 * @example
 * ```typescript
 * import { TestFixtures } from '../fixtures';
 *
 * const player = TestFixtures.players.goalkeeper();
 * const game = TestFixtures.games.inProgress({ homeScore: 2 });
 * const season = TestFixtures.seasons.current();
 * ```
 */

import type { Player as _Player, Season as _Season, Tournament as _Tournament, AppState, GameEvent as _GameEvent } from '@/types';
export { TestIdGenerator, BaseFixture } from './base';

// Import all fixture factories individually to avoid naming conflicts
import * as PlayersFixtures from './players';
import * as GamesFixtures from './games';
import * as SeasonsFixtures from './seasons';
import * as TournamentsFixtures from './tournaments';
import * as SettingsFixtures from './settings';
import * as ErrorsFixtures from './errors';
import * as PersonnelFixtures from './personnel';
import * as GameContainerFixtures from './gameContainer';

// Use the same imported factories
const players = PlayersFixtures;
const games = GamesFixtures;
const seasons = SeasonsFixtures;
const tournaments = TournamentsFixtures;
const settings = SettingsFixtures;
const errors = ErrorsFixtures;
const personnel = PersonnelFixtures;
const gameContainer = GameContainerFixtures;

/**
 * Centralized test fixtures namespace providing organized access to all test data
 *
 * @description Organized by domain with consistent API patterns:
 * - All factories support optional overrides parameter
 * - Deterministic data generation for reliable tests
 * - Realistic but predictable test data
 * - Memory-efficient with minimal object creation
 * - Type-safe with full TypeScript support
 */
export const TestFixtures = {
  /**
   * Player-related test data
   * @example TestFixtures.players.goalkeeper({ name: 'Custom Goalie' })
   */
  players,

  /**
   * Game state and session test data
   * @example TestFixtures.games.completed({ homeScore: 3, awayScore: 1 })
   */
  games,

  /**
   * Season management test data
   * @example TestFixtures.seasons.archived({ name: '2023 Season' })
   */
  seasons,

  /**
   * Tournament and competition test data
   * @example TestFixtures.tournaments.competitive({ level: 'regional' })
   */
  tournaments,

  /**
   * Application settings and configuration test data
   * @example TestFixtures.settings.userPreferences({ language: 'fi' })
   */
  settings,

  /**
   * Error scenarios and edge case test data
   * @example TestFixtures.errors.storageQuotaExceeded()
   */
  errors,

  /**
   * Personnel and coaching staff test data
   * @example TestFixtures.personnel.headCoach({ name: 'John Coach' })
   */
  personnel,

  /**
   * GameContainer component props test data
   * @example TestFixtures.gameContainer.createGameContainerProps({ isDrawingEnabled: true })
   */
  gameContainer,

  /**
   * Utility methods for common test scenarios
   */
  utils: {
    /**
     * Creates a complete game scenario with all related data
     * @param overrides - Optional customizations
     * @returns Complete test scenario with players, game state, and metadata
     */
    createCompleteGameScenario(overrides: {
      teamSize?: number;
      gameStatus?: AppState['gameStatus'];
      includeEvents?: boolean;
      seasonName?: string;
    } = {}) {
      const {
        teamSize = 11,
        gameStatus = 'inProgress',
        includeEvents = true,
        seasonName = 'Test Season'
      } = overrides;

      const roster = players.fullTeam({ count: teamSize });
      const season = seasons.current({ name: seasonName });
      const gameState = games.withCustomStatus(gameStatus, {
        availablePlayers: roster,
        seasonId: season.id
      });

      const gameEvents = includeEvents ? [
        games.createGoalEvent({ time: 450, scorerId: roster[1].id }),
        games.createSubstitutionEvent({ time: 900, playerId: roster[5].id })
      ] : [];

      return {
        roster,
        season,
        gameState: { ...gameState, gameEvents },
        metadata: {
          created: new Date().toISOString(),
          scenario: 'complete_game'
        }
      };
    },

    /**
     * Creates test data for migration scenarios
     * @param itemCount - Number of items to create for migration testing
     * @returns Migration test data with various data types
     */
    createMigrationTestData(itemCount: number = 100) {
      const data = new Map<string, any>();

      // Add players
      for (let i = 0; i < Math.min(itemCount, 25); i++) {
        const player = players.fieldPlayer({
          name: `Migration Player ${i + 1}`,
          jerseyNumber: `${i + 1}`
        });
        data.set(`player_${i}`, player);
      }

      // Add games
      for (let i = 0; i < Math.min(itemCount, 10); i++) {
        const game = games.completed({
          teamName: `Migration Team ${i + 1}`,
          opponentName: `Migration Opponent ${i + 1}`
        });
        data.set(`game_${i}`, game);
      }

      // Add seasons
      for (let i = 0; i < Math.min(itemCount, 5); i++) {
        const season = seasons.archived({
          name: `Migration Season ${2020 + i}`,
          startDate: `${2020 + i}-01-01`,
          endDate: `${2020 + i}-12-31`
        });
        data.set(`season_${i}`, season);
      }

      return {
        data,
        metadata: {
          totalItems: data.size,
          itemTypes: ['players', 'games', 'seasons'],
          estimatedSizeBytes: JSON.stringify(Object.fromEntries(data)).length
        }
      };
    },

    /**
     * Creates performance test data with large datasets
     * @param scale - Scale factor for data generation
     * @returns Large dataset for performance testing
     */
    createPerformanceTestData(scale: 'small' | 'medium' | 'large' = 'medium') {
      const scales = {
        small: { players: 50, games: 10, events: 100 },
        medium: { players: 500, games: 50, events: 1000 },
        large: { players: 2000, games: 200, events: 5000 }
      };

      const { players: playerCount, games: gameCount, events: eventCount } = scales[scale];

      return {
        players: Array.from({ length: playerCount }, (_, i) =>
          players.fieldPlayer({ name: `Perf Player ${i + 1}` })
        ),
        games: Array.from({ length: gameCount }, (_, i) =>
          games.completed({ teamName: `Perf Team ${i + 1}` })
        ),
        events: Array.from({ length: eventCount }, () =>
          games.createGoalEvent({ time: Math.floor(Math.random() * 2700) })
        ),
        metadata: {
          scale,
          totalItems: playerCount + gameCount + eventCount,
          estimatedMemoryMB: Math.round((playerCount * 0.5 + gameCount * 2 + eventCount * 0.1) / 1024)
        }
      };
    }
  }
} as const;

/**
 * Type-safe fixture factory interface for consistent API across all fixtures
 */
export interface FixtureFactory<T> {
  /**
   * Creates a default instance of the fixture
   * @param overrides - Optional property overrides
   * @returns Generated fixture data
   */
  default(overrides?: Partial<T>): T;

  /**
   * Creates a realistic instance with common variations
   * @param overrides - Optional property overrides
   * @returns Generated fixture data with realistic values
   */
  realistic(overrides?: Partial<T>): T;

  /**
   * Creates an instance with minimal required data only
   * @param overrides - Optional property overrides
   * @returns Generated fixture data with minimal properties
   */
  minimal(overrides?: Partial<T>): T;
}

/**
 * Deterministic ID generator for consistent test data
 * Uses predictable patterns instead of random values for test reliability
 */
// Re-exported from './base' above to avoid circular imports
