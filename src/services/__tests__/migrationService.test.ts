/**
 * Migration Service Tests
 *
 * Tests for local → cloud data migration.
 * Uses mocked data stores to test migration logic without network calls.
 */

import {
  migrateLocalToCloud,
  hasLocalDataToMigrate,
  getLocalDataSummary,
  isMigrationRunning,
  MIGRATION_MESSAGES,
  type MigrationProgress,
} from '../migrationService';
import { LocalDataStore } from '@/datastore/LocalDataStore';
import { SupabaseDataStore } from '@/datastore/SupabaseDataStore';
import type { Player, Team, TeamPlayer, Season, Tournament, Personnel } from '@/types';
import type { AppState } from '@/types';

// Mock the data stores
jest.mock('@/datastore/LocalDataStore');
jest.mock('@/datastore/SupabaseDataStore');

// Mock the factory to provide a mock auth service
jest.mock('@/datastore/factory', () => ({
  getAuthService: jest.fn().mockResolvedValue({
    refreshSession: jest.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
    getCurrentUser: jest.fn().mockReturnValue({ id: 'test-user-id' }),
  }),
}));

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

// TeamPlayer is the roster entry format (different from Player)
const mockTeamPlayer: TeamPlayer = {
  id: 'player-1',
  name: 'Test Player',
  jerseyNumber: '10',
  isGoalie: false,
};

// Note: AppState doesn't have an 'id' field - game IDs are keys in SavedGamesCollection
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

