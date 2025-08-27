import { setTeamRoster, getTeamRoster, addPlayerToRoster } from './teams';
import { TeamPlayer } from '@/types';

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage
});

describe('Teams Lock Integration', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  const createTestPlayer = (id: string, name: string): TeamPlayer => ({
    id,
    name,
    isGoalie: false,
    jerseyNumber: id,
    notes: '',
    position: { relX: 0.5, relY: 0.5 }
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