/**
 * Legacy Migration Service Tests
 *
 * Tests for MatchOpsLocal → user-scoped database migration.
 * Uses mocked storage adapters and data stores.
 */

import {
  migrateLegacyData,
  isLegacyMigrationNeeded,
  deleteLegacyDatabase,
} from '../legacyMigrationService';
import { legacyDatabaseExists } from '@/datastore/userDatabase';
import { createLegacyAdapter } from '@/utils/storageFactory';
import { getDataStore } from '@/datastore/factory';
import type { DataStore } from '@/interfaces/DataStore';
import type { StorageAdapter } from '@/utils/storageAdapter';

// Mock dependencies
jest.mock('@/datastore/userDatabase');
jest.mock('@/utils/storageFactory');
jest.mock('@/datastore/factory');

const mockLegacyDatabaseExists = legacyDatabaseExists as jest.MockedFunction<typeof legacyDatabaseExists>;
const mockCreateLegacyAdapter = createLegacyAdapter as jest.MockedFunction<typeof createLegacyAdapter>;
const mockGetDataStore = getDataStore as jest.MockedFunction<typeof getDataStore>;

// =============================================================================
// TEST FIXTURES
// =============================================================================

const TEST_USER_ID = 'test-user-123';

const mockPlayer = {
  id: 'player-1',
  name: 'Test Player',
  jerseyNumber: '10',
  isGoalie: false,
};

const mockSeason = {
  id: 'season-1',
  name: 'Spring 2025',
  startDate: '2025-01-01',
  endDate: '2025-06-30',
  gameType: 'soccer' as const,
};

const mockGame = {
  id: 'game-1',
  teamName: 'Home Team',
  opponentName: 'Test Opponent',
  gameDate: '2025-01-15',
  homeScore: 2,
  awayScore: 1,
  homeOrAway: 'home' as const,
  numberOfPeriods: 2,
  periodDurationMinutes: 20,
  currentPeriod: 2,
  gameStatus: 'gameEnd' as const,
  isPlayed: true,
  showPlayerNames: true,
  gameNotes: '',
  availablePlayers: [mockPlayer],
  selectedPlayerIds: ['player-1'],
  playersOnField: [],
  gameEvents: [],
  opponents: [],
  drawings: [],
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: null,
  completedIntervalDurations: [],
  gamePersonnel: [],
  seasonId: '',
  tournamentId: '',
  tournamentSeriesId: '',
  tournamentLevel: '',
  teamId: '',
  gameTime: '',
  gameLocation: '',
  ageGroup: '',
  leagueId: '',
  customLeagueName: '',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createMockLegacyAdapter(data: Record<string, string | null>): StorageAdapter {
  return {
    getItem: jest.fn().mockImplementation((key: string) => Promise.resolve(data[key] ?? null)),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    keys: jest.fn().mockResolvedValue(Object.keys(data)),
  } as unknown as StorageAdapter;
}

function createMockDataStore(existingPlayers: unknown[] = []): DataStore {
  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    isInitialized: jest.fn().mockReturnValue(true),
    getPlayers: jest.fn().mockResolvedValue(existingPlayers),
    upsertPlayer: jest.fn().mockResolvedValue(undefined),
    upsertSeason: jest.fn().mockResolvedValue(mockSeason),
    upsertTournament: jest.fn().mockResolvedValue(undefined),
    upsertTeam: jest.fn().mockResolvedValue(undefined),
    setTeamRoster: jest.fn().mockResolvedValue(undefined),
    upsertPersonnelMember: jest.fn().mockResolvedValue(undefined),
    saveGame: jest.fn().mockResolvedValue(mockGame),
    upsertPlayerAdjustment: jest.fn().mockResolvedValue(undefined),
    saveWarmupPlan: jest.fn().mockResolvedValue(true),
    saveSettings: jest.fn().mockResolvedValue(undefined),
    // Other methods not used in migration
    getGames: jest.fn().mockResolvedValue({}),
    getSeasons: jest.fn().mockResolvedValue([]),
    getTournaments: jest.fn().mockResolvedValue([]),
    getTeams: jest.fn().mockResolvedValue([]),
  } as unknown as DataStore;
}

// =============================================================================
// TESTS
// =============================================================================

