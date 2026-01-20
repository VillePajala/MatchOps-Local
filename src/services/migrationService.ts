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
import { NetworkError } from '@/interfaces/DataStoreErrors';
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
  onProgress: MigrationProgressCallback,
  mode: MigrationMode = 'merge'
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
      // Use warn level - callback failures don't stop migration, but should be investigated
      logger.warn('[MigrationService] Progress callback error:', err);
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

    // Step 3: Sanitize orphaned references in games
    // Games may reference seasons/tournaments/teams that no longer exist
    // We clean these up by setting to empty string (becomes NULL in DB)
    const { sanitizedGames, warnings: sanitizeWarnings } = sanitizeGameReferences(localData);
    if (sanitizeWarnings.length > 0) {
      warnings.push(...sanitizeWarnings);
    }
    // Update localData with sanitized games for upload
    const sanitizedLocalData = { ...localData, games: sanitizedGames };

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
    safeProgress({ stage: 'uploading', progress: PROGRESS_RANGES.UPLOADING.start + 5, message: MIGRATION_MESSAGES.UPLOADING });

    const uploadedCounts = await uploadToCloud(sanitizedLocalData, cloudStore, safeProgress);

    // Step 7: Verify counts match (compares actual uploads vs expected)
    safeProgress({ stage: 'verifying', progress: PROGRESS_RANGES.VERIFYING.start, message: MIGRATION_MESSAGES.VERIFYING });

    const verified = await verifyMigration(sanitizedLocalData, cloudStore, preCounts);

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

    // Step 8: SUCCESS
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
      gameCopy = { ...gameCopy, tournamentId: '' };
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

    await cloudStore.saveGame(gameId, game);
    counts.games++;
  }

  // 8. Player adjustments - upsert preserves original IDs (handles merge mode)
  updateProgress('player adjustments');
  for (const [_playerId, adjustments] of data.playerAdjustments) {
    for (const adjustment of adjustments) {
      await cloudStore.upsertPlayerAdjustment(adjustment);
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
 * Uses pre/post snapshot comparison to detect partial upload failures:
 * - Fresh migration (pre=0): postCount should equal localCount
 * - Merge migration (pre>0): postCount should be >= max(pre, local) due to upserts
 *
 * Why this is complex:
 * - Upserts UPDATE existing entities (count unchanged) or INSERT new ones (count +1)
 * - If local and cloud have overlapping IDs, upserts update, not insert
 * - We can't distinguish "updated existing" from "failed to upload" by count alone
 *
 * Strategy:
 * - If pre=0 (fresh): post should equal local (simple case)
 * - If pre>0 (merge): post should be >= pre (no data lost) AND post >= local (all local exists)
 *   The second check catches the edge case where pre=50, local=100, only 30 new uploaded → post=80
 *   80 >= 50 (ok) but 80 < 100 (fail)
 *
 * Returns warnings when cloud had pre-existing data (pre > 0).
 */
async function verifyMigration(
  localData: LocalDataSnapshot,
  cloudStore: SupabaseDataStore,
  preCounts: CloudCounts
): Promise<{ success: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Get post-migration counts
  const postCounts = await getCloudCounts(cloudStore);

  // Helper to verify counts
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

      // Post should be at least as many as local (all local data should exist)
      if (postCount < localCount) {
        errors.push(`${entity}: cloud has ${postCount} but local had ${localCount} (some failed to upload)`);
      }

      // Post should be >= pre (no data was lost during migration)
      if (postCount < preCount) {
        errors.push(`${entity}: cloud lost data during migration (was ${preCount}, now ${postCount})`);
      }
    }
  };

  // Compare all entity counts
  compareCount('Players', localData.players.length, preCounts.players, postCounts.players);
  compareCount('Teams', localData.teams.length, preCounts.teams, postCounts.teams);
  compareCount('Seasons', localData.seasons.length, preCounts.seasons, postCounts.seasons);
  compareCount('Tournaments', localData.tournaments.length, preCounts.tournaments, postCounts.tournaments);
  compareCount('Games', Object.keys(localData.games).length, preCounts.games, postCounts.games);
  compareCount('Personnel', localData.personnel.length, preCounts.personnel, postCounts.personnel);

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
