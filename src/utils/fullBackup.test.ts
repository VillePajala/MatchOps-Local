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
  WARMUP_PLAN_KEY,
} from "@/config/storageKeys";
import { DEFAULT_GAME_ID } from "@/config/constants";
import type { SavedGamesCollection, AppState } from "@/types/game";
import type { AppSettings } from "./appSettings";
import type { Season, Tournament, Player, Team, TeamPlayer, PlayerStatAdjustment } from "@/types";
import type { TeamsIndex, TeamRostersIndex } from "./teams";
import type { WarmupPlan } from "@/types/warmupPlan";
import type { Personnel } from "@/types/personnel";
import type { DataStore } from "@/interfaces/DataStore";

// Mock the DataStore factory
jest.mock("@/datastore/factory");

// Also mock storage for backward-compatible test assertions
// (will be removed when tests are fully migrated to DataStore patterns in Step 11)
jest.mock("./storage");

import { getDataStore } from "@/datastore/factory";
import { getStorageJSON, setStorageJSON } from "./storage";

// Create mock store for DataStore data
const mockStore: Record<string, unknown> = {};

// Create a mock DataStore implementation
function createMockDataStore(): DataStore {
  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    getBackendName: jest.fn().mockReturnValue('local'),
    isAvailable: jest.fn().mockResolvedValue(true),
    isInitialized: jest.fn().mockReturnValue(true),
    clearUserCaches: jest.fn(),

    // Players
    getPlayers: jest.fn().mockImplementation(async () => {
      return mockStore[MASTER_ROSTER_KEY] || [];
    }),
    createPlayer: jest.fn(),
    updatePlayer: jest.fn(),
    deletePlayer: jest.fn(),
    upsertPlayer: jest.fn().mockImplementation(async (player: Player) => {
      const players = (mockStore[MASTER_ROSTER_KEY] as Player[]) || [];
      const existingIndex = players.findIndex(p => p.id === player.id);
      if (existingIndex >= 0) {
        players[existingIndex] = player;
      } else {
        players.push(player);
      }
      mockStore[MASTER_ROSTER_KEY] = players;
      return player;
    }),

    // Teams
    getTeams: jest.fn().mockImplementation(async () => {
      const teamsIndex = (mockStore[TEAMS_INDEX_KEY] as TeamsIndex) || {};
      return Object.values(teamsIndex);
    }),
    getTeamById: jest.fn(),
    createTeam: jest.fn(),
    updateTeam: jest.fn(),
    deleteTeam: jest.fn(),
    upsertTeam: jest.fn().mockImplementation(async (team: Team) => {
      const teamsIndex = (mockStore[TEAMS_INDEX_KEY] as TeamsIndex) || {};
      teamsIndex[team.id] = team;
      mockStore[TEAMS_INDEX_KEY] = teamsIndex;
      return team;
    }),

    // Team Rosters
    getTeamRoster: jest.fn(),
    setTeamRoster: jest.fn().mockImplementation(async (teamId: string, roster: TeamPlayer[]) => {
      const rosters = (mockStore[TEAM_ROSTERS_KEY] as TeamRostersIndex) || {};
      rosters[teamId] = roster;
      mockStore[TEAM_ROSTERS_KEY] = rosters;
    }),
    getAllTeamRosters: jest.fn().mockImplementation(async () => {
      return mockStore[TEAM_ROSTERS_KEY] || {};
    }),

    // Seasons
    getSeasons: jest.fn().mockImplementation(async () => {
      return mockStore[SEASONS_LIST_KEY] || [];
    }),
    createSeason: jest.fn(),
    updateSeason: jest.fn(),
    deleteSeason: jest.fn(),
    upsertSeason: jest.fn().mockImplementation(async (season: Season) => {
      const seasons = (mockStore[SEASONS_LIST_KEY] as Season[]) || [];
      const existingIndex = seasons.findIndex(s => s.id === season.id);
      if (existingIndex >= 0) {
        seasons[existingIndex] = season;
      } else {
        seasons.push(season);
      }
      mockStore[SEASONS_LIST_KEY] = seasons;
      return season;
    }),

    // Tournaments
    getTournaments: jest.fn().mockImplementation(async () => {
      return mockStore[TOURNAMENTS_LIST_KEY] || [];
    }),
    createTournament: jest.fn(),
    updateTournament: jest.fn(),
    deleteTournament: jest.fn(),
    upsertTournament: jest.fn().mockImplementation(async (tournament: Tournament) => {
      const tournaments = (mockStore[TOURNAMENTS_LIST_KEY] as Tournament[]) || [];
      const existingIndex = tournaments.findIndex(t => t.id === tournament.id);
      if (existingIndex >= 0) {
        tournaments[existingIndex] = tournament;
      } else {
        tournaments.push(tournament);
      }
      mockStore[TOURNAMENTS_LIST_KEY] = tournaments;
      return tournament;
    }),

    // Personnel
    getAllPersonnel: jest.fn().mockImplementation(async () => {
      const personnelCollection = mockStore['matchops_personnel'] as Record<string, Personnel> | undefined;
      return personnelCollection ? Object.values(personnelCollection) : [];
    }),
    getPersonnelById: jest.fn(),
    addPersonnelMember: jest.fn(),
    updatePersonnelMember: jest.fn(),
    removePersonnelMember: jest.fn(),
    upsertPersonnelMember: jest.fn().mockImplementation(async (personnel: Personnel) => {
      const collection = (mockStore['matchops_personnel'] as Record<string, Personnel>) || {};
      collection[personnel.id] = personnel;
      mockStore['matchops_personnel'] = collection;
      return personnel;
    }),

    // Games
    getGames: jest.fn().mockImplementation(async () => {
      return mockStore[SAVED_GAMES_KEY] || {};
    }),
    getGameById: jest.fn(),
    createGame: jest.fn(),
    saveGame: jest.fn(),
    saveAllGames: jest.fn().mockImplementation(async (games: SavedGamesCollection) => {
      mockStore[SAVED_GAMES_KEY] = games;
    }),
    deleteGame: jest.fn(),

    // Game Events
    addGameEvent: jest.fn(),
    updateGameEvent: jest.fn(),
    removeGameEvent: jest.fn(),

    // Settings
    getSettings: jest.fn().mockImplementation(async () => {
      return mockStore[APP_SETTINGS_KEY] || {};
    }),
    saveSettings: jest.fn().mockImplementation(async (settings: AppSettings) => {
      mockStore[APP_SETTINGS_KEY] = settings;
    }),
    updateSettings: jest.fn().mockImplementation(async (updates: Partial<AppSettings>) => {
      const current = (mockStore[APP_SETTINGS_KEY] as AppSettings) || {};
      const updated = { ...current, ...updates };
      mockStore[APP_SETTINGS_KEY] = updated;
      return updated;
    }),

    // Player Adjustments
    getPlayerAdjustments: jest.fn().mockResolvedValue([]),
    getAllPlayerAdjustments: jest.fn().mockImplementation(async () => {
      return new Map<string, PlayerStatAdjustment[]>();
    }),
    addPlayerAdjustment: jest.fn(),
    upsertPlayerAdjustment: jest.fn(),
    updatePlayerAdjustment: jest.fn(),
    deletePlayerAdjustment: jest.fn(),

    // Warmup Plan
    getWarmupPlan: jest.fn().mockImplementation(async () => {
      return mockStore[WARMUP_PLAN_KEY] || null;
    }),
    saveWarmupPlan: jest.fn().mockImplementation(async (plan: WarmupPlan) => {
      mockStore[WARMUP_PLAN_KEY] = plan;
      return true;
    }),
    deleteWarmupPlan: jest.fn(),

    // Timer State
    getTimerState: jest.fn().mockResolvedValue(null),
    saveTimerState: jest.fn().mockResolvedValue(undefined),
    clearTimerState: jest.fn().mockResolvedValue(undefined),

    // Data Management
    clearAllUserData: jest.fn().mockImplementation(async () => {
      // Clear all app data from mockStore
      delete mockStore[SAVED_GAMES_KEY];
      delete mockStore[APP_SETTINGS_KEY];
      delete mockStore[SEASONS_LIST_KEY];
      delete mockStore[TOURNAMENTS_LIST_KEY];
      delete mockStore[MASTER_ROSTER_KEY];
      delete mockStore[TEAMS_INDEX_KEY];
      delete mockStore[TEAM_ROSTERS_KEY];
      delete mockStore['matchops_personnel'];
      delete mockStore[WARMUP_PLAN_KEY];
    }),
  };
}

