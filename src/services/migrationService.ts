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

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * User-facing messages for migration states.
 */
export const MIGRATION_MESSAGES = {
  PREPARING: 'Preparing migration...',
  EXPORTING: 'Exporting local data...',
  VALIDATING: 'Validating data integrity...',
  UPLOADING: 'Uploading to cloud...',
  VERIFYING: 'Verifying migration...',
  SUCCESS: 'Migration complete! Your data is now synced to the cloud.',
  PARTIAL_FAILURE: 'Migration was interrupted. Your local data is safe. Please try again.',
  VERIFICATION_FAILED: 'Migration completed but verification failed. Please retry.',
  NETWORK_ERROR: 'Network error during migration. Your local data is unchanged.',
  CLEAR_LOCAL_PROMPT: 'Would you like to clear local data? (Your cloud data is safe)',
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

// =============================================================================
// MIGRATION LOCK
// =============================================================================

/**
 * Prevents concurrent migrations.
 * This is a module-level flag to prevent race conditions if user
 * triggers migration multiple times before previous one completes.
 */
let isMigrationInProgress = false;

/**
 * Check if a migration is currently in progress.
 */
export function isMigrationRunning(): boolean {
  return isMigrationInProgress;
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
  onProgress: MigrationProgressCallback
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

  // Prevent concurrent migrations
  if (isMigrationInProgress) {
    return {
      ...emptyResult,
      errors: ['Migration already in progress. Please wait for it to complete.'],
    };
  }

  // Safe progress callback that won't crash migration if callback throws
  const safeProgress = (progress: MigrationProgress) => {
    try {
      onProgress(progress);
    } catch (err) {
      // Use error level - callback failures indicate a bug in the caller
      logger.error('[MigrationService] Progress callback error:', err);
    }
  };

  // Acquire migration lock
  isMigrationInProgress = true;

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

    const localStore = new LocalDataStore();
    const cloudStore = new SupabaseDataStore();

    await localStore.initialize();
    await cloudStore.initialize();

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
      Object.keys(localData.games).length > 0;

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

    // Step 3: Upload to cloud (uses upserts - safe to retry)
    safeProgress({ stage: 'uploading', progress: PROGRESS_RANGES.UPLOADING.start, message: MIGRATION_MESSAGES.UPLOADING });

    const uploadedCounts = await uploadToCloud(localData, cloudStore, safeProgress);

    // Step 4: Verify counts match
    safeProgress({ stage: 'verifying', progress: PROGRESS_RANGES.VERIFYING.start, message: MIGRATION_MESSAGES.VERIFYING });

    const verified = await verifyMigration(localData, cloudStore);

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

    // Step 5: SUCCESS
    safeProgress({ stage: 'complete', progress: PROGRESS_RANGES.VERIFYING.end, message: MIGRATION_MESSAGES.SUCCESS });

    logger.info('[MigrationService] Migration completed successfully', uploadedCounts);

    return {
      success: true,
      migrated: uploadedCounts,
      errors: [],
      warnings,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[MigrationService] Migration failed:', error);

    // Classify error type for better user feedback
    const isNetworkError =
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
    // Always release migration lock
    isMigrationInProgress = false;
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
  for (const teamId of Object.keys(allRosters)) {
    teamRosters.set(teamId, allRosters[teamId]);
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
 */
async function uploadToCloud(
  data: LocalDataSnapshot,
  cloudStore: SupabaseDataStore,
  onProgress: MigrationProgressCallback
): Promise<MigrationCounts> {
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
    await cloudStore.upsertPlayer(player);
    counts.players++;
  }

  // 2. Seasons - upsert preserves original IDs
  updateProgress('seasons');
  for (const season of data.seasons) {
    await cloudStore.upsertSeason(season);
    counts.seasons++;
  }

  // 3. Tournaments - upsert preserves original IDs
  updateProgress('tournaments');
  for (const tournament of data.tournaments) {
    await cloudStore.upsertTournament(tournament);
    counts.tournaments++;
  }

  // 4. Teams - upsert preserves original IDs (must come after seasons/tournaments for FK refs)
  updateProgress('teams');
  for (const team of data.teams) {
    await cloudStore.upsertTeam(team);
    counts.teams++;
  }

  // 5. Team rosters (must come after players and teams)
  updateProgress('team rosters');
  for (const [teamId, roster] of data.teamRosters) {
    await cloudStore.setTeamRoster(teamId, roster);
    counts.teamRosters += roster.length;
  }

  // 6. Personnel - upsert preserves original IDs
  updateProgress('personnel');
  for (const member of data.personnel) {
    await cloudStore.upsertPersonnel(member);
    counts.personnel++;
  }

  // 7. Games (the big one - uses RPC for atomic 5-table writes)
  updateProgress('games');
  const gameIds = Object.keys(data.games);
  for (let i = 0; i < gameIds.length; i++) {
    const gameId = gameIds[i];
    const game = data.games[gameId];

    // Update progress more frequently for games (step 7 of 10)
    if (i % 10 === 0) {
      const gameStep = 6 + (i / gameIds.length); // Steps 6-7 for games
      const gamesProgress = Math.round(start + (gameStep / totalSteps) * range);
      onProgress({
        stage: 'uploading',
        progress: gamesProgress,
        currentEntity: `games (${i + 1}/${gameIds.length})`,
      });
    }

    await cloudStore.saveGame(gameId, game);
    counts.games++;
  }

  // 8. Player adjustments (adjustment includes playerId, so we just pass it directly)
  updateProgress('player adjustments');
  for (const [_playerId, adjustments] of data.playerAdjustments) {
    for (const adjustment of adjustments) {
      await cloudStore.addPlayerAdjustment(adjustment);
      counts.playerAdjustments++;
    }
  }

  // 9. Warmup plan
  updateProgress('warmup plan');
  if (data.warmupPlan) {
    await cloudStore.saveWarmupPlan(data.warmupPlan);
    counts.warmupPlan = true;
  }

  // 10. Settings
  updateProgress('settings');
  if (data.settings) {
    await cloudStore.saveSettings(data.settings);
    counts.settings = true;
  }

  return counts;
}

// =============================================================================
// VERIFICATION FUNCTIONS
// =============================================================================

/**
 * Verify migration by comparing counts.
 *
 * Uses "at least" comparison (>=) rather than exact (===) because:
 * - Cloud may have pre-existing data from previous migrations
 * - Upsert pattern merges new data with existing
 *
 * Returns warnings when cloud has MORE data than local (indicates pre-existing data).
 */
async function verifyMigration(
  localData: LocalDataSnapshot,
  cloudStore: SupabaseDataStore
): Promise<{ success: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Get cloud counts in parallel for better performance
  const [cloudPlayers, cloudTeams, cloudSeasons, cloudTournaments, cloudGames, cloudPersonnel] =
    await Promise.all([
      cloudStore.getPlayers(),
      cloudStore.getTeams(true),
      cloudStore.getSeasons(true),
      cloudStore.getTournaments(true),
      cloudStore.getGames(),
      cloudStore.getAllPersonnel(),
    ]);

  // Helper to compare counts and generate appropriate error/warning
  const compareCount = (entity: string, localCount: number, cloudCount: number) => {
    if (cloudCount < localCount) {
      errors.push(`${entity}: expected at least ${localCount}, found ${cloudCount}`);
    } else if (cloudCount > localCount) {
      warnings.push(`${entity}: cloud has ${cloudCount} (local had ${localCount}) - pre-existing data merged`);
    }
  };

  // Compare all entity counts
  compareCount('Players', localData.players.length, cloudPlayers.length);
  compareCount('Teams', localData.teams.length, cloudTeams.length);
  compareCount('Seasons', localData.seasons.length, cloudSeasons.length);
  compareCount('Tournaments', localData.tournaments.length, cloudTournaments.length);

  const localGameCount = Object.keys(localData.games).length;
  const cloudGameCount = Object.keys(cloudGames).length;
  compareCount('Games', localGameCount, cloudGameCount);

  const cloudPersonnelArray = normalizePersonnelArray(cloudPersonnel);
  compareCount('Personnel', localData.personnel.length, cloudPersonnelArray.length);

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
  return Array.isArray(personnel) ? personnel : Object.values(personnel);
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
 */
export async function hasLocalDataToMigrate(): Promise<boolean> {
  try {
    const localStore = new LocalDataStore();
    await localStore.initialize();

    const players = await localStore.getPlayers();
    const games = await localStore.getGames();

    // Consider there's data to migrate if there are players or games
    return players.length > 0 || Object.keys(games).length > 0;
  } catch {
    return false;
  }
}

/**
 * Get summary of local data for migration preview.
 */
export async function getLocalDataSummary(): Promise<MigrationCounts> {
  const localStore = new LocalDataStore();
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
}
