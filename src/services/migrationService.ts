/**
 * Migration Service - Local to Cloud Data Migration
 *
 * Handles one-way migration from IndexedDB (local mode) to Supabase (cloud mode).
 *
 * CRITICAL PRINCIPLES:
 * 1. Local data is READ-ONLY during migration - never modified, never deleted
 * 2. Cloud writes use upserts - safe to retry, handles duplicates
 * 3. Verification required - migration not "complete" until counts verified
 * 4. No auto-cleanup - user explicitly chooses to clear local data after success
 *
 * Part of Phase 4 Supabase implementation (PR #6).
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md Section 8
 */

import { LocalDataStore } from '@/datastore/LocalDataStore';
import { SupabaseDataStore } from '@/datastore/SupabaseDataStore';
import { getAuthService } from '@/datastore/factory';
import type { AuthService } from '@/interfaces/AuthService';
import { NetworkError } from '@/interfaces/DataStoreErrors';
import { validateGame } from '@/datastore/validation';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import { AGE_GROUPS } from '@/config/gameOptions';
import type { Player, Team, TeamPlayer, Season, Tournament, Personnel, SavedGamesCollection, PlayerStatAdjustment, AppSettings } from '@/types';
import type { WarmupPlan } from '@/types/warmupPlan';
import logger from '@/utils/logger';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Migration progress stages.
 */
export type MigrationStage =
  | 'preparing'
  | 'exporting'
  | 'validating'
  | 'clearing'
  | 'uploading'
  | 'verifying'
  | 'complete'
  | 'error';

/**
 * Progress information during migration.
 */
export interface MigrationProgress {
  stage: MigrationStage;
  progress: number; // 0-100
  currentEntity?: string;
  message?: string;
  error?: string;
}

/**
 * Counts of migrated entities.
 */
export interface MigrationCounts {
  players: number;
  teams: number;
  teamRosters: number;
  seasons: number;
  tournaments: number;
  games: number;
  personnel: number;
  playerAdjustments: number;
  warmupPlan: boolean;
  settings: boolean;
}

/**
 * Result of migration operation.
 */
export interface MigrationResult {
  success: boolean;
  migrated: MigrationCounts;
  errors: string[];
  warnings: string[];
}

/**
 * Progress callback type.
 */
export type MigrationProgressCallback = (progress: MigrationProgress) => void;

/**
 * Migration mode.
 * - 'merge': Add/update cloud data (upsert behavior, default)
 * - 'replace': Clear cloud data first, then upload fresh
 */
export type MigrationMode = 'merge' | 'replace';

/**
 * Result of checking if user has local data.
 * Distinguishes between "no data" and "check failed".
 */
export interface LocalDataCheckResult {
  /** Whether user has data locally (only valid if checkFailed is false) */
  hasData: boolean;
  /** Whether the check itself failed (IndexedDB error, etc.) */
  checkFailed: boolean;
  /** Error message if check failed */
  error?: string;
}

/**
 * Local data snapshot for migration.
 */
interface LocalDataSnapshot {
  players: Player[];
  teams: Team[];
  teamRosters: Map<string, TeamPlayer[]>; // teamId -> roster (full TeamPlayer objects)
  seasons: Season[];
  tournaments: Tournament[];
  personnel: Personnel[];
  games: SavedGamesCollection;
  playerAdjustments: Map<string, PlayerStatAdjustment[]>; // playerId -> adjustments
  warmupPlan: WarmupPlan | null;
  settings: AppSettings | null;
}

/**
 * Validation error with context.
 */
interface ValidationError {
  entity: string;
  id?: string;
  message: string;
}

interface SkippedGame {
  id: string;
  reason: string;
}

/**
 * Tracks an individual entity that failed to upload during migration.
 * Mirrors the EntitySaveFailure type from reverseMigrationService for consistency.
 */
export interface EntityUploadFailure {
  /** Type of entity that failed */
  entityType: 'player' | 'team' | 'teamRoster' | 'season' | 'tournament' | 'personnel' | 'game' | 'adjustment' | 'warmupPlan' | 'settings';
  /** ID of the entity (if available) */
  entityId?: string;
  /** Display name for the entity (for user-friendly error messages) */
  entityName?: string;
  /** Error message */
  error: string;
}

/**
 * Result of uploading data to cloud storage.
 */
interface UploadedEntityIds {
  players: Set<string>;
  teams: Set<string>;
  seasons: Set<string>;
  tournaments: Set<string>;
  games: Set<string>;
  personnel: Set<string>;
}

interface UploadToCloudResult {
  counts: MigrationCounts;
  failures: EntityUploadFailure[];
  warnings: string[];
  uploadedIds: UploadedEntityIds;
}

/**
 * Cloud entity counts for pre/post migration comparison.
 */
