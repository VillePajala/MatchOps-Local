import { DEFAULT_GAME_ID } from '@/config/constants';
import { SAVED_GAMES_KEY } from '@/config/storageKeys';
import {
  getStorageItem,
  setStorageItem,
} from './storage';
import type { SavedGamesCollection, AppState, GameEvent as PageGameEvent, Point, Opponent, IntervalLog } from '@/types';
import type { Player } from '@/types';
import logger from '@/utils/logger';
import { appStateSchema } from './appStateSchema';
import { withKeyLock } from './storageKeyLock';

// Note: AppState (imported from @/types) is the primary type used for live game state
// and for storing games in IndexedDB via SavedGamesCollection.
// This GameData interface may represent a legacy structure or a specific format for other operations (e.g., import/export).
// Define GameData interface more precisely
export interface GameData {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  teamOnLeft: 'home' | 'away';
  players: Player[];
  events: PageGameEvent[];
  playersOnField?: Player[];
  opponents?: Opponent[];
  drawings?: Point[][];
  showPlayerNames?: boolean;
  notes?: string;
  homeScore?: number;
  awayScore?: number;
  gameStatus?: 'notStarted' | 'inProgress' | 'periodEnd' | 'gameEnd';
  currentPeriod?: number;
  numberOfPeriods?: 1 | 2;
  periodDuration?: number;
  selectedPlayerIds?: string[];
  availablePlayers?: Player[];
  location?: string;
  time?: string;
  subIntervalMinutes?: number;
  completedIntervalDurations?: IntervalLog[];
  lastSubConfirmationTimeSeconds?: number;
  seasonId: string | null;
  tournamentId: string | null;
  leagueId?: string;
  customLeagueName?: string;
  gameType?: import('@/types').GameType;
}

/**
 * Gets all saved games from storage (IndexedDB)
 * @returns Promise resolving to an Object containing saved games mapped by ID
 *
 * @note Implements graceful degradation - if JSON is corrupted, returns empty
 * collection and logs the error rather than crashing the app.
 */
export const getSavedGames = async (): Promise<SavedGamesCollection> => {
  try {
    const gamesJson = await getStorageItem(SAVED_GAMES_KEY);
    if (!gamesJson) {
      return {};
    }

    // Safe JSON parsing with graceful degradation
    let parsed: unknown;
    try {
      parsed = JSON.parse(gamesJson);
    } catch (parseError) {
      logger.error('[getSavedGames] JSON parse failed - data may be corrupted. Returning empty collection.', {
        error: parseError,
        dataLength: gamesJson.length,
        dataPreview: gamesJson.substring(0, 100),
      });
      // Return empty collection instead of crashing - user can restore from backup
      return {};
    }

    // Basic type validation - must be an object
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      logger.error('[getSavedGames] Parsed data is not a valid object. Returning empty collection.', {
        type: typeof parsed,
        isArray: Array.isArray(parsed),
      });
      return {};
    }

    return parsed as SavedGamesCollection;
  } catch (error) {
    logger.error('Error getting saved games from storage:', error);
    // Return empty collection for graceful degradation instead of throwing
    return {};
  }
};

/**
 * Saves all games to storage (IndexedDB)
 * @param games - Collection of games to save
 * @returns Promise resolving when complete
 */
export const saveGames = async (games: SavedGamesCollection): Promise<void> => {
  return withKeyLock(SAVED_GAMES_KEY, async () => {
    try {
      await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(games));
      return;
    } catch (error) {
      logger.error('Error saving games to storage:', error);
      throw error;
    }
  });
};

/**
 * Saves a single game to storage (IndexedDB)
 * @param gameId - ID of the game to save
 * @param gameData - Game data to save
 * @returns Promise resolving to the saved game data
 */
export const saveGame = async (gameId: string, gameData: unknown): Promise<AppState> => {
  return withKeyLock(SAVED_GAMES_KEY, async () => {
    try {
      if (!gameId) {
        throw new Error('Game ID is required');
      }

      const allGames = await getSavedGames();
      allGames[gameId] = gameData as AppState;
      await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(allGames));
      return gameData as AppState;
    } catch (error) {
      logger.error('Error saving game:', error);
      throw error;
    }
  });
};

