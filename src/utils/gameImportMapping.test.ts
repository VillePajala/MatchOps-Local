/**
 * Tests for importGamesWithMapping and importGamesFromFile functions
 * @critical - Data import with player roster integration and file handling
 */

// Mock modules BEFORE any imports
jest.mock('./savedGames', () => ({
  getSavedGames: jest.fn(),
  saveGames: jest.fn()
}));

jest.mock('./masterRosterManager', () => ({
  getMasterRoster: jest.fn()
}));

jest.mock('./gameImportHelper', () => ({
  processImportedGames: jest.fn()
}));

jest.mock('./logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

import { importGamesWithMapping, importGamesFromFile } from './gameImport';
import * as savedGamesModule from './savedGames';
import * as masterRosterModule from './masterRosterManager';
import * as gameImportHelperModule from './gameImportHelper';
import { AppState } from '@/types';

// Get mocked functions with proper types
const mockedSavedGames = savedGamesModule as jest.Mocked<typeof savedGamesModule>;
const mockedMasterRoster = masterRosterModule as jest.Mocked<typeof masterRosterModule>;
const mockedGameImportHelper = gameImportHelperModule as jest.Mocked<typeof gameImportHelperModule>;

// Helper to create valid game data for testing
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

describe('importGamesWithMapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    mockedSavedGames.getSavedGames.mockResolvedValue({});
    mockedSavedGames.saveGames.mockResolvedValue(undefined);
    mockedMasterRoster.getMasterRoster.mockResolvedValue([]);
    mockedGameImportHelper.processImportedGames.mockImplementation(
      (games) => ({
        processedGames: games,
        mappingReport: {
          totalGames: Object.keys(games).length,
          gamesWithMappedPlayers: 0,
          totalPlayerMappings: 0,
          exactMatches: 0,
          nameMatches: 0,
          noMatches: 0
        }
      })
    );
  });

  describe('JSON format handling', () => {
    it('should handle savedSoccerGames format', async () => {
      const jsonData = JSON.stringify({
        savedSoccerGames: {
          'game-1': createValidGameData('game-1', 'Team A')
        }
      });

      const result = await importGamesWithMapping(jsonData);

      expect(result.success).toBe(true);
      expect(result.successful).toBe(1);
      expect(mockedSavedGames.saveGames).toHaveBeenCalled();
    });

    it('should handle localStorage.savedSoccerGames format', async () => {
      const jsonData = JSON.stringify({
        localStorage: {
          savedSoccerGames: {
            'game-1': createValidGameData('game-1', 'Team A')
          }
        }
      });

      const result = await importGamesWithMapping(jsonData);

      expect(result.success).toBe(true);
      expect(result.successful).toBe(1);
    });

    it('should handle direct object format', async () => {
      const jsonData = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A'),
        'game-2': createValidGameData('game-2', 'Team B')
      });

      const result = await importGamesWithMapping(jsonData);

      expect(result.success).toBe(true);
      expect(result.successful).toBe(2);
    });

    it('should reject invalid JSON', async () => {
      const result = await importGamesWithMapping('{ invalid json }');

      expect(result.success).toBe(false);
      expect(result.warnings).toContain('Failed to parse JSON data');
    });

    it('should reject non-object JSON (string)', async () => {
      const result = await importGamesWithMapping(JSON.stringify('not an object'));

      // A string is technically truthy and typeof 'object' === false
      // The function will try to treat it as games object and fail or return empty
      expect(result.success).toBe(false);
    });

    it('should handle null JSON gracefully', async () => {
      const result = await importGamesWithMapping(JSON.stringify(null));

      expect(result.success).toBe(false);
    });
  });

  describe('overwrite behavior', () => {
    beforeEach(() => {
      mockedSavedGames.getSavedGames.mockResolvedValue({
        'existing-game': createValidGameData('existing-game', 'Existing Team')
      });
    });

    it('should skip existing games when overwrite is false', async () => {
      const jsonData = JSON.stringify({
        'existing-game': createValidGameData('existing-game', 'Updated Team'),
        'new-game': createValidGameData('new-game', 'New Team')
      });

      const result = await importGamesWithMapping(jsonData, false);

      expect(result.success).toBe(true);
      expect(result.successful).toBe(1); // Only new-game
      expect(result.skipped).toBe(1); // existing-game skipped
    });

    it('should overwrite existing games when overwrite is true', async () => {
      const jsonData = JSON.stringify({
        'existing-game': createValidGameData('existing-game', 'Updated Team'),
        'new-game': createValidGameData('new-game', 'New Team')
      });

      const result = await importGamesWithMapping(jsonData, true);

      expect(result.success).toBe(true);
      expect(result.successful).toBe(2); // Both games
      expect(result.skipped).toBe(0);
    });
  });

  describe('cache invalidation', () => {
    it('should call invalidateCache callback on successful import', async () => {
      const invalidateCache = jest.fn();
      const jsonData = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A')
      });

      await importGamesWithMapping(jsonData, false, invalidateCache);

      expect(invalidateCache).toHaveBeenCalledTimes(1);
    });

    it('should not call invalidateCache if save fails', async () => {
      mockedSavedGames.saveGames.mockRejectedValue(new Error('Storage quota exceeded'));
      const invalidateCache = jest.fn();
      const jsonData = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A')
      });

      const result = await importGamesWithMapping(jsonData, false, invalidateCache);

      expect(result.success).toBe(false);
      expect(invalidateCache).not.toHaveBeenCalled();
    });

    it('should work without invalidateCache callback', async () => {
      const jsonData = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A')
      });

      const result = await importGamesWithMapping(jsonData, false);

      expect(result.success).toBe(true);
    });
  });

  describe('player mapping integration', () => {
    it('should pass roster to processImportedGames', async () => {
      const mockRoster = [
        { id: 'player-1', name: 'John', jerseyNumber: '10', teamId: 'team-1' }
      ];
      mockedMasterRoster.getMasterRoster.mockResolvedValue(mockRoster);

      const jsonData = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A')
      });

      await importGamesWithMapping(jsonData);

      expect(mockedGameImportHelper.processImportedGames).toHaveBeenCalledWith(
        expect.any(Object),
        mockRoster
      );
    });

    it('should continue import even if roster loading fails', async () => {
      mockedMasterRoster.getMasterRoster.mockRejectedValue(new Error('Roster load failed'));

      const jsonData = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A')
      });

      const result = await importGamesWithMapping(jsonData);

      expect(result.success).toBe(true);
      expect(mockedGameImportHelper.processImportedGames).toHaveBeenCalledWith(
        expect.any(Object),
        [] // Empty roster due to error
      );
    });

    it('should include mapping report in result', async () => {
      mockedGameImportHelper.processImportedGames.mockReturnValue({
        processedGames: { 'game-1': createValidGameData('game-1', 'Team A') },
        mappingReport: {
          totalGames: 1,
          gamesWithMappedPlayers: 1,
          totalPlayerMappings: 5,
          exactMatches: 3,
          nameMatches: 2,
          noMatches: 0
        }
      });

      const jsonData = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A')
      });

      const result = await importGamesWithMapping(jsonData);

      expect(result.mappingReport).toEqual({
        totalGames: 1,
        gamesWithMappedPlayers: 1,
        totalPlayerMappings: 5,
        exactMatches: 3,
        nameMatches: 2,
        noMatches: 0
      });
    });
  });

  describe('error handling', () => {
    it('should handle getSavedGames failure gracefully', async () => {
      mockedSavedGames.getSavedGames.mockRejectedValue(new Error('Storage error'));

      const jsonData = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A')
      });

      const result = await importGamesWithMapping(jsonData);

      // Should still succeed as it falls back to empty games
      expect(result.success).toBe(true);
    });

    it('should handle saveGames failure', async () => {
      mockedSavedGames.saveGames.mockRejectedValue(new Error('Save failed'));

      const jsonData = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A')
      });

      const result = await importGamesWithMapping(jsonData);

      expect(result.success).toBe(false);
      expect(result.warnings.some(w => w.includes('Failed to save'))).toBe(true);
    });

    it('should return empty result for empty games object', async () => {
      const jsonData = JSON.stringify({});

      mockedGameImportHelper.processImportedGames.mockReturnValue({
        processedGames: {},
        mappingReport: {
          totalGames: 0,
          gamesWithMappedPlayers: 0,
          totalPlayerMappings: 0,
          exactMatches: 0,
          nameMatches: 0,
          noMatches: 0
        }
      });

      const result = await importGamesWithMapping(jsonData);

      expect(result.success).toBe(true);
      expect(result.successful).toBe(0);
    });
  });

  describe('multiple games import', () => {
    it('should import multiple games at once', async () => {
      const jsonData = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A'),
        'game-2': createValidGameData('game-2', 'Team B'),
        'game-3': createValidGameData('game-3', 'Team C')
      });

      const result = await importGamesWithMapping(jsonData);

      expect(result.success).toBe(true);
      expect(result.successful).toBe(3);
    });
  });
});

