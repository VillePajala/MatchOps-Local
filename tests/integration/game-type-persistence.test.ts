/**
 * Integration test for gameType persistence through the full game lifecycle.
 * @integration
 *
 * Tests the flow: Season creation → Game creation → Save → Load → Verify gameType
 */

import { saveSeasons, getSeasons } from '@/utils/seasons';
import { saveGame, getGame } from '@/utils/savedGames';
import { clearMockStore } from '@/utils/__mocks__/storage';
import type { Season, AppState } from '@/types';

// Helper to create a minimal valid AppState for testing
const createTestAppState = (overrides: Partial<AppState> & { testId: string }): AppState => ({
  playersOnField: [],
  opponents: [],
  drawings: [],
  availablePlayers: [],
  showPlayerNames: true,
  teamName: 'Test Team',
  gameEvents: [],
  opponentName: 'Test Opponent',
  gameDate: '2024-12-10',
  homeScore: 0,
  awayScore: 0,
  gameNotes: '',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 25,
  currentPeriod: 1,
  gameStatus: 'notStarted',
  selectedPlayerIds: [],
  seasonId: '',
  tournamentId: '',
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: null,
  ...overrides,
});

// Mock storage module - uses __mocks__/storage.ts for in-memory storage
jest.mock('@/utils/storage');