interface CloudCounts {
  players: number;
  teams: number;
  seasons: number;
  tournaments: number;
  games: number;
  personnel: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * User-facing messages for migration states.
 *
 * NOTE: These are hardcoded English strings intentionally. The migration service
 * runs at the data layer before React context is available, so i18n hooks cannot
 * be used here. UI components that display MigrationProgress should use i18n keys
 * from common.json (migration.*) to translate these messages for display.
 */
export const MIGRATION_MESSAGES = {
  PREPARING: 'Preparing migration...',
  EXPORTING: 'Exporting local data...',
  VALIDATING: 'Validating data integrity...',
  UPLOADING: 'Uploading to cloud...',
  VERIFYING: 'Verifying migration...',
  SUCCESS: 'Migration complete! Your data is now synced to the cloud.',
  PARTIAL_FAILURE: 'Migration was interrupted. Your local data is safe. Please try again.',
  VERIFICATION_FAILED: 'Migration completed but verification failed. Your local data is unchanged. ' +
    'You can safely retry - the migration uses upserts so duplicate data is handled correctly. ' +
    'If the issue persists, try using "Replace" mode which clears cloud data first.',
  NETWORK_ERROR: 'Network error during migration. Your local data is unchanged. ' +
    'Please check your connection and try again.',
  CLEAR_LOCAL_PROMPT: 'Would you like to clear local data? (Your cloud data is safe)',
  SESSION_EXPIRED: 'Your session expired during migration. Please sign in again and retry.',
} as const;

/**
 * Progress percentage ranges for each stage.
 * Exported for testing but not part of public API.
 */
export const PROGRESS_RANGES = {
  PREPARING: { start: 0, end: 5 },
  EXPORTING: { start: 5, end: 25 },
  VALIDATING: { start: 25, end: 30 },
  UPLOADING: { start: 30, end: 85 },
  VERIFYING: { start: 85, end: 100 },
} as const;

/**
 * In replace mode, the "clearing" step happens before uploading.
 * This offset shifts the uploading progress bar to account for clearing time,
 * so the progress bar doesn't appear to "jump" when clearing completes.
 * Value: 5% of total progress (allocates first 5% of UPLOADING range to clearing).
 */
export const CLEARING_STAGE_PROGRESS_OFFSET = 5;

// =============================================================================
// MIGRATION LOCK (Promise Deduplication Pattern)
// =============================================================================

/**
 * Prevents concurrent migrations using Promise deduplication.
 *
 * Pattern: Store the in-flight Promise so concurrent callers wait for the
 * same result instead of getting an error. This matches the pattern used
 * in SupabaseDataStore.initialize() and SupabaseAuthService.initialize().
 *
 * Why Promise > boolean flag:
 * - Boolean: Concurrent call #2 gets "already in progress" error, must retry
 * - Promise: Concurrent call #2 waits and gets the same result as call #1
 *
 * The promise is reset to null in finally block, so next call starts fresh.
 */
let migrationPromise: Promise<MigrationResult> | null = null;

/**
 * Check if a migration is currently in progress.
 */
export function isMigrationRunning(): boolean {
  return migrationPromise !== null;
}

// =============================================================================
// MAIN MIGRATION FUNCTION
// =============================================================================

/**
 * Migrate all local data to cloud.
 *
 * This is the main entry point for local → cloud migration.
 * Local data is NEVER modified - safe to retry on any failure.
 *
 * @param onProgress - Callback for progress updates
 * @returns Migration result with counts and any errors
 *
 * @example
 * ```typescript
 * const result = await migrateLocalToCloud((progress) => {
 *   console.log(`${progress.stage}: ${progress.progress}%`);
 * });
 *
 * if (result.success) {
 *   console.log('Migrated', result.migrated.games, 'games');
 * } else {
 *   console.error('Errors:', result.errors);
 * }
 * ```
 */
export async function migrateLocalToCloud(
  onProgress: MigrationProgressCallback,
  mode: MigrationMode = 'merge'
): Promise<MigrationResult> {
  // Promise deduplication: if migration is already in progress, wait for it
  // This is safer than returning an error because concurrent callers get the
  // actual result instead of having to implement retry logic
  if (migrationPromise) {
    logger.info('[MigrationService] Migration already in progress, waiting for completion');
    return migrationPromise;
  }

  // Start new migration and store the promise
  migrationPromise = performMigration(onProgress, mode);

  try {
    return await migrationPromise;
  } finally {
    // Reset promise so next call starts fresh
    migrationPromise = null;
  }
}

/**
 * Internal migration implementation.
 * Separated from migrateLocalToCloud to enable Promise deduplication pattern.
 */
async function performMigration(
  onProgress: MigrationProgressCallback,
  mode: MigrationMode
): Promise<MigrationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const emptyResult: MigrationResult = {
    success: false,
    migrated: {
      players: 0,
      teams: 0,
      teamRosters: 0,
      seasons: 0,
      tournaments: 0,
      games: 0,
      personnel: 0,
      playerAdjustments: 0,
      warmupPlan: false,
      settings: false,
    },
    errors,
    warnings,
  };

  // Safe progress callback that won't crash migration if callback throws
  const safeProgress = (progress: MigrationProgress) => {
    try {
      onProgress(progress);
    } catch (err) {
      // Use warn level - callback failures don't stop migration, but should be investigated
      logger.warn('[MigrationService] Progress callback error:', err);
    }
  };

  let localStore: LocalDataStore | null = null;
  let cloudStore: SupabaseDataStore | null = null;

  try {
    // Check network connectivity before starting
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      logger.warn('[MigrationService] Migration aborted: No network connectivity');
      return {
        ...emptyResult,
        errors: [MIGRATION_MESSAGES.NETWORK_ERROR],
      };
    }

    // Initialize data stores
    safeProgress({ stage: 'preparing', progress: 0, message: MIGRATION_MESSAGES.PREPARING });

    localStore = new LocalDataStore();
    cloudStore = new SupabaseDataStore();

    await localStore.initialize();
    await cloudStore.initialize();

    // Refresh session before long operation to ensure we have a valid token.
    // Migrations can take minutes for large datasets - session might expire mid-operation.
    const authService = await getAuthService();
    try {
      const session = await authService.refreshSession();
      if (!session) {
        logger.warn('[MigrationService] Session refresh returned null - user may need to sign in again');
        return {
          ...emptyResult,
          errors: ['Session expired. Please sign in again and retry the migration.'],
        };
      }
      logger.debug('[MigrationService] Session refreshed successfully before migration');
    } catch (refreshError) {
      // AuthError or NetworkError from refreshSession
      const errorMsg = refreshError instanceof Error ? refreshError.message : 'Unknown error';
      logger.warn('[MigrationService] Failed to refresh session before migration:', errorMsg);
      return {
        ...emptyResult,
        errors: [`Session refresh failed: ${errorMsg}. Please sign in again and retry.`],
      };
    }

    // Step 1: Export local data (read-only)
    safeProgress({ stage: 'exporting', progress: PROGRESS_RANGES.EXPORTING.start, message: MIGRATION_MESSAGES.EXPORTING });

    const localData = await exportAllLocalData(localStore, safeProgress);

    // Early return if no data to migrate
    const hasData =
      localData.players.length > 0 ||
      localData.teams.length > 0 ||
      localData.seasons.length > 0 ||
      localData.tournaments.length > 0 ||
      localData.personnel.length > 0 ||
      Object.keys(localData.games).length > 0 ||
      Boolean(localData.warmupPlan);

    if (!hasData) {
      safeProgress({ stage: 'complete', progress: 100, message: 'No data to migrate.' });
      return {
        ...emptyResult,
        success: true, // Empty migration is still "successful"
        warnings: ['No local data found to migrate.'],
      };
    }

    // Step 2: Validate data integrity
    safeProgress({ stage: 'validating', progress: PROGRESS_RANGES.VALIDATING.start, message: MIGRATION_MESSAGES.VALIDATING });

    const validationWarnings = validateLocalData(localData);
    if (validationWarnings.length > 0) {
      // Validation warnings are non-blocking - we proceed but inform the user
      validationWarnings.forEach((warning) => {
        warnings.push(`${warning.entity}${warning.id ? ` (${warning.id})` : ''}: ${warning.message}`);
      });
      logger.warn('[MigrationService] Validation warnings:', validationWarnings);
    }

    // Step 3: Sanitize orphaned references in games
    // Games may reference seasons/tournaments/teams that no longer exist
    // We clean these up by setting to empty string (becomes NULL in DB)
    const { sanitizedGames, warnings: sanitizeWarnings } = sanitizeGameReferences(localData);
    if (sanitizeWarnings.length > 0) {
      warnings.push(...sanitizeWarnings);
    }
    // Normalize game payloads to satisfy cloud validation/constraints
    const { sanitizedGames: normalizedGames, warnings: normalizeWarnings, skippedGames } = sanitizeGamesForMigration(sanitizedGames);
    if (normalizeWarnings.length > 0) {
      warnings.push(...normalizeWarnings);
    }
    // Update localData with sanitized games for upload
    const sanitizedLocalData = { ...localData, games: normalizedGames };

    if (skippedGames.length > 0) {
      const MAX_SKIPPED_TO_REPORT = 5;
      for (const skipped of skippedGames.slice(0, MAX_SKIPPED_TO_REPORT)) {
        errors.push(`Game ${skipped.id}: ${skipped.reason}`);
      }
      if (skippedGames.length > MAX_SKIPPED_TO_REPORT) {
        errors.push(`... and ${skippedGames.length - MAX_SKIPPED_TO_REPORT} more games skipped`);
      }
    }

