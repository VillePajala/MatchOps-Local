/**
 * Validation Limits
 *
 * Centralized constants for input validation across the app.
 * Used by LocalDataStore, managers, and UI components.
 *
 * @remarks
 * These limits are intentionally generous for a local-first app.
 * Adjust if cloud sync introduces stricter requirements.
 */

export const VALIDATION_LIMITS = {
  // ==========================================================================
  // NAME FIELDS
  // ==========================================================================

  /** Maximum length for team names */
  TEAM_NAME_MAX: 48,

  /** Maximum length for player names */
  PLAYER_NAME_MAX: 100,

  /** Maximum length for season names */
  SEASON_NAME_MAX: 100,

  /** Maximum length for tournament names */
  TOURNAMENT_NAME_MAX: 100,

  /** Maximum length for personnel names */
  PERSONNEL_NAME_MAX: 100,

  // ==========================================================================
  // NOTES / TEXT FIELDS
  // ==========================================================================

  /** Maximum length for team notes */
  TEAM_NOTES_MAX: 1000,

  /** Maximum length for game notes */
  GAME_NOTES_MAX: 2000,

  /** Maximum length for player adjustment notes */
  ADJUSTMENT_NOTES_MAX: 500,

  // ==========================================================================
  // STORAGE
  // ==========================================================================

  /** Maximum length for storage keys (IndexedDB) */
  STORAGE_KEY_MAX: 1024,
} as const;

/** Type for validation limit keys */
export type ValidationLimitKey = keyof typeof VALIDATION_LIMITS;
