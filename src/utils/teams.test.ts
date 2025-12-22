/**
 * @fileoverview Tests for team utilities
 * Tests DataStore integration for team CRUD operations.
 *
 * Note: Team CRUD operations now handled by DataStore (LocalDataStore.ts).
 * These tests verify the utility layer correctly delegates to DataStore.
 */

import type { Team, TeamPlayer } from '@/types';

// Mock DataStore state (module-level for mock factory access)
let mockTeams: { [id: string]: Team } = {};
let mockRosters: { [teamId: string]: TeamPlayer[] } = {};
let mockShouldThrow = false;
let mockValidationError: Error | null = null;
let teamIdCounter = 0;

/**
 * Simple mock DataStore implementation for testing teams.ts delegation.
 *
 * DESIGN: This mock does NOT duplicate validation logic from LocalDataStore.
 * Validation is tested in LocalDataStore.test.ts. This test file verifies
 * that teams.ts correctly delegates to DataStore.
 *
 * @see src/datastore/__tests__/LocalDataStore.test.ts - for validation tests
 */
const mockDataStore = {
  getTeams: jest.fn(async () => {
    if (mockShouldThrow) throw new Error('DataStore error');
    return Object.values(mockTeams);
  }),
  getTeamById: jest.fn(async (id: string) => {
    if (mockShouldThrow) throw new Error('DataStore error');
    return mockTeams[id] || null;
  }),
  createTeam: jest.fn(async (teamData: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (mockShouldThrow) throw new Error('DataStore error');
    if (mockValidationError) throw mockValidationError;

    teamIdCounter++;
    const now = new Date().toISOString();
    const newTeam: Team = {
      id: `team_test_${teamIdCounter}`,
      name: teamData.name,
      color: teamData.color,
      ageGroup: teamData.ageGroup,
      notes: teamData.notes,
      createdAt: now,
      updatedAt: now,
    };
    mockTeams[newTeam.id] = newTeam;
    return newTeam;
  }),
  updateTeam: jest.fn(async (id: string, updates: Partial<Team>) => {
    if (mockShouldThrow) throw new Error('DataStore error');
    const existing = mockTeams[id];
    if (!existing) return null;

    const updatedTeam: Team = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    mockTeams[id] = updatedTeam;
    return updatedTeam;
  }),
  deleteTeam: jest.fn(async (id: string) => {
    if (mockShouldThrow) throw new Error('DataStore error');
    if (!mockTeams[id]) return false;
    delete mockTeams[id];
    return true;
  }),
  getGames: jest.fn(async () => ({})),
};

// Mock DataStore
jest.mock('@/datastore', () => ({
  getDataStore: jest.fn(async () => mockDataStore),
}));

// Mock storage for roster operations and deprecated saveTeams
jest.mock('./storage', () => ({
  getStorageItem: jest.fn(async (key: string) => {
    if (key === 'soccerTeamRosters') {
      return Object.keys(mockRosters).length > 0 ? JSON.stringify(mockRosters) : null;
    }
    return null;
  }),
  setStorageItem: jest.fn(async (key: string, value: string) => {
    if (key === 'soccerTeamRosters') {
      mockRosters = JSON.parse(value);
    }
  }),
}));

import { setTeamRoster, getTeamRoster, addPlayerToRoster, addTeam, duplicateTeam, getTeam, updateTeam, getTeams, deleteTeam } from './teams';

// Mock console methods
let consoleErrorSpy: jest.SpyInstance;
let consoleWarnSpy: jest.SpyInstance;

