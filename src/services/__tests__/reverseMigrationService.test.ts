/**
 * Reverse Migration Service Tests
 *
 * Tests for cloud → local data migration (reverse migration).
 * Uses mocked data stores to test migration logic without network calls.
 *
 * @integration
 */

import {
  getCloudDataSummary,
  migrateCloudToLocal,
  hasCloudData,
  isReverseMigrationRunning,
  hydrateLocalFromCloudWithRetry,
  isAuthNotReadyError,
  type ReverseMigrationProgress,
} from '../reverseMigrationService';
import { LocalDataStore } from '@/datastore/LocalDataStore';
import { SupabaseDataStore } from '@/datastore/SupabaseDataStore';
import type { Player, Team, Season, Tournament, Personnel } from '@/types';
import type { AppState } from '@/types';

// Mock the data stores
jest.mock('@/datastore/LocalDataStore');
jest.mock('@/datastore/SupabaseDataStore');

// Mock the Supabase client for hasCloudData (uses direct client access)
const mockSupabaseClient = {
  auth: {
    getSession: jest.fn().mockResolvedValue({
      data: { session: { user: { id: 'test-user-id' } } },
      error: null,
    }),
  },
  from: jest.fn(() => ({
    select: jest.fn().mockResolvedValue({ count: 0, error: null }),
  })),
};
jest.mock('@/datastore/supabase', () => ({
  getSupabaseClient: jest.fn(() => mockSupabaseClient),
}));

// Mock the factory to provide a mock auth service
jest.mock('@/datastore/factory', () => ({
  getAuthService: jest.fn().mockResolvedValue({
    refreshSession: jest.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
    getCurrentUser: jest.fn().mockReturnValue({ id: 'test-user-id' }),
  }),
}));

// Mock backendConfig
jest.mock('@/config/backendConfig', () => ({
  disableCloudMode: jest.fn(() => ({ success: true })),
  clearCloudAccountInfo: jest.fn(),
  updateCloudAccountInfo: jest.fn(),
}));

// Import the mocked functions to control them in tests
import { disableCloudMode, clearCloudAccountInfo, updateCloudAccountInfo } from '@/config/backendConfig';
const mockDisableCloudMode = disableCloudMode as jest.Mock;
const mockClearCloudAccountInfo = clearCloudAccountInfo as jest.Mock;
const mockUpdateCloudAccountInfo = updateCloudAccountInfo as jest.Mock;

const MockedLocalDataStore = LocalDataStore as jest.MockedClass<typeof LocalDataStore>;
const MockedSupabaseDataStore = SupabaseDataStore as jest.MockedClass<typeof SupabaseDataStore>;

// =============================================================================
// TEST FIXTURES
// =============================================================================

const mockPlayer: Player = {
  id: 'player-1',
  name: 'Test Player',
  jerseyNumber: '10',
  isGoalie: false,
};

