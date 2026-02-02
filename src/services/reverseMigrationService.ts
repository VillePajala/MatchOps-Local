/**
 * Reverse Migration Service - Cloud to Local Data Migration
 *
 * Handles migration from Supabase (cloud mode) to IndexedDB (local mode).
 * This allows users to downgrade from cloud sync while keeping their data.
 *
 * CRITICAL PRINCIPLES:
 * 1. Cloud data is READ during migration
 * 2. Local writes use upserts - safe to retry, handles duplicates
 * 3. Verification required - migration not "complete" until counts verified
 * 4. Cloud deletion is OPTIONAL and happens AFTER successful download
 * 5. Mode switch happens AFTER successful verification
 *
 * Part of Phase 4 Supabase implementation (PR #11).
 *
 * @see docs/03-active-plans/pr11-reverse-migration-plan.md
 */

import { LocalDataStore } from '@/datastore/LocalDataStore';
import { SupabaseDataStore } from '@/datastore/SupabaseDataStore';
import { getAuthService } from '@/datastore/factory';
import { NetworkError, AuthError } from '@/interfaces/DataStoreErrors';
import type { Player, Team, TeamPlayer, Season, Tournament, Personnel, SavedGamesCollection, PlayerStatAdjustment, AppSettings } from '@/types';
import type { WarmupPlan } from '@/types/warmupPlan';
import { disableCloudMode, clearCloudAccountInfo, updateCloudAccountInfo } from '@/config/backendConfig';
import logger from '@/utils/logger';
import * as Sentry from '@sentry/nextjs';

// =============================================================================
// TIMESTAMP COMPARISON HELPERS
// =============================================================================

/**
 * Compare two ISO timestamps and determine if source is newer than destination.
 * Used for timestamp-based conflict resolution (newer version wins).
 *
 * @param sourceTimestamp - ISO timestamp of the source entity (e.g., from cloud)
 * @param destTimestamp - ISO timestamp of the destination entity (e.g., from local)
 * @returns true if source is newer than dest, false otherwise
 */
function isNewer(sourceTimestamp: string | undefined, destTimestamp: string | undefined): boolean {
  // If source has no timestamp, it's not newer
  if (!sourceTimestamp) return false;
  // If dest has no timestamp, source is considered newer
  if (!destTimestamp) return true;

  const sourceTime = new Date(sourceTimestamp).getTime();
  const destTime = new Date(destTimestamp).getTime();

  // Handle invalid/corrupted timestamps safely
  const sourceInvalid = isNaN(sourceTime);
  const destInvalid = isNaN(destTime);

  if (sourceInvalid && destInvalid) {
    // Both timestamps corrupted - keep local version (safer tie-break)
    logger.warn('[reverseMigration] Both timestamps invalid, keeping local version', {
      sourceTimestamp,
      destTimestamp,
    });
    return false;
  }
  if (sourceInvalid) {
    // Cloud timestamp corrupted - keep local version
    logger.warn('[reverseMigration] Source timestamp invalid, keeping local version', {
      sourceTimestamp,
    });
    return false;
  }
  if (destInvalid) {
    // Local timestamp corrupted - use cloud version
    logger.warn('[reverseMigration] Destination timestamp invalid, using source version', {
      destTimestamp,
    });
    return true;
  }

  return sourceTime > destTime;
}

/**
 * Check if an entity should be written based on timestamp comparison.
 * Returns true if:
 * - Destination doesn't exist (existingTimestamp is undefined)
 * - Source is newer than destination
 *
 * @param sourceTimestamp - ISO timestamp of the source entity
 * @param existingTimestamp - ISO timestamp of the existing destination entity, or undefined if not exists
 */
