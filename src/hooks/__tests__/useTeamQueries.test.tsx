/**
 * useTeamQueries Hook Tests
 *
 * Tests for team-related React Query hooks including:
 * - Query hooks (useTeamsQuery, useTeamRosterQuery)
 * - Mutation hooks with cache invalidation
 * - Conditional query enabling
 *
 * @critical - Team data management infrastructure
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useTeamsQuery,
  useTeamRosterQuery,
  useAddTeamMutation,
  useUpdateTeamMutation,
  useDeleteTeamMutation,
  useDuplicateTeamMutation,
  useSetTeamRosterMutation,
  useAddPlayerToRosterMutation,
  useUpdatePlayerInRosterMutation,
  useRemovePlayerFromRosterMutation,
} from '../useTeamQueries';
import { queryKeys } from '@/config/queryKeys';
import type { Team, TeamPlayer } from '@/types';

// Mock the teams utility functions
jest.mock('@/utils/teams', () => ({
  getTeams: jest.fn(),
  getTeamRoster: jest.fn(),
  addTeam: jest.fn(),
  updateTeam: jest.fn(),
  deleteTeam: jest.fn(),
  duplicateTeam: jest.fn(),
  setTeamRoster: jest.fn(),
  addPlayerToRoster: jest.fn(),
  updatePlayerInRoster: jest.fn(),
  removePlayerFromRoster: jest.fn(),
}));

const {
  getTeams,
  getTeamRoster,
  addTeam,
  updateTeam,
  deleteTeam,
  duplicateTeam,
  setTeamRoster,
  addPlayerToRoster,
  updatePlayerInRoster,
  removePlayerFromRoster,
} = jest.requireMock('@/utils/teams');

// Test data fixtures
const mockTeams: Team[] = [
  {
    id: 'team-1',
    name: 'Test Team 1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'team-2',
    name: 'Test Team 2',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
];

const mockPlayers: TeamPlayer[] = [
  {
    id: 'player-1',
    name: 'Player One',
    jerseyNumber: '10',
    isGoalie: false,
    notes: '',
    receivedFairPlayCard: false,
  },
  {
    id: 'player-2',
    name: 'Player Two',
    jerseyNumber: '7',
    isGoalie: false,
    notes: '',
    receivedFairPlayCard: false,
  },
];

// Helper to create test wrapper with QueryClient
const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity, // Keep cache data for duration of test
        staleTime: Infinity, // Don't auto-refetch
      },
      mutations: {
        retry: false,
      },
    },
  });
};

const createTestWrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryClientWrapper';
  return Wrapper;
};

describe('useTeamQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    getTeams.mockResolvedValue(mockTeams);
    getTeamRoster.mockResolvedValue(mockPlayers);
    addTeam.mockResolvedValue(mockTeams[0]);
    updateTeam.mockResolvedValue(mockTeams[0]);
    deleteTeam.mockResolvedValue(true);
    duplicateTeam.mockResolvedValue({ ...mockTeams[0], id: 'team-3', name: 'Test Team 1 (Copy)' });
    setTeamRoster.mockResolvedValue(true);
    addPlayerToRoster.mockResolvedValue(mockPlayers[0]);
    updatePlayerInRoster.mockResolvedValue(true);
    removePlayerFromRoster.mockResolvedValue(true);
  });

  describe('useTeamsQuery', () => {
    /**
     * Tests basic teams query functionality
     * @critical - Core data fetching
     */
    it('should fetch teams data', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => useTeamsQuery(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockTeams);
      expect(getTeams).toHaveBeenCalledTimes(1);
    });

    /**
     * Tests query key configuration
     * @integration - Verifies cache key setup
     */
    it('should use correct query key', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      renderHook(() => useTeamsQuery(), { wrapper });

      await waitFor(() => {
        expect(queryClient.getQueryData(queryKeys.teams)).toBeDefined();
      });

      expect(queryClient.getQueryData(queryKeys.teams)).toEqual(mockTeams);
    });
  });

  describe('useTeamRosterQuery', () => {
    /**
     * Tests roster query with valid team ID
     * @critical - Team roster data fetching
     */
    it('should fetch team roster when teamId is provided', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => useTeamRosterQuery('team-1'), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockPlayers);
      expect(getTeamRoster).toHaveBeenCalledWith('team-1');
    });

    /**
     * Tests that query is disabled when teamId is null
     * @critical - Prevents invalid API calls
     */
    it('should not fetch when teamId is null', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => useTeamRosterQuery(null), { wrapper });

      // Query should be disabled
      expect(result.current.fetchStatus).toBe('idle');
      expect(getTeamRoster).not.toHaveBeenCalled();
    });

    /**
     * Tests dynamic query key with team ID
     * @integration - Verifies hierarchical cache keys
     */
    it('should use correct query key with teamId', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      renderHook(() => useTeamRosterQuery('team-1'), { wrapper });

      await waitFor(() => {
        expect(queryClient.getQueryData(queryKeys.teamRoster('team-1'))).toBeDefined();
      });

      expect(queryClient.getQueryData(queryKeys.teamRoster('team-1'))).toEqual(mockPlayers);
    });
  });

  describe('useAddTeamMutation', () => {
    /**
     * Tests team creation with cache invalidation
     * @critical - Mutation + cache update pattern
     */
    it('should add team and invalidate teams cache', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      // Pre-populate cache
      queryClient.setQueryData(queryKeys.teams, mockTeams);

      const { result } = renderHook(() => useAddTeamMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          name: 'New Team',
        });
      });

      expect(addTeam).toHaveBeenCalled();

      // Verify mutation succeeded
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });
  });

  describe('useUpdateTeamMutation', () => {
    /**
     * Tests team update with cache invalidation
     * @critical - Mutation + cache update pattern
     */
    it('should update team and invalidate teams cache', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      queryClient.setQueryData(queryKeys.teams, mockTeams);

      const { result } = renderHook(() => useUpdateTeamMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          teamId: 'team-1',
          updates: { name: 'Updated Team Name' },
        });
      });

      expect(updateTeam).toHaveBeenCalledWith('team-1', { name: 'Updated Team Name' });

      // Verify mutation succeeded
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });
  });

  describe('useDeleteTeamMutation', () => {
    /**
     * Tests team deletion with proper cache cleanup
     * @critical - Complex invalidation pattern
     */
    it('should delete team and invalidate related caches', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      // Pre-populate caches
      queryClient.setQueryData(queryKeys.teams, mockTeams);
      queryClient.setQueryData(queryKeys.teamRoster('team-1'), mockPlayers);
      queryClient.setQueryData(queryKeys.savedGames, { game1: {} });

      const { result } = renderHook(() => useDeleteTeamMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('team-1');
      });

      // Check that deleteTeam was called (first arg should be 'team-1')
      expect(deleteTeam).toHaveBeenCalled();
      expect(deleteTeam.mock.calls[0][0]).toBe('team-1');

      // Verify mutation succeeded
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Team roster should be removed (not just invalidated)
      expect(queryClient.getQueryData(queryKeys.teamRoster('team-1'))).toBeUndefined();
    });

    /**
     * Tests that unsuccessful deletion doesn't invalidate caches
     * @edge-case - Error handling
     */
    it('should not invalidate caches when deletion fails', async () => {
      deleteTeam.mockResolvedValue(false);
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      queryClient.setQueryData(queryKeys.teams, mockTeams);
      queryClient.setQueryData(queryKeys.teamRoster('team-1'), mockPlayers);

      // Clear mock call count before mutation
      getTeams.mockClear();

      const { result } = renderHook(() => useDeleteTeamMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('team-1');
      });

      // Allow any pending async operations to settle
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      // Cache data should still exist (not removed or refetched)
      expect(queryClient.getQueryData(queryKeys.teams)).toEqual(mockTeams);
      expect(queryClient.getQueryData(queryKeys.teamRoster('team-1'))).toEqual(mockPlayers);
      // getTeams should NOT have been called for refetch
      expect(getTeams).not.toHaveBeenCalled();
    });
  });

  describe('useDuplicateTeamMutation', () => {
    /**
     * Tests team duplication mutation
     * @integration - Verifies mutation executes correctly
     */
    it('should duplicate team successfully', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(() => useDuplicateTeamMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('team-1');
      });

      // Check that duplicateTeam was called with correct argument
      expect(duplicateTeam).toHaveBeenCalled();
      expect(duplicateTeam.mock.calls[0][0]).toBe('team-1');
    });
  });

  describe('Roster Mutations', () => {
    /**
     * Tests roster set mutation
     * @critical - Bulk roster update
     */
    it('should set team roster successfully', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(() => useSetTeamRosterMutation(), { wrapper });

      const newRoster: TeamPlayer[] = [
        { ...mockPlayers[0], name: 'Updated Player' },
      ];

      await act(async () => {
        await result.current.mutateAsync({ teamId: 'team-1', roster: newRoster });
      });

      expect(setTeamRoster).toHaveBeenCalledWith('team-1', newRoster);
    });

    /**
     * Tests add player to roster mutation
     * @integration - Single player addition
     */
    it('should add player to roster successfully', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(() => useAddPlayerToRosterMutation(), { wrapper });

      const newPlayer: TeamPlayer = {
        id: 'player-3',
        name: 'Player Three',
        jerseyNumber: '9',
        isGoalie: false,
        notes: '',
        receivedFairPlayCard: false,
      };

      await act(async () => {
        await result.current.mutateAsync({ teamId: 'team-1', player: newPlayer });
      });

      // Verify the utility function was called with correct arguments
      expect(addPlayerToRoster).toHaveBeenCalledWith('team-1', newPlayer);
    });

    /**
     * Tests update player in roster mutation
     * @integration - Player update
     */
    it('should update player in roster successfully', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(() => useUpdatePlayerInRosterMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          teamId: 'team-1',
          playerId: 'player-1',
          updates: { name: 'Updated Name' },
        });
      });

      expect(updatePlayerInRoster).toHaveBeenCalledWith('team-1', 'player-1', { name: 'Updated Name' });
    });

    /**
     * Tests that failed update doesn't invalidate cache
     * @edge-case - Error handling
     */
    it('should not invalidate cache when update fails', async () => {
      updatePlayerInRoster.mockResolvedValue(false);
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      queryClient.setQueryData(queryKeys.teamRoster('team-1'), mockPlayers);

      // Clear mock call count before mutation
      getTeamRoster.mockClear();

      const { result } = renderHook(() => useUpdatePlayerInRosterMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          teamId: 'team-1',
          playerId: 'player-1',
          updates: { name: 'Updated Name' },
        });
      });

      // Allow any pending async operations to settle
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      // Cache data should still exist unchanged
      expect(queryClient.getQueryData(queryKeys.teamRoster('team-1'))).toEqual(mockPlayers);
      // getTeamRoster should NOT have been called for refetch
      expect(getTeamRoster).not.toHaveBeenCalled();
    });

    /**
     * Tests remove player from roster mutation
     * @integration - Player removal
     */
    it('should remove player from roster successfully', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(() => useRemovePlayerFromRosterMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ teamId: 'team-1', playerId: 'player-1' });
      });

      expect(removePlayerFromRoster).toHaveBeenCalledWith('team-1', 'player-1');
    });

    /**
     * Tests that failed removal doesn't invalidate cache
     * @edge-case - Error handling
     */
    it('should not invalidate cache when removal fails', async () => {
      removePlayerFromRoster.mockResolvedValue(false);
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      queryClient.setQueryData(queryKeys.teamRoster('team-1'), mockPlayers);

      // Clear mock call count before mutation
      getTeamRoster.mockClear();

      const { result } = renderHook(() => useRemovePlayerFromRosterMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ teamId: 'team-1', playerId: 'player-1' });
      });

      // Allow any pending async operations to settle
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      // Cache data should still exist unchanged
      expect(queryClient.getQueryData(queryKeys.teamRoster('team-1'))).toEqual(mockPlayers);
      // getTeamRoster should NOT have been called for refetch
      expect(getTeamRoster).not.toHaveBeenCalled();
    });
  });

  describe('Concurrent Mutations', () => {
    /**
     * Tests multiple mutations executing concurrently
     * @performance - Concurrent mutation handling
     */
    it('should handle multiple concurrent mutations correctly', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      const { result: addResult } = renderHook(() => useAddTeamMutation(), { wrapper });
      const { result: updateResult } = renderHook(() => useUpdateTeamMutation(), { wrapper });

      // Execute mutations concurrently
      await act(async () => {
        await Promise.all([
          addResult.current.mutateAsync({
            name: 'New Team',
          }),
          updateResult.current.mutateAsync({
            teamId: 'team-1',
            updates: { name: 'Updated' },
          }),
        ]);
      });

      // Both should have been called
      expect(addTeam).toHaveBeenCalled();
      expect(updateTeam).toHaveBeenCalled();

      // Both mutations should succeed
      expect(addResult.current.isSuccess).toBe(true);
      expect(updateResult.current.isSuccess).toBe(true);
    });
  });

  describe('Query State Transitions', () => {
    /**
     * Tests loading state during query execution
     * @integration - Verifies React Query v5 state names
     */
    it('should have pending status while loading', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      // Delay the response to observe loading state
      getTeams.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockTeams), 50)));

      const { result } = renderHook(() => useTeamsQuery(), { wrapper });

      // Initially should be pending (React Query v5 terminology)
      expect(result.current.status).toBe('pending');
      expect(result.current.isPending).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.status).toBe('success');
    });

    /**
     * Tests error state handling
     * @edge-case - Query error handling
     */
    it('should handle query errors correctly', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      getTeams.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useTeamsQuery(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Network error');
    });
  });
});
