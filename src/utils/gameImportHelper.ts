import { AppState, Player } from '@/types';
import logger from './logger';

/**
 * Maps imported game player references to current roster players
 * This ensures imported games show up in player statistics
 */
export interface PlayerMapping {
  importedPlayerId: string;
  importedPlayerName: string;
  currentPlayerId: string | null;
  matchConfidence: 'exact' | 'name' | 'none';
}

/**
 * Creates a mapping between imported game players and current roster players
 */
export const createPlayerMapping = (
  importedGame: AppState,
  currentRoster: Player[]
): PlayerMapping[] => {
  const mappings: PlayerMapping[] = [];
  
  // Get all unique players from the imported game
  const importedPlayerIds = new Set([
    ...importedGame.playersOnField.map(p => p.id),
    ...importedGame.availablePlayers.map(p => p.id),
    ...importedGame.selectedPlayerIds
  ]);
  
  // Get player names from the imported game
  const importedPlayerMap = new Map<string, string>();
  [...importedGame.playersOnField, ...importedGame.availablePlayers].forEach(player => {
    importedPlayerMap.set(player.id, player.name);
  });
  
  importedPlayerIds.forEach(importedId => {
    const importedName = importedPlayerMap.get(importedId) || importedId;
    
    // Try to find exact ID match first
    let currentPlayer = currentRoster.find(p => p.id === importedId);
    let matchType: 'exact' | 'name' | 'none' = 'exact';
    
    if (!currentPlayer) {
      // Try to match by name (case-insensitive)
      currentPlayer = currentRoster.find(p => 
        p.name.toLowerCase().trim() === importedName.toLowerCase().trim()
      );
      matchType = currentPlayer ? 'name' : 'none';
    }
    
    mappings.push({
      importedPlayerId: importedId,
      importedPlayerName: importedName,
      currentPlayerId: currentPlayer?.id || null,
      matchConfidence: matchType
    });
  });
  
  return mappings;
};

/**
 * Updates imported game data to properly integrate with current roster
 */
export const processImportedGame = (
  importedGame: AppState,
  currentRoster: Player[]
): AppState => {
  const mapping = createPlayerMapping(importedGame, currentRoster);
  const processedGame = { ...importedGame };
  
  // Create a mapping lookup for quick access
  const playerIdMap = new Map<string, string>();
  mapping.forEach(m => {
    if (m.currentPlayerId) {
      playerIdMap.set(m.importedPlayerId, m.currentPlayerId);
    }
  });
  
  // Update selectedPlayerIds - only map the original selected players, don't add extras
  // Bug fix: Previously this was adding ALL mapped players, not just originally selected ones
  processedGame.selectedPlayerIds = [
    ...new Set(
      processedGame.selectedPlayerIds
        .map(id => playerIdMap.get(id) || id)
        .filter(id => currentRoster.some(p => p.id === id))
    )
  ];
  
  // Update game events to use current roster player IDs
  processedGame.gameEvents = processedGame.gameEvents.map(event => ({
    ...event,
    scorerId: event.scorerId ? (playerIdMap.get(event.scorerId) || event.scorerId) : undefined,
    assisterId: event.assisterId ? (playerIdMap.get(event.assisterId) || event.assisterId) : undefined,
    entityId: event.entityId ? (playerIdMap.get(event.entityId) || event.entityId) : undefined
  }));
  
  // Ensure the game is marked as played (so it shows up in stats)
  if (processedGame.isPlayed !== true && processedGame.gameStatus === 'gameEnd') {
    processedGame.isPlayed = true;
  }
  
  // Update assessments to use current roster player IDs if they exist
  if (processedGame.assessments) {
    const newAssessments: typeof processedGame.assessments = {};
    Object.entries(processedGame.assessments).forEach(([playerId, assessment]) => {
      const mappedId = playerIdMap.get(playerId) || playerId;
      if (currentRoster.some(p => p.id === mappedId)) {
        newAssessments[mappedId] = assessment;
      }
    });
    processedGame.assessments = newAssessments;
  }
  
  logger.log('Processed imported game:', {
    gameId: processedGame.gameDate,
    originalSelectedPlayers: importedGame.selectedPlayerIds.length,
    processedSelectedPlayers: processedGame.selectedPlayerIds.length,
    playerMappings: mapping.filter(m => m.currentPlayerId).length
  });
  
  return processedGame;
};

/**
 * Validates and processes multiple imported games
 */
export const processImportedGames = (
  importedGames: { [gameId: string]: AppState },
  currentRoster: Player[]
): { 
  processedGames: { [gameId: string]: AppState },
  mappingReport: {
    totalGames: number,
    gamesWithMappedPlayers: number,
    totalPlayerMappings: number,
    exactMatches: number,
    nameMatches: number,
    noMatches: number
  }
} => {
  const processedGames: { [gameId: string]: AppState } = {};
  let totalMappings = 0;
  let exactMatches = 0;
  let nameMatches = 0;
  let noMatches = 0;
  let gamesWithMappedPlayers = 0;
  
  Object.entries(importedGames).forEach(([gameId, game]) => {
    const processedGame = processImportedGame(game, currentRoster);
    const mapping = createPlayerMapping(game, currentRoster);
    
    processedGames[gameId] = processedGame;
    
    if (mapping.some(m => m.currentPlayerId)) {
      gamesWithMappedPlayers++;
    }
    
    mapping.forEach(m => {
      totalMappings++;
      if (m.matchConfidence === 'exact') exactMatches++;
      else if (m.matchConfidence === 'name') nameMatches++;
      else noMatches++;
    });
  });
  
  const mappingReport = {
    totalGames: Object.keys(importedGames).length,
    gamesWithMappedPlayers,
    totalPlayerMappings: totalMappings,
    exactMatches,
    nameMatches,
    noMatches
  };
  
  logger.log('Import processing complete:', mappingReport);
  
  return { processedGames, mappingReport };
};