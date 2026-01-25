/**
 * Tests for createSyncExecutor
 */

import { createSyncExecutor } from '../createSyncExecutor';
import type { SyncOperation } from '../types';
import type { DataStore } from '@/interfaces/DataStore';

// Mock logger to prevent console.error in tests
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('createSyncExecutor', () => {
  let mockStore: jest.Mocked<DataStore>;
  let executor: ReturnType<typeof createSyncExecutor>;

  beforeEach(() => {
    // Create mock DataStore with all methods
    mockStore = {
      // Lifecycle
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      getBackendName: jest.fn().mockReturnValue('mock'),
      isAvailable: jest.fn().mockResolvedValue(true),
      isInitialized: jest.fn().mockReturnValue(true),
      clearUserCaches: jest.fn(),

      // Players
      getPlayers: jest.fn().mockResolvedValue([]),
      createPlayer: jest.fn().mockResolvedValue({ id: 'player-1', name: 'Test' }),
      updatePlayer: jest.fn().mockResolvedValue({ id: 'player-1', name: 'Test' }),
      deletePlayer: jest.fn().mockResolvedValue(true),
      upsertPlayer: jest.fn().mockResolvedValue({ id: 'player-1', name: 'Test' }),

      // Teams
      getTeams: jest.fn().mockResolvedValue([]),
      getTeamById: jest.fn().mockResolvedValue(null),
      createTeam: jest.fn().mockResolvedValue({ id: 'team-1', name: 'Test' }),
      updateTeam: jest.fn().mockResolvedValue({ id: 'team-1', name: 'Test' }),
      deleteTeam: jest.fn().mockResolvedValue(true),
      upsertTeam: jest.fn().mockResolvedValue({ id: 'team-1', name: 'Test' }),

      // Team Rosters
      getTeamRoster: jest.fn().mockResolvedValue([]),
      setTeamRoster: jest.fn().mockResolvedValue(undefined),
      getAllTeamRosters: jest.fn().mockResolvedValue({}),

      // Seasons
      getSeasons: jest.fn().mockResolvedValue([]),
      createSeason: jest.fn().mockResolvedValue({ id: 'season-1', name: 'Test' }),
      updateSeason: jest.fn().mockResolvedValue({ id: 'season-1', name: 'Test' }),
      deleteSeason: jest.fn().mockResolvedValue(true),
      upsertSeason: jest.fn().mockResolvedValue({ id: 'season-1', name: 'Test' }),

      // Tournaments
      getTournaments: jest.fn().mockResolvedValue([]),
      createTournament: jest.fn().mockResolvedValue({ id: 'tournament-1', name: 'Test' }),
      updateTournament: jest.fn().mockResolvedValue({ id: 'tournament-1', name: 'Test' }),
      deleteTournament: jest.fn().mockResolvedValue(true),
      upsertTournament: jest.fn().mockResolvedValue({ id: 'tournament-1', name: 'Test' }),

      // Personnel
      getAllPersonnel: jest.fn().mockResolvedValue([]),
      getPersonnelById: jest.fn().mockResolvedValue(null),
      addPersonnelMember: jest.fn().mockResolvedValue({ id: 'personnel-1', name: 'Test' }),
      updatePersonnelMember: jest.fn().mockResolvedValue({ id: 'personnel-1', name: 'Test' }),
      removePersonnelMember: jest.fn().mockResolvedValue(true),
      upsertPersonnelMember: jest.fn().mockResolvedValue({ id: 'personnel-1', name: 'Test' }),

      // Games
      getGames: jest.fn().mockResolvedValue({}),
      getGameById: jest.fn().mockResolvedValue(null),
      createGame: jest.fn().mockResolvedValue({ gameId: 'game-1', gameData: {} }),
      saveGame: jest.fn().mockResolvedValue({}),
      saveAllGames: jest.fn().mockResolvedValue(undefined),
      deleteGame: jest.fn().mockResolvedValue(true),

      // Game Events
      addGameEvent: jest.fn().mockResolvedValue(null),
      updateGameEvent: jest.fn().mockResolvedValue(null),
      removeGameEvent: jest.fn().mockResolvedValue(null),

      // Settings
      getSettings: jest.fn().mockResolvedValue({}),
      saveSettings: jest.fn().mockResolvedValue(undefined),
      updateSettings: jest.fn().mockResolvedValue({}),

      // Player Adjustments
      getPlayerAdjustments: jest.fn().mockResolvedValue([]),
      addPlayerAdjustment: jest.fn().mockResolvedValue({ id: 'adj-1' }),
      upsertPlayerAdjustment: jest.fn().mockResolvedValue({ id: 'adj-1' }),
      updatePlayerAdjustment: jest.fn().mockResolvedValue({ id: 'adj-1' }),
      deletePlayerAdjustment: jest.fn().mockResolvedValue(true),

      // Warmup Plan
      getWarmupPlan: jest.fn().mockResolvedValue(null),
      saveWarmupPlan: jest.fn().mockResolvedValue(true),
      deleteWarmupPlan: jest.fn().mockResolvedValue(true),

      // Timer State
      getTimerState: jest.fn().mockResolvedValue(null),
      saveTimerState: jest.fn().mockResolvedValue(undefined),
      clearTimerState: jest.fn().mockResolvedValue(undefined),

      // Data Management
      clearAllUserData: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<DataStore>;

    executor = createSyncExecutor(mockStore);
  });

  // Helper to create a sync operation
  const createOperation = (
    overrides: Partial<SyncOperation> = {}
  ): SyncOperation => ({
    id: 'op-1',
    entityType: 'player',
    entityId: 'entity-1',
    operation: 'update',
    data: { id: 'entity-1', name: 'Test' },
    timestamp: Date.now(),
    status: 'syncing',
    retryCount: 0,
    maxRetries: 10,
    createdAt: Date.now(),
    ...overrides,
  });

  describe('Player operations', () => {
    it('should upsert player on create', async () => {
      const op = createOperation({
        entityType: 'player',
        operation: 'create',
        data: { id: 'player-1', name: 'Test Player' },
      });

      await executor(op);

      expect(mockStore.upsertPlayer).toHaveBeenCalledWith({
        id: 'player-1',
        name: 'Test Player',
      });
    });

    it('should upsert player on update', async () => {
      const op = createOperation({
        entityType: 'player',
        operation: 'update',
        data: { id: 'player-1', name: 'Updated Player' },
      });

      await executor(op);

      expect(mockStore.upsertPlayer).toHaveBeenCalledWith({
        id: 'player-1',
        name: 'Updated Player',
      });
    });

    it('should delete player on delete', async () => {
      const op = createOperation({
        entityType: 'player',
        entityId: 'player-1',
        operation: 'delete',
        data: null,
      });

      await executor(op);

      expect(mockStore.deletePlayer).toHaveBeenCalledWith('player-1');
    });
  });

  describe('Team operations', () => {
    it('should upsert team on create/update', async () => {
      const op = createOperation({
        entityType: 'team',
        operation: 'update',
        data: { id: 'team-1', name: 'Test Team' },
      });

      await executor(op);

      expect(mockStore.upsertTeam).toHaveBeenCalledWith({
        id: 'team-1',
        name: 'Test Team',
      });
    });

    it('should delete team on delete', async () => {
      const op = createOperation({
        entityType: 'team',
        entityId: 'team-1',
        operation: 'delete',
      });

      await executor(op);

      expect(mockStore.deleteTeam).toHaveBeenCalledWith('team-1');
    });
  });

  describe('Team roster operations', () => {
    it('should set team roster on update', async () => {
      const roster = [{ id: 'player-1', name: 'Player 1' }];
      const op = createOperation({
        entityType: 'teamRoster',
        entityId: 'team-1',
        operation: 'update',
        data: roster,
      });

      await executor(op);

      expect(mockStore.setTeamRoster).toHaveBeenCalledWith('team-1', roster);
    });

    it('should set empty roster on delete', async () => {
      const op = createOperation({
        entityType: 'teamRoster',
        entityId: 'team-1',
        operation: 'delete',
      });

      await executor(op);

      expect(mockStore.setTeamRoster).toHaveBeenCalledWith('team-1', []);
    });
  });

  describe('Season operations', () => {
    it('should upsert season on create/update', async () => {
      const op = createOperation({
        entityType: 'season',
        operation: 'update',
        data: { id: 'season-1', name: 'Test Season' },
      });

      await executor(op);

      expect(mockStore.upsertSeason).toHaveBeenCalledWith({
        id: 'season-1',
        name: 'Test Season',
      });
    });

    it('should delete season on delete', async () => {
      const op = createOperation({
        entityType: 'season',
        entityId: 'season-1',
        operation: 'delete',
      });

      await executor(op);

      expect(mockStore.deleteSeason).toHaveBeenCalledWith('season-1');
    });
  });

  describe('Tournament operations', () => {
    it('should upsert tournament on create/update', async () => {
      const op = createOperation({
        entityType: 'tournament',
        operation: 'update',
        data: { id: 'tournament-1', name: 'Test Tournament' },
      });

      await executor(op);

      expect(mockStore.upsertTournament).toHaveBeenCalledWith({
        id: 'tournament-1',
        name: 'Test Tournament',
      });
    });

    it('should delete tournament on delete', async () => {
      const op = createOperation({
        entityType: 'tournament',
        entityId: 'tournament-1',
        operation: 'delete',
      });

      await executor(op);

      expect(mockStore.deleteTournament).toHaveBeenCalledWith('tournament-1');
    });
  });

  describe('Personnel operations', () => {
    it('should upsert personnel on create/update', async () => {
      const op = createOperation({
        entityType: 'personnel',
        operation: 'update',
        data: { id: 'personnel-1', name: 'Test Personnel' },
      });

      await executor(op);

      expect(mockStore.upsertPersonnelMember).toHaveBeenCalledWith({
        id: 'personnel-1',
        name: 'Test Personnel',
      });
    });

    it('should remove personnel on delete', async () => {
      const op = createOperation({
        entityType: 'personnel',
        entityId: 'personnel-1',
        operation: 'delete',
      });

      await executor(op);

      expect(mockStore.removePersonnelMember).toHaveBeenCalledWith('personnel-1');
    });
  });

  describe('Game operations', () => {
    it('should save game on create/update', async () => {
      const gameData = { teamName: 'Test Team' };
      const op = createOperation({
        entityType: 'game',
        entityId: 'game-1',
        operation: 'update',
        data: gameData,
      });

      await executor(op);

      expect(mockStore.saveGame).toHaveBeenCalledWith('game-1', gameData);
    });

    it('should delete game on delete', async () => {
      const op = createOperation({
        entityType: 'game',
        entityId: 'game-1',
        operation: 'delete',
      });

      await executor(op);

      expect(mockStore.deleteGame).toHaveBeenCalledWith('game-1');
    });
  });

  describe('Settings operations', () => {
    it('should save settings on update', async () => {
      const settings = { language: 'en' };
      const op = createOperation({
        entityType: 'settings',
        entityId: 'app',
        operation: 'update',
        data: settings,
      });

      await executor(op);

      expect(mockStore.saveSettings).toHaveBeenCalledWith(settings);
    });

    it('should throw on delete operation for settings', async () => {
      const op = createOperation({
        entityType: 'settings',
        entityId: 'app',
        operation: 'delete',
      });

      await expect(executor(op)).rejects.toThrow(
        'Cannot delete settings: delete operation is not supported'
      );
      expect(mockStore.saveSettings).not.toHaveBeenCalled();
    });
  });

  describe('Player adjustment operations', () => {
    it('should upsert player adjustment on create/update', async () => {
      const adjustment = { id: 'adj-1', playerId: 'player-1', goalsDelta: 1 };
      const op = createOperation({
        entityType: 'playerAdjustment',
        entityId: 'adj-1',
        operation: 'update',
        data: adjustment,
      });

      await executor(op);

      expect(mockStore.upsertPlayerAdjustment).toHaveBeenCalledWith(adjustment);
    });

    it('should delete player adjustment with playerId in data', async () => {
      const op = createOperation({
        entityType: 'playerAdjustment',
        entityId: 'adj-1',
        operation: 'delete',
        data: { playerId: 'player-1' },
      });

      await executor(op);

      expect(mockStore.deletePlayerAdjustment).toHaveBeenCalledWith(
        'player-1',
        'adj-1'
      );
    });

    it('should throw when deleting adjustment without playerId', async () => {
      const op = createOperation({
        entityType: 'playerAdjustment',
        entityId: 'adj-1',
        operation: 'delete',
        data: null,
      });

      await expect(executor(op)).rejects.toThrow('playerId not provided');
    });
  });

  describe('Warmup plan operations', () => {
    it('should save warmup plan on update', async () => {
      const plan = { id: 'plan-1', sections: [] };
      const op = createOperation({
        entityType: 'warmupPlan',
        entityId: 'default',
        operation: 'update',
        data: plan,
      });

      await executor(op);

      expect(mockStore.saveWarmupPlan).toHaveBeenCalledWith(plan);
    });

    it('should delete warmup plan on delete', async () => {
      const op = createOperation({
        entityType: 'warmupPlan',
        entityId: 'default',
        operation: 'delete',
      });

      await executor(op);

      expect(mockStore.deleteWarmupPlan).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should propagate errors from store methods', async () => {
      mockStore.upsertPlayer.mockRejectedValue(new Error('Database error'));

      const op = createOperation({
        entityType: 'player',
        operation: 'update',
        data: { id: 'player-1', name: 'Test' },
      });

      await expect(executor(op)).rejects.toThrow('Database error');
    });
  });

  describe('Data validation', () => {
    it('should throw when data is null for create operation', async () => {
      const op = createOperation({
        entityType: 'player',
        operation: 'create',
        data: null,
      });

      await expect(executor(op)).rejects.toThrow('data is null');
    });

    it('should throw when data is undefined for update operation', async () => {
      const op = createOperation({
        entityType: 'team',
        operation: 'update',
        data: undefined,
      });

      await expect(executor(op)).rejects.toThrow('data is undefined');
    });

    it('should throw when data is not an object', async () => {
      const op = createOperation({
        entityType: 'season',
        operation: 'update',
        data: 'invalid string data',
      });

      await expect(executor(op)).rejects.toThrow('data must be an object');
    });

    it('should throw when teamRoster data is not an array', async () => {
      const op = createOperation({
        entityType: 'teamRoster',
        entityId: 'team-1',
        operation: 'update',
        data: { notAnArray: true },
      });

      await expect(executor(op)).rejects.toThrow('data must be an array');
    });

    it('should allow delete operations without data validation', async () => {
      const op = createOperation({
        entityType: 'player',
        entityId: 'player-1',
        operation: 'delete',
        data: null,
      });

      await executor(op);

      expect(mockStore.deletePlayer).toHaveBeenCalledWith('player-1');
    });
  });
});