    const hasValidDataAfterSanitization =
      sanitizedLocalData.players.length > 0 ||
      sanitizedLocalData.teams.length > 0 ||
      sanitizedLocalData.seasons.length > 0 ||
      sanitizedLocalData.tournaments.length > 0 ||
      sanitizedLocalData.personnel.length > 0 ||
      Object.keys(sanitizedLocalData.games).length > 0 ||
      Boolean(sanitizedLocalData.warmupPlan);

    if (!hasValidDataAfterSanitization) {
      return {
        ...emptyResult,
        errors: [...errors, 'No valid local data remained after validation. Migration aborted to protect cloud data.'],
        warnings,
      };
    }

    if (mode === 'replace' && skippedGames.length > 0) {
      return {
        ...emptyResult,
        errors: [...errors, 'Replace migration aborted because some games were invalid. Please fix local data or use merge mode.'],
        warnings,
      };
    }

    // Step 4: Clear cloud data if mode is 'replace'
    // This must succeed before upload - if clear fails, abort migration to prevent
    // unexpected merge behavior when user expected replace
    if (mode === 'replace') {
      safeProgress({ stage: 'clearing', progress: PROGRESS_RANGES.UPLOADING.start, message: 'Clearing existing cloud data...' });
      logger.info('[MigrationService] Replace mode: clearing existing cloud data');
      try {
        await cloudStore.clearAllUserData();
        warnings.push('CLOUD_CLEARED'); // Translation key marker - handled in MigrationWizard
      } catch (clearError) {
        const errorMessage = clearError instanceof Error ? clearError.message : 'Unknown error';
        logger.error('[MigrationService] Failed to clear cloud data in replace mode:', clearError);
        return {
          ...emptyResult,
          errors: [`Failed to clear existing cloud data: ${errorMessage}. Migration aborted to prevent unexpected merge.`],
        };
      }
    }

    // Step 5: Get pre-migration cloud counts (for verification)
    // This allows us to detect partial upload failures by comparing (post - pre) vs expected
    const preCounts = await getCloudCounts(cloudStore);

    // Step 6: Upload to cloud (uses upserts - safe to retry)
    // In replace mode, add 5% offset to account for clearing step time
    const uploadStartProgress = PROGRESS_RANGES.UPLOADING.start + (mode === 'replace' ? CLEARING_STAGE_PROGRESS_OFFSET : 0);
    safeProgress({ stage: 'uploading', progress: uploadStartProgress, message: MIGRATION_MESSAGES.UPLOADING });

    const { counts: uploadedCounts, failures: uploadFailures, warnings: uploadWarnings, uploadedIds } = await uploadToCloud(
      sanitizedLocalData,
      cloudStore,
      authService,
      safeProgress
    );
    if (uploadWarnings.length > 0) {
      warnings.push(...uploadWarnings);
    }

    // Report upload failures (similar to reverseMigrationService pattern)
    const MAX_FAILURES_TO_REPORT = 5;
    if (uploadFailures.length > 0) {
      const criticalTypes = ['player', 'team', 'game', 'season', 'tournament', 'personnel'];
      const criticalFailures = uploadFailures.filter(f => criticalTypes.includes(f.entityType));
      const otherFailures = uploadFailures.filter(f => !criticalTypes.includes(f.entityType));

      // Report critical failures as errors
      for (const failure of criticalFailures.slice(0, MAX_FAILURES_TO_REPORT)) {
        errors.push(`Failed to upload ${failure.entityType} "${failure.entityName || failure.entityId}": ${failure.error}`);
      }
      if (criticalFailures.length > MAX_FAILURES_TO_REPORT) {
        errors.push(`... and ${criticalFailures.length - MAX_FAILURES_TO_REPORT} more critical failures`);
      }

      // Report other failures as warnings
      for (const failure of otherFailures.slice(0, MAX_FAILURES_TO_REPORT)) {
        warnings.push(`Failed to upload ${failure.entityType} "${failure.entityName || failure.entityId}": ${failure.error}`);
      }
      if (otherFailures.length > MAX_FAILURES_TO_REPORT) {
        warnings.push(`... and ${otherFailures.length - MAX_FAILURES_TO_REPORT} more non-critical failures`);
      }
    }

    // Check for critical upload failures
    const hasCriticalUploadFailures =
      uploadFailures.some(f =>
        ['player', 'team', 'game', 'season', 'tournament', 'personnel'].includes(f.entityType)
      ) || skippedGames.length > 0;

    // CRITICAL: In replace mode, cloud data was already cleared. If upload had critical failures,
    // some data may be permanently lost. Add explicit error so user knows to restore from backup.
    if (mode === 'replace' && hasCriticalUploadFailures) {
      const totalGames = Object.keys(sanitizedLocalData.games).length;
      const failedGames = uploadFailures.filter(f => f.entityType === 'game').length + skippedGames.length;
      errors.push(
        `CRITICAL DATA LOSS WARNING: Cloud data was cleared but upload failed for some entities. ` +
        `${uploadedCounts.games} of ${totalGames} games were uploaded successfully. ` +
        `The remaining ${failedGames} games may be lost unless you have a local backup. ` +
        `Do NOT clear local data until you verify all your data is in the cloud.`
      );
    }

    // Step 7: Verify counts match (compares actual uploads vs expected)
    safeProgress({ stage: 'verifying', progress: PROGRESS_RANGES.VERIFYING.start, message: MIGRATION_MESSAGES.VERIFYING });

    const verified = await verifyMigration(sanitizedLocalData, cloudStore, preCounts, uploadedIds);

    // Add verification warnings (e.g., pre-existing cloud data)
    if (verified.warnings.length > 0) {
      warnings.push(...verified.warnings);
    }

    if (!verified.success) {
      errors.push(...verified.errors);
      return {
        ...emptyResult,
        migrated: uploadedCounts,
        errors,
        warnings,
      };
    }

    // Step 8: SUCCESS (only if no critical failures)
    const overallSuccess = verified.success && !hasCriticalUploadFailures;
    const message = overallSuccess ? MIGRATION_MESSAGES.SUCCESS : MIGRATION_MESSAGES.PARTIAL_FAILURE;
    safeProgress({ stage: 'complete', progress: PROGRESS_RANGES.VERIFYING.end, message });

    logger.info('[MigrationService] Migration completed', { uploadedCounts, success: overallSuccess, failureCount: uploadFailures.length });

