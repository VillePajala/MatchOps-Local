import type { PlayerAssessment, AppState } from '@/types';
import { getGame, saveGame } from './savedGames';
import logger from './logger';

export const getPlayerAssessments = async (
  gameId: string,
): Promise<{ [playerId: string]: PlayerAssessment } | null> => {
  try {
    const game = await getGame(gameId);
    return game?.assessments || null;
  } catch (error) {
    logger.error('Error getting player assessments', error as Error, { component: 'playerAssessments', section: 'getPlayerAssessments' });
    throw error;
  }
};

export const savePlayerAssessment = async (
  gameId: string,
  playerId: string,
  assessment: PlayerAssessment,
): Promise<AppState | null> => {
  try {
    const game = await getGame(gameId);
    if (!game) {
      logger.warn(`Game with ID ${gameId} not found for saving assessment.`);
      return null;
    }
    const updatedGame: AppState = {
      ...game,
      assessments: {
        ...(game.assessments || {}),
        [playerId]: assessment,
      },
    };
    return saveGame(gameId, updatedGame);
  } catch (error) {
    logger.error('Error saving player assessment', error as Error, { component: 'playerAssessments', section: 'savePlayerAssessment' });
    throw error;
  }
};

export const deletePlayerAssessment = async (
  gameId: string,
  playerId: string,
): Promise<AppState | null> => {
  try {
    const game = await getGame(gameId);
    if (!game || !game.assessments || !game.assessments[playerId]) {
      logger.warn(`Assessment for player ${playerId} not found in game ${gameId}.`);
      return null;
    }
    const rest = { ...game.assessments };
    delete rest[playerId];
    const updatedGame: AppState = {
      ...game,
      assessments: rest,
    };
    return saveGame(gameId, updatedGame);
  } catch (error) {
    logger.error('Error deleting player assessment', error as Error, { component: 'playerAssessments', section: 'deletePlayerAssessment' });
    throw error;
  }
};
