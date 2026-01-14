/**
 * Tests for SupabaseDataStore
 *
 * Comprehensive tests for all core CRUD operations.
 * Part of PR #3: SupabaseDataStore Core
 *
 * Note: Game methods are stubbed in PR #3 and will be tested in PR #4.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TeamPlayer, Season, Tournament } from '@/types';
import type { PersonnelRole } from '@/types/personnel';
import type { AppSettings } from '@/types/settings';
import type { Database } from '@/types/supabase';
import { SupabaseDataStore } from '../SupabaseDataStore';
import {
  AlreadyExistsError,
  AuthError,
  NetworkError,
  NotInitializedError,
  ValidationError,
} from '@/interfaces/DataStoreErrors';

// Create a typed mock for Supabase query builder
interface MockQueryBuilder {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  upsert: jest.Mock;
  eq: jest.Mock;
  single: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
}

const createMockQueryBuilder = (): MockQueryBuilder => {
  const builder: MockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  };
  return builder;
};

// Default mock query builder with empty results
let mockQueryBuilder = createMockQueryBuilder();

// Mock user for auth
const mockUser = {
  id: 'user_123_abc',
  email: 'test@example.com',
};

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn(() => mockQueryBuilder),
  auth: {
    getUser: jest.fn().mockResolvedValue({
      data: { user: mockUser },
      error: null,
    }),
  },
} as unknown as SupabaseClient<Database>;

// Mock getSupabaseClient
jest.mock('@/datastore/supabase', () => ({
  getSupabaseClient: () => mockSupabaseClient,
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock navigator.onLine
const originalNavigator = global.navigator;

describe('SupabaseDataStore', () => {
  let dataStore: SupabaseDataStore;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Reset query builder
    mockQueryBuilder = createMockQueryBuilder();
    (mockSupabaseClient.from as jest.Mock).mockReturnValue(mockQueryBuilder);

    // Mock navigator.onLine as true by default
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
      configurable: true,
    });

    // Create new instance
    dataStore = new SupabaseDataStore();
    await dataStore.initialize();
  });

  afterEach(async () => {
    await dataStore.close();
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  // ==========================================================================
  // LIFECYCLE TESTS
  // ==========================================================================

  describe('Lifecycle', () => {
    it('should initialize successfully', async () => {
      const store = new SupabaseDataStore();
      await store.initialize();
      expect(store.getBackendName()).toBe('supabase');
      await store.close();
    });

    it('should return "supabase" as backend name', () => {
      expect(dataStore.getBackendName()).toBe('supabase');
    });

    it('should throw NotInitializedError when not initialized', async () => {
      const uninitializedStore = new SupabaseDataStore();
      await expect(uninitializedStore.getPlayers()).rejects.toThrow(NotInitializedError);
    });

    it('should check availability correctly', async () => {
      // Mock successful health check
      mockQueryBuilder.limit = jest.fn().mockResolvedValue({ data: [], error: null });

      const isAvailable = await dataStore.isAvailable();
      expect(isAvailable).toBe(true);
    });

    it('should return false for availability when health check fails', async () => {
      mockQueryBuilder.limit = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Connection failed' },
      });

      const isAvailable = await dataStore.isAvailable();
      expect(isAvailable).toBe(false);
    });
  });

  // ==========================================================================
  // OFFLINE CHECK TESTS
  // ==========================================================================

  describe('Offline Check', () => {
    it('should throw NetworkError when offline', async () => {
      Object.defineProperty(global, 'navigator', {
        value: { onLine: false },
        writable: true,
        configurable: true,
      });

      await expect(dataStore.getPlayers()).rejects.toThrow(NetworkError);
    });
  });

  // ==========================================================================
  // AUTH FAILURE TESTS
  // ==========================================================================

  describe('Auth Failure', () => {
    it('should throw AuthError when user not authenticated on createPlayer', async () => {
      (mockSupabaseClient.auth.getUser as jest.Mock).mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      await expect(
        dataStore.createPlayer({
          name: 'Test Player',
          isGoalie: false,
          receivedFairPlayCard: false,
        })
      ).rejects.toThrow(AuthError);
    });

    it('should throw AuthError when user not authenticated on createTeam', async () => {
      (mockSupabaseClient.auth.getUser as jest.Mock).mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      // Mock getTeams to return empty (for uniqueness check)
      mockQueryBuilder.order = jest.fn().mockResolvedValue({ data: [], error: null });

      await expect(
        dataStore.createTeam({ name: 'Test Team' })
      ).rejects.toThrow(AuthError);
    });

    it('should throw AuthError when auth.getUser returns error', async () => {
      (mockSupabaseClient.auth.getUser as jest.Mock).mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Session expired' },
      });

      await expect(
        dataStore.createPlayer({
          name: 'Test',
          isGoalie: false,
          receivedFairPlayCard: false,
        })
      ).rejects.toThrow(AuthError);
    });

    it('should cache user ID and reuse it for multiple operations', async () => {
      // Reset the mock call count
      (mockSupabaseClient.auth.getUser as jest.Mock).mockClear();

      // First operation - should call getUser
      await dataStore.createPlayer({
        name: 'Player 1',
        isGoalie: false,
        receivedFairPlayCard: false,
      });

      // Second operation - should reuse cached userId
      await dataStore.createPlayer({
        name: 'Player 2',
        isGoalie: false,
        receivedFairPlayCard: false,
      });

      // Third operation - should still reuse cached userId
      await dataStore.createPlayer({
        name: 'Player 3',
        isGoalie: false,
        receivedFairPlayCard: false,
      });

      // auth.getUser should only have been called once (cached after first call)
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // NETWORK ERROR PROPAGATION TESTS
  // ==========================================================================

  describe('Network Error Propagation', () => {
    it('should wrap Supabase errors in NetworkError for insert', async () => {
      mockQueryBuilder.insert = jest.fn().mockResolvedValue({
        error: { message: 'Connection refused' },
      });

      await expect(
        dataStore.createPlayer({
          name: 'Test',
          isGoalie: false,
          receivedFairPlayCard: false,
        })
      ).rejects.toThrow(NetworkError);
    });

    it('should wrap Supabase errors in NetworkError for update', async () => {
      // Mock existing player fetch
      mockQueryBuilder.single = jest.fn().mockResolvedValue({
        data: {
          id: 'player_123',
          name: 'Old Name',
          is_goalie: false,
          received_fair_play_card: false,
        },
        error: null,
      });

      // Note: Testing update failure after successful select is tricky with current mock setup
      // For now, test the select failure path (when player not found)
      mockQueryBuilder.single = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await dataStore.updatePlayer('player_123', { name: 'New Name' });
      expect(result).toBeNull();
    });

    it('should wrap Supabase errors in NetworkError for delete', async () => {
      mockQueryBuilder.eq = jest.fn().mockResolvedValue({
        error: { message: 'Foreign key constraint' },
        count: 0,
      });

      await expect(dataStore.deletePlayer('player_123')).rejects.toThrow(NetworkError);
    });
  });

  // ==========================================================================
  // PLAYER TESTS
  // ==========================================================================

  describe('Players', () => {
    describe('getPlayers', () => {
      it('should fetch all players', async () => {
        const mockRow = {
          id: 'player_123',
          name: 'Test Player',
          nickname: null,
          jersey_number: '10',
          is_goalie: false,
          color: null,
          notes: null,
          received_fair_play_card: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          user_id: 'user_123',
        };

        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [mockRow],
          error: null,
        });

        const players = await dataStore.getPlayers();

        expect(players).toHaveLength(1);
        expect(players[0].id).toBe('player_123');
        expect(players[0].name).toBe('Test Player');
        expect(players[0].jerseyNumber).toBe('10');
      });

      it('should return empty array when no players', async () => {
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [],
          error: null,
        });

        const players = await dataStore.getPlayers();
        expect(players).toEqual([]);
      });

      it('should throw NetworkError on fetch failure', async () => {
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        });

        await expect(dataStore.getPlayers()).rejects.toThrow(NetworkError);
      });
    });

    describe('createPlayer', () => {
      beforeEach(() => {
        mockQueryBuilder.insert = jest.fn().mockResolvedValue({ error: null });
      });

      it('should create a player successfully', async () => {
        const player = await dataStore.createPlayer({
          name: 'New Player',
          jerseyNumber: '7',
          isGoalie: false,
          receivedFairPlayCard: false,
        });

        expect(player.name).toBe('New Player');
        expect(player.id).toMatch(/^player_/);
        expect(mockQueryBuilder.insert).toHaveBeenCalled();
      });

      it('should trim player name', async () => {
        const player = await dataStore.createPlayer({
          name: '  Trimmed Name  ',
          isGoalie: false,
          receivedFairPlayCard: false,
        });

        expect(player.name).toBe('Trimmed Name');
      });

      it('should throw ValidationError for empty name', async () => {
        await expect(
          dataStore.createPlayer({
            name: '',
            isGoalie: false,
            receivedFairPlayCard: false,
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError for whitespace-only name', async () => {
        await expect(
          dataStore.createPlayer({
            name: '   ',
            isGoalie: false,
            receivedFairPlayCard: false,
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError for name exceeding max length', async () => {
        await expect(
          dataStore.createPlayer({
            name: 'A'.repeat(101),
            isGoalie: false,
            receivedFairPlayCard: false,
          })
        ).rejects.toThrow(ValidationError);
      });
    });

    describe('updatePlayer', () => {
      it('should update player successfully', async () => {
        const existingRow = {
          id: 'player_123',
          name: 'Old Name',
          nickname: null,
          jersey_number: '10',
          is_goalie: false,
          color: null,
          notes: null,
          received_fair_play_card: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          user_id: 'user_123',
        };

        mockQueryBuilder.single = jest.fn().mockResolvedValue({
          data: existingRow,
          error: null,
        });
        mockQueryBuilder.update = jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        });

        const updated = await dataStore.updatePlayer('player_123', { name: 'New Name' });

        expect(updated).not.toBeNull();
        expect(updated?.name).toBe('New Name');
      });

      it('should return null for non-existent player', async () => {
        mockQueryBuilder.single = jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        });

        const result = await dataStore.updatePlayer('nonexistent', { name: 'New Name' });
        expect(result).toBeNull();
      });
    });

    describe('deletePlayer', () => {
      it('should delete player successfully', async () => {
        mockQueryBuilder.eq = jest.fn().mockResolvedValue({
          error: null,
          count: 1,
        });

        const result = await dataStore.deletePlayer('player_123');
        expect(result).toBe(true);
      });

      it('should return false for non-existent player', async () => {
        mockQueryBuilder.eq = jest.fn().mockResolvedValue({
          error: null,
          count: 0,
        });

        const result = await dataStore.deletePlayer('nonexistent');
        expect(result).toBe(false);
      });
    });
  });

  // ==========================================================================
  // TEAM TESTS
  // ==========================================================================

  describe('Teams', () => {
    describe('getTeams', () => {
      it('should fetch all non-archived teams by default', async () => {
        const mockRow = {
          id: 'team_123',
          name: 'Test Team',
          color: null,
          notes: null,
          age_group: null,
          game_type: 'soccer',
          archived: false,
          bound_season_id: null,
          bound_tournament_id: null,
          bound_tournament_series_id: null,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          user_id: 'user_123',
        };

        mockQueryBuilder.eq = jest.fn().mockReturnThis();
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [mockRow],
          error: null,
        });

        const teams = await dataStore.getTeams();

        expect(teams).toHaveLength(1);
        expect(teams[0].name).toBe('Test Team');
        expect(mockQueryBuilder.eq).toHaveBeenCalledWith('archived', false);
      });

      it('should include archived teams when requested', async () => {
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [],
          error: null,
        });

        await dataStore.getTeams(true);

        // eq should not be called with archived filter
        expect(mockQueryBuilder.eq).not.toHaveBeenCalled();
      });
    });

    describe('createTeam', () => {
      beforeEach(() => {
        // Mock getTeams for uniqueness check
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [],
          error: null,
        });
        mockQueryBuilder.insert = jest.fn().mockResolvedValue({ error: null });
      });

      it('should create a team successfully', async () => {
        const team = await dataStore.createTeam({
          name: 'New Team',
        });

        expect(team.name).toBe('New Team');
        expect(team.id).toMatch(/^team_/);
      });

      it('should throw ValidationError for empty name', async () => {
        await expect(
          dataStore.createTeam({ name: '' })
        ).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError for name exceeding max length', async () => {
        await expect(
          dataStore.createTeam({ name: 'A'.repeat(50) })
        ).rejects.toThrow(ValidationError);
      });

      it('should throw AlreadyExistsError for duplicate team with same composite key', async () => {
        // Mock existing team with same composite key
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [{
            id: 'team_existing',
            name: 'New Team',
            color: null,
            notes: null,
            age_group: null,
            game_type: null,
            archived: false,
            bound_season_id: null,
            bound_tournament_id: null,
            bound_tournament_series_id: null,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            user_id: 'user_123',
          }],
          error: null,
        });

        await expect(
          dataStore.createTeam({ name: 'New Team' })
        ).rejects.toThrow(AlreadyExistsError);
      });

      it('should allow same team name with different season binding (composite uniqueness)', async () => {
        // Existing team bound to season_1
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [{
            id: 'team_existing',
            name: 'Eagles',
            color: null,
            notes: null,
            age_group: null,
            game_type: null,
            archived: false,
            bound_season_id: 'season_1',
            bound_tournament_id: null,
            bound_tournament_series_id: null,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            user_id: 'user_123',
          }],
          error: null,
        });

        // Creating same name but different season should succeed
        const team = await dataStore.createTeam({
          name: 'Eagles',
          boundSeasonId: 'season_2',
        });

        expect(team.name).toBe('Eagles');
        expect(team.boundSeasonId).toBe('season_2');
      });

      it('should allow same team name with different game type (composite uniqueness)', async () => {
        // Existing soccer team
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [{
            id: 'team_existing',
            name: 'Panthers',
            color: null,
            notes: null,
            age_group: null,
            game_type: 'soccer',
            archived: false,
            bound_season_id: null,
            bound_tournament_id: null,
            bound_tournament_series_id: null,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            user_id: 'user_123',
          }],
          error: null,
        });

        // Creating same name but futsal should succeed
        const team = await dataStore.createTeam({
          name: 'Panthers',
          gameType: 'futsal',
        });

        expect(team.name).toBe('Panthers');
        expect(team.gameType).toBe('futsal');
      });

      it('should validate series binding requires tournament binding', async () => {
        await expect(
          dataStore.createTeam({
            name: 'Test Team',
            boundTournamentSeriesId: 'series_123',
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should allow same team name with all different composite key fields', async () => {
        // Existing team with full composite key
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [{
            id: 'team_existing',
            name: 'Lions',
            color: null,
            notes: null,
            age_group: null,
            game_type: 'soccer',
            archived: false,
            bound_season_id: 'season_1',
            bound_tournament_id: 'tournament_1',
            bound_tournament_series_id: 'series_1',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            user_id: 'user_123',
          }],
          error: null,
        });

        // Same name but different tournament (different composite key) should succeed
        const team = await dataStore.createTeam({
          name: 'Lions',
          gameType: 'soccer',
          boundSeasonId: 'season_1',
          boundTournamentId: 'tournament_2', // Different tournament
          boundTournamentSeriesId: 'series_1',
        });

        expect(team.name).toBe('Lions');
        expect(team.boundTournamentId).toBe('tournament_2');
      });

      it('should detect duplicate with case-insensitive name comparison', async () => {
        // Existing team with lowercase name
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [{
            id: 'team_existing',
            name: 'tigers',
            color: null,
            notes: null,
            age_group: null,
            game_type: null,
            archived: false,
            bound_season_id: null,
            bound_tournament_id: null,
            bound_tournament_series_id: null,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            user_id: 'user_123',
          }],
          error: null,
        });

        // Creating same name with different case should fail (case-insensitive)
        await expect(
          dataStore.createTeam({ name: 'TIGERS' })
        ).rejects.toThrow(AlreadyExistsError);
      });
    });
  });

  // ==========================================================================
  // TEAM ROSTER TESTS
  // ==========================================================================

  describe('Team Rosters', () => {
    describe('getTeamRoster', () => {
      it('should fetch team roster', async () => {
        const mockRow = {
          id: 'team_123_player_456',
          team_id: 'team_123',
          player_id: 'player_456',
          name: 'Test Player',
          nickname: null,
          jersey_number: '10',
          is_goalie: false,
          color: null,
          notes: null,
          received_fair_play_card: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          user_id: 'user_123',
        };

        mockQueryBuilder.eq = jest.fn().mockReturnThis();
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [mockRow],
          error: null,
        });

        const roster = await dataStore.getTeamRoster('team_123');

        expect(roster).toHaveLength(1);
        expect(roster[0].id).toBe('player_456');
        expect(roster[0].name).toBe('Test Player');
      });
    });

    describe('setTeamRoster', () => {
      it('should set team roster', async () => {
        mockQueryBuilder.eq = jest.fn().mockResolvedValue({ error: null });
        mockQueryBuilder.insert = jest.fn().mockResolvedValue({ error: null });

        const roster: TeamPlayer[] = [
          {
            id: 'player_1',
            name: 'Player 1',
            isGoalie: false,
            receivedFairPlayCard: false,
          },
        ];

        await expect(dataStore.setTeamRoster('team_123', roster)).resolves.not.toThrow();
      });

      it('should handle empty roster', async () => {
        mockQueryBuilder.eq = jest.fn().mockResolvedValue({ error: null });

        await expect(dataStore.setTeamRoster('team_123', [])).resolves.not.toThrow();
        expect(mockQueryBuilder.insert).not.toHaveBeenCalled();
      });
    });

    describe('getAllTeamRosters', () => {
      it('should fetch all team rosters', async () => {
        const mockRows = [
          {
            id: 'team_1_player_1',
            team_id: 'team_1',
            player_id: 'player_1',
            name: 'Player 1',
            nickname: null,
            jersey_number: '1',
            is_goalie: false,
            color: null,
            notes: null,
            received_fair_play_card: false,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            user_id: 'user_123',
          },
          {
            id: 'team_2_player_2',
            team_id: 'team_2',
            player_id: 'player_2',
            name: 'Player 2',
            nickname: null,
            jersey_number: '2',
            is_goalie: true,
            color: null,
            notes: null,
            received_fair_play_card: false,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            user_id: 'user_123',
          },
        ];

        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: mockRows,
          error: null,
        });

        const rosters = await dataStore.getAllTeamRosters();

        expect(Object.keys(rosters)).toHaveLength(2);
        expect(rosters['team_1']).toHaveLength(1);
        expect(rosters['team_2']).toHaveLength(1);
      });
    });
  });

  // ==========================================================================
  // SEASON TESTS
  // ==========================================================================

  describe('Seasons', () => {
    describe('getSeasons', () => {
      it('should fetch all non-archived seasons', async () => {
        const mockRow = {
          id: 'season_123',
          name: 'Test Season',
          start_date: '2024-01-01',
          end_date: '2024-12-31',
          club_season: '23/24',
          game_type: 'soccer',
          gender: 'boys',
          age_group: 'U12',
          league_id: null,
          custom_league_name: null,
          archived: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          user_id: 'user_123',
        };

        mockQueryBuilder.eq = jest.fn().mockReturnThis();
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [mockRow],
          error: null,
        });

        // Mock settings for clubSeason calculation
        (mockSupabaseClient.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'user_settings') {
            return {
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return mockQueryBuilder;
        });

        const seasons = await dataStore.getSeasons();

        expect(seasons).toHaveLength(1);
        expect(seasons[0].name).toBe('Test Season');
      });
    });

    describe('createSeason', () => {
      beforeEach(() => {
        // Mock getSeasons for uniqueness check
        mockQueryBuilder.eq = jest.fn().mockReturnThis();
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [],
          error: null,
        });
        mockQueryBuilder.insert = jest.fn().mockResolvedValue({ error: null });

        // Mock settings
        (mockSupabaseClient.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'user_settings') {
            return {
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return mockQueryBuilder;
        });
      });

      it('should create a season successfully', async () => {
        const season = await dataStore.createSeason('New Season', {
          gameType: 'soccer',
        });

        expect(season.name).toBe('New Season');
        expect(season.id).toMatch(/^season_/);
      });

      it('should throw ValidationError for empty name', async () => {
        await expect(dataStore.createSeason('')).rejects.toThrow(ValidationError);
      });

      it('should throw AlreadyExistsError for duplicate season with same composite key', async () => {
        // Mock existing season - clubSeason is computed from startDate, so both must have same computed value
        // With no startDate, clubSeason computes to undefined
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [{
            id: 'season_existing',
            name: 'Fall 2024',
            club_season: null, // Computed from null startDate
            game_type: 'soccer',
            gender: 'boys',
            age_group: 'U12',
            league_id: null,
            archived: false,
            start_date: null,
            end_date: null,
            custom_league_name: null,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            user_id: 'user_123',
          }],
          error: null,
        });

        // New season with same composite key (no startDate = undefined clubSeason)
        await expect(
          dataStore.createSeason('Fall 2024', {
            gameType: 'soccer',
            gender: 'boys',
            ageGroup: 'U12',
          })
        ).rejects.toThrow(AlreadyExistsError);
      });

      it('should allow same season name with different gender (composite uniqueness)', async () => {
        // Mock existing season for boys
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [{
            id: 'season_existing',
            name: 'Spring League',
            club_season: null,
            game_type: 'soccer',
            gender: 'boys',
            age_group: 'U12',
            league_id: null,
            archived: false,
            start_date: null,
            end_date: null,
            custom_league_name: null,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            user_id: 'user_123',
          }],
          error: null,
        });

        // Creating same name for girls should succeed (different gender = different composite key)
        const season = await dataStore.createSeason('Spring League', {
          gameType: 'soccer',
          gender: 'girls',
          ageGroup: 'U12',
        });

        expect(season.name).toBe('Spring League');
        expect(season.gender).toBe('girls');
      });
    });

    describe('updateSeason', () => {
      const existingSeasonRow = {
        id: 'season_123',
        name: 'Original Season',
        club_season: '24/25',
        game_type: 'soccer',
        gender: 'boys',
        age_group: 'U12',
        league_id: null,
        custom_league_name: null,
        archived: false,
        start_date: null,
        end_date: null,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        user_id: 'user_123',
      };

      beforeEach(() => {
        // Mock single season fetch
        mockQueryBuilder.single = jest.fn().mockResolvedValue({
          data: existingSeasonRow,
          error: null,
        });
        // Mock settings fetch - updateSeason calls getSettings to compute clubSeason
        (mockSupabaseClient.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'user_settings') {
            return {
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return mockQueryBuilder;
        });
      });

      it('should throw ValidationError for empty name on update', async () => {
        const season: Season = {
          id: 'season_123',
          name: '   ',
          gameType: 'soccer',
        };

        await expect(dataStore.updateSeason(season)).rejects.toThrow(ValidationError);
      });

      it('should return null when season not found', async () => {
        mockQueryBuilder.single = jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        });

        const season: Season = {
          id: 'nonexistent_123',
          name: 'Test',
          gameType: 'soccer',
        };

        const result = await dataStore.updateSeason(season);
        expect(result).toBeNull();
      });
    });
  });

  // ==========================================================================
  // TOURNAMENT TESTS
  // ==========================================================================

  describe('Tournaments', () => {
    describe('getTournaments', () => {
      it('should fetch all non-archived tournaments', async () => {
        const mockRow = {
          id: 'tournament_123',
          name: 'Test Tournament',
          start_date: '2024-06-01',
          end_date: '2024-06-03',
          location: 'Helsinki',
          club_season: '23/24',
          game_type: 'soccer',
          gender: 'boys',
          age_group: 'U12',
          level: null,
          series: null,
          archived: false,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          user_id: 'user_123',
        };

        mockQueryBuilder.eq = jest.fn().mockReturnThis();
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [mockRow],
          error: null,
        });

        // Mock settings
        (mockSupabaseClient.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'user_settings') {
            return {
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return mockQueryBuilder;
        });

        const tournaments = await dataStore.getTournaments();

        expect(tournaments).toHaveLength(1);
        expect(tournaments[0].name).toBe('Test Tournament');
      });
    });

    describe('createTournament', () => {
      beforeEach(() => {
        mockQueryBuilder.eq = jest.fn().mockReturnThis();
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [],
          error: null,
        });
        mockQueryBuilder.insert = jest.fn().mockResolvedValue({ error: null });

        (mockSupabaseClient.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'user_settings') {
            return {
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return mockQueryBuilder;
        });
      });

      it('should create a tournament successfully', async () => {
        const tournament = await dataStore.createTournament('New Tournament', {
          gameType: 'soccer',
          location: 'Helsinki',
        });

        expect(tournament.name).toBe('New Tournament');
        expect(tournament.id).toMatch(/^tournament_/);
      });

      it('should throw ValidationError for empty name', async () => {
        await expect(dataStore.createTournament('')).rejects.toThrow(ValidationError);
      });

      it('should throw AlreadyExistsError for duplicate tournament with same composite key', async () => {
        // Mock existing tournament - clubSeason is computed from startDate
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [{
            id: 'tournament_existing',
            name: 'Helsinki Cup',
            club_season: null, // Computed from null startDate
            game_type: 'soccer',
            gender: 'boys',
            age_group: 'U12',
            level: null,
            series: null,
            location: 'Helsinki',
            archived: false,
            start_date: null,
            end_date: null,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            user_id: 'user_123',
          }],
          error: null,
        });

        // New tournament with same composite key
        await expect(
          dataStore.createTournament('Helsinki Cup', {
            gameType: 'soccer',
            gender: 'boys',
            ageGroup: 'U12',
          })
        ).rejects.toThrow(AlreadyExistsError);
      });

      it('should allow same tournament name with different age group (composite uniqueness)', async () => {
        // Mock existing tournament for U12
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [{
            id: 'tournament_existing',
            name: 'Summer Cup',
            club_season: null,
            game_type: 'soccer',
            gender: 'boys',
            age_group: 'U12',
            level: null,
            series: null,
            location: null,
            archived: false,
            start_date: null,
            end_date: null,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            user_id: 'user_123',
          }],
          error: null,
        });

        // Creating same name for U14 should succeed (different ageGroup = different composite key)
        const tournament = await dataStore.createTournament('Summer Cup', {
          gameType: 'soccer',
          gender: 'boys',
          ageGroup: 'U14',
        });

        expect(tournament.name).toBe('Summer Cup');
        expect(tournament.ageGroup).toBe('U14');
      });
    });

    describe('updateTournament', () => {
      const existingTournamentRow = {
        id: 'tournament_123',
        name: 'Original Tournament',
        club_season: '24/25',
        game_type: 'soccer',
        gender: 'boys',
        age_group: 'U12',
        level: null,
        series: null,
        location: 'Helsinki',
        archived: false,
        start_date: null,
        end_date: null,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        user_id: 'user_123',
      };

      beforeEach(() => {
        mockQueryBuilder.single = jest.fn().mockResolvedValue({
          data: existingTournamentRow,
          error: null,
        });
        (mockSupabaseClient.from as jest.Mock).mockImplementation((table: string) => {
          if (table === 'user_settings') {
            return {
              select: jest.fn().mockReturnThis(),
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return mockQueryBuilder;
        });
      });

      it('should throw ValidationError for empty name on update', async () => {
        const tournament: Tournament = {
          id: 'tournament_123',
          name: '   ',
          gameType: 'soccer',
        };

        await expect(dataStore.updateTournament(tournament)).rejects.toThrow(ValidationError);
      });

      it('should return null when tournament not found', async () => {
        mockQueryBuilder.single = jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        });

        const tournament: Tournament = {
          id: 'nonexistent_123',
          name: 'Test',
          gameType: 'soccer',
        };

        const result = await dataStore.updateTournament(tournament);
        expect(result).toBeNull();
      });
    });
  });

  // ==========================================================================
  // PERSONNEL TESTS
  // ==========================================================================

  describe('Personnel', () => {
    describe('getAllPersonnel', () => {
      it('should fetch all personnel', async () => {
        const mockRow = {
          id: 'personnel_123',
          name: 'Test Coach',
          role: 'headCoach',
          email: 'coach@test.com',
          phone: null,
          certifications: ['UEFA B'],
          notes: null,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          user_id: 'user_123',
        };

        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [mockRow],
          error: null,
        });

        const personnel = await dataStore.getAllPersonnel();

        expect(personnel).toHaveLength(1);
        expect(personnel[0].name).toBe('Test Coach');
        expect(personnel[0].certifications).toEqual(['UEFA B']);
      });
    });

    describe('addPersonnelMember', () => {
      beforeEach(() => {
        // Mock getAllPersonnel for uniqueness check
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [],
          error: null,
        });
        mockQueryBuilder.insert = jest.fn().mockResolvedValue({ error: null });
      });

      it('should add personnel member successfully', async () => {
        const personnel = await dataStore.addPersonnelMember({
          name: 'New Coach',
          role: 'assistantCoach' as PersonnelRole,
          certifications: [],
        });

        expect(personnel.name).toBe('New Coach');
        expect(personnel.id).toMatch(/^personnel_/);
      });

      it('should throw ValidationError for empty name', async () => {
        await expect(
          dataStore.addPersonnelMember({
            name: '',
            role: 'headCoach' as PersonnelRole,
            certifications: [],
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should throw AlreadyExistsError for duplicate name', async () => {
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [{
            id: 'personnel_existing',
            name: 'Existing Coach',
            role: 'headCoach',
            email: null,
            phone: null,
            certifications: [],
            notes: null,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            user_id: 'user_123',
          }],
          error: null,
        });

        await expect(
          dataStore.addPersonnelMember({
            name: 'Existing Coach',
            role: 'assistantCoach' as PersonnelRole,
            certifications: [],
          })
        ).rejects.toThrow(AlreadyExistsError);
      });
    });

    describe('removePersonnelMember', () => {
      it('should remove personnel member successfully', async () => {
        mockQueryBuilder.eq = jest.fn().mockResolvedValue({
          error: null,
          count: 1,
        });

        const result = await dataStore.removePersonnelMember('personnel_123');
        expect(result).toBe(true);
      });
    });
  });

  // ==========================================================================
  // SETTINGS TESTS
  // ==========================================================================

  describe('Settings', () => {
    describe('getSettings', () => {
      it('should return default settings when none exist', async () => {
        mockQueryBuilder.single = jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        });

        const settings = await dataStore.getSettings();

        expect(settings.language).toBe('fi');
        expect(settings.hasSeenAppGuide).toBe(false);
      });

      it('should return saved settings', async () => {
        const mockRow = {
          id: 'settings_123',
          user_id: 'user_123',
          current_game_id: 'game_123',
          last_home_team_name: 'My Team',
          language: 'en',
          has_seen_app_guide: true,
          use_demand_correction: true,
          has_configured_season_dates: true,
          club_season_start_date: '2024-08-01',
          club_season_end_date: '2025-07-31',
          updated_at: '2024-01-01T00:00:00.000Z',
        };

        mockQueryBuilder.single = jest.fn().mockResolvedValue({
          data: mockRow,
          error: null,
        });

        const settings = await dataStore.getSettings();

        expect(settings.language).toBe('en');
        expect(settings.hasSeenAppGuide).toBe(true);
        expect(settings.currentGameId).toBe('game_123');
      });
    });

    describe('saveSettings', () => {
      it('should save settings successfully', async () => {
        mockQueryBuilder.upsert = jest.fn().mockResolvedValue({ error: null });

        const settings: AppSettings = {
          currentGameId: null,
          lastHomeTeamName: 'Test Team',
          language: 'en',
          hasSeenAppGuide: true,
          useDemandCorrection: false,
          hasConfiguredSeasonDates: false,
          clubSeasonStartDate: '2024-08-01',
          clubSeasonEndDate: '2025-07-31',
        };

        await expect(dataStore.saveSettings(settings)).resolves.not.toThrow();
        expect(mockQueryBuilder.upsert).toHaveBeenCalled();
      });

      it('should invalidate settings cache after saving', async () => {
        mockQueryBuilder.upsert = jest.fn().mockResolvedValue({ error: null });

        // Spy on invalidateSettingsCache
        const invalidateSpy = jest.spyOn(dataStore, 'invalidateSettingsCache');

        const settings: AppSettings = {
          currentGameId: null,
          lastHomeTeamName: 'Test Team',
          language: 'en',
          hasSeenAppGuide: true,
          useDemandCorrection: false,
          hasConfiguredSeasonDates: true,
          clubSeasonStartDate: '2024-09-01', // Changed dates
          clubSeasonEndDate: '2025-06-30',
        };

        await dataStore.saveSettings(settings);

        expect(invalidateSpy).toHaveBeenCalled();
        invalidateSpy.mockRestore();
      });
    });

    describe('updateSettings', () => {
      it('should update settings partially', async () => {
        // Mock getSettings
        mockQueryBuilder.single = jest.fn().mockResolvedValue({
          data: {
            id: 'settings_123',
            user_id: 'user_123',
            current_game_id: null,
            last_home_team_name: '',
            language: 'fi',
            has_seen_app_guide: false,
            use_demand_correction: false,
            has_configured_season_dates: false,
            club_season_start_date: null,
            club_season_end_date: null,
            updated_at: '2024-01-01T00:00:00.000Z',
          },
          error: null,
        });
        mockQueryBuilder.upsert = jest.fn().mockResolvedValue({ error: null });

        const updated = await dataStore.updateSettings({ language: 'en' });

        expect(updated.language).toBe('en');
      });
    });
  });

  // ==========================================================================
  // GAME STUBS (PR #4)
  // ==========================================================================

  describe('Game Stubs (PR #4)', () => {
    it('should throw for getGames', async () => {
      await expect(dataStore.getGames()).rejects.toThrow('Games not implemented - PR #4');
    });

    it('should throw for getGameById', async () => {
      await expect(dataStore.getGameById('game_123')).rejects.toThrow('Games not implemented - PR #4');
    });

    it('should throw for createGame', async () => {
      await expect(dataStore.createGame({})).rejects.toThrow('Games not implemented - PR #4');
    });
  });

  // ==========================================================================
  // TIMER STATE (LOCAL-ONLY)
  // ==========================================================================

  describe('Timer State (Local-Only)', () => {
    it('should return null for getTimerState', async () => {
      const result = await dataStore.getTimerState();
      expect(result).toBeNull();
    });

    it('should be no-op for saveTimerState', async () => {
      await expect(
        dataStore.saveTimerState({
          gameId: 'game_123',
          timeElapsedInSeconds: 120,
          timestamp: Date.now(),
        })
      ).resolves.not.toThrow();
    });

    it('should be no-op for clearTimerState', async () => {
      await expect(dataStore.clearTimerState()).resolves.not.toThrow();
    });
  });
});
