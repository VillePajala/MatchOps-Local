/**
 * Shared validation utilities for DataStore implementations.
 *
 * This module provides validation functions that are shared between
 * LocalDataStore and SupabaseDataStore to ensure consistent behavior.
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md Section 5.0.10
 */

import type { AppState } from '@/types/game';
import { ValidationError } from '@/interfaces/DataStoreErrors';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import { AGE_GROUPS } from '@/config/gameOptions';

/**
 * Validate a game's required and optional fields.
 * Throws ValidationError if validation fails.
 *
 * Used by both LocalDataStore and SupabaseDataStore for consistent validation.
 * This ensures games saved to either backend meet the same requirements.
 *
 * @param game - The game state to validate
 * @param context - Optional context for error messages (e.g., gameId for batch operations)
 * @throws ValidationError if validation fails
 */
export const validateGame = (game: AppState, context?: string): void => {
  const prefix = context ? `Game ${context}: ` : '';

  // Validate required fields
  if (!game.teamName || !game.opponentName || !game.gameDate) {
    throw new ValidationError(
      `${prefix}Missing required game fields`,
      'game',
      { hasTeamName: !!game.teamName, hasOpponentName: !!game.opponentName, hasGameDate: !!game.gameDate }
    );
  }

  // Validate gameNotes length
  if (game.gameNotes && game.gameNotes.length > VALIDATION_LIMITS.GAME_NOTES_MAX) {
    throw new ValidationError(
      `${prefix}Game notes cannot exceed ${VALIDATION_LIMITS.GAME_NOTES_MAX} characters (got ${game.gameNotes.length})`,
      'gameNotes',
      game.gameNotes
    );
  }

  // Validate ageGroup if present
  if (game.ageGroup && !AGE_GROUPS.includes(game.ageGroup)) {
    throw new ValidationError(`${prefix}Invalid age group`, 'ageGroup', game.ageGroup);
  }
};
