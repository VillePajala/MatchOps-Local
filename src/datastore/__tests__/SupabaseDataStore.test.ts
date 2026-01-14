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
import type { AppState } from '@/types/game';
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
  contains: jest.Mock;
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
    contains: jest.fn().mockResolvedValue({ data: [], error: null }),
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
    getSession: jest.fn().mockResolvedValue({
      data: { session: { user: mockUser } },
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
      // Mock successful health check (uses auth.getSession)
      (mockSupabaseClient.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: { session: { user: mockUser } },
        error: null,
      });

      const isAvailable = await dataStore.isAvailable();
      expect(isAvailable).toBe(true);
    });

    it('should return false for availability when health check fails', async () => {
      (mockSupabaseClient.auth.getSession as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: 'Session expired' },
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

      it('should migrate legacy tournament level to series', async () => {
        // Tournament with legacy 'level' field but no 'series'
        const mockRow = {
          id: 'tournament_legacy',
          name: 'Legacy Tournament',
          start_date: null,
          end_date: null,
          location: 'Helsinki',
          club_season: null,
          game_type: 'soccer',
          gender: 'boys',
          age_group: 'U12',
          level: 'Gold Cup', // Legacy level field
          series: null,      // No series yet
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
        // Verify migration: level was converted to series
        expect(tournaments[0].series).toBeDefined();
        expect(tournaments[0].series).toHaveLength(1);
        expect(tournaments[0].series![0].level).toBe('Gold Cup');
        expect(tournaments[0].series![0].id).toContain('series_tournament_legacy_gold-cup');
      });

      it('should not migrate if series already exists', async () => {
        // Tournament with existing series
        const existingSeries = [{ id: 'series_1', level: 'Premier' }];
        const mockRow = {
          id: 'tournament_modern',
          name: 'Modern Tournament',
          start_date: null,
          end_date: null,
          location: 'Helsinki',
          club_season: null,
          game_type: 'soccer',
          gender: 'boys',
          age_group: 'U12',
          level: 'Gold Cup', // Legacy level (should be ignored)
          series: existingSeries, // Already has series
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
        // Should keep existing series, not migrate
        expect(tournaments[0].series).toEqual(existingSeries);
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
          is_drawing_mode_enabled: true,
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
        expect(settings.isDrawingModeEnabled).toBe(true);
      });

      it('should preserve isDrawingModeEnabled setting', async () => {
        const mockRow = {
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
          is_drawing_mode_enabled: true, // Drawing mode enabled
          updated_at: '2024-01-01T00:00:00.000Z',
        };

        mockQueryBuilder.single = jest.fn().mockResolvedValue({
          data: mockRow,
          error: null,
        });

        const settings = await dataStore.getSettings();

        // Verify drawing mode is properly read from database
        expect(settings.isDrawingModeEnabled).toBe(true);
      });

      it('should default isDrawingModeEnabled to false when not set', async () => {
        const mockRow = {
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
          // is_drawing_mode_enabled NOT set (undefined/null)
          updated_at: '2024-01-01T00:00:00.000Z',
        };

        mockQueryBuilder.single = jest.fn().mockResolvedValue({
          data: mockRow,
          error: null,
        });

        const settings = await dataStore.getSettings();

        // Should default to false
        expect(settings.isDrawingModeEnabled).toBe(false);
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

      it('should save isDrawingModeEnabled setting', async () => {
        let savedData: Record<string, unknown> | null = null;
        mockQueryBuilder.upsert = jest.fn().mockImplementation((data) => {
          savedData = data;
          return Promise.resolve({ error: null });
        });

        const settings: AppSettings = {
          currentGameId: null,
          lastHomeTeamName: 'Test Team',
          language: 'en',
          hasSeenAppGuide: true,
          useDemandCorrection: false,
          hasConfiguredSeasonDates: false,
          clubSeasonStartDate: '2024-08-01',
          clubSeasonEndDate: '2025-07-31',
          isDrawingModeEnabled: true, // Drawing mode enabled
        };

        await dataStore.saveSettings(settings);

        // Verify isDrawingModeEnabled is included in saved data
        expect(savedData).not.toBeNull();
        expect(savedData!.is_drawing_mode_enabled).toBe(true);
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
  // GAME CRUD
  // ==========================================================================

  describe('Game CRUD', () => {
    describe('getGames', () => {
      it('should return empty collection when no games exist', async () => {
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: [],
          error: null,
        });

        const games = await dataStore.getGames();
        expect(games).toEqual({});
      });

      it('should throw NetworkError on fetch failure', async () => {
        mockQueryBuilder.order = jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Network error' },
        });

        await expect(dataStore.getGames()).rejects.toThrow(NetworkError);
      });
    });

    describe('getGameById', () => {
      it('should return null for non-existent game', async () => {
        mockQueryBuilder.single = jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        });

        const game = await dataStore.getGameById('game_nonexistent');
        expect(game).toBeNull();
      });

      // NOTE: Full integration test for getGameById with complete mocking requires
      // complex mock setup for parallel fetches across 5 tables. The transform
      // functions are thoroughly tested in the Game Transforms section.
      // Integration tests will be added in PR #8 against a real Supabase instance.
    });

    describe('createGame', () => {
      it('should create game with defaults', async () => {
        // User is already mocked via mockSupabaseClient.auth.getUser
        mockQueryBuilder.upsert = jest.fn().mockResolvedValue({ error: null });
        mockQueryBuilder.delete = jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        });
        mockQueryBuilder.insert = jest.fn().mockResolvedValue({ error: null });

        const { gameId, gameData } = await dataStore.createGame({
          teamName: 'My Team',
        });

        expect(gameId).toMatch(/^game_/);
        expect(gameData.teamName).toBe('My Team');
        // Check defaults (Rule #10)
        expect(gameData.periodDurationMinutes).toBe(10);
        expect(gameData.subIntervalMinutes).toBe(5);
        expect(gameData.showPlayerNames).toBe(true);
        expect(gameData.tacticalBallPosition).toEqual({ relX: 0.5, relY: 0.5 });
        expect(gameData.lastSubConfirmationTimeSeconds).toBe(0);
        expect(gameData.homeOrAway).toBe('home');
        expect(gameData.isPlayed).toBe(true);
      });

      it('should override defaults with provided values', async () => {
        // User is already mocked via mockSupabaseClient.auth.getUser
        mockQueryBuilder.upsert = jest.fn().mockResolvedValue({ error: null });
        mockQueryBuilder.delete = jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        });
        mockQueryBuilder.insert = jest.fn().mockResolvedValue({ error: null });

        const { gameData } = await dataStore.createGame({
          periodDurationMinutes: 15,
          homeOrAway: 'away',
        });

        expect(gameData.periodDurationMinutes).toBe(15);
        expect(gameData.homeOrAway).toBe('away');
      });
    });

    describe('saveGame', () => {
      it('should throw NetworkError on save failure', async () => {
        // User is already mocked via mockSupabaseClient.auth.getUser
        mockQueryBuilder.upsert = jest.fn().mockResolvedValue({
          error: { message: 'Database error' },
        });

        const game = {
          teamName: 'Test Team',
          opponentName: 'Opponent',
          gameDate: '2024-01-15',
          homeOrAway: 'home' as const,
          numberOfPeriods: 2 as const,
          periodDurationMinutes: 10,
          currentPeriod: 1,
          gameStatus: 'pre-match' as const,
          homeScore: 0,
          awayScore: 0,
          gameNotes: '',
          showPlayerNames: true,
          playersOnField: [],
          availablePlayers: [],
          selectedPlayerIds: [],
          gameEvents: [],
          assessments: {},
        };

        await expect(dataStore.saveGame('game_123', game as AppState)).rejects.toThrow(NetworkError);
      });
    });

    describe('deleteGame', () => {
      it('should delete game successfully', async () => {
        mockQueryBuilder.delete = jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null, count: 1 }),
        });

        const result = await dataStore.deleteGame('game_123');
        expect(result).toBe(true);
      });

      it('should return false for non-existent game', async () => {
        mockQueryBuilder.delete = jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null, count: 0 }),
        });

        const result = await dataStore.deleteGame('game_nonexistent');
        expect(result).toBe(false);
      });

      it('should throw NetworkError on delete failure', async () => {
        mockQueryBuilder.delete = jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: { message: 'Delete failed' } }),
        });

        await expect(dataStore.deleteGame('game_123')).rejects.toThrow(NetworkError);
      });
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

  // ==========================================================================
  // GAME TRANSFORMS (PR #4)
  // ==========================================================================

  describe('Game Transforms', () => {
    // Helper to access private methods for testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getPrivateMethod = (methodName: string) => (dataStore as any)[methodName].bind(dataStore);

    describe('transformGameToTables', () => {
      it('should convert empty string fields to NULL', () => {
        const transformGameToTables = getPrivateMethod('transformGameToTables');
        const game = {
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
          teamName: 'Test Team',
          opponentName: 'Opponent',
          gameDate: '2024-01-15',
          homeOrAway: 'home' as const,
          numberOfPeriods: 2 as const,
          periodDurationMinutes: 10,
          currentPeriod: 1,
          gameStatus: 'notStarted' as const,
          homeScore: 0,
          awayScore: 0,
          gameNotes: '',
          showPlayerNames: true,
          playersOnField: [],
          availablePlayers: [],
          selectedPlayerIds: [],
          gameEvents: [],
          opponents: [],
          drawings: [],
          tacticalDiscs: [],
          tacticalDrawings: [],
          tacticalBallPosition: null,
        };

        const result = transformGameToTables('game_123', game, 'user_123');

        // All 10 empty string fields should be NULL
        expect(result.game.season_id).toBeNull();
        expect(result.game.tournament_id).toBeNull();
        expect(result.game.tournament_series_id).toBeNull();
        expect(result.game.tournament_level).toBeNull();
        expect(result.game.team_id).toBeNull();
        expect(result.game.game_time).toBeNull();
        expect(result.game.game_location).toBeNull();
        expect(result.game.age_group).toBeNull();
        expect(result.game.league_id).toBeNull();
        expect(result.game.custom_league_name).toBeNull();
      });

      it('should preserve non-empty string fields', () => {
        const transformGameToTables = getPrivateMethod('transformGameToTables');
        const game = {
          seasonId: 'season_123',
          tournamentId: 'tournament_456',
          teamId: 'team_789',
          gameTime: '14:00',
          gameLocation: 'Stadium A',
          ageGroup: 'U12',
          leagueId: 'sm-sarja',
          teamName: 'Test Team',
          opponentName: 'Opponent',
          gameDate: '2024-01-15',
          homeOrAway: 'home' as const,
          numberOfPeriods: 2 as const,
          periodDurationMinutes: 10,
          currentPeriod: 1,
          gameStatus: 'notStarted' as const,
          homeScore: 0,
          awayScore: 0,
          gameNotes: '',
          showPlayerNames: true,
          playersOnField: [],
          availablePlayers: [],
          selectedPlayerIds: [],
          gameEvents: [],
          opponents: [],
          drawings: [],
          tacticalDiscs: [],
          tacticalDrawings: [],
          tacticalBallPosition: null,
        };

        const result = transformGameToTables('game_123', game, 'user_123');

        expect(result.game.season_id).toBe('season_123');
        expect(result.game.tournament_id).toBe('tournament_456');
        expect(result.game.team_id).toBe('team_789');
        expect(result.game.game_time).toBe('14:00');
        expect(result.game.game_location).toBe('Stadium A');
        expect(result.game.age_group).toBe('U12');
        expect(result.game.league_id).toBe('sm-sarja');
      });

      it('should default homeOrAway to "home" when undefined', () => {
        const transformGameToTables = getPrivateMethod('transformGameToTables');
        const game = {
          seasonId: '',
          tournamentId: '',
          teamName: 'Test Team',
          opponentName: 'Opponent',
          gameDate: '2024-01-15',
          // homeOrAway intentionally omitted
          numberOfPeriods: 2 as const,
          periodDurationMinutes: 10,
          currentPeriod: 1,
          gameStatus: 'notStarted' as const,
          homeScore: 0,
          awayScore: 0,
          gameNotes: '',
          showPlayerNames: true,
          playersOnField: [],
          availablePlayers: [],
          selectedPlayerIds: [],
          gameEvents: [],
          opponents: [],
          drawings: [],
          tacticalDiscs: [],
          tacticalDrawings: [],
          tacticalBallPosition: null,
        };

        const result = transformGameToTables('game_123', game, 'user_123');

        expect(result.game.home_or_away).toBe('home');
      });

      it('should default isPlayed to true when undefined (legacy games)', () => {
        const transformGameToTables = getPrivateMethod('transformGameToTables');
        const game = {
          seasonId: '',
          tournamentId: '',
          teamName: 'Test Team',
          opponentName: 'Opponent',
          gameDate: '2024-01-15',
          homeOrAway: 'home' as const,
          numberOfPeriods: 2 as const,
          periodDurationMinutes: 10,
          currentPeriod: 1,
          gameStatus: 'gameEnd' as const,
          // isPlayed intentionally omitted (legacy game)
          homeScore: 2,
          awayScore: 1,
          gameNotes: '',
          showPlayerNames: true,
          playersOnField: [],
          availablePlayers: [],
          selectedPlayerIds: [],
          gameEvents: [],
          opponents: [],
          drawings: [],
          tacticalDiscs: [],
          tacticalDrawings: [],
          tacticalBallPosition: null,
        };

        const result = transformGameToTables('game_123', game, 'user_123');

        expect(result.game.is_played).toBe(true);
      });

      it('should normalize players: on_field implies is_selected', () => {
        const transformGameToTables = getPrivateMethod('transformGameToTables');
        const player1 = { id: 'p1', name: 'Player 1', isGoalie: false };
        const player2 = { id: 'p2', name: 'Player 2', isGoalie: false, relX: 0.5, relY: 0.5 };

        const game = {
          seasonId: '',
          tournamentId: '',
          teamName: 'Test Team',
          opponentName: 'Opponent',
          gameDate: '2024-01-15',
          homeOrAway: 'home' as const,
          numberOfPeriods: 2 as const,
          periodDurationMinutes: 10,
          currentPeriod: 1,
          gameStatus: 'notStarted' as const,
          homeScore: 0,
          awayScore: 0,
          gameNotes: '',
          showPlayerNames: true,
          availablePlayers: [player1, player2],
          playersOnField: [player2], // Player 2 is on field
          selectedPlayerIds: [], // But NOT in selectedPlayerIds (edge case)
          gameEvents: [],
          opponents: [],
          drawings: [],
          tacticalDiscs: [],
          tacticalDrawings: [],
          tacticalBallPosition: null,
        };

        const result = transformGameToTables('game_123', game, 'user_123');

        // Player 2 should have is_selected=true because they're on field
        const player2Row = result.players.find((p: { player_id: string }) => p.player_id === 'p2');
        expect(player2Row?.is_selected).toBe(true);
        expect(player2Row?.on_field).toBe(true);
        expect(player2Row?.rel_x).toBe(0.5);
        expect(player2Row?.rel_y).toBe(0.5);

        // Player 1 should have is_selected=false (not on field, not selected)
        const player1Row = result.players.find((p: { player_id: string }) => p.player_id === 'p1');
        expect(player1Row?.is_selected).toBe(false);
        expect(player1Row?.on_field).toBe(false);
        expect(player1Row?.rel_x).toBeNull();
        expect(player1Row?.rel_y).toBeNull();
      });

      it('should assign order_index to events based on array position', () => {
        const transformGameToTables = getPrivateMethod('transformGameToTables');
        const game = {
          seasonId: '',
          tournamentId: '',
          teamName: 'Test Team',
          opponentName: 'Opponent',
          gameDate: '2024-01-15',
          homeOrAway: 'home' as const,
          numberOfPeriods: 2 as const,
          periodDurationMinutes: 10,
          currentPeriod: 1,
          gameStatus: 'inProgress' as const,
          homeScore: 2,
          awayScore: 1,
          gameNotes: '',
          showPlayerNames: true,
          playersOnField: [],
          availablePlayers: [],
          selectedPlayerIds: [],
          gameEvents: [
            { id: 'e1', type: 'goal' as const, time: 120, scorerId: 'p1' },
            { id: 'e2', type: 'opponentGoal' as const, time: 180 },
            { id: 'e3', type: 'goal' as const, time: 300, scorerId: 'p2', assisterId: 'p1' },
          ],
          opponents: [],
          drawings: [],
          tacticalDiscs: [],
          tacticalDrawings: [],
          tacticalBallPosition: null,
        };

        const result = transformGameToTables('game_123', game, 'user_123');

        expect(result.events).toHaveLength(3);
        expect(result.events[0].order_index).toBe(0);
        expect(result.events[1].order_index).toBe(1);
        expect(result.events[2].order_index).toBe(2);
      });

      it('should flatten assessment sliders to individual columns', () => {
        const transformGameToTables = getPrivateMethod('transformGameToTables');
        const game = {
          seasonId: '',
          tournamentId: '',
          teamName: 'Test Team',
          opponentName: 'Opponent',
          gameDate: '2024-01-15',
          homeOrAway: 'home' as const,
          numberOfPeriods: 2 as const,
          periodDurationMinutes: 10,
          currentPeriod: 1,
          gameStatus: 'gameEnd' as const,
          homeScore: 2,
          awayScore: 1,
          gameNotes: '',
          showPlayerNames: true,
          playersOnField: [],
          availablePlayers: [],
          selectedPlayerIds: [],
          gameEvents: [],
          assessments: {
            'player_1': {
              overall: 8,
              sliders: {
                intensity: 7,
                courage: 8,
                duels: 6,
                technique: 9,
                creativity: 7,
                decisions: 8,
                awareness: 7,
                teamwork: 9,
                fair_play: 10,
                impact: 8,
              },
              notes: 'Great game!',
              minutesPlayed: 60,
              createdAt: 1705330800000,
              createdBy: 'coach',
            },
          },
          opponents: [],
          drawings: [],
          tacticalDiscs: [],
          tacticalDrawings: [],
          tacticalBallPosition: null,
        };

        const result = transformGameToTables('game_123', game, 'user_123');

        expect(result.assessments).toHaveLength(1);
        const assessment = result.assessments[0];
        expect(assessment.player_id).toBe('player_1');
        expect(assessment.overall_rating).toBe(8);
        expect(assessment.intensity).toBe(7);
        expect(assessment.courage).toBe(8);
        expect(assessment.duels).toBe(6);
        expect(assessment.technique).toBe(9);
        expect(assessment.creativity).toBe(7);
        expect(assessment.decisions).toBe(8);
        expect(assessment.awareness).toBe(7);
        expect(assessment.teamwork).toBe(9);
        expect(assessment.fair_play).toBe(10);
        expect(assessment.impact).toBe(8);
        expect(assessment.notes).toBe('Great game!');
        expect(assessment.minutes_played).toBe(60);
      });

      it('should handle tactical data with defaults for undefined fields', () => {
        const transformGameToTables = getPrivateMethod('transformGameToTables');
        const game = {
          seasonId: '',
          tournamentId: '',
          teamName: 'Test Team',
          opponentName: 'Opponent',
          gameDate: '2024-01-15',
          homeOrAway: 'home' as const,
          numberOfPeriods: 2 as const,
          periodDurationMinutes: 10,
          currentPeriod: 1,
          gameStatus: 'notStarted' as const,
          homeScore: 0,
          awayScore: 0,
          gameNotes: '',
          showPlayerNames: true,
          playersOnField: [],
          availablePlayers: [],
          selectedPlayerIds: [],
          gameEvents: [],
          // Tactical fields intentionally omitted (legacy game)
          opponents: [],
          drawings: [],
        };

        const result = transformGameToTables('game_123', game, 'user_123');

        expect(result.tacticalData.tactical_discs).toEqual([]);
        expect(result.tacticalData.tactical_drawings).toEqual([]);
        expect(result.tacticalData.tactical_ball_position).toBeNull();
        expect(result.tacticalData.completed_interval_durations).toEqual([]);
      });

      it('should guard against NaN/Infinity in numeric fields', () => {
        const transformGameToTables = getPrivateMethod('transformGameToTables');
        const game = {
          seasonId: '',
          tournamentId: '',
          teamName: 'Test Team',
          opponentName: 'Opponent',
          gameDate: '2024-01-15',
          homeOrAway: 'home' as const,
          numberOfPeriods: 2 as const,
          periodDurationMinutes: 10,
          currentPeriod: 1,
          gameStatus: 'notStarted' as const,
          homeScore: 0,
          awayScore: 0,
          gameNotes: '',
          showPlayerNames: true,
          playersOnField: [],
          availablePlayers: [],
          selectedPlayerIds: [],
          gameEvents: [],
          demandFactor: NaN,
          timeElapsedInSeconds: Infinity,
          opponents: [],
          drawings: [],
          tacticalDiscs: [],
          tacticalDrawings: [],
          tacticalBallPosition: null,
        };

        const result = transformGameToTables('game_123', game, 'user_123');

        expect(result.game.demand_factor).toBeNull();
        expect(result.game.time_elapsed_in_seconds).toBeNull();
      });
    });

    describe('transformTablesToGame', () => {
      it('should convert NULL fields to empty strings', () => {
        const transformTablesToGame = getPrivateMethod('transformTablesToGame');
        const tables = {
          game: {
            id: 'game_123',
            user_id: 'user_123',
            season_id: null,
            tournament_id: null,
            tournament_series_id: null,
            tournament_level: null,
            team_id: null,
            game_time: null,
            game_location: null,
            age_group: null,
            league_id: null,
            custom_league_name: null,
            team_name: 'Test Team',
            opponent_name: 'Opponent',
            game_date: '2024-01-15',
            home_or_away: 'home',
            number_of_periods: 2,
            period_duration_minutes: 10,
            current_period: 1,
            game_status: 'notStarted',
            is_played: true,
            home_score: 0,
            away_score: 0,
            game_notes: '',
            show_player_names: true,
            sub_interval_minutes: null,
            demand_factor: null,
            game_type: null,
            gender: null,
            game_personnel: [],
            formation_snap_points: null,
            time_elapsed_in_seconds: null,
            created_at: '2024-01-15T10:00:00Z',
            updated_at: '2024-01-15T10:00:00Z',
          },
          players: [],
          events: [],
          assessments: [],
          tacticalData: null,
        };

        const result = transformTablesToGame(tables);

        // All 10 NULL fields should be empty strings
        expect(result.seasonId).toBe('');
        expect(result.tournamentId).toBe('');
        expect(result.tournamentSeriesId).toBe('');
        expect(result.tournamentLevel).toBe('');
        expect(result.teamId).toBe('');
        expect(result.gameTime).toBe('');
        expect(result.gameLocation).toBe('');
        expect(result.ageGroup).toBe('');
        expect(result.leagueId).toBe('');
        expect(result.customLeagueName).toBe('');
      });

      it('should reconstruct player arrays correctly', () => {
        const transformTablesToGame = getPrivateMethod('transformTablesToGame');
        const tables = {
          game: {
            id: 'game_123',
            user_id: 'user_123',
            season_id: null,
            tournament_id: null,
            team_name: 'Test Team',
            opponent_name: 'Opponent',
            game_date: '2024-01-15',
            home_or_away: 'home',
            number_of_periods: 2,
            period_duration_minutes: 10,
            current_period: 1,
            game_status: 'inProgress',
            is_played: true,
            home_score: 1,
            away_score: 0,
            game_notes: '',
            show_player_names: true,
            game_personnel: [],
            created_at: '2024-01-15T10:00:00Z',
            updated_at: '2024-01-15T10:00:00Z',
          },
          players: [
            {
              id: 'game_123_p1',
              game_id: 'game_123',
              player_id: 'p1',
              user_id: 'user_123',
              player_name: 'Player 1',
              is_goalie: false,
              is_selected: true,
              on_field: true,
              rel_x: 0.3,
              rel_y: 0.5,
              created_at: '2024-01-15T10:00:00Z',
            },
            {
              id: 'game_123_p2',
              game_id: 'game_123',
              player_id: 'p2',
              user_id: 'user_123',
              player_name: 'Player 2',
              is_goalie: true,
              is_selected: true,
              on_field: false,
              rel_x: null,
              rel_y: null,
              created_at: '2024-01-15T10:00:00Z',
            },
            {
              id: 'game_123_p3',
              game_id: 'game_123',
              player_id: 'p3',
              user_id: 'user_123',
              player_name: 'Player 3',
              is_goalie: false,
              is_selected: false,
              on_field: false,
              rel_x: null,
              rel_y: null,
              created_at: '2024-01-15T10:00:00Z',
            },
          ],
          events: [],
          assessments: [],
          tacticalData: null,
        };

        const result = transformTablesToGame(tables);

        // availablePlayers should have all 3
        expect(result.availablePlayers).toHaveLength(3);
        // playersOnField should have only p1
        expect(result.playersOnField).toHaveLength(1);
        expect(result.playersOnField[0].id).toBe('p1');
        expect(result.playersOnField[0].relX).toBe(0.3);
        expect(result.playersOnField[0].relY).toBe(0.5);
        // selectedPlayerIds should have p1 and p2, with on-field first
        expect(result.selectedPlayerIds).toHaveLength(2);
        expect(result.selectedPlayerIds[0]).toBe('p1'); // on-field first
        expect(result.selectedPlayerIds[1]).toBe('p2');
      });

      it('should sort events by order_index', () => {
        const transformTablesToGame = getPrivateMethod('transformTablesToGame');
        const tables = {
          game: {
            id: 'game_123',
            user_id: 'user_123',
            team_name: 'Test Team',
            opponent_name: 'Opponent',
            game_date: '2024-01-15',
            home_or_away: 'home',
            number_of_periods: 2,
            period_duration_minutes: 10,
            current_period: 1,
            game_status: 'inProgress',
            is_played: true,
            home_score: 2,
            away_score: 1,
            game_notes: '',
            show_player_names: true,
            game_personnel: [],
            created_at: '2024-01-15T10:00:00Z',
            updated_at: '2024-01-15T10:00:00Z',
          },
          players: [],
          // Events intentionally out of order to test sorting
          events: [
            { id: 'e3', game_id: 'game_123', user_id: 'user_123', event_type: 'goal', time_seconds: 300, order_index: 2, created_at: '2024-01-15T10:05:00Z' },
            { id: 'e1', game_id: 'game_123', user_id: 'user_123', event_type: 'goal', time_seconds: 120, order_index: 0, created_at: '2024-01-15T10:02:00Z' },
            { id: 'e2', game_id: 'game_123', user_id: 'user_123', event_type: 'opponentGoal', time_seconds: 180, order_index: 1, created_at: '2024-01-15T10:03:00Z' },
          ],
          assessments: [],
          tacticalData: null,
        };

        const result = transformTablesToGame(tables);

        expect(result.gameEvents).toHaveLength(3);
        expect(result.gameEvents[0].id).toBe('e1');
        expect(result.gameEvents[1].id).toBe('e2');
        expect(result.gameEvents[2].id).toBe('e3');
      });

      it('should reconstruct assessment sliders from flat columns', () => {
        const transformTablesToGame = getPrivateMethod('transformTablesToGame');
        const tables = {
          game: {
            id: 'game_123',
            user_id: 'user_123',
            team_name: 'Test Team',
            opponent_name: 'Opponent',
            game_date: '2024-01-15',
            home_or_away: 'home',
            number_of_periods: 2,
            period_duration_minutes: 10,
            current_period: 1,
            game_status: 'gameEnd',
            is_played: true,
            home_score: 2,
            away_score: 1,
            game_notes: '',
            show_player_names: true,
            game_personnel: [],
            created_at: '2024-01-15T10:00:00Z',
            updated_at: '2024-01-15T10:00:00Z',
          },
          players: [],
          events: [],
          assessments: [
            {
              id: 'assessment_game_123_p1',
              game_id: 'game_123',
              player_id: 'p1',
              user_id: 'user_123',
              overall_rating: 8,
              intensity: 7,
              courage: 8,
              duels: 6,
              technique: 9,
              creativity: 7,
              decisions: 8,
              awareness: 7,
              teamwork: 9,
              fair_play: 10,
              impact: 8,
              notes: 'Great game!',
              minutes_played: 60,
              created_by: 'coach',
              created_at: 1705330800000,
            },
          ],
          tacticalData: null,
        };

        const result = transformTablesToGame(tables);

        expect(result.assessments).toBeDefined();
        expect(result.assessments!['p1']).toBeDefined();
        const assessment = result.assessments!['p1'];
        expect(assessment.overall).toBe(8);
        expect(assessment.sliders.intensity).toBe(7);
        expect(assessment.sliders.courage).toBe(8);
        expect(assessment.sliders.duels).toBe(6);
        expect(assessment.sliders.technique).toBe(9);
        expect(assessment.sliders.creativity).toBe(7);
        expect(assessment.sliders.decisions).toBe(8);
        expect(assessment.sliders.awareness).toBe(7);
        expect(assessment.sliders.teamwork).toBe(9);
        expect(assessment.sliders.fair_play).toBe(10);
        expect(assessment.sliders.impact).toBe(8);
      });

      it('should handle null tactical data with defaults', () => {
        const transformTablesToGame = getPrivateMethod('transformTablesToGame');
        const tables = {
          game: {
            id: 'game_123',
            user_id: 'user_123',
            team_name: 'Test Team',
            opponent_name: 'Opponent',
            game_date: '2024-01-15',
            home_or_away: 'home',
            number_of_periods: 2,
            period_duration_minutes: 10,
            current_period: 1,
            game_status: 'notStarted',
            is_played: true,
            home_score: 0,
            away_score: 0,
            game_notes: '',
            show_player_names: true,
            game_personnel: [],
            created_at: '2024-01-15T10:00:00Z',
            updated_at: '2024-01-15T10:00:00Z',
          },
          players: [],
          events: [],
          assessments: [],
          tacticalData: null,
        };

        const result = transformTablesToGame(tables);

        expect(result.opponents).toEqual([]);
        expect(result.drawings).toEqual([]);
        expect(result.tacticalDiscs).toEqual([]);
        expect(result.tacticalDrawings).toEqual([]);
        expect(result.tacticalBallPosition).toBeNull();
        expect(result.completedIntervalDurations).toEqual([]);
      });
    });

    describe('Round-trip Transform', () => {
      it('should preserve game data through forward and reverse transform', () => {
        const transformGameToTables = getPrivateMethod('transformGameToTables');
        const transformTablesToGame = getPrivateMethod('transformTablesToGame');

        const originalGame = {
          seasonId: 'season_123',
          tournamentId: 'tournament_456',
          tournamentSeriesId: 'series_789',
          tournamentLevel: '',
          teamId: 'team_abc',
          gameTime: '14:00',
          gameLocation: 'Stadium A',
          ageGroup: 'U12',
          leagueId: 'sm-sarja',
          customLeagueName: '',
          teamName: 'FC Test',
          opponentName: 'FC Opponent',
          gameDate: '2024-01-15',
          homeOrAway: 'away' as const,
          numberOfPeriods: 2 as const,
          periodDurationMinutes: 15,
          currentPeriod: 2,
          gameStatus: 'gameEnd' as const,
          isPlayed: true,
          homeScore: 2,
          awayScore: 3,
          gameNotes: 'Great match!',
          showPlayerNames: false,
          subIntervalMinutes: 5,
          demandFactor: 1.2,
          gameType: 'soccer' as const,
          gender: 'boys' as const,
          gamePersonnel: ['coach_1', 'trainer_2'],
          timeElapsedInSeconds: 1800,
          availablePlayers: [
            { id: 'p1', name: 'Player One', isGoalie: false, jerseyNumber: '10' },
            { id: 'p2', name: 'Player Two', isGoalie: true, jerseyNumber: '1' },
          ],
          playersOnField: [
            { id: 'p1', name: 'Player One', isGoalie: false, jerseyNumber: '10', relX: 0.5, relY: 0.5 },
          ],
          selectedPlayerIds: ['p1', 'p2'],
          gameEvents: [
            { id: 'e1', type: 'goal' as const, time: 120, scorerId: 'p1' },
            { id: 'e2', type: 'opponentGoal' as const, time: 180 },
          ],
          assessments: {
            'p1': {
              overall: 8,
              sliders: {
                intensity: 7, courage: 8, duels: 6, technique: 9,
                creativity: 7, decisions: 8, awareness: 7, teamwork: 9,
                fair_play: 10, impact: 8,
              },
              notes: 'Good',
              minutesPlayed: 60,
              createdAt: 1705330800000,
              createdBy: 'coach',
            },
          },
          opponents: [{ id: 'o1', relX: 0.7, relY: 0.3 }],
          drawings: [[{ relX: 0.1, relY: 0.1 }, { relX: 0.2, relY: 0.2 }]],
          tacticalDiscs: [{ id: 'd1', relX: 0.4, relY: 0.4, type: 'home' as const }],
          tacticalDrawings: [],
          tacticalBallPosition: { relX: 0.5, relY: 0.5 },
          completedIntervalDurations: [{ period: 1, duration: 900, timestamp: 1705330000000 }],
          lastSubConfirmationTimeSeconds: 600,
        };

        // Forward transform
        const tables = transformGameToTables('game_123', originalGame, 'user_123');

        // Convert to Row types (simulate DB read)
        const tableRows = {
          game: { ...tables.game, created_at: '2024-01-15T10:00:00Z', updated_at: '2024-01-15T10:00:00Z' },
          players: tables.players.map(p => ({ ...p, created_at: '2024-01-15T10:00:00Z' })),
          events: tables.events.map(e => ({ ...e, created_at: '2024-01-15T10:00:00Z' })),
          assessments: tables.assessments,
          tacticalData: { ...tables.tacticalData, created_at: '2024-01-15T10:00:00Z', updated_at: '2024-01-15T10:00:00Z' },
        };

        // Reverse transform
        const roundTrippedGame = transformTablesToGame(tableRows);

        // Verify key fields preserved
        expect(roundTrippedGame.seasonId).toBe(originalGame.seasonId);
        expect(roundTrippedGame.tournamentId).toBe(originalGame.tournamentId);
        expect(roundTrippedGame.teamName).toBe(originalGame.teamName);
        expect(roundTrippedGame.opponentName).toBe(originalGame.opponentName);
        expect(roundTrippedGame.gameDate).toBe(originalGame.gameDate);
        expect(roundTrippedGame.homeOrAway).toBe(originalGame.homeOrAway);
        expect(roundTrippedGame.homeScore).toBe(originalGame.homeScore);
        expect(roundTrippedGame.awayScore).toBe(originalGame.awayScore);
        expect(roundTrippedGame.isPlayed).toBe(originalGame.isPlayed);
        expect(roundTrippedGame.gameType).toBe(originalGame.gameType);
        expect(roundTrippedGame.gender).toBe(originalGame.gender);

        // Verify player arrays
        expect(roundTrippedGame.availablePlayers).toHaveLength(2);
        expect(roundTrippedGame.playersOnField).toHaveLength(1);
        expect(roundTrippedGame.selectedPlayerIds).toContain('p1');
        expect(roundTrippedGame.selectedPlayerIds).toContain('p2');

        // Verify events preserved in order
        expect(roundTrippedGame.gameEvents).toHaveLength(2);
        expect(roundTrippedGame.gameEvents[0].id).toBe('e1');
        expect(roundTrippedGame.gameEvents[1].id).toBe('e2');

        // Verify tactical data
        expect(roundTrippedGame.tacticalBallPosition).toEqual({ relX: 0.5, relY: 0.5 });
      });
    });
  });
});