/**
 * Gets a single game by ID
 * @param gameId - ID of the game to retrieve
 * @returns Promise resolving to the game data, or null if not found
 */
export const getGame = async (gameId: string): Promise<AppState | null> => {
  try {
    if (!gameId) {
      return null;
    }
    
    const allGames = await getSavedGames();
    const game = allGames[gameId] ? (allGames[gameId] as AppState) : null;
    return game;
  } catch (error) {
    logger.error('Error getting game:', error);
    throw error;
  }
};

/**
 * Deletes a game from storage (IndexedDB)
 * @param gameId - ID of the game to delete
 * @returns Promise resolving to the gameId if the game was deleted, null otherwise
 */
export const deleteGame = async (gameId: string): Promise<string | null> => {
  return withKeyLock(SAVED_GAMES_KEY, async () => {
    try {
      if (!gameId) {
        logger.warn('deleteGame: gameId is null or empty.');
        return null;
      }

      const allGames = await getSavedGames();
      if (!allGames[gameId]) {
        logger.warn(`deleteGame: Game with ID ${gameId} not found.`);
        return null; // Game not found
      }

      delete allGames[gameId];
      await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(allGames));
      logger.log(`deleteGame: Game with ID ${gameId} successfully deleted.`);
      return gameId; // Successfully deleted, return the gameId
    } catch (error) {
      logger.error('Error deleting game:', error);
      throw error; // Re-throw other errors
    }
  });
};

/**
 * Creates a new game with the given data
 * @param gameData - Initial game data
 * @returns Promise resolving to the ID of the new game and the game data, or null on error
 */
export const createGame = async (gameData: Partial<AppState>): Promise<{ gameId: string, gameData: AppState }> => {
  try {
    // Generate unique ID combining timestamp (for sorting) and UUID (for uniqueness)
    const timestamp = Date.now();
    let uuid: string;
    
    // Use crypto.randomUUID if available, fallback to timestamp-based UUID for compatibility
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      uuid = crypto.randomUUID().split('-')[0]; // Use first part of UUID for brevity
    } else {
      // Fallback: generate pseudo-random hex string
      uuid = Math.random().toString(16).substring(2, 10);
    }
    
    const gameId = `game_${timestamp}_${uuid}`;
    const newGameAppState: AppState = {
      playersOnField: gameData.playersOnField || [],
      opponents: gameData.opponents || [],
      drawings: gameData.drawings || [],
      availablePlayers: gameData.availablePlayers || [],
      showPlayerNames: gameData.showPlayerNames === undefined ? true : gameData.showPlayerNames,
      teamName: gameData.teamName || 'My Team',
      gameEvents: gameData.gameEvents || [],
      opponentName: gameData.opponentName || 'Opponent',
      gameDate: gameData.gameDate || new Date().toISOString().split('T')[0],
      homeScore: gameData.homeScore || 0,
      awayScore: gameData.awayScore || 0,
      gameNotes: gameData.gameNotes || '',
      homeOrAway: gameData.homeOrAway || 'home',
      numberOfPeriods: gameData.numberOfPeriods || 2,
      periodDurationMinutes: gameData.periodDurationMinutes || 10,
      currentPeriod: gameData.currentPeriod || 1,
      gameStatus: gameData.gameStatus || 'notStarted',
      isPlayed: gameData.isPlayed === undefined ? true : gameData.isPlayed,
      selectedPlayerIds: gameData.selectedPlayerIds || [],
      assessments: gameData.assessments || {},
      seasonId: gameData.seasonId || '',
      tournamentId: gameData.tournamentId || '',
      tournamentLevel: gameData.tournamentLevel || '',
      ageGroup: gameData.ageGroup || '',
      gameLocation: gameData.gameLocation || '',
      gameTime: gameData.gameTime || '',
      tacticalDiscs: gameData.tacticalDiscs || [],
      tacticalDrawings: gameData.tacticalDrawings || [],
      tacticalBallPosition: gameData.tacticalBallPosition === undefined ? { relX: 0.5, relY: 0.5 } : gameData.tacticalBallPosition,
      subIntervalMinutes: gameData.subIntervalMinutes === undefined ? 5 : gameData.subIntervalMinutes,
      completedIntervalDurations: gameData.completedIntervalDurations || [],
      lastSubConfirmationTimeSeconds: gameData.lastSubConfirmationTimeSeconds === undefined ? 0 : gameData.lastSubConfirmationTimeSeconds,
      gamePersonnel: Array.isArray(gameData.gamePersonnel) ? gameData.gamePersonnel : [],
      ...gameData,
    };
    
    const result = await saveGame(gameId, newGameAppState);
    return { gameId, gameData: result };
  } catch (error) {
    logger.error('Error creating new game:', error);
    throw error; // Rethrow to indicate failure
  }
};

