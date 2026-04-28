/**
 * Shared validation utilities for DataStore implementations.
 *
 * This module provides validation functions that are shared between
 * LocalDataStore and SupabaseDataStore to ensure consistent behavior.
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md Section 5.0.10
 */

import type { AppState, ScheduledSub, ScheduledSubStatus } from '@/types/game';
import { ValidationError } from '@/interfaces/DataStoreErrors';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import { AGE_GROUPS } from '@/config/gameOptions';

const SCHEDULED_SUB_STATUSES: readonly ScheduledSubStatus[] = ['pending', 'fired', 'skipped'];

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== '';

const validateScheduledSubs = (
  subs: AppState['scheduledSubs'],
  prefix: string,
): void => {
  if (subs === undefined) return;
  if (!Array.isArray(subs)) {
    throw new ValidationError(
      `${prefix}scheduledSubs must be an array when present`,
      'scheduledSubs',
      subs,
    );
  }

  subs.forEach((sub: ScheduledSub, index: number) => {
    const at = `scheduledSubs[${index}]`;

    if (!sub || typeof sub !== 'object') {
      throw new ValidationError(`${prefix}${at} must be an object`, at, sub);
    }
    if (!isNonEmptyString(sub.id)) {
      throw new ValidationError(`${prefix}${at}.id must be a non-empty string`, `${at}.id`, sub.id);
    }
    if (
      typeof sub.timeSeconds !== 'number' ||
      !Number.isInteger(sub.timeSeconds) ||
      sub.timeSeconds < 0
    ) {
      // Integer-only: the live-game timer ticks in whole seconds, so a
      // fractional value would never match the firing condition.
      throw new ValidationError(
        `${prefix}${at}.timeSeconds must be a non-negative integer`,
        `${at}.timeSeconds`,
        sub.timeSeconds,
      );
    }
    if (!isNonEmptyString(sub.outPlayer)) {
      throw new ValidationError(
        `${prefix}${at}.outPlayer must be a non-empty player id`,
        `${at}.outPlayer`,
        sub.outPlayer,
      );
    }
    if (!isNonEmptyString(sub.inPlayer)) {
      throw new ValidationError(
        `${prefix}${at}.inPlayer must be a non-empty player id`,
        `${at}.inPlayer`,
        sub.inPlayer,
      );
    }
    if (sub.outPlayer === sub.inPlayer) {
      // A player cannot substitute for themselves; the live-banner Apply
      // would emit a corrupt `substitution` GameEvent.
      throw new ValidationError(
        `${prefix}${at}.inPlayer must differ from outPlayer`,
        `${at}.inPlayer`,
        sub.inPlayer,
      );
    }
    if (!isNonEmptyString(sub.positionRole)) {
      throw new ValidationError(
        `${prefix}${at}.positionRole must be a non-empty string`,
        `${at}.positionRole`,
        sub.positionRole,
      );
    }
    if (!SCHEDULED_SUB_STATUSES.includes(sub.status)) {
      throw new ValidationError(
        `${prefix}${at}.status must be one of ${SCHEDULED_SUB_STATUSES.join(', ')}`,
        `${at}.status`,
        sub.status,
      );
    }
  });
};

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
/**
 * Normalize optional string: trim whitespace, convert empty to undefined.
 * Used by both LocalDataStore and SupabaseDataStore for consistent field normalization.
 */
export const normalizeOptionalString = (value?: string): string | undefined => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

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

  // Validate teamName length
  if (game.teamName.length > VALIDATION_LIMITS.TEAM_NAME_MAX) {
    throw new ValidationError(
      `${prefix}Team name cannot exceed ${VALIDATION_LIMITS.TEAM_NAME_MAX} characters (got ${game.teamName.length})`,
      'teamName',
      game.teamName
    );
  }

  // Validate opponentName length
  if (game.opponentName.length > VALIDATION_LIMITS.TEAM_NAME_MAX) {
    throw new ValidationError(
      `${prefix}Opponent name cannot exceed ${VALIDATION_LIMITS.TEAM_NAME_MAX} characters (got ${game.opponentName.length})`,
      'opponentName',
      game.opponentName
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

  // Validate periodDurationMinutes (required for Supabase - no schema default)
  // Belt-and-suspenders: createGame provides default of 10, but validate anyway
  if (
    game.periodDurationMinutes === undefined ||
    game.periodDurationMinutes === null ||
    game.periodDurationMinutes <= 0 ||
    !Number.isFinite(game.periodDurationMinutes)
  ) {
    throw new ValidationError(
      `${prefix}periodDurationMinutes must be a positive number`,
      'periodDurationMinutes',
      game.periodDurationMinutes
    );
  }

  validateScheduledSubs(game.scheduledSubs, prefix);
};
