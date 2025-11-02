import { setTeamRoster, getTeamRoster, addPlayerToRoster, addTeam, duplicateTeam, getTeam } from './teams';
import { TeamPlayer } from '@/types';
import { clearMockStore } from './__mocks__/storage';

// Auto-mock the storage module
jest.mock('./storage');

describe('Teams Lock Integration', () => {
  beforeEach(() => {
    // Clear the mock store
    clearMockStore();
  });

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

describe('Team metadata fields', () => {
  beforeEach(() => {
    clearMockStore();
  });

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
   * Tests handling of empty ageGroup and notes
   * @edge-case
   */
  it('should handle empty ageGroup and notes gracefully', async () => {
    const team = await addTeam({
      name: 'Minimal Team',
      ageGroup: '',
      notes: ''
    });

    // Empty strings are preserved as-is
    expect(team.ageGroup).toBe('');
    expect(team.notes).toBe('');
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
   * Tests that all age groups are valid
   * @edge-case
   */
  it('should handle all valid age groups', async () => {
    const ageGroups = ['U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'U19', 'U20', 'U21'];

    for (const ageGroup of ageGroups) {
      const team = await addTeam({
        name: `Team ${ageGroup}`,
        ageGroup
      });

      expect(team.ageGroup).toBe(ageGroup);
    }
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
});
