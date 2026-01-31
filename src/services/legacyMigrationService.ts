/**
 * Legacy Migration Service - MatchOpsLocal to User-Scoped Database
 *
 * Migrates data from the legacy global `MatchOpsLocal` database to the
 * user-scoped `matchops_user_{userId}` database on first sign-in after
 * the user-scoped storage feature is deployed.
 *
 * CRITICAL PRINCIPLES:
 * 1. Idempotent - Safe to run multiple times (checks for existing data)
 * 2. Non-destructive - Legacy database is NOT deleted (user can manually clean up)
 * 3. Silent for most cases - Only shows toast on successful migration
 *
 * Migration flow:
 * 1. Check if legacy database exists with data
 * 2. Check if user already has data (skip if yes - idempotent)
 * 3. Read all entities from legacy database
 * 4. Write to user's database using DataStore methods
 *
 * Part of user-scoped storage implementation (Step 8).
 *
 * @see docs/03-active-plans/user-scoped-storage-plan-v2.md Section 4
 */

import { legacyDatabaseExists } from '@/datastore/userDatabase';
import { createLegacyAdapter } from '@/utils/storageFactory';
import { getDataStore } from '@/datastore/factory';
import {
  MASTER_ROSTER_KEY,
  SAVED_GAMES_KEY,
  SEASONS_LIST_KEY,
  TOURNAMENTS_LIST_KEY,
  TEAMS_INDEX_KEY,
  TEAM_ROSTERS_KEY,
  PERSONNEL_KEY,
  WARMUP_PLAN_KEY,
  APP_SETTINGS_KEY,
  PLAYER_ADJUSTMENTS_KEY,
} from '@/config/storageKeys';
import type {
  Player,
  Team,
  TeamPlayer,
  Season,
  Tournament,
  PlayerStatAdjustment,
} from '@/types';
import type { SavedGamesCollection } from '@/types/game';
import type { PersonnelCollection, Personnel } from '@/types/personnel';
import type { WarmupPlan } from '@/types/warmupPlan';
import type { AppSettings } from '@/types/settings';
import type { StorageAdapter } from '@/utils/storageAdapter';
import logger from '@/utils/logger';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of legacy migration check.
 */
export type LegacyMigrationStatus =
  | 'no_legacy_data'     // No legacy database or empty
  | 'already_migrated'   // User already has data
  | 'migrated'           // Successfully migrated
  | 'migration_error';   // Error during migration

/**
 * Result of legacy migration operation.
 */
export interface LegacyMigrationResult {
  status: LegacyMigrationStatus;
  /** Number of entities migrated (only for 'migrated' status) */
  entityCount?: number;
  /** Error message (only for 'migration_error' status) */
  error?: string;
  /** Breakdown of migrated entities */
  counts?: {
    players: number;
    games: number;
    seasons: number;
    tournaments: number;
    teams: number;
    personnel: number;
    warmupPlan: boolean;
    settings: boolean;
  };
}

/**
 * Raw data from legacy database.
 */