/**
 * Gets all game IDs
 * @returns Promise resolving to an Array of game IDs
 */
export const getAllGameIds = async (): Promise<string[]> => {
  try {
    const allGames = await getSavedGames();
    return Object.keys(allGames);
  } catch (error) {
    logger.error('Error getting all game IDs:', error);
    throw error;
  }
};

/**
 * Gets games filtered by season and/or tournament
 * @param filters - Filter criteria
 * @returns Promise resolving to an Array of filtered games as [gameId, gameData] tuples
 */
export const getFilteredGames = async (filters: {
  seasonId?: string,
  tournamentId?: string
}): Promise<[string, AppState][]> => {
  try {
    const allGames = await getSavedGames();
    const gameEntries = Object.entries(allGames);
    
    const filtered = gameEntries.filter(([, game]) => {
      const gameData = game as AppState;
      const seasonFilter = filters.seasonId?.trim() ?? '';
      const seasonMatch = filters.seasonId === undefined
        ? true
        : (gameData.seasonId ?? '') === seasonFilter;

      const tournamentFilter = filters.tournamentId?.trim() ?? '';
      const tournamentMatch = filters.tournamentId === undefined
        ? true
        : (gameData.tournamentId ?? '') === tournamentFilter;
      return seasonMatch && tournamentMatch;
    }).map(([id, game]) => [id, game as AppState] as [string, AppState]); // Ensure correct tuple type
    return filtered;
  } catch (error) {
    logger.error('Error filtering games:', error);
    throw error;
  }
};

/**
 * Safely parse a date string to timestamp, returning 0 for invalid dates
 * @param dateStr - Date string to parse (can be null/undefined/empty)
 * @returns Unix timestamp in milliseconds, or 0 if invalid
 */
const parseDateSafely = (dateStr: string | null | undefined): number => {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === '') {
    return 0;
  }

  const timestamp = new Date(dateStr).getTime();

  // Explicitly check for NaN and invalid dates
  if (isNaN(timestamp)) {
    logger.warn('[getLatestGameId] Invalid game date detected', { date: dateStr });
    return 0;
  }

  return timestamp;
};

/**
 * Safely extract timestamp from game ID format (game_TIMESTAMP)
 * @param gameId - Game ID string
 * @returns Timestamp as number, or 0 if extraction fails
 */
const extractTimestampFromGameId = (gameId: string): number => {
  const parts = gameId.split('_');

  // Validate format: should have at least 2 parts
  if (parts.length < 2) {
    logger.warn('[getLatestGameId] Malformed game ID format', { gameId });
    return 0;
  }

  const timestamp = parseInt(parts[1], 10);

  if (isNaN(timestamp)) {
    logger.warn('[getLatestGameId] Invalid timestamp in game ID', { gameId, part: parts[1] });
    return 0;
  }

  return timestamp;
};

/**
 * Determines the most recently created game ID from a collection.
 * Games are sorted by gameDate (newest first) and then by timestamp
 * embedded in the game ID.
 * @param games - Collection of saved games
 * @returns The latest game ID or null if none exist
 */
