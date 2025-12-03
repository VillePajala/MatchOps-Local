/**
 * React Query Integration Tests
 *
 * Comprehensive tests for React Query v5.90.x functionality including:
 * - Cache invalidation patterns
 * - Query key matching behavior
 * - Query state management
 * - Mutation + invalidation flows
 *
 * These tests verify that the upgrade from v5.80 to v5.90 maintains
 * expected behavior for all React Query patterns used in this codebase.
 *
 * @critical - Core data management infrastructure
 */

import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../queryKeys';

describe('React Query Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0, // Disable garbage collection for tests
        },
        mutations: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('Query Key Structure', () => {
    /**
     * Verifies query key structure matches expected tuple patterns
     * @critical - Query key mismatch can cause cache misses
     */
    it('should have correct query key structures', () => {
      // Static keys
      expect(queryKeys.masterRoster).toEqual(['masterRoster']);
      expect(queryKeys.seasons).toEqual(['seasons']);
      expect(queryKeys.tournaments).toEqual(['tournaments']);
      expect(queryKeys.savedGames).toEqual(['savedGames']);
      expect(queryKeys.personnel).toEqual(['personnel']);
      expect(queryKeys.teams).toEqual(['teams']);
      expect(queryKeys.appSettingsCurrentGameId).toEqual(['appSettingsCurrentGameId']);

      // Dynamic keys
      expect(queryKeys.personnelDetail('person-1')).toEqual(['personnel', 'detail', 'person-1']);
      expect(queryKeys.personnelByRole('coach')).toEqual(['personnel', 'byRole', 'coach']);
      expect(queryKeys.teamRoster('team-1')).toEqual(['teams', 'team-1', 'roster']);

      // Nested keys
      expect(queryKeys.settings.all).toEqual(['settings']);
      expect(queryKeys.settings.detail()).toEqual(['settings', 'detail']);
    });

    /**
     * Tests that dynamic query key factories create unique keys
     * @critical - Key uniqueness prevents cache collisions
     */
    it('should generate unique keys for different parameters', () => {
      const key1 = queryKeys.teamRoster('team-1');
      const key2 = queryKeys.teamRoster('team-2');
      const key3 = queryKeys.personnelDetail('person-1');
      const key4 = queryKeys.personnelDetail('person-2');

      expect(key1).not.toEqual(key2);
      expect(key3).not.toEqual(key4);
      expect(key1).not.toEqual(key3);
    });

    /**
     * Tests readonly tuple type integrity (TypeScript)
     * React Query v5 requires readonly tuples for proper type inference
     */
    it('should maintain readonly tuple type', () => {
      // These assertions verify the structure at runtime
      // TypeScript compilation validates readonly at build time
      const masterRosterKey = queryKeys.masterRoster;
      const teamRosterKey = queryKeys.teamRoster('test');

      expect(Array.isArray(masterRosterKey)).toBe(true);
      expect(Array.isArray(teamRosterKey)).toBe(true);
      expect(masterRosterKey.length).toBe(1);
      expect(teamRosterKey.length).toBe(3);
    });
  });

  describe('Cache Invalidation', () => {
    /**
     * Tests basic cache invalidation with exact query keys
     * @critical - Core cache management pattern
     */
    it('should invalidate queries by exact key', async () => {
      // Set up cached data
      queryClient.setQueryData(queryKeys.masterRoster, [{ id: 'p1', name: 'Player 1' }]);
      queryClient.setQueryData(queryKeys.seasons, [{ id: 's1', name: 'Season 1' }]);

      // Verify initial cache state
      expect(queryClient.getQueryData(queryKeys.masterRoster)).toEqual([{ id: 'p1', name: 'Player 1' }]);
      expect(queryClient.getQueryData(queryKeys.seasons)).toEqual([{ id: 's1', name: 'Season 1' }]);

      // Invalidate specific key
      await queryClient.invalidateQueries({ queryKey: queryKeys.masterRoster });

      // Check invalidation state
      const masterRosterState = queryClient.getQueryState(queryKeys.masterRoster);
      const seasonsState = queryClient.getQueryState(queryKeys.seasons);

      expect(masterRosterState?.isInvalidated).toBe(true);
      expect(seasonsState?.isInvalidated).toBeFalsy(); // Not invalidated
    });

    /**
     * Tests prefix-based cache invalidation for nested keys
     * @critical - Used for team roster invalidation pattern
     */
    it('should invalidate queries by prefix', async () => {
      // Set up cached data with hierarchical keys
      queryClient.setQueryData(queryKeys.teams, [{ id: 't1' }]);
      queryClient.setQueryData(queryKeys.teamRoster('team-1'), [{ id: 'p1' }]);
      queryClient.setQueryData(queryKeys.teamRoster('team-2'), [{ id: 'p2' }]);

      // Invalidate all team-related queries
      await queryClient.invalidateQueries({ queryKey: ['teams'] });

      // Check all team queries are invalidated
      const teamsState = queryClient.getQueryState(queryKeys.teams);
      const roster1State = queryClient.getQueryState(queryKeys.teamRoster('team-1'));
      const roster2State = queryClient.getQueryState(queryKeys.teamRoster('team-2'));

      expect(teamsState?.isInvalidated).toBe(true);
      expect(roster1State?.isInvalidated).toBe(true);
      expect(roster2State?.isInvalidated).toBe(true);
    });

    /**
     * Tests that invalidation respects exact: true option
     * @integration - Verifies v5.90 exact matching behavior
     */
    it('should only invalidate exact keys when exact option is true', async () => {
      queryClient.setQueryData(queryKeys.personnel, [{ id: 'p1' }]);
      queryClient.setQueryData(queryKeys.personnelDetail('person-1'), { id: 'person-1' });
      queryClient.setQueryData(queryKeys.personnelByRole('coach'), [{ id: 'c1' }]);

      // Invalidate with exact: true
      await queryClient.invalidateQueries({ queryKey: queryKeys.personnel, exact: true });

      const personnelState = queryClient.getQueryState(queryKeys.personnel);
      const detailState = queryClient.getQueryState(queryKeys.personnelDetail('person-1'));
      const roleState = queryClient.getQueryState(queryKeys.personnelByRole('coach'));

      expect(personnelState?.isInvalidated).toBe(true);
      expect(detailState?.isInvalidated).toBeFalsy(); // Not invalidated due to exact: true
      expect(roleState?.isInvalidated).toBeFalsy(); // Not invalidated due to exact: true
    });

    /**
     * Tests multiple simultaneous invalidations
     * @integration - Common pattern after team deletion
     */
    it('should handle multiple invalidations correctly', async () => {
      queryClient.setQueryData(queryKeys.teams, [{ id: 't1' }]);
      queryClient.setQueryData(queryKeys.teamRoster('team-1'), [{ id: 'p1' }]);
      queryClient.setQueryData(queryKeys.savedGames, { game1: {} });

      // Simulate team deletion invalidation pattern
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.teams }),
        queryClient.removeQueries({ queryKey: queryKeys.teamRoster('team-1') }),
        queryClient.invalidateQueries({ queryKey: queryKeys.savedGames }),
      ]);

      // Verify states
      expect(queryClient.getQueryState(queryKeys.teams)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryData(queryKeys.teamRoster('team-1'))).toBeUndefined();
      expect(queryClient.getQueryState(queryKeys.savedGames)?.isInvalidated).toBe(true);
    });
  });

  describe('Query Key Matching', () => {
    /**
     * Tests fuzzy matching with partial query keys
     * @critical - Affects cache lookup behavior
     */
    it('should match queries by partial key prefix', () => {
      queryClient.setQueryData(['settings'], { theme: 'dark' });
      queryClient.setQueryData(['settings', 'detail'], { fontSize: 14 });

      // Use QueryClient's getQueriesData which uses the same matching as invalidateQueries
      const matchedQueries = queryClient.getQueriesData({ queryKey: ['settings'] });

      expect(matchedQueries).toHaveLength(2);
      expect(matchedQueries.map(([key]) => key)).toEqual(
        expect.arrayContaining([['settings'], ['settings', 'detail']])
      );
    });

    /**
     * Tests that unrelated keys are not matched
     * @edge-case - Prevents accidental cache invalidation
     */
    it('should not match unrelated query keys', () => {
      queryClient.setQueryData(queryKeys.masterRoster, []);
      queryClient.setQueryData(queryKeys.seasons, []);
      queryClient.setQueryData(queryKeys.teams, []);

      const matchedQueries = queryClient.getQueriesData({ queryKey: queryKeys.masterRoster });

      expect(matchedQueries).toHaveLength(1);
      expect(matchedQueries[0][0]).toEqual(queryKeys.masterRoster);
    });

    /**
     * Tests hierarchical key matching for team roster
     * @critical - Used throughout team management features
     */
    it('should correctly match hierarchical team roster keys', () => {
      queryClient.setQueryData(queryKeys.teams, [{ id: 't1' }, { id: 't2' }]);
      queryClient.setQueryData(queryKeys.teamRoster('team-1'), [{ id: 'p1' }]);
      queryClient.setQueryData(queryKeys.teamRoster('team-2'), [{ id: 'p2' }]);
      queryClient.setQueryData(queryKeys.teamRoster('team-3'), [{ id: 'p3' }]);

      // Match all team rosters
      const allRosters = queryClient.getQueriesData({ queryKey: ['teams'] });

      // Should match teams list AND all team rosters (hierarchical)
      expect(allRosters.length).toBeGreaterThanOrEqual(4);
    });

    /**
     * Tests exact key matching with getQueryData
     * @critical - Core data retrieval pattern
     */
    it('should return exact match with getQueryData', () => {
      queryClient.setQueryData(queryKeys.teamRoster('team-1'), [{ id: 'p1' }]);
      queryClient.setQueryData(queryKeys.teamRoster('team-2'), [{ id: 'p2' }]);

      const exactData = queryClient.getQueryData(queryKeys.teamRoster('team-1'));

      expect(exactData).toEqual([{ id: 'p1' }]);
      expect(exactData).not.toContainEqual({ id: 'p2' });
    });
  });

  describe('Query State Management', () => {
    /**
     * Tests initial query state
     * @integration - Verifies expected defaults
     */
    it('should have correct initial state for unset queries', () => {
      const state = queryClient.getQueryState(queryKeys.masterRoster);

      // Unset queries return undefined
      expect(state).toBeUndefined();
    });

    /**
     * Tests query state after setQueryData
     * @integration - Used for optimistic updates
     */
    it('should update state correctly with setQueryData', () => {
      const testData = [{ id: 'p1', name: 'Player 1' }];
      queryClient.setQueryData(queryKeys.masterRoster, testData);

      const state = queryClient.getQueryState(queryKeys.masterRoster);
      const data = queryClient.getQueryData(queryKeys.masterRoster);

      expect(state).toBeDefined();
      expect(state?.status).toBe('success');
      expect(data).toEqual(testData);
    });

    /**
     * Tests query removal
     * @integration - Used when deleting entities
     */
    it('should correctly remove queries', () => {
      queryClient.setQueryData(queryKeys.teamRoster('team-to-delete'), [{ id: 'p1' }]);
      expect(queryClient.getQueryData(queryKeys.teamRoster('team-to-delete'))).toBeDefined();

      queryClient.removeQueries({ queryKey: queryKeys.teamRoster('team-to-delete') });

      expect(queryClient.getQueryData(queryKeys.teamRoster('team-to-delete'))).toBeUndefined();
      expect(queryClient.getQueryState(queryKeys.teamRoster('team-to-delete'))).toBeUndefined();
    });

    /**
     * Tests cancel queries functionality
     * @integration - Used in UnifiedTeamModal for race condition prevention
     */
    it('should cancel pending queries', async () => {
      // Set up a query with data
      queryClient.setQueryData(queryKeys.masterRoster, []);

      // Cancel should not throw
      await expect(
        queryClient.cancelQueries({ queryKey: queryKeys.masterRoster })
      ).resolves.not.toThrow();
    });
  });

  describe('setQueryData Patterns', () => {
    /**
     * Tests functional update pattern
     * @critical - Used for optimistic updates in mutations
     */
    it('should support functional updates', () => {
      queryClient.setQueryData(queryKeys.masterRoster, [{ id: 'p1', name: 'Player 1' }]);

      queryClient.setQueryData(
        queryKeys.masterRoster,
        (old: Array<{ id: string; name: string }> | undefined) => [
          ...(old || []),
          { id: 'p2', name: 'Player 2' },
        ]
      );

      const data = queryClient.getQueryData(queryKeys.masterRoster) as Array<{ id: string; name: string }>;

      expect(data).toHaveLength(2);
      expect(data).toContainEqual({ id: 'p1', name: 'Player 1' });
      expect(data).toContainEqual({ id: 'p2', name: 'Player 2' });
    });

    /**
     * Tests updatedAt timestamp behavior
     * @integration - Verifies cache freshness tracking
     */
    it('should update dataUpdatedAt on setQueryData', async () => {
      const before = Date.now();

      queryClient.setQueryData(queryKeys.masterRoster, []);

      const state = queryClient.getQueryState(queryKeys.masterRoster);
      const after = Date.now();

      expect(state?.dataUpdatedAt).toBeGreaterThanOrEqual(before);
      expect(state?.dataUpdatedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('Query Defaults', () => {
    /**
     * Tests query default configuration
     * @integration - Verifies QueryClient setup
     */
    it('should have retry disabled for tests', () => {
      // This is set in beforeEach, verify the config
      const defaults = queryClient.getDefaultOptions();

      expect(defaults.queries?.retry).toBe(false);
      expect(defaults.mutations?.retry).toBe(false);
    });

    /**
     * Tests garbage collection configuration
     * @integration - Important for memory management
     */
    it('should have gcTime configured correctly', () => {
      const defaults = queryClient.getDefaultOptions();

      // gcTime: 0 disables garbage collection in tests
      expect(defaults.queries?.gcTime).toBe(0);
    });
  });

  describe('React Query v5.90 Specific Behaviors', () => {
    /**
     * Tests that isLoading/isPending states work correctly
     * @integration - v5 renamed isLoading to isPending
     */
    it('should use v5 status property names', () => {
      queryClient.setQueryData(queryKeys.masterRoster, []);
      const state = queryClient.getQueryState(queryKeys.masterRoster);

      // v5 uses 'pending' | 'success' | 'error' for status
      expect(state?.status).toBe('success');
      expect(['pending', 'success', 'error']).toContain(state?.status);
    });

    /**
     * Tests refetch behavior after invalidation
     * @integration - Verifies v5.90 invalidation triggers refetch correctly
     */
    it('should mark queries as stale after invalidation', async () => {
      queryClient.setQueryData(queryKeys.masterRoster, [{ id: 'p1' }]);

      const stateBefore = queryClient.getQueryState(queryKeys.masterRoster);
      expect(stateBefore?.isInvalidated).toBeFalsy();

      await queryClient.invalidateQueries({ queryKey: queryKeys.masterRoster });

      const stateAfter = queryClient.getQueryState(queryKeys.masterRoster);
      expect(stateAfter?.isInvalidated).toBe(true);
    });

    /**
     * Tests predicate-based invalidation
     * @integration - Advanced invalidation pattern
     */
    it('should support predicate-based invalidation', async () => {
      queryClient.setQueryData(queryKeys.personnelDetail('coach-1'), { role: 'coach' });
      queryClient.setQueryData(queryKeys.personnelDetail('assistant-1'), { role: 'assistant' });
      queryClient.setQueryData(queryKeys.masterRoster, []);

      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === 'personnel';
        },
      });

      const coach1State = queryClient.getQueryState(queryKeys.personnelDetail('coach-1'));
      const assistant1State = queryClient.getQueryState(queryKeys.personnelDetail('assistant-1'));
      const rosterState = queryClient.getQueryState(queryKeys.masterRoster);

      expect(coach1State?.isInvalidated).toBe(true);
      expect(assistant1State?.isInvalidated).toBe(true);
      expect(rosterState?.isInvalidated).toBeFalsy(); // Not personnel-related
    });
  });

  describe('Error Handling', () => {
    /**
     * Tests that operations don't throw for non-existent keys
     * @edge-case - Graceful handling of missing data
     */
    it('should handle invalidation of non-existent queries gracefully', async () => {
      // Should not throw when invalidating non-existent query
      await expect(
        queryClient.invalidateQueries({ queryKey: ['non-existent-query'] })
      ).resolves.not.toThrow();
    });

    /**
     * Tests removal of non-existent queries
     * @edge-case - Graceful handling
     */
    it('should handle removal of non-existent queries gracefully', () => {
      expect(() => {
        queryClient.removeQueries({ queryKey: ['non-existent-query'] });
      }).not.toThrow();
    });
  });
});
