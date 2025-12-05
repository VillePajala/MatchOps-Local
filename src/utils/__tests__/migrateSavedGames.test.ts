/**
 * Tests for migrateSavedGames utility
 * @integration
 */

import { migrateSavedGamesIsPlayed } from '../migrateSavedGames';
import * as savedGamesModule from '../savedGames';
import type { SavedGamesCollection } from '@/types';

// Mock the savedGames module
jest.mock('../savedGames');

// Mock the logger to prevent console.error from failing tests
jest.mock('../logger', () => {
  const mockLogger = {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockLogger,
    createLogger: jest.fn(() => mockLogger),
  };
});

const mockGetSavedGames = savedGamesModule.getSavedGames as jest.MockedFunction<typeof savedGamesModule.getSavedGames>;
const mockSaveGames = savedGamesModule.saveGames as jest.MockedFunction<typeof savedGamesModule.saveGames>;

describe('migrateSavedGamesIsPlayed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveGames.mockResolvedValue(undefined);
  });

  // Minimal mock game with just the fields needed for isPlayed migration
  const createMockGame = (id: string, isPlayed?: boolean): SavedGamesCollection[string] => ({
    id,
    gameName: `Game ${id}`,
    homeTeamName: 'Home',
    awayTeamName: 'Away',
    homeScore: 0,
    awayScore: 0,
    playerPositions: {},
    opponentPositions: {},
    drawings: [],
    gameState: {
      totalSeconds: 0,
      isRunning: false,
      periodInfo: { currentPeriod: 1, totalPeriods: 2, periodLength: 25 },
      gameEvents: [],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(isPlayed !== undefined ? { isPlayed } : {}),
  } as unknown as SavedGamesCollection[string]);

  it('should return 0 when no games exist', async () => {
    mockGetSavedGames.mockResolvedValue({});

    const result = await migrateSavedGamesIsPlayed();

    expect(result).toBe(0);
    expect(mockSaveGames).not.toHaveBeenCalled();
  });

  it('should return 0 when all games already have isPlayed', async () => {
    const games: SavedGamesCollection = {
      'game1': createMockGame('game1', true),
      'game2': createMockGame('game2', false),
    };
    mockGetSavedGames.mockResolvedValue(games);

    const result = await migrateSavedGamesIsPlayed();

    expect(result).toBe(0);
    expect(mockSaveGames).not.toHaveBeenCalled();
  });

  it('should add isPlayed: true to games missing the property', async () => {
    const games: SavedGamesCollection = {
      'game1': createMockGame('game1'), // No isPlayed property
      'game2': createMockGame('game2', true), // Already has isPlayed
    };
    mockGetSavedGames.mockResolvedValue(games);

    const result = await migrateSavedGamesIsPlayed();

    expect(result).toBe(1);
    expect(mockSaveGames).toHaveBeenCalledTimes(1);

    // Verify the game was updated
    const savedGames = mockSaveGames.mock.calls[0][0];
    expect(savedGames['game1'].isPlayed).toBe(true);
    expect(savedGames['game2'].isPlayed).toBe(true);
  });

  it('should update multiple games missing isPlayed', async () => {
    const games: SavedGamesCollection = {
      'game1': createMockGame('game1'), // No isPlayed
      'game2': createMockGame('game2'), // No isPlayed
      'game3': createMockGame('game3'), // No isPlayed
    };
    mockGetSavedGames.mockResolvedValue(games);

    const result = await migrateSavedGamesIsPlayed();

    expect(result).toBe(3);
    expect(mockSaveGames).toHaveBeenCalledTimes(1);

    // Verify all games were updated
    const savedGames = mockSaveGames.mock.calls[0][0];
    expect(savedGames['game1'].isPlayed).toBe(true);
    expect(savedGames['game2'].isPlayed).toBe(true);
    expect(savedGames['game3'].isPlayed).toBe(true);
  });

  it('should handle mixed games (some with, some without isPlayed)', async () => {
    const games: SavedGamesCollection = {
      'game1': createMockGame('game1', true),  // Has isPlayed: true
      'game2': createMockGame('game2'),        // Missing isPlayed
      'game3': createMockGame('game3', false), // Has isPlayed: false
      'game4': createMockGame('game4'),        // Missing isPlayed
    };
    mockGetSavedGames.mockResolvedValue(games);

    const result = await migrateSavedGamesIsPlayed();

    expect(result).toBe(2); // Only game2 and game4 need updating
    expect(mockSaveGames).toHaveBeenCalledTimes(1);

    const savedGames = mockSaveGames.mock.calls[0][0];
    expect(savedGames['game1'].isPlayed).toBe(true);  // Unchanged
    expect(savedGames['game2'].isPlayed).toBe(true);  // Updated
    expect(savedGames['game3'].isPlayed).toBe(false); // Unchanged
    expect(savedGames['game4'].isPlayed).toBe(true);  // Updated
  });

  it('should throw error when getSavedGames fails', async () => {
    const error = new Error('Failed to get saved games');
    mockGetSavedGames.mockRejectedValue(error);

    await expect(migrateSavedGamesIsPlayed()).rejects.toThrow('Failed to get saved games');
    expect(mockSaveGames).not.toHaveBeenCalled();
  });

  it('should throw error when saveGames fails', async () => {
    const games: SavedGamesCollection = {
      'game1': createMockGame('game1'), // No isPlayed
    };
    mockGetSavedGames.mockResolvedValue(games);
    mockSaveGames.mockRejectedValue(new Error('Failed to save games'));

    await expect(migrateSavedGamesIsPlayed()).rejects.toThrow('Failed to save games');
  });
});