describe('importGamesFromFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    mockedSavedGames.getSavedGames.mockResolvedValue({});
    mockedSavedGames.saveGames.mockResolvedValue(undefined);
    mockedMasterRoster.getMasterRoster.mockResolvedValue([]);
    mockedGameImportHelper.processImportedGames.mockImplementation(
      (games) => ({
        processedGames: games,
        mappingReport: {
          totalGames: Object.keys(games).length,
          gamesWithMappedPlayers: 0,
          totalPlayerMappings: 0,
          exactMatches: 0,
          nameMatches: 0,
          noMatches: 0
        }
      })
    );
  });

  // Helper to create a mock File object
  const createMockFile = (content: string, name: string = 'games.json'): File => {
    const blob = new Blob([content], { type: 'application/json' });
    return new File([blob], name, { type: 'application/json' });
  };

  describe('successful file import', () => {
    it('should import games from a valid JSON file', async () => {
      const fileContent = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A')
      });
      const file = createMockFile(fileContent);

      const result = await importGamesFromFile(file);

      expect(result.success).toBe(true);
      expect(result.successful).toBe(1);
    });

    it('should pass overwrite flag correctly', async () => {
      const fileContent = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A')
      });

      // Setup existing game
      mockedSavedGames.getSavedGames.mockResolvedValue({
        'game-1': createValidGameData('game-1', 'Existing Team')
      });

      const file1 = createMockFile(fileContent);
      const resultNoOverwrite = await importGamesFromFile(file1, false);
      expect(resultNoOverwrite.skipped).toBe(1);

      const file2 = createMockFile(fileContent);
      const resultWithOverwrite = await importGamesFromFile(file2, true);
      expect(resultWithOverwrite.successful).toBe(1);
    });

    it('should call invalidateCache after successful import', async () => {
      const fileContent = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A')
      });
      const file = createMockFile(fileContent);
      const invalidateCache = jest.fn();

      await importGamesFromFile(file, false, invalidateCache);

      expect(invalidateCache).toHaveBeenCalledTimes(1);
    });
  });

  describe('file reading errors', () => {
    it('should handle empty file content', async () => {
      const file = createMockFile('');

      const result = await importGamesFromFile(file);

      expect(result.success).toBe(false);
    });

    it('should handle file read error', async () => {
      const file = createMockFile('{}');

      // Mock FileReader to trigger error
      const originalFileReader = global.FileReader;
      const mockFileReader = {
        readAsText: jest.fn(),
        onerror: null as (() => void) | null,
        onload: null as ((e: ProgressEvent<FileReader>) => void) | null,
        result: null
      };

      // @ts-expect-error - mocking FileReader
      global.FileReader = jest.fn(() => mockFileReader);

      const resultPromise = importGamesFromFile(file);

      // Trigger the error callback
      if (mockFileReader.onerror) {
        mockFileReader.onerror();
      }

      const result = await resultPromise;

      global.FileReader = originalFileReader;

      expect(result.success).toBe(false);
      expect(result.warnings).toContain('Failed to read file');
    });

    it('should handle null file content result', async () => {
      const file = createMockFile('{}');

      const originalFileReader = global.FileReader;
      const mockFileReader = {
        readAsText: jest.fn(),
        onerror: null as (() => void) | null,
        onload: null as ((e: ProgressEvent<FileReader>) => void) | null,
        result: null
      };

      // @ts-expect-error - mocking FileReader
      global.FileReader = jest.fn(() => mockFileReader);

      const resultPromise = importGamesFromFile(file);

      // Trigger onload with null result
      if (mockFileReader.onload) {
        mockFileReader.onload({ target: { result: null } } as ProgressEvent<FileReader>);
      }

      const result = await resultPromise;

      global.FileReader = originalFileReader;

      expect(result.success).toBe(false);
      expect(result.warnings).toContain('Failed to read file content');
    });
  });

  describe('import processing errors', () => {
    it('should handle JSON parse errors from file content', async () => {
      const file = createMockFile('{ invalid json }');

      const result = await importGamesFromFile(file);

      expect(result.success).toBe(false);
      expect(result.warnings.some(w => w.includes('Failed to parse'))).toBe(true);
    });

    it('should handle save errors gracefully', async () => {
      mockedSavedGames.saveGames.mockRejectedValue(new Error('Storage full'));

      const fileContent = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A')
      });
      const file = createMockFile(fileContent);

      const result = await importGamesFromFile(file);

      expect(result.success).toBe(false);
      expect(result.warnings.some(w => w.includes('Failed to save'))).toBe(true);
    });
  });

  describe('multiple games import', () => {
    it('should import multiple games from file', async () => {
      const fileContent = JSON.stringify({
        'game-1': createValidGameData('game-1', 'Team A'),
        'game-2': createValidGameData('game-2', 'Team B'),
        'game-3': createValidGameData('game-3', 'Team C')
      });
      const file = createMockFile(fileContent);

      const result = await importGamesFromFile(file);

      expect(result.success).toBe(true);
      expect(result.successful).toBe(3);
    });
  });
});