const mockTeam: Team = {
  id: 'team-1',
  name: 'Test Team',
  gameType: 'soccer',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const mockSeason: Season = {
  id: 'season-1',
  name: 'Spring 2025',
  startDate: '2025-01-01',
  endDate: '2025-06-30',
  gameType: 'soccer',
};

const mockTournament: Tournament = {
  id: 'tournament-1',
  name: 'Summer Cup',
  startDate: '2025-07-01',
  endDate: '2025-07-31',
  gameType: 'soccer',
};

const mockPersonnel: Personnel = {
  id: 'personnel-1',
  name: 'Coach Smith',
  role: 'head_coach',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const mockGame: AppState = {
  teamName: 'Home Team',
  opponentName: 'Test Opponent',
  gameDate: '2025-01-15',
  homeScore: 2,
  awayScore: 1,
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 20,
  currentPeriod: 2,
  gameStatus: 'gameEnd',
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
  demandFactor: 0.8,
  timeElapsedInSeconds: 2400,
  gameType: 'soccer',
  seasonId: '',
  tournamentId: '',
};

// =============================================================================
// TEST SETUP
// =============================================================================

describe('reverseMigrationService', () => {
  let mockSupabaseDataStore: jest.Mocked<SupabaseDataStore>;
  let mockLocalDataStore: jest.Mocked<LocalDataStore>;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDisableCloudMode.mockReturnValue({ success: true });
    mockClearCloudAccountInfo.mockClear();
    mockUpdateCloudAccountInfo.mockClear();

    // Suppress expected console logs to prevent test failures
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    mockSupabaseDataStore = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getBackendName: jest.fn().mockReturnValue('supabase'),
      getPlayers: jest.fn().mockResolvedValue([mockPlayer]),
      getTeams: jest.fn().mockResolvedValue([mockTeam]),
      getSeasons: jest.fn().mockResolvedValue([mockSeason]),
      getTournaments: jest.fn().mockResolvedValue([mockTournament]),
      getAllPersonnel: jest.fn().mockResolvedValue([mockPersonnel]),
      getGames: jest.fn().mockResolvedValue({ 'game-1': mockGame }),
      getTeamRoster: jest.fn().mockResolvedValue([mockPlayer]),
      getPlayerAdjustments: jest.fn().mockResolvedValue([]),
      getAllPlayerAdjustments: jest.fn().mockResolvedValue(new Map()),
      getWarmupPlan: jest.fn().mockResolvedValue(null),
      getPlaytimePlans: jest.fn().mockResolvedValue({}),
      getPlaytimePlanLinks: jest.fn().mockResolvedValue({}),
      getPlaytimeGameSubs: jest.fn().mockResolvedValue([]),
      getAllPlaytimeGameSubs: jest.fn().mockResolvedValue({}),
      getSettings: jest.fn().mockResolvedValue(null),
      clearAllUserData: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SupabaseDataStore>;

    mockLocalDataStore = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getBackendName: jest.fn().mockReturnValue('local'),
      getPlayers: jest.fn().mockResolvedValue([mockPlayer]),
      getTeams: jest.fn().mockResolvedValue([mockTeam]),
      getSeasons: jest.fn().mockResolvedValue([mockSeason]),
      getTournaments: jest.fn().mockResolvedValue([mockTournament]),
      getAllPersonnel: jest.fn().mockResolvedValue([mockPersonnel]),
      getGames: jest.fn().mockResolvedValue({ 'game-1': mockGame }),
      upsertPlayer: jest.fn().mockResolvedValue(mockPlayer),
      upsertTeam: jest.fn().mockResolvedValue(mockTeam),
      upsertSeason: jest.fn().mockResolvedValue(mockSeason),
      upsertTournament: jest.fn().mockResolvedValue(mockTournament),
      upsertPersonnelMember: jest.fn().mockResolvedValue(mockPersonnel),
      upsertPlayerAdjustment: jest.fn().mockResolvedValue({}),
      setTeamRoster: jest.fn().mockResolvedValue(undefined),
      // Must return TeamPlayer objects with id property for verification
      getTeamRoster: jest.fn().mockResolvedValue([{ id: mockPlayer.id, playerId: mockPlayer.id, jerseyNumber: mockPlayer.jerseyNumber }]),
      getPlayerAdjustments: jest.fn().mockResolvedValue([]),
      saveGame: jest.fn().mockResolvedValue(mockGame),
      saveWarmupPlan: jest.fn().mockResolvedValue(undefined),
      saveSettings: jest.fn().mockResolvedValue(undefined),
      // Restores are LocalDataStore-only - they had been declared on the cloud
      // double, which does not have them, so hydration blew up on the first
      // call and every attempt "failed" for a reason nothing in the app shares.
      restorePlaytimePlans: jest.fn().mockResolvedValue(0),
      restorePlaytimePlanLinks: jest.fn().mockResolvedValue(0),
      restorePlaytimeGameSubs: jest.fn().mockResolvedValue(0),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<LocalDataStore>;

    // Setup constructor mocks
    MockedSupabaseDataStore.mockImplementation(() => mockSupabaseDataStore);
    MockedLocalDataStore.mockImplementation(() => mockLocalDataStore);
  });

  afterEach(() => {
    // Restore console spies
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  // =============================================================================
  // getCloudDataSummary tests
  // =============================================================================

  describe('getCloudDataSummary', () => {
    it('should return counts of cloud data', async () => {
      const summary = await getCloudDataSummary();

      expect(summary).toEqual({
        players: 1,
        teams: 1,
        teamRosters: 1,
        seasons: 1,
        tournaments: 1,
        games: 1,
        personnel: 1,
        playerAdjustments: 0,
        warmupPlan: false,
        settings: false,
      });
    });

    it('should initialize SupabaseDataStore', async () => {
      await getCloudDataSummary();

      expect(mockSupabaseDataStore.initialize).toHaveBeenCalled();
    });

    it('should handle empty cloud data', async () => {
      mockSupabaseDataStore.getPlayers.mockResolvedValue([]);
      mockSupabaseDataStore.getTeams.mockResolvedValue([]);
      mockSupabaseDataStore.getSeasons.mockResolvedValue([]);
      mockSupabaseDataStore.getTournaments.mockResolvedValue([]);
      mockSupabaseDataStore.getAllPersonnel.mockResolvedValue([]);
      mockSupabaseDataStore.getGames.mockResolvedValue({});
      mockSupabaseDataStore.getTeamRoster.mockResolvedValue([]);

      const summary = await getCloudDataSummary();

      expect(summary.players).toBe(0);
      expect(summary.teams).toBe(0);
      expect(summary.games).toBe(0);
    });
  });

  // =============================================================================
  // hasCloudData tests
  // Note: hasCloudData uses Supabase client directly, not SupabaseDataStore
  // =============================================================================

  describe('hasCloudData', () => {
    it('should return hasData: true when cloud has data', async () => {
      // Mock the client's from().select() to return count > 0 for games
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockResolvedValue({ count: 5, error: null }),
      });

      const result = await hasCloudData();

      expect(result.hasData).toBe(true);
      expect(result.checkFailed).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should return hasData: false when cloud is empty', async () => {
      // Mock the client's from().select() to return count = 0 for all tables
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockResolvedValue({ count: 0, error: null }),
      });

      const result = await hasCloudData();

      expect(result.hasData).toBe(false);
      expect(result.checkFailed).toBe(false);
    });

    it('should return checkFailed: true on error', async () => {
      // Mock the client's from().select() to return an error
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockResolvedValue({ count: null, error: { message: 'Network error' } }),
      });

      const result = await hasCloudData();

      expect(result.checkFailed).toBe(true);
      // Error message includes the table name
      expect(result.error).toBe('Failed to check games: Network error');
    });
  });

  // =============================================================================
  // migrateCloudToLocal tests
  // =============================================================================

  describe('migrateCloudToLocal', () => {
    let progressUpdates: ReverseMigrationProgress[];
    const mockOnProgress = (progress: ReverseMigrationProgress) => {
      progressUpdates.push(progress);
    };

    beforeEach(() => {
      progressUpdates = [];
    });

    /**
     * @critical Happy path - full migration flow
     */
    it('should successfully migrate all data from cloud to local (keep-cloud mode)', async () => {
      const result = await migrateCloudToLocal(mockOnProgress, 'keep-cloud');

      // Should succeed
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.cloudDeleted).toBe(false);

      // Should have correct counts
      expect(result.downloaded.players).toBe(1);
      expect(result.downloaded.teams).toBe(1);
      expect(result.downloaded.seasons).toBe(1);
      expect(result.downloaded.tournaments).toBe(1);
      expect(result.downloaded.personnel).toBe(1);
      expect(result.downloaded.games).toBe(1);

      // Should call local upsert methods
      expect(mockLocalDataStore.upsertPlayer).toHaveBeenCalledWith(mockPlayer);
      expect(mockLocalDataStore.upsertTeam).toHaveBeenCalledWith(mockTeam);
      expect(mockLocalDataStore.upsertSeason).toHaveBeenCalledWith(mockSeason);
      expect(mockLocalDataStore.upsertTournament).toHaveBeenCalledWith(mockTournament);
      expect(mockLocalDataStore.upsertPersonnelMember).toHaveBeenCalledWith(mockPersonnel);
      expect(mockLocalDataStore.saveGame).toHaveBeenCalledWith('game-1', mockGame);

      // Should NOT delete cloud data in keep-cloud mode
      expect(mockSupabaseDataStore.clearAllUserData).not.toHaveBeenCalled();

      // Should switch to local mode
      expect(mockDisableCloudMode).toHaveBeenCalled();

      // Should update cloud account info
      expect(mockUpdateCloudAccountInfo).toHaveBeenCalledWith(
        expect.objectContaining({ hasCloudData: true })
      );
    });

    /**
     * @critical Delete cloud mode
     */
    it('should delete cloud data after migration in delete-cloud mode', async () => {
      const result = await migrateCloudToLocal(mockOnProgress, 'delete-cloud');

      expect(result.success).toBe(true);
      expect(result.cloudDeleted).toBe(true);

      // Should delete cloud data
      expect(mockSupabaseDataStore.clearAllUserData).toHaveBeenCalled();

      // Should clear cloud account info
      expect(mockClearCloudAccountInfo).toHaveBeenCalled();
    });

    /**
     * @edge-case Offline check
     */
    it('should fail when offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      });

      const result = await migrateCloudToLocal(mockOnProgress);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Cannot download while offline. Please check your connection.');
    });

    /**
     * @edge-case Mode switch failure
     */
    it('should report error when mode switch fails', async () => {
      mockDisableCloudMode.mockReturnValue({ success: false, reason: 'storage_write_failed', message: 'Storage write failed' });

      const result = await migrateCloudToLocal(mockOnProgress);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Failed to switch to local mode')
      );
    });

    /**
     * @edge-case Verification failure
     */
    it('should report error when verification fails', async () => {
      // Local returns fewer items than downloaded
      mockLocalDataStore.getPlayers.mockResolvedValue([]);

      const result = await migrateCloudToLocal(mockOnProgress);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Verification failed')
      );
    });

    /**
     * @edge-case Partial save failure - critical entities
     */
    it('should fail when critical entity save fails', async () => {
      mockLocalDataStore.upsertPlayer.mockRejectedValue(new Error('Save failed'));

      const result = await migrateCloudToLocal(mockOnProgress);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('player') && e.includes('Save failed'))).toBe(true);
    });

    /**
     * @edge-case Partial save failure - non-critical entities
     */
    it('should report warning for non-critical entity save failures', async () => {
      mockLocalDataStore.upsertPlayerAdjustment.mockRejectedValue(new Error('Adjustment save failed'));
      // Add an adjustment to trigger the error (use getAllPlayerAdjustments since batch method is now used)
      const adjustmentMap = new Map();
      adjustmentMap.set('player-1', [{
        id: 'adj-1',
        playerId: 'player-1',
        gamesPlayedDelta: 1,
        goalsDelta: 2,
        assistsDelta: 0,
        appliedAt: '2025-01-01T00:00:00.000Z',
      }]);
      mockSupabaseDataStore.getAllPlayerAdjustments.mockResolvedValue(adjustmentMap);

      const result = await migrateCloudToLocal(mockOnProgress);

      // Should still succeed because adjustment is non-critical
      expect(result.warnings.some(w => w.includes('adjustment'))).toBe(true);
    });

    /**
     * @edge-case Delete cloud data failure after successful download
     * When deletion fails in delete-cloud mode, the migration still succeeds because
     * mode switch happened first. User is safely in local mode; cloud data can be
     * deleted later from Settings. This is intentional - don't force user to redo
     * the entire migration just because the cleanup step failed.
     */
    it('should succeed migration but warn if cloud deletion fails after mode switch', async () => {
      mockSupabaseDataStore.clearAllUserData.mockRejectedValue(new Error('Delete failed'));

      const result = await migrateCloudToLocal(mockOnProgress, 'delete-cloud');

      // Migration succeeds because mode switch happened before deletion attempt
      expect(result.success).toBe(true);
      expect(result.cloudDeleted).toBe(false);
      expect(result.warnings.some(w => w.includes('Failed to delete cloud data'))).toBe(true);
      expect(result.warnings.some(w => w.includes('delete it later from Settings'))).toBe(true);
      // Mode switch should have been called (happens before deletion)
      expect(mockDisableCloudMode).toHaveBeenCalled();
    });

    /**
     * @edge-case Cloud NOT deleted when critical save failures occur
     */
    it('should not delete cloud data when critical save failures occur', async () => {
      mockLocalDataStore.upsertPlayer.mockRejectedValue(new Error('Save failed'));

      const result = await migrateCloudToLocal(mockOnProgress, 'delete-cloud');

      // Cloud should NOT be deleted
      expect(mockSupabaseDataStore.clearAllUserData).not.toHaveBeenCalled();
      expect(result.cloudDeleted).toBe(false);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Cloud data was NOT deleted because some entities failed')
      );
    });

    /**
     * Progress callback tests
     */
    it('should call progress callback through all stages', async () => {
      await migrateCloudToLocal(mockOnProgress);

      const stages = progressUpdates.map(p => p.stage);

      expect(stages).toContain('preparing');
      expect(stages).toContain('downloading');
      expect(stages).toContain('saving');
      expect(stages).toContain('verifying');
      expect(stages).toContain('complete');
    });

    it('should handle progress callback errors gracefully', async () => {
      const throwingCallback = () => {
        throw new Error('Callback error');
      };

      // Should not throw even if callback throws
      const result = await migrateCloudToLocal(throwingCallback);

      expect(result.success).toBe(true);
    });

    /**
     * @critical User-scoped storage: LocalDataStore receives userId
     */
    it('should create LocalDataStore with userId when provided', async () => {
      const result = await migrateCloudToLocal(mockOnProgress, 'keep-cloud', 'test-user-123');

      expect(result.success).toBe(true);
      expect(MockedLocalDataStore).toHaveBeenCalledWith('test-user-123');
    });

    it('should create LocalDataStore without userId when not provided', async () => {
      const result = await migrateCloudToLocal(mockOnProgress, 'keep-cloud');

      expect(result.success).toBe(true);
      expect(MockedLocalDataStore).toHaveBeenCalledWith(undefined);
    });

    /**
     * @edge-case Empty cloud data
     */
    it('should handle empty cloud data gracefully', async () => {
      mockSupabaseDataStore.getPlayers.mockResolvedValue([]);
      mockSupabaseDataStore.getTeams.mockResolvedValue([]);
      mockSupabaseDataStore.getSeasons.mockResolvedValue([]);
      mockSupabaseDataStore.getTournaments.mockResolvedValue([]);
      mockSupabaseDataStore.getAllPersonnel.mockResolvedValue([]);
      mockSupabaseDataStore.getGames.mockResolvedValue({});
      mockLocalDataStore.getPlayers.mockResolvedValue([]);
      mockLocalDataStore.getTeams.mockResolvedValue([]);
      mockLocalDataStore.getSeasons.mockResolvedValue([]);
      mockLocalDataStore.getTournaments.mockResolvedValue([]);
      mockLocalDataStore.getAllPersonnel.mockResolvedValue([]);
      mockLocalDataStore.getGames.mockResolvedValue({});

      const result = await migrateCloudToLocal(mockOnProgress);

      expect(result.success).toBe(true);
      expect(result.downloaded.players).toBe(0);
      expect(result.downloaded.games).toBe(0);
    });

    /**
     * Warmup plan and settings migration
     */
    it('should migrate warmup plan and settings when present', async () => {
      const mockWarmupPlan = {
        id: 'user_warmup_plan',
        version: 1,
        lastModified: '2025-01-01T00:00:00.000Z',
        isDefault: false,
        sections: [],
      };
      const mockSettings = { currentGameId: null, language: 'en' };
      mockSupabaseDataStore.getWarmupPlan.mockResolvedValue(mockWarmupPlan);
      mockSupabaseDataStore.getSettings.mockResolvedValue(mockSettings);

      const result = await migrateCloudToLocal(mockOnProgress);

      expect(result.success).toBe(true);
      expect(result.downloaded.warmupPlan).toBe(true);
      expect(result.downloaded.settings).toBe(true);
      expect(mockLocalDataStore.saveWarmupPlan).toHaveBeenCalledWith(mockWarmupPlan);
      expect(mockLocalDataStore.saveSettings).toHaveBeenCalledWith(mockSettings);
    });
  });

  // =============================================================================
  // isReverseMigrationRunning tests
  // =============================================================================

  describe('isReverseMigrationRunning', () => {
    it('should return false when no migration is running', () => {
      expect(isReverseMigrationRunning()).toBe(false);
    });

    it('should deduplicate concurrent migrations (Promise deduplication pattern)', async () => {
      // The actual behavior is Promise deduplication - concurrent calls wait
      // for the first one and receive the SAME result, not an error.
      // This is intentional per the code comment in migrateCloudToLocal.

      // Track how many times performReverseMigration actually runs
      let migrationExecutions = 0;
      const originalGetPlayers = mockSupabaseDataStore.getPlayers;
      mockSupabaseDataStore.getPlayers = jest.fn().mockImplementation(() => {
        migrationExecutions++;
        return originalGetPlayers();
      });

      // Start both migrations concurrently
      const [result1, result2] = await Promise.all([
        migrateCloudToLocal(() => {}),
        migrateCloudToLocal(() => {}),
      ]);

      // Both should succeed (Promise deduplication returns same result)
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // But only ONE migration actually executed (deduplication)
      // Note: getPlayers is called once per migration execution
      expect(migrationExecutions).toBe(1);

      // After completion, should allow new migration
      expect(isReverseMigrationRunning()).toBe(false);
    });
  });

  /**
   * Hydration retries.
   *
   * @critical - this is the new-device path. Local is empty and everything the
   * coach owns has to come down from the cloud, so a single transient failure
   * here shows them an app with none of their games in it.
   *
   * Real timers on purpose: the delays are short, and faking them buys a second
   * of runtime at the cost of a subtler test.
   */
  describe('hydrateLocalFromCloudWithRetry', () => {
    it('recovers when the first attempt fails and the next succeeds', async () => {
      const players = mockSupabaseDataStore.getPlayers as jest.Mock;
      players
        .mockRejectedValueOnce(new Error('network blip'))
        .mockResolvedValue([mockPlayer]);

      const result = await hydrateLocalFromCloudWithRetry('test-user-id');

      expect(result.success).toBe(true);
      expect(players).toHaveBeenCalledTimes(2);
    });

    /** Without this the retry would be pointless - it would report the failure anyway. */
    it('reports success, not the failure it recovered from', async () => {
      (mockSupabaseDataStore.getPlayers as jest.Mock)
        .mockRejectedValueOnce(new Error('network blip'))
        .mockResolvedValue([mockPlayer]);

      const result = await hydrateLocalFromCloudWithRetry('test-user-id');

      expect(result.errors).toEqual([]);
    });

    it('gives up after a fixed number of attempts rather than looping', async () => {
      const players = mockSupabaseDataStore.getPlayers as jest.Mock;
      players.mockRejectedValue(new Error('still broken'));

      const result = await hydrateLocalFromCloudWithRetry('test-user-id');

      expect(result.success).toBe(false);
      expect(players).toHaveBeenCalledTimes(3);
    });

    /**
     * Auth-not-ready is the Supabase session still loading, not a fault. The
     * caller stands down and tries again once auth settles, so spending the
     * retries here would only delay that.
     */
    it('does not retry while auth is simply not ready yet', async () => {
      mockSupabaseClient.auth.getSession.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });

      const result = await hydrateLocalFromCloudWithRetry('test-user-id');

      expect(result.success).toBe(false);
      expect(isAuthNotReadyError(result.errors)).toBe(true);
      expect(mockSupabaseClient.auth.getSession).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * @critical - regression guard for the bug that made a first sign-in show
   * first-run onboarding over the coach's own account until the app was
   * reopened.
   */
  describe('the shared IndexedDB adapter', () => {
    /**
     * LocalDataStore.close() closes the process-wide cached adapter for the
     * user, not just this instance's handle. A transient store closing it
     * mid-session leaves the app's own DataStore holding a closed connection
     * for the rest of the page's life.
     */
    it('survives hydration - a transient store must not close it', async () => {
      await hydrateLocalFromCloudWithRetry('test-user-id');

      expect(mockLocalDataStore.close).not.toHaveBeenCalled();
    });

    it('survives a hydration that fails, too', async () => {
      (mockSupabaseDataStore.getPlayers as jest.Mock).mockRejectedValue(new Error('still broken'));

      await hydrateLocalFromCloudWithRetry('test-user-id');

      expect(mockLocalDataStore.close).not.toHaveBeenCalled();
    });

    /** The cloud store is safe to close - its client is a singleton it leaves alone. */
    it('is unrelated to the cloud store, which is still closed', async () => {
      await hydrateLocalFromCloudWithRetry('test-user-id');

      expect(mockSupabaseDataStore.close).toHaveBeenCalled();
    });
  });

  /**
   * @critical - restoring is not the same as creating. Reproduces the failure
   * the owner hit: "Failed to save season Kevatsarja P10: Invalid age group"
   * repeated for every affected game, with those records simply absent
   * afterwards.
   */
  describe('an age group the app no longer recognises', () => {
    const BAD = 'P10'; // Finnish style; AGE_GROUPS is U7-U21

    it('keeps the season and drops only the label', async () => {
      (mockSupabaseDataStore.getSeasons as jest.Mock).mockResolvedValue([
        { ...mockSeason, name: 'Kevatsarja P10', ageGroup: BAD },
      ]);

      await hydrateLocalFromCloudWithRetry('test-user-id');

      expect(mockLocalDataStore.upsertSeason).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Kevatsarja P10', ageGroup: undefined }),
      );
    });

    it('keeps the game, which is the part the coach cannot get back', async () => {
      (mockSupabaseDataStore.getGames as jest.Mock).mockResolvedValue({
        game_mock_1: { ...mockGame, ageGroup: BAD },
      });

      await hydrateLocalFromCloudWithRetry('test-user-id');

      expect(mockLocalDataStore.saveGame).toHaveBeenCalledWith(
        'game_mock_1',
        expect.objectContaining({ ageGroup: undefined }),
      );
    });

    /**
     * The whole point, and the only test here that reproduces the real
     * failure: the doubles are made to reject a bad age group the way
     * LocalDataStore's validation actually does, so without the sanitiser this
     * fails exactly as the owner's phone did.
     */
    it('does not fail the hydration', async () => {
      const rejectBadAgeGroup = (entity: { ageGroup?: string }) => {
        if (entity.ageGroup && !/^U(?:[7-9]|1\d|2[01])$/.test(entity.ageGroup)) {
          return Promise.reject(new Error('Invalid age group'));
        }
        return Promise.resolve(entity);
      };
      (mockLocalDataStore.upsertSeason as jest.Mock).mockImplementation(rejectBadAgeGroup);
      (mockLocalDataStore.saveGame as jest.Mock).mockImplementation((_id, game) =>
        rejectBadAgeGroup(game),
      );

      (mockSupabaseDataStore.getSeasons as jest.Mock).mockResolvedValue([
        { ...mockSeason, name: 'Kevatsarja P10', ageGroup: BAD },
      ]);
      (mockSupabaseDataStore.getGames as jest.Mock).mockResolvedValue({
        game_mock_1: { ...mockGame, ageGroup: BAD },
      });

      const result = await hydrateLocalFromCloudWithRetry('test-user-id');

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
      expect(result.counts.seasons).toBeGreaterThan(0);
    });

    it('leaves a recognised age group exactly as it was', async () => {
      (mockSupabaseDataStore.getSeasons as jest.Mock).mockResolvedValue([
        { ...mockSeason, ageGroup: 'U11' },
      ]);

      await hydrateLocalFromCloudWithRetry('test-user-id');

      expect(mockLocalDataStore.upsertSeason).toHaveBeenCalledWith(
        expect.objectContaining({ ageGroup: 'U11' }),
      );
    });
  });

  describe('isAuthNotReadyError', () => {
    it.each([
      ['No active session. Please sign in again.'],
      ['Session error: Not authenticated'],
      ['auth token expired'],
    ])('treats %s as auth not being ready', (message) => {
      expect(isAuthNotReadyError([message])).toBe(true);
    });

    it.each([
      ['Failed to hydrate players: network blip'],
      ['Hydration failed: Unknown error'],
    ])('treats %s as a real failure worth retrying', (message) => {
      expect(isAuthNotReadyError([message])).toBe(false);
    });

    it('is false when there is nothing wrong at all', () => {
      expect(isAuthNotReadyError([])).toBe(false);
      expect(isAuthNotReadyError(undefined)).toBe(false);
    });

    /** hasCloudData reports a single string; hydration reports an array. */
    it('accepts either shape its two callers hand it', () => {
      expect(isAuthNotReadyError('Not authenticated')).toBe(true);
      expect(isAuthNotReadyError(['Not authenticated'])).toBe(true);
    });
  });

});