    return {
      success: overallSuccess,
      migrated: uploadedCounts,
      errors,
      warnings,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[MigrationService] Migration failed:', error);

    // Classify error type for better user feedback
    // Check NetworkError class first (thrown by SupabaseDataStore), then fallback to string matching
    // for third-party errors (Supabase client, fetch API)
    const isNetworkError =
      error instanceof NetworkError ||
      (error instanceof Error && error.name === 'TypeError' && errorMessage.includes('fetch')) ||
      errorMessage.toLowerCase().includes('network') ||
      errorMessage.toLowerCase().includes('offline') ||
      errorMessage.toLowerCase().includes('connection') ||
      (typeof navigator !== 'undefined' && !navigator.onLine);

    const userMessage = isNetworkError
      ? MIGRATION_MESSAGES.NETWORK_ERROR
      : MIGRATION_MESSAGES.PARTIAL_FAILURE;

    safeProgress({
      stage: 'error',
      progress: 0,
      error: errorMessage,
      message: userMessage,
    });

    return {
      ...emptyResult,
      errors: [isNetworkError ? MIGRATION_MESSAGES.NETWORK_ERROR : errorMessage],
      warnings,
    };
  } finally {
    // Clean up resources
    if (cloudStore) {
      try {
        await cloudStore.close();
      } catch (e) {
        logger.warn('[MigrationService] Error closing cloudStore:', e);
      }
    }
    if (localStore) {
      try {
        await localStore.close();
      } catch (e) {
        logger.warn('[MigrationService] Error closing localStore:', e);
      }
    }
    // Note: Migration lock (migrationPromise) is reset in the wrapper function
  }
}

// =============================================================================
// EXPORT FUNCTIONS
// =============================================================================

/**
 * Export all local data for migration.
 *
 * This is a READ-ONLY operation - local data is never modified.
 */
async function exportAllLocalData(
  localStore: LocalDataStore,
  onProgress: MigrationProgressCallback
): Promise<LocalDataSnapshot> {
  // Calculate progress steps within the exporting range
  const { start, end } = PROGRESS_RANGES.EXPORTING;
  const range = end - start;
  const stepCount = 10; // 10 entities to export
  const stepSize = range / stepCount;

  const exportProgress = (step: number, entity: string) => {
    const progress = Math.round(start + step * stepSize);
    onProgress({ stage: 'exporting', progress, currentEntity: entity });
  };

  // Players
  exportProgress(1, 'players');
  const players = await localStore.getPlayers();

  // Teams
  exportProgress(2, 'teams');
  const teams = await localStore.getTeams(true);

  // Team rosters (keep full TeamPlayer objects for setTeamRoster)
  exportProgress(3, 'team rosters');
  const allRosters = await localStore.getAllTeamRosters();
  const teamRosters = new Map<string, TeamPlayer[]>();
  for (const [teamId, roster] of Object.entries(allRosters)) {
    teamRosters.set(teamId, roster);
  }

  // Seasons - use getSeasons(true) to apply runtime migrations:
  // - Rule 16: Computes clubSeason if missing (based on startDate)
  exportProgress(4, 'seasons');
  const seasons = await localStore.getSeasons(true);

  // Tournaments - use getTournaments(true) to apply runtime migrations:
  // - Rule 13: Converts legacy 'level' field to 'series[]' array
  exportProgress(5, 'tournaments');
  const tournaments = await localStore.getTournaments(true);

  // Personnel
  exportProgress(6, 'personnel');
  const personnelResult = await localStore.getAllPersonnel();
  const personnel = normalizePersonnelArray(personnelResult);

  // Games (the big one)
  exportProgress(7, 'games');
  const games = await localStore.getGames();

  // Player adjustments (need to collect from all players)
  exportProgress(8, 'player adjustments');
  const playerAdjustments = new Map<string, PlayerStatAdjustment[]>();

  // Batch fetch adjustments for performance
  const adjustmentResults = await processBatch(
    players,
    async (player) => {
      const adjustments = await localStore.getPlayerAdjustments(player.id);
      return { playerId: player.id, adjustments };
    },
    BATCH_SIZE
  );

  // Build the map from batch results
  for (const { playerId, adjustments } of adjustmentResults) {
    if (adjustments.length > 0) {
      playerAdjustments.set(playerId, adjustments);
    }
  }

  // Warmup plan
  exportProgress(9, 'warmup plan');
  const warmupPlan = await localStore.getWarmupPlan();

  // Settings
  exportProgress(10, 'settings');
  const settings = await localStore.getSettings();

  return {
    players,
    teams,
    teamRosters,
    seasons,
    tournaments,
    personnel,
    games,
    playerAdjustments,
    warmupPlan,
    settings,
  };
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate local data integrity before migration.
 *
 * Checks for:
 * - Orphan references (e.g., team references non-existent season)
 * - Data consistency issues
 *
 * Returns warnings, not blockers - migration proceeds with valid data.
 */
function validateLocalData(data: LocalDataSnapshot): ValidationError[] {
  const errors: ValidationError[] = [];

  const playerIds = new Set(data.players.map((p) => p.id));
  const teamIds = new Set(data.teams.map((t) => t.id));
  const seasonIds = new Set(data.seasons.map((s) => s.id));
  const tournamentIds = new Set(data.tournaments.map((t) => t.id));

  // Check team references
  for (const team of data.teams) {
    if (team.boundSeasonId && !seasonIds.has(team.boundSeasonId)) {
      errors.push({
        entity: 'Team',
        id: team.id,
        message: `References non-existent season: ${team.boundSeasonId}`,
      });
    }
    if (team.boundTournamentId && !tournamentIds.has(team.boundTournamentId)) {
      errors.push({
        entity: 'Team',
        id: team.id,
        message: `References non-existent tournament: ${team.boundTournamentId}`,
      });
    }
  }

  // Check team roster references
  for (const [teamId, roster] of data.teamRosters) {
    if (!teamIds.has(teamId)) {
      errors.push({
        entity: 'TeamRoster',
        id: teamId,
        message: 'Roster for non-existent team',
      });
    }
    for (const rosterPlayer of roster) {
      if (!playerIds.has(rosterPlayer.id)) {
        errors.push({
          entity: 'TeamRoster',
          id: teamId,
          message: `References non-existent player: ${rosterPlayer.id}`,
        });
      }
    }
  }

  // Check game references
  for (const [gameId, game] of Object.entries(data.games)) {
    if (game.seasonId && !seasonIds.has(game.seasonId)) {
      errors.push({
        entity: 'Game',
        id: gameId,
        message: `References non-existent season: ${game.seasonId}`,
      });
    }
    if (game.tournamentId && !tournamentIds.has(game.tournamentId)) {
      errors.push({
        entity: 'Game',
        id: gameId,
        message: `References non-existent tournament: ${game.tournamentId}`,
      });
    }
    if (game.teamId && !teamIds.has(game.teamId)) {
      errors.push({
        entity: 'Game',
        id: gameId,
        message: `References non-existent team: ${game.teamId}`,
      });
    }
  }

  return errors;
}

const normalizeDateString = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split('T')[0];
};

const deriveGameDateFromId = (gameId: string): string | null => {
  const match = /^game_(\d+)_/.exec(gameId);
  if (!match) return null;
  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp)) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split('T')[0];
};

/**
 * Sanitize game foreign key references to handle orphaned data.
 *
 * Games may reference seasons, tournaments, or teams that no longer exist
 * (e.g., user deleted a season but game reference wasn't cleaned up).
 * This function sets orphaned references to empty string, which becomes NULL
 * in the database transform (per Rule 1 in CLAUDE.md).
 *
 * @param data - Local data snapshot
 * @returns Object with sanitized games and list of warnings for cleaned references
 */
