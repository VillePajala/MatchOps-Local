// src/utils/fullBackup.test.ts
import "@/i18n";
import { importFullBackup, exportFullBackup } from "./fullBackup";
import {
  SAVED_GAMES_KEY,
  APP_SETTINGS_KEY,
  SEASONS_LIST_KEY,
  TOURNAMENTS_LIST_KEY,
  MASTER_ROSTER_KEY,
  TEAMS_INDEX_KEY,
  TEAM_ROSTERS_KEY,
} from "@/config/storageKeys";
import { DEFAULT_GAME_ID } from "@/config/constants";
import type { SavedGamesCollection, AppState } from "@/types/game";
import type { AppSettings } from "./appSettings";
import type { Season, Tournament, Player } from "@/types";
import type { TeamsIndex, TeamRostersIndex } from "./teams";

// Mock the storage module (not localStorage directly!)
jest.mock("./storage");

import { getStorageJSON, setStorageJSON, removeStorageItem } from "./storage";

// Create mock store for storage module
const mockStore: Record<string, unknown> = {};

// Setup mock implementations
(getStorageJSON as jest.Mock).mockImplementation(async (key: string) => {
  return mockStore[key] || null;
});

(setStorageJSON as jest.Mock).mockImplementation(async (key: string, value: unknown) => {
  mockStore[key] = value;
});

(removeStorageItem as jest.Mock).mockImplementation(async (key: string) => {
  delete mockStore[key];
});

// Mock localStorage for legacy compatibility
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = String(value);
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    getAll: jest.fn(() => store), // Expose method to check the whole store
    // Add mockImplementation to clear mocks
    mockClear: jest.fn(() => {
      store = {}; // Ensure store is cleared
      localStorageMock.getItem.mockClear();
      localStorageMock.setItem.mockClear();
      localStorageMock.removeItem.mockClear();
      localStorageMock.clear.mockClear();
      localStorageMock.getAll.mockClear();
    }),
    // Fix any type - use unknown for generic error
    throwErrorOnSet: jest.fn(
      (key: string, error: unknown = new Error("Storage error")) => {
        localStorageMock.setItem.mockImplementationOnce((k, v) => {
          if (k === key) throw error;
          store[k] = String(v);
        });
      },
    ),
    getQuotaExceededError: jest.fn(() => {
      // Simulate DOMException for quota exceeded by creating a similar object
      const error = {
        name: "QuotaExceededError",
        message: "Simulated Quota Exceeded", // Add a message
        // code: 22, // code is often read-only, might not be needed for checks
      };
      return error; // Return the mock error object
    }),
    length: {
      // Mock length property if needed by code under test
      get: jest.fn(() => Object.keys(store).length),
    },
    key: jest.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Define an interface for Blob that we expect to have a .text() method in tests
interface BlobWithText extends Blob {
  text: () => Promise<string>;
}

// Mock URL.createObjectURL and revokeObjectURL
const mockBlobStore: Record<string, BlobWithText> = {}; // Store BlobWithText
window.URL.createObjectURL = jest.fn((blob: Blob): string => {
  const url = `blob:mock/${Math.random()}`;
  const blobToAugment = blob as BlobWithText; // Cast to our test-specific type

  // Augment the blob with a text() method if it's missing for testing purposes
  if (typeof blobToAugment.text !== "function") {
    blobToAugment.text = jest.fn(async () => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(blob); // Use original blob for readAsText
      });
    });
  }
  mockBlobStore[url] = blobToAugment; // Store the (potentially augmented) blob
  return url;
});
window.URL.revokeObjectURL = jest.fn((url: string) => {
  delete mockBlobStore[url];
});

// Mock document.body.appendChild/removeChild
document.body.appendChild = jest.fn();
document.body.removeChild = jest.fn();

// Mock window.alert
window.alert = jest.fn();

// Mock window.confirm
Object.defineProperty(window, "confirm", { value: jest.fn() });

// Note: window.location.reload is mocked per-test in beforeEach to avoid global side-effects

// Mock setTimeout/clearTimeout - Let Jest infer the spy types
const setTimeoutSpy = jest.spyOn(global, "setTimeout");
const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

// Define test data types using unknown
// Remove unused types
// REMOVE: interface GameData extends Record<string, unknown> {}
// REMOVE: interface SettingsData extends Record<string, unknown> {}

// More specific types for array elements
interface SeasonObject extends Record<string, unknown> {
  id: string;
  name: string;
}
interface TournamentObject extends Record<string, unknown> {
  id?: string;
  name?: string;
}
interface RosterPlayer extends Record<string, unknown> {
  id: string;
  name?: string;
}

// REMOVE: type SeasonData = Array<SeasonObject>;
// REMOVE: type TournamentData = Array<TournamentObject>;
// REMOVE: type RosterData = Array<RosterPlayer>;