function shouldWriteBasedOnTimestamp(
  sourceTimestamp: string | undefined,
  existingTimestamp: string | undefined
): boolean {
  // If destination doesn't exist, always write
  if (!existingTimestamp) return true;
  // Otherwise, only write if source is newer
  return isNewer(sourceTimestamp, existingTimestamp);
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Reverse migration progress stages.
 */
export type ReverseMigrationStage =
  | 'preparing'
  | 'downloading'
  | 'saving'
  | 'verifying'
  | 'deleting'
  | 'complete'
  | 'error';

/**
 * Progress information during reverse migration.
 */
export interface ReverseMigrationProgress {
  stage: ReverseMigrationStage;
  progress: number; // 0-100
  currentEntity?: string;
  message?: string;
  error?: string;
}

/**
 * Counts of migrated entities.
 */
export interface ReverseMigrationCounts {
  players: number;
  teams: number;
  /** Count of player-team assignments (roster entries), not number of teams with rosters */
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
 * Result of reverse migration operation.
 */
export interface ReverseMigrationResult {
  success: boolean;
  downloaded: ReverseMigrationCounts;
  errors: string[];
  warnings: string[];
  cloudDeleted: boolean;
}

/**
 * Progress callback type.
 */
export type ReverseMigrationProgressCallback = (progress: ReverseMigrationProgress) => void;

/**
 * Reverse migration mode.
 * - 'keep-cloud': Download data but keep cloud copy
 * - 'delete-cloud': Download data then delete from cloud
 */
export type ReverseMigrationMode = 'keep-cloud' | 'delete-cloud';

/**
 * Result of checking if user has cloud data.
 * Distinguishes between "no data" and "check failed".
 */
export interface CloudDataCheckResult {
  /** Whether user has data in cloud (only valid if checkFailed is false) */
  hasData: boolean;
  /** Whether the check itself failed (network error, auth expired, etc.) */
  checkFailed: boolean;
  /** Error message if check failed */
  error?: string;
}

/**
 * Tracks an individual entity that failed to save during migration.
 */
export interface EntitySaveFailure {
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
 * Result of saving data to local storage.
 */
interface SaveToLocalResult {
  counts: ReverseMigrationCounts;
  failures: EntitySaveFailure[];
}

/**
 * Cloud data snapshot for reverse migration.
 */
interface CloudDataSnapshot {
  players: Player[];
  teams: Team[];
  teamRosters: Map<string, TeamPlayer[]>; // teamId -> roster
  seasons: Season[];
  tournaments: Tournament[];
  personnel: Personnel[];
  games: SavedGamesCollection;
  playerAdjustments: Map<string, PlayerStatAdjustment[]>; // playerId -> adjustments
  warmupPlan: WarmupPlan | null;
  settings: AppSettings | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * User-facing messages for reverse migration states.
 * UI components should use i18n translation keys to display these.
 */
export const REVERSE_MIGRATION_MESSAGES = {
  PREPARING: 'Preparing download...',
  DOWNLOADING: 'Downloading from cloud...',
  SAVING: 'Saving to local storage...',
  VERIFYING: 'Verifying download...',
  DELETING: 'Deleting cloud data...',
  SUCCESS: 'Download complete! Your data is now stored locally.',
  SUCCESS_DELETED: 'Download complete! Cloud data has been deleted.',
  NETWORK_ERROR: 'Network error during download. Please try again.',
  VERIFICATION_FAILED: 'Download completed but verification failed. Please retry.',
} as const;

/**
 * Progress ranges for each stage (percentage).
 */
export const REVERSE_PROGRESS_RANGES = {
  PREPARING: { start: 0, end: 5 },
  DOWNLOADING: { start: 5, end: 50 },
  SAVING: { start: 50, end: 85 },
  VERIFYING: { start: 85, end: 95 },
  DELETING: { start: 95, end: 100 },
} as const;

/**
 * Maximum number of failure details to include in results.
 */
const MAX_FAILURES_TO_REPORT = 5;

/**
 * Entity names used in progress reporting.
 */
const REVERSE_MIGRATION_ENTITY_NAMES = {
  PLAYERS: 'players',
  TEAMS: 'teams',
  TEAM_ROSTERS: 'team rosters',
  SEASONS: 'seasons',
  TOURNAMENTS: 'tournaments',
  PERSONNEL: 'personnel',
  GAMES: 'games',
  ADJUSTMENTS: 'adjustments',
  WARMUP_PLAN: 'warmup plan',
  SETTINGS: 'settings',
} as const;

const REVERSE_MIGRATION_ENTITY_ORDER = [
  REVERSE_MIGRATION_ENTITY_NAMES.PLAYERS,
  REVERSE_MIGRATION_ENTITY_NAMES.TEAMS,
  REVERSE_MIGRATION_ENTITY_NAMES.TEAM_ROSTERS,
  REVERSE_MIGRATION_ENTITY_NAMES.SEASONS,
  REVERSE_MIGRATION_ENTITY_NAMES.TOURNAMENTS,
  REVERSE_MIGRATION_ENTITY_NAMES.PERSONNEL,
  REVERSE_MIGRATION_ENTITY_NAMES.GAMES,
  REVERSE_MIGRATION_ENTITY_NAMES.ADJUSTMENTS,
  REVERSE_MIGRATION_ENTITY_NAMES.WARMUP_PLAN,
  REVERSE_MIGRATION_ENTITY_NAMES.SETTINGS,
] as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check for save tracking inconsistency between expected and actual counts.
 * This catches silent failures where saveToLocal thought it succeeded but didn't track correctly.
 *
 * @param entityType - The type of entity being checked (e.g., 'player', 'team', 'game')
 * @param expected - Expected count from cloud data
 * @param savedCount - Number successfully saved
 * @param failures - List of failures to count matching entity type
 * @returns Error message if inconsistent, null if counts match
 */
function checkSaveTrackingConsistency(
  entityType: string,
  expected: number,
  savedCount: number,
  failures: EntitySaveFailure[]
): string | null {
  const failureCount = failures.filter(f => f.entityType === entityType).length;
  const actual = savedCount + failureCount;
  if (actual !== expected) {
    const msg = `Save tracking inconsistency: ${actual} ${entityType}s tracked (saved: ${savedCount}, failed: ${failureCount}) but ${expected} expected`;
    logger.error('[ReverseMigrationService] ' + msg);
    // Track in Sentry - this indicates a code bug in the migration logic
    // Wrap in try/catch - Sentry failure must not change function behavior
    try {
      Sentry.captureMessage(msg, {
        level: 'error',
        tags: { component: 'ReverseMigrationService', action: 'saveTrackingCheck' },
        extra: { entityType, expected, savedCount, failureCount, actual },
      });
    } catch {
      // Sentry failure is acceptable - function must return warning message
    }
    return msg;
  }
  return null;
}

// =============================================================================
// MIGRATION LOCK (Promise Deduplication Pattern)
// =============================================================================

/**
 * Prevents concurrent reverse migrations using Promise deduplication.
 *
 * Pattern: Store the in-flight Promise so concurrent callers wait for the
 * same result instead of getting an error. This matches the pattern used
 * in migrationService.ts, SupabaseDataStore.initialize(), and
 * SupabaseAuthService.initialize().
 *
 * Why Promise > boolean flag:
 * - Boolean: Concurrent call #2 gets "already in progress" error, must retry
 * - Promise: Concurrent call #2 waits and gets the same result as call #1
 *
 * The promise is reset to null in finally block, so next call starts fresh.
 */
let reverseMigrationPromise: Promise<ReverseMigrationResult> | null = null;

/**
 * Check if a reverse migration is currently in progress.
 */
export function isReverseMigrationRunning(): boolean {
  return reverseMigrationPromise !== null;
}

// =============================================================================
// MAIN MIGRATION FUNCTION
// =============================================================================

/**
 * Migrate all data from cloud (Supabase) to local (IndexedDB).
 *
 * Process:
 * 1. Download all data from Supabase
 * 2. Save to IndexedDB
 * 3. Verify counts match
 * 4. Optionally delete cloud data
 * 5. Switch to local mode
 *
 * @param onProgress - Callback for progress updates
 * @param mode - 'keep-cloud' or 'delete-cloud'
 * @returns Migration result with counts and status
 */
export async function migrateCloudToLocal(
  onProgress: ReverseMigrationProgressCallback,
  mode: ReverseMigrationMode = 'keep-cloud'
): Promise<ReverseMigrationResult> {
  // Promise deduplication: if migration is already in progress, wait for it
  // This is safer than returning an error because concurrent callers get the
  // actual result instead of having to implement retry logic
  //
  // NOTE: Concurrent callers will NOT receive progress callbacks - only the first
  // caller's onProgress function is used. Concurrent callers receive the final
  // result when the migration completes. This is acceptable because:
  // 1. Concurrent calls are rare (user double-clicking, navigation)
  // 2. The result is what matters, not the progress display
  if (reverseMigrationPromise) {
    logger.info('[ReverseMigrationService] Reverse migration already in progress, waiting for completion (progress callbacks will not be received)');
    return reverseMigrationPromise;
  }

  // Start new migration and store the promise
  reverseMigrationPromise = performReverseMigration(onProgress, mode);

  try {
    return await reverseMigrationPromise;
  } finally {
    // Reset promise so next call starts fresh
    reverseMigrationPromise = null;
  }
}

/**
 * Internal reverse migration implementation.
 * Separated from migrateCloudToLocal to enable Promise deduplication pattern.
 */
async function performReverseMigration(
  onProgress: ReverseMigrationProgressCallback,
  mode: ReverseMigrationMode
): Promise<ReverseMigrationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let cloudDeleted = false;
  let cloudStore: SupabaseDataStore | null = null;
  let localStore: LocalDataStore | null = null;

  // Safe progress callback that won't throw
  const safeProgress = (progress: ReverseMigrationProgress) => {
    try {
      onProgress(progress);
    } catch (e) {
      logger.warn('[ReverseMigrationService] Progress callback threw error:', e);
      // Track in Sentry - callback failures could indicate UI bugs
      // Wrap in nested try/catch so Sentry failure doesn't defeat purpose of safeProgress
      try {
        Sentry.captureException(e, {
          tags: { component: 'ReverseMigrationService', action: 'progressCallback' },
          level: 'warning',
          extra: { stage: progress.stage, progress: progress.progress },
        });
      } catch {
        // Sentry failure is acceptable - migration must continue
      }
    }
  };

  try {
    // Check network connectivity
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      logger.warn('[ReverseMigrationService] Reverse migration aborted: No network connectivity');
      throw new NetworkError('Cannot download while offline. Please check your connection.');
    }

    // Step 1: Prepare
    safeProgress({ stage: 'preparing', progress: REVERSE_PROGRESS_RANGES.PREPARING.start, message: REVERSE_MIGRATION_MESSAGES.PREPARING });

    cloudStore = new SupabaseDataStore();
    await cloudStore.initialize();

    // Refresh session before long operation to ensure we have a valid token.
    // Reverse migrations can take minutes for large datasets.
    const authService = await getAuthService();
    try {
      const session = await authService.refreshSession();
      if (!session) {
        logger.warn('[ReverseMigrationService] Session refresh returned null');
        throw new NetworkError('Session expired. Please sign in again and retry.');
      }
      logger.debug('[ReverseMigrationService] Session refreshed successfully before migration');
    } catch (refreshError) {
      if (refreshError instanceof NetworkError) throw refreshError;
      const errorMsg = refreshError instanceof Error ? refreshError.message : 'Unknown error';
      logger.warn('[ReverseMigrationService] Failed to refresh session:', errorMsg);
      throw new NetworkError(`Session refresh failed: ${errorMsg}. Please sign in again.`);
    }

    localStore = new LocalDataStore();
    await localStore.initialize();

    // Step 2: Download from cloud
    safeProgress({ stage: 'downloading', progress: REVERSE_PROGRESS_RANGES.DOWNLOADING.start, message: REVERSE_MIGRATION_MESSAGES.DOWNLOADING });

    const cloudData = await downloadFromCloud(cloudStore, safeProgress);

    // Step 3: Save to local
    safeProgress({ stage: 'saving', progress: REVERSE_PROGRESS_RANGES.SAVING.start, message: REVERSE_MIGRATION_MESSAGES.SAVING });

    const { counts: savedCounts, failures: saveFailures } = await saveToLocal(cloudData, localStore, safeProgress);

    // Cross-check: savedCounts + failures should equal cloud data counts
    // This catches silent failures where saveToLocal thought it succeeded but didn't track correctly
    // These are treated as ERRORS (not warnings) because they indicate a code bug in the migration
    const playerError = checkSaveTrackingConsistency('player', cloudData.players.length, savedCounts.players, saveFailures);
    if (playerError) errors.push(playerError);

    const teamError = checkSaveTrackingConsistency('team', cloudData.teams.length, savedCounts.teams, saveFailures);
    if (teamError) errors.push(teamError);

    const gameError = checkSaveTrackingConsistency('game', Object.keys(cloudData.games).length, savedCounts.games, saveFailures);
    if (gameError) errors.push(gameError);

    // Report save failures as errors (critical failures for important data types)
    // or warnings (for less critical data like adjustments)
    if (saveFailures.length > 0) {
      const criticalTypes = ['player', 'team', 'game', 'season', 'tournament', 'personnel'];
      const criticalFailures = saveFailures.filter(f => criticalTypes.includes(f.entityType));
      const otherFailures = saveFailures.filter(f => !criticalTypes.includes(f.entityType));

      // Report critical failures as errors
      for (const failure of criticalFailures.slice(0, MAX_FAILURES_TO_REPORT)) {
        errors.push(`Failed to save ${failure.entityType} "${failure.entityName || failure.entityId}": ${failure.error}`);
      }
      if (criticalFailures.length > MAX_FAILURES_TO_REPORT) {
        errors.push(`... and ${criticalFailures.length - MAX_FAILURES_TO_REPORT} more critical failures`);
      }

      // Report other failures as warnings
      for (const failure of otherFailures.slice(0, MAX_FAILURES_TO_REPORT)) {
        warnings.push(`Failed to save ${failure.entityType} "${failure.entityName || failure.entityId}": ${failure.error}`);
      }
      if (otherFailures.length > MAX_FAILURES_TO_REPORT) {
        warnings.push(`... and ${otherFailures.length - MAX_FAILURES_TO_REPORT} more non-critical failures`);
      }
    }

    // Step 4: Verify
    safeProgress({ stage: 'verifying', progress: REVERSE_PROGRESS_RANGES.VERIFYING.start, message: REVERSE_MIGRATION_MESSAGES.VERIFYING });

    const verificationResult = await verifyReverseMigration(cloudData, localStore);
    if (verificationResult.warnings.length > 0) {
      warnings.push(...verificationResult.warnings);
    }
    if (!verificationResult.success) {
      errors.push('Verification failed: Local counts do not match downloaded data');
    }

    // Check for critical save failures that should prevent success
    const hasCriticalSaveFailures = saveFailures.some(f =>
      ['player', 'team', 'game', 'season', 'tournament', 'personnel'].includes(f.entityType)
    );

    // Step 5: Switch to local mode FIRST (before deleting cloud data)
    // CRITICAL: We switch mode BEFORE deleting cloud data to prevent a scenario where:
    // - Cloud deletion succeeds (cloud data gone)
    // - Mode switch fails
    // - User is stuck in cloud mode with no cloud data
    // By switching first, if mode switch fails, cloud data is preserved as backup.
    let modeSwitch = false;
    const canSwitchMode = verificationResult.success && !hasCriticalSaveFailures;

    if (!canSwitchMode) {
      // Don't switch to local mode - local data is incomplete
      logger.warn('[ReverseMigrationService] Not switching to local mode: verification failed or critical save failures occurred');
      warnings.push(
        'Mode switch skipped: Local data may be incomplete. Your data remains in cloud mode. ' +
        'Please retry the migration to ensure all data is saved locally before switching.'
      );
    } else {
      const switchResult = disableCloudMode();
      modeSwitch = switchResult.success;
      if (!modeSwitch) {
        // Mode switch failure is an error - the migration goal was not achieved
        // Include the detailed error message from the switch result
        const detail = switchResult.message || 'Unknown error.';
        errors.push(`Failed to switch to local mode. ${detail} Your data was downloaded but the app is still in cloud mode. Please go to Settings and disable cloud sync manually.`);
      }
    }

    // Step 6: Delete cloud data if requested (only AFTER successful mode switch)
    // This ensures user has working local mode before we delete their cloud backup
    if (mode === 'delete-cloud' && modeSwitch) {
      safeProgress({ stage: 'deleting', progress: REVERSE_PROGRESS_RANGES.DELETING.start, message: REVERSE_MIGRATION_MESSAGES.DELETING });

      try {
        await cloudStore.clearAllUserData();
        cloudDeleted = true;
        clearCloudAccountInfo();
        logger.info('[ReverseMigrationService] Cloud data deleted successfully');
      } catch (deleteError) {
        const errorMsg = deleteError instanceof Error ? deleteError.message : 'Unknown error';
        // Mode switch already succeeded, so user is in local mode. Cloud data deletion failed
        // but this is non-critical - they can delete it later from settings.
        warnings.push(`Failed to delete cloud data: ${errorMsg}. You are now in local mode, but your data still exists in the cloud. You can delete it later from Settings > Cloud Account.`);
        logger.error('[ReverseMigrationService] Failed to delete cloud data:', deleteError);
      }
    } else if (mode === 'delete-cloud' && !modeSwitch && canSwitchMode) {
      // Mode switch failed but data was valid - don't delete cloud data, it's the user's only backup
      warnings.push('Cloud data was NOT deleted because mode switch failed. Your cloud data is preserved as backup.');
    } else if (mode === 'delete-cloud' && hasCriticalSaveFailures) {
      warnings.push('Cloud data was NOT deleted because some entities failed to save locally. Please retry the migration.');
    } else if (mode === 'keep-cloud') {
      // Update cloud account info to indicate data still exists
      const updateSuccess = updateCloudAccountInfo({ hasCloudData: true, lastSyncedAt: new Date().toISOString() });
      if (!updateSuccess) {
        // Non-critical: UI display may be stale but data is safe
        logger.warn('[ReverseMigrationService] Could not update cloud account info display');
      }
    }

    // Determine overall success: verification passed AND mode switched AND no critical save failures
    // Note: In delete-cloud mode, cloud deletion failure is non-critical if mode switch succeeded.
    // User is safely in local mode; cloud data can be deleted later from Settings.
    const overallSuccess = verificationResult.success && modeSwitch && !hasCriticalSaveFailures;

    // Complete
    const message = cloudDeleted ? REVERSE_MIGRATION_MESSAGES.SUCCESS_DELETED : REVERSE_MIGRATION_MESSAGES.SUCCESS;
    safeProgress({ stage: 'complete', progress: 100, message });

    logger.info('[ReverseMigrationService] Reverse migration completed', { savedCounts, success: overallSuccess, failureCount: saveFailures.length });

    return {
      success: overallSuccess,
      downloaded: savedCounts,
      errors,
      warnings,
      cloudDeleted,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('[ReverseMigrationService] Reverse migration failed:', error);

    safeProgress({
      stage: 'error',
      progress: 0,
      message: REVERSE_MIGRATION_MESSAGES.NETWORK_ERROR,
      error: errorMsg,
    });

    return {
      success: false,
      downloaded: createEmptyCounts(),
      errors: [errorMsg],
      warnings,
      cloudDeleted: false,
    };

  } finally {
    // Clean up resources
    // Note: Migration lock (reverseMigrationPromise) is reset in the wrapper function
    if (cloudStore) {
      try {
        await cloudStore.close();
      } catch (e) {
        logger.warn('[ReverseMigrationService] Error closing cloudStore:', e);
      }
    }
    if (localStore) {
      try {
        await localStore.close();
      } catch (e) {
        logger.warn('[ReverseMigrationService] Error closing localStore:', e);
      }
    }
  }
}

// =============================================================================
// HELPER: DOWNLOAD FROM CLOUD
// =============================================================================

async function downloadFromCloud(
  cloudStore: SupabaseDataStore,
  onProgress: ReverseMigrationProgressCallback
): Promise<CloudDataSnapshot> {
  const { start, end } = REVERSE_PROGRESS_RANGES.DOWNLOADING;
  const range = end - start;
  // 10 top-level progress steps (note: team rosters and player adjustments also fetch within loops)
  const stepCount = 10;

  let step = 0;
  const reportProgress = (fraction = 1, entityName?: string) => {
    const clamped = Math.max(0, Math.min(1, fraction));
    const progress = start + ((step + clamped) / stepCount) * range;
    onProgress({ stage: 'downloading', progress, currentEntity: entityName ?? getEntityName(step + 1) });
  };

  const completeStep = (entityName?: string) => {
    reportProgress(1, entityName);
    step++;
  };

  // Download all entities
  reportProgress(0, REVERSE_MIGRATION_ENTITY_NAMES.PLAYERS);
  const players = await cloudStore.getPlayers();
  completeStep(REVERSE_MIGRATION_ENTITY_NAMES.PLAYERS);

  reportProgress(0, REVERSE_MIGRATION_ENTITY_NAMES.TEAMS);
  const teams = await cloudStore.getTeams(true); // includeDeleted=true for full backup
  completeStep(REVERSE_MIGRATION_ENTITY_NAMES.TEAMS);

  // Get team rosters
  reportProgress(0, REVERSE_MIGRATION_ENTITY_NAMES.TEAM_ROSTERS);
  const teamRosters = new Map<string, TeamPlayer[]>();
  const teamCount = teams.length;
  for (let index = 0; index < teamCount; index++) {
    const team = teams[index];
    const roster = await cloudStore.getTeamRoster(team.id);
    teamRosters.set(team.id, roster);
    if (teamCount > 0) {
      reportProgress(
        (index + 1) / teamCount,
        `${REVERSE_MIGRATION_ENTITY_NAMES.TEAM_ROSTERS} (${index + 1}/${teamCount})`
      );
    }
  }
  completeStep(REVERSE_MIGRATION_ENTITY_NAMES.TEAM_ROSTERS);

  reportProgress(0, REVERSE_MIGRATION_ENTITY_NAMES.SEASONS);
  const seasons = await cloudStore.getSeasons(true);
  completeStep(REVERSE_MIGRATION_ENTITY_NAMES.SEASONS);

  reportProgress(0, REVERSE_MIGRATION_ENTITY_NAMES.TOURNAMENTS);
  const tournaments = await cloudStore.getTournaments(true);
  completeStep(REVERSE_MIGRATION_ENTITY_NAMES.TOURNAMENTS);

  reportProgress(0, REVERSE_MIGRATION_ENTITY_NAMES.PERSONNEL);
  const personnel = await cloudStore.getAllPersonnel();
  completeStep(REVERSE_MIGRATION_ENTITY_NAMES.PERSONNEL);

  reportProgress(0, REVERSE_MIGRATION_ENTITY_NAMES.GAMES);
  const games = await cloudStore.getGames();
  completeStep(REVERSE_MIGRATION_ENTITY_NAMES.GAMES);

  // Get all player adjustments in a single batch operation (avoids N+1 queries)
  reportProgress(0, REVERSE_MIGRATION_ENTITY_NAMES.ADJUSTMENTS);
  const playerAdjustments = await cloudStore.getAllPlayerAdjustments();
  completeStep(REVERSE_MIGRATION_ENTITY_NAMES.ADJUSTMENTS);

  reportProgress(0, REVERSE_MIGRATION_ENTITY_NAMES.WARMUP_PLAN);
  const warmupPlan = await cloudStore.getWarmupPlan();
  completeStep(REVERSE_MIGRATION_ENTITY_NAMES.WARMUP_PLAN);

  reportProgress(0, REVERSE_MIGRATION_ENTITY_NAMES.SETTINGS);
  const settings = await cloudStore.getSettings();
  completeStep(REVERSE_MIGRATION_ENTITY_NAMES.SETTINGS);

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

function getEntityName(step: number): string {
  return REVERSE_MIGRATION_ENTITY_ORDER[step - 1] || 'data';
}

// =============================================================================
// HELPER: SAVE TO LOCAL
// =============================================================================

async function saveToLocal(
  data: CloudDataSnapshot,
  localStore: LocalDataStore,
  onProgress: ReverseMigrationProgressCallback
): Promise<SaveToLocalResult> {
  const { start, end } = REVERSE_PROGRESS_RANGES.SAVING;
  const range = end - start;
  // 10 top-level progress steps (individual entities save within loops per step)
  const stepCount = 10;

  let step = 0;
  const progressStep = (entityName: string) => {
    step++;
    const progress = start + (step / stepCount) * range;
    onProgress({ stage: 'saving', progress, currentEntity: entityName });
  };

  const counts: ReverseMigrationCounts = createEmptyCounts();
  const failures: EntitySaveFailure[] = [];

  // Save players (upsert: insert if new, update if exists)
  for (const player of data.players) {
    try {
      await localStore.upsertPlayer(player);
      counts.players++;
    } catch (err) {
      failures.push({
        entityType: 'player',
        entityId: player.id,
        entityName: player.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error(`[ReverseMigration] Failed to save player ${player.id}:`, err);
    }
  }
  progressStep('players');

  // Save teams (upsert)
  for (const team of data.teams) {
    try {
      await localStore.upsertTeam(team);
      counts.teams++;
    } catch (err) {
      failures.push({
        entityType: 'team',
        entityId: team.id,
        entityName: team.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error(`[ReverseMigration] Failed to save team ${team.id}:`, err);
    }
  }
  progressStep('teams');

  // Save team rosters
  for (const [teamId, roster] of data.teamRosters) {
    try {
      await localStore.setTeamRoster(teamId, roster);
      counts.teamRosters += roster.length;
    } catch (err) {
      failures.push({
        entityType: 'teamRoster',
        entityId: teamId,
        entityName: `Roster for team ${teamId}`,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error(`[ReverseMigration] Failed to save team roster ${teamId}:`, err);
    }
  }
  progressStep('team rosters');

  // Save seasons (upsert)
  for (const season of data.seasons) {
    try {
      await localStore.upsertSeason(season);
      counts.seasons++;
    } catch (err) {
      failures.push({
        entityType: 'season',
        entityId: season.id,
        entityName: season.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error(`[ReverseMigration] Failed to save season ${season.id}:`, err);
    }
  }
  progressStep('seasons');

  // Save tournaments (upsert)
  for (const tournament of data.tournaments) {
    try {
      await localStore.upsertTournament(tournament);
      counts.tournaments++;
    } catch (err) {
      failures.push({
        entityType: 'tournament',
        entityId: tournament.id,
        entityName: tournament.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error(`[ReverseMigration] Failed to save tournament ${tournament.id}:`, err);
    }
  }
  progressStep('tournaments');

  // Save personnel (upsert)
  for (const person of data.personnel) {
    try {
      await localStore.upsertPersonnelMember(person);
      counts.personnel++;
    } catch (err) {
      failures.push({
        entityType: 'personnel',
        entityId: person.id,
        entityName: person.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error(`[ReverseMigration] Failed to save personnel ${person.id}:`, err);
    }
  }
  progressStep('personnel');

  // Save games
  for (const gameId of Object.keys(data.games)) {
    const game = data.games[gameId];
    try {
      await localStore.saveGame(gameId, game);
      counts.games++;
    } catch (err) {
      failures.push({
        entityType: 'game',
        entityId: gameId,
        entityName: `${game.teamName} vs ${game.opponentName}`,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error(`[ReverseMigration] Failed to save game ${gameId}:`, err);
    }
  }
  progressStep('games');

  // Save player adjustments
  for (const [playerId, adjustments] of data.playerAdjustments) {
    for (const adjustment of adjustments) {
      try {
        await localStore.upsertPlayerAdjustment(adjustment);
        counts.playerAdjustments++;
      } catch (err) {
        failures.push({
          entityType: 'adjustment',
          entityId: adjustment.id,
          entityName: `Adjustment for player ${playerId}`,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        logger.error(`[ReverseMigration] Failed to save adjustment ${adjustment.id}:`, err);
      }
    }
  }
  progressStep('adjustments');

  // Save warmup plan
  if (data.warmupPlan) {
    try {
      await localStore.saveWarmupPlan(data.warmupPlan);
      counts.warmupPlan = true;
    } catch (err) {
      failures.push({
        entityType: 'warmupPlan',
        entityName: 'Warmup plan',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error('[ReverseMigration] Failed to save warmup plan:', err);
    }
  }
  progressStep('warmup plan');

  // Save settings
  if (data.settings) {
    try {
      await localStore.saveSettings(data.settings);
      counts.settings = true;
    } catch (err) {
      failures.push({
        entityType: 'settings',
        entityName: 'Settings',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      logger.error('[ReverseMigration] Failed to save settings:', err);
    }
  }
  progressStep('settings');

  return { counts, failures };
}

// =============================================================================
// HELPER: VERIFY MIGRATION
// =============================================================================

interface VerificationResult {
  success: boolean;
  warnings: string[];
  // Explicit missing counts for structured verification (avoid fragile string matching)
  missingCounts: {
    players: number;
    teams: number;
    seasons: number;
    tournaments: number;
    personnel: number;
    games: number;
    gameContentMismatches: number;
    rosterEntries: number;
    adjustments: number;
  };
}

async function verifyReverseMigration(
  cloudData: CloudDataSnapshot,
  localStore: LocalDataStore
): Promise<VerificationResult> {
  const warnings: string[] = [];
  // Track missing counts explicitly for structured success determination
  const missingCounts = {
    players: 0,
    teams: 0,
    seasons: 0,
    tournaments: 0,
    personnel: 0,
    games: 0,
    gameContentMismatches: 0,
    rosterEntries: 0,
    adjustments: 0,
  };

  // Get local data
  const localPlayers = await localStore.getPlayers();
  const localTeams = await localStore.getTeams(true);
  const localSeasons = await localStore.getSeasons(true);
  const localTournaments = await localStore.getTournaments(true);
  const localPersonnel = await localStore.getAllPersonnel();
  const localGames = await localStore.getGames();

  // IMPORTANT: Verify by ID, not count
  // Count comparison is insufficient because:
  // - User may have existing local data (local count > cloud count is normal)
  // - If upsert fails, count might still match due to existing data
  // Instead, verify that EVERY cloud entity ID exists in local storage

  // Create ID sets for efficient lookup
  const localPlayerIds = new Set(localPlayers.map(p => p.id));
  const localTeamIds = new Set(localTeams.map(t => t.id));
  const localSeasonIds = new Set(localSeasons.map(s => s.id));
  const localTournamentIds = new Set(localTournaments.map(t => t.id));
  const localPersonnelIds = new Set(localPersonnel.map(p => p.id));
  const localGameIds = new Set(Object.keys(localGames));

  // Verify all cloud entities exist in local by ID
  const missingPlayersList = cloudData.players.filter(p => !localPlayerIds.has(p.id));
  missingCounts.players = missingPlayersList.length;
  if (missingPlayersList.length > 0) {
    warnings.push(`Missing ${missingPlayersList.length} player(s): ${missingPlayersList.slice(0, 3).map(p => p.name).join(', ')}${missingPlayersList.length > 3 ? '...' : ''}`);
  }

  const missingTeamsList = cloudData.teams.filter(t => !localTeamIds.has(t.id));
  missingCounts.teams = missingTeamsList.length;
  if (missingTeamsList.length > 0) {
    warnings.push(`Missing ${missingTeamsList.length} team(s): ${missingTeamsList.slice(0, 3).map(t => t.name).join(', ')}${missingTeamsList.length > 3 ? '...' : ''}`);
  }

  const missingSeasonsList = cloudData.seasons.filter(s => !localSeasonIds.has(s.id));
  missingCounts.seasons = missingSeasonsList.length;
  if (missingSeasonsList.length > 0) {
    warnings.push(`Missing ${missingSeasonsList.length} season(s): ${missingSeasonsList.slice(0, 3).map(s => s.name).join(', ')}${missingSeasonsList.length > 3 ? '...' : ''}`);
  }

  const missingTournamentsList = cloudData.tournaments.filter(t => !localTournamentIds.has(t.id));
  missingCounts.tournaments = missingTournamentsList.length;
  if (missingTournamentsList.length > 0) {
    warnings.push(`Missing ${missingTournamentsList.length} tournament(s): ${missingTournamentsList.slice(0, 3).map(t => t.name).join(', ')}${missingTournamentsList.length > 3 ? '...' : ''}`);
  }

  const missingPersonnelList = cloudData.personnel.filter(p => !localPersonnelIds.has(p.id));
  missingCounts.personnel = missingPersonnelList.length;
  if (missingPersonnelList.length > 0) {
    warnings.push(`Missing ${missingPersonnelList.length} personnel: ${missingPersonnelList.slice(0, 3).map(p => p.name).join(', ')}${missingPersonnelList.length > 3 ? '...' : ''}`);
  }

  const cloudGameIds = Object.keys(cloudData.games);
  const missingGamesList = cloudGameIds.filter(id => !localGameIds.has(id));
  missingCounts.games = missingGamesList.length;
  if (missingGamesList.length > 0) {
    warnings.push(`Missing ${missingGamesList.length} game(s)`);
  }

  // Content verification for games (most complex entity)
  // Check that event counts match to detect partial/corrupted saves
  for (const gameId of cloudGameIds) {
    if (localGameIds.has(gameId)) {
      const cloudGame = cloudData.games[gameId];
      const localGame = localGames[gameId];

      // Verify event count matches
      const cloudEventCount = cloudGame.gameEvents?.length ?? 0;
      const localEventCount = localGame.gameEvents?.length ?? 0;
      if (cloudEventCount !== localEventCount) {
        missingCounts.gameContentMismatches++;
      }

      // Verify player count matches
      const cloudPlayerCount = cloudGame.availablePlayers?.length ?? 0;
      const localPlayerCount = localGame.availablePlayers?.length ?? 0;
      if (cloudPlayerCount !== localPlayerCount) {
        missingCounts.gameContentMismatches++;
      }
    }
  }
  if (missingCounts.gameContentMismatches > 0) {
    warnings.push(`${missingCounts.gameContentMismatches} game(s) have content mismatches (events or players differ)`);
  }

  // Verify team rosters by player ID, not just count
  // This ensures all cloud roster entries exist locally, even if local has extra entries
  let rosterVerifyErrors = 0;
  for (const [teamId, cloudRoster] of cloudData.teamRosters) {
    if (localTeamIds.has(teamId)) {
      try {
        const localRoster = await localStore.getTeamRoster(teamId);
        const localRosterPlayerIds = new Set(localRoster.map(tp => tp.id));
        // Check that all cloud roster entries exist locally
        for (const cloudEntry of cloudRoster) {
          if (!localRosterPlayerIds.has(cloudEntry.id)) {
            missingCounts.rosterEntries++;
          }
        }
      } catch (err) {
        // Individual roster verification failure shouldn't fail entire migration
        logger.warn(`[ReverseMigrationService] Failed to verify roster for team ${teamId}:`, err);
        rosterVerifyErrors++;
      }
    }
  }
  if (missingCounts.rosterEntries > 0) {
    warnings.push(`Missing ${missingCounts.rosterEntries} team roster entry(ies) from cloud`);
  }
  if (rosterVerifyErrors > 0) {
    warnings.push(`Could not verify ${rosterVerifyErrors} team roster(s)`);
  }

  // Verify player adjustments by ID, not just count
  // This ensures all cloud adjustments exist locally, even if local has extra adjustments
  let adjustmentVerifyErrors = 0;
  for (const [playerId, cloudAdjustments] of cloudData.playerAdjustments) {
    if (localPlayerIds.has(playerId)) {
      try {
        const localAdjustments = await localStore.getPlayerAdjustments(playerId);
        const localAdjustmentIds = new Set(localAdjustments.map(a => a.id));
        // Check that all cloud adjustments exist locally
        for (const cloudAdj of cloudAdjustments) {
          if (!localAdjustmentIds.has(cloudAdj.id)) {
            missingCounts.adjustments++;
          }
        }
      } catch (err) {
        // Individual adjustment verification failure shouldn't fail entire migration
        logger.warn(`[ReverseMigrationService] Failed to verify adjustments for player ${playerId}:`, err);
        adjustmentVerifyErrors++;
      }
    }
  }
  if (missingCounts.adjustments > 0) {
    warnings.push(`Missing ${missingCounts.adjustments} player adjustment(s) from cloud`);
  }
  if (adjustmentVerifyErrors > 0) {
    warnings.push(`Could not verify ${adjustmentVerifyErrors} player adjustment(s)`);
  }

  // Determine success using structured counts (avoid fragile string matching)
  // Critical entities: players, teams, games, seasons, tournaments, personnel
  // Also critical: game content mismatches (events/players differ between cloud and local)
  // Non-critical: roster entries, adjustments (can be re-synced)
  const hasMissingCriticalEntities =
    missingCounts.players > 0 ||
    missingCounts.teams > 0 ||
    missingCounts.games > 0 ||
    missingCounts.seasons > 0 ||
    missingCounts.tournaments > 0 ||
    missingCounts.personnel > 0 ||
    missingCounts.gameContentMismatches > 0; // Game content corruption is critical - data loss

  // Roster entries and adjustments are non-critical - warn but don't fail
  const hasMissingNonCriticalEntities =
    missingCounts.rosterEntries > 0 ||
    missingCounts.adjustments > 0;

  if (hasMissingNonCriticalEntities && !hasMissingCriticalEntities) {
    // All critical entities present, but some roster/adjustment data missing
    // This is acceptable - user can re-assign players to teams
    logger.warn('[ReverseMigrationService] Non-critical data missing but all entities present');
  }

  return {
    success: !hasMissingCriticalEntities,
    warnings,
    missingCounts,
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function createEmptyCounts(): ReverseMigrationCounts {
  return {
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
}

// =============================================================================
// CLOUD DATA CHECK FUNCTIONS
// =============================================================================

/**
 * Check if user has any data in Supabase.
 * Works even in local mode (uses stored auth session).
 *
 * This is an optimized existence check that only queries record counts (not full data).
 * For full data counts, use getCloudDataSummary() instead.
 *
 * @returns CloudDataCheckResult that distinguishes "no data" from "check failed"
 */
export async function hasCloudData(): Promise<CloudDataCheckResult> {
  logger.info('[ReverseMigrationService] hasCloudData: starting quick existence check');

  try {
    // Check network connectivity first
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new NetworkError('Cannot check cloud data while offline.');
    }

    // Get Supabase client and verify session
    const { getSupabaseClient } = await import('@/datastore/supabase');
    const supabase = getSupabaseClient();

    logger.info('[ReverseMigrationService] hasCloudData: checking session');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw new AuthError(`Session error: ${sessionError.message}`);
    }
    if (!sessionData.session) {
      throw new AuthError('No active session. Please sign in again.');
    }

    // Quick existence check: query each table with limit 1, count only
    // This is MUCH faster than fetching all data
    logger.info('[ReverseMigrationService] hasCloudData: checking tables for any data');

    // Check games (most important for hydration)
    const { count: gamesCount, error: gamesError } = await supabase
      .from('games')
      .select('*', { count: 'exact', head: true });

    if (gamesError) {
      logger.warn('[ReverseMigrationService] hasCloudData: games check error', { error: gamesError.message });
      throw new NetworkError(`Failed to check games: ${gamesError.message}`);
    }

    if (gamesCount && gamesCount > 0) {
      logger.info('[ReverseMigrationService] hasCloudData: found games', { count: gamesCount });
      return { hasData: true, checkFailed: false };
    }

    // Check players
    const { count: playersCount, error: playersError } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true });

    if (playersError) {
      logger.warn('[ReverseMigrationService] hasCloudData: players check error', { error: playersError.message });
      throw new NetworkError(`Failed to check players: ${playersError.message}`);
    }

    if (playersCount && playersCount > 0) {
      logger.info('[ReverseMigrationService] hasCloudData: found players', { count: playersCount });
      return { hasData: true, checkFailed: false };
    }

    // Check teams
    const { count: teamsCount, error: teamsError } = await supabase
      .from('teams')
      .select('*', { count: 'exact', head: true });

    if (teamsError) {
      logger.warn('[ReverseMigrationService] hasCloudData: teams check error', { error: teamsError.message });
      throw new NetworkError(`Failed to check teams: ${teamsError.message}`);
    }

    if (teamsCount && teamsCount > 0) {
      logger.info('[ReverseMigrationService] hasCloudData: found teams', { count: teamsCount });
      return { hasData: true, checkFailed: false };
    }

    // Check seasons
    const { count: seasonsCount, error: seasonsError } = await supabase
      .from('seasons')
      .select('*', { count: 'exact', head: true });

    if (seasonsError) {
      logger.warn('[ReverseMigrationService] hasCloudData: seasons check error', { error: seasonsError.message });
      throw new NetworkError(`Failed to check seasons: ${seasonsError.message}`);
    }

    if (seasonsCount && seasonsCount > 0) {
      logger.info('[ReverseMigrationService] hasCloudData: found seasons', { count: seasonsCount });
      return { hasData: true, checkFailed: false };
    }

    logger.info('[ReverseMigrationService] hasCloudData: no data found in cloud');
    return { hasData: false, checkFailed: false };

  } catch (err) {
    // Log the actual error for debugging
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[ReverseMigrationService] Failed to check cloud data:', err);
    // Track in Sentry - cloud data check failure could indicate auth or network issues
    try {
      Sentry.captureException(err, {
        tags: { component: 'ReverseMigrationService', action: 'hasCloudData' },
        level: 'error',
      });
    } catch {
      // Sentry failure is acceptable - error is already logged
    }
    return { hasData: false, checkFailed: true, error: errorMsg };
  }
}

/**
 * Get counts of all cloud data.
 * Used for preview in reverse migration wizard.
 *
 * @returns Counts of all entity types in cloud
 * @throws {NetworkError} If offline or network error
 * @throws {AuthError} If session expired (with user-friendly message)
 */
export async function getCloudDataSummary(): Promise<ReverseMigrationCounts> {
  // Check network connectivity first for clear error message
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new NetworkError('Cannot check cloud data while offline. Please check your connection.');
  }

  logger.info('[ReverseMigrationService] getCloudDataSummary: starting');

  const cloudStore = new SupabaseDataStore();
  try {
    logger.info('[ReverseMigrationService] getCloudDataSummary: initializing SupabaseDataStore');
    await cloudStore.initialize();

    // Verify there's an authenticated session before making requests
    // The Supabase client loads the session from localStorage asynchronously,
    // and isAvailable() only checks for errors, not session presence.
    // We need to explicitly check for a valid session to avoid 406 errors.
    logger.info('[ReverseMigrationService] getCloudDataSummary: checking session');
    const { getSupabaseClient } = await import('@/datastore/supabase');
    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw new AuthError(`Session error: ${sessionError.message}`);
    }
    if (!sessionData.session) {
      throw new AuthError('No active session. Please sign in again.');
    }
    logger.info('[ReverseMigrationService] getCloudDataSummary: session valid, fetching data');

    logger.info('[ReverseMigrationService] getCloudDataSummary: fetching players');
    const players = await cloudStore.getPlayers();
    logger.info('[ReverseMigrationService] getCloudDataSummary: fetching teams');
    const teams = await cloudStore.getTeams(true);
    logger.info('[ReverseMigrationService] getCloudDataSummary: fetching seasons');
    const seasons = await cloudStore.getSeasons(true);
    logger.info('[ReverseMigrationService] getCloudDataSummary: fetching tournaments');
    const tournaments = await cloudStore.getTournaments(true);
    logger.info('[ReverseMigrationService] getCloudDataSummary: fetching personnel');
    const personnel = await cloudStore.getAllPersonnel();
    logger.info('[ReverseMigrationService] getCloudDataSummary: fetching games');
    const games = await cloudStore.getGames();
    logger.info('[ReverseMigrationService] getCloudDataSummary: fetching warmupPlan');
    const warmupPlan = await cloudStore.getWarmupPlan();
    logger.info('[ReverseMigrationService] getCloudDataSummary: fetching settings');
    const settings = await cloudStore.getSettings();
    logger.info('[ReverseMigrationService] getCloudDataSummary: all core data fetched');

    // Count team rosters
    logger.info('[ReverseMigrationService] getCloudDataSummary: fetching team rosters', { teamCount: teams.length });
    let teamRostersCount = 0;
    for (const team of teams) {
      const roster = await cloudStore.getTeamRoster(team.id);
      teamRostersCount += roster.length;
    }

    // Count player adjustments
    logger.info('[ReverseMigrationService] getCloudDataSummary: fetching player adjustments', { playerCount: players.length });
    let adjustmentCount = 0;
    for (const player of players) {
      const adjustments = await cloudStore.getPlayerAdjustments(player.id);
      adjustmentCount += adjustments.length;
    }

    logger.info('[ReverseMigrationService] getCloudDataSummary: complete', {
      players: players.length,
      teams: teams.length,
      games: Object.keys(games).length,
    });

    return {
      players: players.length,
      teams: teams.length,
      teamRosters: teamRostersCount,
      seasons: seasons.length,
      tournaments: tournaments.length,
      games: Object.keys(games).length,
      personnel: personnel.length,
      playerAdjustments: adjustmentCount,
      warmupPlan: warmupPlan !== null,
      settings: settings !== null,
    };
  } catch (error) {
    // Wrap errors with user-friendly messages
    if (error instanceof NetworkError || error instanceof AuthError) {
      throw error; // Already has user-friendly message
    }
    // Check for common Supabase auth errors and wrap with friendly message
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('JWT') || errorMsg.includes('expired') || errorMsg.includes('401')) {
      throw new AuthError('Session expired. Please sign in again.');
    }
    // Re-throw with context for other errors
    logger.error('[ReverseMigrationService] getCloudDataSummary failed:', error);
    throw new NetworkError(`Failed to check cloud data: ${errorMsg}`);
  } finally {
    try {
      await cloudStore.close();
    } catch (e) {
      logger.warn('[ReverseMigrationService] Error closing cloudStore in getCloudDataSummary:', e);
    }
  }
}

// =============================================================================
// HYDRATION FUNCTION (for initial sync in cloud mode)
// =============================================================================

/**
 * Result of hydration operation.
 */
export interface HydrationResult {
  success: boolean;
  counts: ReverseMigrationCounts;
  /** Counts of entities skipped because local version was newer */
  skipped: ReverseMigrationCounts;
  errors: string[];
}

/**
 * Hydrate local storage from cloud data.
 *
 * This is used when a user signs in to cloud mode but has no local data.
 * Unlike migrateCloudToLocal, this function:
 * - Does NOT switch modes (stays in cloud mode)
 * - Does NOT delete cloud data
 * - Is designed for initial seeding of local storage in local-first sync
 *
 * @param userId - The authenticated user's ID (for user-scoped storage)
 * @param onProgress - Optional callback for progress updates
 * @returns HydrationResult with counts of imported entities
 */
export async function hydrateLocalFromCloud(
  userId: string,
  onProgress?: (message: string, progress: number) => void
): Promise<HydrationResult> {
  const errors: string[] = [];
  let cloudStore: SupabaseDataStore | null = null;
  let localStore: LocalDataStore | null = null;

  const safeProgress = (message: string, progress: number) => {
    try {
      onProgress?.(message, progress);
    } catch {
      // Progress callback error is non-fatal
    }
  };

  const counts: ReverseMigrationCounts = {
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

  // Track entities skipped because local version was newer
  const skipped: ReverseMigrationCounts = {
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

  logger.info('[ReverseMigrationService] Starting hydration from cloud', { userId });
  safeProgress('Connecting to cloud...', 0);

  try {
    // Initialize stores
    cloudStore = new SupabaseDataStore();
    await cloudStore.initialize();

    // Verify there's an authenticated session before making requests
    // The Supabase client loads the session from localStorage asynchronously,
    // and isAvailable() only checks for errors, not session presence.
    // We need to explicitly check for a valid session to avoid 406 errors.
    const { getSupabaseClient } = await import('@/datastore/supabase');
    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      logger.warn('[ReverseMigrationService] Hydration aborted: session error', { error: sessionError.message });
      errors.push(`Session error: ${sessionError.message}`);
      return { success: false, counts, skipped, errors };
    }
    if (!sessionData.session) {
      logger.warn('[ReverseMigrationService] Hydration aborted: no active session');
      errors.push('No active session. Please sign in again.');
      return { success: false, counts, skipped, errors };
    }

    localStore = new LocalDataStore(userId);
    await localStore.initialize();

    safeProgress('Downloading data from cloud...', 10);

    // Download all cloud data
    const cloudData = {
      players: await cloudStore.getPlayers(),
      teams: await cloudStore.getTeams(true),
      seasons: await cloudStore.getSeasons(true),
      tournaments: await cloudStore.getTournaments(true),
      personnel: await cloudStore.getAllPersonnel(),
      games: await cloudStore.getGames(),
      warmupPlan: await cloudStore.getWarmupPlan(),
      settings: await cloudStore.getSettings(),
      teamRosters: new Map<string, TeamPlayer[]>(),
      playerAdjustments: new Map<string, PlayerStatAdjustment[]>(),
    };

    // Download team rosters
    for (const team of cloudData.teams) {
      const roster = await cloudStore.getTeamRoster(team.id);
      cloudData.teamRosters.set(team.id, roster);
    }

    // Download player adjustments
    for (const player of cloudData.players) {
      const adjustments = await cloudStore.getPlayerAdjustments(player.id);
      if (adjustments.length > 0) {
        cloudData.playerAdjustments.set(player.id, adjustments);
      }
    }

    // DIAGNOSTIC: Log what was downloaded from cloud
    logger.info('[ReverseMigrationService] Downloaded cloud data', {
      players: cloudData.players.length,
      teams: cloudData.teams.length,
      seasons: cloudData.seasons.length,
      tournaments: cloudData.tournaments.length,
      personnel: cloudData.personnel.length,
      games: Object.keys(cloudData.games).length,
      hasWarmupPlan: !!cloudData.warmupPlan,
      hasSettings: !!cloudData.settings,
    });

    safeProgress('Saving to local storage...', 40);

    // Save players (with timestamp-based conflict resolution)
    const existingPlayers = await localStore.getPlayers();
    const existingPlayerMap = new Map(existingPlayers.map(p => [p.id, p]));

    for (const player of cloudData.players) {
      try {
        const existingPlayer = existingPlayerMap.get(player.id);
        if (shouldWriteBasedOnTimestamp(player.updatedAt, existingPlayer?.updatedAt)) {
          await localStore.upsertPlayer(player);
          counts.players++;
        } else {
          skipped.players++;
          logger.info('[ReverseMigrationService] Skipping player (local is newer)', {
            playerId: player.id,
            cloudUpdatedAt: player.updatedAt,
            localUpdatedAt: existingPlayer?.updatedAt,
          });
        }
      } catch (err) {
        const msg = `Failed to save player ${player.name}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        logger.error('[ReverseMigrationService] ' + msg);
        errors.push(msg);
      }
    }
    safeProgress('Saving players...', 50);

    // Save teams (with timestamp-based conflict resolution)
    // Teams have updatedAt, so we only overwrite if cloud is newer
    const existingTeams = await localStore.getTeams(true);
    const existingTeamMap = new Map(existingTeams.map(t => [t.id, t]));

    for (const team of cloudData.teams) {
      try {
        const existingTeam = existingTeamMap.get(team.id);
        if (shouldWriteBasedOnTimestamp(team.updatedAt, existingTeam?.updatedAt)) {
          await localStore.upsertTeam(team);
          counts.teams++;
        } else {
          skipped.teams++;
          logger.info('[ReverseMigrationService] Skipping team (local is newer)', {
            teamId: team.id,
            cloudUpdatedAt: team.updatedAt,
            localUpdatedAt: existingTeam?.updatedAt,
          });
        }
      } catch (err) {
        const msg = `Failed to save team ${team.name}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        logger.error('[ReverseMigrationService] ' + msg);
        errors.push(msg);
      }
    }

    // Save team rosters
    for (const [teamId, roster] of cloudData.teamRosters) {
      try {
        await localStore.setTeamRoster(teamId, roster);
        counts.teamRosters += roster.length;
      } catch (err) {
        const msg = `Failed to save team roster for ${teamId}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        logger.error('[ReverseMigrationService] ' + msg);
        errors.push(msg);
      }
    }
    safeProgress('Saving teams...', 55);

    // Save seasons (with timestamp-based conflict resolution)
    const existingSeasons = await localStore.getSeasons(true);
    const existingSeasonMap = new Map(existingSeasons.map(s => [s.id, s]));

    for (const season of cloudData.seasons) {
      try {
        const existingSeason = existingSeasonMap.get(season.id);
        if (shouldWriteBasedOnTimestamp(season.updatedAt, existingSeason?.updatedAt)) {
          await localStore.upsertSeason(season);
          counts.seasons++;
        } else {
          skipped.seasons++;
          logger.info('[ReverseMigrationService] Skipping season (local is newer)', {
            seasonId: season.id,
            cloudUpdatedAt: season.updatedAt,
            localUpdatedAt: existingSeason?.updatedAt,
          });
        }
      } catch (err) {
        const msg = `Failed to save season ${season.name}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        logger.error('[ReverseMigrationService] ' + msg);
        errors.push(msg);
      }
    }

    // Save tournaments (with timestamp-based conflict resolution)
    const existingTournaments = await localStore.getTournaments(true);
    const existingTournamentMap = new Map(existingTournaments.map(t => [t.id, t]));

    for (const tournament of cloudData.tournaments) {
      try {
        const existingTournament = existingTournamentMap.get(tournament.id);
        if (shouldWriteBasedOnTimestamp(tournament.updatedAt, existingTournament?.updatedAt)) {
          await localStore.upsertTournament(tournament);
          counts.tournaments++;
        } else {
          skipped.tournaments++;
          logger.info('[ReverseMigrationService] Skipping tournament (local is newer)', {
            tournamentId: tournament.id,
            cloudUpdatedAt: tournament.updatedAt,
            localUpdatedAt: existingTournament?.updatedAt,
          });
        }
      } catch (err) {
        const msg = `Failed to save tournament ${tournament.name}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        logger.error('[ReverseMigrationService] ' + msg);
        errors.push(msg);
      }
    }
    safeProgress('Saving seasons and tournaments...', 60);

    // Save personnel (with timestamp-based conflict resolution)
    // Personnel have updatedAt, so we only overwrite if cloud is newer
    const existingPersonnel = await localStore.getAllPersonnel();
    const existingPersonnelMap = new Map(existingPersonnel.map(p => [p.id, p]));

    for (const person of cloudData.personnel) {
      try {
        const existingPerson = existingPersonnelMap.get(person.id);
        if (shouldWriteBasedOnTimestamp(person.updatedAt, existingPerson?.updatedAt)) {
          await localStore.upsertPersonnelMember(person);
          counts.personnel++;
        } else {
          skipped.personnel++;
          logger.info('[ReverseMigrationService] Skipping personnel (local is newer)', {
            personnelId: person.id,
            cloudUpdatedAt: person.updatedAt,
            localUpdatedAt: existingPerson?.updatedAt,
          });
        }
      } catch (err) {
        const msg = `Failed to save personnel ${person.name}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        logger.error('[ReverseMigrationService] ' + msg);
        errors.push(msg);
      }
    }
    safeProgress('Saving personnel...', 65);

    // Save games (with timestamp-based conflict resolution)
    const existingGames = await localStore.getGames();
    const gameEntries = Object.entries(cloudData.games);

    // DIAGNOSTIC: Log game counts to help debug hydration issues
    logger.info('[ReverseMigrationService] Game hydration starting', {
      cloudGamesCount: gameEntries.length,
      localGamesCount: Object.keys(existingGames).length,
    });

    for (let i = 0; i < gameEntries.length; i++) {
      const [gameId, game] = gameEntries[i];
      try {
        const existingGame = existingGames[gameId];
        if (shouldWriteBasedOnTimestamp(game.updatedAt, existingGame?.updatedAt)) {
          await localStore.saveGame(gameId, game);
          counts.games++;
        } else {
          skipped.games++;
          logger.info('[ReverseMigrationService] Skipping game (local is newer)', {
            gameId,
            cloudUpdatedAt: game.updatedAt,
            localUpdatedAt: existingGame?.updatedAt,
          });
        }
        // Progress updates for games (65-90%)
        const gameProgress = 65 + Math.floor((i / gameEntries.length) * 25);
        safeProgress(`Saving games... (${i + 1}/${gameEntries.length})`, gameProgress);
      } catch (err) {
        const msg = `Failed to save game ${gameId}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        logger.error('[ReverseMigrationService] ' + msg);
        errors.push(msg);
      }
    }

    // Save player adjustments
    for (const [playerId, adjustments] of cloudData.playerAdjustments) {
      for (const adj of adjustments) {
        try {
          await localStore.upsertPlayerAdjustment(adj);
          counts.playerAdjustments++;
        } catch (err) {
          const msg = `Failed to save adjustment for player ${playerId}: ${err instanceof Error ? err.message : 'Unknown error'}`;
          logger.error('[ReverseMigrationService] ' + msg);
          errors.push(msg);
        }
      }
    }
    safeProgress('Saving adjustments...', 92);

    // Save warmup plan
    if (cloudData.warmupPlan) {
      try {
        await localStore.saveWarmupPlan(cloudData.warmupPlan);
        counts.warmupPlan = true;
      } catch (err) {
        const msg = `Failed to save warmup plan: ${err instanceof Error ? err.message : 'Unknown error'}`;
        logger.error('[ReverseMigrationService] ' + msg);
        errors.push(msg);
      }
    }

    // Save settings
    if (cloudData.settings) {
      try {
        await localStore.saveSettings(cloudData.settings);
        counts.settings = true;
      } catch (err) {
        const msg = `Failed to save settings: ${err instanceof Error ? err.message : 'Unknown error'}`;
        logger.error('[ReverseMigrationService] ' + msg);
        errors.push(msg);
      }
    }
    safeProgress('Finalizing...', 98);

    const success = errors.length === 0;
    logger.info('[ReverseMigrationService] Hydration complete', {
      success,
      counts,
      skipped,
      errorCount: errors.length,
    });
    safeProgress('Complete', 100);

    return { success, counts, skipped, errors };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ReverseMigrationService] Hydration failed:', error);
    errors.push(`Hydration failed: ${errorMsg}`);
    return { success: false, counts, skipped, errors };
  } finally {
    // Clean up stores
    try {
      if (cloudStore) await cloudStore.close();
    } catch (e) {
      logger.warn('[ReverseMigrationService] Error closing cloudStore during hydration:', e);
    }
    try {
      if (localStore) await localStore.close();
    } catch (e) {
      logger.warn('[ReverseMigrationService] Error closing localStore during hydration:', e);
    }
  }
}