export const getLatestGameId = (games: SavedGamesCollection): string | null => {
  const ids = Object.keys(games).filter(id => id !== DEFAULT_GAME_ID);
  if (ids.length === 0) return null;

  const sortedIds = ids.sort((a, b) => {
    const gameA = games[a];
    const gameB = games[b];

    // Use defensive date parsing
    const dateA = parseDateSafely(gameA?.gameDate);
    const dateB = parseDateSafely(gameB?.gameDate);

    // Compare by date first (newest first)
    if (dateB !== dateA) {
      if (!dateA) return 1;  // A has no date, B comes first
      if (!dateB) return -1; // B has no date, A comes first
      return dateB - dateA;  // Normal comparison (descending)
    }

    // Dates are equal, compare by embedded timestamp (newest first)
    const tsA = extractTimestampFromGameId(a);
    const tsB = extractTimestampFromGameId(b);

    if (tsA !== tsB) {
      return tsB - tsA; // Descending order
    }

    // Both date and timestamp are equal, consider them equal
    return 0;
  });

  return sortedIds[0];
};

/**
 * Updates game details (metadata only, not events)
 * @param gameId - ID of the game to update
 * @param updateData - Data to update
 * @returns Promise resolving to the updated game data, or null on error
 */
export const updateGameDetails = async (
  gameId: string,
  updateData: Partial<Omit<AppState, 'id' | 'events'>>
): Promise<AppState | null> => {
  return withKeyLock(SAVED_GAMES_KEY, async () => {
    try {
      const game = await getGame(gameId);
      if (!game) {
        logger.warn(`Game with ID ${gameId} not found for update.`);
        return null;
      }

      const updatedGame = {
        ...game,
        ...updateData,
      };

      const allGames = await getSavedGames();
      allGames[gameId] = updatedGame;
      await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(allGames));
      return updatedGame;
    } catch (error) {
      logger.error('Error updating game details:', error);
      throw error; // Propagate error
    }
  });
};

/**
 * Adds an event to a game
 * @param gameId - ID of the game
 * @param event - Event data to add
 * @returns Promise resolving to the updated game data, or null on error
 */
export const addGameEvent = async (gameId: string, event: PageGameEvent): Promise<AppState | null> => {
  return withKeyLock(SAVED_GAMES_KEY, async () => {
    try {
      const game = await getGame(gameId);
      if (!game) {
        logger.warn(`Game with ID ${gameId} not found for adding event.`);
        return null;
      }

      const updatedGame = {
        ...game,
        gameEvents: [...(game.gameEvents || []), event], // Ensure events is an array and cast event
      };

      const allGames = await getSavedGames();
      allGames[gameId] = updatedGame;
      await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(allGames));
      return updatedGame;
    } catch (error) {
      logger.error('Error adding game event:', error);
      throw error;
    }
  });
};

/**
 * Updates an event in a game
 * @param gameId - ID of the game
 * @param eventIndex - Index of the event to update
 * @param eventData - New event data
 * @returns Promise resolving to the updated game data, or null on error
 */
export const updateGameEvent = async (gameId: string, eventIndex: number, eventData: PageGameEvent): Promise<AppState | null> => {
  return withKeyLock(SAVED_GAMES_KEY, async () => {
    try {
      const game = await getGame(gameId);
      if (!game) {
        logger.warn(`Game with ID ${gameId} not found for updating event.`);
        return null;
      }

      const events = [...(game.gameEvents || [])];
      if (eventIndex < 0 || eventIndex >= events.length) {
        logger.warn(`Event index ${eventIndex} out of bounds for game ${gameId}.`);
        return null;
      }

      events[eventIndex] = eventData; // Cast eventData

      const updatedGame = {
        ...game,
        gameEvents: events,
      };

      const allGames = await getSavedGames();
      allGames[gameId] = updatedGame;
      await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(allGames));
      return updatedGame;
    } catch (error) {
      logger.error('Error updating game event:', error);
      throw error;
    }
  });
};

/**
 * Removes an event from a game
 * @param gameId - ID of the game
 * @param eventIndex - Index of the event to remove
 * @returns Promise resolving to the updated game data, or null on error
 */
