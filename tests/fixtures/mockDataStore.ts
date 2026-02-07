/**
 * Mock DataStore Factory for Testing
 *
 * Provides a reusable mock DataStore with sensible defaults.
 * Reduces duplication across test files and ensures consistency.
 *
 * @example
 * ```typescript
 * import { createMockDataStore } from 'tests/fixtures/mockDataStore';
 *
 * // Basic usage with defaults
 * const mockDataStore = createMockDataStore();
 *
 * // With custom implementations
 * const mockDataStore = createMockDataStore({
 *   getGames: jest.fn(async () => ({ game1: mockGame })),
 *   saveGame: jest.fn(async (id, game) => game),
 * });
 *
 * // Mock the module
 * jest.mock('@/datastore', () => ({
 *   getDataStore: jest.fn(async () => mockDataStore),
 * }));
 * ```
 */

import type { DataStore } from '@/interfaces/DataStore';
import type { AppState, SavedGamesCollection } from '@/types/game';
import type { Player, Team, TeamPlayer, Season, Tournament, PlayerStatAdjustment } from '@/types';
import type { Personnel } from '@/types/personnel';
import type { AppSettings } from '@/types/settings';

/**
 * Type for partial mock overrides.
 * All methods are optional - defaults will be used for unspecified methods.
 * Uses NonNullable to handle optional methods like clearUserCaches.
 */
export type MockDataStoreOverrides = {
  [K in keyof DataStore]?: DataStore[K] extends ((...args: infer A) => infer R)
    ? jest.Mock | ((...args: A) => R)
    : jest.Mock;
};

/**
 * Default settings for mock DataStore
 */
const defaultSettings: AppSettings = {
  currentGameId: null,
  language: 'en',
  hasSeenAppGuide: false,
};

/**
 * Creates a mock DataStore with all methods as jest.fn().
 * Defaults return empty arrays/objects/null as appropriate.
 *
 * @param overrides - Optional method implementations to override defaults
 * @returns Complete mock DataStore object
 */
