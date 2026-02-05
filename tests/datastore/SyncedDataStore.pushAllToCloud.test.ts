/**
 * Tests for SyncedDataStore.pushAllToCloud() method.
 *
 * Tests the bulk push functionality including:
 * - Retry behavior for transient failures
 * - Chunked parallel processing
 * - Failure tracking for all entity types
 * - Continuation after individual failures
 *
 * @see src/datastore/SyncedDataStore.ts
 * @see src/utils/retry.ts
 */

import { SyncedDataStore } from '@/datastore/SyncedDataStore';
import type { DataStore } from '@/interfaces/DataStore';
import type { Player, Team, Season, Tournament, PlayerStatAdjustment } from '@/types';
import type { AppState, SavedGamesCollection } from '@/types/game';
import type { Personnel } from '@/types/personnel';
import type { WarmupPlan } from '@/types/warmupPlan';
import type { AppSettings } from '@/types/settings';

// Mock logger to suppress output
jest.mock('@/utils/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockLogger,
    createLogger: jest.fn(() => mockLogger),
  };
});

// Mock Sentry
jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  withScope: jest.fn(),
}));

// Mock the sync module
jest.mock('@/sync', () => ({
  SyncQueue: jest.fn().mockImplementation(() => ({
    clear: jest.fn().mockResolvedValue(undefined),
    enqueue: jest.fn().mockResolvedValue(undefined),
    onError: jest.fn(),
  })),
  getSyncEngine: jest.fn().mockResolvedValue({
    pause: jest.fn(),
    resume: jest.fn(),
    isEngineRunning: jest.fn().mockReturnValue(true),
  }),
  resetSyncEngine: jest.fn(),
  SyncEngine: jest.fn(),
}));

// Mock retry - just call the operation directly (retry logic is tested in retry.test.ts)
jest.mock('@/utils/retry', () => {
  const actual = jest.requireActual('@/utils/retry');
  return {
    ...actual,
    // Simple mock that just calls the operation once (no actual retry)
    retryWithBackoff: jest.fn(async (operation) => {
      return operation();
    }),
    chunkArray: actual.chunkArray,
    countPushFailures: actual.countPushFailures,
  };
});