export const removeGameEvent = async (gameId: string, eventIndex: number): Promise<AppState | null> => {
  return withKeyLock(SAVED_GAMES_KEY, async () => {
    try {
      const game = await getGame(gameId);
      if (!game) {
        logger.warn(`Game with ID ${gameId} not found for removing event.`);
        return null;
      }

      const events = [...(game.gameEvents || [])];
      if (eventIndex < 0 || eventIndex >= events.length) {
        logger.warn(`Event index ${eventIndex} out of bounds for game ${gameId}.`);
        return null;
      }

      events.splice(eventIndex, 1);

      const updatedGame = {
        ...game,
        gameEvents: events,
      };

      const allGames = await getSavedGames();
      allGames[gameId] = updatedGame;
      await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(allGames));
      return updatedGame;
    } catch (error) {
      logger.error('Error removing game event:', error);
      throw error;
    }
  });
};

/**
 * Exports all games as a JSON string
 * @returns Promise resolving to a JSON string of all games, or null on error
 */
export const exportGamesAsJson = async (): Promise<string | null> => {
  try {
    const allGames = await getSavedGames();
    if (Object.keys(allGames).length === 0) {
      logger.log('No games to export.');
      return null; // Or an empty JSON object string like '{}'
    }
    return JSON.stringify(allGames, null, 2);
  } catch (error) {
    logger.error('Error exporting games as JSON:', error);
    throw error; // Propagate error
  }
};

/**
 * Import games from a JSON string, supporting overwrite option
 * @param jsonData - JSON string of games to import
 * @param overwrite - Whether to overwrite existing games with the same ID
 * @returns Promise resolving to detailed import results
 */

export interface ImportResult {
  successful: number;
  skipped: number;
  failed: Array<{
    gameId: string;
    error: string;
  }>;
  warnings: string[];
}