// Create a mock DataStore instance for tests
let mockDataStore: DataStore;

// Setup getDataStore mock
(getDataStore as jest.Mock).mockImplementation(async () => {
  if (!mockDataStore) {
    mockDataStore = createMockDataStore();
  }
  return mockDataStore;
});

// Setup storage mock implementations (for backward-compatible test assertions)
(getStorageJSON as jest.Mock).mockImplementation(async (key: string) => {
  return mockStore[key] || null;
});

(setStorageJSON as jest.Mock).mockImplementation(async (key: string, value: unknown) => {
  mockStore[key] = value;
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
  warmupPlan?: WarmupPlan;
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
      ...(overrides.warmupPlan !== undefined && { [WARMUP_PLAN_KEY]: overrides.warmupPlan }),
    },
  };
}

/**
 * Creates a valid AppState object with all required fields for testing.
 * Only the provided overrides will differ from defaults.
 */
function createTestAppState(overrides: Partial<AppState> = {}): AppState {
  return {
    playersOnField: [],
    availablePlayers: [],
    selectedPlayerIds: [],
    gameEvents: [],
    drawings: [],
    opponents: [],
    showPlayerNames: true,
    teamName: 'Test Team',
    opponentName: 'Test Opponent',
    gameDate: '2024-01-01',
    homeScore: 0,
    awayScore: 0,
    gameNotes: '',
    homeOrAway: 'home',
    numberOfPeriods: 2,
    periodDurationMinutes: 45,
    currentPeriod: 1,
    gameStatus: 'notStarted',
    isPlayed: false,
    seasonId: '',
    tournamentId: '',
    tacticalDiscs: [],
    tacticalDrawings: [],
    tacticalBallPosition: null,
    ...overrides,
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

    // Reset the mock DataStore to a fresh instance
    mockDataStore = createMockDataStore();
    (getDataStore as jest.Mock).mockImplementation(async () => mockDataStore);

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
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true); // Function should indicate success (before reload)

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
      // Note: Alert is no longer shown on success when showToast is not provided
      // Success is indicated via the returned result object

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

      // Pre-populate mockStore with some existing data
      // With clean restore behavior, this should be CLEARED (not preserved)
      const existingRoster = [{ id: "existing1", name: "Existing Player" }];
      mockStore[MASTER_ROSTER_KEY] = existingRoster;

      // Mock window.confirm to return true (user confirms)
      (window.confirm as jest.Mock).mockReturnValue(true);

      // Alert is globally mocked
      // REMOVE: const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});

      // Act: Call the import function
      const result = await importFullBackup(backupJson);

      // Assert: Check results
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true); // Function should indicate success

      // Verify backup keys were imported to mockStore
      expect(mockStore[SAVED_GAMES_KEY]).toEqual(
        partialBackupData.localStorage[SAVED_GAMES_KEY],
      );
      expect(mockStore[APP_SETTINGS_KEY]).toEqual(
        partialBackupData.localStorage[APP_SETTINGS_KEY],
      );

      // Verify keys not in backup were CLEARED (clean restore behavior)
      expect(mockStore[MASTER_ROSTER_KEY]).toBeUndefined();

      // Note: Alert is no longer shown on success when showToast is not provided
      // Success is indicated via the returned result object

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
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(mockStore[TEAMS_INDEX_KEY]).toEqual(teamsData);
      expect(mockStore[TEAM_ROSTERS_KEY]).toEqual(teamRostersData);
      expect(mockStore[SAVED_GAMES_KEY]).toEqual(gamesData);

      // Verify game references to teams are intact
      const restoredGames = mockStore[SAVED_GAMES_KEY] as typeof gamesData;
      expect(restoredGames.game1.teamId).toBe("team_1");
      expect(restoredGames.game2.teamId).toBe("team_2");

      // Verify restore success message
      // Note: Alert no longer shown on success - result object indicates success
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
      expect(result).toBeNull();
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
      // Note: Alert no longer shown on success - result object indicates success
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
      // Note: Alert no longer shown on success - result object indicates success
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

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
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
        expect(result).not.toBeNull();
        expect(result?.success).toBe(true);
        expect(appSettingsWriteCount).toBe(2);
        // Verify warnings are included in the result object
        expect(result?.warnings).toBeDefined();
        expect(result?.warnings?.length).toBeGreaterThan(0);
        expect(result?.warnings?.[0]).toContain('could not update the current game selection');
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
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
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
      expect(result).toBeNull();
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
      expect(result).toBeNull();
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
      expect(result).toBeNull();
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
      expect(result).toBeNull();
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
        expect(result).toBeNull(); // Function should indicate failure
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
    const warmupPlanData = { id: "user_warmup_plan", sections: [], lastModified: "2024-01-01T00:00:00.000Z", isDefault: false };

    // Store data in mockStore (exportFullBackup reads from storage module which uses mockStore)
    mockStore[SAVED_GAMES_KEY] = gamesData;
    mockStore[APP_SETTINGS_KEY] = settingsData;
    mockStore[MASTER_ROSTER_KEY] = rosterDataDb;
    mockStore[SEASONS_LIST_KEY] = seasonsDataDb;
    mockStore[TOURNAMENTS_LIST_KEY] = tournamentsDataDb;
    mockStore[TEAMS_INDEX_KEY] = teamsData;
    mockStore[TEAM_ROSTERS_KEY] = teamRostersData;
    mockStore[WARMUP_PLAN_KEY] = warmupPlanData;
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
    expect(backupData.localStorage[WARMUP_PLAN_KEY]).toEqual(warmupPlanData);
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
    expect(backupData.localStorage[WARMUP_PLAN_KEY]).toBeNull();
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