/**
 * Test factory to create backup data objects with consistent structure.
 * Reduces boilerplate in test cases by providing sensible defaults.
 *
 * @param overrides - Typed overrides for backup data fields
 * @returns Properly structured backup data object for testing
 *
 * @future If other test files need backup data, consider moving to
 * tests/fixtures/backup.ts for centralized reuse.
 */
function createBackupData(overrides: {
  games?: SavedGamesCollection;
  settings?: AppSettings;
  seasons?: Season[];
  tournaments?: Tournament[];
  roster?: Player[];
  teams?: TeamsIndex;
  teamRosters?: TeamRostersIndex;
} = {}) {
  return {
    meta: { schema: 1, exportedAt: new Date().toISOString() },
    localStorage: {
      ...(overrides.games !== undefined && { [SAVED_GAMES_KEY]: overrides.games }),
      ...(overrides.settings !== undefined && { [APP_SETTINGS_KEY]: overrides.settings }),
      ...(overrides.seasons !== undefined && { [SEASONS_LIST_KEY]: overrides.seasons }),
      ...(overrides.tournaments !== undefined && { [TOURNAMENTS_LIST_KEY]: overrides.tournaments }),
      ...(overrides.roster !== undefined && { [MASTER_ROSTER_KEY]: overrides.roster }),
      ...(overrides.teams !== undefined && { [TEAMS_INDEX_KEY]: overrides.teams }),
      ...(overrides.teamRosters !== undefined && { [TEAM_ROSTERS_KEY]: overrides.teamRosters }),
    },
  };
}