beforeEach(() => {
  mockTeams = {};
  mockRosters = {};
  mockShouldThrow = false;
  mockValidationError = null;
  teamIdCounter = 0;
  jest.clearAllMocks();
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

describe('Teams Lock Integration', () => {
  const createTestPlayer = (id: string, name: string): TeamPlayer => ({
    id,
    name,
    isGoalie: false,
    jerseyNumber: id,
    notes: ''
  });

  it('should prevent race conditions when multiple operations modify roster concurrently', async () => {
    const teamId = 'test-team';
    const players = [
      createTestPlayer('1', 'Player 1'),
      createTestPlayer('2', 'Player 2'),
      createTestPlayer('3', 'Player 3'),
      createTestPlayer('4', 'Player 4'),
      createTestPlayer('5', 'Player 5')
    ];

    // Start multiple concurrent roster operations
    const operations = players.map(player =>
      addPlayerToRoster(teamId, player)
    );

    // Wait for all operations to complete
    await Promise.all(operations);

    // Check final roster state
    const finalRoster = await getTeamRoster(teamId);

    expect(finalRoster).toHaveLength(5);
    expect(finalRoster.map(p => p.name).sort()).toEqual([
      'Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5'
    ]);
  });

  it('should handle concurrent read/write operations safely', async () => {
    const teamId = 'test-team-2';
    const initialRoster = [
      createTestPlayer('p1', 'Initial Player 1'),
      createTestPlayer('p2', 'Initial Player 2')
    ];

    // Set initial roster
    await setTeamRoster(teamId, initialRoster);

    // Start concurrent operations: some reads, some writes
    const operations = [
      getTeamRoster(teamId),
      addPlayerToRoster(teamId, createTestPlayer('p3', 'New Player 3')),
      getTeamRoster(teamId),
      addPlayerToRoster(teamId, createTestPlayer('p4', 'New Player 4')),
      getTeamRoster(teamId)
    ];

    const results = await Promise.all(operations);

    // The final roster should have all 4 players
    const finalRoster = await getTeamRoster(teamId);
    expect(finalRoster).toHaveLength(4);

    // Check that all read operations returned valid arrays
    const readResults = [results[0], results[2], results[4]] as TeamPlayer[][];
    for (const roster of readResults) {
      expect(Array.isArray(roster)).toBe(true);
      expect(roster.length).toBeGreaterThanOrEqual(2); // At least the initial 2 players
    }
  });

  it('should maintain data integrity under high concurrency', async () => {
    const teamId = 'stress-test-team';
    const operationCount = 20;

    // Create many concurrent add operations
    const addOperations = Array.from({ length: operationCount }, (_, i) =>
      addPlayerToRoster(teamId, createTestPlayer(`stress-${i}`, `Stress Player ${i}`))
    );

    await Promise.all(addOperations);

    const finalRoster = await getTeamRoster(teamId);

    // Should have exactly the number of players we added
    expect(finalRoster).toHaveLength(operationCount);

    // All players should have unique IDs
    const playerIds = finalRoster.map(p => p.id);
    const uniqueIds = new Set(playerIds);
    expect(uniqueIds.size).toBe(operationCount);
  });
});

describe('Team CRUD via DataStore', () => {
  /**
   * Tests basic team creation
   * @critical
   */
  it('should create a team via DataStore', async () => {
    const team = await addTeam({
      name: 'Test Team',
      color: '#FF0000'
    });

    expect(team).not.toBeNull();
    expect(team.name).toBe('Test Team');
    expect(team.color).toBe('#FF0000');
    expect(mockDataStore.createTeam).toHaveBeenCalledWith({
      name: 'Test Team',
      color: '#FF0000'
    });
  });

  /**
   * Tests team retrieval via DataStore
   */
  it('should get a team by ID via DataStore', async () => {
    const created = await addTeam({ name: 'Get Test' });
    const retrieved = await getTeam(created.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('Get Test');
    expect(mockDataStore.getTeamById).toHaveBeenCalledWith(created.id);
  });

  /**
   * Tests getting all teams via DataStore
   */
  it('should get all teams via DataStore', async () => {
    await addTeam({ name: 'Team 1' });
    await addTeam({ name: 'Team 2' });

    const teams = await getTeams();

    expect(teams).toHaveLength(2);
    expect(mockDataStore.getTeams).toHaveBeenCalled();
  });

  /**
   * Tests team update via DataStore
   */
  it('should update a team via DataStore', async () => {
    const created = await addTeam({ name: 'Update Test' });
    const updated = await updateTeam(created.id, { name: 'Updated Name' });

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe('Updated Name');
    expect(mockDataStore.updateTeam).toHaveBeenCalledWith(created.id, { name: 'Updated Name' });
  });
});

describe('Team metadata fields', () => {
  /**
   * Tests preservation of ageGroup and notes when creating a team.
   * Note: Validation (limits, normalization) is tested in LocalDataStore.test.ts.
   * @critical
   */
  it('should preserve ageGroup and notes when creating team', async () => {
    const team = await addTeam({
      name: 'Test Team',
      ageGroup: 'U10',
      notes: 'Spring season team'
    });

    expect(team.ageGroup).toBe('U10');
    expect(team.notes).toBe('Spring season team');

    // Verify it persists when retrieved
    const retrieved = await getTeam(team.id);
    expect(retrieved?.ageGroup).toBe('U10');
    expect(retrieved?.notes).toBe('Spring season team');
  });

  /**
   * Tests preservation of ageGroup and notes when duplicating a team
   * @critical
   */
  it('should preserve ageGroup and notes when duplicating team', async () => {
    const original = await addTeam({
      name: 'Original Team',
      ageGroup: 'U12',
      notes: 'Original notes'
    });

    const duplicate = await duplicateTeam(original.id);

    expect(duplicate).not.toBeNull();
    expect(duplicate?.ageGroup).toBe('U12');
    expect(duplicate?.notes).toBe('Original notes');
    expect(duplicate?.name).toBe('Original Team (Copy)');
  });

  /**
   * Tests handling of undefined ageGroup and notes
   * @edge-case
   */
  it('should handle undefined ageGroup and notes gracefully', async () => {
    const team = await addTeam({
      name: 'Minimal Team'
      // ageGroup and notes intentionally omitted
    });

    expect(team.ageGroup).toBeUndefined();
    expect(team.notes).toBeUndefined();
  });

  /**
   * Tests that duplicating a team without metadata works correctly
   * @edge-case
   */
  it('should duplicate team without metadata correctly', async () => {
    const original = await addTeam({
      name: 'Minimal Original'
    });

    const duplicate = await duplicateTeam(original.id);

    expect(duplicate).not.toBeNull();
    expect(duplicate?.ageGroup).toBeUndefined();
    expect(duplicate?.notes).toBeUndefined();
    expect(duplicate?.name).toBe('Minimal Original (Copy)');
  });

  /**
   * Tests that notes can contain multiline text
   * @edge-case
   */
  it('should handle multiline notes', async () => {
    const multilineNotes = 'Line 1\nLine 2\nLine 3';
    const team = await addTeam({
      name: 'Team with Notes',
      notes: multilineNotes
    });

    expect(team.notes).toBe(multilineNotes);

    const retrieved = await getTeam(team.id);
    expect(retrieved?.notes).toBe(multilineNotes);
  });

  /**
   * Tests that notes can contain special characters and Unicode
   * @edge-case
   */
  it('should handle notes with special characters and Unicode', async () => {
    const specialNotes = 'Emojis: ⚽🥅🏆\nUnicode: Ä Ö Å ñ\nSymbols: @#$%^&*()';

    const team = await addTeam({
      name: 'Team with Special Notes',
      notes: specialNotes
    });

    expect(team.notes).toBe(specialNotes);

    const retrieved = await getTeam(team.id);
    expect(retrieved?.notes).toBe(specialNotes);
  });
});

describe('Error handling', () => {
  /**
   * Tests that DataStore errors are propagated for addTeam
   * @critical
   */
  it('should propagate DataStore errors from addTeam', async () => {
    mockShouldThrow = true;
    await expect(addTeam({ name: 'Test Team' })).rejects.toThrow('DataStore error');
  });

  /**
   * Tests that ValidationError is propagated from DataStore
   * @critical
   */
  it('should propagate ValidationError from DataStore', async () => {
    const validationError = new Error('Team name cannot be empty');
    (validationError as Error & { code: string }).code = 'VALIDATION_ERROR';
    mockValidationError = validationError;

    await expect(addTeam({ name: '' })).rejects.toThrow('Team name cannot be empty');
  });

  /**
   * Tests that AlreadyExistsError is propagated from DataStore
   * @critical
   */
  it('should propagate AlreadyExistsError from DataStore', async () => {
    const alreadyExistsError = new Error("A team named 'Test Team' already exists");
    (alreadyExistsError as Error & { code: string }).code = 'ALREADY_EXISTS';
    mockValidationError = alreadyExistsError;

    await expect(addTeam({ name: 'Test Team' })).rejects.toThrow("A team named 'Test Team' already exists");
  });

  /**
   * Tests that getTeams returns empty array on DataStore error (graceful degradation)
   * @critical
   */
  it('should return empty array on getTeams DataStore error', async () => {
    mockShouldThrow = true;
    const result = await getTeams();
    expect(result).toEqual([]);
  });

  /**
   * Tests that getTeam returns null on DataStore error (graceful degradation)
   * @critical
   */
  it('should return null on getTeam DataStore error', async () => {
    mockShouldThrow = true;
    const result = await getTeam('some-id');
    expect(result).toBeNull();
  });

  /**
   * Tests that updateTeam returns null when team not found
   */
  it('should return null when updating non-existent team', async () => {
    const result = await updateTeam('non-existent-id', { name: 'New Name' });
    expect(result).toBeNull();
  });

  /**
   * Tests that deleteTeam returns false when team not found
   */
  it('should return false when deleting non-existent team', async () => {
    const result = await deleteTeam('non-existent-id');
    expect(result).toBe(false);
  });

  /**
   * Tests that deleteTeam handles DataStore errors gracefully
   */
  it('should return false on deleteTeam DataStore error', async () => {
    mockShouldThrow = true;
    const result = await deleteTeam('some-id');
    expect(result).toBe(false);
  });
});

/**
 * NOTE: Validation tests (empty name, invalid ageGroup, notes length limits,
 * normalization of whitespace/empty strings) are tested in LocalDataStore.test.ts.
 * This test file focuses on teams.ts delegation to DataStore.
 *
 * @see src/datastore/__tests__/LocalDataStore.test.ts
 */
