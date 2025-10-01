// Mock storage module FIRST - uses __mocks__/storage.ts for in-memory storage
jest.mock('./storage');

import { importGamesFromJson } from './savedGames';
import { AppState } from '@/types';
import type { ZodIssue } from 'zod';
import { appStateSchema } from './appStateSchema';

// Import mock utilities from the mocked module (not from __mocks__ directly)
// This ensures we get the same instance that jest.mock() creates
const storageModule = require('./storage');
const { clearMockStore, getMockStore, setStorageItem: mockSetStorageItem } = storageModule;

// Mock localStorage with proper cleanup to prevent memory leaks
let mockLocalStorageStore: Record<string, string> = {};

const mockLocalStorage = {
  getItem: jest.fn((key: string) => mockLocalStorageStore[key] || null),
  setItem: jest.fn((key: string, value: string) => {
    mockLocalStorageStore[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete mockLocalStorageStore[key];
  }),
  clear: jest.fn(() => {
    mockLocalStorageStore = {};
  }),
  getStore: () => ({ ...mockLocalStorageStore })
};

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  configurable: true
});

// Mock logger
jest.mock('./logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }))
}));

describe('Game Import with Partial Success', () => {
  beforeEach(() => {
    // Note: clearMockStore() is NOT called here because it interferes with async operations
    // The mock store will be empty initially, and tests should handle existing data if needed
    mockLocalStorage.clear(); // Keep for legacy if needed
    jest.clearAllTimers(); // Clear any pending timers
    // Note: jest.clearAllMocks() would reset our storage mock implementations
    // Instead, we only clear mocks that we explicitly create in tests
  });

  afterEach(() => {
    // Clean up to prevent memory leaks
    clearMockStore();
    mockLocalStorage.clear();
    mockLocalStorageStore = {}; // Explicitly clear the store to break references
    jest.clearAllTimers();
  });

  // Helper to validate test data against schema
  const validateTestData = (data: unknown, label: string) => {
    const validation = appStateSchema.safeParse(data);
    if (!validation.success) {
      const errors = validation.error.errors.map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`${label} failed validation: ${errors}`);
    }
  };

  // Use EXACT structure from savedGames.test.ts mockBaseAppState that we know works
  const createValidGameData = (gameId: string, teamName: string = 'Test Team'): AppState => {
    return {
      playersOnField: [],
      opponents: [],
      drawings: [],
      availablePlayers: [],
      showPlayerNames: true,
      teamName,
      gameEvents: [],
      opponentName: 'Opponent',
      gameDate: '2023-01-01',
      homeScore: 0,
      awayScore: 0,
      gameNotes: '',
      homeOrAway: 'home',
      numberOfPeriods: 2,
      periodDurationMinutes: 10,
      currentPeriod: 1,
      gameStatus: 'notStarted',
      selectedPlayerIds: [],
      assessments: {},
      seasonId: '',
      tournamentId: '',
      gameLocation: 'Test Stadium',
      gameTime: '15:00',
      subIntervalMinutes: 5,
      completedIntervalDurations: [],
      lastSubConfirmationTimeSeconds: 0,
      tacticalDiscs: [],
      tacticalDrawings: [],
      tacticalBallPosition: { relX: 0, relY: 0 }
    };
  };

  describe('test data validation', () => {
    it('should validate that createValidGameData produces valid AppState', () => {
      const testData = createValidGameData('test-id', 'Test Team');

      // This will throw with descriptive error if validation fails
      validateTestData(testData, 'createValidGameData output');

      // If we get here, validation passed
      expect(testData.teamName).toBe('Test Team');
    });
  });

  describe('successful imports', () => {
    it('should import all valid games successfully', async () => {
      const validGames = {
        'game1': createValidGameData('game1', 'Team A'),
        'game2': createValidGameData('game2', 'Team B'),
        'game3': createValidGameData('game3', 'Team C')
      };

      const result = await importGamesFromJson(JSON.stringify(validGames));

      // Provide detailed error message if validation failed
      if (result.successful !== 3) {
        const errorDetails = result.failed.map(f => `  ${f.gameId}: ${f.error}`).join('\n');
        fail(`Expected 3 successful imports but got ${result.successful}.\nValidation errors:\n${errorDetails}`);
      }

      expect(result.successful).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.failed).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle single game format', async () => {
      const singleGame = {
        ...createValidGameData('single-game', 'Single Team'),
        id: 'single-game' // Single game format needs id field
      };
      
      const result = await importGamesFromJson(JSON.stringify(singleGame));

      expect(result.successful).toBe(1);
      expect(result.failed).toHaveLength(0);
    });

    it('should handle full export format', async () => {
      const exportFormat = {
        savedSoccerGames: {
          'export-game': createValidGameData('export-game', 'Export Team')
        }
      };

      const result = await importGamesFromJson(JSON.stringify(exportFormat));

      expect(result.successful).toBe(1);
      expect(result.failed).toHaveLength(0);
    });
  });

  describe('partial import scenarios', () => {
    it('should import valid games and skip invalid ones', async () => {
      const mixedGames = {
        'valid-game': createValidGameData('valid-game', 'Valid Team'),
        'invalid-game-1': {
          id: 'invalid-game-1',
          // Missing teamName and opponentName
          homeScore: 0,
          awayScore: 0
        },
        'invalid-game-2': {
          id: 'invalid-game-2',
          teamName: 'Test Team',
          opponentName: 'Opponent',
          // Invalid negative scores
          homeScore: -1,
          awayScore: -2,
          gameDate: '2023-01-01',
          homeOrAway: 'home',
          numberOfPeriods: 2,
          periodDurationMinutes: 10,
          currentPeriod: 1,
          gameStatus: 'notStarted'
        },
        'another-valid-game': createValidGameData('another-valid-game', 'Another Team')
      };

      const result = await importGamesFromJson(JSON.stringify(mixedGames));

      // Provide detailed error message if validation failed for valid games
      if (result.successful !== 2) {
        const allErrors = result.failed.map(f => `  ${f.gameId}: ${f.error}`).join('\n');
        fail(`Expected 2 successful imports but got ${result.successful}.\nAll validation errors:\n${allErrors}`);
      }

      expect(result.successful).toBe(2); // Two valid games imported
      expect(result.failed).toHaveLength(2); // Two invalid games failed
      expect(result.skipped).toBe(0);

      // Check that valid games were actually saved to IndexedDB mock store
      const savedData = getMockStore();
      expect(savedData['savedSoccerGames']).toBeDefined();
      const parsedSaved = JSON.parse(savedData['savedSoccerGames']);
      expect(parsedSaved['valid-game']).toBeDefined();
      expect(parsedSaved['another-valid-game']).toBeDefined();
      expect(parsedSaved['invalid-game-1']).toBeUndefined();
      expect(parsedSaved['invalid-game-2']).toBeUndefined();
    });

    it('should provide detailed error messages for failed imports', async () => {
      const invalidGames = {
        'missing-team': {
          id: 'missing-team',
          opponentName: 'Opponent',
          gameDate: '2023-01-01',
          homeOrAway: 'home',
          homeScore: 0,
          awayScore: 0
          // teamName missing - this will fail schema validation first
        },
        'invalid-duration': createValidGameData('invalid-duration', 'Test Team'),
        'negative-score': createValidGameData('negative-score', 'Test Team')
      };

      // Make specific games invalid
      invalidGames['invalid-duration'].periodDurationMinutes = 200; // Too long
      invalidGames['negative-score'].homeScore = -5; // Negative

      const result = await importGamesFromJson(JSON.stringify(invalidGames));

      expect(result.successful).toBe(0);
      expect(result.failed).toHaveLength(3);
      
      // Check error messages are descriptive
      const errorMessages = result.failed.map(f => f.error);
      console.log('Error messages:', errorMessages); // Debug output
      
      // The schema validation will catch missing fields first
      // But our custom validation should catch specific issues
      expect(result.failed.length).toBe(3);
      expect(errorMessages.some(msg => msg.includes('period duration') || msg.includes('teamName'))).toBe(true);
      expect(errorMessages.some(msg => msg.includes('Score cannot be negative'))).toBe(true);
    });

    it('should handle existing games with overwrite options', async () => {
      // First, import some games
      const existingGames = {
        'existing-1': createValidGameData('existing-1', 'Existing Team 1'),
        'existing-2': createValidGameData('existing-2', 'Existing Team 2')
      };
      await importGamesFromJson(JSON.stringify(existingGames));

      // Now try to import again with some overlapping games
      const newImport = {
        'existing-1': createValidGameData('existing-1', 'Updated Team 1'), // Exists
        'new-game': createValidGameData('new-game', 'New Team'), // New
        'existing-2': createValidGameData('existing-2', 'Updated Team 2') // Exists
      };

      // Import without overwrite - should skip existing
      const resultNoOverwrite = await importGamesFromJson(JSON.stringify(newImport), false);
      expect(resultNoOverwrite.successful).toBe(1); // Only new-game
      expect(resultNoOverwrite.skipped).toBe(2); // Both existing games
      expect(resultNoOverwrite.warnings).toHaveLength(2);

      // Import with overwrite - should update existing
      const resultWithOverwrite = await importGamesFromJson(JSON.stringify(newImport), true);
      expect(resultWithOverwrite.successful).toBe(3); // All games
      expect(resultWithOverwrite.skipped).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON gracefully', async () => {
      const invalidJson = '{ invalid json }';

      await expect(importGamesFromJson(invalidJson)).rejects.toThrow(/Failed to parse import file/);
    });

    it('should handle completely invalid data format', async () => {
      const invalidData = JSON.stringify('not an object');

      await expect(importGamesFromJson(invalidData)).rejects.toThrow(/Invalid JSON data format/);
    });

    it('should handle empty objects', async () => {
      const emptyData = JSON.stringify({});

      const result = await importGamesFromJson(emptyData);

      expect(result.successful).toBe(0);
      expect(result.failed).toHaveLength(0);
      expect(result.skipped).toBe(0);
    });

    it('should handle null values in games', async () => {
      const gamesWithNull = {
        'valid-game': createValidGameData('valid-game', 'Valid Team'),
        'null-game': null
      };

      const result = await importGamesFromJson(JSON.stringify(gamesWithNull));

      // Provide detailed error message if validation failed for valid game
      if (result.successful !== 1) {
        const errorDetails = result.failed.map(f => `  ${f.gameId}: ${f.error}`).join('\n');
        fail(`Expected 1 successful import but got ${result.successful}.\nValidation errors:\n${errorDetails}`);
      }

      expect(result.successful).toBe(1); // Valid game imported
      expect(result.failed).toHaveLength(1); // Null game failed
    });
  });

  describe('data integrity checks', () => {
    it('should reject games with invalid score values', async () => {
      const invalidScoreGames = {
        'negative-home': {
          ...createValidGameData('negative-home', 'Test Team'),
          homeScore: -1
        },
        'negative-away': {
          ...createValidGameData('negative-away', 'Test Team'),
          awayScore: -5
        },
        'valid-scores': createValidGameData('valid-scores', 'Test Team')
      };

      const result = await importGamesFromJson(JSON.stringify(invalidScoreGames));

      expect(result.successful).toBe(1); // Only valid-scores
      expect(result.failed).toHaveLength(2);
      expect(result.failed.every(f => f.error.includes('Score cannot be negative'))).toBe(true);
    });

    it('should reject games with invalid period durations', async () => {
      const invalidDurationGames = {
        'too-short': {
          ...createValidGameData('too-short', 'Test Team'),
          periodDurationMinutes: 0
        },
        'too-long': {
          ...createValidGameData('too-long', 'Test Team'),
          periodDurationMinutes: 150
        },
        'valid-duration': createValidGameData('valid-duration', 'Test Team')
      };

      const result = await importGamesFromJson(JSON.stringify(invalidDurationGames));

      expect(result.successful).toBe(1); // Only valid-duration
      expect(result.failed).toHaveLength(2);
      expect(result.failed.some(f => f.error.includes('Period duration must be at least 1 minute'))).toBe(true);
      expect(result.failed.some(f => f.error.includes('Period duration cannot exceed 120 minutes'))).toBe(true);
    });

    it('should reject games missing required fields', async () => {
      const missingFieldsGames = {
        'missing-team-name': {
          ...createValidGameData('missing-team-name', ''),
          teamName: '' // Empty team name
        },
        'missing-opponent': {
          ...createValidGameData('missing-opponent', 'Test Team'),
          opponentName: '' // Empty opponent name
        },
        'valid-game': createValidGameData('valid-game', 'Test Team')
      };

      const result = await importGamesFromJson(JSON.stringify(missingFieldsGames));

      expect(result.successful).toBe(1); // Only valid-game
      expect(result.failed).toHaveLength(2);
      expect(result.failed.some(f => f.error.includes('Team name is required'))).toBe(true);
      expect(result.failed.some(f => f.error.includes('Opponent name is required'))).toBe(true);
    });
  });

  describe('large dataset handling', () => {
    it('should handle importing many games efficiently', async () => {
      const manyGames: Record<string, AppState> = {};
      const totalGames = 100;
      const invalidEvery = 10; // Every 10th game is invalid

      for (let i = 1; i <= totalGames; i++) {
        const gameId = `game-${i}`;
        const gameData = createValidGameData(gameId, `Team ${i}`);
        
        // Make every 10th game invalid
        if (i % invalidEvery === 0) {
          gameData.homeScore = -1; // Invalid score
        }
        
        manyGames[gameId] = gameData;
      }

      const result = await importGamesFromJson(JSON.stringify(manyGames));

      const expectedValid = totalGames - (totalGames / invalidEvery);
      const expectedInvalid = totalGames / invalidEvery;

      expect(result.successful).toBe(expectedValid);
      expect(result.failed).toHaveLength(expectedInvalid);
      expect(result.skipped).toBe(0);
    });
  });

  describe('backward compatibility', () => {
    it('should maintain compatibility with existing import patterns', async () => {
      // Test that the new function works with old-style data
      const legacyFormat = {
        'legacy-game': {
          id: 'legacy-game',
          teamName: 'Legacy Team',
          opponentName: 'Legacy Opponent',
          homeScore: 2,
          awayScore: 1,
          gameDate: '2023-01-01',
          gameNotes: '',
          homeOrAway: 'home',
          numberOfPeriods: 2,
          periodDurationMinutes: 15,
          currentPeriod: 2,
          gameStatus: 'gameEnd',
          selectedPlayerIds: [],
          seasonId: '',
          tournamentId: '',
          gameEvents: [],
          subIntervalMinutes: 5,
          completedIntervalDurations: [],
          lastSubConfirmationTimeSeconds: 0,
          playersOnField: [],
          opponents: [],
          drawings: [],
          availablePlayers: [],
          showPlayerNames: true,
          tacticalDiscs: [],
          tacticalDrawings: [],
          tacticalBallPosition: { relX: 0.5, relY: 0.5 }
        }
      };

      const result = await importGamesFromJson(JSON.stringify(legacyFormat));

      expect(result.successful).toBe(1);
      expect(result.failed).toHaveLength(0);
    });
  });
});