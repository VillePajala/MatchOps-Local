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
import { NetworkError } from '@/interfaces/DataStoreErrors';
import type { Player, Team, TeamPlayer, Season, Tournament, Personnel, SavedGamesCollection, PlayerStatAdjustment, AppSettings } from '@/types';
import type { WarmupPlan } from '@/types/warmupPlan';
import { disableCloudMode, clearCloudAccountInfo, updateCloudAccountInfo } from '@/config/backendConfig';
import logger from '@/utils/logger';

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
// MIGRATION LOCK
// =============================================================================

let isReverseMigrationInProgress = false;

/**
 * Check if a reverse migration is currently in progress.
 */
export function isReverseMigrationRunning(): boolean {
  return isReverseMigrationInProgress;
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
  // Prevent concurrent migrations
  if (isReverseMigrationInProgress) {
    return {
      success: false,
      downloaded: createEmptyCounts(),
      errors: ['Migration already in progress'],
      warnings: [],
      cloudDeleted: false,
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  let cloudDeleted = false;
  let lockAcquired = false;
  let cloudStore: SupabaseDataStore | null = null;
  let localStore: LocalDataStore | null = null;

  // Safe progress callback that won't throw
  const safeProgress = (progress: ReverseMigrationProgress) => {
    try {
      onProgress(progress);
    } catch (e) {
      logger.warn('[ReverseMigrationService] Progress callback threw error:', e);
    }
  };

  try {
    isReverseMigrationInProgress = true;
    lockAcquired = true;
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
    const expectedPlayers = cloudData.players.length;
    const playerFailures = saveFailures.filter(f => f.entityType === 'player').length;
    const actualPlayersTracked = savedCounts.players + playerFailures;
    if (actualPlayersTracked !== expectedPlayers) {
      warnings.push(`Save tracking inconsistency: ${actualPlayersTracked} players tracked (saved: ${savedCounts.players}, failed: ${playerFailures}) but ${expectedPlayers} expected`);
    }

    const expectedTeams = cloudData.teams.length;
    const actualTeamsTracked = savedCounts.teams + saveFailures.filter(f => f.entityType === 'team').length;
    if (actualTeamsTracked !== expectedTeams) {
      warnings.push(`Save tracking inconsistency: ${actualTeamsTracked} teams tracked but ${expectedTeams} expected`);
    }

    const expectedGames = Object.keys(cloudData.games).length;
    const actualGamesTracked = savedCounts.games + saveFailures.filter(f => f.entityType === 'game').length;
    if (actualGamesTracked !== expectedGames) {
      warnings.push(`Save tracking inconsistency: ${actualGamesTracked} games tracked but ${expectedGames} expected`);
    }

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
    if (lockAcquired) {
      isReverseMigrationInProgress = false;
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

  // Get player adjustments for all players
  reportProgress(0, REVERSE_MIGRATION_ENTITY_NAMES.ADJUSTMENTS);
  const playerAdjustments = new Map<string, PlayerStatAdjustment[]>();
  const playerCount = players.length;
  for (let index = 0; index < playerCount; index++) {
    const player = players[index];
    const adjustments = await cloudStore.getPlayerAdjustments(player.id);
    if (adjustments.length > 0) {
      playerAdjustments.set(player.id, adjustments);
    }
    if (playerCount > 0) {
      reportProgress(
        (index + 1) / playerCount,
        `${REVERSE_MIGRATION_ENTITY_NAMES.ADJUSTMENTS} (${index + 1}/${playerCount})`
      );
    }
  }
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
  let gameContentMismatches = 0;
  for (const gameId of cloudGameIds) {
    if (localGameIds.has(gameId)) {
      const cloudGame = cloudData.games[gameId];
      const localGame = localGames[gameId];

      // Verify event count matches
      const cloudEventCount = cloudGame.gameEvents?.length ?? 0;
      const localEventCount = localGame.gameEvents?.length ?? 0;
      if (cloudEventCount !== localEventCount) {
        gameContentMismatches++;
      }

      // Verify player count matches
      const cloudPlayerCount = cloudGame.availablePlayers?.length ?? 0;
      const localPlayerCount = localGame.availablePlayers?.length ?? 0;
      if (cloudPlayerCount !== localPlayerCount) {
        gameContentMismatches++;
      }
    }
  }
  if (gameContentMismatches > 0) {
    warnings.push(`${gameContentMismatches} game(s) have content mismatches (events or players differ)`);
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
  // Non-critical: roster entries, adjustments (can be re-synced)
  const hasMissingCriticalEntities =
    missingCounts.players > 0 ||
    missingCounts.teams > 0 ||
    missingCounts.games > 0 ||
    missingCounts.seasons > 0 ||
    missingCounts.tournaments > 0 ||
    missingCounts.personnel > 0;

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
 * @returns CloudDataCheckResult that distinguishes "no data" from "check failed"
 */
export async function hasCloudData(): Promise<CloudDataCheckResult> {
  try {
    const summary = await getCloudDataSummary();
    const hasData = (
      summary.players > 0 ||
      summary.teams > 0 ||
      summary.games > 0 ||
      summary.seasons > 0 ||
      summary.tournaments > 0 ||
      summary.personnel > 0
    );
    return { hasData, checkFailed: false };
  } catch (err) {
    // Log the actual error for debugging
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[ReverseMigrationService] Failed to check cloud data:', err);
    return { hasData: false, checkFailed: true, error: errorMsg };
  }
}

/**
 * Get counts of all cloud data.
 * Used for preview in reverse migration wizard.
 *
 * @returns Counts of all entity types in cloud
 * @throws {NetworkError} If offline
 */
export async function getCloudDataSummary(): Promise<ReverseMigrationCounts> {
  // Check network connectivity first for clear error message
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new NetworkError('Cannot check cloud data while offline. Please check your connection.');
  }

  const cloudStore = new SupabaseDataStore();
  try {
    await cloudStore.initialize();

    const players = await cloudStore.getPlayers();
    const teams = await cloudStore.getTeams(true);
    const seasons = await cloudStore.getSeasons(true);
    const tournaments = await cloudStore.getTournaments(true);
    const personnel = await cloudStore.getAllPersonnel();
    const games = await cloudStore.getGames();
    const warmupPlan = await cloudStore.getWarmupPlan();
    const settings = await cloudStore.getSettings();

    // Count team rosters
    let teamRostersCount = 0;
    for (const team of teams) {
      const roster = await cloudStore.getTeamRoster(team.id);
      teamRostersCount += roster.length;
    }

    // Count player adjustments
    let adjustmentCount = 0;
    for (const player of players) {
      const adjustments = await cloudStore.getPlayerAdjustments(player.id);
      adjustmentCount += adjustments.length;
    }

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
  } finally {
    try {
      await cloudStore.close();
    } catch (e) {
      logger.warn('[ReverseMigrationService] Error closing cloudStore in getCloudDataSummary:', e);
    }
  }
}