export const createMockDataStore = (overrides: MockDataStoreOverrides = {}): jest.Mocked<DataStore> => {
  const defaultMock: jest.Mocked<DataStore> = {
    // Lifecycle
    initialize: jest.fn(async () => {}),
    close: jest.fn(async () => {}),
    getBackendName: jest.fn(() => 'mock'),
    isAvailable: jest.fn(async () => true),
    isInitialized: jest.fn(() => true),
    clearUserCaches: jest.fn(),

    // Players
    getPlayers: jest.fn(async () => []),
    createPlayer: jest.fn(async (player: Omit<Player, 'id'>) => ({
      ...player,
      id: `player_${Date.now()}`,
    })) as unknown as jest.MockedFunction<DataStore['createPlayer']>,
    updatePlayer: jest.fn(async () => null) as unknown as jest.MockedFunction<DataStore['updatePlayer']>,
    deletePlayer: jest.fn(async () => false) as unknown as jest.MockedFunction<DataStore['deletePlayer']>,
    upsertPlayer: jest.fn(async (player: Player) => player) as unknown as jest.MockedFunction<
      DataStore['upsertPlayer']
    >,

    // Teams
    getTeams: jest.fn(async () => []),
    getTeamById: jest.fn(async () => null) as unknown as jest.MockedFunction<DataStore['getTeamById']>,
    createTeam: jest.fn(async (team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>) => ({
      ...team,
      id: `team_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })) as unknown as jest.MockedFunction<DataStore['createTeam']>,
    updateTeam: jest.fn(async () => null) as unknown as jest.MockedFunction<DataStore['updateTeam']>,
    deleteTeam: jest.fn(async () => false) as unknown as jest.MockedFunction<DataStore['deleteTeam']>,
    upsertTeam: jest.fn(async (team: Team) => team) as unknown as jest.MockedFunction<DataStore['upsertTeam']>,

    // Team Rosters
    getTeamRoster: jest.fn(async () => []) as unknown as jest.MockedFunction<DataStore['getTeamRoster']>,
    setTeamRoster: jest.fn(async () => {}) as unknown as jest.MockedFunction<DataStore['setTeamRoster']>,
    getAllTeamRosters: jest.fn(async () => ({})) as unknown as jest.MockedFunction<DataStore['getAllTeamRosters']>,

    // Seasons
    getSeasons: jest.fn(async () => []),
    createSeason: jest.fn(async (name: string, extra?: Partial<Season>) => ({
      id: `season_${Date.now()}`,
      name,
      ...extra,
    })) as unknown as jest.MockedFunction<DataStore['createSeason']>,
    updateSeason: jest.fn(async () => null) as unknown as jest.MockedFunction<DataStore['updateSeason']>,
    deleteSeason: jest.fn(async () => false) as unknown as jest.MockedFunction<DataStore['deleteSeason']>,
    upsertSeason: jest.fn(async (season: Season) => season) as unknown as jest.MockedFunction<
      DataStore['upsertSeason']
    >,

    // Tournaments
    getTournaments: jest.fn(async () => []),
    createTournament: jest.fn(async (name: string, extra?: Partial<Tournament>) => ({
      id: `tournament_${Date.now()}`,
      name,
      ...extra,
    })) as unknown as jest.MockedFunction<DataStore['createTournament']>,
    updateTournament: jest.fn(async () => null) as unknown as jest.MockedFunction<DataStore['updateTournament']>,
    deleteTournament: jest.fn(async () => false) as unknown as jest.MockedFunction<
      DataStore['deleteTournament']
    >,
    upsertTournament: jest.fn(async (tournament: Tournament) => tournament) as unknown as jest.MockedFunction<
      DataStore['upsertTournament']
    >,

    // Personnel
    getAllPersonnel: jest.fn(async () => []),
    getPersonnelById: jest.fn(async () => null) as unknown as jest.MockedFunction<DataStore['getPersonnelById']>,
    addPersonnelMember: jest.fn(async (data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>) => ({
      ...data,
      id: `personnel_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })) as unknown as jest.MockedFunction<DataStore['addPersonnelMember']>,
    updatePersonnelMember: jest.fn(async () => null) as unknown as jest.MockedFunction<DataStore['updatePersonnelMember']>,
    removePersonnelMember: jest.fn(async () => false) as unknown as jest.MockedFunction<
      DataStore['removePersonnelMember']
    >,
    upsertPersonnelMember: jest.fn(async (personnel: Personnel) => personnel) as unknown as jest.MockedFunction<
      DataStore['upsertPersonnelMember']
    >,

    // Games
    getGames: jest.fn(async () => ({})),
    getGameById: jest.fn(async () => null) as unknown as jest.MockedFunction<DataStore['getGameById']>,
    createGame: jest.fn(async (game: Partial<AppState>) => {
      const gameId = `game_${Date.now()}`;
      const gameData = {
        teamName: '',
        opponentName: '',
        gameDate: new Date().toISOString().split('T')[0],
        homeScore: 0,
        awayScore: 0,
        gameEvents: [],
        playersOnField: [],
        availablePlayers: [],
        opponents: [],
        drawings: [],
        showPlayerNames: true,
        gameNotes: '',
        homeOrAway: 'home' as const,
        numberOfPeriods: 2 as const,
        periodDurationMinutes: 25,
        gameStatus: 'notStarted' as const,
        ...game,
      } as AppState;
      return { gameId, gameData };
    }),
    saveGame: jest.fn(async (_id: string, game: AppState) => game),
    saveAllGames: jest.fn(async () => {}) as unknown as jest.MockedFunction<DataStore['saveAllGames']>,
    deleteGame: jest.fn(async () => false) as unknown as jest.MockedFunction<DataStore['deleteGame']>,

    // Game Events
    addGameEvent: jest.fn(async () => null) as unknown as jest.MockedFunction<DataStore['addGameEvent']>,
    updateGameEvent: jest.fn(async () => null) as unknown as jest.MockedFunction<DataStore['updateGameEvent']>,
    removeGameEvent: jest.fn(async () => null) as unknown as jest.MockedFunction<DataStore['removeGameEvent']>,

    // Settings
    getSettings: jest.fn(async () => defaultSettings),
    saveSettings: jest.fn(async () => {}) as unknown as jest.MockedFunction<DataStore['saveSettings']>,
    updateSettings: jest.fn(async (updates: Partial<AppSettings>) => ({
      ...defaultSettings,
      ...updates,
    })),

    // Player Adjustments
    getPlayerAdjustments: jest.fn(async () => []) as unknown as jest.MockedFunction<DataStore['getPlayerAdjustments']>,
    getAllPlayerAdjustments: jest.fn(async () => new Map<string, PlayerStatAdjustment[]>()) as unknown as jest.MockedFunction<DataStore['getAllPlayerAdjustments']>,
    addPlayerAdjustment: jest.fn(async (adj: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'>) => ({
      ...adj,
      id: `adj_${Date.now()}`,
      appliedAt: new Date().toISOString(),
    })) as unknown as jest.MockedFunction<DataStore['addPlayerAdjustment']>,
    upsertPlayerAdjustment: jest.fn(async (adj: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string }) => ({
      ...adj,
      id: adj.id || `adj_${Date.now()}`,
      appliedAt: adj.appliedAt || new Date().toISOString(),
    })) as unknown as jest.MockedFunction<DataStore['upsertPlayerAdjustment']>,
    updatePlayerAdjustment: jest.fn(async () => null) as unknown as jest.MockedFunction<DataStore['updatePlayerAdjustment']>,
    deletePlayerAdjustment: jest.fn(async () => false) as unknown as jest.MockedFunction<DataStore['deletePlayerAdjustment']>,

    // Warmup Plan
    getWarmupPlan: jest.fn(async () => null),
    saveWarmupPlan: jest.fn(async () => true) as unknown as jest.MockedFunction<DataStore['saveWarmupPlan']>,
    deleteWarmupPlan: jest.fn(async () => false),

    // Timer State
    getTimerState: jest.fn(async () => null),
    saveTimerState: jest.fn(async () => {}) as unknown as jest.MockedFunction<DataStore['saveTimerState']>,
    clearTimerState: jest.fn(async () => {}),

    // Danger Zone
    clearAllUserData: jest.fn(async () => {}),

    // Entity Reference Checks
    getSeasonReferences: jest.fn(async () => ({
      canDelete: true,
      counts: { games: 0, teams: 0, adjustments: 0 },
      summary: 'Not used by any other data',
    })) as unknown as jest.MockedFunction<DataStore['getSeasonReferences']>,
    getTournamentReferences: jest.fn(async () => ({
      canDelete: true,
      counts: { games: 0, teams: 0, adjustments: 0 },
      summary: 'Not used by any other data',
    })) as unknown as jest.MockedFunction<DataStore['getTournamentReferences']>,
    getTeamReferences: jest.fn(async () => ({
      canDelete: true,
      counts: { games: 0 },
      summary: 'Not used by any other data',
    })) as unknown as jest.MockedFunction<DataStore['getTeamReferences']>,
  };

  // Apply overrides
  return { ...defaultMock, ...overrides } as jest.Mocked<DataStore>;
};

