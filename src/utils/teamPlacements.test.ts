/**
 * Tests for team placement utility functions
 *
 * @critical - Validates placement add/update/remove operations
 * @edge-case - Tests invalid IDs, null placement, empty object cleanup
 * @integration - Tests locking behavior during concurrent updates
 */

import {
  updateTeamPlacementGeneric,
  getTeamPlacementFromItems,
  EntityWithPlacements,
} from './teamPlacements';
import type { TeamPlacementInfo } from '@/types';
import { withKeyLock } from './storageKeyLock';

// Mock dependencies
jest.mock('./logger');
jest.mock('./storageKeyLock');

const mockWithKeyLock = withKeyLock as jest.MockedFunction<typeof withKeyLock>;

// Test entity type
interface TestEntity extends EntityWithPlacements {
  id: string;
  name: string;
  teamPlacements?: {
    [teamId: string]: TeamPlacementInfo;
  };
}

describe('Team Placement Utilities', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Default mock implementation: execute callback immediately
    mockWithKeyLock.mockImplementation(async (_key, callback) => {
      return callback();
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('updateTeamPlacementGeneric', () => {
    /**
     * Tests adding a new team placement
     * @critical - Core functionality for placement feature
     */
    it('should add a new team placement to an entity', async () => {
      const entities: TestEntity[] = [
        { id: 'entity1', name: 'Test Entity' },
      ];
      const savedItems: TestEntity[] = [];

      const result = await updateTeamPlacementGeneric({
        storageKey: 'test_key',
        entityType: 'tournament',
        entityId: 'entity1',
        teamId: 'team1',
        placement: 1,
        award: 'Champion',
        note: 'Great performance',
        getItems: async () => entities,
        saveItems: async (items) => {
          savedItems.push(...items);
        },
      });

      expect(result).toBe(true);
      expect(savedItems[0].teamPlacements).toEqual({
        team1: {
          placement: 1,
          award: 'Champion',
          note: 'Great performance',
        },
      });
    });

    /**
     * Tests updating an existing team placement
     * @critical - Ensures updates don't create duplicates
     */
    it('should update an existing team placement', async () => {
      const entities: TestEntity[] = [
        {
          id: 'entity1',
          name: 'Test Entity',
          teamPlacements: {
            team1: { placement: 2, award: 'Runner-up' },
          },
        },
      ];
      const savedItems: TestEntity[] = [];

      const result = await updateTeamPlacementGeneric({
        storageKey: 'test_key',
        entityType: 'tournament',
        entityId: 'entity1',
        teamId: 'team1',
        placement: 1,
        award: 'Champion',
        getItems: async () => entities,
        saveItems: async (items) => {
          savedItems.push(...items);
        },
      });

      expect(result).toBe(true);
      expect(savedItems[0].teamPlacements?.team1).toEqual({
        placement: 1,
        award: 'Champion',
      });
    });

    /**
     * Tests removing a team placement with null
     * @critical - Required for clearing placements
     */
    it('should remove a team placement when placement is null', async () => {
      const entities: TestEntity[] = [
        {
          id: 'entity1',
          name: 'Test Entity',
          teamPlacements: {
            team1: { placement: 1 },
            team2: { placement: 2 },
          },
        },
      ];
      const savedItems: TestEntity[] = [];

      const result = await updateTeamPlacementGeneric({
        storageKey: 'test_key',
        entityType: 'tournament',
        entityId: 'entity1',
        teamId: 'team1',
        placement: null,
        getItems: async () => entities,
        saveItems: async (items) => {
          savedItems.push(...items);
        },
      });

      expect(result).toBe(true);
      expect(savedItems[0].teamPlacements).toEqual({
        team2: { placement: 2 },
      });
    });

    /**
     * Tests cleanup of empty teamPlacements object
     * @edge-case - Prevents empty objects in storage
     */
    it('should remove teamPlacements object when last placement is removed', async () => {
      const entities: TestEntity[] = [
        {
          id: 'entity1',
          name: 'Test Entity',
          teamPlacements: {
            team1: { placement: 1 },
          },
        },
      ];
      const savedItems: TestEntity[] = [];

      const result = await updateTeamPlacementGeneric({
        storageKey: 'test_key',
        entityType: 'tournament',
        entityId: 'entity1',
        teamId: 'team1',
        placement: null,
        getItems: async () => entities,
        saveItems: async (items) => {
          savedItems.push(...items);
        },
      });

      expect(result).toBe(true);
      expect(savedItems[0].teamPlacements).toBeUndefined();
    });

    /**
     * Tests that award and note are optional
     * @edge-case - Validates minimal placement data
     */
    it('should create placement without award or note', async () => {
      const entities: TestEntity[] = [
        { id: 'entity1', name: 'Test Entity' },
      ];
      const savedItems: TestEntity[] = [];

      const result = await updateTeamPlacementGeneric({
        storageKey: 'test_key',
        entityType: 'tournament',
        entityId: 'entity1',
        teamId: 'team1',
        placement: 3,
        getItems: async () => entities,
        saveItems: async (items) => {
          savedItems.push(...items);
        },
      });

      expect(result).toBe(true);
      expect(savedItems[0].teamPlacements?.team1).toEqual({
        placement: 3,
      });
    });

    /**
     * Tests handling of invalid entity ID
     * @edge-case - Validates error handling
     */
    it('should return false when entity ID is invalid', async () => {
      const result = await updateTeamPlacementGeneric({
        storageKey: 'test_key',
        entityType: 'tournament',
        entityId: '',
        teamId: 'team1',
        placement: 1,
        getItems: async () => [],
        saveItems: async () => {},
      });

      expect(result).toBe(false);
    });

    /**
     * Tests handling of invalid team ID
     * @edge-case - Validates error handling
     */
    it('should return false when team ID is invalid', async () => {
      const result = await updateTeamPlacementGeneric({
        storageKey: 'test_key',
        entityType: 'season',
        entityId: 'entity1',
        teamId: '',
        placement: 1,
        getItems: async () => [],
        saveItems: async () => {},
      });

      expect(result).toBe(false);
    });

    /**
     * Tests handling of non-existent entity
     * @edge-case - Prevents placement on missing entities
     */
    it('should return false when entity is not found', async () => {
      const entities: TestEntity[] = [
        { id: 'entity1', name: 'Test Entity' },
      ];

      const result = await updateTeamPlacementGeneric({
        storageKey: 'test_key',
        entityType: 'tournament',
        entityId: 'nonexistent',
        teamId: 'team1',
        placement: 1,
        getItems: async () => entities,
        saveItems: async () => {},
      });

      expect(result).toBe(false);
    });

    /**
     * Tests handling of storage errors
     * @edge-case - Validates error recovery
     */
    it('should return false when getItems throws', async () => {
      const result = await updateTeamPlacementGeneric({
        storageKey: 'test_key',
        entityType: 'tournament',
        entityId: 'entity1',
        teamId: 'team1',
        placement: 1,
        getItems: async () => {
          throw new Error('Storage error');
        },
        saveItems: async () => {},
      });

      expect(result).toBe(false);
    });

    /**
     * Tests handling of save errors
     * @edge-case - Validates error recovery during save
     */
    it('should return false when saveItems throws', async () => {
      const entities: TestEntity[] = [
        { id: 'entity1', name: 'Test Entity' },
      ];

      const result = await updateTeamPlacementGeneric({
        storageKey: 'test_key',
        entityType: 'season',
        entityId: 'entity1',
        teamId: 'team1',
        placement: 1,
        getItems: async () => entities,
        saveItems: async () => {
          throw new Error('Save failed');
        },
      });

      expect(result).toBe(false);
    });

    /**
     * Tests that function uses withKeyLock for concurrency control
     * @integration - Validates locking mechanism
     */
    it('should use withKeyLock to prevent concurrent updates', async () => {
      const entities: TestEntity[] = [
        { id: 'entity1', name: 'Test Entity' },
      ];

      await updateTeamPlacementGeneric({
        storageKey: 'test_key',
        entityType: 'tournament',
        entityId: 'entity1',
        teamId: 'team1',
        placement: 1,
        getItems: async () => entities,
        saveItems: async () => {},
      });

      expect(mockWithKeyLock).toHaveBeenCalledWith(
        'test_key',
        expect.any(Function)
      );
    });

    /**
     * Tests handling multiple teams with placements
     * @integration - Validates multi-team scenarios
     */
    it('should handle multiple teams with different placements', async () => {
      const entities: TestEntity[] = [
        {
          id: 'entity1',
          name: 'Test Entity',
          teamPlacements: {
            team1: { placement: 1, award: 'Champion' },
            team2: { placement: 2, award: 'Runner-up' },
          },
        },
      ];
      const savedItems: TestEntity[] = [];

      const result = await updateTeamPlacementGeneric({
        storageKey: 'test_key',
        entityType: 'tournament',
        entityId: 'entity1',
        teamId: 'team3',
        placement: 3,
        award: 'Third Place',
        getItems: async () => entities,
        saveItems: async (items) => {
          savedItems.push(...items);
        },
      });

      expect(result).toBe(true);
      expect(savedItems[0].teamPlacements).toEqual({
        team1: { placement: 1, award: 'Champion' },
        team2: { placement: 2, award: 'Runner-up' },
        team3: { placement: 3, award: 'Third Place' },
      });
    });
  });

  describe('getTeamPlacementFromItems', () => {
    /**
     * Tests retrieving existing placement
     * @critical - Core read functionality
     */
    it('should return team placement when it exists', () => {
      const entities: TestEntity[] = [
        {
          id: 'entity1',
          name: 'Test Entity',
          teamPlacements: {
            team1: { placement: 1, award: 'Champion', note: 'Excellent' },
          },
        },
      ];

      const result = getTeamPlacementFromItems(
        entities,
        'entity1',
        'team1',
        'tournament'
      );

      expect(result).toEqual({
        placement: 1,
        award: 'Champion',
        note: 'Excellent',
      });
    });

    /**
     * Tests handling non-existent entity
     * @edge-case - Returns null for missing entity
     */
    it('should return null when entity is not found', () => {
      const entities: TestEntity[] = [
        { id: 'entity1', name: 'Test Entity' },
      ];

      const result = getTeamPlacementFromItems(
        entities,
        'nonexistent',
        'team1',
        'tournament'
      );

      expect(result).toBeNull();
    });

    /**
     * Tests handling entity without placements
     * @edge-case - Returns null when no placements exist
     */
    it('should return null when entity has no placements', () => {
      const entities: TestEntity[] = [
        { id: 'entity1', name: 'Test Entity' },
      ];

      const result = getTeamPlacementFromItems(
        entities,
        'entity1',
        'team1',
        'tournament'
      );

      expect(result).toBeNull();
    });

    /**
     * Tests handling non-existent team placement
     * @edge-case - Returns null for missing team
     */
    it('should return null when team has no placement', () => {
      const entities: TestEntity[] = [
        {
          id: 'entity1',
          name: 'Test Entity',
          teamPlacements: {
            team1: { placement: 1 },
          },
        },
      ];

      const result = getTeamPlacementFromItems(
        entities,
        'entity1',
        'team2',
        'tournament'
      );

      expect(result).toBeNull();
    });

    /**
     * Tests error handling during retrieval
     * @edge-case - Validates graceful error handling
     */
    it('should return null when an exception occurs', () => {
      // Create entities that will throw when accessed
      const entities = new Proxy([] as TestEntity[], {
        get() {
          throw new Error('Access error');
        },
      });

      const result = getTeamPlacementFromItems(
        entities,
        'entity1',
        'team1',
        'season'
      );

      expect(result).toBeNull();
    });

    /**
     * Tests retrieval with minimal placement data
     * @edge-case - Validates placement without optional fields
     */
    it('should return placement without award or note', () => {
      const entities: TestEntity[] = [
        {
          id: 'entity1',
          name: 'Test Entity',
          teamPlacements: {
            team1: { placement: 5 },
          },
        },
      ];

      const result = getTeamPlacementFromItems(
        entities,
        'entity1',
        'team1',
        'tournament'
      );

      expect(result).toEqual({
        placement: 5,
      });
    });
  });
});