function sanitizeGameReferences(data: LocalDataSnapshot): {
  sanitizedGames: SavedGamesCollection;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Build sets of valid IDs
  const seasonIds = new Set(data.seasons.map(s => s.id));
  const tournamentIds = new Set(data.tournaments.map(t => t.id));
  const teamIds = new Set(data.teams.map(t => t.id));

  // Clone games and sanitize references
  const sanitizedGames: SavedGamesCollection = {};

  for (const [gameId, game] of Object.entries(data.games)) {
    let gameCopy = { ...game };
    let modified = false;

    // Check seasonId
    if (game.seasonId && game.seasonId !== '' && !seasonIds.has(game.seasonId)) {
      warnings.push(`Game ${gameId}: cleared orphaned season reference`);
      gameCopy = { ...gameCopy, seasonId: '' };
      modified = true;
    }

    // Check tournamentId
    if (game.tournamentId && game.tournamentId !== '' && !tournamentIds.has(game.tournamentId)) {
      warnings.push(`Game ${gameId}: cleared orphaned tournament reference`);
      gameCopy = {
        ...gameCopy,
        tournamentId: '',
        tournamentSeriesId: '',
        tournamentLevel: '',
      };
      modified = true;
    }

    // Check for orphaned series (tournamentSeriesId set without valid tournamentId)
    if (gameCopy.tournamentSeriesId && gameCopy.tournamentSeriesId !== '' &&
        (!gameCopy.tournamentId || gameCopy.tournamentId === '')) {
      warnings.push(`Game ${gameId}: cleared orphaned series reference`);
      gameCopy = { ...gameCopy, tournamentSeriesId: '', tournamentLevel: '' };
      modified = true;
    }

    // Check teamId
    if (game.teamId && game.teamId !== '' && !teamIds.has(game.teamId)) {
      warnings.push(`Game ${gameId}: cleared orphaned team reference`);
      gameCopy = { ...gameCopy, teamId: '' };
      modified = true;
    }

    sanitizedGames[gameId] = modified ? gameCopy : game;
  }

  if (warnings.length > 0) {
    logger.info(`[MigrationService] Sanitized ${warnings.length} orphaned references in games`);
  }

  return { sanitizedGames, warnings };
}

/**
 * Sanitize game payloads to satisfy validation and DB constraints before migration.
 *
 * This fixes common legacy data issues (missing period duration, invalid status, overly long notes)
 * and skips games that still fail validation after normalization.
 */