// --- Tests for Roster-Aware Import (Fix for player ID remapping issue) ---
describe("importFullBackup - Roster-Aware Import", () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    // Clear mock store
    Object.keys(mockStore).forEach(key => delete mockStore[key]);
    jest.clearAllMocks();
    localStorageMock.mockClear();

    // Mock window.confirm to return true by default
    (window.confirm as jest.Mock).mockReturnValue(true);
    (window.alert as jest.Mock)?.mockReset();

    // Mock reload
    try {
      const mockReload = jest.fn();
      Object.defineProperty(window.location, 'reload', {
        value: mockReload,
        configurable: true,
        writable: true
      });
    } catch {
      // Degrade gracefully
    }

    // Mock console methods
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    if (consoleErrorSpy) consoleErrorSpy.mockRestore();
    if (consoleWarnSpy) consoleWarnSpy.mockRestore();
    if (consoleLogSpy) consoleLogSpy.mockRestore();
    try {
      jest.clearAllTimers();
      jest.useRealTimers();
    } catch {}
  });

  /**
   * @critical - This tests the main fix: when backup contains its own roster,
   * player ID remapping should be SKIPPED because games and roster are already consistent.
   */
  describe("Full Backup with Matching Roster (Skip Remapping)", () => {
    it("should NOT remap player IDs when backup contains its own roster", async () => {
      // Arrange: Backup contains games with specific player IDs AND the matching roster
      const backupRoster: Player[] = [
        { id: 'backup-player-1', name: 'Alice', isGoalie: false, jerseyNumber: '10', notes: '' },
        { id: 'backup-player-2', name: 'Bob', isGoalie: false, jerseyNumber: '7', notes: '' },
        { id: 'backup-player-3', name: 'Charlie', isGoalie: true, jerseyNumber: '1', notes: '' },
      ];

      const backupGames: SavedGamesCollection = {
        'game1': createTestAppState({
          teamName: 'Test Team',
          opponentName: 'Opponent',
          gameDate: '2024-01-15',
          selectedPlayerIds: ['backup-player-1', 'backup-player-2'],
          playersOnField: [backupRoster[0], backupRoster[1]],
          availablePlayers: [backupRoster[2]],
        }),
        'game2': createTestAppState({
          teamName: 'Test Team',
          opponentName: 'Another Opponent',
          gameDate: '2024-01-22',
          selectedPlayerIds: ['backup-player-1', 'backup-player-3'],
          playersOnField: [backupRoster[0], backupRoster[2]],
          availablePlayers: [backupRoster[1]],
        }),
      };

      const backupData = createBackupData({
        games: backupGames,
        roster: backupRoster,
        settings: { currentGameId: 'game1' },
      });

      // Existing different roster should NOT affect imported games
      const existingRoster: Player[] = [
        { id: 'existing-player-1', name: 'Alice', isGoalie: false, jerseyNumber: '10', notes: '' },
        { id: 'existing-player-2', name: 'Bob', isGoalie: false, jerseyNumber: '7', notes: '' },
      ];
      mockStore[MASTER_ROSTER_KEY] = existingRoster;

      // Act
      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);

      // Games should retain their ORIGINAL player IDs (from backup, not remapped)
      const restoredGames = mockStore[SAVED_GAMES_KEY] as SavedGamesCollection;

      // Game1 should have backup-player-1 and backup-player-2 (NOT existing-player-1, existing-player-2)
      expect(restoredGames['game1'].selectedPlayerIds).toEqual(['backup-player-1', 'backup-player-2']);

      // Game2 should have backup-player-1 and backup-player-3
      expect(restoredGames['game2'].selectedPlayerIds).toEqual(['backup-player-1', 'backup-player-3']);

      // Roster should be the backup roster
      expect(mockStore[MASTER_ROSTER_KEY]).toEqual(backupRoster);
    });

    it("should preserve exact selectedPlayerIds count per game when backup includes roster", async () => {
      // Arrange: Multiple games with different player selections
      const backupRoster: Player[] = Array.from({ length: 15 }, (_, i) => ({
        id: `player-${i + 1}`,
        name: `Player ${i + 1}`,
        isGoalie: i === 0,
        jerseyNumber: String(i + 1),
        notes: ''
      }));

      const backupGames: SavedGamesCollection = {
        'game-with-5-players': createTestAppState({
          teamName: 'Team A',
          opponentName: 'Opp A',
          gameDate: '2024-01-01',
          selectedPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
          playersOnField: backupRoster.slice(0, 5),
          availablePlayers: backupRoster.slice(5),
        }),
        'game-with-11-players': createTestAppState({
          teamName: 'Team A',
          opponentName: 'Opp B',
          gameDate: '2024-01-08',
          selectedPlayerIds: backupRoster.slice(0, 11).map(p => p.id),
          playersOnField: backupRoster.slice(0, 11),
          availablePlayers: backupRoster.slice(11),
        }),
        'game-with-all-players': createTestAppState({
          teamName: 'Team A',
          opponentName: 'Opp C',
          gameDate: '2024-01-15',
          selectedPlayerIds: backupRoster.map(p => p.id),
          playersOnField: backupRoster,
          availablePlayers: [],
        }),
      };

      const backupData = createBackupData({
        games: backupGames,
        roster: backupRoster,
      });

      // Act
      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      // Assert
      expect(result?.success).toBe(true);
      const restoredGames = mockStore[SAVED_GAMES_KEY] as SavedGamesCollection;

      expect(restoredGames['game-with-5-players'].selectedPlayerIds).toHaveLength(5);
      expect(restoredGames['game-with-11-players'].selectedPlayerIds).toHaveLength(11);
      expect(restoredGames['game-with-all-players'].selectedPlayerIds).toHaveLength(15);
    });

    it("should preserve game events with correct player IDs when backup includes roster", async () => {
      const backupRoster: Player[] = [
        { id: 'scorer-id', name: 'Scorer', isGoalie: false, jerseyNumber: '9', notes: '' },
        { id: 'assister-id', name: 'Assister', isGoalie: false, jerseyNumber: '10', notes: '' },
      ];

      const backupGames: SavedGamesCollection = {
        'game-with-events': createTestAppState({
          teamName: 'Team',
          opponentName: 'Opponent',
          gameDate: '2024-02-01',
          selectedPlayerIds: ['scorer-id', 'assister-id'],
          playersOnField: backupRoster,
          availablePlayers: [],
          gameEvents: [
            { id: 'e1', type: 'goal', time: 1500, scorerId: 'scorer-id', assisterId: 'assister-id', entityId: undefined },
            { id: 'e2', type: 'goal', time: 3000, scorerId: 'scorer-id', assisterId: undefined, entityId: undefined },
          ],
          homeScore: 2,
          awayScore: 0,
        }),
      };

      const backupData = createBackupData({
        games: backupGames,
        roster: backupRoster,
      });

      // Act
      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      // Assert
      expect(result?.success).toBe(true);
      const restoredGames = mockStore[SAVED_GAMES_KEY] as SavedGamesCollection;
      const events = restoredGames['game-with-events'].gameEvents;

      expect(events[0].scorerId).toBe('scorer-id');
      expect(events[0].assisterId).toBe('assister-id');
      expect(events[1].scorerId).toBe('scorer-id');
    });
  });

  /**
   * Tests for legacy imports - when backup does NOT contain a roster,
   * player IDs SHOULD be remapped against the current roster.
   */
  describe("Legacy Backup without Roster (Apply Remapping)", () => {
    it("should remap player IDs when backup does NOT contain roster", async () => {
      // Arrange: Current roster exists in storage
      const currentRoster: Player[] = [
        { id: 'current-alice', name: 'Alice', isGoalie: false, jerseyNumber: '10', notes: '' },
        { id: 'current-bob', name: 'Bob', isGoalie: false, jerseyNumber: '7', notes: '' },
      ];
      mockStore[MASTER_ROSTER_KEY] = currentRoster;

      // Backup games have different player IDs but same names
      const backupGames: SavedGamesCollection = {
        'legacy-game': createTestAppState({
          teamName: 'Old Team',
          opponentName: 'Old Opponent',
          gameDate: '2023-06-01',
          selectedPlayerIds: ['old-alice-id', 'old-bob-id'],
          playersOnField: [
            { id: 'old-alice-id', name: 'Alice', isGoalie: false, jerseyNumber: '10', notes: '' },
            { id: 'old-bob-id', name: 'Bob', isGoalie: false, jerseyNumber: '7', notes: '' },
          ],
          availablePlayers: [],
          gameEvents: [
            { id: 'e1', type: 'goal', time: 1000, scorerId: 'old-alice-id', assisterId: 'old-bob-id', entityId: undefined },
          ],
        }),
      };

      // Backup WITHOUT roster (legacy format)
      const backupData = createBackupData({
        games: backupGames,
        // NO roster key - this is the legacy scenario
      });

      // Act
      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      // Assert
      expect(result?.success).toBe(true);
      const restoredGames = mockStore[SAVED_GAMES_KEY] as SavedGamesCollection;

      // Player IDs should be REMAPPED to current roster IDs
      expect(restoredGames['legacy-game'].selectedPlayerIds).toContain('current-alice');
      expect(restoredGames['legacy-game'].selectedPlayerIds).toContain('current-bob');
      expect(restoredGames['legacy-game'].selectedPlayerIds).not.toContain('old-alice-id');

      // Game events should also be remapped
      expect(restoredGames['legacy-game'].gameEvents[0].scorerId).toBe('current-alice');
      expect(restoredGames['legacy-game'].gameEvents[0].assisterId).toBe('current-bob');
    });

    it("should remap player IDs when backup roster is empty array", async () => {
      // Arrange
      const currentRoster: Player[] = [
        { id: 'current-1', name: 'Player One', isGoalie: false, jerseyNumber: '1', notes: '' },
      ];
      mockStore[MASTER_ROSTER_KEY] = currentRoster;

      const backupGames: SavedGamesCollection = {
        'game': createTestAppState({
          teamName: 'Team',
          opponentName: 'Opponent',
          gameDate: '2023-07-01',
          selectedPlayerIds: ['old-1'],
          playersOnField: [
            { id: 'old-1', name: 'Player One', isGoalie: false, jerseyNumber: '1', notes: '' },
          ],
          availablePlayers: [],
        }),
      };

      const backupData = createBackupData({
        games: backupGames,
        roster: [], // Empty roster - should trigger remapping
      });

      // Act
      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      // Assert
      expect(result?.success).toBe(true);
      const restoredGames = mockStore[SAVED_GAMES_KEY] as SavedGamesCollection;
      expect(restoredGames['game'].selectedPlayerIds).toContain('current-1');
    });

    it("should handle partial roster matches during remapping", async () => {
      // Current roster has only some of the players
      const currentRoster: Player[] = [
        { id: 'known-player', name: 'Known Player', isGoalie: false, jerseyNumber: '1', notes: '' },
      ];
      mockStore[MASTER_ROSTER_KEY] = currentRoster;

      const backupGames: SavedGamesCollection = {
        'game': createTestAppState({
          teamName: 'Team',
          opponentName: 'Opponent',
          gameDate: '2023-08-01',
          selectedPlayerIds: ['old-known', 'old-unknown'],
          playersOnField: [
            { id: 'old-known', name: 'Known Player', isGoalie: false, jerseyNumber: '1', notes: '' },
            { id: 'old-unknown', name: 'Unknown Player', isGoalie: false, jerseyNumber: '99', notes: '' },
          ],
          availablePlayers: [],
        }),
      };

      const backupData = createBackupData({
        games: backupGames,
        // No roster - triggers remapping
      });

      // Act
      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      // Assert
      expect(result?.success).toBe(true);
      const restoredGames = mockStore[SAVED_GAMES_KEY] as SavedGamesCollection;

      // Known player should be mapped
      expect(restoredGames['game'].selectedPlayerIds).toContain('known-player');
      // Unknown player should be filtered out (no match in current roster)
      expect(restoredGames['game'].selectedPlayerIds).toHaveLength(1);
    });
  });

  /**
   * Tests for edge cases in backup/restore with different roster states
   */
  describe("Edge Cases - Roster Consistency", () => {
    it("should handle backup with null roster key as legacy (apply remapping)", async () => {
      const currentRoster: Player[] = [
        { id: 'current-1', name: 'Test Player', isGoalie: false, jerseyNumber: '1', notes: '' },
      ];
      mockStore[MASTER_ROSTER_KEY] = currentRoster;

      const backupData = {
        meta: { schema: 1, exportedAt: new Date().toISOString() },
        localStorage: {
          [SAVED_GAMES_KEY]: {
            'game': {
              teamName: 'Team',
              opponentName: 'Opponent',
              selectedPlayerIds: ['old-1'],
              playersOnField: [{ id: 'old-1', name: 'Test Player', isGoalie: false, jerseyNumber: '1', notes: '' }],
              availablePlayers: [],
              gameEvents: [],
              drawings: [],
              opponents: [],
            },
          },
          [MASTER_ROSTER_KEY]: null, // Explicitly null
        },
      };

      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      expect(result?.success).toBe(true);
      const restoredGames = mockStore[SAVED_GAMES_KEY] as SavedGamesCollection;
      expect(restoredGames['game'].selectedPlayerIds).toContain('current-1');
    });

    it("should NOT remap when backup roster has players even if IDs differ from storage", async () => {
      // Storage has roster with certain IDs
      const storageRoster: Player[] = [
        { id: 'storage-id', name: 'Player Name', isGoalie: false, jerseyNumber: '1', notes: '' },
      ];
      mockStore[MASTER_ROSTER_KEY] = storageRoster;

      // Backup has DIFFERENT roster IDs
      const backupRoster: Player[] = [
        { id: 'backup-id', name: 'Player Name', isGoalie: false, jerseyNumber: '1', notes: '' },
      ];

      const backupGames: SavedGamesCollection = {
        'game': createTestAppState({
          teamName: 'Team',
          opponentName: 'Opponent',
          selectedPlayerIds: ['backup-id'],
          playersOnField: [backupRoster[0]],
          availablePlayers: [],
        }),
      };

      const backupData = createBackupData({
        games: backupGames,
        roster: backupRoster, // Has roster - skip remapping
      });

      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      expect(result?.success).toBe(true);
      const restoredGames = mockStore[SAVED_GAMES_KEY] as SavedGamesCollection;

      // Should use backup IDs, not storage IDs
      expect(restoredGames['game'].selectedPlayerIds).toEqual(['backup-id']);
      expect(restoredGames['game'].selectedPlayerIds).not.toContain('storage-id');

      // Roster should be replaced with backup roster
      expect(mockStore[MASTER_ROSTER_KEY]).toEqual(backupRoster);
    });

    it("should handle games with no selectedPlayerIds gracefully", async () => {
      const backupRoster: Player[] = [
        { id: 'p1', name: 'Player 1', isGoalie: false, jerseyNumber: '1', notes: '' },
      ];

      const backupGames: SavedGamesCollection = {
        'empty-game': createTestAppState({
          teamName: 'Team',
          opponentName: 'Opponent',
          selectedPlayerIds: [], // Empty selection
          playersOnField: [],
          availablePlayers: backupRoster,
        }),
      };

      const backupData = createBackupData({
        games: backupGames,
        roster: backupRoster,
      });

      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      expect(result?.success).toBe(true);
      const restoredGames = mockStore[SAVED_GAMES_KEY] as SavedGamesCollection;
      expect(restoredGames['empty-game'].selectedPlayerIds).toEqual([]);
    });

    it("should handle games with undefined selectedPlayerIds", async () => {
      const backupRoster: Player[] = [
        { id: 'p1', name: 'Player 1', isGoalie: false, jerseyNumber: '1', notes: '' },
      ];

      const backupData = {
        meta: { schema: 1, exportedAt: new Date().toISOString() },
        localStorage: {
          [SAVED_GAMES_KEY]: {
            'undefined-game': {
              teamName: 'Team',
              opponentName: 'Opponent',
              // selectedPlayerIds intentionally missing
              playersOnField: [],
              availablePlayers: backupRoster,
              gameEvents: [],
              drawings: [],
              opponents: [],
            },
          },
          [MASTER_ROSTER_KEY]: backupRoster,
        },
      };

      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      expect(result?.success).toBe(true);
    });
  });

  /**
   * Tests for statistics tracking during import
   */
  describe("Import Statistics", () => {
    it("should correctly count imported games in statistics", async () => {
      const backupData = createBackupData({
        games: {
          'game1': createTestAppState({ teamName: 'A', opponentName: 'B' }),
          'game2': createTestAppState({ teamName: 'C', opponentName: 'D' }),
          'game3': createTestAppState({ teamName: 'E', opponentName: 'F' }),
        },
        roster: [{ id: 'p1', name: 'P1', isGoalie: false, jerseyNumber: '1', notes: '' }],
      });

      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      expect(result?.statistics.gamesImported).toBe(3);
    });

    it("should correctly count imported players in statistics", async () => {
      const backupData = createBackupData({
        games: {},
        roster: [
          { id: 'p1', name: 'P1', isGoalie: false, jerseyNumber: '1', notes: '' },
          { id: 'p2', name: 'P2', isGoalie: false, jerseyNumber: '2', notes: '' },
          { id: 'p3', name: 'P3', isGoalie: true, jerseyNumber: '3', notes: '' },
        ],
      });

      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      expect(result?.statistics.playersImported).toBe(3);
    });

    it("should include mapping report when remapping occurs", async () => {
      const currentRoster: Player[] = [
        { id: 'current-1', name: 'Player One', isGoalie: false, jerseyNumber: '1', notes: '' },
        { id: 'current-2', name: 'Player Two', isGoalie: false, jerseyNumber: '2', notes: '' },
      ];
      mockStore[MASTER_ROSTER_KEY] = currentRoster;

      const backupGames: SavedGamesCollection = {
        'game': createTestAppState({
          teamName: 'Team',
          opponentName: 'Opponent',
          selectedPlayerIds: ['old-1', 'old-2', 'unknown-id'],
          playersOnField: [
            { id: 'old-1', name: 'Player One', isGoalie: false, jerseyNumber: '1', notes: '' },
            { id: 'old-2', name: 'Player Two', isGoalie: false, jerseyNumber: '2', notes: '' },
            { id: 'unknown-id', name: 'Unknown', isGoalie: false, jerseyNumber: '99', notes: '' },
          ],
          availablePlayers: [],
        }),
      };

      const backupData = createBackupData({
        games: backupGames,
        // No roster - triggers remapping
      });

      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      expect(result?.success).toBe(true);
      expect(result?.mappingReport).toBeDefined();
      expect(result?.mappingReport?.totalGames).toBe(1);
      expect(result?.mappingReport?.nameMatches).toBeGreaterThan(0);
    });

    it("should NOT include mapping report when backup has roster (no remapping)", async () => {
      const backupData = createBackupData({
        games: {
          'game': createTestAppState({
            teamName: 'Team',
            opponentName: 'Opponent',
            selectedPlayerIds: ['p1'],
            playersOnField: [{ id: 'p1', name: 'Player', isGoalie: false, jerseyNumber: '1', notes: '' }],
            availablePlayers: [],
          }),
        },
        roster: [{ id: 'p1', name: 'Player', isGoalie: false, jerseyNumber: '1', notes: '' }],
      });

      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      expect(result?.success).toBe(true);
      expect(result?.mappingReport).toBeUndefined();
    });
  });

  /**
   * Tests for delayReload functionality
   */
  describe("Delayed Reload", () => {
    it("should not trigger reload when delayReload is true", async () => {
      jest.useFakeTimers();

      const backupData = createBackupData({
        games: { 'game': createTestAppState({ teamName: 'A', opponentName: 'B' }) },
        roster: [{ id: 'p1', name: 'P', isGoalie: false, jerseyNumber: '1', notes: '' }],
      });

      const result = await importFullBackup(
        JSON.stringify(backupData),
        undefined,
        undefined,
        true, // confirmed
        true  // delayReload
      );

      expect(result?.success).toBe(true);

      // Advance all timers
      jest.advanceTimersByTime(1000);

      // Reload should NOT have been called
      if (jest.isMockFunction(window.location.reload)) {
        expect(window.location.reload).not.toHaveBeenCalled();
      }

      jest.useRealTimers();
    });

    it("should return result immediately when delayReload is true", async () => {
      const backupData = createBackupData({
        games: { 'game': createTestAppState({ teamName: 'A', opponentName: 'B' }) },
        roster: [{ id: 'p1', name: 'P', isGoalie: false, jerseyNumber: '1', notes: '' }],
      });

      const startTime = Date.now();
      const result = await importFullBackup(
        JSON.stringify(backupData),
        undefined,
        undefined,
        true,
        true
      );
      const endTime = Date.now();

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      // Should complete quickly (no setTimeout delay)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  /**
   * Tests for cross-device backup/restore scenarios
   */
  describe("Cross-Device Backup Scenarios", () => {
    it("should preserve all game selections across device transfer", async () => {
      // Simulate Device A backup with various game configurations
      const backupRoster: Player[] = [
        { id: 'alice-uuid', name: 'Alice', isGoalie: false, jerseyNumber: '10', notes: '' },
        { id: 'bob-uuid', name: 'Bob', isGoalie: false, jerseyNumber: '7', notes: '' },
        { id: 'charlie-uuid', name: 'Charlie', isGoalie: true, jerseyNumber: '1', notes: '' },
        { id: 'diana-uuid', name: 'Diana', isGoalie: false, jerseyNumber: '5', notes: '' },
      ];

      const games: SavedGamesCollection = {
        'game-march-1': createTestAppState({
          teamName: 'Team A',
          opponentName: 'Team X',
          gameDate: '2024-03-01',
          selectedPlayerIds: ['alice-uuid', 'bob-uuid'], // 2 players
          playersOnField: [backupRoster[0], backupRoster[1]],
          availablePlayers: [backupRoster[2], backupRoster[3]],
        }),
        'game-march-8': createTestAppState({
          teamName: 'Team A',
          opponentName: 'Team Y',
          gameDate: '2024-03-08',
          selectedPlayerIds: ['alice-uuid', 'charlie-uuid', 'diana-uuid'], // 3 players
          playersOnField: [backupRoster[0], backupRoster[2], backupRoster[3]],
          availablePlayers: [backupRoster[1]],
        }),
        'game-march-15': createTestAppState({
          teamName: 'Team A',
          opponentName: 'Team Z',
          gameDate: '2024-03-15',
          selectedPlayerIds: backupRoster.map(p => p.id), // All 4 players
          playersOnField: backupRoster,
          availablePlayers: [],
        }),
      };

      const backupData = createBackupData({
        games,
        roster: backupRoster,
        settings: { currentGameId: 'game-march-15' },
      });

      // Act: Import on "Device B" (empty storage)
      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      // Assert
      expect(result?.success).toBe(true);
      const restoredGames = mockStore[SAVED_GAMES_KEY] as SavedGamesCollection;

      // Each game should have EXACTLY the number of players it originally had
      expect(restoredGames['game-march-1'].selectedPlayerIds).toHaveLength(2);
      expect(restoredGames['game-march-8'].selectedPlayerIds).toHaveLength(3);
      expect(restoredGames['game-march-15'].selectedPlayerIds).toHaveLength(4);

      // Verify specific players per game
      expect(restoredGames['game-march-1'].selectedPlayerIds).toEqual(['alice-uuid', 'bob-uuid']);
      expect(restoredGames['game-march-8'].selectedPlayerIds).toEqual(['alice-uuid', 'charlie-uuid', 'diana-uuid']);
    });

    it("should handle assessment data correctly across device transfer", async () => {
      const backupRoster: Player[] = [
        { id: 'player-1', name: 'Star Player', isGoalie: false, jerseyNumber: '10', notes: '' },
      ];

      const games: SavedGamesCollection = {
        'game-with-assessment': createTestAppState({
          teamName: 'Team',
          opponentName: 'Opponent',
          gameDate: '2024-04-01',
          selectedPlayerIds: ['player-1'],
          playersOnField: [backupRoster[0]],
          availablePlayers: [],
          assessments: {
            'player-1': {
              overall: 9,
              sliders: { intensity: 9, courage: 8, duels: 9, technique: 8, creativity: 7, decisions: 8, awareness: 9, teamwork: 10, fair_play: 9, impact: 9 },
              notes: 'Outstanding performance!',
              minutesPlayed: 90,
              createdAt: Date.now(),
              createdBy: 'coach'
            }
          }
        }),
      };

      const backupData = createBackupData({
        games,
        roster: backupRoster,
      });

      const result = await importFullBackup(JSON.stringify(backupData), undefined, undefined, true);

      expect(result?.success).toBe(true);
      const restoredGames = mockStore[SAVED_GAMES_KEY] as SavedGamesCollection;
      const assessment = restoredGames['game-with-assessment'].assessments?.['player-1'];

      expect(assessment).toBeDefined();
      expect(assessment?.overall).toBe(9);
      expect(assessment?.notes).toBe('Outstanding performance!');
    });
  });
});
