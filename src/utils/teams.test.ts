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
let teamIdCounter = 0;

// Mock DataStore implementation
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

    // Simulate validation
    const trimmedName = teamData.name?.trim();
    if (!trimmedName) {
      const error = new Error('Team name cannot be empty');
      (error as Error & { code: string }).code = 'VALIDATION_ERROR';
      throw error;
    }

    // Normalize empty strings to undefined
    const normalizeOptionalString = (value?: string): string | undefined => {
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    };

    const normalizedAgeGroup = normalizeOptionalString(teamData.ageGroup);
    const normalizedNotes = normalizeOptionalString(teamData.notes);

    // Validate notes length
    if (normalizedNotes && normalizedNotes.length > 1000) {
      const error = new Error('Team notes cannot exceed 1000 characters');
      (error as Error & { code: string }).code = 'VALIDATION_ERROR';
      throw error;
    }

    // Validate age group
    const validAgeGroups = ['U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'U19', 'U20', 'U21'];
    if (normalizedAgeGroup && !validAgeGroups.includes(normalizedAgeGroup)) {
      const error = new Error(`Invalid age group: ${normalizedAgeGroup}. Must be one of: ${validAgeGroups.join(', ')}`);
      (error as Error & { code: string }).code = 'VALIDATION_ERROR';
      throw error;
    }

    teamIdCounter++;
    const now = new Date().toISOString();
    const newTeam: Team = {
      id: `team_test_${teamIdCounter}`,
      name: trimmedName,
      color: teamData.color,
      ageGroup: normalizedAgeGroup,
      notes: normalizedNotes,
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

    // Normalize empty strings to undefined
    const normalizeOptionalString = (value?: string): string | undefined => {
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    };

    // Apply normalization
    if (updates.ageGroup !== undefined) {
      updates.ageGroup = normalizeOptionalString(updates.ageGroup);
    }
    if (updates.notes !== undefined) {
      updates.notes = normalizeOptionalString(updates.notes);
    }

    // Validate notes length
    if (updates.notes && updates.notes.length > 1000) {
      const error = new Error('Team notes cannot exceed 1000 characters');
      (error as Error & { code: string }).code = 'VALIDATION_ERROR';
      throw error;
    }

    // Validate age group
    const validAgeGroups = ['U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'U19', 'U20', 'U21'];
    if (updates.ageGroup && !validAgeGroups.includes(updates.ageGroup)) {
      const error = new Error(`Invalid age group: ${updates.ageGroup}. Must be one of: ${validAgeGroups.join(', ')}`);
      (error as Error & { code: string }).code = 'VALIDATION_ERROR';
      throw error;
    }

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

import { setTeamRoster, getTeamRoster, addPlayerToRoster, addTeam, duplicateTeam, getTeam, updateTeam, getTeams } from './teams';

// Mock console methods
let consoleErrorSpy: jest.SpyInstance;
let consoleWarnSpy: jest.SpyInstance;

beforeEach(() => {
  mockTeams = {};
  mockRosters = {};
  mockShouldThrow = false;
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
   * Tests preservation of ageGroup and notes when creating a team
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
   * Tests handling of empty ageGroup and notes at the DATA LAYER.
   * Empty strings are normalized to undefined to ensure data consistency.
   * This prevents having two representations of "no value" (undefined vs empty string).
   * @edge-case
   */
  it('should normalize empty ageGroup and notes to undefined', async () => {
    const team = await addTeam({
      name: 'Minimal Team',
      ageGroup: '',
      notes: ''
    });

    // Empty strings are normalized to undefined for data consistency
    expect(team.ageGroup).toBeUndefined();
    expect(team.notes).toBeUndefined();
  });

  /**
   * Tests backwards compatibility with the (|| undefined) pattern.
   * Note: The UI layer (UnifiedTeamModal) no longer uses this pattern since the
   * data layer automatically normalizes empty strings to undefined. However, this
   * test validates that the pattern still works correctly for programmatic access.
   * @edge-case
   */
  it('should handle legacy || undefined pattern for backwards compatibility', async () => {
    const ageGroup = '';
    const notes = '';

    const team = await addTeam({
      name: 'Legacy Pattern Team',
      ageGroup: ageGroup || undefined,
      notes: notes || undefined
    });

    // Both the || undefined pattern and data layer normalization result in undefined
    expect(team.ageGroup).toBeUndefined();
    expect(team.notes).toBeUndefined();
  });

  /**
   * Tests handling of undefined ageGroup and notes
   * @edge-case
   */
  it('should handle undefined ageGroup and notes gracefully', async () => {
    const team = await addTeam({
      name: 'Minimal Team 2'
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
   * Tests that notes cannot exceed the maximum length (1000 characters)
   * @critical
   */
  it('should reject notes that exceed 1000 characters', async () => {
    const tooLongNotes = 'A'.repeat(1001);

    await expect(
      addTeam({
        name: 'Team with Long Notes',
        notes: tooLongNotes
      })
    ).rejects.toThrow('Team notes cannot exceed 1000 characters');
  });

  /**
   * Tests that notes can contain exactly 1000 characters (boundary)
   * @edge-case
   */
  it('should accept notes with exactly 1000 characters', async () => {
    const maxLengthNotes = 'A'.repeat(1000);

    const team = await addTeam({
      name: 'Team with Max Notes',
      notes: maxLengthNotes
    });

    expect(team.notes).toBe(maxLengthNotes);
    expect(team.notes?.length).toBe(1000);
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

  /**
   * Tests that updateTeam also validates notes length
   * @critical
   */
  it('should reject notes that exceed 1000 characters when updating', async () => {
    const team = await addTeam({
      name: 'Team to Update',
      notes: 'Initial notes'
    });

    const tooLongNotes = 'B'.repeat(1001);

    await expect(
      updateTeam(team.id, { notes: tooLongNotes })
    ).rejects.toThrow('Team notes cannot exceed 1000 characters');
  });

  /**
   * Tests that invalid age groups are rejected
   * @critical
   */
  it('should reject invalid age groups', async () => {
    await expect(
      addTeam({
        name: 'Team with Invalid Age Group',
        ageGroup: 'InvalidAgeGroup'
      })
    ).rejects.toThrow(/Invalid age group: InvalidAgeGroup/);

    await expect(
      addTeam({
        name: 'Team with U22',
        ageGroup: 'U22'
      })
    ).rejects.toThrow(/Invalid age group: U22/);
  });

  /**
   * Tests that all valid age groups are accepted
   * This test already exists but validates that ALL age groups pass validation
   * @critical
   */
  it('should accept all valid age groups (U7-U21)', async () => {
    const validAgeGroups = ['U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'U19', 'U20', 'U21'];

    for (const ageGroup of validAgeGroups) {
      const team = await addTeam({
        name: `Valid Team ${ageGroup}`,
        ageGroup
      });

      expect(team.ageGroup).toBe(ageGroup);
    }
  });

  /**
   * Tests that updateTeam also validates age group
   * @critical
   */
  it('should reject invalid age groups when updating', async () => {
    const team = await addTeam({
      name: 'Team to Update Age Group',
      ageGroup: 'U10'
    });

    await expect(
      updateTeam(team.id, { ageGroup: 'InvalidValue' })
    ).rejects.toThrow(/Invalid age group: InvalidValue/);
  });

  /**
   * Tests that undefined age group is allowed
   * @edge-case
   */
  it('should allow undefined age group', async () => {
    const team = await addTeam({
      name: 'Team without Age Group'
      // ageGroup intentionally omitted
    });

    expect(team.ageGroup).toBeUndefined();
  });

  /**
   * Tests that empty string age group is normalized to undefined
   * @edge-case
   */
  it('should normalize empty string age group to undefined', async () => {
    const team = await addTeam({
      name: 'Team with Empty Age Group',
      ageGroup: ''
    });

    expect(team.ageGroup).toBeUndefined();
  });

  /**
   * Tests that whitespace-only fields are trimmed and normalized
   * @edge-case
   */
  it('should trim and normalize whitespace in ageGroup and notes', async () => {
    const team = await addTeam({
      name: 'Team with Whitespace',
      ageGroup: '  U10  ',
      notes: '  Test notes  '
    });

    expect(team.ageGroup).toBe('U10');
    expect(team.notes).toBe('Test notes');
  });

  /**
   * Tests that whitespace-only strings are normalized to undefined
   * @edge-case
   */
  it('should normalize whitespace-only strings to undefined', async () => {
    const team = await addTeam({
      name: 'Team with Whitespace Only',
      ageGroup: '   ',
      notes: '   '
    });

    expect(team.ageGroup).toBeUndefined();
    expect(team.notes).toBeUndefined();
  });

  /**
   * Tests that updateTeam also normalizes empty strings and whitespace
   * @critical
   */
  it('should normalize empty strings and whitespace when updating', async () => {
    const team = await addTeam({
      name: 'Team to Update Normalization',
      ageGroup: 'U10',
      notes: 'Initial notes'
    });

    // Update with empty string - should become undefined
    const updated1 = await updateTeam(team.id, { ageGroup: '', notes: '' });
    expect(updated1?.ageGroup).toBeUndefined();
    expect(updated1?.notes).toBeUndefined();

    // Update with whitespace - should be trimmed
    const updated2 = await updateTeam(team.id, { ageGroup: '  U12  ', notes: '  New notes  ' });
    expect(updated2?.ageGroup).toBe('U12');
    expect(updated2?.notes).toBe('New notes');

    // Update with whitespace-only - should become undefined
    const updated3 = await updateTeam(team.id, { ageGroup: '   ', notes: '   ' });
    expect(updated3?.ageGroup).toBeUndefined();
    expect(updated3?.notes).toBeUndefined();
  });
});
