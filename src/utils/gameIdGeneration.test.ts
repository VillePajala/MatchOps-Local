import { createGame } from './savedGames';
import { AppState } from '@/types';

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    getStore: () => ({ ...store })
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});

// Mock crypto.randomUUID for test environment
const mockRandomUUID = jest.fn(() => 'abcd1234-5678-9abc-def0-123456789abc');

Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: mockRandomUUID
  },
  configurable: true,
  writable: true
});

// Mock logger
jest.mock('./logger', () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('Game ID Generation', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
    // Restore crypto mock after clearAllMocks
    mockRandomUUID.mockReturnValue('abcd1234-5678-9abc-def0-123456789abc');
  });

  const createValidGameData = (): Partial<AppState> => ({
    teamName: 'Test Team',
    opponentName: 'Test Opponent',
    gameDate: '2023-01-01',
    homeScore: 0,
    awayScore: 0,
    homeOrAway: 'home',
    numberOfPeriods: 2,
    periodDurationMinutes: 10,
    currentPeriod: 1,
    gameStatus: 'notStarted'
  });

  it('should generate unique game IDs with timestamp and UUID', async () => {
    const gameData = createValidGameData();
    
    const result = await createGame(gameData);
    
    // Verify ID format: game_timestamp_uuid
    expect(result.gameId).toMatch(/^game_\d+_[a-f0-9]{8}$/);
    
    // Verify timestamp is recent (within last few seconds)
    const parts = result.gameId.split('_');
    const timestamp = parseInt(parts[1], 10);
    const now = Date.now();
    expect(timestamp).toBeGreaterThan(now - 5000); // Within 5 seconds
    expect(timestamp).toBeLessThanOrEqual(now);
    
    // Verify UUID part is present and valid hex
    const uuidPart = parts[2];
    expect(uuidPart).toMatch(/^[a-f0-9]{8}$/);
  });

  it('should generate different IDs for simultaneous game creation', async () => {
    // Mock crypto.randomUUID to return different values
    const originalCrypto = global.crypto;
    const originalRandomUUID = global.crypto?.randomUUID;
    let callCount = 0;
    const mockUUID = () => {
      const uuids = [
        '11111111-2222-3333-4444-555555555555',
        '66666666-7777-8888-9999-aaaaaaaaaaaa',
        'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'
      ];
      return uuids[callCount++] || 'abcd1234-5678-9abc-def0-123456789abc';
    };
    const wasMock = jest.isMockFunction(originalRandomUUID);
    if (wasMock) {
      (global.crypto.randomUUID as jest.Mock).mockImplementation(mockUUID);
    } else {
      const merged = Object.assign({}, originalCrypto, { randomUUID: jest.fn(mockUUID) });
      Object.defineProperty(global, 'crypto', {
        value: merged,
        configurable: true,
        writable: true,
      });
    }

    const gameData = createValidGameData();
    
    // Create multiple games in rapid succession
    const promises = Array.from({ length: 3 }, () => createGame({
      ...gameData,
      teamName: `Team ${Math.random()}` // Make each slightly different
    }));
    
    const results = await Promise.all(promises);
    
    // All IDs should be unique
    const ids = results.map(r => r.gameId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
    
    // Verify each ID has the correct format
    ids.forEach(id => {
      expect(id).toMatch(/^game_\d+_[a-f0-9]{8}$/);
    });
    
    // Verify different UUID parts
    const uuidParts = ids.map(id => id.split('_')[2]);
    const uniqueUuidParts = new Set(uuidParts);
    expect(uniqueUuidParts.size).toBe(3);

    // Restore original crypto/randomUUID
    if (wasMock) {
      (global.crypto.randomUUID as jest.Mock).mockReset();
    } else {
      Object.defineProperty(global, 'crypto', {
        value: originalCrypto,
        configurable: true,
        writable: true,
      });
    }
  });

  it('should maintain backward compatibility with timestamp sorting', async () => {
    const gameData = createValidGameData();
    
    // Mock specific timestamps to ensure ordering
    const originalDateNow = Date.now;
    let timestampCounter = 1000000000000; // Start with a base timestamp
    
    Date.now = jest.fn(() => timestampCounter++);
    
    try {
      // Create games with incrementing timestamps
      const game1 = await createGame({ ...gameData, teamName: 'Game 1' });
      const game2 = await createGame({ ...gameData, teamName: 'Game 2' });
      const game3 = await createGame({ ...gameData, teamName: 'Game 3' });
      
      // Extract timestamps from IDs
      const timestamp1 = parseInt(game1.gameId.split('_')[1], 10);
      const timestamp2 = parseInt(game2.gameId.split('_')[1], 10);
      const timestamp3 = parseInt(game3.gameId.split('_')[1], 10);
      
      // Verify timestamps are sequential
      expect(timestamp2).toBeGreaterThan(timestamp1);
      expect(timestamp3).toBeGreaterThan(timestamp2);
      
      // Verify ID format is maintained
      [game1, game2, game3].forEach(game => {
        expect(game.gameId).toMatch(/^game_\d+_[a-f0-9]{8}$/);
      });
      
    } finally {
      Date.now = originalDateNow;
    }
  });

  it('should handle edge case when crypto.randomUUID is not available', async () => {
    // Temporarily remove crypto.randomUUID
    const originalRandomUUID = global.crypto.randomUUID;
    delete (global.crypto as { randomUUID?: () => string }).randomUUID;
    
    try {
      const gameData = createValidGameData();
      
      // Should fall back gracefully and still create a valid game
      const result = await createGame(gameData);
      
      // Verify it still creates a valid ID with fallback UUID
      expect(result.gameId).toMatch(/^game_\d+_[a-f0-9]{8}$/);
      expect(result.gameData.teamName).toBe('Test Team');
      
    } finally {
      // Restore crypto.randomUUID
      global.crypto.randomUUID = originalRandomUUID;
    }
  });

  it('should generate valid game data with unique ID', async () => {
    const gameData = createValidGameData();
    
    const result = await createGame(gameData);
    
    // Verify the game data structure
    expect(result.gameData).toMatchObject({
      teamName: 'Test Team',
      opponentName: 'Test Opponent',
      gameDate: '2023-01-01',
      homeScore: 0,
      awayScore: 0,
      homeOrAway: 'home',
      numberOfPeriods: 2,
      periodDurationMinutes: 10,
      currentPeriod: 1,
      gameStatus: 'notStarted'
    });
    
    // Verify required arrays are initialized
    expect(Array.isArray(result.gameData.playersOnField)).toBe(true);
    expect(Array.isArray(result.gameData.gameEvents)).toBe(true);
    expect(Array.isArray(result.gameData.selectedPlayerIds)).toBe(true);
    
    // Verify ID is properly set and unique format
    expect(result.gameId).toMatch(/^game_\d+_[a-f0-9]{8}$/);
  });
});
