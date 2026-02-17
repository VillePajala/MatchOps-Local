/**
 * SyncedDataStore Tests
 *
 * Tests for the local-first DataStore implementation that wraps
 * LocalDataStore with background sync via SyncQueue + SyncEngine.
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

// Polyfill structuredClone for Node.js < 17 (required by fake-indexeddb)
if (typeof structuredClone === 'undefined') {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

import 'fake-indexeddb/auto';
import { SyncedDataStore } from '../SyncedDataStore';
import { LocalDataStore } from '../LocalDataStore';
import { SyncQueue, SyncEngine, resetSyncEngine } from '@/sync';
import type { Player, Team, Season, Tournament, TeamPlayer } from '@/types';
import type { AppState } from '@/types/game';
import type { Personnel } from '@/types/personnel';
import type { WarmupPlan } from '@/types/warmupPlan';
import type { AppSettings } from '@/types/settings';

// Mock logger to avoid console noise
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('SyncedDataStore', () => {
  let store: SyncedDataStore;
  let localStoreSpy: {
    getPlayers: jest.SpyInstance;
    createPlayer: jest.SpyInstance;
    updatePlayer: jest.SpyInstance;
    deletePlayer: jest.SpyInstance;
    upsertPlayer: jest.SpyInstance;
    getTeams: jest.SpyInstance;
    getTeamById: jest.SpyInstance;
    createTeam: jest.SpyInstance;
    updateTeam: jest.SpyInstance;
    deleteTeam: jest.SpyInstance;
    upsertTeam: jest.SpyInstance;
    getTeamRoster: jest.SpyInstance;
    setTeamRoster: jest.SpyInstance;
    getAllTeamRosters: jest.SpyInstance;
    getSeasons: jest.SpyInstance;
    createSeason: jest.SpyInstance;
    updateSeason: jest.SpyInstance;
    deleteSeason: jest.SpyInstance;
    upsertSeason: jest.SpyInstance;
    getTournaments: jest.SpyInstance;
    createTournament: jest.SpyInstance;
    updateTournament: jest.SpyInstance;
    deleteTournament: jest.SpyInstance;
    upsertTournament: jest.SpyInstance;
    getAllPersonnel: jest.SpyInstance;
    getPersonnelById: jest.SpyInstance;
    addPersonnelMember: jest.SpyInstance;
    updatePersonnelMember: jest.SpyInstance;
    removePersonnelMember: jest.SpyInstance;
    upsertPersonnelMember: jest.SpyInstance;
    getGames: jest.SpyInstance;
    getGameById: jest.SpyInstance;
    createGame: jest.SpyInstance;
    saveGame: jest.SpyInstance;
    saveAllGames: jest.SpyInstance;
    deleteGame: jest.SpyInstance;
    addGameEvent: jest.SpyInstance;
    updateGameEvent: jest.SpyInstance;
    removeGameEvent: jest.SpyInstance;
    getSettings: jest.SpyInstance;
    saveSettings: jest.SpyInstance;
    updateSettings: jest.SpyInstance;
    getPlayerAdjustments: jest.SpyInstance;
    addPlayerAdjustment: jest.SpyInstance;
    upsertPlayerAdjustment: jest.SpyInstance;
    updatePlayerAdjustment: jest.SpyInstance;
    deletePlayerAdjustment: jest.SpyInstance;
    getWarmupPlan: jest.SpyInstance;
    saveWarmupPlan: jest.SpyInstance;
    deleteWarmupPlan: jest.SpyInstance;
    getTimerState: jest.SpyInstance;
    saveTimerState: jest.SpyInstance;
    clearTimerState: jest.SpyInstance;
    clearAllUserData: jest.SpyInstance;
  };
  let queueEnqueueSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Reset sync engine singleton between tests
    resetSyncEngine();

    // Create a fresh store for each test
    store = new SyncedDataStore();
    await store.initialize();

    // Get references to internal components via private access
    const storeAny = store as unknown as Record<string, unknown>;
    const localStore = storeAny.localStore as LocalDataStore;
    const syncQueue = storeAny.syncQueue as SyncQueue;

    // Set up spies on local store methods
    localStoreSpy = {
      getPlayers: jest.spyOn(localStore, 'getPlayers'),
      createPlayer: jest.spyOn(localStore, 'createPlayer'),
      updatePlayer: jest.spyOn(localStore, 'updatePlayer'),
      deletePlayer: jest.spyOn(localStore, 'deletePlayer'),
      upsertPlayer: jest.spyOn(localStore, 'upsertPlayer'),
      getTeams: jest.spyOn(localStore, 'getTeams'),
      getTeamById: jest.spyOn(localStore, 'getTeamById'),
      createTeam: jest.spyOn(localStore, 'createTeam'),
      updateTeam: jest.spyOn(localStore, 'updateTeam'),
      deleteTeam: jest.spyOn(localStore, 'deleteTeam'),
      upsertTeam: jest.spyOn(localStore, 'upsertTeam'),
      getTeamRoster: jest.spyOn(localStore, 'getTeamRoster'),
      setTeamRoster: jest.spyOn(localStore, 'setTeamRoster'),
      getAllTeamRosters: jest.spyOn(localStore, 'getAllTeamRosters'),
      getSeasons: jest.spyOn(localStore, 'getSeasons'),
      createSeason: jest.spyOn(localStore, 'createSeason'),
      updateSeason: jest.spyOn(localStore, 'updateSeason'),
      deleteSeason: jest.spyOn(localStore, 'deleteSeason'),
      upsertSeason: jest.spyOn(localStore, 'upsertSeason'),
      getTournaments: jest.spyOn(localStore, 'getTournaments'),
      createTournament: jest.spyOn(localStore, 'createTournament'),
      updateTournament: jest.spyOn(localStore, 'updateTournament'),
      deleteTournament: jest.spyOn(localStore, 'deleteTournament'),
      upsertTournament: jest.spyOn(localStore, 'upsertTournament'),
      getAllPersonnel: jest.spyOn(localStore, 'getAllPersonnel'),
      getPersonnelById: jest.spyOn(localStore, 'getPersonnelById'),
      addPersonnelMember: jest.spyOn(localStore, 'addPersonnelMember'),
      updatePersonnelMember: jest.spyOn(localStore, 'updatePersonnelMember'),
      removePersonnelMember: jest.spyOn(localStore, 'removePersonnelMember'),
      upsertPersonnelMember: jest.spyOn(localStore, 'upsertPersonnelMember'),
      getGames: jest.spyOn(localStore, 'getGames'),
      getGameById: jest.spyOn(localStore, 'getGameById'),
      createGame: jest.spyOn(localStore, 'createGame'),
      saveGame: jest.spyOn(localStore, 'saveGame'),
      saveAllGames: jest.spyOn(localStore, 'saveAllGames'),
      deleteGame: jest.spyOn(localStore, 'deleteGame'),
      addGameEvent: jest.spyOn(localStore, 'addGameEvent'),
      updateGameEvent: jest.spyOn(localStore, 'updateGameEvent'),
      removeGameEvent: jest.spyOn(localStore, 'removeGameEvent'),
      getSettings: jest.spyOn(localStore, 'getSettings'),
      saveSettings: jest.spyOn(localStore, 'saveSettings'),
      updateSettings: jest.spyOn(localStore, 'updateSettings'),
      getPlayerAdjustments: jest.spyOn(localStore, 'getPlayerAdjustments'),
      addPlayerAdjustment: jest.spyOn(localStore, 'addPlayerAdjustment'),
      upsertPlayerAdjustment: jest.spyOn(localStore, 'upsertPlayerAdjustment'),
      updatePlayerAdjustment: jest.spyOn(localStore, 'updatePlayerAdjustment'),
      deletePlayerAdjustment: jest.spyOn(localStore, 'deletePlayerAdjustment'),
      getWarmupPlan: jest.spyOn(localStore, 'getWarmupPlan'),
      saveWarmupPlan: jest.spyOn(localStore, 'saveWarmupPlan'),
      deleteWarmupPlan: jest.spyOn(localStore, 'deleteWarmupPlan'),
      getTimerState: jest.spyOn(localStore, 'getTimerState'),
      saveTimerState: jest.spyOn(localStore, 'saveTimerState'),
      clearTimerState: jest.spyOn(localStore, 'clearTimerState'),
      clearAllUserData: jest.spyOn(localStore, 'clearAllUserData'),
    };

    // Spy on queue enqueue
    queueEnqueueSpy = jest.spyOn(syncQueue, 'enqueue');
  });

  afterEach(async () => {
    await store.close();
    jest.restoreAllMocks();
    resetSyncEngine();
  });

  // ==========================================================================
  // LIFECYCLE TESTS
  // ==========================================================================

  describe('Lifecycle', () => {
    it('should initialize successfully', async () => {
      const newStore = new SyncedDataStore();
      expect(newStore.isInitialized()).toBe(false);

      await newStore.initialize();
      expect(newStore.isInitialized()).toBe(true);

      await newStore.close();
      expect(newStore.isInitialized()).toBe(false);
    });

    it('should be idempotent on initialize', async () => {
      const newStore = new SyncedDataStore();
      await newStore.initialize();
      await newStore.initialize(); // Should not throw
      expect(newStore.isInitialized()).toBe(true);
      await newStore.close();
    });

    it('should return backend name as synced', () => {
      expect(store.getBackendName()).toBe('synced');
    });

    it('should check availability via local store', async () => {
      const available = await store.isAvailable();
      expect(available).toBe(true);
    });
  });

  // ==========================================================================
  // PLAYER TESTS
  // ==========================================================================

  describe('Players', () => {
    const mockPlayer: Player = {
      id: 'player-1',
      name: 'Test Player',
      jerseyNumber: '10',
    };

    it('should get players from local store (no sync)', async () => {
      localStoreSpy.getPlayers.mockResolvedValue([mockPlayer]);

      const result = await store.getPlayers();

      expect(localStoreSpy.getPlayers).toHaveBeenCalled();
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual([mockPlayer]);
    });

    it('should create player in local store and queue sync', async () => {
      const input = { name: 'Test Player', jerseyNumber: '10' };
      localStoreSpy.createPlayer.mockResolvedValue(mockPlayer);

      const result = await store.createPlayer(input);

      expect(localStoreSpy.createPlayer).toHaveBeenCalledWith(input);
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'player',
          entityId: mockPlayer.id,
          operation: 'create',
          data: mockPlayer,
        })
      );
      expect(result).toEqual(mockPlayer);
    });

    it('should update player in local store and queue sync', async () => {
      localStoreSpy.updatePlayer.mockResolvedValue({ ...mockPlayer, name: 'Updated Player' });

      const result = await store.updatePlayer('player-1', { name: 'Updated Player' });

      expect(localStoreSpy.updatePlayer).toHaveBeenCalledWith('player-1', { name: 'Updated Player' });
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'player',
          entityId: 'player-1',
          operation: 'update',
        })
      );
      expect(result?.name).toBe('Updated Player');
    });

    it('should not queue sync on failed update', async () => {
      localStoreSpy.updatePlayer.mockResolvedValue(null);

      const result = await store.updatePlayer('nonexistent', { name: 'Updated Player' });

      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should delete player in local store and queue sync', async () => {
      localStoreSpy.deletePlayer.mockResolvedValue(true);

      const result = await store.deletePlayer('player-1');

      expect(localStoreSpy.deletePlayer).toHaveBeenCalledWith('player-1');
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'player',
          entityId: 'player-1',
          operation: 'delete',
          data: null,
        })
      );
      expect(result).toBe(true);
    });

    it('should not queue sync on failed delete', async () => {
      localStoreSpy.deletePlayer.mockResolvedValue(false);

      const result = await store.deletePlayer('nonexistent');

      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should upsert player and queue sync', async () => {
      localStoreSpy.upsertPlayer.mockResolvedValue(mockPlayer);

      const result = await store.upsertPlayer(mockPlayer);

      expect(localStoreSpy.upsertPlayer).toHaveBeenCalledWith(mockPlayer);
      // Uses 'create' for upsert to ensure correct deduplication (CREATE + DELETE = nothing)
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'player',
          entityId: mockPlayer.id,
          operation: 'create',
        })
      );
      expect(result).toEqual(mockPlayer);
    });
  });

  // ==========================================================================
  // TEAM TESTS
  // ==========================================================================

  describe('Teams', () => {
    const mockTeam: Team = {
      id: 'team-1',
      name: 'Test Team',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    it('should get teams from local store (no sync)', async () => {
      localStoreSpy.getTeams.mockResolvedValue([mockTeam]);

      const result = await store.getTeams(true);

      expect(localStoreSpy.getTeams).toHaveBeenCalledWith(true);
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual([mockTeam]);
    });

    it('should get team by id from local store (no sync)', async () => {
      localStoreSpy.getTeamById.mockResolvedValue(mockTeam);

      const result = await store.getTeamById('team-1');

      expect(localStoreSpy.getTeamById).toHaveBeenCalledWith('team-1');
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual(mockTeam);
    });

    it('should create team and queue sync', async () => {
      localStoreSpy.createTeam.mockResolvedValue(mockTeam);

      const result = await store.createTeam({ name: 'Test Team' });

      expect(localStoreSpy.createTeam).toHaveBeenCalledWith({ name: 'Test Team' });
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'team',
          entityId: mockTeam.id,
          operation: 'create',
        })
      );
      expect(result).toEqual(mockTeam);
    });

    it('should update team and queue sync', async () => {
      const updated = { ...mockTeam, name: 'Updated Team' };
      localStoreSpy.updateTeam.mockResolvedValue(updated);

      const result = await store.updateTeam('team-1', { name: 'Updated Team' });

      expect(localStoreSpy.updateTeam).toHaveBeenCalledWith('team-1', { name: 'Updated Team' });
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'team',
          entityId: 'team-1',
          operation: 'update',
        })
      );
      expect(result).toEqual(updated);
    });

    it('should delete team and queue sync', async () => {
      localStoreSpy.deleteTeam.mockResolvedValue(true);

      const result = await store.deleteTeam('team-1');

      expect(localStoreSpy.deleteTeam).toHaveBeenCalledWith('team-1');
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'team',
          entityId: 'team-1',
          operation: 'delete',
        })
      );
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // TEAM ROSTER TESTS
  // ==========================================================================

  describe('Team Rosters', () => {
    const mockRoster: TeamPlayer[] = [
      { id: 'player-1', name: 'Test Player', jerseyNumber: '10' },
    ];

    it('should get team roster from local store (no sync)', async () => {
      localStoreSpy.getTeamRoster.mockResolvedValue(mockRoster);

      const result = await store.getTeamRoster('team-1');

      expect(localStoreSpy.getTeamRoster).toHaveBeenCalledWith('team-1');
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual(mockRoster);
    });

    it('should set team roster and queue sync', async () => {
      localStoreSpy.setTeamRoster.mockResolvedValue(undefined);

      await store.setTeamRoster('team-1', mockRoster);

      expect(localStoreSpy.setTeamRoster).toHaveBeenCalledWith('team-1', mockRoster);
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'teamRoster',
          entityId: 'team-1',
          operation: 'update',
          data: mockRoster,
        })
      );
    });

    it('should get all team rosters from local store (no sync)', async () => {
      const mockRosters = { 'team-1': mockRoster };
      localStoreSpy.getAllTeamRosters.mockResolvedValue(mockRosters);

      const result = await store.getAllTeamRosters();

      expect(localStoreSpy.getAllTeamRosters).toHaveBeenCalled();
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual(mockRosters);
    });
  });

  // ==========================================================================
  // SEASON TESTS
  // ==========================================================================

  describe('Seasons', () => {
    const mockSeason: Season = {
      id: 'season-1',
      name: 'Test Season',
    };

    it('should get seasons from local store (no sync)', async () => {
      localStoreSpy.getSeasons.mockResolvedValue([mockSeason]);

      const result = await store.getSeasons(false);

      expect(localStoreSpy.getSeasons).toHaveBeenCalledWith(false);
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual([mockSeason]);
    });

    it('should create season and queue sync', async () => {
      localStoreSpy.createSeason.mockResolvedValue(mockSeason);

      const result = await store.createSeason('Test Season');

      expect(localStoreSpy.createSeason).toHaveBeenCalledWith('Test Season', undefined);
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'season',
          entityId: mockSeason.id,
          operation: 'create',
        })
      );
      expect(result).toEqual(mockSeason);
    });

    it('should update season and queue sync', async () => {
      const updated = { ...mockSeason, name: 'Updated Season' };
      localStoreSpy.updateSeason.mockResolvedValue(updated);

      const result = await store.updateSeason(updated);

      expect(localStoreSpy.updateSeason).toHaveBeenCalledWith(updated);
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'season',
          entityId: mockSeason.id,
          operation: 'update',
        })
      );
      expect(result).toEqual(updated);
    });

    it('should delete season and queue sync', async () => {
      localStoreSpy.deleteSeason.mockResolvedValue(true);

      const result = await store.deleteSeason('season-1');

      expect(localStoreSpy.deleteSeason).toHaveBeenCalledWith('season-1');
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'season',
          entityId: 'season-1',
          operation: 'delete',
        })
      );
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // TOURNAMENT TESTS
  // ==========================================================================

  describe('Tournaments', () => {
    const mockTournament: Tournament = {
      id: 'tournament-1',
      name: 'Test Tournament',
    };

    it('should get tournaments from local store (no sync)', async () => {
      localStoreSpy.getTournaments.mockResolvedValue([mockTournament]);

      const result = await store.getTournaments();

      expect(localStoreSpy.getTournaments).toHaveBeenCalled();
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual([mockTournament]);
    });

    it('should create tournament and queue sync', async () => {
      localStoreSpy.createTournament.mockResolvedValue(mockTournament);

      const result = await store.createTournament('Test Tournament');

      expect(localStoreSpy.createTournament).toHaveBeenCalledWith('Test Tournament', undefined);
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'tournament',
          entityId: mockTournament.id,
          operation: 'create',
        })
      );
      expect(result).toEqual(mockTournament);
    });
  });

  // ==========================================================================
  // PERSONNEL TESTS
  // ==========================================================================

  describe('Personnel', () => {
    const mockPersonnel: Personnel = {
      id: 'personnel-1',
      name: 'Test Coach',
      role: 'head_coach',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    it('should get all personnel from local store (no sync)', async () => {
      localStoreSpy.getAllPersonnel.mockResolvedValue([mockPersonnel]);

      const result = await store.getAllPersonnel();

      expect(localStoreSpy.getAllPersonnel).toHaveBeenCalled();
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual([mockPersonnel]);
    });

    it('should get personnel by id from local store (no sync)', async () => {
      localStoreSpy.getPersonnelById.mockResolvedValue(mockPersonnel);

      const result = await store.getPersonnelById('personnel-1');

      expect(localStoreSpy.getPersonnelById).toHaveBeenCalledWith('personnel-1');
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual(mockPersonnel);
    });

    it('should add personnel member and queue sync', async () => {
      localStoreSpy.addPersonnelMember.mockResolvedValue(mockPersonnel);

      const result = await store.addPersonnelMember({ name: 'Test Coach', role: 'head_coach' });

      expect(localStoreSpy.addPersonnelMember).toHaveBeenCalledWith({ name: 'Test Coach', role: 'head_coach' });
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'personnel',
          entityId: mockPersonnel.id,
          operation: 'create',
        })
      );
      expect(result).toEqual(mockPersonnel);
    });

    it('should update personnel member and queue sync', async () => {
      const updated = { ...mockPersonnel, name: 'Updated Coach' };
      localStoreSpy.updatePersonnelMember.mockResolvedValue(updated);

      const result = await store.updatePersonnelMember('personnel-1', { name: 'Updated Coach' });

      expect(localStoreSpy.updatePersonnelMember).toHaveBeenCalledWith('personnel-1', { name: 'Updated Coach' });
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'personnel',
          entityId: 'personnel-1',
          operation: 'update',
        })
      );
      expect(result).toEqual(updated);
    });

    it('should remove personnel member and queue sync', async () => {
      localStoreSpy.removePersonnelMember.mockResolvedValue(true);

      const result = await store.removePersonnelMember('personnel-1');

      expect(localStoreSpy.removePersonnelMember).toHaveBeenCalledWith('personnel-1');
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'personnel',
          entityId: 'personnel-1',
          operation: 'delete',
        })
      );
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // GAME TESTS
  // ==========================================================================

  describe('Games', () => {
    // Use partial mock with unknown cast for tests that verify delegation pattern
    const mockGame = {
      teamName: 'Test Team',
      opponentName: 'Opponent',
      gameDate: '2024-01-15',
      homeScore: 0,
      opponentScore: 0,
      currentPeriod: 1,
      isPlayed: true,
      gameEvents: [],
      availablePlayers: [],
      playersOnField: [],
      selectedPlayerIds: [],
      periodDurationMinutes: 10,
      numberOfPeriods: 2,
    } as unknown as AppState;

    it('should get games from local store (no sync)', async () => {
      const mockGames = { 'game-1': mockGame };
      localStoreSpy.getGames.mockResolvedValue(mockGames);

      const result = await store.getGames();

      expect(localStoreSpy.getGames).toHaveBeenCalled();
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual(mockGames);
    });

    it('should get game by id from local store (no sync)', async () => {
      localStoreSpy.getGameById.mockResolvedValue(mockGame);

      const result = await store.getGameById('game-1');

      expect(localStoreSpy.getGameById).toHaveBeenCalledWith('game-1');
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual(mockGame);
    });

    it('should create game and queue sync', async () => {
      localStoreSpy.createGame.mockResolvedValue({ gameId: 'game-1', gameData: mockGame });

      const result = await store.createGame({ teamName: 'Test Team' });

      expect(localStoreSpy.createGame).toHaveBeenCalledWith({ teamName: 'Test Team' });
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'game',
          entityId: 'game-1',
          operation: 'create',
        })
      );
      expect(result).toEqual({ gameId: 'game-1', gameData: mockGame });
    });

    it('should save game and queue sync', async () => {
      localStoreSpy.saveGame.mockResolvedValue(mockGame);

      const result = await store.saveGame('game-1', mockGame);

      expect(localStoreSpy.saveGame).toHaveBeenCalledWith('game-1', mockGame);
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'game',
          entityId: 'game-1',
          operation: 'update',
        })
      );
      expect(result).toEqual(mockGame);
    });

    it('should save all games and queue sync for each', async () => {
      const mockGames = { 'game-1': mockGame, 'game-2': { ...mockGame, opponentName: 'Opponent 2' } };
      localStoreSpy.saveAllGames.mockResolvedValue(undefined);

      await store.saveAllGames(mockGames);

      expect(localStoreSpy.saveAllGames).toHaveBeenCalledWith(mockGames);
      expect(queueEnqueueSpy).toHaveBeenCalledTimes(2);
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'game',
          entityId: 'game-1',
          operation: 'update',
        })
      );
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'game',
          entityId: 'game-2',
          operation: 'update',
        })
      );
    });

    it('should delete game and queue sync', async () => {
      localStoreSpy.deleteGame.mockResolvedValue(true);

      const result = await store.deleteGame('game-1');

      expect(localStoreSpy.deleteGame).toHaveBeenCalledWith('game-1');
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'game',
          entityId: 'game-1',
          operation: 'delete',
        })
      );
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // GAME EVENT TESTS
  // ==========================================================================

  describe('Game Events', () => {
    const mockGame = { teamName: 'Test', gameEvents: [] } as unknown as AppState;
    const mockEvent = { type: 'goal', time: 100 };

    it('should add game event and queue sync', async () => {
      const updated = { ...mockGame, gameEvents: [mockEvent] };
      localStoreSpy.addGameEvent.mockResolvedValue(updated);

      const result = await store.addGameEvent('game-1', mockEvent as any);

      expect(localStoreSpy.addGameEvent).toHaveBeenCalledWith('game-1', mockEvent);
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'game',
          entityId: 'game-1',
          operation: 'update',
          data: updated,
        })
      );
      expect(result).toEqual(updated);
    });

    it('should update game event and queue sync', async () => {
      const updated = { ...mockGame, gameEvents: [{ ...mockEvent, time: 200 }] };
      localStoreSpy.updateGameEvent.mockResolvedValue(updated);

      const result = await store.updateGameEvent('game-1', 0, mockEvent as any);

      expect(localStoreSpy.updateGameEvent).toHaveBeenCalledWith('game-1', 0, mockEvent);
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'game',
          entityId: 'game-1',
          operation: 'update',
        })
      );
      expect(result).toEqual(updated);
    });

    it('should remove game event and queue sync', async () => {
      const updated = { ...mockGame, gameEvents: [] };
      localStoreSpy.removeGameEvent.mockResolvedValue(updated);

      const result = await store.removeGameEvent('game-1', 0);

      expect(localStoreSpy.removeGameEvent).toHaveBeenCalledWith('game-1', 0);
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'game',
          entityId: 'game-1',
          operation: 'update',
        })
      );
      expect(result).toEqual(updated);
    });

    it('should not queue sync when game event operation returns null', async () => {
      localStoreSpy.addGameEvent.mockResolvedValue(null);

      const result = await store.addGameEvent('nonexistent', mockEvent as any);

      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // SETTINGS TESTS
  // ==========================================================================

  describe('Settings', () => {
    const mockSettings: AppSettings = {
      currentGameId: null,
      lastHomeTeamName: '',
      language: 'en',
      hasSeenAppGuide: false,
      useDemandCorrection: false,
    };

    it('should get settings from local store (no sync)', async () => {
      localStoreSpy.getSettings.mockResolvedValue(mockSettings);

      const result = await store.getSettings();

      expect(localStoreSpy.getSettings).toHaveBeenCalled();
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual(mockSettings);
    });

    it('should save settings and queue sync', async () => {
      localStoreSpy.saveSettings.mockResolvedValue(undefined);

      await store.saveSettings(mockSettings);

      expect(localStoreSpy.saveSettings).toHaveBeenCalledWith(mockSettings);
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'settings',
          entityId: 'app',
          operation: 'update',
          data: mockSettings,
        })
      );
    });

    it('should update settings and queue sync', async () => {
      // Mock getSettings so the skip-unchanged check sees existing settings
      localStoreSpy.getSettings.mockResolvedValue(mockSettings);
      const updated = { ...mockSettings, language: 'fi' as const };
      localStoreSpy.updateSettings.mockResolvedValue(updated);

      const result = await store.updateSettings({ language: 'fi' });

      expect(localStoreSpy.updateSettings).toHaveBeenCalledWith({ language: 'fi' });
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'settings',
          entityId: 'app',
          operation: 'update',
        })
      );
      expect(result).toEqual(updated);
    });
  });

  // ==========================================================================
  // PLAYER ADJUSTMENTS TESTS
  // ==========================================================================

  describe('Player Adjustments', () => {
    const mockAdjustment = {
      id: 'adj-1',
      playerId: 'player-1',
      gamesPlayedDelta: 1,
      goalsDelta: 5,
      assistsDelta: 2,
      appliedAt: '2024-01-01',
    };

    it('should get player adjustments from local store (no sync)', async () => {
      localStoreSpy.getPlayerAdjustments.mockResolvedValue([mockAdjustment]);

      const result = await store.getPlayerAdjustments('player-1');

      expect(localStoreSpy.getPlayerAdjustments).toHaveBeenCalledWith('player-1');
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual([mockAdjustment]);
    });

    it('should add player adjustment and queue sync', async () => {
      localStoreSpy.addPlayerAdjustment.mockResolvedValue(mockAdjustment);

      const result = await store.addPlayerAdjustment({
        playerId: 'player-1',
        gamesPlayedDelta: 1,
        goalsDelta: 5,
        assistsDelta: 2,
      });

      expect(localStoreSpy.addPlayerAdjustment).toHaveBeenCalled();
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'playerAdjustment',
          entityId: mockAdjustment.id,
          operation: 'create',
        })
      );
      expect(result).toEqual(mockAdjustment);
    });

    it('should update player adjustment and queue sync', async () => {
      const updated = { ...mockAdjustment, goalsDelta: 10 };
      localStoreSpy.updatePlayerAdjustment.mockResolvedValue(updated);

      const result = await store.updatePlayerAdjustment('player-1', 'adj-1', { goalsDelta: 10 });

      expect(localStoreSpy.updatePlayerAdjustment).toHaveBeenCalledWith('player-1', 'adj-1', { goalsDelta: 10 });
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'playerAdjustment',
          entityId: 'adj-1',
          operation: 'update',
        })
      );
      expect(result).toEqual(updated);
    });

    it('should delete player adjustment and queue sync', async () => {
      localStoreSpy.deletePlayerAdjustment.mockResolvedValue(true);

      const result = await store.deletePlayerAdjustment('player-1', 'adj-1');

      expect(localStoreSpy.deletePlayerAdjustment).toHaveBeenCalledWith('player-1', 'adj-1');
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'playerAdjustment',
          entityId: 'adj-1',
          operation: 'delete',
        })
      );
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // WARMUP PLAN TESTS
  // ==========================================================================

  describe('Warmup Plan', () => {
    const mockPlan: WarmupPlan = {
      id: 'warmup-1',
      version: 1,
      lastModified: '2024-01-01T00:00:00Z',
      isDefault: false,
      sections: [{ id: 'section-1', title: 'Warmup', content: 'Run around' }],
    };

    it('should get warmup plan from local store (no sync)', async () => {
      localStoreSpy.getWarmupPlan.mockResolvedValue(mockPlan);

      const result = await store.getWarmupPlan();

      expect(localStoreSpy.getWarmupPlan).toHaveBeenCalled();
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual(mockPlan);
    });

    it('should save warmup plan and queue sync with normalized data', async () => {
      localStoreSpy.saveWarmupPlan.mockResolvedValue(true);

      const result = await store.saveWarmupPlan(mockPlan);

      // SyncedDataStore normalizes the plan before saving locally (updates lastModified, adds updatedAt, forces isDefault:false)
      expect(localStoreSpy.saveWarmupPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockPlan.id,
          sections: mockPlan.sections,
          version: mockPlan.version,
          isDefault: false,
        })
      );
      // Verify timestamps were updated by normalization
      const savedPlan = localStoreSpy.saveWarmupPlan.mock.calls[0][0] as WarmupPlan;
      expect(savedPlan.lastModified).not.toBe(mockPlan.lastModified);
      expect(savedPlan.updatedAt).toBeDefined();
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'warmupPlan',
          entityId: 'default',
          operation: 'update',
        })
      );
      // Verify normalized data is synced (isDefault forced to false, lastModified updated)
      const syncedData = queueEnqueueSpy.mock.calls[0][0].data as WarmupPlan;
      expect(syncedData.id).toBe(mockPlan.id);
      expect(syncedData.sections).toEqual(mockPlan.sections);
      expect(syncedData.isDefault).toBe(false);
      expect(syncedData.lastModified).not.toBe(mockPlan.lastModified);
      expect(result).toBe(true);
    });

    it('should delete warmup plan and queue sync', async () => {
      localStoreSpy.deleteWarmupPlan.mockResolvedValue(true);

      const result = await store.deleteWarmupPlan();

      expect(localStoreSpy.deleteWarmupPlan).toHaveBeenCalled();
      expect(queueEnqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'warmupPlan',
          entityId: 'default',
          operation: 'delete',
        })
      );
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // TIMER STATE TESTS (LOCAL ONLY - NO SYNC)
  // ==========================================================================

  describe('Timer State (Local Only)', () => {
    const mockTimerState = {
      timeSeconds: 100,
      isRunning: true,
      lastUpdated: Date.now(),
    };

    it('should get timer state from local store (no sync)', async () => {
      localStoreSpy.getTimerState.mockResolvedValue(mockTimerState);

      const result = await store.getTimerState();

      expect(localStoreSpy.getTimerState).toHaveBeenCalled();
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
      expect(result).toEqual(mockTimerState);
    });

    it('should save timer state locally only (no sync)', async () => {
      localStoreSpy.saveTimerState.mockResolvedValue(undefined);

      await store.saveTimerState(mockTimerState as any);

      expect(localStoreSpy.saveTimerState).toHaveBeenCalledWith(mockTimerState);
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
    });

    it('should clear timer state locally only (no sync)', async () => {
      localStoreSpy.clearTimerState.mockResolvedValue(undefined);

      await store.clearTimerState();

      expect(localStoreSpy.clearTimerState).toHaveBeenCalled();
      expect(queueEnqueueSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // DATA MANAGEMENT TESTS
  // ==========================================================================

  describe('Data Management', () => {
    it('should clear all user data, stop engine, and clear queue', async () => {
      localStoreSpy.clearAllUserData.mockResolvedValue(undefined);

      const storeAny = store as unknown as Record<string, unknown>;
      const syncQueue = storeAny.syncQueue as SyncQueue;
      const clearQueueSpy = jest.spyOn(syncQueue, 'clear');

      await store.clearAllUserData();

      expect(clearQueueSpy).toHaveBeenCalled();
      expect(localStoreSpy.clearAllUserData).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // ERROR HANDLING TESTS
  // ==========================================================================

  describe('Error Handling', () => {
    it('should not throw when queue.enqueue fails (local write still succeeds)', async () => {
      const mockPlayer = { id: 'player-1', name: 'Test Player' };
      localStoreSpy.createPlayer.mockResolvedValue(mockPlayer);

      // Make enqueue throw an error
      queueEnqueueSpy.mockRejectedValue(new Error('IndexedDB quota exceeded'));

      // Should not throw - local write succeeds, queue failure is logged
      const result = await store.createPlayer({ name: 'Test Player' });

      // Local operation should still succeed
      expect(result).toEqual(mockPlayer);
      expect(localStoreSpy.createPlayer).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // SYNC ENGINE CONTROL TESTS
  // ==========================================================================

  describe('Sync Engine Control', () => {
    it('should set executor on sync engine', () => {
      const mockExecutor = jest.fn();

      const storeAny = store as unknown as Record<string, unknown>;
      const engine = storeAny.syncEngine as SyncEngine;
      const setExecutorSpy = jest.spyOn(engine, 'setExecutor');

      store.setExecutor(mockExecutor);

      expect(setExecutorSpy).toHaveBeenCalledWith(mockExecutor);
    });

    it('should start sync engine', () => {
      const storeAny = store as unknown as Record<string, unknown>;
      const engine = storeAny.syncEngine as SyncEngine;
      const startSpy = jest.spyOn(engine, 'start');

      store.startSync();

      expect(startSpy).toHaveBeenCalled();
    });

    it('should stop sync engine', () => {
      const storeAny = store as unknown as Record<string, unknown>;
      const engine = storeAny.syncEngine as SyncEngine;
      const stopSpy = jest.spyOn(engine, 'stop');

      store.stopSync();

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should get sync status', async () => {
      const status = await store.getSyncStatus();

      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('pendingCount');
      expect(status).toHaveProperty('failedCount');
      expect(status).toHaveProperty('lastSyncedAt');
      expect(status).toHaveProperty('isOnline');
    });

    it('should subscribe to status changes', () => {
      const listener = jest.fn();

      const unsubscribe = store.onSyncStatusChange(listener);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe(); // Clean up
    });
  });
});
