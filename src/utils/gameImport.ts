import { SavedGamesCollection, Player } from '@/types';
import { getSavedGames, saveGames } from './savedGames';
import { getMasterRoster } from './masterRosterManager';
import { processImportedGames } from './gameImportHelper';
import logger from './logger';

export interface GameImportResult {
  success: boolean;
  successful: number;  // Renamed from importedCount
  skipped: number;     // Renamed from skippedCount
  failed: Array<{      // Changed from errorCount and errors
    gameId: string;
    error: string;
  }>;
  warnings: string[];  // Changed from errors array
  mappingReport?: {
    totalGames: number;
    gamesWithMappedPlayers: number;
    totalPlayerMappings: number;
    exactMatches: number;
    nameMatches: number;
    noMatches: number;
  };
}

/**
 * Imports games from JSON data with proper player mapping and cache invalidation
 * This is intended to be used with React Query for proper cache management
 */
export const importGamesWithMapping = async (
  jsonData: string,
  overwrite: boolean = false,
  invalidateCache?: () => void,
  userId?: string
): Promise<GameImportResult> => {
  const result: GameImportResult = {
    success: false,
    successful: 0,
    skipped: 0,
    failed: [],
    warnings: []
  };

  try {
    // Parse the JSON data
    let gamesToImport: SavedGamesCollection;
    try {
      const parsedData = JSON.parse(jsonData);
      
      // Handle different formats
      if (parsedData.savedSoccerGames) {
        gamesToImport = parsedData.savedSoccerGames;
      } else if (parsedData.localStorage?.savedSoccerGames) {
        gamesToImport = parsedData.localStorage.savedSoccerGames;
      } else if (typeof parsedData === 'object' && parsedData !== null) {
        gamesToImport = parsedData;
      } else {
        throw new Error('Invalid JSON format for game import');
      }
    } catch (error) {
      logger.warn('Failed to parse JSON data for import', { error });
      result.warnings.push('Failed to parse JSON data');
      return result;
    }

    if (!gamesToImport || typeof gamesToImport !== 'object') {
      result.warnings.push('No valid games found in import data');
      return result;
    }

    // Get current roster for player mapping
    let currentRoster: Player[] = [];
    try {
      currentRoster = await getMasterRoster(userId);
    } catch (error) {
      logger.warn('Could not load current roster for player mapping:', error);
    }

    // Process imported games to ensure proper player integration
    const { processedGames, mappingReport } = processImportedGames(
      gamesToImport,
      currentRoster
    );
    
    result.mappingReport = mappingReport;

    // Get current saved games
    let currentGames: SavedGamesCollection = {};
    try {
      currentGames = await getSavedGames(userId) || {};
    } catch (error) {
      logger.warn('Could not load current games:', error);
    }

    // Merge with existing games
    const updatedGames = { ...currentGames };
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    Object.entries(processedGames).forEach(([gameId, game]) => {
      try {
        if (currentGames[gameId] && !overwrite) {
          skipped++;
          return;
        }
        
        updatedGames[gameId] = game;
        imported++;
      } catch (error) {
        errors++;
        result.failed.push({
          gameId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Save updated games
    try {
      await saveGames(updatedGames, userId);
      
      result.success = true;
      result.successful = imported;
      result.skipped = skipped;
      
      // Invalidate React Query cache if provided
      if (invalidateCache) {
        invalidateCache();
      }
      
      logger.log('Game import completed successfully:', {
        imported,
        skipped,
        errors,
        mappingReport
      });
      
    } catch (saveError) {
      result.warnings.push(`Failed to save imported games: ${saveError instanceof Error ? saveError.message : 'Unknown error'}`);
      return result;
    }

  } catch (error) {
    result.warnings.push(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    logger.error('Game import failed:', error);
  }

  return result;
};

/**
 * Imports games from a file with proper player mapping
 */
export const importGamesFromFile = async (
  file: File,
  overwrite: boolean = false,
  invalidateCache?: () => void,
  userId?: string
): Promise<GameImportResult> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      if (!content) {
        resolve({
          success: false,
          successful: 0,
          skipped: 0,
          failed: [],
          warnings: ['Failed to read file content']
        });
        return;
      }
      
      try {
        const result = await importGamesWithMapping(content, overwrite, invalidateCache, userId);
        resolve(result);
      } catch (error) {
        resolve({
          success: false,
          successful: 0,
          skipped: 0,
          failed: [],
          warnings: [`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
        });
      }
    };
    
    reader.onerror = () => {
      resolve({
        success: false,
        successful: 0,
        skipped: 0,
        failed: [],
        warnings: ['Failed to read file']
      });
    };
    
    reader.readAsText(file);
  });
};