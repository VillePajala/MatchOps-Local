/**
 * LocalDataStore Tests
 *
 * Comprehensive test coverage for the LocalDataStore implementation.
 * Tests cover all CRUD operations, validation, error scenarios,
 * cascade deletes, and edge cases.
 */

// Error classes and LocalDataStore are imported via require after mocks,
// but we need the type for TypeScript annotations
import type { LocalDataStore as LocalDataStoreType } from './LocalDataStore';
import type { Player, Team, TeamPlayer, Season, Tournament } from '@/types';
import type { AppState, GameEvent, SavedGamesCollection } from '@/types/game';
import type { Personnel } from '@/types/personnel';
import type { WarmupPlan } from '@/types/warmupPlan';
import type { TimerState } from '@/utils/timerStateManager';
import type { AppSettings } from '@/types/settings';

// Create mock functions BEFORE jest.mock (so they can be referenced in mocks)
const mockGetStorageItem = jest.fn();
const mockSetStorageItem = jest.fn();
const mockRemoveStorageItem = jest.fn();
const mockGetStorageJSON = jest.fn();
const mockSetStorageJSON = jest.fn();
const mockIsIndexedDBAvailable = jest.fn(() => true);
const mockClearAdapterCacheWithCleanup = jest.fn();

// Reset modules to ensure clean mocking
jest.resetModules();

// Mock storage layer
jest.mock('@/utils/storage', () => ({
  getStorageItem: mockGetStorageItem,
  setStorageItem: mockSetStorageItem,
  removeStorageItem: mockRemoveStorageItem,
  getStorageJSON: mockGetStorageJSON,
  setStorageJSON: mockSetStorageJSON,
  isIndexedDBAvailable: mockIsIndexedDBAvailable,
  clearAdapterCacheWithCleanup: mockClearAdapterCacheWithCleanup,
}));

// Mock appSettings to prevent import of @/datastore (which would load the real storage)
jest.mock('@/utils/appSettings', () => ({
  __esModule: true,
}));

// Mock lock managers
jest.mock('@/utils/storageKeyLock', () => ({
  withKeyLock: jest.fn((key: string, fn: () => Promise<unknown>) => fn()),
}));