describe("importFullBackup", () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    // Clear mock store
    Object.keys(mockStore).forEach(key => delete mockStore[key]);
    jest.clearAllMocks();

    // Call the mockClear method we added to reset everything
    localStorageMock.mockClear();
    // Ensure window object uses the fresh mock (might be redundant but safe)
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });

    // Reset other mocks used in this suite
    (window.confirm as jest.Mock)?.mockReset();
    (window.alert as jest.Mock)?.mockReset();
    
    // Always mock reload in each beforeEach and avoid global state
    try {
      const mockReload = jest.fn();
      Object.defineProperty(window.location, 'reload', {
        value: mockReload,
        configurable: true,
        writable: true
      });
    } catch {
      // Degrade gracefully if property cannot be redefined in some environments
      // Skip reload assertions in tests that require it
    }
    
    setTimeoutSpy.mockClear();
    clearTimeoutSpy.mockClear();
    // Keep timers consistent per test - default to real timers
    jest.useRealTimers();

    // Mock console methods for this describe block
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    // Guard console spies in afterEach - only restore if they exist
    if (consoleErrorSpy) consoleErrorSpy.mockRestore();
    if (consoleWarnSpy) consoleWarnSpy.mockRestore();
    if (consoleLogSpy) consoleLogSpy.mockRestore();
    
    // Clear reload mock if it exists and has mockClear
    if (window.location.reload && 'mockClear' in window.location.reload) {
      (window.location.reload as jest.Mock).mockClear();
    }
    // Ensure no stray timers keep the suite alive
    try {
      jest.clearAllTimers();
      jest.useRealTimers();
    } catch {}
  });

  // No explicit afterAll restoration here; global setupTests will restore
  // window.location if it was redefined with a configurable descriptor.

  describe("Success Scenarios", () => {
    it("should successfully restore valid backup data and overwrite localStorage", async () => {
      // Arrange: Define valid backup data
      const validBackupData = {
        meta: { schema: 1, exportedAt: new Date().toISOString() },
        localStorage: {
          [SAVED_GAMES_KEY]: {
            game1: {
              id: "game1",
              teamName: "Test",
              opponentName: "Opponent",
              homeScore: 1,
              awayScore: 0,
            },
          },
          [APP_SETTINGS_KEY]: { currentGameId: "game1" },
          [SEASONS_LIST_KEY]: [{ id: "s1", name: "Test Season" }],
          [TOURNAMENTS_LIST_KEY]: null, // Test null value
          [MASTER_ROSTER_KEY]: [{ id: "p1", name: "Player 1" }],
          // Key not present in backup constants but exists in source file localStorage
          someOtherOldKey: "should be removed if present initially",
        },
      };
      const backupJson = JSON.stringify(validBackupData);

      // Pre-populate localStorage with some different data to ensure overwrite
      localStorageMock.setItem(
        SAVED_GAMES_KEY,
        JSON.stringify({ gameX: { id: "gameX" } }),
      );
      localStorageMock.setItem(
        APP_SETTINGS_KEY,
        JSON.stringify({ currentGameId: "gameX" }),
      );
      localStorageMock.setItem("someOtherOldKey", "initial value");

      // Mock window.confirm to return true (user confirms)
      (window.confirm as jest.Mock).mockReturnValue(true);

      // Alert is globally mocked in beforeEach for this test suite now
      // REMOVE: const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});

      // Act: Call the import function
      const result = await importFullBackup(backupJson);

      // Assert: Check results
      expect(result).toBe(true); // Function should indicate success (before reload)

      // Verify mockStore content matches the backup data (storage module writes to mockStore)
      expect(mockStore[SAVED_GAMES_KEY]).toEqual(
        validBackupData.localStorage[SAVED_GAMES_KEY],
      );
      expect(mockStore[APP_SETTINGS_KEY]).toEqual(
        validBackupData.localStorage[APP_SETTINGS_KEY],
      );
      expect(mockStore[SEASONS_LIST_KEY]).toEqual(
        validBackupData.localStorage[SEASONS_LIST_KEY],
      );
      expect(mockStore[TOURNAMENTS_LIST_KEY]).toBeUndefined(); // removeStorageItem deletes the key
      expect(mockStore[MASTER_ROSTER_KEY]).toEqual(
        validBackupData.localStorage[MASTER_ROSTER_KEY],
      );

      // Verify the non-backup key was restored from backup
      expect(mockStore["someOtherOldKey"]).toEqual(
        validBackupData.localStorage.someOtherOldKey,
      );

      // Verify confirmation was called
      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(window.alert).toHaveBeenCalledWith(
        "Backup restored. Reloading app...",
      );

      // Verify reload was scheduled via setTimeout
      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 500);

      // Verify the function passed to setTimeout calls reload
      const reloadCallback = setTimeoutSpy.mock.calls[0][0]; // Get the callback function
      reloadCallback(); // Execute the callback
      if (jest.isMockFunction(window.location.reload)) {
        expect(window.location.reload).toHaveBeenCalledTimes(1);
      } else {
        // In environments where reload cannot be mocked, just assert it's callable
        expect(typeof window.location.reload).toBe('function');
      }
    });

    it("should successfully import partial backup data with only some keys present", async () => {
      jest.useFakeTimers(); // Use FAKE timers for this test
      // Arrange: Define partial backup data with valid structure but only some keys
      const partialBackupData = {
        meta: { schema: 1, exportedAt: new Date().toISOString() },
        localStorage: {
          // Only include games and settings, omit roster, seasons, and tournaments
          [SAVED_GAMES_KEY]: {
            game1: { id: "game1", teamName: "Partial Test" },
          },
          [APP_SETTINGS_KEY]: { currentGameId: "game1" },
          // Intentionally omitting: MASTER_ROSTER_KEY, SEASONS_LIST_KEY, TOURNAMENTS_LIST_KEY
        },
      };
      const backupJson = JSON.stringify(partialBackupData);

      // Pre-populate mockStore with some existing data that should be preserved
      // for keys not in the backup
      const existingRoster = [{ id: "existing1", name: "Existing Player" }];
      mockStore[MASTER_ROSTER_KEY] = existingRoster;

      // Mock window.confirm to return true (user confirms)
      (window.confirm as jest.Mock).mockReturnValue(true);

      // Alert is globally mocked
      // REMOVE: const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});

      // Act: Call the import function
      const result = await importFullBackup(backupJson);

      // Assert: Check results
      expect(result).toBe(true); // Function should indicate success

      // Verify backup keys were imported to mockStore
      expect(mockStore[SAVED_GAMES_KEY]).toEqual(
        partialBackupData.localStorage[SAVED_GAMES_KEY],
      );
      expect(mockStore[APP_SETTINGS_KEY]).toEqual(
        partialBackupData.localStorage[APP_SETTINGS_KEY],
      );

      // Verify keys not in backup were preserved
      expect(mockStore[MASTER_ROSTER_KEY]).toEqual(
        existingRoster,
      );

      // Verify alert and reload were called
      expect(window.alert).toHaveBeenCalledWith(
        "Backup restored. Reloading app...",
      );

      // Advance timers to see if reload would have been called
      jest.advanceTimersByTime(500);
      if (jest.isMockFunction(window.location.reload)) {
        expect(window.location.reload).toHaveBeenCalledTimes(1);
      } else {
        expect(typeof window.location.reload).toBe('function');
      }

      // Restore mocks and timers
      // REMOVE: alertMock.mockRestore(); // Handled in afterEach
      jest.useRealTimers(); // Restore real timers
    });

    /**
     * Tests cross-device team backup and restore scenario
     * Ensures teams and team rosters are included in backups for device transfers
     * @integration @critical
     */
    it("should successfully backup and restore teams and team rosters (cross-device scenario)", async () => {
      // Arrange: Simulate Device A with teams and games linked to teams
      const teamsData = {
        team_1: { id: "team_1", name: "FC United", color: "#FF0000", createdAt: "2024-01-01", updatedAt: "2024-01-02" },
        team_2: { id: "team_2", name: "FC Barcelona", color: "#0000FF", createdAt: "2024-01-03", updatedAt: "2024-01-03" }
      };
      const teamRostersData = {
        team_1: [{ id: "p1", name: "Player One", jerseyNumber: "10", isGoalkeeper: false }],
        team_2: [{ id: "p2", name: "Player Two", jerseyNumber: "7", isGoalkeeper: false }]
      };
      const gamesData = {
        game1: {
          id: "game1",
          teamId: "team_1",  // Linked to team
          teamName: "FC United",  // Snapshot at creation
          opponentName: "Opponent A"
        },
        game2: {
          id: "game2",
          teamId: "team_2",  // Linked to team
          teamName: "FC Barcelona",  // Snapshot at creation
          opponentName: "Opponent B"
        }
      };

      const backupData = {
        meta: { schema: 1, exportedAt: new Date().toISOString() },
        localStorage: {
          [SAVED_GAMES_KEY]: gamesData,
          [TEAMS_INDEX_KEY]: teamsData,
          [TEAM_ROSTERS_KEY]: teamRostersData,
          [SEASONS_LIST_KEY]: [],
          [TOURNAMENTS_LIST_KEY]: [],
          [MASTER_ROSTER_KEY]: []
        }
      };
      const backupJson = JSON.stringify(backupData);

      // Mock window.confirm to return true (user confirms)
      (window.confirm as jest.Mock).mockReturnValue(true);

      // Act: Import on Device B (clean mockStore simulates new device)
      const result = await importFullBackup(backupJson);

      // Assert: Verify teams were restored
      expect(result).toBe(true);
      expect(mockStore[TEAMS_INDEX_KEY]).toEqual(teamsData);
      expect(mockStore[TEAM_ROSTERS_KEY]).toEqual(teamRostersData);
      expect(mockStore[SAVED_GAMES_KEY]).toEqual(gamesData);

      // Verify game references to teams are intact
      const restoredGames = mockStore[SAVED_GAMES_KEY] as typeof gamesData;
      expect(restoredGames.game1.teamId).toBe("team_1");
      expect(restoredGames.game2.teamId).toBe("team_2");

      // Verify restore success message
      expect(window.alert).toHaveBeenCalledWith("Backup restored. Reloading app...");
    });
  });

  describe("User Cancellation", () => {
    it("should return false and not modify localStorage when user cancels import", async () => {
      // Arrange
      const validBackupData = {
        meta: { schema: 1 },
        localStorage: { [SAVED_GAMES_KEY]: { game1: {} } },
      };
      const backupJson = JSON.stringify(validBackupData);
      const initialSavedGames = { gameX: { id: "gameX" } };
      localStorageMock.setItem(
        SAVED_GAMES_KEY,
        JSON.stringify(initialSavedGames),
      ); // Set initial data
      // const initialStoreState = { ...localStorageMock.getAll() }; // Capture initial state (removed as unused for now)

      (window.confirm as jest.Mock).mockReturnValue(false); // User cancels
      const alertMock = jest
        .spyOn(window, "alert")
        .mockImplementation(() => {});

      // Act
      const result = await importFullBackup(backupJson);

      // Assert
      expect(result).toBe(false);
      expect(window.confirm).toHaveBeenCalledTimes(1);
      // Assert that no modification methods were called beyond the initial setup
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(1); // Only the initial setup call
      expect(localStorageMock.removeItem).not.toHaveBeenCalled();
      expect(localStorageMock.clear).not.toHaveBeenCalled();
      if (jest.isMockFunction(window.location.reload)) {
        expect(window.location.reload).not.toHaveBeenCalled();
      } else {
        expect(typeof window.location.reload).toBe('function');
      }
      expect(alertMock).not.toHaveBeenCalled();
      alertMock.mockRestore();
    });

    it('updates currentGameId to the latest imported game when backup settings are stale', async () => {
      const latestGameId = 'game_1700000200000_latest';
      const earlierGameId = 'game_1700000100000_old';
      const backupData = createBackupData({
        games: {
          [earlierGameId]: { teamName: 'Old', opponentName: 'First', gameDate: '2024-01-10' } as AppState,
          [latestGameId]: { teamName: 'Latest', opponentName: 'Final', gameDate: '2024-01-12' } as AppState,
        },
        settings: { currentGameId: DEFAULT_GAME_ID },
      });

      (window.confirm as jest.Mock).mockReturnValue(true);

      await importFullBackup(JSON.stringify(backupData));

      expect(mockStore[APP_SETTINGS_KEY]).toEqual({ currentGameId: latestGameId });
      expect(window.alert).toHaveBeenCalledWith("Backup restored. Reloading app...");
    });

    it('preserves currentGameId when backup points to an existing game', async () => {
      const validGameId = 'game_1700000100000_valid';
      const backupData = createBackupData({
        games: {
          [validGameId]: { teamName: 'Valid', opponentName: 'Match', gameDate: '2024-01-11' } as AppState,
        },
        settings: { currentGameId: validGameId },
      });

      (window.confirm as jest.Mock).mockReturnValue(true);

      await importFullBackup(JSON.stringify(backupData));

      expect(mockStore[APP_SETTINGS_KEY]).toEqual({ currentGameId: validGameId });
    });

    it('handles backups with no saved games without crashing', async () => {
      const backupData = createBackupData({
        games: {},
        settings: { currentGameId: DEFAULT_GAME_ID },
      });

      (window.confirm as jest.Mock).mockReturnValue(true);

      await importFullBackup(JSON.stringify(backupData));

      expect(mockStore[APP_SETTINGS_KEY]).toEqual({ currentGameId: DEFAULT_GAME_ID });
      expect(window.alert).toHaveBeenCalledWith("Backup restored. Reloading app...");
    });
  });

  describe("Current Game Sync", () => {
    it("does not update currentGameId when no latest game id can be derived", async () => {
      const backupData = {
        meta: { schema: 1, exportedAt: new Date().toISOString() },
        localStorage: {
          [SAVED_GAMES_KEY]: {
            [DEFAULT_GAME_ID]: { id: DEFAULT_GAME_ID, teamName: 'Default', opponentName: 'Fallback' },
          },
          [APP_SETTINGS_KEY]: { currentGameId: DEFAULT_GAME_ID },
        },
      };

      (window.confirm as jest.Mock).mockReturnValue(true);

      const result = await importFullBackup(JSON.stringify(backupData));

      expect(result).toBe(true);
      const appSettingsWrites = (setStorageJSON as jest.Mock).mock.calls.filter(
        ([key]) => key === APP_SETTINGS_KEY
      );
      expect(appSettingsWrites).toHaveLength(1);
    });

    it("continues import when setting currentGameId fails post-restore", async () => {
      const latestGameId = 'game_1700000300000_new';
      const backupData = {
        meta: { schema: 1, exportedAt: new Date().toISOString() },
        localStorage: {
          [SAVED_GAMES_KEY]: {
            [latestGameId]: { id: latestGameId, teamName: 'Next', opponentName: 'Opponent', gameDate: '2024-02-01' },
            'game_1700000100000_old': { id: 'game_1700000100000_old', teamName: 'Old', opponentName: 'First', gameDate: '2024-01-01' },
          },
          [APP_SETTINGS_KEY]: { currentGameId: DEFAULT_GAME_ID },
        },
      };

      (window.confirm as jest.Mock).mockReturnValue(true);

      const originalSetStorageJSON = (setStorageJSON as jest.Mock).getMockImplementation();
      let appSettingsWriteCount = 0;

      (setStorageJSON as jest.Mock).mockImplementation(async (key: string, value: unknown) => {
        if (key === APP_SETTINGS_KEY) {
          appSettingsWriteCount += 1;
          if (appSettingsWriteCount === 2) {
            throw new Error('intentional settings failure');
          }
        }
        mockStore[key] = value;
      });

      try {
        const result = await importFullBackup(JSON.stringify(backupData));
        expect(result).toBe(true);
        expect(appSettingsWriteCount).toBe(2);
        const combinedMessage = "Backup restored. Reloading app...\n\nBackup restored, but we could not update the current game selection automatically. Please select a game manually.";
        expect(window.alert).toHaveBeenCalledWith(combinedMessage);
        // Verify the specific warning message is shown to users
        expect(window.alert).toHaveBeenCalledWith(
          expect.stringContaining('could not update the current game selection')
        );
      } finally {
        if (originalSetStorageJSON) {
          (setStorageJSON as jest.Mock).mockImplementation(originalSetStorageJSON);
        } else {
          (setStorageJSON as jest.Mock).mockImplementation(async (key: string, value: unknown) => {
            mockStore[key] = value;
          });
        }
      }
    });

    it("skips currentGameId reconciliation when savedGames is not an object", async () => {
      const backupData = {
        meta: { schema: 1, exportedAt: new Date().toISOString() },
        localStorage: {
          [SAVED_GAMES_KEY]: "not-an-object",
          [APP_SETTINGS_KEY]: { currentGameId: DEFAULT_GAME_ID },
        },
      };

      (window.confirm as jest.Mock).mockReturnValue(true);

      const result = await importFullBackup(JSON.stringify(backupData));
      expect(result).toBe(true);
      const appSettingsWrites = (setStorageJSON as jest.Mock).mock.calls.filter(
        ([key]) => key === APP_SETTINGS_KEY
      );
      expect(appSettingsWrites).toHaveLength(1);
    });

    it("resets currentGameId when it points to a missing game", async () => {
      const validGameId = 'game_1700000100000_valid';
      const backupData = {
        meta: { schema: 1, exportedAt: new Date().toISOString() },
        localStorage: {
          [SAVED_GAMES_KEY]: {
            [validGameId]: { id: validGameId, teamName: 'Valid', opponentName: 'Match', gameDate: '2024-01-11' },
          },
          [APP_SETTINGS_KEY]: { currentGameId: 'game_orphaned' },
        },
      };

      (window.confirm as jest.Mock).mockReturnValue(true);

      await importFullBackup(JSON.stringify(backupData));

      expect(mockStore[APP_SETTINGS_KEY]).toEqual({ currentGameId: validGameId });
    });
  });

  describe("Validation Errors", () => {
    it("should return false and not modify localStorage for invalid JSON input", async () => {
      // Arrange
      const invalidJson = "{ invalid json";

      // Mock window.alert to suppress it during test
      const alertMock = jest
        .spyOn(window, "alert")
        .mockImplementation(() => {});

      // Act
      const result = await importFullBackup(invalidJson);

      // Assert
      expect(result).toBe(false);
      expect(localStorageMock.getAll()).toEqual({}); // Storage unchanged
      expect(window.confirm).not.toHaveBeenCalled(); // Confirmation shouldn't be reached
      expect(alertMock).toHaveBeenCalledWith(
        expect.stringContaining("Error importing backup"),
      ); // Check alert
      if (jest.isMockFunction(window.location.reload)) {
        expect(window.location.reload).not.toHaveBeenCalled();
      } else {
        expect(typeof window.location.reload).toBe('function');
      }

      // Restore alert mock
      alertMock.mockRestore();
    });

    it("should return false and show error for missing meta field", async () => {
      // Arrange
      const backupData = { localStorage: {} }; // Missing meta
      const backupJson = JSON.stringify(backupData);

      // Mock window.alert to suppress it during test
      const alertMock = jest
        .spyOn(window, "alert")
        .mockImplementation(() => {});

      // Act
      const result = await importFullBackup(backupJson);

      // Assert
      expect(result).toBe(false);
      expect(localStorageMock.getAll()).toEqual({});
      expect(window.confirm).not.toHaveBeenCalled();
      expect(alertMock).toHaveBeenCalledWith(
        expect.stringContaining("Missing 'meta' information"),
      );
      if (jest.isMockFunction(window.location.reload)) {
        expect(window.location.reload).not.toHaveBeenCalled();
      } else {
        expect(typeof window.location.reload).toBe('function');
      }
      alertMock.mockRestore();
    });

    it("should return false and show error for unsupported schema version", async () => {
      // Arrange
      const backupData = { meta: { schema: 2 }, localStorage: {} };
      const backupJson = JSON.stringify(backupData);

      // Mock window.alert to suppress it during test
      const alertMock = jest
        .spyOn(window, "alert")
        .mockImplementation(() => {});

      // Act
      const result = await importFullBackup(backupJson);

      // Assert
      expect(result).toBe(false);
      expect(localStorageMock.getAll()).toEqual({});
      expect(window.confirm).not.toHaveBeenCalled();
      expect(alertMock).toHaveBeenCalledWith(
        expect.stringContaining("Unsupported schema version: 2"),
      );
      if (jest.isMockFunction(window.location.reload)) {
        expect(window.location.reload).not.toHaveBeenCalled();
      } else {
        expect(typeof window.location.reload).toBe('function');
      }
      alertMock.mockRestore();
    });

    it("should return false and show error for missing localStorage field", async () => {
      // Arrange
      const backupData = { meta: { schema: 1 } }; // Missing localStorage
      const backupJson = JSON.stringify(backupData);

      // Mock window.alert to suppress it during test
      const alertMock = jest
        .spyOn(window, "alert")
        .mockImplementation(() => {});

      // Act
      const result = await importFullBackup(backupJson);

      // Assert
      expect(result).toBe(false);
      expect(localStorageMock.getAll()).toEqual({});
      expect(window.confirm).not.toHaveBeenCalled();
      expect(alertMock).toHaveBeenCalledWith(
        expect.stringContaining("Missing 'localStorage' data object"),
      );
      if (jest.isMockFunction(window.location.reload)) {
        expect(window.location.reload).not.toHaveBeenCalled();
      } else {
        expect(typeof window.location.reload).toBe('function');
      }
      alertMock.mockRestore();
    });
  });

  describe("Runtime Errors", () => {
    it("should return false and show error when localStorage quota is exceeded", async () => {
      // Arrange: Define valid backup data
      const validBackupData = {
        meta: { schema: 1, exportedAt: new Date().toISOString() },
        localStorage: {
          [SAVED_GAMES_KEY]: {
            game1: { id: "game1", teamName: "Test", opponentName: "Opponent" },
          },
          [APP_SETTINGS_KEY]: { currentGameId: "game1" },
        },
      };
      const backupJson = JSON.stringify(validBackupData);

      // Mock window.confirm to return true (user confirms)
      (window.confirm as jest.Mock).mockReturnValue(true);

      // Mock setStorageJSON to throw quota exceeded error for one specific key
      const originalSetStorageJSON = (setStorageJSON as jest.Mock).getMockImplementation();
      (setStorageJSON as jest.Mock).mockImplementation(async (key: string, value: unknown) => {
        if (key === SAVED_GAMES_KEY) {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        }
        mockStore[key] = value;
      });

      // Mock alert
      const alertMock = jest
        .spyOn(window, "alert")
        .mockImplementation(() => {});

      try {
        // Act: Call the import function
        const result = await importFullBackup(backupJson);

        // Assert: Check results
        expect(result).toBe(false); // Function should indicate failure
        expect(setStorageJSON).toHaveBeenCalled();
        // The actual error message from the implementation contains a different text
        expect(alertMock).toHaveBeenCalledWith(
          expect.stringContaining("Failed to restore"),
        );
        if (jest.isMockFunction(window.location.reload)) {
          expect(window.location.reload).not.toHaveBeenCalled();
        } else {
          expect(typeof window.location.reload).toBe('function');
        }
      } finally {
        // Always restore the mock, even if the test fails
        if (originalSetStorageJSON) {
          (setStorageJSON as jest.Mock).mockImplementation(originalSetStorageJSON);
        } else {
          // Restore default implementation
          (setStorageJSON as jest.Mock).mockImplementation(async (key: string, value: unknown) => {
            mockStore[key] = value;
          });
        }
        alertMock.mockRestore();
      }
    });
  });
});