// Mock logger
jest.mock('@/utils/logger', () => ({
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

describe('Game Type Persistence Integration Tests', () => {
  beforeEach(() => {
    clearMockStore();
  });

  /**
   * Full end-to-end test for gameType persistence through the entire workflow:
   * 1. Create season with gameType: 'futsal'
   * 2. Start new game from that season (inheriting gameType)
   * 3. Save game to storage
   * 4. Reload game from storage
   * 5. Verify gameType: 'futsal' persists
   * @critical
   * @integration
   */
  it('should preserve gameType from season through game creation to saved game', async () => {
    // Step 1: Create a season with gameType: 'futsal'
    const futsalSeason: Season = {
      id: 'season-futsal-2024',
      name: 'Indoor Futsal League 2024',
      gameType: 'futsal',
      periodCount: 2,
      periodDuration: 20,
      location: 'Indoor Arena',
    };

    await saveSeasons([futsalSeason]);

    // Verify season was saved correctly
    const savedSeasons = await getSeasons();
    expect(savedSeasons).toHaveLength(1);
    expect(savedSeasons[0].gameType).toBe('futsal');

    // Step 2: Create a game state that would be created from this season
    // (simulating what NewGameSetupModal does when selecting a season)
    const gameId = 'game-001';
    const gameState = createTestAppState({
      testId: gameId,
      teamName: 'Home Futsal FC',
      opponentName: 'Away Futsal United',
      numberOfPeriods: 2,
      periodDurationMinutes: 20,
      seasonId: futsalSeason.id,
      // This is the key field we're testing - inherited from season
      gameType: 'futsal',
    });

    // Step 3: Save the game
    await saveGame(gameId, gameState);

    // Step 4: Reload the game from storage
    const loadedGame = await getGame(gameId);

    // Step 5: Verify gameType persisted
    expect(loadedGame).toBeDefined();
    expect(loadedGame!.gameType).toBe('futsal');
    expect(loadedGame!.seasonId).toBe('season-futsal-2024');
  });

  it('should preserve gameType: soccer when game is created without season', async () => {
    // Create a standalone game with explicit soccer gameType
    const gameId = 'game-standalone-soccer';
    const soccerGame = createTestAppState({
      testId: gameId,
      teamName: 'Soccer FC',
      opponentName: 'Football United',
      gameType: 'soccer',
    });

    await saveGame(gameId, soccerGame);

    const loadedGame = await getGame(gameId);

    expect(loadedGame).toBeDefined();
    expect(loadedGame!.gameType).toBe('soccer');
  });

  it('should handle games without gameType (backwards compatibility)', async () => {
    // Simulate a legacy game that was created before gameType was added
    const gameId = 'game-legacy';
    const legacyGame = createTestAppState({
      testId: gameId,
      teamName: 'Legacy Team',
      opponentName: 'Old School FC',
      gameDate: '2023-01-15',
      homeScore: 3,
      awayScore: 1,
      gameStatus: 'gameEnd',
      currentPeriod: 2,
      // No gameType - simulates legacy data
    });
    // Remove gameType to simulate legacy data
    delete (legacyGame as Partial<AppState>).gameType;

    await saveGame(gameId, legacyGame);

    const loadedGame = await getGame(gameId);

    expect(loadedGame).toBeDefined();
    // gameType should be undefined for legacy games
    expect(loadedGame!.gameType).toBeUndefined();
  });

  it('should preserve gameType when updating game details', async () => {
    // Create initial futsal game
    const gameId = 'game-update-test';
    const initialGame = createTestAppState({
      testId: gameId,
      teamName: 'Update Test FC',
      opponentName: 'Opponent',
      periodDurationMinutes: 20,
      gameType: 'futsal',
    });

    await saveGame(gameId, initialGame);

    // Update the game (simulating game progress)
    const updatedGame: AppState = {
      ...initialGame,
      homeScore: 5,
      awayScore: 3,
      gameStatus: 'gameEnd',
      gameEvents: [
        { id: 'e1', type: 'goal', time: 120, scorerId: 'p1' },
        { id: 'e2', type: 'goal', time: 300, scorerId: 'p2' },
      ],
    };

    await saveGame(gameId, updatedGame);

    // Verify gameType is still preserved after update
    const loadedGame = await getGame(gameId);

    expect(loadedGame).toBeDefined();
    expect(loadedGame!.gameType).toBe('futsal');
    expect(loadedGame!.homeScore).toBe(5);
    expect(loadedGame!.gameStatus).toBe('gameEnd');
  });

  it('should preserve different gameTypes across multiple games', async () => {
    // Create one soccer game and one futsal game
    const soccerGameId = 'game-soccer-multi';
    const soccerGame = createTestAppState({
      testId: soccerGameId,
      teamName: 'Soccer Team',
      opponentName: 'Soccer Opponent',
      gameType: 'soccer',
    });

    const futsalGameId = 'game-futsal-multi';
    const futsalGame = createTestAppState({
      testId: futsalGameId,
      teamName: 'Futsal Team',
      opponentName: 'Futsal Opponent',
      periodDurationMinutes: 20,
      gameType: 'futsal',
    });

    await saveGame(soccerGameId, soccerGame);
    await saveGame(futsalGameId, futsalGame);

    const loadedSoccerGame = await getGame(soccerGameId);
    const loadedFutsalGame = await getGame(futsalGameId);

    expect(loadedSoccerGame!.gameType).toBe('soccer');
    expect(loadedFutsalGame!.gameType).toBe('futsal');
  });

  /**
   * Tests the filtering behavior for legacy games without gameType.
   * Verifies comment on line 10 of src/types/game.ts:
   * "Legacy games without gameType are treated as 'soccer' during filtering"
   * @integration
   */
  it('should treat legacy games (gameType: undefined) as soccer during filtering', async () => {
    // Import the filter function
    const { filterGameIds } = await import('@/components/GameStatsModal/utils/gameFilters');

    // Create a legacy game (no gameType - simulates pre-gameType data)
    const legacyGameId = 'game-legacy-filter-test';
    const legacyGame = createTestAppState({
      testId: legacyGameId,
      teamName: 'Legacy Team',
      opponentName: 'Old Opponent',
      gameDate: '2023-06-15',
      homeScore: 2,
      awayScore: 1,
      gameStatus: 'gameEnd',
      isPlayed: true,
    });
    // Remove gameType to simulate legacy data
    delete (legacyGame as Partial<AppState>).gameType;

    await saveGame(legacyGameId, legacyGame);

    // Verify the game has no gameType
    const loadedGame = await getGame(legacyGameId);
    expect(loadedGame!.gameType).toBeUndefined();

    // Create a SavedGamesCollection for filtering
    const savedGames = { [legacyGameId]: loadedGame! };

    // Test 1: Filter for 'soccer' - legacy game SHOULD be included
    const soccerFiltered = filterGameIds(savedGames, {
      activeTab: 'overall',
      teamFilter: 'all',
      gameTypeFilter: 'soccer',
      clubSeasonFilter: 'all',
      clubSeasonStartDate: '2000-10-01',
      clubSeasonEndDate: '2000-05-01',
    });
    expect(soccerFiltered).toContain(legacyGameId);

    // Test 2: Filter for 'futsal' - legacy game should NOT be included
    const futsalFiltered = filterGameIds(savedGames, {
      activeTab: 'overall',
      teamFilter: 'all',
      gameTypeFilter: 'futsal',
      clubSeasonFilter: 'all',
      clubSeasonStartDate: '2000-10-01',
      clubSeasonEndDate: '2000-05-01',
    });
    expect(futsalFiltered).not.toContain(legacyGameId);

    // Test 3: Filter for 'all' - legacy game SHOULD be included
    const allFiltered = filterGameIds(savedGames, {
      activeTab: 'overall',
      teamFilter: 'all',
      gameTypeFilter: 'all',
      clubSeasonFilter: 'all',
      clubSeasonStartDate: '2000-10-01',
      clubSeasonEndDate: '2000-05-01',
    });
    expect(allFiltered).toContain(legacyGameId);
  });
});