jest.mock('@/utils/lockManager', () => ({
  withRosterLock: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

// Import LocalDataStore and error classes AFTER mocks are set up
// Using require to ensure the same class instances are used in tests and implementation
const { LocalDataStore } = require('./LocalDataStore');
const { AlreadyExistsError, NotInitializedError, ValidationError } = require('@/interfaces/DataStoreErrors');

describe('LocalDataStore', () => {
  let dataStore: LocalDataStoreType;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetStorageItem.mockResolvedValue(null);
    mockSetStorageItem.mockResolvedValue(undefined);
    mockRemoveStorageItem.mockResolvedValue(undefined);
    mockGetStorageJSON.mockResolvedValue(null);
    mockSetStorageJSON.mockResolvedValue(undefined);
    mockIsIndexedDBAvailable.mockReturnValue(true);
    mockClearAdapterCacheWithCleanup.mockResolvedValue(undefined);

    dataStore = new LocalDataStore();
    await dataStore.initialize();
  });

  afterEach(async () => {
    await dataStore.close();
  });

  // ============================================================
  // LIFECYCLE TESTS
  // ============================================================
  /**
   * Tests core initialization and lifecycle management.
   * @critical - App cannot function without proper initialization
   */
  describe('Lifecycle', () => {
    it('should initialize successfully', async () => {
      const store = new LocalDataStore();
      await expect(store.initialize()).resolves.not.toThrow();
    });

    it('should return correct backend name', () => {
      expect(dataStore.getBackendName()).toBe('local');
    });

    it('should report availability based on IndexedDB', async () => {
      mockIsIndexedDBAvailable.mockReturnValue(true);
      expect(await dataStore.isAvailable()).toBe(true);

      mockIsIndexedDBAvailable.mockReturnValue(false);
      expect(await dataStore.isAvailable()).toBe(false);
    });

    it('should close and clear adapter cache', async () => {
      await dataStore.close();
      expect(mockClearAdapterCacheWithCleanup).toHaveBeenCalled();
    });

    it('should handle close when not initialized', async () => {
      const store = new LocalDataStore();
      await expect(store.close()).resolves.not.toThrow();
      expect(mockClearAdapterCacheWithCleanup).not.toHaveBeenCalled();
    });

    it('should throw NotInitializedError when not initialized', async () => {
      const store = new LocalDataStore();
      await expect(store.getPlayers()).rejects.toThrow(NotInitializedError);
    });
  });

  // ============================================================
  // PLAYER TESTS
  // ============================================================
  /**
   * Tests core Player CRUD operations.
   * @critical - Player roster is fundamental to game tracking
   */
  describe('Players', () => {
    const mockPlayer: Player = {
      id: 'player_123',
      name: 'Test Player',
      jerseyNumber: '10',
      isGoalie: false,
      receivedFairPlayCard: false,
    };

    describe('getPlayers', () => {
      it('should return empty array when no players exist', async () => {
        mockGetStorageItem.mockResolvedValue(null);
        const players = await dataStore.getPlayers();
        expect(players).toEqual([]);
      });

      it('should return players from storage', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockPlayer]));
        const players = await dataStore.getPlayers();
        expect(players).toHaveLength(1);
        expect(players[0].name).toBe('Test Player');
      });

      it('should handle malformed JSON gracefully', async () => {
        mockGetStorageItem.mockResolvedValue('invalid json');
        const players = await dataStore.getPlayers();
        expect(players).toEqual([]);
      });
    });

    describe('createPlayer', () => {
      it('should create player with trimmed name', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([]));
        const player = await dataStore.createPlayer({
          name: '  New Player  ',
          jerseyNumber: '7',
        });

        expect(player.name).toBe('New Player');
        expect(player.id).toMatch(/^player_\d+_[a-f0-9]{8}$/);
        expect(mockSetStorageItem).toHaveBeenCalled();
      });

      it('should throw ValidationError on empty name', async () => {
        await expect(
          dataStore.createPlayer({ name: '   ', jerseyNumber: '7' })
        ).rejects.toThrow(ValidationError);
      });

      it('should set default values for isGoalie and receivedFairPlayCard', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([]));
        const player = await dataStore.createPlayer({
          name: 'New Player',
          jerseyNumber: '7',
        });

        expect(player.isGoalie).toBe(false);
        expect(player.receivedFairPlayCard).toBe(false);
      });
    });

    describe('updatePlayer', () => {
      it('should update player fields', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockPlayer]));

        const updated = await dataStore.updatePlayer('player_123', {
          name: 'Updated Name',
          jerseyNumber: '99',
        });

        expect(updated?.name).toBe('Updated Name');
        expect(updated?.jerseyNumber).toBe('99');
      });

      it('should return null for non-existent player', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockPlayer]));

        const result = await dataStore.updatePlayer('non_existent', { name: 'Test' });
        expect(result).toBeNull();
      });

      it('should throw ValidationError on empty name update', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockPlayer]));

        await expect(
          dataStore.updatePlayer('player_123', { name: '   ' })
        ).rejects.toThrow(ValidationError);
      });

      it('should trim name on update', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockPlayer]));

        const updated = await dataStore.updatePlayer('player_123', {
          name: '  Trimmed Name  ',
        });

        expect(updated?.name).toBe('Trimmed Name');
      });
    });

    describe('deletePlayer', () => {
      it('should delete existing player', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockPlayer]));

        const result = await dataStore.deletePlayer('player_123');
        expect(result).toBe(true);
        expect(mockSetStorageItem).toHaveBeenCalled();
      });

      it('should return false for non-existent player', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockPlayer]));

        const result = await dataStore.deletePlayer('non_existent');
        expect(result).toBe(false);
      });
    });
  });

  // ============================================================
  // TEAM TESTS
  // ============================================================
  describe('Teams', () => {
    const mockTeam: Team = {
      id: 'team_123',
      name: 'Test Team',
      color: '#FF0000',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    const mockArchivedTeam: Team = {
      ...mockTeam,
      id: 'team_456',
      name: 'Archived Team',
      archived: true,
    };

    describe('getTeams', () => {
      it('should return non-archived teams by default', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ team_123: mockTeam, team_456: mockArchivedTeam })
        );

        const teams = await dataStore.getTeams();
        expect(teams).toHaveLength(1);
        expect(teams[0].name).toBe('Test Team');
      });

      it('should return all teams when includeArchived is true', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ team_123: mockTeam, team_456: mockArchivedTeam })
        );

        const teams = await dataStore.getTeams(true);
        expect(teams).toHaveLength(2);
      });
    });

    describe('getTeamById', () => {
      it('should return team by id', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ team_123: mockTeam }));

        const team = await dataStore.getTeamById('team_123');
        expect(team?.name).toBe('Test Team');
      });

      it('should return null for non-existent team', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ team_123: mockTeam }));

        const team = await dataStore.getTeamById('non_existent');
        expect(team).toBeNull();
      });
    });

    describe('createTeam', () => {
      it('should create team with trimmed name', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({}));

        const team = await dataStore.createTeam({
          name: '  New Team  ',
          color: '#00FF00',
        });

        expect(team.name).toBe('New Team');
        expect(team.id).toMatch(/^team_\d+_[a-f0-9]{8}$/);
        expect(team.createdAt).toBeDefined();
        expect(team.updatedAt).toBeDefined();
      });

      it('should throw ValidationError on empty name', async () => {
        await expect(
          dataStore.createTeam({ name: '   ', color: '#00FF00' })
        ).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError on name exceeding 48 characters', async () => {
        const longName = 'A'.repeat(49);
        await expect(
          dataStore.createTeam({ name: longName, color: '#00FF00' })
        ).rejects.toThrow(ValidationError);
      });

      it('should throw AlreadyExistsError on duplicate name', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ team_123: mockTeam }));

        await expect(
          dataStore.createTeam({ name: 'Test Team', color: '#00FF00' })
        ).rejects.toThrow(AlreadyExistsError);
      });

      it('should throw AlreadyExistsError on duplicate name (case-insensitive)', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ team_123: mockTeam }));

        await expect(
          dataStore.createTeam({ name: 'TEST TEAM', color: '#00FF00' })
        ).rejects.toThrow(AlreadyExistsError);
      });

      it('should throw ValidationError on invalid age group', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({}));

        await expect(
          dataStore.createTeam({ name: 'New Team', color: '#00FF00', ageGroup: 'Invalid' })
        ).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError on notes exceeding 1000 characters', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({}));
        const longNotes = 'A'.repeat(1001);

        await expect(
          dataStore.createTeam({ name: 'New Team', color: '#00FF00', notes: longNotes })
        ).rejects.toThrow(ValidationError);
      });

      it('should initialize empty roster for new team', async () => {
        mockGetStorageItem
          .mockResolvedValueOnce(JSON.stringify({})) // teams index
          .mockResolvedValueOnce(JSON.stringify({})); // team rosters

        await dataStore.createTeam({ name: 'New Team', color: '#00FF00' });

        // setStorageItem called for teams AND rosters
        expect(mockSetStorageItem).toHaveBeenCalledTimes(2);
      });

      it('should allow duplicate name with different boundSeasonId', async () => {
        const existingTeam = {
          ...mockTeam,
          boundSeasonId: 'season_1',
        };
        mockGetStorageItem
          .mockResolvedValueOnce(JSON.stringify({ team_123: existingTeam })) // teams index
          .mockResolvedValueOnce(JSON.stringify({})); // team rosters

        // Same name, different season - should succeed
        const team = await dataStore.createTeam({
          name: 'Test Team',
          boundSeasonId: 'season_2',
        });

        expect(team.name).toBe('Test Team');
        expect(team.boundSeasonId).toBe('season_2');
      });

      it('should allow duplicate name with different boundTournamentId', async () => {
        const existingTeam = {
          ...mockTeam,
          boundTournamentId: 'tournament_1',
        };
        mockGetStorageItem
          .mockResolvedValueOnce(JSON.stringify({ team_123: existingTeam })) // teams index
          .mockResolvedValueOnce(JSON.stringify({})); // team rosters

        // Same name, different tournament - should succeed
        const team = await dataStore.createTeam({
          name: 'Test Team',
          boundTournamentId: 'tournament_2',
        });

        expect(team.name).toBe('Test Team');
        expect(team.boundTournamentId).toBe('tournament_2');
      });

      it('should allow duplicate name with different gameType', async () => {
        const existingTeam = {
          ...mockTeam,
          gameType: 'soccer' as const,
        };
        mockGetStorageItem
          .mockResolvedValueOnce(JSON.stringify({ team_123: existingTeam })) // teams index
          .mockResolvedValueOnce(JSON.stringify({})); // team rosters

        // Same name, different game type - should succeed
        const team = await dataStore.createTeam({
          name: 'Test Team',
          gameType: 'futsal',
        });

        expect(team.name).toBe('Test Team');
        expect(team.gameType).toBe('futsal');
      });

      it('should throw AlreadyExistsError on duplicate name+context combination', async () => {
        const existingTeam = {
          ...mockTeam,
          boundSeasonId: 'season_1',
          boundTournamentId: 'tournament_1',
          gameType: 'futsal' as const,
        };
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ team_123: existingTeam }));

        // Same name AND same context - should fail
        await expect(
          dataStore.createTeam({
            name: 'Test Team',
            boundSeasonId: 'season_1',
            boundTournamentId: 'tournament_1',
            gameType: 'futsal',
          })
        ).rejects.toThrow(AlreadyExistsError);
      });

      it('should allow duplicate name when adding context to existing contextless team', async () => {
        // Existing team has no context
        mockGetStorageItem
          .mockResolvedValueOnce(JSON.stringify({ team_123: mockTeam })) // teams index
          .mockResolvedValueOnce(JSON.stringify({})); // team rosters

        // Same name but with context - should succeed
        const team = await dataStore.createTeam({
          name: 'Test Team',
          boundSeasonId: 'season_1',
        });

        expect(team.name).toBe('Test Team');
        expect(team.boundSeasonId).toBe('season_1');
      });

      it('should allow duplicate name with different boundTournamentSeriesId', async () => {
        const existingTeam = {
          ...mockTeam,
          boundTournamentId: 'tournament_1',
          boundTournamentSeriesId: 'series_1',
        };
        mockGetStorageItem
          .mockResolvedValueOnce(JSON.stringify({ team_123: existingTeam })) // teams index
          .mockResolvedValueOnce(JSON.stringify({})); // team rosters

        // Same name, same tournament, different series - should succeed
        const team = await dataStore.createTeam({
          name: 'Test Team',
          boundTournamentId: 'tournament_1',
          boundTournamentSeriesId: 'series_2',
        });

        expect(team.name).toBe('Test Team');
        expect(team.boundTournamentSeriesId).toBe('series_2');
      });

      it('should throw ValidationError when series is set without tournament', async () => {
        // Note: No mock setup needed - validation throws BEFORE any storage calls
        // Series without tournament - should fail validation
        await expect(
          dataStore.createTeam({
            name: 'Test Team',
            boundTournamentSeriesId: 'series_1',
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should allow team with tournament and series binding', async () => {
        mockGetStorageItem
          .mockResolvedValueOnce(JSON.stringify({})) // teams index
          .mockResolvedValueOnce(JSON.stringify({})); // team rosters

        // Tournament with series - should succeed
        const team = await dataStore.createTeam({
          name: 'Test Team',
          boundTournamentId: 'tournament_1',
          boundTournamentSeriesId: 'series_1',
        });

        expect(team.name).toBe('Test Team');
        expect(team.boundTournamentId).toBe('tournament_1');
        expect(team.boundTournamentSeriesId).toBe('series_1');
      });
    });

    describe('updateTeam', () => {
      it('should update team fields', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ team_123: mockTeam }));

        const updated = await dataStore.updateTeam('team_123', {
          name: 'Updated Team',
          color: '#0000FF',
        });

        expect(updated?.name).toBe('Updated Team');
        expect(updated?.color).toBe('#0000FF');
        expect(updated?.updatedAt).not.toBe(mockTeam.updatedAt);
      });

      it('should return null for non-existent team', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ team_123: mockTeam }));

        const result = await dataStore.updateTeam('non_existent', { name: 'Test' });
        expect(result).toBeNull();
      });

      it('should throw AlreadyExistsError on duplicate name update', async () => {
        const anotherTeam = { ...mockTeam, id: 'team_999', name: 'Another Team' };
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ team_123: mockTeam, team_999: anotherTeam })
        );

        await expect(
          dataStore.updateTeam('team_999', { name: 'Test Team' })
        ).rejects.toThrow(AlreadyExistsError);
      });

      it('should allow update to same name when changing context', async () => {
        const team1 = { ...mockTeam, id: 'team_1', name: 'Shared Name', boundSeasonId: 'season_1' };
        const team2 = { ...mockTeam, id: 'team_2', name: 'Shared Name', boundSeasonId: 'season_2' };
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ team_1: team1, team_2: team2 })
        );

        // Change context on team_2 - different from team_1's context, should succeed
        const updated = await dataStore.updateTeam('team_2', { boundSeasonId: 'season_3' });
        expect(updated?.boundSeasonId).toBe('season_3');
      });

      it('should throw AlreadyExistsError when update would create duplicate name+context', async () => {
        const team1 = { ...mockTeam, id: 'team_1', name: 'Shared Name', boundSeasonId: 'season_1' };
        const team2 = { ...mockTeam, id: 'team_2', name: 'Shared Name', boundSeasonId: 'season_2' };
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ team_1: team1, team_2: team2 })
        );

        // Try to change team_2's season to match team_1 - should fail
        await expect(
          dataStore.updateTeam('team_2', { boundSeasonId: 'season_1' })
        ).rejects.toThrow(AlreadyExistsError);
      });

      it('should throw ValidationError when update adds series without tournament', async () => {
        // Team has no tournament binding
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ team_123: mockTeam }));

        // Try to add series without tournament - should fail
        await expect(
          dataStore.updateTeam('team_123', { boundTournamentSeriesId: 'series_1' })
        ).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError when update removes tournament but keeps series', async () => {
        const teamWithTournament = {
          ...mockTeam,
          boundTournamentId: 'tournament_1',
          boundTournamentSeriesId: 'series_1',
        };
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ team_123: teamWithTournament }));

        // Try to remove tournament while keeping series - should fail
        await expect(
          dataStore.updateTeam('team_123', { boundTournamentId: undefined })
        ).rejects.toThrow(ValidationError);
      });

      it('should allow update that adds both tournament and series', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ team_123: mockTeam }));

        // Add tournament and series together - should succeed
        const updated = await dataStore.updateTeam('team_123', {
          boundTournamentId: 'tournament_1',
          boundTournamentSeriesId: 'series_1',
        });

        expect(updated?.boundTournamentId).toBe('tournament_1');
        expect(updated?.boundTournamentSeriesId).toBe('series_1');
      });

      it('should allow update that clears both tournament and series', async () => {
        const teamWithTournament = {
          ...mockTeam,
          boundTournamentId: 'tournament_1',
          boundTournamentSeriesId: 'series_1',
        };
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ team_123: teamWithTournament }));

        // Clear both tournament and series - should succeed
        const updated = await dataStore.updateTeam('team_123', {
          boundTournamentId: undefined,
          boundTournamentSeriesId: undefined,
        });

        expect(updated?.boundTournamentId).toBeUndefined();
        expect(updated?.boundTournamentSeriesId).toBeUndefined();
      });
    });

    describe('deleteTeam', () => {
      it('should delete existing team', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ team_123: mockTeam }));

        const result = await dataStore.deleteTeam('team_123');
        expect(result).toBe(true);
      });

      it('should return false for non-existent team', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ team_123: mockTeam }));

        const result = await dataStore.deleteTeam('non_existent');
        expect(result).toBe(false);
      });
    });

    describe('Team Rosters', () => {
      const mockRoster: TeamPlayer[] = [
        { id: 'player_1', name: 'Player One', jerseyNumber: '9' },
        { id: 'player_2', name: 'Player Two', jerseyNumber: '4' },
      ];

      it('should get team roster', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ team_123: mockRoster })
        );

        const roster = await dataStore.getTeamRoster('team_123');
        expect(roster).toHaveLength(2);
      });

      it('should return empty array for team with no roster', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({}));

        const roster = await dataStore.getTeamRoster('team_123');
        expect(roster).toEqual([]);
      });

      it('should set team roster', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({}));

        await dataStore.setTeamRoster('team_123', mockRoster);
        expect(mockSetStorageItem).toHaveBeenCalled();
      });
    });
  });

  // ============================================================
  // SEASON TESTS
  // ============================================================
  describe('Seasons', () => {
    const mockSeason: Season = {
      id: 'season_123',
      name: 'Test Season',
    };

    const mockArchivedSeason: Season = {
      ...mockSeason,
      id: 'season_456',
      name: 'Archived Season',
      archived: true,
    };

    describe('getSeasons', () => {
      it('should return non-archived seasons by default', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify([mockSeason, mockArchivedSeason])
        );

        const seasons = await dataStore.getSeasons();
        expect(seasons).toHaveLength(1);
        expect(seasons[0].name).toBe('Test Season');
      });

      it('should return all seasons when includeArchived is true', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify([mockSeason, mockArchivedSeason])
        );

        const seasons = await dataStore.getSeasons(true);
        expect(seasons).toHaveLength(2);
      });
    });

    describe('createSeason', () => {
      it('should create season with trimmed name', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([]));

        const season = await dataStore.createSeason('  New Season  ');
        expect(season.name).toBe('New Season');
        expect(season.id).toMatch(/^season_\d+_[a-f0-9]{8}$/);
      });

      it('should throw ValidationError on empty name', async () => {
        await expect(dataStore.createSeason('   ')).rejects.toThrow(ValidationError);
      });

      it('should throw AlreadyExistsError on duplicate name with same clubSeason', async () => {
        const existingSeason = { ...mockSeason, startDate: '2024-10-01', clubSeason: '24/25' };
        mockGetStorageItem.mockResolvedValue(JSON.stringify([existingSeason]));

        // Same name, same clubSeason = duplicate
        await expect(dataStore.createSeason('Test Season', { startDate: '2024-11-15' })).rejects.toThrow(
          AlreadyExistsError
        );
      });

      it('should allow same name with different clubSeason', async () => {
        // Use dates within valid club season ranges (Nov 15 - Oct 20)
        const existingSeason = { ...mockSeason, startDate: '2023-12-01', clubSeason: '23/24' };
        mockGetStorageItem.mockResolvedValue(JSON.stringify([existingSeason]));

        // Same name, different clubSeason = allowed
        const newSeason = await dataStore.createSeason('Test Season', { startDate: '2024-12-01' });
        expect(newSeason.name).toBe('Test Season');
        expect(newSeason.clubSeason).toBe('24/25');
      });

      it('should allow same name when both have no dates (different undefined clubSeasons treated same)', async () => {
        const existingSeason = { ...mockSeason };
        mockGetStorageItem.mockResolvedValue(JSON.stringify([existingSeason]));

        // Same name, both no dates = duplicate (both clubSeason undefined)
        await expect(dataStore.createSeason('Test Season')).rejects.toThrow(
          AlreadyExistsError
        );
      });

      it('should allow extra fields', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([]));

        const season = await dataStore.createSeason('New Season', {
          ageGroup: 'U12',
          gameType: 'soccer',
        });

        expect(season.ageGroup).toBe('U12');
        expect(season.gameType).toBe('soccer');
      });
    });

    describe('updateSeason', () => {
      it('should update season', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockSeason]));

        const updated = await dataStore.updateSeason({
          ...mockSeason,
          name: 'Updated Season',
        });

        expect(updated?.name).toBe('Updated Season');
      });

      it('should return null for non-existent season', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockSeason]));

        const result = await dataStore.updateSeason({
          id: 'non_existent',
          name: 'Test',
        });
        expect(result).toBeNull();
      });

      it('should throw ValidationError on empty name', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockSeason]));

        await expect(
          dataStore.updateSeason({ ...mockSeason, name: '   ' })
        ).rejects.toThrow(ValidationError);
      });
    });

    describe('deleteSeason', () => {
      it('should delete existing season', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockSeason]));

        const result = await dataStore.deleteSeason('season_123');
        expect(result).toBe(true);
      });

      it('should return false for non-existent season', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockSeason]));

        const result = await dataStore.deleteSeason('non_existent');
        expect(result).toBe(false);
      });
    });
  });

  // ============================================================
  // TOURNAMENT TESTS
  // ============================================================
  describe('Tournaments', () => {
    const mockTournament: Tournament = {
      id: 'tournament_123',
      name: 'Test Tournament',
    };

    const mockArchivedTournament: Tournament = {
      ...mockTournament,
      id: 'tournament_456',
      name: 'Archived Tournament',
      archived: true,
    };

    describe('getTournaments', () => {
      it('should return non-archived tournaments by default', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify([mockTournament, mockArchivedTournament])
        );

        const tournaments = await dataStore.getTournaments();
        expect(tournaments).toHaveLength(1);
        expect(tournaments[0].name).toBe('Test Tournament');
      });

      it('should return all tournaments when includeArchived is true', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify([mockTournament, mockArchivedTournament])
        );

        const tournaments = await dataStore.getTournaments(true);
        expect(tournaments).toHaveLength(2);
      });

      it('should migrate legacy level field to series', async () => {
        const legacyTournament = { ...mockTournament, level: 'A-sarja' };
        mockGetStorageItem.mockResolvedValue(JSON.stringify([legacyTournament]));

        const tournaments = await dataStore.getTournaments();
        expect(tournaments[0].series).toBeDefined();
        expect(tournaments[0].series).toHaveLength(1);
        expect(tournaments[0].series![0].level).toBe('A-sarja');
      });
    });

    describe('createTournament', () => {
      it('should create tournament with trimmed name', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([]));

        const tournament = await dataStore.createTournament('  New Tournament  ');
        expect(tournament.name).toBe('New Tournament');
        expect(tournament.id).toMatch(/^tournament_\d+_[a-f0-9]{8}$/);
      });

      it('should throw ValidationError on empty name', async () => {
        await expect(dataStore.createTournament('   ')).rejects.toThrow(
          ValidationError
        );
      });

      it('should throw AlreadyExistsError on duplicate name with same clubSeason', async () => {
        const existingTournament = { ...mockTournament, startDate: '2024-10-01', clubSeason: '24/25' };
        mockGetStorageItem.mockResolvedValue(JSON.stringify([existingTournament]));

        // Same name, same clubSeason = duplicate
        await expect(dataStore.createTournament('Test Tournament', { startDate: '2024-11-15' })).rejects.toThrow(
          AlreadyExistsError
        );
      });

      it('should allow same name with different clubSeason', async () => {
        // Use dates within valid club season ranges (Nov 15 - Oct 20)
        const existingTournament = { ...mockTournament, startDate: '2023-12-01', clubSeason: '23/24' };
        mockGetStorageItem.mockResolvedValue(JSON.stringify([existingTournament]));

        // Same name, different clubSeason = allowed
        const newTournament = await dataStore.createTournament('Test Tournament', { startDate: '2024-12-01' });
        expect(newTournament.name).toBe('Test Tournament');
        expect(newTournament.clubSeason).toBe('24/25');
      });

      it('should allow same name when both have no dates (both clubSeason undefined = duplicate)', async () => {
        const existingTournament = { ...mockTournament };
        mockGetStorageItem.mockResolvedValue(JSON.stringify([existingTournament]));

        // Same name, both no dates = duplicate (both clubSeason undefined)
        await expect(dataStore.createTournament('Test Tournament')).rejects.toThrow(
          AlreadyExistsError
        );
      });
    });

    describe('updateTournament', () => {
      it('should update tournament', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockTournament]));

        const updated = await dataStore.updateTournament({
          ...mockTournament,
          name: 'Updated Tournament',
        });

        expect(updated?.name).toBe('Updated Tournament');
      });

      it('should return null for non-existent tournament', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockTournament]));

        const result = await dataStore.updateTournament({
          id: 'non_existent',
          name: 'Test',
        });
        expect(result).toBeNull();
      });
    });

    describe('deleteTournament', () => {
      it('should delete existing tournament', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockTournament]));

        const result = await dataStore.deleteTournament('tournament_123');
        expect(result).toBe(true);
      });

      it('should return false for non-existent tournament', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify([mockTournament]));

        const result = await dataStore.deleteTournament('non_existent');
        expect(result).toBe(false);
      });
    });
  });

  // ============================================================
  // PERSONNEL TESTS
  // ============================================================
  /**
   * Tests Personnel CRUD operations including cascade delete.
   * @critical - Personnel deletion affects game references
   */
  describe('Personnel', () => {
    const mockPersonnel: Personnel = {
      id: 'personnel_123',
      name: 'Coach Smith',
      role: 'head_coach',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    describe('getAllPersonnel', () => {
      it('should return personnel sorted by createdAt descending', async () => {
        const older: Personnel = {
          ...mockPersonnel,
          id: 'personnel_1',
          createdAt: '2024-01-01T00:00:00.000Z',
        };
        const newer: Personnel = {
          ...mockPersonnel,
          id: 'personnel_2',
          createdAt: '2025-06-01T00:00:00.000Z',
        };

        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ personnel_1: older, personnel_2: newer })
        );

        const personnel = await dataStore.getAllPersonnel();
        expect(personnel[0].id).toBe('personnel_2');
        expect(personnel[1].id).toBe('personnel_1');
      });
    });

    describe('getPersonnelById', () => {
      it('should return personnel by id', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ personnel_123: mockPersonnel })
        );

        const personnel = await dataStore.getPersonnelById('personnel_123');
        expect(personnel?.name).toBe('Coach Smith');
      });

      it('should return null for non-existent personnel', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ personnel_123: mockPersonnel })
        );

        const result = await dataStore.getPersonnelById('non_existent');
        expect(result).toBeNull();
      });
    });

    describe('addPersonnelMember', () => {
      it('should add personnel with trimmed name', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({}));

        const personnel = await dataStore.addPersonnelMember({
          name: '  New Coach  ',
          role: 'head_coach',
        });

        expect(personnel.name).toBe('New Coach');
        expect(personnel.id).toMatch(/^personnel_\d+_[a-f0-9]{8}$/);
        expect(personnel.createdAt).toBeDefined();
        expect(personnel.updatedAt).toBeDefined();
      });

      it('should throw ValidationError on empty name', async () => {
        await expect(
          dataStore.addPersonnelMember({ name: '   ', role: 'head_coach' })
        ).rejects.toThrow(ValidationError);
      });

      it('should throw AlreadyExistsError on duplicate name', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ personnel_123: mockPersonnel })
        );

        await expect(
          dataStore.addPersonnelMember({ name: 'Coach Smith', role: 'assistant_coach' })
        ).rejects.toThrow(AlreadyExistsError);
      });
    });

    describe('updatePersonnelMember', () => {
      it('should update personnel', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ personnel_123: mockPersonnel })
        );

        const updated = await dataStore.updatePersonnelMember('personnel_123', {
          name: 'Updated Coach',
        });

        expect(updated?.name).toBe('Updated Coach');
        expect(updated?.updatedAt).not.toBe(mockPersonnel.updatedAt);
      });

      it('should preserve createdAt on update', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ personnel_123: mockPersonnel })
        );

        const updated = await dataStore.updatePersonnelMember('personnel_123', {
          role: 'assistant_coach',
        });

        expect(updated?.createdAt).toBe(mockPersonnel.createdAt);
      });

      it('should return null for non-existent personnel', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ personnel_123: mockPersonnel })
        );

        const result = await dataStore.updatePersonnelMember('non_existent', {
          name: 'Test',
        });
        expect(result).toBeNull();
      });
    });

    /**
     * Tests cascade delete behavior with atomic rollback.
     * @critical - Data integrity depends on proper cascade handling
     */
    describe('removePersonnelMember - CASCADE DELETE', () => {
      /** @critical */
      it('should remove personnel from all games', async () => {
        const gameWithPersonnel: AppState = {
          gamePersonnel: ['personnel_123', 'personnel_456'],
          playersOnField: [],
          opponents: [],
          drawings: [],
          availablePlayers: [],
          showPlayerNames: true,
          teamName: 'Team',
          gameEvents: [],
          opponentName: 'Opponent',
          gameDate: '2025-01-01',
          homeScore: 0,
          awayScore: 0,
          gameNotes: '',
          homeOrAway: 'home',
          numberOfPeriods: 2,
          periodDurationMinutes: 10,
          currentPeriod: 1,
          gameStatus: 'notStarted',
          isPlayed: false,
          selectedPlayerIds: [],
          assessments: {},
          seasonId: '',
          tournamentId: '',
          tournamentLevel: '',
          ageGroup: '',
          gameLocation: '',
          gameTime: '',
          tacticalDiscs: [],
          tacticalDrawings: [],
          tacticalBallPosition: { relX: 0.5, relY: 0.5 },
          subIntervalMinutes: 5,
          completedIntervalDurations: [],
          lastSubConfirmationTimeSeconds: 0,
        };

        mockGetStorageItem
          .mockResolvedValueOnce(JSON.stringify({ personnel_123: mockPersonnel })) // personnel for backup
          .mockResolvedValueOnce(JSON.stringify({ game_1: gameWithPersonnel })) // games for backup
          .mockResolvedValueOnce(JSON.stringify({ personnel_123: mockPersonnel })) // personnel for deletion
          .mockResolvedValueOnce(JSON.stringify({ game_1: gameWithPersonnel })); // games for update

        const result = await dataStore.removePersonnelMember('personnel_123');
        expect(result).toBe(true);

        // Verify setStorageItem was called to update games
        const gamesSaveCall = mockSetStorageItem.mock.calls.find(
          (call) => call[0] === 'savedSoccerGames'
        );
        expect(gamesSaveCall).toBeDefined();

        const savedGames = JSON.parse(gamesSaveCall![1] as string);
        expect(savedGames.game_1.gamePersonnel).toEqual(['personnel_456']);
      });

      it('should return false for non-existent personnel', async () => {
        mockGetStorageItem
          .mockResolvedValueOnce(JSON.stringify({})) // personnel backup
          .mockResolvedValueOnce(JSON.stringify({})) // games backup
          .mockResolvedValueOnce(JSON.stringify({})); // personnel

        const result = await dataStore.removePersonnelMember('non_existent');
        expect(result).toBe(false);
      });

      /**
       * @critical Transaction rollback on deletion failure
       */
      it('should rollback on deletion failure', async () => {
        mockGetStorageItem
          .mockResolvedValueOnce(JSON.stringify({ personnel_123: mockPersonnel })) // backup
          .mockResolvedValueOnce(JSON.stringify({})) // games backup
          .mockResolvedValueOnce(JSON.stringify({ personnel_123: mockPersonnel })) // personnel
          .mockResolvedValueOnce(JSON.stringify({})) // games
          .mockResolvedValueOnce(JSON.stringify({ personnel_123: mockPersonnel })) // verification: personnel
          .mockResolvedValueOnce(JSON.stringify({})); // verification: games

        // Make the personnel save fail
        mockSetStorageItem.mockRejectedValueOnce(new Error('Storage error'));

        await expect(
          dataStore.removePersonnelMember('personnel_123')
        ).rejects.toThrow('Storage error');

        // Verify rollback was attempted
        expect(mockSetStorageItem).toHaveBeenCalledWith(
          'soccerPersonnel',
          JSON.stringify({ personnel_123: mockPersonnel })
        );
      });

      /**
       * @critical Rollback when game update fails during cascade delete
       */
      it('should rollback personnel deletion if game update fails', async () => {
        const gameWithPersonnel: AppState = {
          gamePersonnel: ['personnel_123'],
          playersOnField: [],
          opponents: [],
          drawings: [],
          availablePlayers: [],
          showPlayerNames: true,
          teamName: 'Team',
          gameEvents: [],
          opponentName: 'Opponent',
          gameDate: '2025-01-01',
          homeScore: 0,
          awayScore: 0,
          gameNotes: '',
          homeOrAway: 'home',
          numberOfPeriods: 2,
          periodDurationMinutes: 10,
          currentPeriod: 1,
          gameStatus: 'notStarted',
          isPlayed: false,
          selectedPlayerIds: [],
          assessments: {},
          seasonId: '',
          tournamentId: '',
          tournamentLevel: '',
          ageGroup: '',
          gameLocation: '',
          gameTime: '',
          tacticalDiscs: [],
          tacticalDrawings: [],
          tacticalBallPosition: { relX: 0.5, relY: 0.5 },
          subIntervalMinutes: 5,
          completedIntervalDurations: [],
          lastSubConfirmationTimeSeconds: 0,
        };

        mockGetStorageItem
          .mockResolvedValueOnce(JSON.stringify({ personnel_123: mockPersonnel })) // backup personnel
          .mockResolvedValueOnce(JSON.stringify({ game_1: gameWithPersonnel })) // backup games
          .mockResolvedValueOnce(JSON.stringify({ personnel_123: mockPersonnel })) // personnel for deletion
          .mockResolvedValueOnce(JSON.stringify({ game_1: gameWithPersonnel })) // games for update
          .mockResolvedValueOnce(JSON.stringify({ personnel_123: mockPersonnel })) // verification: personnel
          .mockResolvedValueOnce(JSON.stringify({ game_1: gameWithPersonnel })); // verification: games

        // First call succeeds (games update), second call fails (personnel delete)
        mockSetStorageItem
          .mockResolvedValueOnce(undefined) // games update succeeds
          .mockRejectedValueOnce(new Error('Personnel storage error')); // personnel delete fails

        await expect(
          dataStore.removePersonnelMember('personnel_123')
        ).rejects.toThrow('Personnel storage error');

        // Verify rollback was attempted for both personnel and games
        const setStorageCalls = mockSetStorageItem.mock.calls;
        const rollbackCalls = setStorageCalls.filter(
          call => call[0] === 'soccerPersonnel' || call[0] === 'savedSoccerGames'
        );

        // Should have at least 2 calls (original + rollback attempts)
        expect(rollbackCalls.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ============================================================
  // GAME TESTS
  // ============================================================
  /**
   * Tests Game CRUD operations and event management.
   * @critical - Games are the primary user data
   */
  describe('Games', () => {
    const mockGame: AppState = {
      playersOnField: [],
      opponents: [],
      drawings: [],
      availablePlayers: [],
      showPlayerNames: true,
      teamName: 'My Team',
      gameEvents: [],
      opponentName: 'Opponent',
      gameDate: '2025-01-01',
      homeScore: 1,
      awayScore: 0,
      gameNotes: '',
      homeOrAway: 'home',
      numberOfPeriods: 2,
      periodDurationMinutes: 10,
      currentPeriod: 1,
      gameStatus: 'notStarted',
      isPlayed: true,
      selectedPlayerIds: [],
      assessments: {},
      seasonId: '',
      tournamentId: '',
      tournamentLevel: '',
      ageGroup: '',
      gameLocation: '',
      gameTime: '',
      tacticalDiscs: [],
      tacticalDrawings: [],
      tacticalBallPosition: { relX: 0.5, relY: 0.5 },
      subIntervalMinutes: 5,
      completedIntervalDurations: [],
      lastSubConfirmationTimeSeconds: 0,
      gamePersonnel: [],
    };

    describe('getGames', () => {
      it('should return games collection', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ game_1: mockGame }));

        const games = await dataStore.getGames();
        expect(games).toHaveProperty('game_1');
      });

      it('should return empty object when no games exist', async () => {
        mockGetStorageItem.mockResolvedValue(null);

        const games = await dataStore.getGames();
        expect(games).toEqual({});
      });
    });

    describe('getGameById', () => {
      it('should return game by id', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ game_1: mockGame }));

        const game = await dataStore.getGameById('game_1');
        expect(game?.teamName).toBe('My Team');
      });

      it('should return null for non-existent game', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ game_1: mockGame }));

        const game = await dataStore.getGameById('non_existent');
        expect(game).toBeNull();
      });
    });

    describe('createGame', () => {
      it('should create game with default values', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({}));

        const { gameId, gameData } = await dataStore.createGame({});

        expect(gameId).toMatch(/^game_\d+_/);
        expect(gameData.teamName).toBe('My Team');
        expect(gameData.opponentName).toBe('Opponent');
        expect(gameData.gameStatus).toBe('notStarted');
      });

      it('should create game with provided values', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({}));

        const { gameData } = await dataStore.createGame({
          teamName: 'Custom Team',
          homeScore: 3,
          awayScore: 2,
        });

        expect(gameData.teamName).toBe('Custom Team');
        expect(gameData.homeScore).toBe(3);
        expect(gameData.awayScore).toBe(2);
      });
    });

    describe('saveGame', () => {
      it('should save game', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({}));

        const saved = await dataStore.saveGame('game_1', mockGame);
        expect(saved).toEqual(mockGame);
        expect(mockSetStorageItem).toHaveBeenCalled();
      });

      it('should reject game missing teamName', async () => {
        const invalidGame = { ...mockGame, teamName: '' };
        await expect(dataStore.saveGame('game_1', invalidGame))
          .rejects.toThrow('Missing required game fields');
      });

      it('should reject game missing opponentName', async () => {
        const invalidGame = { ...mockGame, opponentName: '' };
        await expect(dataStore.saveGame('game_1', invalidGame))
          .rejects.toThrow('Missing required game fields');
      });

      it('should reject game missing gameDate', async () => {
        const invalidGame = { ...mockGame, gameDate: '' };
        await expect(dataStore.saveGame('game_1', invalidGame))
          .rejects.toThrow('Missing required game fields');
      });
    });

    describe('deleteGame', () => {
      it('should delete existing game', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ game_1: mockGame }));

        const result = await dataStore.deleteGame('game_1');
        expect(result).toBe(true);
      });

      it('should return false for non-existent game', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ game_1: mockGame }));

        const result = await dataStore.deleteGame('non_existent');
        expect(result).toBe(false);
      });
    });

    describe('saveAllGames', () => {
      it('should save games collection', async () => {
        const games = { game_1: mockGame, game_2: { ...mockGame, teamName: 'Team B' } };

        await dataStore.saveAllGames(games);
        expect(mockSetStorageItem).toHaveBeenCalledWith(
          'savedSoccerGames',
          JSON.stringify(games)
        );
      });

      it('should save empty collection', async () => {
        await dataStore.saveAllGames({});
        expect(mockSetStorageItem).toHaveBeenCalledWith(
          'savedSoccerGames',
          JSON.stringify({})
        );
      });

      it('should reject null', async () => {
        await expect(
          dataStore.saveAllGames(null as unknown as SavedGamesCollection)
        ).rejects.toThrow('Invalid games collection');
      });

      it('should reject undefined', async () => {
        await expect(
          dataStore.saveAllGames(undefined as unknown as SavedGamesCollection)
        ).rejects.toThrow('Invalid games collection');
      });

      it('should reject arrays', async () => {
        await expect(
          dataStore.saveAllGames([] as unknown as SavedGamesCollection)
        ).rejects.toThrow('Invalid games collection');
      });

      it('should reject non-objects', async () => {
        await expect(
          dataStore.saveAllGames('not-an-object' as unknown as SavedGamesCollection)
        ).rejects.toThrow('Invalid games collection');
      });

      it('should reject collection with null game', async () => {
        const games = { game_1: null } as unknown as SavedGamesCollection;
        await expect(dataStore.saveAllGames(games)).rejects.toThrow('Invalid game data for game_1');
      });

      it('should reject collection with non-object game', async () => {
        const games = { game_1: 'not-a-game' } as unknown as SavedGamesCollection;
        await expect(dataStore.saveAllGames(games)).rejects.toThrow('Invalid game data for game_1');
      });

      it('should reject game missing teamName', async () => {
        const games = {
          game_1: { ...mockGame, teamName: '' }
        };
        await expect(dataStore.saveAllGames(games)).rejects.toThrow('Game game_1: Missing required game fields');
      });

      it('should reject game missing opponentName', async () => {
        const games = {
          game_1: { ...mockGame, opponentName: '' }
        };
        await expect(dataStore.saveAllGames(games)).rejects.toThrow('Game game_1: Missing required game fields');
      });

      it('should reject game missing gameDate', async () => {
        const games = {
          game_1: { ...mockGame, gameDate: '' }
        };
        await expect(dataStore.saveAllGames(games)).rejects.toThrow('Game game_1: Missing required game fields');
      });

      // Storage layer error tests
      it('should propagate IndexedDB storage errors', async () => {
        const games = { game_1: mockGame };
        mockSetStorageItem.mockRejectedValue(new Error('Storage write failed'));

        await expect(dataStore.saveAllGames(games)).rejects.toThrow('Storage write failed');
      });

      it('should propagate quota exceeded errors', async () => {
        const games = { game_1: mockGame };
        const quotaError = new Error('QuotaExceededError');
        quotaError.name = 'QuotaExceededError';
        mockSetStorageItem.mockRejectedValue(quotaError);

        await expect(dataStore.saveAllGames(games)).rejects.toThrow('QuotaExceededError');
      });
    });

    describe('Game Events', () => {
      const mockEvent: GameEvent = {
        id: 'event_1',
        type: 'goal',
        time: 300,
        scorerId: 'player_1',
      };

      describe('addGameEvent', () => {
        it('should add event to game', async () => {
          mockGetStorageItem.mockResolvedValue(JSON.stringify({ game_1: mockGame }));

          const updated = await dataStore.addGameEvent('game_1', mockEvent);
          expect(updated?.gameEvents).toHaveLength(1);
          expect(updated?.gameEvents[0].type).toBe('goal');
        });

        it('should return null for non-existent game', async () => {
          mockGetStorageItem.mockResolvedValue(JSON.stringify({}));

          const result = await dataStore.addGameEvent('non_existent', mockEvent);
          expect(result).toBeNull();
        });
      });

      describe('updateGameEvent', () => {
        it('should update event at index', async () => {
          const gameWithEvents = { ...mockGame, gameEvents: [mockEvent] };
          mockGetStorageItem.mockResolvedValue(
            JSON.stringify({ game_1: gameWithEvents })
          );

          const updatedEvent = { ...mockEvent, time: 600 };
          const updated = await dataStore.updateGameEvent('game_1', 0, updatedEvent);

          expect(updated?.gameEvents[0].time).toBe(600);
        });

        it('should return null for invalid index', async () => {
          const gameWithEvents = { ...mockGame, gameEvents: [mockEvent] };
          mockGetStorageItem.mockResolvedValue(
            JSON.stringify({ game_1: gameWithEvents })
          );

          const result = await dataStore.updateGameEvent('game_1', 5, mockEvent);
          expect(result).toBeNull();
        });

        it('should return null for negative index', async () => {
          const gameWithEvents = { ...mockGame, gameEvents: [mockEvent] };
          mockGetStorageItem.mockResolvedValue(
            JSON.stringify({ game_1: gameWithEvents })
          );

          const result = await dataStore.updateGameEvent('game_1', -1, mockEvent);
          expect(result).toBeNull();
        });
      });

      describe('removeGameEvent', () => {
        it('should remove event at index', async () => {
          const gameWithEvents = {
            ...mockGame,
            gameEvents: [mockEvent, { ...mockEvent, time: 600 }],
          };
          mockGetStorageItem.mockResolvedValue(
            JSON.stringify({ game_1: gameWithEvents })
          );

          const updated = await dataStore.removeGameEvent('game_1', 0);
          expect(updated?.gameEvents).toHaveLength(1);
          expect(updated?.gameEvents[0].time).toBe(600);
        });

        it('should return null for invalid index', async () => {
          const gameWithEvents = { ...mockGame, gameEvents: [mockEvent] };
          mockGetStorageItem.mockResolvedValue(
            JSON.stringify({ game_1: gameWithEvents })
          );

          const result = await dataStore.removeGameEvent('game_1', 5);
          expect(result).toBeNull();
        });
      });
    });
  });

  // ============================================================
  // SETTINGS TESTS
  // ============================================================
  describe('Settings', () => {
    const mockSettings: AppSettings = {
      currentGameId: 'game_1',
      lastHomeTeamName: 'Test Team',
      language: 'en',
      hasSeenAppGuide: true,
      useDemandCorrection: false,
      hasConfiguredSeasonDates: true,
      clubSeasonStartDate: '2000-09-01',
      clubSeasonEndDate: '2000-05-31',
    };

    describe('getSettings', () => {
      it('should return settings from storage', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify(mockSettings));

        const settings = await dataStore.getSettings();
        expect(settings.language).toBe('en');
        expect(settings.lastHomeTeamName).toBe('Test Team');
      });

      it('should return default settings when none exist', async () => {
        mockGetStorageItem.mockResolvedValue(null);

        const settings = await dataStore.getSettings();
        expect(settings.language).toBe('fi');
        expect(settings.currentGameId).toBeNull();
      });

      it('should migrate legacy month-based season dates', async () => {
        const legacySettings = {
          ...mockSettings,
          clubSeasonStartMonth: 9,
          clubSeasonEndMonth: 6,
          clubSeasonStartDate: undefined,
          clubSeasonEndDate: undefined,
          hasConfiguredSeasonDates: false,
        };
        mockGetStorageItem.mockResolvedValue(JSON.stringify(legacySettings));

        const settings = await dataStore.getSettings();
        expect(settings.clubSeasonStartDate).toBe('2000-09-01');
        expect(settings.clubSeasonEndDate).toBe('2000-06-01');
        expect(settings.hasConfiguredSeasonDates).toBe(true);

        // Migration should persist without legacy month fields
        expect(mockSetStorageItem).toHaveBeenCalledWith(
          'soccerAppSettings',
          expect.not.stringContaining('clubSeasonStartMonth')
        );
        expect(mockSetStorageItem).toHaveBeenCalledWith(
          'soccerAppSettings',
          expect.not.stringContaining('clubSeasonEndMonth')
        );
      });

      it('should handle malformed JSON gracefully', async () => {
        mockGetStorageItem.mockResolvedValue('invalid json');

        const settings = await dataStore.getSettings();
        expect(settings.language).toBe('fi'); // Default
      });

      it('should read legacy lastHomeTeamName key if not in settings', async () => {
        mockGetStorageItem
          .mockResolvedValueOnce(JSON.stringify({ ...mockSettings, lastHomeTeamName: '' }))
          .mockResolvedValueOnce('Legacy Team Name');

        const settings = await dataStore.getSettings();
        expect(settings.lastHomeTeamName).toBe('Legacy Team Name');
      });
    });

    describe('saveSettings', () => {
      it('should save settings', async () => {
        await dataStore.saveSettings(mockSettings);
        expect(mockSetStorageItem).toHaveBeenCalledWith(
          'soccerAppSettings',
          JSON.stringify(mockSettings)
        );
      });
    });

    describe('updateSettings', () => {
      it('should update settings atomically', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify(mockSettings));

        const updated = await dataStore.updateSettings({ language: 'fi' });

        expect(updated.language).toBe('fi');
        expect(updated.currentGameId).toBe('game_1'); // Preserved from original
        expect(mockSetStorageItem).toHaveBeenCalled();
      });

      it('should migrate legacy month fields when called before getSettings', async () => {
        const legacySettings = {
          currentGameId: 'game_1',
          lastHomeTeamName: 'Test Team',
          clubSeasonStartMonth: 9,
          clubSeasonEndMonth: 6,
          // No clubSeasonStartDate or clubSeasonEndDate
        };
        mockGetStorageItem.mockResolvedValue(JSON.stringify(legacySettings));

        const updated = await dataStore.updateSettings({ language: 'en' });

        // Should have migrated the month fields to date format
        expect(updated.clubSeasonStartDate).toBe('2000-09-01');
        expect(updated.clubSeasonEndDate).toBe('2000-06-01');
        expect(updated.hasConfiguredSeasonDates).toBe(true);
        expect(updated.language).toBe('en');

        // Saved data should not contain legacy month fields
        expect(mockSetStorageItem).toHaveBeenCalledWith(
          'soccerAppSettings',
          expect.not.stringContaining('clubSeasonStartMonth')
        );
        expect(mockSetStorageItem).toHaveBeenCalledWith(
          'soccerAppSettings',
          expect.not.stringContaining('clubSeasonEndMonth')
        );
      });

      it('should throw ValidationError on empty updates', async () => {
        await expect(dataStore.updateSettings({})).rejects.toThrow(ValidationError);
      });

      it('should handle corrupted settings during update', async () => {
        // Suppress expected warning
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        mockGetStorageItem.mockResolvedValue('{ invalid json }');

        const result = await dataStore.updateSettings({ language: 'en' });

        // Should fall back to defaults and apply update
        expect(result.language).toBe('en');
        expect(result.currentGameId).toBe(null); // from defaults
      });

      it('should handle concurrent updateSettings calls safely', async () => {
        // Track storage state with a variable for proper concurrent simulation
        let storedValue = JSON.stringify({
          ...mockSettings,
          language: 'fi',
          hasSeenAppGuide: false,
        });

        // Mock get to always return current state
        mockGetStorageItem.mockImplementation(async () => storedValue);

        // Mock set to update state
        mockSetStorageItem.mockImplementation(async (_key: string, value: string) => {
          storedValue = value;
        });

        // Mock lock to properly serialize concurrent calls
        const { withKeyLock } = require('@/utils/storageKeyLock');
        let lockQueue: Promise<unknown> = Promise.resolve();
        withKeyLock.mockImplementation((_key: string, fn: () => Promise<unknown>) => {
          lockQueue = lockQueue.then(() => fn());
          return lockQueue;
        });

        // Execute concurrent updates - lock ensures serialization
        const [result1, result2] = await Promise.all([
          dataStore.updateSettings({ language: 'en' }),
          dataStore.updateSettings({ hasSeenAppGuide: true })
        ]);

        // Both updates should complete without error
        expect(result1).toBeDefined();
        expect(result2).toBeDefined();

        // Final state should have both updates applied (lock ensures no lost updates)
        const final = await dataStore.getSettings();
        expect(final.language).toBe('en');
        expect(final.hasSeenAppGuide).toBe(true);
      });
    });

    /**
     * @integration Tests settings-to-season cache flow
     * Verifies that after updating season dates, newly created seasons
     * use the updated dates for clubSeason calculation (no stale cache).
     */
    describe('Settings to Season Integration', () => {
      it('should use latest season dates when creating season after settings change', async () => {
        // Step 1: Initial settings with Oct-01 start, May-31 end
        // July 15 is "off-season" (between June 1 and Sep 30)
        const initialSettings: AppSettings = {
          ...mockSettings,
          clubSeasonStartDate: '2000-10-01',
          clubSeasonEndDate: '2000-05-31',
        };

        // Step 2: Updated settings with Jun-01 start, Aug-31 end (summer season)
        // Now July 15 is "24" (within Jun-Aug same-year season)
        const updatedSettings: AppSettings = {
          ...initialSettings,
          clubSeasonStartDate: '2000-06-01',
          clubSeasonEndDate: '2000-08-31',
        };

        // Mock initial state: settings with Oct-01 start, no seasons
        // Order: getSeasonDates reads settings FIRST, then loadSeasons reads seasons
        mockGetStorageItem
          .mockResolvedValueOnce(JSON.stringify(initialSettings)) // settings for getSeasonDates
          .mockResolvedValueOnce(JSON.stringify([])); // seasons for loadSeasons

        // Create season with July-15 date - should be "off-season" with Oct-May season
        const season1 = await dataStore.createSeason('Summer Games', { startDate: '2024-07-15' });
        expect(season1.clubSeason).toBe('off-season');

        // Clear mocks and set up for updated settings
        jest.clearAllMocks();

        // Invalidate cache to simulate settings being updated
        // In real usage, updateSettings() calls invalidateSettingsCache() automatically
        dataStore.invalidateSettingsCache();

        // Mock updated state: settings with Jun-01 start (summer season)
        mockGetStorageItem
          .mockResolvedValueOnce(JSON.stringify(updatedSettings)) // settings for getSeasonDates
          .mockResolvedValueOnce(JSON.stringify([season1])); // seasons for duplicate check

        // Create another season with July-15 date - should now be "2024" with Jun-Aug season
        const season2 = await dataStore.createSeason('Another Summer Games', { startDate: '2024-07-15' });
        expect(season2.clubSeason).toBe('2024');
      });
    });
  });

  // ============================================================
  // PLAYER ADJUSTMENTS TESTS
  // ============================================================
  describe('Player Adjustments', () => {
    const mockAdjustment = {
      id: 'adj_123',
      playerId: 'player_1',
      seasonId: 'season_1',
      gamesPlayedDelta: 1,
      goalsDelta: 2,
      assistsDelta: 1,
      appliedAt: '2025-01-01T00:00:00.000Z',
    };

    describe('getPlayerAdjustments', () => {
      it('should return adjustments for player', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ player_1: [mockAdjustment] })
        );

        const adjustments = await dataStore.getPlayerAdjustments('player_1');
        expect(adjustments).toHaveLength(1);
      });

      it('should return empty array for player with no adjustments', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({}));

        const adjustments = await dataStore.getPlayerAdjustments('player_1');
        expect(adjustments).toEqual([]);
      });
    });

    describe('addPlayerAdjustment', () => {
      it('should add adjustment', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({}));

        const adjustment = await dataStore.addPlayerAdjustment({
          playerId: 'player_1',
          seasonId: 'season_1',
          gamesPlayedDelta: 1,
          goalsDelta: 0,
          assistsDelta: 0,
        });

        expect(adjustment.id).toMatch(/^adj_\d+_[a-f0-9]{8}$/);
        expect(adjustment.appliedAt).toBeDefined();
      });
    });

    describe('updatePlayerAdjustment', () => {
      it('should update adjustment', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ player_1: [mockAdjustment] })
        );

        const updated = await dataStore.updatePlayerAdjustment(
          'player_1',
          'adj_123',
          { goalsDelta: 5 }
        );

        expect(updated?.goalsDelta).toBe(5);
      });

      it('should return null for non-existent adjustment', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ player_1: [mockAdjustment] })
        );

        const result = await dataStore.updatePlayerAdjustment(
          'player_1',
          'non_existent',
          { goalsDelta: 5 }
        );
        expect(result).toBeNull();
      });
    });

    describe('deletePlayerAdjustment', () => {
      it('should delete adjustment', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ player_1: [mockAdjustment] })
        );

        const result = await dataStore.deletePlayerAdjustment('player_1', 'adj_123');
        expect(result).toBe(true);
      });

      it('should return false for non-existent adjustment', async () => {
        mockGetStorageItem.mockResolvedValue(
          JSON.stringify({ player_1: [mockAdjustment] })
        );

        const result = await dataStore.deletePlayerAdjustment('player_1', 'non_existent');
        expect(result).toBe(false);
      });
    });
  });

  // ============================================================
  // WARMUP PLAN TESTS
  // ============================================================
  describe('Warmup Plan', () => {
    const mockPlan: WarmupPlan = {
      id: 'user_warmup_plan',
      version: 1,
      sections: [
        {
          id: 'section_1',
          title: 'Dynamic Stretching',
          content: '- Leg swings\n- Arm circles\n- Hip rotations',
        },
      ],
      lastModified: '2025-01-01T00:00:00.000Z',
      isDefault: false,
    };

    describe('getWarmupPlan', () => {
      it('should return warmup plan', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify(mockPlan));

        const plan = await dataStore.getWarmupPlan();
        expect(plan?.sections).toHaveLength(1);
      });

      it('should return null when no plan exists', async () => {
        mockGetStorageItem.mockResolvedValue(null);

        const plan = await dataStore.getWarmupPlan();
        expect(plan).toBeNull();
      });

      it('should return null for invalid plan structure', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ invalid: true }));

        const plan = await dataStore.getWarmupPlan();
        expect(plan).toBeNull();
      });
    });

    describe('saveWarmupPlan', () => {
      it('should save warmup plan with lastModified', async () => {
        const result = await dataStore.saveWarmupPlan(mockPlan);
        expect(result).toBe(true);

        const savedCall = mockSetStorageItem.mock.calls[0];
        const savedPlan = JSON.parse(savedCall[1] as string);
        expect(savedPlan.lastModified).toBeDefined();
        expect(savedPlan.isDefault).toBe(false);
      });

      it('should return false on save error', async () => {
        mockSetStorageItem.mockRejectedValueOnce(new Error('Storage error'));

        const result = await dataStore.saveWarmupPlan(mockPlan);
        expect(result).toBe(false);
      });
    });

    describe('deleteWarmupPlan', () => {
      it('should delete warmup plan', async () => {
        const result = await dataStore.deleteWarmupPlan();
        expect(result).toBe(true);
        expect(mockSetStorageItem).toHaveBeenCalledWith('soccerWarmupPlan', '');
      });

      it('should return false on delete error', async () => {
        mockSetStorageItem.mockRejectedValueOnce(new Error('Storage error'));

        const result = await dataStore.deleteWarmupPlan();
        expect(result).toBe(false);
      });
    });
  });

  // ============================================================
  // TIMER STATE TESTS
  // ============================================================
  describe('Timer State', () => {
    const mockTimerState: TimerState = {
      gameId: 'game_1',
      timeElapsedInSeconds: 300,
      timestamp: Date.now(),
      wasRunning: true,
    };

    describe('getTimerState', () => {
      it('should return timer state', async () => {
        mockGetStorageJSON.mockResolvedValue(mockTimerState);

        const state = await dataStore.getTimerState();
        expect(state?.gameId).toBe('game_1');
        expect(state?.timeElapsedInSeconds).toBe(300);
      });

      it('should return null when no timer state exists', async () => {
        mockGetStorageJSON.mockResolvedValue(null);

        const state = await dataStore.getTimerState();
        expect(state).toBeNull();
      });

      it('should handle errors gracefully', async () => {
        mockGetStorageJSON.mockRejectedValue(new Error('Storage error'));

        const state = await dataStore.getTimerState();
        expect(state).toBeNull();
      });
    });

    describe('saveTimerState', () => {
      it('should save timer state', async () => {
        await dataStore.saveTimerState(mockTimerState);
        expect(mockSetStorageJSON).toHaveBeenCalledWith(
          'soccerTimerState',
          mockTimerState
        );
      });

      it('should handle errors gracefully', async () => {
        mockSetStorageJSON.mockRejectedValue(new Error('Storage error'));

        await expect(
          dataStore.saveTimerState(mockTimerState)
        ).resolves.not.toThrow();
      });
    });

    describe('clearTimerState', () => {
      it('should clear timer state', async () => {
        await dataStore.clearTimerState();
        expect(mockRemoveStorageItem).toHaveBeenCalledWith('soccerTimerState');
      });

      it('should handle errors gracefully', async () => {
        mockRemoveStorageItem.mockRejectedValue(new Error('Storage error'));

        await expect(dataStore.clearTimerState()).resolves.not.toThrow();
      });
    });
  });

  // ============================================================
  // EDGE CASES
  // ============================================================
  describe('Edge Cases', () => {
    describe('Empty Data', () => {
      it('should handle empty storage for all entity types', async () => {
        mockGetStorageItem.mockResolvedValue(null);

        expect(await dataStore.getPlayers()).toEqual([]);
        expect(await dataStore.getTeams()).toEqual([]);
        expect(await dataStore.getSeasons()).toEqual([]);
        expect(await dataStore.getTournaments()).toEqual([]);
        expect(await dataStore.getAllPersonnel()).toEqual([]);
        expect(await dataStore.getGames()).toEqual({});
      });
    });

    describe('Malformed JSON', () => {
      it('should handle malformed JSON for players', async () => {
        mockGetStorageItem.mockResolvedValue('not valid json');
        const players = await dataStore.getPlayers();
        expect(players).toEqual([]);
      });

      it('should handle non-array for players', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify({ invalid: true }));
        const players = await dataStore.getPlayers();
        expect(players).toEqual([]);
      });

      it('should handle non-object for teams', async () => {
        mockGetStorageItem.mockResolvedValue(JSON.stringify(['array', 'not', 'object']));
        const teams = await dataStore.getTeams();
        expect(teams).toEqual([]);
      });
    });

    describe('Concurrent Operations', () => {
      it('should use key locks for player operations', async () => {
        const { withKeyLock } = jest.requireMock('@/utils/storageKeyLock');

        mockGetStorageItem.mockResolvedValue(JSON.stringify([]));
        await dataStore.createPlayer({ name: 'Test', jerseyNumber: '1' });

        expect(withKeyLock).toHaveBeenCalledWith('soccerMasterRoster', expect.any(Function));
      });

      // Note: Roster locking is handled by teams.ts (the public API layer),
      // not by LocalDataStore. This allows teams.ts to wrap multiple DataStore
      // operations in a single lock for atomic read-modify-write operations.
      // See teams.ts:addPlayerToRoster, updatePlayerInRoster, removePlayerFromRoster.
    });
  });
});