function createMockLocalStore() {
  const mockInstance = {
    initialize: jest.fn().mockResolvedValue(undefined),
    getPlayers: jest.fn().mockResolvedValue([mockPlayer]),
    getTeams: jest.fn().mockResolvedValue([mockTeam]),
    getAllTeamRosters: jest.fn().mockResolvedValue({ 'team-1': [mockTeamPlayer] }),
    getSeasons: jest.fn().mockResolvedValue([mockSeason]),
    getTournaments: jest.fn().mockResolvedValue([mockTournament]),
    getAllPersonnel: jest.fn().mockResolvedValue([mockPersonnel]),
    getGames: jest.fn().mockResolvedValue({ 'game-1': mockGame }),
    getPlayerAdjustments: jest.fn().mockResolvedValue([]),
    getAllPlayerAdjustments: jest.fn().mockResolvedValue(new Map()),
    getWarmupPlan: jest.fn().mockResolvedValue(null),
    getSettings: jest.fn().mockResolvedValue({ language: 'en' }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  MockedLocalDataStore.mockImplementation(() => mockInstance as unknown as LocalDataStore);
  return mockInstance;
}

function createMockCloudStore() {
  const mockInstance = {
    initialize: jest.fn().mockResolvedValue(undefined),
    // Upsert methods (used by migration - preserve original IDs)
    upsertPlayer: jest.fn().mockResolvedValue(mockPlayer),
    upsertTeam: jest.fn().mockResolvedValue(mockTeam),
    upsertSeason: jest.fn().mockResolvedValue(mockSeason),
    upsertTournament: jest.fn().mockResolvedValue(mockTournament),
    upsertPersonnelMember: jest.fn().mockResolvedValue(mockPersonnel),
    // Other methods used by migration
    setTeamRoster: jest.fn().mockResolvedValue(undefined),
    saveGame: jest.fn().mockResolvedValue(mockGame),
    upsertPlayerAdjustment: jest.fn().mockResolvedValue(undefined),
    saveWarmupPlan: jest.fn().mockResolvedValue(true),
    saveSettings: jest.fn().mockResolvedValue(undefined),
    // Verification methods
    getPlayers: jest.fn().mockResolvedValue([mockPlayer]),
    getTeams: jest.fn().mockResolvedValue([mockTeam]),
    getSeasons: jest.fn().mockResolvedValue([mockSeason]),
    getTournaments: jest.fn().mockResolvedValue([mockTournament]),
    getGames: jest.fn().mockResolvedValue({ 'game-1': mockGame }),
    getAllPersonnel: jest.fn().mockResolvedValue([mockPersonnel]),
    // Replace mode methods
    clearAllUserData: jest.fn().mockResolvedValue(undefined),
    // Cleanup
    close: jest.fn().mockResolvedValue(undefined),
  };
  MockedSupabaseDataStore.mockImplementation(() => mockInstance as unknown as SupabaseDataStore);
  return mockInstance;
}

// =============================================================================
// TESTS
// =============================================================================

describe('migrationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('migrateLocalToCloud', () => {
    it('should migrate all data successfully', async () => {
      const mockLocal = createMockLocalStore();
      const mockCloud = createMockCloudStore();

      const progressUpdates: MigrationProgress[] = [];
      const onProgress = (progress: MigrationProgress) => {
        progressUpdates.push(progress);
      };

      const result = await migrateLocalToCloud(onProgress);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.migrated.players).toBe(1);
      expect(result.migrated.teams).toBe(1);
      expect(result.migrated.seasons).toBe(1);
      expect(result.migrated.tournaments).toBe(1);
      expect(result.migrated.games).toBe(1);
      expect(result.migrated.personnel).toBe(1);
      expect(result.migrated.settings).toBe(true);

      // Verify data stores were initialized
      expect(mockLocal.initialize).toHaveBeenCalled();
      expect(mockCloud.initialize).toHaveBeenCalled();

      // Verify progress updates
      expect(progressUpdates.some((p) => p.stage === 'preparing')).toBe(true);
      expect(progressUpdates.some((p) => p.stage === 'exporting')).toBe(true);
      expect(progressUpdates.some((p) => p.stage === 'uploading')).toBe(true);
      expect(progressUpdates.some((p) => p.stage === 'verifying')).toBe(true);
      expect(progressUpdates.some((p) => p.stage === 'complete')).toBe(true);
    });

    it('should use upsert methods that preserve original IDs', async () => {
      createMockLocalStore();
      const mockCloud = createMockCloudStore();

      const result = await migrateLocalToCloud(() => {});

      expect(result.success).toBe(true);
      expect(result.migrated.players).toBe(1);
      // Verify upsert methods are called (these preserve original IDs)
      expect(mockCloud.upsertPlayer).toHaveBeenCalledWith(mockPlayer);
      expect(mockCloud.upsertTeam).toHaveBeenCalled();
      expect(mockCloud.upsertSeason).toHaveBeenCalled();
      expect(mockCloud.upsertTournament).toHaveBeenCalled();
      expect(mockCloud.upsertPersonnelMember).toHaveBeenCalled();
    });

    it('should report validation warnings for orphan references', async () => {
      const mockLocal = createMockLocalStore();
      const mockCloud = createMockCloudStore();

      // Team references non-existent season
      const teamWithOrphan = {
        ...mockTeam,
        boundSeasonId: 'non-existent-season',
      };
      mockLocal.getTeams.mockResolvedValue([teamWithOrphan]);

      // Ensure verification passes by returning matching data
      mockCloud.getTeams.mockResolvedValue([teamWithOrphan]);

      // Expect the validation warning to be logged
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await migrateLocalToCloud(() => {});

      expect(result.success).toBe(true); // Validation warnings don't block migration
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('non-existent season');

      warnSpy.mockRestore();
    });

    it('should handle upload errors gracefully', async () => {
      createMockLocalStore();
      const mockCloud = createMockCloudStore();

      // Simulate network error during upload
      mockCloud.upsertPlayer.mockRejectedValue(new Error('Network error'));

      const result = await migrateLocalToCloud(() => {});

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Network error');
    });

    it('should fail early when navigator.onLine is false', async () => {
      // Mock navigator.onLine to return false
      const originalNavigator = global.navigator;
      Object.defineProperty(global, 'navigator', {
        value: { onLine: false },
        writable: true,
        configurable: true,
      });

      try {
        const result = await migrateLocalToCloud(() => {});

        expect(result.success).toBe(false);
        expect(result.errors).toContain(MIGRATION_MESSAGES.NETWORK_ERROR);
        // Should not have attempted any uploads
        expect(MockedLocalDataStore.mock.instances.length).toBe(0);
      } finally {
        // Restore navigator
        Object.defineProperty(global, 'navigator', {
          value: originalNavigator,
          writable: true,
          configurable: true,
        });
      }
    });

    it('should fail verification when counts do not match', async () => {
      createMockLocalStore();
      const mockCloud = createMockCloudStore();

      // Verification returns fewer players than expected
      mockCloud.getPlayers.mockResolvedValue([]);

      const result = await migrateLocalToCloud(() => {});

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Players'))).toBe(true);
    });

    it('should handle empty local data', async () => {
      const mockLocal = createMockLocalStore();
      const mockCloud = createMockCloudStore();

      // No local data - reset all mocks to return empty
      mockLocal.getPlayers.mockResolvedValue([]);
      mockLocal.getTeams.mockResolvedValue([]);
      mockLocal.getAllTeamRosters.mockResolvedValue({});
      mockLocal.getSeasons.mockResolvedValue([]);
      mockLocal.getTournaments.mockResolvedValue([]);
      mockLocal.getAllPersonnel.mockResolvedValue([]);
      mockLocal.getGames.mockResolvedValue({});
      mockLocal.getWarmupPlan.mockResolvedValue(null);
      mockLocal.getSettings.mockResolvedValue(null);

      // Verification should also return empty data
      mockCloud.getPlayers.mockResolvedValue([]);
      mockCloud.getTeams.mockResolvedValue([]);
      mockCloud.getSeasons.mockResolvedValue([]);
      mockCloud.getTournaments.mockResolvedValue([]);
      mockCloud.getGames.mockResolvedValue({});
      mockCloud.getAllPersonnel.mockResolvedValue([]);

      const result = await migrateLocalToCloud(() => {});

      expect(result.success).toBe(true);
      expect(result.migrated.players).toBe(0);
      expect(result.migrated.games).toBe(0);
    });

    it('should track progress through all stages', async () => {
      createMockLocalStore();
      createMockCloudStore();

      const stages: string[] = [];
      const onProgress = (progress: MigrationProgress) => {
        if (!stages.includes(progress.stage)) {
          stages.push(progress.stage);
        }
      };

      await migrateLocalToCloud(onProgress);

      expect(stages).toContain('preparing');
      expect(stages).toContain('exporting');
      expect(stages).toContain('validating');
      expect(stages).toContain('uploading');
      expect(stages).toContain('verifying');
      expect(stages).toContain('complete');
    });
  });

  describe('hasLocalDataToMigrate', () => {
    it('should return hasData: true when there are players', async () => {
      const mockLocal = createMockLocalStore();
      mockLocal.getPlayers.mockResolvedValue([mockPlayer]);
      mockLocal.getGames.mockResolvedValue({});

      const result = await hasLocalDataToMigrate();

      expect(result.hasData).toBe(true);
      expect(result.checkFailed).toBe(false);
    });

    it('should return hasData: true when there are games', async () => {
      const mockLocal = createMockLocalStore();
      mockLocal.getPlayers.mockResolvedValue([]);
      mockLocal.getGames.mockResolvedValue({ 'game-1': mockGame });

      const result = await hasLocalDataToMigrate();

      expect(result.hasData).toBe(true);
      expect(result.checkFailed).toBe(false);
    });

    it('should return hasData: false when there is no data', async () => {
      const mockLocal = createMockLocalStore();
      mockLocal.getPlayers.mockResolvedValue([]);
      mockLocal.getGames.mockResolvedValue({});

      const result = await hasLocalDataToMigrate();

      expect(result.hasData).toBe(false);
      expect(result.checkFailed).toBe(false);
    });

    it('should return checkFailed: true on error', async () => {
      const mockLocal = createMockLocalStore();
      mockLocal.initialize.mockRejectedValue(new Error('Init failed'));

      const result = await hasLocalDataToMigrate();

      expect(result.checkFailed).toBe(true);
      expect(result.error).toBe('Init failed');
    });
  });

  describe('getLocalDataSummary', () => {
    it('should return correct counts', async () => {
      createMockLocalStore();

      const summary = await getLocalDataSummary();

      expect(summary.players).toBe(1);
      expect(summary.teams).toBe(1);
      expect(summary.seasons).toBe(1);
      expect(summary.tournaments).toBe(1);
      expect(summary.games).toBe(1);
      expect(summary.personnel).toBe(1);
      expect(summary.teamRosters).toBe(1);
      expect(summary.settings).toBe(true);
    });

    it('should count team roster entries correctly', async () => {
      const mockLocal = createMockLocalStore();
      mockLocal.getAllTeamRosters.mockResolvedValue({
        'team-1': [
          { id: 'player-1', name: 'P1' },
          { id: 'player-2', name: 'P2' },
          { id: 'player-3', name: 'P3' },
        ] as TeamPlayer[],
        'team-2': [
          { id: 'player-4', name: 'P4' },
          { id: 'player-5', name: 'P5' },
        ] as TeamPlayer[],
      });

      const summary = await getLocalDataSummary();

      expect(summary.teamRosters).toBe(5);
    });

    it('should count player adjustments across all players', async () => {
      const mockLocal = createMockLocalStore();
      mockLocal.getPlayers.mockResolvedValue([
        { id: 'player-1', name: 'P1' },
        { id: 'player-2', name: 'P2' },
      ] as Player[]);
      // Use getAllPlayerAdjustments mock (batch method used since N+1 fix)
      const adjustmentMap = new Map();
      adjustmentMap.set('player-1', [{ id: 'adj-1' }, { id: 'adj-2' }]);
      adjustmentMap.set('player-2', [{ id: 'adj-3' }]);
      mockLocal.getAllPlayerAdjustments.mockResolvedValue(adjustmentMap);

      const summary = await getLocalDataSummary();

      expect(summary.playerAdjustments).toBe(3);
    });
  });

  describe('MIGRATION_MESSAGES', () => {
    it('should have all required message keys', () => {
      expect(MIGRATION_MESSAGES.PREPARING).toBeDefined();
      expect(MIGRATION_MESSAGES.EXPORTING).toBeDefined();
      expect(MIGRATION_MESSAGES.VALIDATING).toBeDefined();
      expect(MIGRATION_MESSAGES.UPLOADING).toBeDefined();
      expect(MIGRATION_MESSAGES.VERIFYING).toBeDefined();
      expect(MIGRATION_MESSAGES.SUCCESS).toBeDefined();
      expect(MIGRATION_MESSAGES.PARTIAL_FAILURE).toBeDefined();
      expect(MIGRATION_MESSAGES.VERIFICATION_FAILED).toBeDefined();
      expect(MIGRATION_MESSAGES.NETWORK_ERROR).toBeDefined();
    });
  });

  describe('isMigrationRunning', () => {
    it('should return false when no migration is in progress', () => {
      // After jest.clearAllMocks() and any completed migration, should be false
      expect(isMigrationRunning()).toBe(false);
    });
  });

  describe('concurrent migration prevention (Promise deduplication)', () => {
    it('should return same promise for concurrent calls (deduplication)', async () => {
      createMockLocalStore();
      const mockCloud = createMockCloudStore();

      // Delay the upsertPlayer to simulate long-running migration
      let resolveUpsertPlayer: () => void;
      const upsertPlayerPromise = new Promise<typeof mockPlayer>((resolve) => {
        resolveUpsertPlayer = () => resolve(mockPlayer);
      });
      mockCloud.upsertPlayer.mockReturnValue(upsertPlayerPromise);

      // Start first migration (it will hang on upsertPlayer)
      const migration1Promise = migrateLocalToCloud(() => {});

      // Start second migration immediately - should wait for first
      const migration2Promise = migrateLocalToCloud(() => {});

      // Complete the migration
      resolveUpsertPlayer!();

      // Both promises should resolve to the same successful result
      const [result1, result2] = await Promise.all([migration1Promise, migration2Promise]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      // Both should have same counts (same migration)
      expect(result1.migrated.players).toBe(result2.migrated.players);
    });

    it('should reset promise after migration completes (allows new migration)', async () => {
      createMockLocalStore();
      const mockCloud = createMockCloudStore();

      // Suppress expected console.error for this test
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // First migration will fail
      mockCloud.upsertPlayer.mockRejectedValueOnce(new Error('Test error'));

      const result1 = await migrateLocalToCloud(() => {});
      expect(result1.success).toBe(false);

      // Promise should be reset - second migration should start fresh
      mockCloud.upsertPlayer.mockResolvedValue(mockPlayer);
      const result2 = await migrateLocalToCloud(() => {});

      // Second migration should succeed (new migration, not waiting for old one)
      expect(result2.success).toBe(true);
      // Should have migrated players (proves it ran a new migration)
      expect(result2.migrated.players).toBe(1);

      errorSpy.mockRestore();
    });
  });

  describe('verification with pre-existing cloud data', () => {
    it('should add warning when cloud has pre-existing data', async () => {
      createMockLocalStore();
      const mockCloud = createMockCloudStore();

      // Cloud has more players than local (indicates pre-existing data)
      mockCloud.getPlayers.mockResolvedValue([mockPlayer, { ...mockPlayer, id: 'player-2' }]);

      const result = await migrateLocalToCloud(() => {});

      // Migration should succeed
      expect(result.success).toBe(true);
      // Should have warning about pre-existing data
      expect(result.warnings.some((w) => w.includes('pre-existing'))).toBe(true);
    });
  });

  describe('replace mode', () => {
    it('should clear cloud data before upload in replace mode', async () => {
      createMockLocalStore();
      const mockCloud = createMockCloudStore();

      const result = await migrateLocalToCloud(() => {}, 'replace');

      // clearAllUserData should be called before upload
      expect(mockCloud.clearAllUserData).toHaveBeenCalled();

      // Migration should succeed
      expect(result.success).toBe(true);

      // Should have CLOUD_CLEARED warning indicating clear happened
      expect(result.warnings).toContain('CLOUD_CLEARED');

      // Verify upload methods were called after clear
      expect(mockCloud.upsertPlayer).toHaveBeenCalled();
    });

    it('should not clear cloud data in merge mode (default)', async () => {
      createMockLocalStore();
      const mockCloud = createMockCloudStore();

      const result = await migrateLocalToCloud(() => {}, 'merge');

      // clearAllUserData should NOT be called in merge mode
      expect(mockCloud.clearAllUserData).not.toHaveBeenCalled();

      // Migration should succeed
      expect(result.success).toBe(true);

      // Should NOT have CLOUD_CLEARED warning
      expect(result.warnings).not.toContain('CLOUD_CLEARED');
    });

    it('should abort migration if clear fails in replace mode', async () => {
      createMockLocalStore();
      const mockCloud = createMockCloudStore();

      // Suppress expected console.error for this test
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Mock clearAllUserData to throw network error
      mockCloud.clearAllUserData.mockRejectedValue(new Error('Network error during clear'));

      const result = await migrateLocalToCloud(() => {}, 'replace');

      // Migration should fail
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Failed to clear existing cloud data');
      expect(result.errors[0]).toContain('Network error during clear');

      // Verify no data was uploaded (migration aborted early)
      expect(mockCloud.upsertPlayer).not.toHaveBeenCalled();
      expect(mockCloud.saveGame).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it('should include clearing stage in progress updates for replace mode', async () => {
      createMockLocalStore();
      createMockCloudStore();

      const stages: string[] = [];
      const onProgress = (progress: MigrationProgress) => {
        if (!stages.includes(progress.stage)) {
          stages.push(progress.stage);
        }
      };

      await migrateLocalToCloud(onProgress, 'replace');

      // Should include clearing stage
      expect(stages).toContain('clearing');
    });
  });
});