describe('legacyMigrationService', () => {
  // Suppress expected console output from error handling paths
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  describe('migrateLegacyData', () => {
    /**
     * Tests userId validation (defense in depth).
     * @edge-case
     */
    it('should reject invalid userId', async () => {
      // Empty string
      const emptyResult = await migrateLegacyData('');
      expect(emptyResult).toMatchObject({
        status: 'migration_error',
        error: 'Invalid user ID',
      });

      // Too long (> 255 chars)
      const longResult = await migrateLegacyData('x'.repeat(256));
      expect(longResult).toMatchObject({
        status: 'migration_error',
        error: 'Invalid user ID',
      });

      // Verify no database operations attempted
      expect(mockLegacyDatabaseExists).not.toHaveBeenCalled();
    });

    it('should return no_legacy_data when legacy database does not exist', async () => {
      mockLegacyDatabaseExists.mockResolvedValue(false);

      const result = await migrateLegacyData(TEST_USER_ID);

      expect(result.status).toBe('no_legacy_data');
      expect(mockCreateLegacyAdapter).not.toHaveBeenCalled();
    });

    it('should return no_legacy_data when legacy database is empty', async () => {
      mockLegacyDatabaseExists.mockResolvedValue(true);
      mockCreateLegacyAdapter.mockResolvedValue(createMockLegacyAdapter({}));
      mockGetDataStore.mockResolvedValue(createMockDataStore());

      const result = await migrateLegacyData(TEST_USER_ID);

      expect(result.status).toBe('no_legacy_data');
    });

    it('should return already_migrated when user already has data', async () => {
      mockLegacyDatabaseExists.mockResolvedValue(true);
      mockCreateLegacyAdapter.mockResolvedValue(createMockLegacyAdapter({
        soccerMasterRoster: JSON.stringify([mockPlayer]),
      }));
      // User already has players
      mockGetDataStore.mockResolvedValue(createMockDataStore([mockPlayer]));

      const result = await migrateLegacyData(TEST_USER_ID);

      expect(result.status).toBe('already_migrated');
    });

    it('should migrate data when legacy has content and user has no data', async () => {
      mockLegacyDatabaseExists.mockResolvedValue(true);
      mockCreateLegacyAdapter.mockResolvedValue(createMockLegacyAdapter({
        soccerMasterRoster: JSON.stringify([mockPlayer]),
        soccerSeasons: JSON.stringify([mockSeason]),
        savedSoccerGames: JSON.stringify({ 'game-1': mockGame }),
      }));
      const mockStore = createMockDataStore([]);
      mockGetDataStore.mockResolvedValue(mockStore);

      const result = await migrateLegacyData(TEST_USER_ID);

      expect(result.status).toBe('migrated');
      expect(result.entityCount).toBeGreaterThan(0);
      expect(result.counts?.players).toBe(1);
      expect(result.counts?.seasons).toBe(1);
      expect(result.counts?.games).toBe(1);
      expect(mockStore.upsertPlayer).toHaveBeenCalledWith(mockPlayer);
      expect(mockStore.upsertSeason).toHaveBeenCalledWith(mockSeason);
    });

    /**
     * Tests that currentGameId is nullified when it references a non-existent game.
     * @edge-case
     */
    it('should nullify currentGameId if game not in legacy data', async () => {
      mockLegacyDatabaseExists.mockResolvedValue(true);
      mockCreateLegacyAdapter.mockResolvedValue(createMockLegacyAdapter({
        soccerMasterRoster: JSON.stringify([mockPlayer]),
        soccerAppSettings: JSON.stringify({ currentGameId: 'nonexistent-game-id' }),
      }));
      const mockStore = createMockDataStore([]);
      mockGetDataStore.mockResolvedValue(mockStore);

      const result = await migrateLegacyData(TEST_USER_ID);

      expect(result.status).toBe('migrated');
      // Settings should be saved with currentGameId: null since the game doesn't exist
      expect(mockStore.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ currentGameId: null })
      );
    });

    it('should handle errors gracefully', async () => {
      mockLegacyDatabaseExists.mockResolvedValue(true);
      mockCreateLegacyAdapter.mockRejectedValue(new Error('Storage error'));

      const result = await migrateLegacyData(TEST_USER_ID);

      expect(result.status).toBe('no_legacy_data');
    });

    it('should return migration_error when getDataStore fails', async () => {
      mockLegacyDatabaseExists.mockResolvedValue(true);
      mockCreateLegacyAdapter.mockResolvedValue(createMockLegacyAdapter({
        soccerMasterRoster: JSON.stringify([mockPlayer]),
      }));
      mockGetDataStore.mockRejectedValue(new Error('DataStore error'));

      const result = await migrateLegacyData(TEST_USER_ID);

      expect(result.status).toBe('migration_error');
      expect(result.error).toBe('DataStore error');
    });

    /**
     * Tests partial migration failure behavior.
     * When a save operation fails midway, already-migrated data remains (no rollback).
     * This documents the current "partial state on failure" behavior.
     * @edge-case
     */
    it('should return migration_error when save fails midway (partial migration)', async () => {
      mockLegacyDatabaseExists.mockResolvedValue(true);
      mockCreateLegacyAdapter.mockResolvedValue(createMockLegacyAdapter({
        soccerMasterRoster: JSON.stringify([mockPlayer]),
        soccerSeasons: JSON.stringify([mockSeason]),
        savedSoccerGames: JSON.stringify({ 'game-1': mockGame, 'game-2': mockGame }),
      }));

      const mockStore = createMockDataStore([]);
      // saveGame succeeds for first game, fails for second
      (mockStore.saveGame as jest.Mock)
        .mockResolvedValueOnce(mockGame)
        .mockRejectedValueOnce(new Error('Database quota exceeded'));
      mockGetDataStore.mockResolvedValue(mockStore);

      const result = await migrateLegacyData(TEST_USER_ID);

      // Should return error status
      expect(result.status).toBe('migration_error');
      expect(result.error).toBe('Database quota exceeded');

      // Players and seasons were already migrated before games failed
      // (no rollback - this is documented behavior)
      expect(mockStore.upsertPlayer).toHaveBeenCalledWith(mockPlayer);
      expect(mockStore.upsertSeason).toHaveBeenCalledWith(mockSeason);
      // First game succeeded, second failed
      expect(mockStore.saveGame).toHaveBeenCalledTimes(2);
    });
  });

  describe('isLegacyMigrationNeeded', () => {
    it('should return false when legacy database does not exist', async () => {
      mockLegacyDatabaseExists.mockResolvedValue(false);

      const needed = await isLegacyMigrationNeeded(TEST_USER_ID);

      expect(needed).toBe(false);
    });

    it('should return false when user already has data', async () => {
      mockLegacyDatabaseExists.mockResolvedValue(true);
      mockGetDataStore.mockResolvedValue(createMockDataStore([mockPlayer]));

      const needed = await isLegacyMigrationNeeded(TEST_USER_ID);

      expect(needed).toBe(false);
    });

    it('should return true when legacy has data and user is empty', async () => {
      mockLegacyDatabaseExists.mockResolvedValue(true);
      mockGetDataStore.mockResolvedValue(createMockDataStore([]));
      mockCreateLegacyAdapter.mockResolvedValue(createMockLegacyAdapter({
        soccerMasterRoster: JSON.stringify([mockPlayer]),
      }));

      const needed = await isLegacyMigrationNeeded(TEST_USER_ID);

      expect(needed).toBe(true);
    });

    it('should return false on error', async () => {
      mockLegacyDatabaseExists.mockRejectedValue(new Error('Check failed'));

      const needed = await isLegacyMigrationNeeded(TEST_USER_ID);

      expect(needed).toBe(false);
    });
  });

  describe('deleteLegacyDatabase', () => {
    const originalIndexedDB = global.indexedDB;

    afterEach(() => {
      global.indexedDB = originalIndexedDB;
    });

    it('should return false when IndexedDB is not available', async () => {
      // @ts-expect-error - intentionally setting to undefined for test
      global.indexedDB = undefined;

      const result = await deleteLegacyDatabase();

      expect(result).toBe(false);
    });

    it('should return true when deletion succeeds', async () => {
      const mockDeleteDatabase = jest.fn().mockReturnValue({
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onblocked: null as (() => void) | null,
      });

      global.indexedDB = {
        deleteDatabase: mockDeleteDatabase,
      } as unknown as IDBFactory;

      // Start the deletion promise
      const resultPromise = deleteLegacyDatabase();

      // Trigger the success callback
      // Need to wait for the mock to be called
      await new Promise(resolve => setTimeout(resolve, 0));
      const request = mockDeleteDatabase.mock.results[0].value;
      request.onsuccess?.();

      const result = await resultPromise;
      expect(result).toBe(true);
    });

    it('should return false when deletion is blocked', async () => {
      const mockDeleteDatabase = jest.fn().mockReturnValue({
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onblocked: null as (() => void) | null,
      });

      global.indexedDB = {
        deleteDatabase: mockDeleteDatabase,
      } as unknown as IDBFactory;

      const resultPromise = deleteLegacyDatabase();

      await new Promise(resolve => setTimeout(resolve, 0));
      const request = mockDeleteDatabase.mock.results[0].value;
      request.onblocked?.();

      const result = await resultPromise;
      expect(result).toBe(false);
    });
  });
});