export const importGamesFromJson = async (
  jsonData: string,
  overwrite: boolean = false
): Promise<ImportResult> => {
  const result: ImportResult = {
    successful: 0,
    skipped: 0,
    failed: [],
    warnings: []
  };

  try {
    const parsedData = JSON.parse(jsonData);
    
    // Handle both single game and collection formats
    let gamesToImport: SavedGamesCollection;
    if (parsedData.savedSoccerGames) {
      // Full export format
      gamesToImport = parsedData.savedSoccerGames;
    } else if (parsedData.id && parsedData.teamName) {
      // Single game format
      gamesToImport = { [parsedData.id]: parsedData };
    } else if (typeof parsedData === 'object' && parsedData !== null) {
      // Game collection format
      gamesToImport = parsedData;
    } else {
      throw new Error('Invalid JSON data format for import.');
    }

    const existingGames = await getSavedGames();
    const gamesToSave: SavedGamesCollection = { ...existingGames };

    for (const [gameId, gameData] of Object.entries(gamesToImport)) {
      try {
        // Skip existing games if not overwriting
        if (existingGames[gameId] && !overwrite) {
          result.skipped++;
          result.warnings.push(`Game ${gameId} already exists (skipped)`);
          continue;
        }

        // Validate game data
        const validation = appStateSchema.safeParse(gameData);
        if (!validation.success) {
          const errorMessages = validation.error.errors
            .map(e => `${e.path.join('.')}: ${e.message}`)
            .join(', ');
          result.failed.push({
            gameId,
            error: errorMessages
          });
          continue;
        }

        // Additional data integrity checks
        const validatedData = validation.data;
        if (!validatedData.teamName || !validatedData.opponentName) {
          result.failed.push({
            gameId,
            error: 'Missing required team information'
          });
          continue;
        }

        // Check for reasonable score values
        if (validatedData.homeScore < 0 || validatedData.awayScore < 0) {
          result.failed.push({
            gameId,
            error: 'Invalid score values (cannot be negative)'
          });
          continue;
        }

        // Check for reasonable game duration
        if (validatedData.periodDurationMinutes < 1 || validatedData.periodDurationMinutes > 120) {
          result.failed.push({
            gameId,
            error: 'Invalid period duration (must be 1-120 minutes)'
          });
          continue;
        }

        gamesToSave[gameId] = validatedData;
        result.successful++;
        
      } catch (error) {
        result.failed.push({
          gameId,
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
      }
    }

    // Save all valid games
    if (result.successful > 0) {
      await saveGames(gamesToSave);
      logger.log(`Successfully imported ${result.successful} games`);
    }

    // Log summary
    if (result.failed.length > 0) {
      logger.warn(`Import completed with ${result.failed.length} failures`);
    }
    if (result.skipped > 0) {
      logger.log(`Skipped ${result.skipped} existing games`);
    }

    return result;
    
  } catch (error) {
    logger.error('Import games error:', error);
    throw new Error(`Failed to parse import file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Legacy wrapper for backward compatibility
 * @deprecated Use importGamesFromJson instead
 */
export const importGamesFromJsonLegacy = async (
  jsonData: string,
  overwrite: boolean = false
): Promise<number> => {
  const result = await importGamesFromJson(jsonData, overwrite);
  return result.successful;
};

export interface GameValidationResult {
  isValid: boolean;
  isResumable: boolean;
  errors: string[];
  warnings: string[];
  game?: AppState;
}

/**
 * Validates a game's data structure and determines if it can be resumed
 * @param gameId - The ID of the game to validate
 * @param gameData - Optional game data to validate (if not provided, fetches from storage)
 * @returns Promise resolving to validation results
 */
export const validateAndGetResumableGame = async (
  gameId: string, 
  gameData?: AppState
): Promise<GameValidationResult> => {
  const result: GameValidationResult = {
    isValid: false,
    isResumable: false,
    errors: [],
    warnings: []
  };

  try {
    // Get game data if not provided
    let game: AppState;
    if (gameData) {
      game = gameData;
    } else {
      const games = await getSavedGames();
      const foundGame = games[gameId];
      if (!foundGame) {
        result.errors.push(`Game with ID ${gameId} not found`);
        return result;
      }
      game = foundGame;
    }

    // Validate against schema
    try {
      const validatedGame = appStateSchema.parse(game);
      result.isValid = true;
      result.game = validatedGame;
    } catch (schemaError: unknown) {
      result.errors.push(`Schema validation failed: ${(schemaError as Error)?.message || 'Invalid game data structure'}`);
      return result;
    }

    // Check if game can be resumed
    if (game.gameStatus === 'gameEnd') {
      result.warnings.push('Game has already ended - cannot be resumed');
      result.isResumable = false;
    } else if (game.gameStatus === 'notStarted') {
      result.warnings.push('Game has not been started yet');
      result.isResumable = true;
    } else if (game.gameStatus === 'inProgress' || game.gameStatus === 'periodEnd') {
      result.isResumable = true;
    } else {
      result.warnings.push(`Unexpected game status: ${game.gameStatus}`);
      result.isResumable = false;
    }

    // Additional validation checks
    if (!game.teamName?.trim()) {
      result.errors.push('Team name is missing or empty');
    }
    
    if (!game.opponentName?.trim()) {
      result.errors.push('Opponent name is missing or empty');
    }

    if (!game.gameDate || !/^\d{4}-\d{2}-\d{2}$/.test(game.gameDate)) {
      result.errors.push('Game date is missing or invalid format (expected YYYY-MM-DD)');
    }

    if (game.homeScore < 0 || game.awayScore < 0) {
      result.errors.push('Scores cannot be negative');
    }

    if (game.currentPeriod < 1 || game.currentPeriod > game.numberOfPeriods) {
      result.errors.push(`Invalid current period: ${game.currentPeriod} (must be between 1 and ${game.numberOfPeriods})`);
    }

    if (game.periodDurationMinutes < 1 || game.periodDurationMinutes > 120) {
      result.errors.push(`Invalid period duration: ${game.periodDurationMinutes} minutes`);
    }

    // Check for data inconsistencies
    if (game.playersOnField.length > 11) {
      result.warnings.push(`Too many players on field (${game.playersOnField.length}), maximum is 11`);
    }

    if (game.selectedPlayerIds.some(id => !game.availablePlayers.find(p => p.id === id) && !game.playersOnField.find(p => p.id === id))) {
      result.warnings.push('Some selected players are not in available players or on field');
    }

    // If no critical errors, game is resumable (even with warnings)
    if (result.errors.length === 0) {
      result.isResumable = result.isResumable && game.gameStatus !== 'gameEnd';
    } else {
      result.isResumable = false;
    }

    return result;

  } catch (error) {
    logger.error('Error validating game:', error);
    result.errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    result.isValid = false;
    result.isResumable = false;
    return result;
  }
};