function sanitizeGamesForMigration(
  games: SavedGamesCollection
): { sanitizedGames: SavedGamesCollection; warnings: string[]; skippedGames: SkippedGame[] } {
  const warnings: string[] = [];
  const skippedGames: SkippedGame[] = [];
  const sanitizedGames: SavedGamesCollection = {};

  for (const [gameId, game] of Object.entries(games)) {
    if (!game || typeof game !== 'object') {
      skippedGames.push({ id: gameId, reason: 'skipped invalid game payload' });
      continue;
    }

    let updated = { ...game };
    let modified = false;

    const normalizedTeamName = typeof updated.teamName === 'string' ? updated.teamName.trim() : '';
    if (!normalizedTeamName) {
      updated = { ...updated, teamName: 'My Team' };
      modified = true;
      warnings.push(`Game ${gameId}: defaulted team name to "My Team"`);
    } else if (normalizedTeamName !== updated.teamName) {
      updated = { ...updated, teamName: normalizedTeamName };
      modified = true;
      warnings.push(`Game ${gameId}: trimmed team name`);
    }

    const normalizedOpponentName = typeof updated.opponentName === 'string' ? updated.opponentName.trim() : '';
    if (!normalizedOpponentName) {
      updated = { ...updated, opponentName: 'Opponent' };
      modified = true;
      warnings.push(`Game ${gameId}: defaulted opponent name to "Opponent"`);
    } else if (normalizedOpponentName !== updated.opponentName) {
      updated = { ...updated, opponentName: normalizedOpponentName };
      modified = true;
      warnings.push(`Game ${gameId}: trimmed opponent name`);
    }

    const normalizedGameDate = normalizeDateString(updated.gameDate);
    if (!normalizedGameDate) {
      const fallbackDate = deriveGameDateFromId(gameId) ?? new Date().toISOString().split('T')[0];
      updated = { ...updated, gameDate: fallbackDate };
      modified = true;
      warnings.push(`Game ${gameId}: defaulted game date to ${fallbackDate}`);
    } else if (normalizedGameDate !== updated.gameDate) {
      updated = { ...updated, gameDate: normalizedGameDate };
      modified = true;
      warnings.push(`Game ${gameId}: normalized game date`);
    }

    // Normalize required scalar fields with safe defaults
    if (typeof updated.homeScore !== 'number' || !Number.isFinite(updated.homeScore)) {
      updated = { ...updated, homeScore: 0 };
      modified = true;
      warnings.push(`Game ${gameId}: defaulted home score to 0`);
    }
    if (typeof updated.awayScore !== 'number' || !Number.isFinite(updated.awayScore)) {
      updated = { ...updated, awayScore: 0 };
      modified = true;
      warnings.push(`Game ${gameId}: defaulted away score to 0`);
    }
    if (typeof updated.showPlayerNames !== 'boolean') {
      updated = { ...updated, showPlayerNames: true };
      modified = true;
      warnings.push(`Game ${gameId}: defaulted showPlayerNames to true`);
    }
    if (typeof updated.gameNotes !== 'string') {
      updated = { ...updated, gameNotes: '' };
      modified = true;
      warnings.push(`Game ${gameId}: defaulted game notes to empty string`);
    }

    // Fix invalid period duration (required in cloud)
    if (
      typeof updated.periodDurationMinutes !== 'number' ||
      !Number.isFinite(updated.periodDurationMinutes) ||
      updated.periodDurationMinutes <= 0
    ) {
      updated = { ...updated, periodDurationMinutes: 10 };
      modified = true;
      warnings.push(`Game ${gameId}: defaulted period duration to 10 minutes`);
    }

    // Normalize number of periods
    if (updated.numberOfPeriods !== 1 && updated.numberOfPeriods !== 2) {
      updated = { ...updated, numberOfPeriods: 2 };
      modified = true;
      warnings.push(`Game ${gameId}: defaulted number of periods to 2`);
    }

    // Normalize current period to safe range
    if (updated.currentPeriod !== 1 && updated.currentPeriod !== 2) {
      updated = { ...updated, currentPeriod: 1 };
      modified = true;
      warnings.push(`Game ${gameId}: defaulted current period to 1`);
    }

    // Normalize game status
    const validStatuses = ['notStarted', 'inProgress', 'periodEnd', 'gameEnd'] as const;
    if (!validStatuses.includes(updated.gameStatus)) {
      updated = { ...updated, gameStatus: 'notStarted' };
      modified = true;
      warnings.push(`Game ${gameId}: defaulted game status to notStarted`);
    }

    // Normalize home/away
    if (updated.homeOrAway !== 'home' && updated.homeOrAway !== 'away') {
      updated = { ...updated, homeOrAway: 'home' };
      modified = true;
      warnings.push(`Game ${gameId}: defaulted home/away to home`);
    }

    // Normalize age group
    if (updated.ageGroup && !AGE_GROUPS.includes(updated.ageGroup)) {
      updated = { ...updated, ageGroup: '' };
      modified = true;
      warnings.push(`Game ${gameId}: cleared invalid age group`);
    }

    // Trim overly long notes to avoid validation failure
    if (updated.gameNotes && updated.gameNotes.length > VALIDATION_LIMITS.GAME_NOTES_MAX) {
      updated = {
        ...updated,
        gameNotes: updated.gameNotes.slice(0, VALIDATION_LIMITS.GAME_NOTES_MAX),
      };
      modified = true;
      warnings.push(`Game ${gameId}: truncated notes to ${VALIDATION_LIMITS.GAME_NOTES_MAX} characters`);
    }

    // Normalize demand factor range
    if (
      updated.demandFactor != null &&
      (!Number.isFinite(updated.demandFactor) || updated.demandFactor < 0.1 || updated.demandFactor > 10)
    ) {
      updated = { ...updated, demandFactor: undefined };
      modified = true;
      warnings.push(`Game ${gameId}: cleared invalid demand factor`);
    }

    // Final validation pass
    try {
      validateGame(updated, gameId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Validation failed';
      skippedGames.push({ id: gameId, reason: `skipped after normalization (${message})` });
      continue;
    }

    sanitizedGames[gameId] = modified ? updated : game;
  }

  return { sanitizedGames, warnings, skippedGames };
}

// =============================================================================
// UPLOAD FUNCTIONS
// =============================================================================

/**
 * Upload all data to cloud using upserts.
 *
 * Order matters due to foreign key constraints:
 * 1. Players (no dependencies)
 * 2. Seasons (no dependencies)
 * 3. Tournaments (no dependencies)
 * 4. Teams (may reference seasons/tournaments)
 * 5. Team rosters (references teams and players)
 * 6. Personnel (no dependencies)
 * 7. Games (references seasons/tournaments/teams, contains players)
 * 8. Player adjustments (references players)
 * 9. Warmup plan (no dependencies)
 * 10. Settings (no dependencies)
 *
 * Uses per-entity failure tracking (like reverseMigrationService) to:
 * - Continue migration even if some entities fail
 * - Report which specific entities failed
 * - Distinguish critical failures from non-critical ones
 */
async function uploadToCloud(
  data: LocalDataSnapshot,
  cloudStore: SupabaseDataStore,
  authService: AuthService,
  onProgress: MigrationProgressCallback
): Promise<UploadToCloudResult> {
  const counts: MigrationCounts = {
    players: 0,
    teams: 0,
    teamRosters: 0,
    seasons: 0,
    tournaments: 0,
    games: 0,
    personnel: 0,
    playerAdjustments: 0,
    warmupPlan: false,
    settings: false,
  };
  const failures: EntityUploadFailure[] = [];
  const warnings: string[] = [];
  // Track all successfully uploaded entity IDs for verification
  const uploadedIds: UploadedEntityIds = {
    players: new Set<string>(),
    teams: new Set<string>(),
    seasons: new Set<string>(),
    tournaments: new Set<string>(),
    games: new Set<string>(),
    personnel: new Set<string>(),
  };

  // Calculate progress within the uploading range
  const { start, end } = PROGRESS_RANGES.UPLOADING;
  const range = end - start;
  const totalSteps = 10;
  let currentStep = 0;

  const updateProgress = (entity: string) => {
    currentStep++;
    const progress = Math.round(start + (currentStep / totalSteps) * range);
    onProgress({ stage: 'uploading', progress, currentEntity: entity });
  };

  // 1. Players - upsert preserves original IDs (critical for references)
  updateProgress('players');
  for (const player of data.players) {
    try {
      await cloudStore.upsertPlayer(player);
      counts.players++;
      uploadedIds.players.add(player.id);
    } catch (err) {
      failures.push({
        entityType: 'player',
        entityId: player.id,
        entityName: player.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error(`[MigrationService] Failed to upload player ${player.id}:`, err);
    }
  }

  // 2. Seasons - upsert preserves original IDs
  updateProgress('seasons');
  for (const season of data.seasons) {
    try {
      await cloudStore.upsertSeason(season);
      counts.seasons++;
      uploadedIds.seasons.add(season.id);
    } catch (err) {
      failures.push({
        entityType: 'season',
        entityId: season.id,
        entityName: season.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error(`[MigrationService] Failed to upload season ${season.id}:`, err);
    }
  }

  // 3. Tournaments - upsert preserves original IDs
  updateProgress('tournaments');
  for (const tournament of data.tournaments) {
    try {
      await cloudStore.upsertTournament(tournament);
      counts.tournaments++;
      uploadedIds.tournaments.add(tournament.id);
    } catch (err) {
      failures.push({
        entityType: 'tournament',
        entityId: tournament.id,
        entityName: tournament.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error(`[MigrationService] Failed to upload tournament ${tournament.id}:`, err);
    }
  }

  // 4. Teams - upsert preserves original IDs (must come after seasons/tournaments for FK refs)
  updateProgress('teams');
  for (const team of data.teams) {
    try {
      await cloudStore.upsertTeam(team);
      counts.teams++;
      uploadedIds.teams.add(team.id);
    } catch (err) {
      failures.push({
        entityType: 'team',
        entityId: team.id,
        entityName: team.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error(`[MigrationService] Failed to upload team ${team.id}:`, err);
    }
  }

  // 5. Team rosters (must come after players and teams)
  updateProgress('team rosters');
  for (const [teamId, roster] of data.teamRosters) {
    if (!uploadedIds.teams.has(teamId)) {
      warnings.push(`Team roster for ${teamId}: skipped because team failed to upload`);
      continue;
    }
    try {
      await cloudStore.setTeamRoster(teamId, roster);
      counts.teamRosters += roster.length;
    } catch (err) {
      failures.push({
        entityType: 'teamRoster',
        entityId: teamId,
        entityName: `Roster for team ${teamId}`,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error(`[MigrationService] Failed to upload team roster ${teamId}:`, err);
    }
  }

  // 6. Personnel - upsert preserves original IDs
  updateProgress('personnel');
  for (const member of data.personnel) {
    try {
      await cloudStore.upsertPersonnelMember(member);
      counts.personnel++;
      uploadedIds.personnel.add(member.id);
    } catch (err) {
      failures.push({
        entityType: 'personnel',
        entityId: member.id,
        entityName: member.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error(`[MigrationService] Failed to upload personnel ${member.id}:`, err);
    }
  }

  // 7. Games (the big one - uses RPC for atomic 5-table writes)
  updateProgress('games');
  const gameIds = Object.keys(data.games);
  const SESSION_REFRESH_INTERVAL = 50; // Refresh session every 50 games to prevent expiry

  for (let i = 0; i < gameIds.length; i++) {
    // Periodic session refresh for large migrations (>50 games)
    // Prevents session expiry during long uploads
    if (i > 0 && i % SESSION_REFRESH_INTERVAL === 0) {
      try {
        const session = await authService.refreshSession();
        if (!session) {
          // Session expired and couldn't be refreshed - abort to prevent partial migration
          const errorMsg = `Session expired at game ${i + 1}/${gameIds.length}. Migration paused - please retry.`;
          logger.error(`[MigrationService] ${errorMsg}`);
          failures.push({
            entityType: 'game',
            entityId: 'session-refresh',
            entityName: 'Session Management',
            error: errorMsg,
          });
          // Return partial results - games already uploaded are safe
          return { counts, failures, warnings, uploadedIds };
        }
        logger.debug(`[MigrationService] Session refreshed at game ${i + 1}/${gameIds.length}`);
      } catch (refreshError) {
        logger.warn(`[MigrationService] Session refresh failed at game ${i + 1}, continuing:`, refreshError);
        // Continue - the individual game upload will fail if session is truly expired
      }
    }

    const gameId = gameIds[i];
    const game = data.games[gameId];
    let gameToUpload = game;

    if (gameToUpload.seasonId && !uploadedIds.seasons.has(gameToUpload.seasonId)) {
      gameToUpload = { ...gameToUpload, seasonId: '' };
      warnings.push(`Game ${gameId}: cleared missing season reference (upload failed)`);
    }
    if (gameToUpload.tournamentId && !uploadedIds.tournaments.has(gameToUpload.tournamentId)) {
      gameToUpload = {
        ...gameToUpload,
        tournamentId: '',
        tournamentSeriesId: '',
        tournamentLevel: '',
      };
      warnings.push(`Game ${gameId}: cleared missing tournament reference (upload failed)`);
    }
    if (gameToUpload.teamId && !uploadedIds.teams.has(gameToUpload.teamId)) {
      gameToUpload = { ...gameToUpload, teamId: '' };
      warnings.push(`Game ${gameId}: cleared missing team reference (upload failed)`);
    }

    // Update progress more frequently for games (step 7 of 10)
    // For small datasets (< 10 games), update on first and every game to show activity
    // For larger datasets, update every 10 games to avoid excessive updates
    const updateEvery = gameIds.length < 10 ? 1 : 10;
    if (i % updateEvery === 0) {
      const gameStep = 6 + (i / gameIds.length); // Steps 6-7 for games
      const gamesProgress = Math.round(start + (gameStep / totalSteps) * range);
      onProgress({
        stage: 'uploading',
        progress: gamesProgress,
        currentEntity: `games (${i + 1}/${gameIds.length})`,
      });
    }

    try {
      await cloudStore.saveGame(gameId, gameToUpload);
      counts.games++;
      uploadedIds.games.add(gameId);
    } catch (err) {
      failures.push({
        entityType: 'game',
        entityId: gameId,
        entityName: `${game.teamName} vs ${game.opponentName}`,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error(`[MigrationService] Failed to upload game ${gameId}:`, err);
    }
  }

  // 8. Player adjustments - upsert preserves original IDs (handles merge mode)
  updateProgress('player adjustments');
  for (const [playerId, adjustments] of data.playerAdjustments) {
    for (const adjustment of adjustments) {
      let adjustmentToUpload = adjustment;
      let adjustmentModified = false;
      if (adjustmentToUpload.seasonId && !uploadedIds.seasons.has(adjustmentToUpload.seasonId)) {
        adjustmentToUpload = { ...adjustmentToUpload, seasonId: undefined };
        adjustmentModified = true;
        warnings.push(`Adjustment ${adjustment.id}: cleared missing season reference (upload failed)`);
      }
      if (adjustmentToUpload.tournamentId && !uploadedIds.tournaments.has(adjustmentToUpload.tournamentId)) {
        adjustmentToUpload = { ...adjustmentToUpload, tournamentId: undefined };
        adjustmentModified = true;
        warnings.push(`Adjustment ${adjustment.id}: cleared missing tournament reference (upload failed)`);
      }

      try {
        await cloudStore.upsertPlayerAdjustment(adjustmentModified ? adjustmentToUpload : adjustment);
        counts.playerAdjustments++;
      } catch (err) {
        failures.push({
          entityType: 'adjustment',
          entityId: adjustment.id,
          entityName: `Adjustment for player ${playerId}`,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        logger.error(`[MigrationService] Failed to upload adjustment ${adjustment.id}:`, err);
      }
    }
  }

  // 9. Warmup plan
  updateProgress('warmup plan');
  if (data.warmupPlan) {
    try {
      await cloudStore.saveWarmupPlan(data.warmupPlan);
      counts.warmupPlan = true;
    } catch (err) {
      failures.push({
        entityType: 'warmupPlan',
        entityName: 'Warmup plan',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error('[MigrationService] Failed to upload warmup plan:', err);
    }
  }

  // 10. Settings
  updateProgress('settings');
  if (data.settings) {
    try {
      await cloudStore.saveSettings(data.settings);
      counts.settings = true;
    } catch (err) {
      failures.push({
        entityType: 'settings',
        entityName: 'Settings',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error('[MigrationService] Failed to upload settings:', err);
    }
  }

  return { counts, failures, warnings, uploadedIds };
}

// =============================================================================
// VERIFICATION FUNCTIONS
// =============================================================================

/**
 * Get current cloud entity counts.
 * Used for pre/post migration comparison to detect partial upload failures.
 */
async function getCloudCounts(cloudStore: SupabaseDataStore): Promise<CloudCounts> {
  const [players, teams, seasons, tournaments, games, personnel] = await Promise.all([
    cloudStore.getPlayers(),
    cloudStore.getTeams(true),
    cloudStore.getSeasons(true),
    cloudStore.getTournaments(true),
    cloudStore.getGames(),
    cloudStore.getAllPersonnel(),
  ]);

  return {
    players: players.length,
    teams: teams.length,
    seasons: seasons.length,
    tournaments: tournaments.length,
    games: Object.keys(games).length,
    personnel: normalizePersonnelArray(personnel).length,
  };
}

/**
 * Verify migration by comparing actual uploads against expected.
 *
 * Uses both count-based comparison AND ID-based verification for reliability:
 * - Count comparison catches bulk failures quickly
 * - ID verification catches individual entities that failed but counts might miss
 *
 * Why ID verification is important (merge mode edge case):
 * - Pre=10, Local=10 (different IDs), only 5 new uploaded → Post=15
 * - Count check passes (15 >= 10) but 5 local entities never made it to cloud
 * - ID check catches this: "These local IDs are missing from cloud: [...]"
 *
 * Returns warnings when cloud had pre-existing data (pre > 0).
 */
async function verifyMigration(
  localData: LocalDataSnapshot,
  cloudStore: SupabaseDataStore,
  preCounts: CloudCounts,
  uploadedIds: UploadedEntityIds
): Promise<{ success: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Get post-migration counts
  const postCounts = await getCloudCounts(cloudStore);

  // Helper to verify counts (quick sanity check)
  const compareCount = (
    entity: string,
    localCount: number,
    preCount: number,
    postCount: number
  ) => {
    if (preCount === 0) {
      // Fresh migration: post should equal local
      if (postCount < localCount) {
        errors.push(`${entity}: expected ${localCount}, found ${postCount} (${localCount - postCount} failed to upload)`);
      } else if (postCount > localCount) {
        // Concurrent upload from another source? Log but don't fail.
        warnings.push(`${entity}: expected ${localCount}, found ${postCount} (concurrent changes?)`);
      }
    } else {
      // Merge migration: cloud had pre-existing data
      warnings.push(`${entity}: cloud had ${preCount} pre-existing (now ${postCount} total)`);

      // Post should be >= pre (no data was lost during migration)
      if (postCount < preCount) {
        errors.push(`${entity}: cloud lost data during migration (was ${preCount}, now ${postCount})`);
      }
    }
  };

  // Compare all entity counts (quick sanity check)
  compareCount('Players', localData.players.length, preCounts.players, postCounts.players);
  compareCount('Teams', localData.teams.length, preCounts.teams, postCounts.teams);
  compareCount('Seasons', localData.seasons.length, preCounts.seasons, postCounts.seasons);
  compareCount('Tournaments', localData.tournaments.length, preCounts.tournaments, postCounts.tournaments);
  compareCount('Games', Object.keys(localData.games).length, preCounts.games, postCounts.games);
  compareCount('Personnel', localData.personnel.length, preCounts.personnel, postCounts.personnel);

  // ID-based verification: Check that each local entity was successfully uploaded
  // This catches the edge case where counts match but specific entities are missing
  const verifyIds = (
    entityName: string,
    localIds: string[],
    uploadedIdSet: Set<string>
  ) => {
    const missingIds = localIds.filter(id => !uploadedIdSet.has(id));
    if (missingIds.length > 0) {
      // Limit error message to first 5 missing IDs to avoid overwhelming messages
      const displayIds = missingIds.slice(0, 5);
      const moreCount = missingIds.length - displayIds.length;
      const moreText = moreCount > 0 ? ` and ${moreCount} more` : '';
      errors.push(
        `${entityName}: ${missingIds.length} entities failed to upload ` +
        `(IDs: ${displayIds.join(', ')}${moreText})`
      );
    }
  };

  // Verify all entity types by ID
  verifyIds('Players', localData.players.map(p => p.id), uploadedIds.players);
  verifyIds('Teams', localData.teams.map(t => t.id), uploadedIds.teams);
  verifyIds('Seasons', localData.seasons.map(s => s.id), uploadedIds.seasons);
  verifyIds('Tournaments', localData.tournaments.map(t => t.id), uploadedIds.tournaments);
  verifyIds('Games', Object.keys(localData.games), uploadedIds.games);
  verifyIds('Personnel', localData.personnel.map(p => p.id), uploadedIds.personnel);

  return {
    success: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Normalize personnel data to always be an array.
 *
 * Historical context: Early versions of LocalDataStore stored personnel as
 * Record<string, Personnel> (keyed by ID), while the current interface returns
 * Personnel[]. This helper ensures backwards compatibility with any legacy data
 * that might still be in the old format during migration.
 */
function normalizePersonnelArray(
  personnel: Personnel[] | Record<string, Personnel>
): Personnel[] {
  if (!Array.isArray(personnel)) {
    // Log when legacy format is encountered to track if this code path is still used
    logger.warn('[MigrationService] Legacy personnel format detected (Record instead of Array)');
    return Object.values(personnel);
  }
  return personnel;
}

/**
 * Batch size for concurrent operations.
 * Balances speed with not overwhelming the API.
 *
 * Note: This could be made dynamic based on network conditions or API rate limits.
 * For now, 5 is a conservative value that works well for typical migrations.
 */
const BATCH_SIZE = 5;

/**
 * Process items in batches with a given async operation.
 * Limits concurrency to prevent overwhelming the API.
 */
async function processBatch<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  batchSize: number = BATCH_SIZE
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(operation));
    results.push(...batchResults);
  }
  return results;
}

// =============================================================================
// PUBLIC HELPER FUNCTIONS
// =============================================================================

/**
 * Check if user has local data that can be migrated.
 *
 * Returns a discriminated result to distinguish between:
 * - No data exists (hasData: false, checkFailed: false)
 * - Data exists (hasData: true, checkFailed: false)
 * - Check failed due to error (checkFailed: true)
 *
 * This prevents silent failures where storage errors are mistaken for "no data".
 */
export async function hasLocalDataToMigrate(): Promise<LocalDataCheckResult> {
  const localStore = new LocalDataStore();
  try {
    await localStore.initialize();

    const players = await localStore.getPlayers();
    const games = await localStore.getGames();

    // Consider there's data to migrate if there are players or games
    const hasData = players.length > 0 || Object.keys(games).length > 0;
    return { hasData, checkFailed: false };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[MigrationService] Failed to check local data:', err);
    return { hasData: false, checkFailed: true, error: errorMsg };
  } finally {
    try {
      await localStore.close();
    } catch (e) {
      logger.warn('[MigrationService] Error closing localStore in hasLocalDataToMigrate:', e);
    }
  }
}

/**
 * Get summary of local data for migration preview.
 */
export async function getLocalDataSummary(): Promise<MigrationCounts> {
  const localStore = new LocalDataStore();
  try {
    await localStore.initialize();

    // Fetch all data in parallel for better performance
    const [players, teams, seasons, tournaments, personnel, games, warmupPlan, settings, allRosters] =
      await Promise.all([
        localStore.getPlayers(),
        localStore.getTeams(true),
        localStore.getSeasons(true),
        localStore.getTournaments(true),
        localStore.getAllPersonnel(),
        localStore.getGames(),
        localStore.getWarmupPlan(),
        localStore.getSettings(),
        localStore.getAllTeamRosters(),
      ]);

    // Count team roster entries
    let teamRosterCount = 0;
    for (const roster of Object.values(allRosters)) {
      teamRosterCount += roster.length;
    }

    // Count player adjustments (batch for performance)
    const adjustmentCounts = await processBatch(
      players,
      async (player) => {
        const adjustments = await localStore.getPlayerAdjustments(player.id);
        return adjustments.length;
      },
      BATCH_SIZE
    );
    const adjustmentCount = adjustmentCounts.reduce((sum, count) => sum + count, 0);

    const personnelArray = normalizePersonnelArray(personnel);

    return {
      players: players.length,
      teams: teams.length,
      teamRosters: teamRosterCount,
      seasons: seasons.length,
      tournaments: tournaments.length,
      games: Object.keys(games).length,
      personnel: personnelArray.length,
      playerAdjustments: adjustmentCount,
      warmupPlan: warmupPlan !== null,
      settings: settings !== null,
    };
  } catch (err) {
    // Log with context for debugging - callers get the error but we have a record
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[MigrationService] Failed to get local data summary:', errorMsg);
    throw err;
  } finally {
    try {
      await localStore.close();
    } catch (e) {
      logger.warn('[MigrationService] Error closing localStore in getLocalDataSummary:', e);
    }
  }
}