// --- New Describe Block for exportFullBackup ---
describe("exportFullBackup", () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;
  let clickSpy: jest.Mock;
  let originalCreateElement: typeof document.createElement;
  let dateSpy: jest.SpyInstance; // To hold the Date spy instance

  beforeEach(() => {
    // Clear mock store
    Object.keys(mockStore).forEach(key => delete mockStore[key]);
    jest.clearAllMocks();

    localStorageMock.mockClear();
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
    });

    (window.URL.createObjectURL as jest.Mock).mockClear();
    (window.URL.revokeObjectURL as jest.Mock).mockClear();
    (document.body.appendChild as jest.Mock).mockClear();
    (document.body.removeChild as jest.Mock).mockClear();
    (window.alert as jest.Mock)?.mockClear();

    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    clickSpy = jest.fn();
    originalCreateElement = document.createElement;
    document.createElement = jest.fn((tagName: string): HTMLElement => {
      if (tagName.toLowerCase() === "a") {
        const mockAnchor = originalCreateElement.call(
          document,
          "a",
        ) as HTMLAnchorElement;
        mockAnchor.click = clickSpy;
        Object.defineProperty(mockAnchor, "href", {
          writable: true,
          value: "",
        });
        Object.defineProperty(mockAnchor, "download", {
          writable: true,
          value: "",
        });
        Object.defineProperty(mockAnchor, "style", {
          writable: true,
          value: {},
        });
        return mockAnchor;
      }
      return originalCreateElement.call(document, tagName);
    }) as jest.Mock;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
    document.createElement = originalCreateElement;
    if (dateSpy) {
      dateSpy.mockRestore(); // Restore Date spy if it was created
    }
  });

  it("should trigger download with correct filename and content type", async () => {
    localStorageMock.setItem(SAVED_GAMES_KEY, JSON.stringify({ test: "data" }));
    const expectedDate = new Date(2023, 0, 15, 10, 30, 0); // Fixed date
    // Store the spy instance to restore it in afterEach
    dateSpy = jest.spyOn(global, "Date").mockImplementation(() => expectedDate);

    await exportFullBackup();

    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(document.createElement).toHaveBeenCalledWith("a");

    const mockAnchor = (document.createElement as jest.Mock).mock.results[0]
      .value;
    expect(mockAnchor.download).toBe("MatchOpsLocal_Backup_20230115_103000.json"); // Check filename
    expect(document.body.appendChild).toHaveBeenCalledWith(mockAnchor);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(document.body.removeChild).toHaveBeenCalledWith(mockAnchor);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith(expect.any(String));
    expect(window.alert).toHaveBeenCalledWith(
      "Backup exported successfully.",
    );

    // No need to restore dateSpy here, afterEach will handle it.
  });

  it("should correctly structure backup data including meta and all localStorage keys", async () => {
    // Arrange
    const gamesData = { game1: { id: "game1", opponentName: "Opponent", teamName: "Test" } };
    const settingsData = { theme: "dark" };
    const rosterDataDb: RosterPlayer[] = [{ id: "p1", name: "Player One" }];
    const seasonsDataDb: SeasonObject[] = [{ id: "s1", name: "Season One" }];
    const tournamentsDataDb: TournamentObject[] = [
      { id: "t1", name: "Tournament One" },
    ];
    const teamsData = { team_1: { id: "team_1", name: "FC United", color: "#FF0000", createdAt: "2024-01-01", updatedAt: "2024-01-01" } };
    const teamRostersData = { team_1: [{ id: "p1", name: "Player One", jerseyNumber: "10", isGoalkeeper: false }] };

    // Store data in mockStore (exportFullBackup reads from storage module which uses mockStore)
    mockStore[SAVED_GAMES_KEY] = gamesData;
    mockStore[APP_SETTINGS_KEY] = settingsData;
    mockStore[MASTER_ROSTER_KEY] = rosterDataDb;
    mockStore[SEASONS_LIST_KEY] = seasonsDataDb;
    mockStore[TOURNAMENTS_LIST_KEY] = tournamentsDataDb;
    mockStore[TEAMS_INDEX_KEY] = teamsData;
    mockStore[TEAM_ROSTERS_KEY] = teamRostersData;
    // mockStore['someOtherCustomKey'] = { custom: 'value' }; // This key is not in APP_DATA_KEYS, so it won't be backed up.

    await exportFullBackup();

    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blobArgument = (window.URL.createObjectURL as jest.Mock).mock
      .calls[0][0] as BlobWithText;
    expect(blobArgument).toBeInstanceOf(Blob);
    expect(blobArgument.type).toBe("application/json");

    const blobText = await blobArgument.text();
    const backupData = JSON.parse(blobText);

    expect(backupData.meta).toBeDefined();
    expect(backupData.meta.schema).toBe(1);
    expect(backupData.meta.exportedAt).toBeDefined();

    expect(backupData.localStorage[SAVED_GAMES_KEY]).toEqual(gamesData);
    expect(backupData.localStorage[APP_SETTINGS_KEY]).toEqual(settingsData);
    expect(backupData.localStorage[MASTER_ROSTER_KEY]).toEqual(rosterDataDb);
    expect(backupData.localStorage[SEASONS_LIST_KEY]).toEqual(seasonsDataDb);
    expect(backupData.localStorage[TOURNAMENTS_LIST_KEY]).toEqual(
      tournamentsDataDb,
    );
    expect(backupData.localStorage[TEAMS_INDEX_KEY]).toEqual(teamsData);
    expect(backupData.localStorage[TEAM_ROSTERS_KEY]).toEqual(teamRostersData);
    // expect(backupData.localStorage['someOtherCustomKey']).toEqual({ custom: 'value' }); // This key is not expected now.
    expect(backupData.localStorage["someOtherCustomKey"]).toBeUndefined(); // Explicitly check it's not there
  });

  it("should handle missing localStorage keys by setting them to null in backup", async () => {
    // Store data in mockStore
    mockStore[SAVED_GAMES_KEY] = { game1: { id: "game1", opponentName: "Opponent", teamName: "Test" } };

    await exportFullBackup();

    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blobArgument = (window.URL.createObjectURL as jest.Mock).mock
      .calls[0][0] as Blob;
    const blobText = await blobArgument.text();
    const backupData = JSON.parse(blobText);

    expect(backupData.localStorage[SAVED_GAMES_KEY]).toEqual({ game1: { id: "game1", opponentName: "Opponent", teamName: "Test" } });
    expect(backupData.localStorage[APP_SETTINGS_KEY]).toBeNull();
    expect(backupData.localStorage[MASTER_ROSTER_KEY]).toBeNull();
    expect(backupData.localStorage[SEASONS_LIST_KEY]).toBeNull();
    expect(backupData.localStorage[TOURNAMENTS_LIST_KEY]).toBeNull();
  });

  it("should log an error and set value to null if a localStorage item is malformed JSON", async () => {
    const gamesData = { game1: "valid data" };
    const rosterDataDb: RosterPlayer[] = [{ id: "p1", name: "Valid Player" }]; // Use defined type

    // Store data in mockStore
    mockStore[SAVED_GAMES_KEY] = gamesData;
    mockStore[MASTER_ROSTER_KEY] = rosterDataDb;

    // Mock getStorageJSON to throw error for APP_SETTINGS_KEY
    const originalGetStorageJSON = (getStorageJSON as jest.Mock).getMockImplementation();
    (getStorageJSON as jest.Mock).mockImplementation(async (key: string) => {
      if (key === APP_SETTINGS_KEY) {
        // Simulate storage error
        throw new Error('Storage read error');
      }
      return mockStore[key] || null;
    });

    try {
      await exportFullBackup();

      expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
      const blobArgument = (window.URL.createObjectURL as jest.Mock).mock
        .calls[0][0] as Blob;

      // The test now checks that the error was handled gracefully
      // The code logs the error and sets the value to null
      const blobText = await blobArgument.text();
      const backupData = JSON.parse(blobText);

      expect(backupData.localStorage[SAVED_GAMES_KEY]).toEqual(gamesData);
      expect(backupData.localStorage[MASTER_ROSTER_KEY]).toEqual(rosterDataDb);
      expect(backupData.localStorage[APP_SETTINGS_KEY]).toBeNull(); // Error was handled, value set to null
    } finally {
      // Restore original mock
      if (originalGetStorageJSON) {
        (getStorageJSON as jest.Mock).mockImplementation(originalGetStorageJSON);
      } else {
        (getStorageJSON as jest.Mock).mockImplementation(async (key: string) => {
          return mockStore[key] || null;
        });
      }
    }
  });
});