describe('SyncedDataStore.pushAllToCloud', () => {
  let syncedDataStore: SyncedDataStore;
  let mockLocalStore: jest.Mocked<DataStore>;
  let mockRemoteStore: jest.Mocked<DataStore>;

  // Sample test data
  const mockPlayers: Player[] = [
    { id: 'player-1', name: 'Player 1', jerseyNumber: '1' } as Player,
    { id: 'player-2', name: 'Player 2', jerseyNumber: '2' } as Player,
  ];

  const mockTeams: Team[] = [
    { id: 'team-1', name: 'Team 1' } as Team,
  ];

  const mockSeasons: Season[] = [
    { id: 'season-1', name: 'Season 1' } as Season,
  ];

  const mockTournaments: Tournament[] = [
    { id: 'tournament-1', name: 'Tournament 1' } as Tournament,
  ];

  const mockPersonnel: Personnel[] = [
    { id: 'personnel-1', name: 'Coach 1' } as Personnel,
  ];

  const mockGames: SavedGamesCollection = {
    'game-1': { gameId: 'game-1' } as unknown as AppState,
  };

  const mockSettings: AppSettings = {} as AppSettings;
  const mockWarmupPlan: WarmupPlan = { id: 'warmup-1' } as WarmupPlan;
  const mockTeamRosters: Record<string, string[]> = { 'team-1': ['player-1'] };
  const mockAdjustments: Map<string, PlayerStatAdjustment[]> = new Map([
    ['player-1', [{ id: 'adj-1', playerId: 'player-1' } as PlayerStatAdjustment]],
  ]);

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock local store
    mockLocalStore = {
      getPlayers: jest.fn().mockResolvedValue(mockPlayers),
      getTeams: jest.fn().mockResolvedValue(mockTeams),
      getSeasons: jest.fn().mockResolvedValue(mockSeasons),
      getTournaments: jest.fn().mockResolvedValue(mockTournaments),
      getAllPersonnel: jest.fn().mockResolvedValue(mockPersonnel),
      getGames: jest.fn().mockResolvedValue(mockGames),
      getSettings: jest.fn().mockResolvedValue(mockSettings),
      getWarmupPlan: jest.fn().mockResolvedValue(mockWarmupPlan),
      getAllTeamRosters: jest.fn().mockResolvedValue(mockTeamRosters),
      getAllPlayerAdjustments: jest.fn().mockResolvedValue(mockAdjustments),
    } as unknown as jest.Mocked<DataStore>;

    // Create mock remote store (all operations succeed by default)
    mockRemoteStore = {
      upsertPlayer: jest.fn().mockResolvedValue(undefined),
      upsertTeam: jest.fn().mockResolvedValue(undefined),
      upsertSeason: jest.fn().mockResolvedValue(undefined),
      upsertTournament: jest.fn().mockResolvedValue(undefined),
      upsertPersonnelMember: jest.fn().mockResolvedValue(undefined),
      saveGame: jest.fn().mockResolvedValue({}),
      saveSettings: jest.fn().mockResolvedValue(undefined),
      saveWarmupPlan: jest.fn().mockResolvedValue(undefined),
      setTeamRoster: jest.fn().mockResolvedValue(undefined),
      upsertPlayerAdjustment: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DataStore>;
  });

  /**
   * Helper to create SyncedDataStore with mocked dependencies.
   * Uses internal structure - this is acceptable for unit tests.
   */
  function createSyncedDataStore(): SyncedDataStore {
    const store = new SyncedDataStore('test-user-id');
    // Inject mocked dependencies
    (store as unknown as { localStore: DataStore }).localStore = mockLocalStore;
    (store as unknown as { remoteStore: DataStore | null }).remoteStore = mockRemoteStore;
    (store as unknown as { syncQueue: { clear: () => Promise<void> } }).syncQueue = {
      clear: jest.fn().mockResolvedValue(undefined),
    };
    (store as unknown as { syncEngine: { pause: () => void; resume: () => void } | null }).syncEngine = {
      pause: jest.fn(),
      resume: jest.fn(),
    };
    return store;
  }

  describe('successful push', () => {
    it('should push all entities and return correct summary', async () => {
      syncedDataStore = createSyncedDataStore();

      const summary = await syncedDataStore.pushAllToCloud();

      expect(summary.players).toBe(2);
      expect(summary.teams).toBe(1);
      expect(summary.seasons).toBe(1);
      expect(summary.tournaments).toBe(1);
      expect(summary.personnel).toBe(1);
      expect(summary.games).toBe(1);
      expect(summary.settings).toBe(true);
      expect(summary.warmupPlan).toBe(true);
      expect(summary.failures.players).toHaveLength(0);
      expect(summary.failures.teams).toHaveLength(0);
      expect(summary.failures.games).toHaveLength(0);
    });

    it('should call remote store methods for all entities', async () => {
      syncedDataStore = createSyncedDataStore();

      await syncedDataStore.pushAllToCloud();

      expect(mockRemoteStore.upsertPlayer).toHaveBeenCalledTimes(2);
      expect(mockRemoteStore.upsertTeam).toHaveBeenCalledTimes(1);
      expect(mockRemoteStore.upsertSeason).toHaveBeenCalledTimes(1);
      expect(mockRemoteStore.upsertTournament).toHaveBeenCalledTimes(1);
      expect(mockRemoteStore.upsertPersonnelMember).toHaveBeenCalledTimes(1);
      expect(mockRemoteStore.saveGame).toHaveBeenCalledTimes(1);
      expect(mockRemoteStore.saveSettings).toHaveBeenCalledTimes(1);
      expect(mockRemoteStore.saveWarmupPlan).toHaveBeenCalledTimes(1);
      expect(mockRemoteStore.setTeamRoster).toHaveBeenCalledTimes(1);
      expect(mockRemoteStore.upsertPlayerAdjustment).toHaveBeenCalledTimes(1);
    });
  });

  describe('failure tracking', () => {
    it('should track failed players in failures array', async () => {
      mockRemoteStore.upsertPlayer
        .mockResolvedValueOnce(mockPlayers[0])
        .mockRejectedValue(new Error('Validation failed'));

      syncedDataStore = createSyncedDataStore();
      const summary = await syncedDataStore.pushAllToCloud();

      expect(summary.players).toBe(1); // Only first succeeded
      expect(summary.failures.players).toEqual(['player-2']);
    });

    it('should track failed teams in failures array', async () => {
      mockRemoteStore.upsertTeam.mockRejectedValue(new Error('Database error'));

      syncedDataStore = createSyncedDataStore();
      const summary = await syncedDataStore.pushAllToCloud();

      expect(summary.teams).toBe(0);
      expect(summary.failures.teams).toEqual(['team-1']);
    });

    it('should track failed games in failures array', async () => {
      mockRemoteStore.saveGame.mockRejectedValue(new Error('Foreign key violation'));

      syncedDataStore = createSyncedDataStore();
      const summary = await syncedDataStore.pushAllToCloud();

      expect(summary.games).toBe(0);
      expect(summary.failures.games).toEqual(['game-1']);
    });

    it('should track failed settings as boolean', async () => {
      mockRemoteStore.saveSettings.mockRejectedValue(new Error('Permission denied'));

      syncedDataStore = createSyncedDataStore();
      const summary = await syncedDataStore.pushAllToCloud();

      expect(summary.settings).toBe(false);
      expect(summary.failures.settings).toBe(true);
    });

    it('should track failed warmup plan as boolean', async () => {
      mockRemoteStore.saveWarmupPlan.mockRejectedValue(new Error('Conflict'));

      syncedDataStore = createSyncedDataStore();
      const summary = await syncedDataStore.pushAllToCloud();

      expect(summary.warmupPlan).toBe(false);
      expect(summary.failures.warmupPlan).toBe(true);
    });

    it('should track failed rosters in failures array', async () => {
      mockRemoteStore.setTeamRoster.mockRejectedValue(new Error('Team not found'));

      syncedDataStore = createSyncedDataStore();
      const summary = await syncedDataStore.pushAllToCloud();

      expect(summary.failures.rosters).toEqual(['team-1']);
    });

    it('should track failed adjustments in failures array', async () => {
      mockRemoteStore.upsertPlayerAdjustment.mockRejectedValue(new Error('Invalid data'));

      syncedDataStore = createSyncedDataStore();
      const summary = await syncedDataStore.pushAllToCloud();

      expect(summary.failures.adjustments).toEqual(['adj-1']);
    });
  });

  describe('continuation after failures', () => {
    it('should continue pushing other entities after player failure', async () => {
      mockRemoteStore.upsertPlayer.mockRejectedValue(new Error('Player error'));

      syncedDataStore = createSyncedDataStore();
      const summary = await syncedDataStore.pushAllToCloud();

      // Players failed but other entities should still be pushed
      expect(summary.failures.players).toHaveLength(2);
      expect(mockRemoteStore.upsertSeason).toHaveBeenCalled();
      expect(mockRemoteStore.upsertTeam).toHaveBeenCalled();
      expect(mockRemoteStore.saveGame).toHaveBeenCalled();
    });

    it('should continue pushing other entities after settings failure', async () => {
      mockRemoteStore.saveSettings.mockRejectedValue(new Error('Settings error'));

      syncedDataStore = createSyncedDataStore();
      const summary = await syncedDataStore.pushAllToCloud();

      expect(summary.failures.settings).toBe(true);
      expect(mockRemoteStore.saveWarmupPlan).toHaveBeenCalled();
      expect(mockRemoteStore.upsertPlayerAdjustment).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    // Note: Actual retry logic (exponential backoff, transient error detection)
    // is tested in tests/utils/retry.test.ts. These tests verify that
    // pushAllToCloud correctly handles errors from the retry wrapper.

    it('should handle operation errors and track failures', async () => {
      mockRemoteStore.upsertPlayer.mockRejectedValue(new Error('Database error'));

      syncedDataStore = createSyncedDataStore();
      const summary = await syncedDataStore.pushAllToCloud();

      // All players should fail
      expect(summary.players).toBe(0);
      expect(summary.failures.players).toHaveLength(2);
      expect(mockRemoteStore.upsertPlayer).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success and failure', async () => {
      mockRemoteStore.upsertPlayer
        .mockResolvedValueOnce(mockPlayers[0])
        .mockRejectedValueOnce(new Error('Failed'));

      syncedDataStore = createSyncedDataStore();
      const summary = await syncedDataStore.pushAllToCloud();

      expect(summary.players).toBe(1);
      expect(summary.failures.players).toEqual(['player-2']);
    });
  });

  describe('edge cases', () => {
    it('should handle empty local data', async () => {
      mockLocalStore.getPlayers.mockResolvedValue([]);
      mockLocalStore.getTeams.mockResolvedValue([]);
      mockLocalStore.getSeasons.mockResolvedValue([]);
      mockLocalStore.getTournaments.mockResolvedValue([]);
      mockLocalStore.getAllPersonnel.mockResolvedValue([]);
      mockLocalStore.getGames.mockResolvedValue({});
      mockLocalStore.getAllTeamRosters.mockResolvedValue({});
      mockLocalStore.getAllPlayerAdjustments.mockResolvedValue(new Map());

      syncedDataStore = createSyncedDataStore();
      const summary = await syncedDataStore.pushAllToCloud();

      expect(summary.players).toBe(0);
      expect(summary.teams).toBe(0);
      expect(summary.games).toBe(0);
      expect(summary.failures.players).toHaveLength(0);
    });

    it('should skip warmup plan push when null', async () => {
      mockLocalStore.getWarmupPlan.mockResolvedValue(null);

      syncedDataStore = createSyncedDataStore();
      await syncedDataStore.pushAllToCloud();

      expect(mockRemoteStore.saveWarmupPlan).not.toHaveBeenCalled();
    });

    it('should throw when remoteStore is not initialized', async () => {
      syncedDataStore = createSyncedDataStore();
      // Set remoteStore to null
      (syncedDataStore as unknown as { remoteStore: DataStore | null }).remoteStore = null;

      await expect(syncedDataStore.pushAllToCloud()).rejects.toThrow('Cloud store not available');
    });
  });
});