/**
 * Creates a mock DataStore with in-memory storage for integration-style tests.
 * Maintains state across calls within a test.
 *
 * @returns Mock DataStore with working in-memory storage
 */
export const createStatefulMockDataStore = (): {
  dataStore: jest.Mocked<DataStore>;
  state: {
    players: Player[];
    teams: Team[];
    teamRosters: Record<string, TeamPlayer[]>;
    seasons: Season[];
    tournaments: Tournament[];
    personnel: Personnel[];
    games: SavedGamesCollection;
    settings: AppSettings;
  };
} => {
  const state = {
    players: [] as Player[],
    teams: [] as Team[],
    teamRosters: {} as Record<string, TeamPlayer[]>,
    seasons: [] as Season[],
    tournaments: [] as Tournament[],
    personnel: [] as Personnel[],
    games: {} as SavedGamesCollection,
    settings: { ...defaultSettings },
  };

  const dataStore = createMockDataStore({
    // Players with state
    getPlayers: jest.fn(async () => [...state.players]),
    createPlayer: jest.fn(async (player: Omit<Player, 'id'>) => {
      const newPlayer = { ...player, id: `player_${Date.now()}_${state.players.length}` };
      state.players.push(newPlayer);
      return newPlayer;
    }),
    updatePlayer: jest.fn(async (id: string, updates: Partial<Player>) => {
      const index = state.players.findIndex(p => p.id === id);
      if (index === -1) return null;
      state.players[index] = { ...state.players[index], ...updates };
      return state.players[index];
    }),
    deletePlayer: jest.fn(async (id: string) => {
      const index = state.players.findIndex(p => p.id === id);
      if (index === -1) return false;
      state.players.splice(index, 1);
      return true;
    }),
    upsertPlayer: jest.fn(async (player: Player) => {
      const index = state.players.findIndex((p) => p.id === player.id);
      if (index === -1) {
        state.players.push(player);
      } else {
        state.players[index] = player;
      }
      return player;
    }),

    // Teams with state
    getTeams: jest.fn(async () => [...state.teams]),
    getTeamById: jest.fn(async (id: string) => state.teams.find((t) => t.id === id) || null),
    createTeam: jest.fn(async (team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = new Date().toISOString();
      const newTeam: Team = {
        ...team,
        id: `team_${Date.now()}_${state.teams.length}`,
        createdAt: now,
        updatedAt: now,
      };
      state.teams.push(newTeam);
      return newTeam;
    }),
    updateTeam: jest.fn(async (id: string, updates: Partial<Team>) => {
      const index = state.teams.findIndex((t) => t.id === id);
      if (index === -1) return null;
      state.teams[index] = { ...state.teams[index], ...updates, updatedAt: new Date().toISOString() };
      return state.teams[index];
    }),
    deleteTeam: jest.fn(async (id: string) => {
      const index = state.teams.findIndex((t) => t.id === id);
      if (index === -1) return false;
      state.teams.splice(index, 1);
      return true;
    }),
    upsertTeam: jest.fn(async (team: Team) => {
      const index = state.teams.findIndex((t) => t.id === team.id);
      if (index === -1) {
        state.teams.push(team);
      } else {
        state.teams[index] = team;
      }
      return team;
    }),

    // Team Rosters with state
    getTeamRoster: jest.fn(async (teamId: string) => state.teamRosters[teamId] || []),
    setTeamRoster: jest.fn(async (teamId: string, roster: TeamPlayer[]) => {
      state.teamRosters[teamId] = roster;
    }),
    getAllTeamRosters: jest.fn(async () => ({ ...state.teamRosters })),

    // Seasons with state
    getSeasons: jest.fn(async () => [...state.seasons]),
    createSeason: jest.fn(async (name: string, extra?: Partial<Season>) => {
      const newSeason: Season = {
        id: `season_${Date.now()}_${state.seasons.length}`,
        name,
        ...extra,
      };
      state.seasons.push(newSeason);
      return newSeason;
    }),
    updateSeason: jest.fn(async (id: string, updates: Partial<Season>) => {
      const index = state.seasons.findIndex((s) => s.id === id);
      if (index === -1) return null;
      state.seasons[index] = { ...state.seasons[index], ...updates };
      return state.seasons[index];
    }),
    deleteSeason: jest.fn(async (id: string) => {
      const index = state.seasons.findIndex((s) => s.id === id);
      if (index === -1) return false;
      state.seasons.splice(index, 1);
      return true;
    }),
    upsertSeason: jest.fn(async (season: Season) => {
      const index = state.seasons.findIndex((s) => s.id === season.id);
      if (index === -1) {
        state.seasons.push(season);
      } else {
        state.seasons[index] = season;
      }
      return season;
    }),

    // Tournaments with state
    getTournaments: jest.fn(async () => [...state.tournaments]),
    createTournament: jest.fn(async (name: string, extra?: Partial<Tournament>) => {
      const newTournament: Tournament = {
        id: `tournament_${Date.now()}_${state.tournaments.length}`,
        name,
        ...extra,
      };
      state.tournaments.push(newTournament);
      return newTournament;
    }),
    updateTournament: jest.fn(async (id: string, updates: Partial<Tournament>) => {
      const index = state.tournaments.findIndex((t) => t.id === id);
      if (index === -1) return null;
      state.tournaments[index] = { ...state.tournaments[index], ...updates };
      return state.tournaments[index];
    }),
    deleteTournament: jest.fn(async (id: string) => {
      const index = state.tournaments.findIndex((t) => t.id === id);
      if (index === -1) return false;
      state.tournaments.splice(index, 1);
      return true;
    }),
    upsertTournament: jest.fn(async (tournament: Tournament) => {
      const index = state.tournaments.findIndex((t) => t.id === tournament.id);
      if (index === -1) {
        state.tournaments.push(tournament);
      } else {
        state.tournaments[index] = tournament;
      }
      return tournament;
    }),

    // Games with state
    getGames: jest.fn(async () => ({ ...state.games })),
    getGameById: jest.fn(async (id: string) => state.games[id] || null),
    saveGame: jest.fn(async (id: string, game: AppState) => {
      state.games[id] = game;
      return game;
    }),
    saveAllGames: jest.fn(async (games: SavedGamesCollection) => {
      state.games = { ...games };
    }),
    deleteGame: jest.fn(async (id: string) => {
      if (!state.games[id]) return false;
      delete state.games[id];
      return true;
    }),

    // Personnel with state
    getAllPersonnel: jest.fn(async () => [...state.personnel]),
    getPersonnelById: jest.fn(async (id: string) => state.personnel.find(p => p.id === id) || null),
    addPersonnelMember: jest.fn(async (data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = new Date().toISOString();
      const newPersonnel: Personnel = {
        ...data,
        id: `personnel_${Date.now()}_${state.personnel.length}`,
        createdAt: now,
        updatedAt: now,
      };
      state.personnel.push(newPersonnel);
      return newPersonnel;
    }),
    removePersonnelMember: jest.fn(async (id: string) => {
      const index = state.personnel.findIndex(p => p.id === id);
      if (index === -1) return false;
      state.personnel.splice(index, 1);
      return true;
    }),
    upsertPersonnelMember: jest.fn(async (personnel: Personnel) => {
      const index = state.personnel.findIndex((p) => p.id === personnel.id);
      if (index === -1) {
        state.personnel.push(personnel);
      } else {
        state.personnel[index] = personnel;
      }
      return personnel;
    }),

    // Settings with state
    getSettings: jest.fn(async () => ({ ...state.settings })),
    saveSettings: jest.fn(async (settings: AppSettings) => {
      state.settings = { ...settings };
    }),
    updateSettings: jest.fn(async (updates: Partial<AppSettings>) => {
      state.settings = { ...state.settings, ...updates };
      return state.settings;
    }),
  });

  return { dataStore, state };
};

/**
 * Helper to reset all mock functions on a DataStore mock.
 * Useful in beforeEach hooks.
 *
 * @param mockDataStore - The mock DataStore to reset
 */
export const resetMockDataStore = (mockDataStore: jest.Mocked<DataStore>): void => {
  Object.values(mockDataStore).forEach(value => {
    if (typeof value === 'function' && 'mockClear' in value) {
      (value as jest.Mock).mockClear();
    }
  });
};
