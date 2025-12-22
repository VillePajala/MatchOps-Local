import type { Player } from '@/types';
import type {
  AppState,
  SavedGamesCollection,
  GameEvent as PageGameEvent
} from '@/types';
import {
  getSavedGames,
  saveGames,
  saveGame,
  getGame,
  deleteGame,
  createGame,
  getAllGameIds,
  getFilteredGames,
  updateGameDetails,
  addGameEvent,
  updateGameEvent,
  removeGameEvent,
  exportGamesAsJson,
  importGamesFromJson,
  getLatestGameId,
} from './savedGames';

// Mock DataStore
const mockDataStore = {
  getGames: jest.fn(),
  getGameById: jest.fn(),
  createGame: jest.fn(),
  saveGame: jest.fn(),
  saveAllGames: jest.fn(),
  deleteGame: jest.fn(),
  addGameEvent: jest.fn(),
  updateGameEvent: jest.fn(),
  removeGameEvent: jest.fn(),
};

jest.mock('@/datastore', () => ({
  getDataStore: jest.fn(async () => mockDataStore),
}));

describe('Saved Games Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockPlayer1: Player = { id: 'player_1', name: 'John', jerseyNumber: '10', isGoalie: false, receivedFairPlayCard: false, notes: '' };
  const mockPlayer2: Player = { id: 'player_2', name: 'Jane', jerseyNumber: '5', isGoalie: true, receivedFairPlayCard: false, notes: 'Goalie' };

  const mockEvent1: PageGameEvent = { id: 'event_1', type: 'goal', scorerId: 'player_1', time: 1234567890 };
  const mockEvent2: PageGameEvent = { id: 'event_2', type: 'periodEnd', time: 1234568890 };

  // Base AppState structure for re-use (ensure all AppState fields are covered)
  const mockBaseAppState: AppState = {
    playersOnField: [],
    opponents: [],
    drawings: [],
    availablePlayers: [mockPlayer1, mockPlayer2],
    showPlayerNames: true,
    teamName: 'Dragons',
    gameEvents: [mockEvent1],
    opponentName: 'Tigers',
    gameDate: '2023-04-15',
    homeScore: 1,
    awayScore: 0,
    gameNotes: 'Game notes',
    homeOrAway: 'home',
    numberOfPeriods: 2,
    periodDurationMinutes: 10,
    currentPeriod: 1,
    gameStatus: 'inProgress',
    selectedPlayerIds: ['player_1'],
    assessments: {},
    seasonId: 'season_1',
    tournamentId: 'tournament_1',
    gameLocation: 'Stadium A',
    gameTime: '14:00',
    subIntervalMinutes: 5,
    completedIntervalDurations: [],
    lastSubConfirmationTimeSeconds: 0,
    tacticalDiscs: [],
    tacticalDrawings: [],
    tacticalBallPosition: { relX: 0, relY: 0 },
  };

  const mockGame1_AppState: AppState = {
    ...mockBaseAppState, // Spread base and then override specifics if any for game 1
    // No specific overrides for game1 from mockBaseAppState needed for this example
  };

  const mockGame2_AppState: AppState = {
    ...mockBaseAppState,
    teamName: 'Eagles', // Was homeTeam
    opponentName: 'Condors', // Was awayTeam
    gameEvents: [mockEvent2],
    assessments: {},
      seasonId: 'season_2',
    tournamentId: '', // AppState.tournamentId is string, use '' for empty
    homeScore: 0,
    awayScore: 2,
  };

  const mockSavedGamesCollection: SavedGamesCollection = {
    'game_123': mockGame1_AppState,
    'game_456': mockGame2_AppState,
  };


  describe('getSavedGames', () => {
    it('should return an empty object if no games are stored', async () => {
      mockDataStore.getGames.mockResolvedValue({});
      await expect(getSavedGames()).resolves.toEqual({});
      expect(mockDataStore.getGames).toHaveBeenCalledTimes(1);
    });

    it('should return the games (as AppState collection) if they exist', async () => {
      mockDataStore.getGames.mockResolvedValue(mockSavedGamesCollection);
      await expect(getSavedGames()).resolves.toEqual(mockSavedGamesCollection);
    });

    it('should delegate to DataStore.getGames()', async () => {
      mockDataStore.getGames.mockResolvedValue({});
      await getSavedGames();
      expect(mockDataStore.getGames).toHaveBeenCalledTimes(1);
    });
  });

  describe('getGame', () => {
    it('should return the requested game as AppState if it exists', async () => {
      mockDataStore.getGameById.mockResolvedValue(mockGame1_AppState);
      await expect(getGame('game_123')).resolves.toEqual(mockGame1_AppState);
      expect(mockDataStore.getGameById).toHaveBeenCalledWith('game_123');
    });

    it('should return null if game does not exist', async () => {
      mockDataStore.getGameById.mockResolvedValue(null);
      await expect(getGame('nonexistent_game')).resolves.toBeNull();
    });

    it('should return null if gameId is empty', async () => {
      // Empty gameId returns null without calling DataStore
      await expect(getGame('')).resolves.toBeNull();
      expect(mockDataStore.getGameById).not.toHaveBeenCalled();
    });
  });

  describe('saveGames', () => {
    it('should delegate to DataStore.saveAllGames()', async () => {
      mockDataStore.saveAllGames.mockResolvedValue(undefined);
      await expect(saveGames(mockSavedGamesCollection)).resolves.toBeUndefined();
      expect(mockDataStore.saveAllGames).toHaveBeenCalledWith(mockSavedGamesCollection);
    });

    it('should handle storage errors during saveGames and reject', async () => {
      const error = new Error('Storage quota exceeded');
      mockDataStore.saveAllGames.mockRejectedValue(error);
      await expect(saveGames(mockSavedGamesCollection)).rejects.toThrow('Storage quota exceeded');
    });
  });

  describe('saveGame', () => {
    it('should delegate to DataStore.saveGame() and return the saved game', async () => {
      const newGameId = 'game_789';
      const newGame: AppState = { ...mockBaseAppState, teamName: 'Wolves' };

      mockDataStore.saveGame.mockResolvedValue(newGame);
      await expect(saveGame(newGameId, newGame)).resolves.toEqual(newGame);
      expect(mockDataStore.saveGame).toHaveBeenCalledWith(newGameId, newGame);
    });

    it('should reject if gameId is empty', async () => {
      await expect(saveGame('', mockGame1_AppState)).rejects.toThrow('Game ID is required');
      expect(mockDataStore.saveGame).not.toHaveBeenCalled();
    });

    it('should reject if DataStore.saveGame fails', async () => {
      mockDataStore.saveGame.mockRejectedValue(new Error('Storage failure'));
      await expect(saveGame('game_123', mockGame1_AppState)).rejects.toThrow('Storage failure');
    });
  });

  describe('deleteGame', () => {
    it('should delete the game and return the gameId', async () => {
      mockDataStore.deleteGame.mockResolvedValue(true);
      await expect(deleteGame('game_123')).resolves.toBe('game_123');
      expect(mockDataStore.deleteGame).toHaveBeenCalledWith('game_123');
    });

    it('should return null if game to delete is not found', async () => {
      mockDataStore.deleteGame.mockResolvedValue(false);
      await expect(deleteGame('nonexistent_id')).resolves.toBe(null);
    });

    it('should return null if gameId is empty', async () => {
      await expect(deleteGame('')).resolves.toBe(null);
      expect(mockDataStore.deleteGame).not.toHaveBeenCalled();
    });

    it('should reject if DataStore.deleteGame fails', async () => {
      mockDataStore.deleteGame.mockRejectedValue(new Error('Storage failure'));
      await expect(deleteGame('game_123')).rejects.toThrow('Storage failure');
    });
  });

  describe('createGame', () => {
    it('should delegate to DataStore.createGame()', async () => {
      const initialGamePartial: Partial<AppState> = { teamName: 'New Team FC', seasonId: 'season_2077' };
      const mockResult = {
        gameId: 'game_123_abc12345',
        gameData: { ...mockBaseAppState, teamName: 'New Team FC', seasonId: 'season_2077' }
      };

      mockDataStore.createGame.mockResolvedValue(mockResult);
      const result = await createGame(initialGamePartial);

      expect(result).toEqual(mockResult);
      expect(mockDataStore.createGame).toHaveBeenCalledWith(initialGamePartial);
    });

    it('should reject if DataStore.createGame fails', async () => {
      mockDataStore.createGame.mockRejectedValue(new Error('Storage failure'));
      const initialGamePartial: Partial<AppState> = { teamName: 'Fail Team' };

      await expect(createGame(initialGamePartial)).rejects.toThrow('Storage failure');
    });
  });

  describe('addGameEvent', () => {
    it('should delegate to DataStore.addGameEvent()', async () => {
      const newEvent: PageGameEvent = { id: 'event_add', type: 'goal', scorerId: 'player_new', time: 100 };
      const updatedGame = { ...mockGame1_AppState, gameEvents: [...mockGame1_AppState.gameEvents, newEvent] };

      mockDataStore.addGameEvent.mockResolvedValue(updatedGame);
      const result = await addGameEvent('game_123', newEvent);

      expect(result).toEqual(updatedGame);
      expect(mockDataStore.addGameEvent).toHaveBeenCalledWith('game_123', newEvent);
    });

    it('should return null if game is not found', async () => {
      mockDataStore.addGameEvent.mockResolvedValue(null);
      await expect(addGameEvent('nonexistent_game', mockEvent1)).resolves.toBeNull();
    });

    it('should reject if DataStore.addGameEvent fails', async () => {
      mockDataStore.addGameEvent.mockRejectedValue(new Error('Storage failure'));
      await expect(addGameEvent('game_123', mockEvent1)).rejects.toThrow('Storage failure');
    });
  });

  describe('updateGameEvent', () => {
    it('should delegate to DataStore.updateGameEvent()', async () => {
      const updatedEventData: PageGameEvent = { ...mockEvent1, time: 9999, type: 'opponentGoal' };
      const updatedGame = { ...mockGame1_AppState, gameEvents: [updatedEventData] };

      mockDataStore.updateGameEvent.mockResolvedValue(updatedGame);
      const result = await updateGameEvent('game_123', 0, updatedEventData);

      expect(result).toEqual(updatedGame);
      expect(mockDataStore.updateGameEvent).toHaveBeenCalledWith('game_123', 0, updatedEventData);
    });

    it('should return null if game is not found', async () => {
      mockDataStore.updateGameEvent.mockResolvedValue(null);
      await expect(updateGameEvent('nonexistent_game', 0, mockEvent1)).resolves.toBeNull();
    });

    it('should return null if event index is out of bounds', async () => {
      mockDataStore.updateGameEvent.mockResolvedValue(null);
      await expect(updateGameEvent('game_123', 99, mockEvent1)).resolves.toBeNull();
    });

    it('should reject if DataStore.updateGameEvent fails', async () => {
      mockDataStore.updateGameEvent.mockRejectedValue(new Error('Storage failure'));
      await expect(updateGameEvent('game_123', 0, mockEvent1)).rejects.toThrow('Storage failure');
    });
  });

  describe('removeGameEvent', () => {
    it('should delegate to DataStore.removeGameEvent()', async () => {
      const updatedGame = { ...mockGame1_AppState, gameEvents: [] };

      mockDataStore.removeGameEvent.mockResolvedValue(updatedGame);
      const result = await removeGameEvent('game_123', 0);

      expect(result).toEqual(updatedGame);
      expect(mockDataStore.removeGameEvent).toHaveBeenCalledWith('game_123', 0);
    });

    it('should return null if game is not found', async () => {
      mockDataStore.removeGameEvent.mockResolvedValue(null);
      await expect(removeGameEvent('nonexistent_game', 0)).resolves.toBeNull();
    });

    it('should return null if event index is out of bounds', async () => {
      mockDataStore.removeGameEvent.mockResolvedValue(null);
      await expect(removeGameEvent('game_123', 99)).resolves.toBeNull();
    });

    it('should reject if DataStore.removeGameEvent fails', async () => {
      mockDataStore.removeGameEvent.mockRejectedValue(new Error('Storage failure'));
      await expect(removeGameEvent('game_123', 0)).rejects.toThrow('Storage failure');
    });
  });

  describe('exportGamesAsJson', () => {
    it('should export AppState collection as formatted JSON string', async () => {
      mockDataStore.getGames.mockResolvedValue(mockSavedGamesCollection);
      const result = await exportGamesAsJson();
      expect(result).toEqual(JSON.stringify(mockSavedGamesCollection, null, 2));
    });

    it('should resolve to null if no games are stored', async () => {
      mockDataStore.getGames.mockResolvedValue({});
      await expect(exportGamesAsJson()).resolves.toBeNull();
    });
  });

  describe('importGamesFromJson', () => {
    beforeEach(() => {
      // Mock initial storage state for import tests
      mockDataStore.getGames.mockResolvedValue({ 'existing_game_id': mockGame1_AppState });
      mockDataStore.saveAllGames.mockResolvedValue(undefined);
    });

    it('should import games (as AppState) and merge with existing if overwrite is false', async () => {
      const gamesToImport: SavedGamesCollection = {
        'imported_1': { ...mockGame2_AppState },
      };
      const jsonData = JSON.stringify(gamesToImport);

      const result = await importGamesFromJson(jsonData, false);
      expect(result.successful).toBe(1);
      expect(result.failed).toHaveLength(0);
      expect(mockDataStore.saveAllGames).toHaveBeenCalledTimes(1);
    });

    it('should import games with overwrite true', async () => {
      const gamesToImport: SavedGamesCollection = {
        'imported_1': { ...mockGame2_AppState },
        'existing_game_id': { ...mockGame1_AppState, teamName: 'Overwritten Team' },
      };
      const jsonData = JSON.stringify(gamesToImport);

      const result = await importGamesFromJson(jsonData, true);
      expect(result.successful).toBe(2);
      expect(result.failed).toHaveLength(0);
      expect(mockDataStore.saveAllGames).toHaveBeenCalledTimes(1);
    });

    it('should skip existing games if overwrite is false', async () => {
      const gamesToImport: SavedGamesCollection = {
        'existing_game_id': mockGame1_AppState,
      };
      const jsonData = JSON.stringify(gamesToImport);
      const result = await importGamesFromJson(jsonData, false);
      expect(result.successful).toBe(0);
      expect(result.skipped).toBe(1);
      expect(mockDataStore.saveAllGames).not.toHaveBeenCalled();
    });

    it('should reject if JSON data is invalid', async () => {
      const invalidJsonData = 'invalid-json';
      await expect(importGamesFromJson(invalidJsonData, false)).rejects.toThrow();
    });

    it('should fail validation for invalid games', async () => {
      const invalidGame = { ...mockGame2_AppState } as Record<string, unknown>;
      delete invalidGame.teamName;
      const gamesToImport: SavedGamesCollection = {
        invalid: invalidGame as unknown as AppState,
      };
      const jsonData = JSON.stringify(gamesToImport);

      const result = await importGamesFromJson(jsonData, false);
      expect(result.successful).toBe(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].gameId).toBe('invalid');
      expect(mockDataStore.saveAllGames).not.toHaveBeenCalled();
    });

    it('should reject if DataStore.saveAllGames fails', async () => {
      mockDataStore.saveAllGames.mockRejectedValue(new Error('Storage failure'));
      const gamesToImport: SavedGamesCollection = { 'new_game': mockGame2_AppState };
      const jsonData = JSON.stringify(gamesToImport);
      await expect(importGamesFromJson(jsonData, false)).rejects.toThrow('Storage failure');
    });
  });

  describe('getAllGameIds', () => {
    it('should return an array of all game IDs', async () => {
      mockDataStore.getGames.mockResolvedValue(mockSavedGamesCollection);
      const ids = await getAllGameIds();
      expect(ids).toEqual(expect.arrayContaining(['game_123', 'game_456']));
      expect(ids.length).toBe(Object.keys(mockSavedGamesCollection).length);
    });

    it('should return an empty array if no games are stored', async () => {
      mockDataStore.getGames.mockResolvedValue({});
      await expect(getAllGameIds()).resolves.toEqual([]);
    });
  });

  describe('getFilteredGames', () => {
    beforeEach(() => {
      mockDataStore.getGames.mockResolvedValue(mockSavedGamesCollection);
    });

    it('should return all games if no filters are provided', async () => {
      const result = await getFilteredGames({});
      expect(result.length).toBe(2);
      expect(result).toEqual(expect.arrayContaining([
        ['game_123', mockGame1_AppState],
        ['game_456', mockGame2_AppState],
      ]));
    });

    it('should filter games by seasonId', async () => {
      const result = await getFilteredGames({ seasonId: 'season_1' });
      expect(result.length).toBe(1);
      expect(result[0][0]).toBe('game_123');
      expect(result[0][1]).toEqual(mockGame1_AppState);
    });

    it('should filter games by tournamentId (even if empty string for no tournament)', async () => {
      // mockGame2_AppState has tournamentId: ''
      const result = await getFilteredGames({ tournamentId: '' });
      expect(result.length).toBe(1);
      expect(result[0][0]).toBe('game_456');
      expect(result[0][1]).toEqual(mockGame2_AppState);
    });

    it('should filter games that have no season when seasonId filter is empty string', async () => {
      const gamesWithUnassignedSeason = {
        ...mockSavedGamesCollection,
        game_789: {
          ...mockGame2_AppState,
          seasonId: '',
          tournamentId: 'tournament_2',
        },
      };
      mockDataStore.getGames.mockResolvedValueOnce(gamesWithUnassignedSeason);

      const result = await getFilteredGames({ seasonId: '' });

      expect(result.length).toBe(1);
      expect(result[0][0]).toBe('game_789');
      expect(result[0][1].seasonId).toBe('');
    });

    it('should filter games by both seasonId and tournamentId', async () => {
      const result = await getFilteredGames({ seasonId: 'season_1', tournamentId: 'tournament_1' });
      expect(result.length).toBe(1);
      expect(result[0][0]).toBe('game_123');
      expect(result[0][1]).toEqual(mockGame1_AppState);
    });

    it('should return an empty array if no games match the filter', async () => {
      const result = await getFilteredGames({ seasonId: 'non_existent_season' });
      expect(result.length).toBe(0);
    });

    it('should return an empty array if games collection is empty', async () => {
      mockDataStore.getGames.mockResolvedValue({});
      const result = await getFilteredGames({ seasonId: 'season_1' });
      expect(result.length).toBe(0);
    });

    it('should return empty array if no games match filter', async () => {
      mockDataStore.getGames.mockResolvedValue({});
      const result = await getFilteredGames({ seasonId: 'nonexistent' });
      expect(result).toEqual([]);
    });
  });

  describe('getLatestGameId', () => {
    it('should return the id of the newest game', () => {
      const id = getLatestGameId(mockSavedGamesCollection);
      expect(id).toBe('game_456');
    });

    it('should return null when collection is empty', () => {
      expect(getLatestGameId({})).toBeNull();
    });
  });

  describe('updateGameDetails', () => {
    it('should update game details and resolve with the updated AppState', async () => {
      const gameIdToUpdate = 'game_123';
      const updates: Partial<Omit<AppState, 'id' | 'gameEvents'>> = {
        teamName: 'Super Dragons',
        opponentName: 'Mega Tigers',
        gameNotes: 'An epic battle!',
        homeScore: 5,
        awayScore: 4,
        seasonId: 'new_season_id'
      };
      const updatedGame = { ...mockGame1_AppState, ...updates };

      mockDataStore.getGameById.mockResolvedValue(mockGame1_AppState);
      mockDataStore.saveGame.mockResolvedValue(updatedGame);

      const result = await updateGameDetails(gameIdToUpdate, updates);
      expect(result).toEqual(updatedGame);
      expect(mockDataStore.getGameById).toHaveBeenCalledWith(gameIdToUpdate);
      expect(mockDataStore.saveGame).toHaveBeenCalledWith(gameIdToUpdate, expect.objectContaining(updates));
    });

    it('should resolve with null if game to update is not found', async () => {
      mockDataStore.getGameById.mockResolvedValue(null);
      const updates: Partial<AppState> = { teamName: 'Does Not Matter' };
      await expect(updateGameDetails('nonexistent_id', updates)).resolves.toBeNull();
      expect(mockDataStore.saveGame).not.toHaveBeenCalled();
    });

    it('should reject if DataStore.saveGame fails', async () => {
      mockDataStore.getGameById.mockResolvedValue(mockGame1_AppState);
      mockDataStore.saveGame.mockRejectedValue(new Error('Storage failure'));
      const updates: Partial<AppState> = { teamName: 'Yet Another Update' };

      await expect(updateGameDetails('game_123', updates)).rejects.toThrow('Storage failure');
    });
  });
});
