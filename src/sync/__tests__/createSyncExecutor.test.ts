/**
 * Tests for createSyncExecutor
 */

import { createSyncExecutor } from '../createSyncExecutor';
import { CLOUD_COPY_ADOPTED_EVENT, GAME_REPLACED_BY_CLOUD_EVENT, gameReplacementCount } from '../syncEvents';
import type { AppState } from '@/types';
import { AlreadyExistsError, ConflictError } from '@/interfaces/DataStoreErrors';
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
      getAllPlayerAdjustments: jest.fn().mockResolvedValue(new Map()),
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

      // Entity Reference Checks
      getSeasonReferences: jest.fn().mockResolvedValue({ canDelete: true, counts: {}, summary: 'Not used' }),
      getTournamentReferences: jest.fn().mockResolvedValue({ canDelete: true, counts: {}, summary: 'Not used' }),
      getTeamReferences: jest.fn().mockResolvedValue({ canDelete: true, counts: {}, summary: 'Not used' }),
    getPlaytimePlans: jest.fn().mockResolvedValue({}),
    savePlaytimePlan: jest.fn(async (p: never) => p),
    deletePlaytimePlan: jest.fn().mockResolvedValue(true),
    getPlaytimePlanLinks: jest.fn().mockResolvedValue({}),
    setPlaytimePlanLink: jest.fn().mockResolvedValue(true),
    deletePlaytimePlanLink: jest.fn().mockResolvedValue(true),
    deletePlaytimePlanLinksForPlan: jest.fn().mockResolvedValue(true),
    getPlaytimeGameSubs: jest.fn().mockResolvedValue([]),
    getAllPlaytimeGameSubs: jest.fn().mockResolvedValue({}),
    setPlaytimeGameSubs: jest.fn().mockResolvedValue(true),
    deletePlaytimeGameSubs: jest.fn().mockResolvedValue(true),
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
        entityId: 'player-1',
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
        entityId: 'player-1',
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
        entityId: 'team-1',
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
        entityId: 'season-1',
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
        entityId: 'tournament-1',
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
        entityId: 'personnel-1',
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

  /**
   * Review 3.6b: the conflict resolver asks the queue (live) whether the op was
   * superseded before writing the winning cloud copy locally.
   */
  it('a superseded op that loses a conflict leaves the newer local edit alone', async () => {
    mockStore.upsertPlayer.mockRejectedValueOnce(new AlreadyExistsError('player', 'entity-1'));
    mockStore.getPlayers.mockResolvedValueOnce([
      { id: 'entity-1', name: 'Cloud', updatedAt: new Date(Date.now() + 3_600_000).toISOString() },
    ] as unknown as Awaited<ReturnType<DataStore['getPlayers']>>);
    const upsertPlayer = jest.fn();
    const localStore = { upsertPlayer } as unknown as DataStore;
    const isOperationSuperseded = jest.fn().mockResolvedValue(true);

    const exec = createSyncExecutor(mockStore, localStore, { isOperationSuperseded });
    const op = createOperation({ timestamp: Date.now() - 3_600_000 });
    await exec(op);

    expect(isOperationSuperseded).toHaveBeenCalledWith(op.id);
    expect(upsertPlayer).not.toHaveBeenCalled();
  });

  /**
   * Review 3.13b: queued non-game writes ask the cloud first; the newer edit wins and
   * a record deleted on another device stays deleted.
   * @critical
   */
  describe('checked sync writes (newer edit wins)', () => {
    const NOW = 1_800_000_000_000;
    let checkSyncWrite: jest.Mock;
    let local: Record<string, jest.Mock>;
    let exec: ReturnType<typeof createSyncExecutor>;

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(NOW);
      checkSyncWrite = jest.fn().mockResolvedValue({ verdict: 'apply', editedAt: '2027-01-15T08:00:00.000Z' });
      (mockStore as unknown as { checkSyncWrite: jest.Mock }).checkSyncWrite = checkSyncWrite;
      local = {
        upsertPlayer: jest.fn().mockResolvedValue(undefined),
        deletePlayer: jest.fn().mockResolvedValue(true),
        saveSettings: jest.fn().mockResolvedValue(undefined),
        getSettings: jest.fn().mockResolvedValue({ currentGameId: 'game_here', language: 'fi' }),
        getSeasonReferences: jest.fn(),
        deleteSeason: jest.fn().mockResolvedValue(true),
      };
      exec = createSyncExecutor(mockStore, local as unknown as DataStore, {
        isOperationSuperseded: jest.fn().mockResolvedValue(false),
      });
    });
    afterEach(() => jest.restoreAllMocks());

    it('apply: writes with the server edit time; the age is measured on this clock', async () => {
      const op = createOperation({ entityType: 'player', entityId: 'p1', timestamp: NOW - 90_000, data: { id: 'p1', name: 'A' } });
      await exec(op);
      expect(checkSyncWrite).toHaveBeenCalledWith('players', 'p1', 90_000);
      expect(mockStore.upsertPlayer).toHaveBeenCalledWith({ id: 'p1', name: 'A' }, { editedAt: '2027-01-15T08:00:00.000Z' });
    });

    it('stale: nothing is written to the cloud; the cloud copy is stored here', async () => {
      checkSyncWrite.mockResolvedValue({ verdict: 'stale', editedAt: 'x' });
      mockStore.getPlayers.mockResolvedValue([{ id: 'p1', name: 'Newer' }] as unknown as Awaited<ReturnType<DataStore['getPlayers']>>);
      await exec(createOperation({ entityType: 'player', entityId: 'p1', data: { id: 'p1', name: 'Older' } }));
      expect(mockStore.upsertPlayer).not.toHaveBeenCalled();
      expect(local.upsertPlayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', name: 'Newer' }));
    });

    it('stale settings keep the game this device has open', async () => {
      checkSyncWrite.mockResolvedValue({ verdict: 'stale', editedAt: 'x' });
      mockStore.getSettings = jest.fn().mockResolvedValue({ currentGameId: 'game_there', language: 'en' });
      await exec(createOperation({ entityType: 'settings', entityId: 'settings', data: { currentGameId: 'game_here' } }));
      expect(local.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ language: 'en', currentGameId: 'game_here' }));
    });

    it('deleted: the record is removed here too', async () => {
      checkSyncWrite.mockResolvedValue({ verdict: 'deleted', editedAt: 'x' });
      await exec(createOperation({ entityType: 'player', entityId: 'p1', data: { id: 'p1', name: 'A' } }));
      expect(mockStore.upsertPlayer).not.toHaveBeenCalled();
      expect(local.deletePlayer).toHaveBeenCalledWith('p1');
    });

    it('deleted, but this device still uses it: pushed back as an ordinary write', async () => {
      checkSyncWrite.mockResolvedValue({ verdict: 'deleted', editedAt: 'x' });
      local.getSeasonReferences.mockResolvedValue({ canDelete: false, counts: { games: 2 }, summary: '' });
      await exec(createOperation({ entityType: 'season', entityId: 's1', data: { id: 's1', name: 'Kevät' } }));
      expect(local.deleteSeason).not.toHaveBeenCalled();
      expect(mockStore.upsertSeason).toHaveBeenCalledWith({ id: 's1', name: 'Kevät' });
    });

    it('a superseded op leaves the newer local change alone', async () => {
      checkSyncWrite.mockResolvedValue({ verdict: 'deleted', editedAt: 'x' });
      exec = createSyncExecutor(mockStore, local as unknown as DataStore, {
        isOperationSuperseded: jest.fn().mockResolvedValue(true),
      });
      await exec(createOperation({ entityType: 'player', entityId: 'p1', data: { id: 'p1' } }));
      expect(local.deletePlayer).not.toHaveBeenCalled();
    });

    it('passes the edit time to adjustment and settings writes too', async () => {
      const adj = { id: 'a1', playerId: 'p1', gamesPlayedDelta: 1, goalsDelta: 0, assistsDelta: 0 };
      await exec(createOperation({ entityType: 'playerAdjustment', entityId: 'a1', data: adj }));
      expect(mockStore.upsertPlayerAdjustment).toHaveBeenCalledWith(adj, { editedAt: '2027-01-15T08:00:00.000Z' });
      mockStore.saveSettings = jest.fn().mockResolvedValue(undefined);
      await exec(createOperation({ entityType: 'settings', entityId: 'settings', data: { language: 'fi' } }));
      expect(mockStore.saveSettings).toHaveBeenCalledWith({ language: 'fi' }, { editedAt: '2027-01-15T08:00:00.000Z' });
    });

    it('deleted adjustment: removed here using the op\'s playerId; screens are told to re-read', async () => {
      checkSyncWrite.mockResolvedValue({ verdict: 'deleted', editedAt: 'x' });
      local.deletePlayerAdjustment = jest.fn().mockResolvedValue(true);
      const events: string[] = [];
      const listener = (e: Event) => events.push(e.type);
      window.addEventListener(CLOUD_COPY_ADOPTED_EVENT, listener);
      await exec(createOperation({ entityType: 'playerAdjustment', entityId: 'a1', data: { id: 'a1', playerId: 'p1' } }));
      window.removeEventListener(CLOUD_COPY_ADOPTED_EVENT, listener);
      expect(local.deletePlayerAdjustment).toHaveBeenCalledWith('p1', 'a1');
      expect(events).toEqual([CLOUD_COPY_ADOPTED_EVENT]);
    });

    it('a team deleted elsewhere but used here is pushed back with its roster', async () => {
      checkSyncWrite.mockResolvedValue({ verdict: 'deleted', editedAt: 'x' });
      local.getTeamReferences = jest.fn().mockResolvedValue({ canDelete: false, counts: { games: 1 }, summary: '' });
      const roster = [{ id: 'p1', name: 'A' }];
      local.getTeamRoster = jest.fn().mockResolvedValue(roster);
      const team = { id: 't1', name: 'PK', createdAt: 'x', updatedAt: 'x' };
      await exec(createOperation({ entityType: 'team', entityId: 't1', data: team }));
      expect(mockStore.upsertTeam).toHaveBeenCalledWith(team);
      expect(mockStore.setTeamRoster).toHaveBeenCalledWith('t1', roster);
    });

    it('no check in the database yet (null): the write goes through unchecked', async () => {
      checkSyncWrite.mockResolvedValue(null);
      await exec(createOperation({ entityType: 'player', entityId: 'p1', data: { id: 'p1', name: 'A' } }));
      expect(mockStore.upsertPlayer).toHaveBeenCalledWith({ id: 'p1', name: 'A' });
    });

    it('deletes and unchecked entities are not checked', async () => {
      await exec(createOperation({ entityType: 'player', entityId: 'p1', operation: 'delete', data: null }));
      await exec(createOperation({ entityType: 'teamRoster', entityId: 't1', data: [] }));
      expect(checkSyncWrite).not.toHaveBeenCalled();
    });
  });

  /**
   * Review 3.7 (decision: the cloud version wins). A game save refused because this
   * device's copy is outdated must never be retried over the cloud copy.
   * @critical
   */
  describe('game save refused as outdated (conflict)', () => {
    const cloudGame = { teamName: 'Match played', opponentName: 'X', homeScore: 3 } as unknown as AppState;
    const setup = () => {
      const localStore = { saveGame: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<DataStore>;
      const fetchCloudGameWithVersion = jest.fn().mockResolvedValue({ game: cloudGame, version: 6 });
      const recordGameBaseVersion = jest.fn().mockResolvedValue(undefined);
      Object.assign(mockStore, { fetchCloudGameWithVersion, recordGameBaseVersion });
      mockStore.saveGame.mockRejectedValue(new ConflictError('game', 'game-1', 'modified elsewhere'));
      const discardQueuedChanges = jest.fn().mockResolvedValue({ deleteQueued: false });
      const exec = createSyncExecutor(mockStore, localStore, { discardQueuedChanges });
      return { exec, localStore, fetchCloudGameWithVersion, recordGameBaseVersion, discardQueuedChanges };
    };
    const staleOp = () => createOperation({ entityType: 'game', entityId: 'game-1', data: { teamName: 'stale', opponentName: 'X', homeScore: 0 } });

    it('sync pushes check the version the local copy is based on', async () => {
      setup();
      mockStore.saveGame.mockResolvedValue({} as AppState);
      const exec = createSyncExecutor(mockStore);
      await exec(createOperation({ entityType: 'game', entityId: 'game-1', data: { teamName: 'a' } }));
      expect(mockStore.saveGame).toHaveBeenCalledWith('game-1', { teamName: 'a' }, { useRecordedBase: true });
    });

    it('keeps the cloud version: stores it locally, drops queued changes, records the version last, completes', async () => {
      const { exec, localStore, recordGameBaseVersion, discardQueuedChanges } = setup();
      const order: string[] = [];
      localStore.saveGame.mockImplementation(async () => { order.push('local'); return cloudGame; });
      discardQueuedChanges.mockImplementation(async () => { order.push('discard'); return { deleteQueued: false }; });
      recordGameBaseVersion.mockImplementation(async () => { order.push('record'); });
      const before = gameReplacementCount('game-1');
      const events: unknown[] = [];
      const listener = (e: Event) => events.push((e as CustomEvent).detail);
      window.addEventListener(GAME_REPLACED_BY_CLOUD_EVENT, listener);
      try {
        await expect(exec(staleOp())).resolves.toBeUndefined();
      } finally {
        window.removeEventListener(GAME_REPLACED_BY_CLOUD_EVENT, listener);
      }
      expect(localStore.saveGame).toHaveBeenCalledWith('game-1', cloudGame);
      expect(order).toEqual(['discard', 'local', 'record']);
      expect(recordGameBaseVersion).toHaveBeenCalledWith('game-1', 6);
      expect(gameReplacementCount('game-1')).toBe(before + 1); // the open match's copy is blocked
      expect(mockStore.saveGame).toHaveBeenCalledTimes(1); // never retried over the cloud copy
      expect(events).toEqual([{ gameId: 'game-1' }]);
    });

    it('a failure while replacing does not record the version, and reloads the open match', async () => {
      const { exec, localStore, recordGameBaseVersion } = setup();
      localStore.saveGame.mockRejectedValue(new Error('IDB write failed'));
      const events: unknown[] = [];
      const listener = (e: Event) => events.push((e as CustomEvent).detail);
      window.addEventListener(GAME_REPLACED_BY_CLOUD_EVENT, listener);
      try {
        await expect(exec(staleOp())).rejects.toThrow();
      } finally {
        window.removeEventListener(GAME_REPLACED_BY_CLOUD_EVENT, listener);
      }
      expect(recordGameBaseVersion).not.toHaveBeenCalled(); // the retry is refused again
      expect(events).toEqual([{ gameId: 'game-1' }]); // the match reloads instead of staying blocked
    });

    it('a queued delete survives: the cloud copy is not stored locally, no notice', async () => {
      const { exec, localStore, discardQueuedChanges, recordGameBaseVersion } = setup();
      discardQueuedChanges.mockResolvedValue({ deleteQueued: true });
      const events: unknown[] = [];
      const listener = (e: Event) => events.push((e as CustomEvent).detail);
      window.addEventListener(GAME_REPLACED_BY_CLOUD_EVENT, listener);
      try {
        await expect(exec(staleOp())).resolves.toBeUndefined();
      } finally {
        window.removeEventListener(GAME_REPLACED_BY_CLOUD_EVENT, listener);
      }
      expect(localStore.saveGame).not.toHaveBeenCalled(); // the deleted game does not come back
      expect(recordGameBaseVersion).toHaveBeenCalledWith('game-1', 6);
      expect(events).toEqual([]);
    });

    it('fails as before when the cloud no longer has the game', async () => {
      const { exec, fetchCloudGameWithVersion, localStore } = setup();
      fetchCloudGameWithVersion.mockResolvedValue(null);
      await expect(exec(staleOp())).rejects.toBeInstanceOf(ConflictError);
      expect(localStore.saveGame).not.toHaveBeenCalled();
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

  describe('Playtime planner operations', () => {
    it('saves a plan blob on update and deletes by id on delete', async () => {
      const plan = { id: 'ptp_1', name: 'Cup', games: [] };
      await executor(createOperation({
        entityType: 'playtimePlan',
        entityId: 'ptp_1',
        operation: 'update',
        data: plan,
      }));
      expect(mockStore.savePlaytimePlan).toHaveBeenCalledWith(plan);

      await executor(createOperation({
        entityType: 'playtimePlan',
        entityId: 'ptp_1',
        operation: 'delete',
      }));
      expect(mockStore.deletePlaytimePlan).toHaveBeenCalledWith('ptp_1');
    });

    it('pulls the newer cloud copy down when the LWW RPC refuses the write', async () => {
      // savePlaytimePlan returning null = migration 038's conditional upsert
      // refused a stale push. The op must still succeed (conflict resolved,
      // cloud won) AND the local store must converge to the winning copy via
      // the stamp-preserving restore helper.
      const stalePlan = { id: 'ptp_1', name: 'Stale', games: [] };
      const cloudPlan = { id: 'ptp_1', name: 'Newer', games: [] };
      mockStore.savePlaytimePlan.mockResolvedValueOnce(null);
      mockStore.getPlaytimePlans.mockResolvedValueOnce(
        { ptp_1: cloudPlan } as unknown as Awaited<ReturnType<DataStore['getPlaytimePlans']>>,
      );
      const restorePlaytimePlans = jest.fn().mockResolvedValue(1);
      const localStore = { restorePlaytimePlans } as unknown as DataStore;

      const executorWithLocal = createSyncExecutor(mockStore, localStore);
      await executorWithLocal(createOperation({
        entityType: 'playtimePlan',
        entityId: 'ptp_1',
        operation: 'update',
        data: stalePlan,
      }));

      expect(restorePlaytimePlans).toHaveBeenCalledWith({ ptp_1: cloudPlan });
    });

    /** Review 3.6b: a newer local edit of the plan is queued - keep it, don't pull. */
    it('keeps a newer queued local edit instead of pulling the cloud plan down', async () => {
      mockStore.savePlaytimePlan.mockResolvedValueOnce(null);
      const restorePlaytimePlans = jest.fn().mockResolvedValue(1);
      const localStore = { restorePlaytimePlans } as unknown as DataStore;
      const isOperationSuperseded = jest.fn().mockResolvedValue(true);

      const exec = createSyncExecutor(mockStore, localStore, { isOperationSuperseded });
      const op = createOperation({
        entityType: 'playtimePlan',
        entityId: 'ptp_1',
        operation: 'update',
        data: { id: 'ptp_1', name: 'Older', games: [] },
      });
      await exec(op);

      expect(isOperationSuperseded).toHaveBeenCalledWith(op.id);
      expect(restorePlaytimePlans).not.toHaveBeenCalled();
      expect(mockStore.getPlaytimePlans).not.toHaveBeenCalled();
    });

    it('pulls the cloud plan down as before when the supersede check fails', async () => {
      mockStore.savePlaytimePlan.mockResolvedValueOnce(null);
      const cloudPlan = { id: 'ptp_1', name: 'Newer', games: [] };
      mockStore.getPlaytimePlans.mockResolvedValueOnce(
        { ptp_1: cloudPlan } as unknown as Awaited<ReturnType<DataStore['getPlaytimePlans']>>,
      );
      const restorePlaytimePlans = jest.fn().mockResolvedValue(1);
      const exec = createSyncExecutor(mockStore, { restorePlaytimePlans } as unknown as DataStore, {
        isOperationSuperseded: jest.fn().mockRejectedValue(new Error('queue closed')),
      });
      await exec(createOperation({
        entityType: 'playtimePlan',
        entityId: 'ptp_1',
        operation: 'update',
        data: { id: 'ptp_1', name: 'Older', games: [] },
      }));
      expect(restorePlaytimePlans).toHaveBeenCalledWith({ ptp_1: cloudPlan });
    });

    it('treats an LWW refusal as success even without a local store wired', async () => {
      mockStore.savePlaytimePlan.mockResolvedValueOnce(null);
      await expect(executor(createOperation({
        entityType: 'playtimePlan',
        entityId: 'ptp_1',
        operation: 'update',
        data: { id: 'ptp_1', name: 'Stale', games: [] },
      }))).resolves.toBeUndefined();
    });

    it('routes a plan-link delete WITH data.planId to delete-for-plan', async () => {
      await executor(createOperation({
        entityType: 'playtimePlanLink',
        entityId: 'plan:ptp_1',
        operation: 'delete',
        data: { planId: 'ptp_1' },
      }));
      expect(mockStore.deletePlaytimePlanLinksForPlan).toHaveBeenCalledWith('ptp_1');
      expect(mockStore.deletePlaytimePlanLink).not.toHaveBeenCalled();

      await executor(createOperation({
        entityType: 'playtimePlanLink',
        entityId: 'game_1',
        operation: 'delete',
        data: null,
      }));
      expect(mockStore.deletePlaytimePlanLink).toHaveBeenCalledWith('game_1');
    });

    it('upserts a plan link and planned game subs per real game', async () => {
      const link = { planId: 'ptp_1', planGameId: 'ptg_1' };
      await executor(createOperation({
        entityType: 'playtimePlanLink',
        entityId: 'game_1',
        operation: 'update',
        data: link,
      }));
      expect(mockStore.setPlaytimePlanLink).toHaveBeenCalledWith('game_1', link);

      const subs = [{ id: 'x1', slotId: 'gk', inPlayerId: 'p2', outPlayerId: null, timeSeconds: 720 }];
      await executor(createOperation({
        entityType: 'playtimeGameSubs',
        entityId: 'game_1',
        operation: 'update',
        data: subs,
      }));
      expect(mockStore.setPlaytimeGameSubs).toHaveBeenCalledWith('game_1', subs);

      await executor(createOperation({
        entityType: 'playtimeGameSubs',
        entityId: 'game_1',
        operation: 'delete',
      }));
      expect(mockStore.deletePlaytimeGameSubs).toHaveBeenCalledWith('game_1');
    });
  });

  describe('Error handling', () => {
    it('should propagate errors from store methods', async () => {
      mockStore.upsertPlayer.mockRejectedValue(new Error('Database error'));

      const op = createOperation({
        entityType: 'player',
        entityId: 'player-1',
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

    it('should throw when data is an array for non-teamRoster entity', async () => {
      const op = createOperation({
        entityType: 'player',
        entityId: 'player-1',
        operation: 'update',
        data: [{ id: 'player-1', name: 'Test' }], // Array not valid for player
      });

      await expect(executor(op)).rejects.toThrow('data must be an object, not an array');
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

    it('should throw when data.id does not match entityId', async () => {
      const op = createOperation({
        entityType: 'player',
        entityId: 'player-1',
        operation: 'update',
        data: { id: 'different-player', name: 'Test' },
      });

      await expect(executor(op)).rejects.toThrow(
        'data.id "different-player" does not match entityId "player-1"'
      );
    });

    it('should allow data without id field (id validation is optional)', async () => {
      const op = createOperation({
        entityType: 'player',
        entityId: 'player-1',
        operation: 'update',
        data: { name: 'Test Player' }, // No id field - should still work
      });

      await executor(op);

      expect(mockStore.upsertPlayer).toHaveBeenCalledWith({ name: 'Test Player' });
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