interface LegacyData {
  players: Player[];
  games: SavedGamesCollection;
  seasons: Season[];
  tournaments: Tournament[];
  teams: Record<string, Team>;
  teamRosters: Record<string, TeamPlayer[]>;
  personnel: PersonnelCollection;
  playerAdjustments: Record<string, PlayerStatAdjustment[]>;
  warmupPlan: WarmupPlan | null;
  settings: AppSettings | null;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Safely parse JSON from storage.
 */
function safeParseJSON<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Read all data from the legacy adapter.
 */
async function readLegacyData(adapter: StorageAdapter): Promise<LegacyData> {
  const [
    playersRaw,
    gamesRaw,
    seasonsRaw,
    tournamentsRaw,
    teamsRaw,
    teamRostersRaw,
    personnelRaw,
    adjustmentsRaw,
    warmupPlanRaw,
    settingsRaw,
  ] = await Promise.all([
    adapter.getItem(MASTER_ROSTER_KEY),
    adapter.getItem(SAVED_GAMES_KEY),
    adapter.getItem(SEASONS_LIST_KEY),
    adapter.getItem(TOURNAMENTS_LIST_KEY),
    adapter.getItem(TEAMS_INDEX_KEY),
    adapter.getItem(TEAM_ROSTERS_KEY),
    adapter.getItem(PERSONNEL_KEY),
    adapter.getItem(PLAYER_ADJUSTMENTS_KEY),
    adapter.getItem(WARMUP_PLAN_KEY),
    adapter.getItem(APP_SETTINGS_KEY),
  ]);

  return {
    players: safeParseJSON<Player[]>(playersRaw) ?? [],
    games: safeParseJSON<SavedGamesCollection>(gamesRaw) ?? {},
    seasons: safeParseJSON<Season[]>(seasonsRaw) ?? [],
    tournaments: safeParseJSON<Tournament[]>(tournamentsRaw) ?? [],
    teams: safeParseJSON<Record<string, Team>>(teamsRaw) ?? {},
    teamRosters: safeParseJSON<Record<string, TeamPlayer[]>>(teamRostersRaw) ?? {},
    personnel: safeParseJSON<PersonnelCollection>(personnelRaw) ?? {},
    playerAdjustments: safeParseJSON<Record<string, PlayerStatAdjustment[]>>(adjustmentsRaw) ?? {},
    warmupPlan: safeParseJSON<WarmupPlan>(warmupPlanRaw),
    settings: safeParseJSON<AppSettings>(settingsRaw),
  };
}

/**
 * Check if legacy data has any meaningful content.
 */
function hasLegacyContent(data: LegacyData): boolean {
  return (
    data.players.length > 0 ||
    Object.keys(data.games).length > 0 ||
    data.seasons.length > 0 ||
    data.tournaments.length > 0 ||
    Object.keys(data.teams).length > 0 ||
    Object.keys(data.personnel).length > 0
  );
}

/**
 * Count total entities for migration result.
 */
function countEntities(data: LegacyData): number {
  return (
    data.players.length +
    Object.keys(data.games).length +
    data.seasons.length +
    data.tournaments.length +
    Object.keys(data.teams).length +
    Object.keys(data.personnel).length +
    (data.warmupPlan ? 1 : 0) +
    (data.settings ? 1 : 0)
  );
}

// =============================================================================
// MAIN MIGRATION FUNCTION
// =============================================================================

/**
 * Migrate data from the legacy `MatchOpsLocal` database to the user-scoped database.
 *
 * This function is idempotent:
 * - If no legacy database exists: Returns 'no_legacy_data'
 * - If user already has data: Returns 'already_migrated' (does not overwrite)
 * - If migration succeeds: Returns 'migrated' with entity count
 * - If error occurs: Returns 'migration_error' with message
 *
 * @param userId - The authenticated user's ID (from Supabase Auth)
 * @returns Migration result with status and optional entity count
 * @throws Never throws - returns 'migration_error' status on failure
 * @note Migration is not atomic. On failure, some entities may be migrated.
 *       Legacy data is preserved for manual recovery.
 *
 * @example
 * ```typescript
 * // In AuthProvider after successful sign-in
 * const result = await migrateLegacyData(user.id);
 * if (result.status === 'migrated') {
 *   showToast(`Migrated ${result.entityCount} items to your account`);
 * }
 * ```
 */
export async function migrateLegacyData(userId: string): Promise<LegacyMigrationResult> {
  // Defense in depth: validate userId even though auth layer should ensure this
  const MAX_USER_ID_LENGTH = 255; // Supabase Auth user ID max length
  if (!userId || typeof userId !== 'string' || userId.length > MAX_USER_ID_LENGTH) {
    // Log reason without exposing userId value (privacy)
    const reason = !userId ? 'empty' : typeof userId !== 'string' ? 'not a string' : 'too long';
    logger.error('[LegacyMigration] Invalid userId', { reason });
    return { status: 'migration_error', error: 'Invalid user ID' };
  }

  logger.info('[LegacyMigration] Starting migration check', { userId });

  try {
    // Step 1: Check if legacy database exists
    const legacyExists = await legacyDatabaseExists();
    if (!legacyExists) {
      logger.debug('[LegacyMigration] No legacy database found');
      return { status: 'no_legacy_data' };
    }

    // Step 2: Read legacy data to see if it has content
    let legacyAdapter: StorageAdapter | null = null;
    try {
      legacyAdapter = await createLegacyAdapter();
    } catch (error) {
      logger.warn('[LegacyMigration] Failed to create legacy adapter', error);
      return { status: 'no_legacy_data' };
    }

    const legacyData = await readLegacyData(legacyAdapter);

    if (!hasLegacyContent(legacyData)) {
      logger.debug('[LegacyMigration] Legacy database exists but is empty');
      return { status: 'no_legacy_data' };
    }

    // Step 3: Check if user already has data (idempotent check)
    const userStore = await getDataStore(userId);
    const existingPlayers = await userStore.getPlayers();

    if (existingPlayers.length > 0) {
      logger.info('[LegacyMigration] User already has data, skipping migration', {
        userId,
        existingPlayerCount: existingPlayers.length,
      });
      return { status: 'already_migrated' };
    }

    // Step 4: Migrate data to user's database
    // NOTE: Migration is NOT transactional. On failure, some data may be migrated.
    // This is acceptable given:
    // 1. Single-user context (no concurrent writes from other sources)
    // 2. Small data scale (~100 entities typical for soccer coaching app)
    // 3. User can retry migration or manually import from backup
    // 4. Worst case: partial data + error toast prompts support contact
    // 5. Legacy data is preserved (non-destructive) for manual recovery
    const migrationStartTime = Date.now();
    logger.info('[LegacyMigration] Starting data migration', {
      userId,
      counts: {
        players: legacyData.players.length,
        games: Object.keys(legacyData.games).length,
        seasons: legacyData.seasons.length,
        tournaments: legacyData.tournaments.length,
        teams: Object.keys(legacyData.teams).length,
        personnel: Object.keys(legacyData.personnel).length,
      },
    });

    // Import players
    for (const player of legacyData.players) {
      await userStore.upsertPlayer(player);
    }

    // Import seasons
    for (const season of legacyData.seasons) {
      await userStore.upsertSeason(season);
    }

    // Import tournaments
    for (const tournament of legacyData.tournaments) {
      await userStore.upsertTournament(tournament);
    }

    // Import teams and their rosters
    for (const [teamId, team] of Object.entries(legacyData.teams)) {
      await userStore.upsertTeam(team);
      const roster = legacyData.teamRosters[teamId];
      if (roster && roster.length > 0) {
        await userStore.setTeamRoster(teamId, roster);
      }
    }

    // Import personnel
    for (const personnel of Object.values(legacyData.personnel)) {
      await userStore.upsertPersonnelMember(personnel as Personnel);
    }

    // Import games (SavedGamesCollection keys are game IDs)
    for (const [gameId, game] of Object.entries(legacyData.games)) {
      await userStore.saveGame(gameId, game);
    }

    // Import player adjustments
    for (const [_playerId, adjustments] of Object.entries(legacyData.playerAdjustments)) {
      for (const adjustment of adjustments) {
        await userStore.upsertPlayerAdjustment(adjustment);
      }
    }

    // Import warmup plan
    if (legacyData.warmupPlan) {
      await userStore.saveWarmupPlan(legacyData.warmupPlan);
    }

    // Import settings
    // NOTE: Settings are saved AFTER games. If any game save failed above, we would
    // have thrown and never reached here. Therefore, validating currentGameId against
    // legacyData.games is sufficient - all those games have been successfully saved.
    if (legacyData.settings) {
      const currentGameId = legacyData.settings.currentGameId;
      const validGameId = currentGameId && legacyData.games[currentGameId]
        ? currentGameId
        : null;

      await userStore.saveSettings({
        ...legacyData.settings,
        currentGameId: validGameId,
      });
    }

    const entityCount = countEntities(legacyData);

    logger.info('[LegacyMigration] Migration completed successfully', {
      userId,
      entityCount,
      durationMs: Date.now() - migrationStartTime,
    });

    return {
      status: 'migrated',
      entityCount,
      counts: {
        players: legacyData.players.length,
        games: Object.keys(legacyData.games).length,
        seasons: legacyData.seasons.length,
        tournaments: legacyData.tournaments.length,
        teams: Object.keys(legacyData.teams).length,
        personnel: Object.keys(legacyData.personnel).length,
        warmupPlan: !!legacyData.warmupPlan,
        settings: !!legacyData.settings,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[LegacyMigration] Migration failed', { userId, error: errorMessage });

    return {
      status: 'migration_error',
      error: errorMessage,
    };
  }
}

/**
 * Check if legacy migration is needed without performing it.
 *
 * Useful for UI to determine whether to show migration prompt.
 *
 * @param userId - The authenticated user's ID
 * @returns True if migration is needed (legacy data exists and user has no data)
 */
export async function isLegacyMigrationNeeded(userId: string): Promise<boolean> {
  try {
    const legacyExists = await legacyDatabaseExists();
    if (!legacyExists) {
      return false;
    }

    // Check if user already has data
    const userStore = await getDataStore(userId);
    const existingPlayers = await userStore.getPlayers();

    if (existingPlayers.length > 0) {
      return false;
    }

    // Check if legacy has content
    const legacyAdapter = await createLegacyAdapter();
    const legacyData = await readLegacyData(legacyAdapter);

    return hasLegacyContent(legacyData);
  } catch (error) {
    logger.warn('[LegacyMigration] Error checking if migration needed', error);
    return false;
  }
}

/**
 * Delete the legacy database after confirming migration success.
 *
 * IMPORTANT: Only call this after user has verified their data migrated correctly.
 * This action is irreversible.
 *
 * @returns True if deletion succeeded
 */
export async function deleteLegacyDatabase(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return false;
  }

  return new Promise((resolve) => {
    const request = window.indexedDB.deleteDatabase('MatchOpsLocal');

    request.onsuccess = () => {
      logger.info('[LegacyMigration] Legacy database deleted successfully');
      resolve(true);
    };

    request.onerror = (event) => {
      logger.error('[LegacyMigration] Failed to delete legacy database', {
        error: (event.target as IDBOpenDBRequest)?.error,
      });
      resolve(false);
    };

    request.onblocked = () => {
      logger.warn('[LegacyMigration] Legacy database deletion blocked (database in use)');
      resolve(false);
    };
  });
}
