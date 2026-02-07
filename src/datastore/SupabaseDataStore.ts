/**
 * SupabaseDataStore
 *
 * Supabase (PostgreSQL) implementation of the DataStore interface.
 * Provides cloud sync capabilities for premium users.
 *
 * Phase 4: Supabase cloud backend
 *
 * IMPORTANT: This implementation follows the exact same validation and
 * behavior patterns as LocalDataStore to ensure parity.
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md
 * @see src/datastore/LocalDataStore.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Player,
  Team,
  TeamPlayer,
  Season,
  Tournament,
  TournamentSeries,
  TeamPlacementInfo,
  PlayerStatAdjustment,
} from '@/types';
import type { AppState, SavedGamesCollection, GameEvent, Point, Opponent, TacticalDisc, IntervalLog } from '@/types/game';
import type { PlayerAssessment } from '@/types/playerAssessment';
import type { Personnel } from '@/types/personnel';
import type { WarmupPlan, WarmupPlanSection } from '@/types/warmupPlan';
import { DEFAULT_APP_SETTINGS } from '@/types/settings';
import type { AppSettings } from '@/types/settings';
import type { TimerState } from '@/utils/timerStateManager';
import type { DataStore, EntityReferences } from '@/interfaces/DataStore';
import type { Database, Json } from '@/types/supabase';
import {
  AlreadyExistsError,
  AuthError,
  ConflictError,
  NetworkError,
  NotInitializedError,
  StorageError,
  ValidationError,
} from '@/interfaces/DataStoreErrors';
import { validateGame, normalizeOptionalString } from '@/datastore/validation';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import { AGE_GROUPS } from '@/config/gameOptions';
import { generateId } from '@/utils/idGenerator';
import { normalizeName, normalizeNameForCompare } from '@/utils/normalization';
import { getClubSeasonForDate } from '@/utils/clubSeason';
import { DEFAULT_CLUB_SEASON_START_DATE, DEFAULT_CLUB_SEASON_END_DATE } from '@/config/clubSeasonDefaults';
import logger from '@/utils/logger';
import { setStorageItem, removeStorageItem, getAllStorageData } from '@/utils/storage';
import * as Sentry from '@sentry/nextjs';
import { withRetry, throwIfTransient, TransientSupabaseError, isTransientError, type RetryConfig } from '@/datastore/supabase/retry';

// Type-safe database types using the Database schema from supabase.ts
// These types provide full type safety for all database operations.
//
// Note: If Supabase project schema changes, regenerate types with:
// npx supabase gen types typescript --project-id <project-id> > src/types/supabase.ts

// Row types (data returned from SELECT queries)
type PlayerRow = Database['public']['Tables']['players']['Row'];
type TeamRow = Database['public']['Tables']['teams']['Row'];
type TeamPlayerRow = Database['public']['Tables']['team_players']['Row'];
type SeasonRow = Database['public']['Tables']['seasons']['Row'];
type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type PersonnelRow = Database['public']['Tables']['personnel']['Row'];
type UserSettingsRow = Database['public']['Tables']['user_settings']['Row'];

// Game-related row types (for PR #4 game transforms)
type GameRow = Database['public']['Tables']['games']['Row'];
type GamePlayerRow = Database['public']['Tables']['game_players']['Row'];
type GameEventRow = Database['public']['Tables']['game_events']['Row'];
type GameTacticalDataRow = Database['public']['Tables']['game_tactical_data']['Row'];
type PlayerAssessmentRow = Database['public']['Tables']['player_assessments']['Row'];
type PlayerAdjustmentRow = Database['public']['Tables']['player_adjustments']['Row'];
type WarmupPlanRow = Database['public']['Tables']['warmup_plans']['Row'];

// Insert types (data for INSERT operations)
//
// Note: `as unknown as never` casts on .insert()/.upsert() calls work around
// a Supabase codegen limitation where generated Insert types include readonly
// modifiers or Json type mismatches that prevent direct assignment. The transform
// functions produce structurally correct data; the cast bypasses the type-level
// incompatibility without affecting runtime behavior. If supabase-js or codegen
// improves, these casts can be removed.
type PlayerInsert = Database['public']['Tables']['players']['Insert'];
type TeamInsert = Database['public']['Tables']['teams']['Insert'];
type TeamPlayerInsert = Database['public']['Tables']['team_players']['Insert'];
type SeasonInsert = Database['public']['Tables']['seasons']['Insert'];
type TournamentInsert = Database['public']['Tables']['tournaments']['Insert'];
type PersonnelInsert = Database['public']['Tables']['personnel']['Insert'];
type UserSettingsInsert = Database['public']['Tables']['user_settings']['Insert'];
type GameInsert = Database['public']['Tables']['games']['Insert'];
type GamePlayerInsert = Database['public']['Tables']['game_players']['Insert'];
type GameEventInsert = Database['public']['Tables']['game_events']['Insert'];
type GameTacticalDataInsert = Database['public']['Tables']['game_tactical_data']['Insert'];
type PlayerAssessmentInsert = Database['public']['Tables']['player_assessments']['Insert'];
type PlayerAdjustmentInsert = Database['public']['Tables']['player_adjustments']['Insert'];
type WarmupPlanInsert = Database['public']['Tables']['warmup_plans']['Insert'];

// Update types (for UPDATE operations without any casts)
type PlayerUpdate = Database['public']['Tables']['players']['Update'];
type TeamUpdate = Database['public']['Tables']['teams']['Update'];
type SeasonUpdate = Database['public']['Tables']['seasons']['Update'];
type TournamentUpdate = Database['public']['Tables']['tournaments']['Update'];
type PersonnelUpdate = Database['public']['Tables']['personnel']['Update'];

/**
 * GameTableSet - Container for all 5 tables of game data.
 *
 * Used by game transforms to hold the decomposed game data before/after
 * database operations. The relationship is:
 * - 1 game row
 * - N game_players rows (availablePlayers with on_field/is_selected flags)
 * - M game_events rows (ordered by order_index)
 * - K player_assessments rows (one per assessed player)
 * - 1 game_tactical_data row (JSONB fields for tactical data)
 */
interface GameTableSet {
  game: GameInsert;
  players: GamePlayerInsert[];
  events: GameEventInsert[];
  assessments: PlayerAssessmentInsert[];
  tacticalData: GameTacticalDataInsert;
}

/**
 * GameTableSetRow - Container for loaded game data from database.
 *
 * Similar to GameTableSet but uses Row types (data from SELECT queries)
 * instead of Insert types (data for INSERT operations).
 */
interface GameTableSetRow {
  game: GameRow;
  players: GamePlayerRow[];
  events: GameEventRow[];
  assessments: PlayerAssessmentRow[];
  tacticalData: GameTacticalDataRow | null;
}

/**
 * Default field position for players (center of field).
 * Used when player position data is missing or undefined.
 */
const DEFAULT_FIELD_POSITION = { relX: 0.5, relY: 0.5 } as const;

/**
 * Normalize enum-like values to allowed set; returns null for invalid or empty.
 */
const normalizeEnumValue = <T extends string>(value: unknown, allowed: readonly T[]): T | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return (allowed as readonly string[]).includes(trimmed) ? (trimmed as T) : null;
};

const normalizeGameType = (value: unknown): 'soccer' | 'futsal' | null =>
  normalizeEnumValue(value, ['soccer', 'futsal']);

const normalizeGender = (value: unknown): 'boys' | 'girls' | null =>
  normalizeEnumValue(value, ['boys', 'girls']);

const normalizeGameStatus = (value: unknown): AppState['gameStatus'] | null =>
  normalizeEnumValue(value, ['notStarted', 'inProgress', 'periodEnd', 'gameEnd']);

const normalizeGameHomeOrAway = (value: unknown): 'home' | 'away' | null =>
  normalizeEnumValue(value, ['home', 'away']);

const normalizeAdjustmentHomeOrAway = (value: unknown): 'home' | 'away' | 'neutral' | null =>
  normalizeEnumValue(value, ['home', 'away', 'neutral']);

const normalizePeriodCount = (value: unknown): 1 | 2 | null =>
  value === 1 || value === 2 ? value : null;

const normalizePositiveNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
};

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

const normalizeDateArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((item) => normalizeDateString(item))
    .filter((item): item is string => typeof item === 'string');
  return normalized.length > 0 ? normalized : null;
};

const normalizeTeamPlacements = (value?: Record<string, TeamPlacementInfo>): Json | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as unknown as Json;
};

const parseTeamPlacements = (value: Json | null): Record<string, TeamPlacementInfo> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as unknown as Record<string, TeamPlacementInfo>;
  return Object.keys(record).length > 0 ? record : undefined;
};

/**
 * Normalize a numeric rating to the DB constraint range (1-10).
 * Returns null for invalid/unknown values to avoid constraint violations.
 * Used in forward transform (App → DB).
 */
const normalizeRating = (value?: number | null): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 1 || value > 10) return null;
  return value;
};

/**
 * Normalize a numeric rating from DB, clamping to valid range with default fallback.
 * Used in reverse transform (DB → App) to handle potentially corrupted data.
 */
const normalizeRatingFromDb = (value: number | null | undefined, defaultValue: number = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultValue;
  // Clamp to valid range if out of bounds (defensive against DB corruption)
  if (value < 1) return defaultValue;
  if (value > 10) return 10;
  return value;
};

/**
 * Normalize demand factor to the DB constraint range (0.1-10).
 * Returns null for invalid/unknown values to avoid constraint violations.
 */
const normalizeDemandFactor = (value?: number | null): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0.1 || value > 10) return null;
  return value;
};

const VALID_GAME_EVENT_TYPES = new Set<GameEvent['type']>([
  'goal',
  'opponentGoal',
  'substitution',
  'periodEnd',
  'gameEnd',
  'fairPlayCard',
]);

/**
 * Calculate club season from a date string.
 */
const calculateClubSeason = (
  gameDate?: string,
  seasonStartDate?: string,
  seasonEndDate?: string
): string | undefined => {
  if (!gameDate) return undefined;
  return getClubSeasonForDate(
    gameDate,
    seasonStartDate ?? DEFAULT_APP_SETTINGS.clubSeasonStartDate!,
    seasonEndDate ?? DEFAULT_APP_SETTINGS.clubSeasonEndDate!
  );
};

/**
 * Composite key for team uniqueness (matches LocalDataStore).
 *
 * IMPORTANT: Only the name is normalized (case-insensitive comparison).
 * IDs (boundSeasonId, boundTournamentId, etc.) are NOT normalized because:
 * - All IDs are system-generated UUIDs (always lowercase)
 * - User-provided IDs go through validation before storage
 * - If ID casing were inconsistent, it would indicate data corruption
 *
 * If duplicate teams are created due to ID casing issues, investigate
 * the source of the inconsistent IDs rather than adding normalization here.
 */
const createTeamCompositeKey = (
  name: string,
  boundSeasonId?: string,
  boundTournamentId?: string,
  boundTournamentSeriesId?: string,
  gameType?: string
): string => {
  // Always include all fields to match DB COALESCE behavior
  // Empty string '' used for missing values (matches DB COALESCE default)
  const parts = [
    normalizeNameForCompare(name),
    `season:${boundSeasonId ?? ''}`,
    `tournament:${boundTournamentId ?? ''}`,
    `series:${boundTournamentSeriesId ?? ''}`,
    `type:${gameType ?? ''}`,
  ];
  return parts.join('::');
};

/**
 * Composite key for season uniqueness (matches LocalDataStore).
 */
const createSeasonCompositeKey = (
  name: string,
  clubSeason?: string,
  gameType?: string,
  gender?: string,
  ageGroup?: string,
  leagueId?: string
): string => {
  // Always include all fields to match DB COALESCE behavior
  // Empty string '' used for missing values (matches DB COALESCE default)
  const parts = [
    normalizeNameForCompare(name),
    `clubSeason:${clubSeason ?? ''}`,
    `gameType:${gameType ?? ''}`,
    `gender:${gender ?? ''}`,
    `ageGroup:${ageGroup ?? ''}`,
    `leagueId:${leagueId ?? ''}`,
  ];
  return parts.join('::');
};

/**
 * Composite key for tournament uniqueness (matches LocalDataStore).
 */
const createTournamentCompositeKey = (
  name: string,
  clubSeason?: string,
  gameType?: string,
  gender?: string,
  ageGroup?: string
): string => {
  // Always include all fields to match DB COALESCE behavior
  // Empty string '' used for missing values (matches DB COALESCE default)
  const parts = [
    normalizeNameForCompare(name),
    `clubSeason:${clubSeason ?? ''}`,
    `gameType:${gameType ?? ''}`,
    `gender:${gender ?? ''}`,
    `ageGroup:${ageGroup ?? ''}`,
  ];
  return parts.join('::');
};

/**
 * Migrate tournament level to series (matches LocalDataStore).
 */
const migrateTournamentLevel = (tournament: Tournament): Tournament => {
  if (tournament.series && tournament.series.length > 0) {
    return tournament;
  }

  if (tournament.level) {
    const newSeries: TournamentSeries = {
      id: `series_${tournament.id}_${tournament.level.toLowerCase().replace(/\s+/g, '-')}`,
      level: tournament.level,
    };
    return { ...tournament, series: [newSeries] };
  }

  return tournament;
};

/**
 * Check if the browser is online.
 */
const checkOnline = (): void => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new NetworkError('Cannot perform operation while offline. Please check your connection.');
  }
};

/**
 * SupabaseDataStore - Cloud backend implementation.
 *
 * IMPORTANT: PR #3 implements core CRUD methods (players, teams, seasons,
 * tournaments, personnel, settings). Game methods are added in PR #4.
 */
export class SupabaseDataStore implements DataStore {
  private supabase: SupabaseClient<Database> | null = null;
  private initialized = false;
  private seasonDatesCache: { start: string; end: string } | null = null;
  private cachedUserId: string | null = null;
  private cachedUserIdTimestamp: number = 0;
  // Cache TTL: 5 minutes - after this, re-validate session with server
  private static readonly USER_ID_CACHE_TTL_MS = 5 * 60 * 1000;
  // Promise deduplication for getUserId() to prevent race conditions
  private userIdPromise: Promise<string> | null = null;
  // Promise deduplication for initialize() to prevent race conditions
  private initPromise: Promise<void> | null = null;
  // Version cache for optimistic locking (Issue #330)
  // Maps game ID -> current version number
  //
  // Lifecycle:
  //   - Populated: getGameById(), getGames() on load; saveGame() updates with new version
  //   - Used: saveGame() passes cached version as p_expected_version
  //   - Invalidated: deleteGame(), clearUserCaches(), conflict error, invalid version from RPC
  //   - Scoped: Per DataStore instance (effectively per user session)
  //
  // Multi-tab/device behavior:
  //   1. Tab A loads game (caches version 1)
  //   2. Tab B saves game (version becomes 2 in database)
  //   3. Tab A saves game (passes version 1, database has 2 → ConflictError)
  //   4. Tab A's cache is cleared on conflict
  //   5. Tab A must refresh to load version 2, then can save again
  //
  // After conflict, the cache is cleared so next save passes null (skips version check).
  // This is acceptable because user must refresh to see latest changes anyway.
  private gameVersionCache: Map<string, number> = new Map();

  // Retry configuration for transient network errors
  // Improves resilience on mobile devices with flaky connections
  private static readonly RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    logRetries: true,
  };

  // ==========================================================================
  // VERSION CACHE HELPERS (Issue #330: Optimistic Locking)
  // ==========================================================================

  /**
   * Cache a game's version for optimistic locking.
   * Called after loading games (getGames, getGameById) to track current versions.
   *
   * @param gameId - The game ID
   * @param version - The version from the database (should always be number per schema)
   *
   * RESILIENCE: Games with null/invalid versions are loaded with default version 1.
   * This allows users to access their data even if migration didn't backfill properly.
   * The next save will properly set the version via save_game_with_relations RPC.
   */
  private cacheGameVersion(gameId: string, version: number | null | undefined): void {
    if (typeof version === 'number') {
      this.gameVersionCache.set(gameId, version);
    } else {
      // Non-numeric version indicates migration didn't backfill properly or data corruption.
      // RESILIENCE: Default to version 1 to allow game loading. User can still access their data.
      // The next save will properly set version via save_game_with_relations RPC.
      const errorMsg = `Game ${gameId} has invalid version (${typeof version}: ${version}). Defaulting to version 1.`;
      logger.warn('[SupabaseDataStore] ' + errorMsg);
      // Track in Sentry at error level so we can monitor affected games
      try {
        Sentry.captureMessage('Game loaded with non-numeric version - defaulting to 1', {
          level: 'error',
          tags: { component: 'SupabaseDataStore', action: 'cacheGameVersion', versionFallback: 'true' },
          extra: { gameId, version, versionType: typeof version },
        });
      } catch {
        // Sentry failure must not prevent game loading
      }
      // Default to version 1 - allows game to load, next save will fix version
      this.gameVersionCache.set(gameId, 1);
    }
  }

  // ==========================================================================
  // ERROR CLASSIFICATION HELPERS
  // ==========================================================================

  /**
   * Classify a Supabase error and throw the appropriate error type.
   * Distinguishes auth errors, validation errors, and network errors for proper handling.
   *
   * Classification priority:
   * 1. Auth errors (401/403, JWT, RLS) → AuthError (triggers re-auth flow)
   * 2. Constraint violations (unique, FK, check) → ValidationError/AlreadyExistsError
   * 3. All others → NetworkError (default fallback)
   *
   * @param error - The error object from Supabase
   * @param context - Description of the operation for error messages
   */
  private classifyAndThrowError(
    error: { message: string; code?: string; status?: number },
    context: string
  ): never {
    const message = (error.message ?? '').toLowerCase();
    const code = (error.code ?? '').toUpperCase();
    const status = error.status;

    // 1. Auth/authorization errors - throw AuthError
    const isAuthError =
      // HTTP status codes (most reliable)
      status === 401 ||
      status === 403 ||
      // PostgreSQL permission errors
      code === '42501' || // insufficient_privilege
      code === '28000' || // invalid_authorization_specification
      code === '28P01' || // invalid_password
      // Specific RLS/auth PGRST codes (not all PGRST are auth errors)
      code === 'PGRST301' || // insufficient_permission (RLS violation)
      code === 'PGRST302' || // jwt_claims_invalid
      // JWT/token issues (specific patterns to avoid false positives)
      message.includes('jwt expired') ||
      message.includes('token expired') ||
      message.includes('session expired') ||
      (message.includes('jwt') && (message.includes('invalid') || message.includes('malformed'))) ||
      message.includes('invalid claim') ||
      message.includes('refresh_token') ||
      // User/session issues
      message.includes('user not found') ||
      message.includes('not authenticated') ||
      (message.includes('session') && message.includes('invalid'));

    if (isAuthError) {
      throw new AuthError(`${context}: ${error.message}`, undefined, {
        code: code as import('@/interfaces/AuthTypes').AuthErrorCode,
        message: error.message ?? 'Authentication error',
        status,
      });
    }

    // 2. Database constraint violations - throw ValidationError or AlreadyExistsError
    const isUniqueViolation = code === '23505'; // unique_violation
    if (isUniqueViolation) {
      throw new AlreadyExistsError('Resource', context);
    }

    const isConstraintError =
      code === '23503' || // foreign_key_violation
      code === '23514' || // check_violation
      code.startsWith('22');  // data exception class (invalid input)

    if (isConstraintError) {
      throw new ValidationError(`${context}: ${error.message}`);
    }

    // 3. Distinguish between server errors and network/connectivity errors
    // Log unclassified errors to Sentry for visibility
    try {
      Sentry.addBreadcrumb({
        category: 'error.unclassified',
        message: `Unclassified Supabase error: ${message}`,
        level: 'warning',
        data: { code, status, originalMessage: error.message },
      });
    } catch {
      /* monitoring must never crash the app */
    }

    // Server-side errors (5xx, PostgreSQL internal errors) → StorageError
    // These indicate a problem on the server, not a client connectivity issue
    const isServerError =
      (status !== undefined && status >= 500) ||
      code.startsWith('XX') ||  // internal_error class
      code.startsWith('53') ||  // insufficient_resources class
      code.startsWith('54') ||  // program_limit_exceeded class
      code.startsWith('57') ||  // operator_intervention class
      code === 'PGRST000';      // PostgREST connection error

    if (isServerError) {
      throw new StorageError(`${context}: ${error.message}`);
    }

    // Default: true network/connectivity issues
    throw new NetworkError(`${context}: ${error.message}`, status);
  }

  // ==========================================================================
  // RETRY HELPERS
  // ==========================================================================

  /**
   * Execute a database operation with retry logic for transient errors.
   *
   * Use this for all network-sensitive operations (queries, inserts, updates).
   * Non-transient errors (validation, auth, not found) are thrown immediately.
   *
   * @param operation - Async function to execute
   * @param operationName - Optional name for logging purposes
   * @returns Result of the operation
   */
  private async withRetry<T>(operation: () => Promise<T>, operationName?: string): Promise<T> {
    try {
      return await withRetry(operation, { ...SupabaseDataStore.RETRY_CONFIG, operationName });
    } catch (error) {
      // Convert exhausted transient errors to NetworkError for consistent error handling
      if (error instanceof TransientSupabaseError) {
        throw new NetworkError(`Network error after retries: ${error.message}`);
      }
      throw error;
    }
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async initialize(): Promise<void> {
    // Promise deduplication FIRST: if initialization is already in progress, wait for it
    // This check must come before the initialized check to prevent race conditions
    // where two calls both pass the initialized check before either sets initPromise
    if (this.initPromise) {
      return this.initPromise;
    }

    // Return immediately if already initialized
    if (this.initialized) {
      return;
    }

    // Create and cache the initialization promise
    this.initPromise = (async () => {
      try {
        // Lazy load supabase client to avoid bundling in local mode
        const { getSupabaseClient } = await import('@/datastore/supabase');
        this.supabase = getSupabaseClient();
        this.initialized = true;
        logger.info('[SupabaseDataStore] Initialized');
      } catch (error) {
        // Log initialization failures for debugging before re-throwing
        logger.error('[SupabaseDataStore] Initialization failed:', error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        // Clear the promise when done (success or failure)
        // This allows retry on next call if initialization failed
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    this.initialized = false;
    this.seasonDatesCache = null;
    this.cachedUserId = null;
    this.cachedUserIdTimestamp = 0;
    // Note: Supabase client is a singleton, don't close it
    logger.info('[SupabaseDataStore] Closed');
  }

  getBackendName(): string {
    return 'supabase';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.initialized || !this.supabase) {
      logger.debug('[SupabaseDataStore] isAvailable: false (not initialized)');
      return false;
    }

    // Quick health check using auth session (faster than table query, doesn't depend on RLS)
    try {
      const { error } = await this.supabase.auth.getSession();
      const available = !error;
      logger.debug(`[SupabaseDataStore] isAvailable: ${available}${error ? ` (error: ${error.message})` : ''}`);
      return available;
    } catch (err) {
      // Exceptions during availability check are unusual and indicate potential SDK/config issues
      logger.error(`[SupabaseDataStore] isAvailable check threw exception - cloud features may not work:`, err);
      // Track in Sentry - SDK exceptions could indicate configuration or network issues
      // Wrap in try/catch - Sentry failure must not break availability check
      try {
        Sentry.captureException(err, {
          tags: { component: 'SupabaseDataStore', action: 'isAvailable' },
          level: 'error',
          extra: { initialized: this.initialized, hasClient: !!this.supabase },
        });
      } catch {
        // Sentry failure is acceptable
      }
      return false;
    }
  }

  isInitialized(): boolean {
    return this.initialized && this.supabase !== null;
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.supabase) {
      throw new NotInitializedError();
    }
  }

  private getClient(): SupabaseClient<Database> {
    this.ensureInitialized();
    return this.supabase!;
  }

  /**
   * Get the current authenticated user ID.
   * Throws AuthError if no user is authenticated.
   *
   * Uses promise deduplication to prevent race conditions when multiple
   * concurrent operations call getUserId() simultaneously.
   */
  private async getUserId(): Promise<string> {
    const now = Date.now();

    // Return cached value if available AND not expired
    if (this.cachedUserId && (now - this.cachedUserIdTimestamp) < SupabaseDataStore.USER_ID_CACHE_TTL_MS) {
      return this.cachedUserId;
    }

    // Promise deduplication: if a getUserId() call is in progress, wait for it
    if (this.userIdPromise) {
      return this.userIdPromise;
    }

    // Create and cache the promise
    this.userIdPromise = (async () => {
      try {
        // If cache is expired, use getUser() to validate with server
        // This catches revoked sessions (admin sign-out, password change, etc.)
        const cacheExpired = this.cachedUserId && (now - this.cachedUserIdTimestamp) >= SupabaseDataStore.USER_ID_CACHE_TTL_MS;

        if (cacheExpired) {
          // Re-validate with server using getUser() - this makes a network call
          const { data: { user }, error } = await this.getClient().auth.getUser();
          if (error || !user) {
            // Session was revoked - clear cache and throw
            this.cachedUserId = null;
            this.cachedUserIdTimestamp = 0;
            throw new AuthError('Session expired. Please sign in again.');
          }
          this.cachedUserId = user.id;
          this.cachedUserIdTimestamp = Date.now();
          return user.id;
        }

        // Fresh login or first call: use getSession() to avoid network request.
        // getSession() reads from local storage/memory, which is much faster
        // and more reliable immediately after sign-in. The session was already
        // verified during signIn(), so we can trust it for immediate operations.
        // This fixes the race condition where queries fail with "Failed to fetch"
        // because getUser() makes a network call that can fail transiently.
        const { data: { session }, error } = await this.getClient().auth.getSession();
        if (error || !session?.user) {
          throw new AuthError('Not authenticated. Please sign in to use cloud mode.');
        }

        this.cachedUserId = session.user.id;
        this.cachedUserIdTimestamp = Date.now();
        return session.user.id;
      } finally {
        // Clear the promise when done (success or failure)
        this.userIdPromise = null;
      }
    })();

    return this.userIdPromise;
  }

  /**
   * Get cached season dates or load from settings.
   */
  private async getSeasonDates(): Promise<{ start: string; end: string }> {
    if (this.seasonDatesCache) {
      return this.seasonDatesCache;
    }

    const settings = await this.getSettings();
    this.seasonDatesCache = {
      start: settings.clubSeasonStartDate ?? DEFAULT_APP_SETTINGS.clubSeasonStartDate!,
      end: settings.clubSeasonEndDate ?? DEFAULT_APP_SETTINGS.clubSeasonEndDate!,
    };
    return this.seasonDatesCache;
  }

  /**
   * Invalidate settings cache.
   */
  public invalidateSettingsCache(): void {
    this.seasonDatesCache = null;
  }

  /**
   * Clear all user-specific caches.
   * Called when auth state changes (user sign out / sign in).
   */
  public clearUserCaches(): void {
    this.seasonDatesCache = null;
    this.cachedUserId = null;
    this.cachedUserIdTimestamp = 0;
    this.gameVersionCache.clear();
    logger.debug('[SupabaseDataStore] User caches cleared (including game version cache)');
  }

  // ==========================================================================
  // PLAYERS
  // ==========================================================================

  async getPlayers(): Promise<Player[]> {
    this.ensureInitialized();
    checkOnline();

    const result = await this.withRetry(async () => {
      return throwIfTransient(
        await this.getClient()
          .from('players')
          .select('*')
          .order('created_at', { ascending: false })
      );
    }, 'getPlayers');

    if (result.error) {
      this.classifyAndThrowError(result.error, 'Failed to fetch players');
    }

    return (result.data || []).map(this.transformPlayerFromDb);
  }

  async createPlayer(player: Omit<Player, 'id'>): Promise<Player> {
    this.ensureInitialized();
    checkOnline();

    const trimmedName = player.name?.trim();
    if (!trimmedName) {
      throw new ValidationError('Player name cannot be empty', 'name', player.name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.PLAYER_NAME_MAX) {
      throw new ValidationError(
        `Player name cannot exceed ${VALIDATION_LIMITS.PLAYER_NAME_MAX} characters (got ${trimmedName.length})`,
        'name',
        player.name
      );
    }

    const now = new Date().toISOString();
    const newPlayer: Player = {
      ...player,
      id: generateId('player'),
      name: trimmedName,
      nickname: player.nickname?.trim() || undefined,
      isGoalie: player.isGoalie ?? false,
      receivedFairPlayCard: player.receivedFairPlayCard ?? false,
    };

    const userId = await this.getUserId();
    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('players')
        .insert(this.transformPlayerToDb(newPlayer, now, userId) as unknown as never);
      throwIfTransient(result);
      return result;
    }, 'createPlayer');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to create player');
    }

    return newPlayer;
  }

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player | null> {
    this.ensureInitialized();
    checkOnline();

    if (updates.name !== undefined) {
      const trimmedName = updates.name.trim();
      if (!trimmedName) {
        throw new ValidationError('Player name cannot be empty', 'name', updates.name);
      }
      if (trimmedName.length > VALIDATION_LIMITS.PLAYER_NAME_MAX) {
        throw new ValidationError(
          `Player name cannot exceed ${VALIDATION_LIMITS.PLAYER_NAME_MAX} characters (got ${trimmedName.length})`,
          'name',
          updates.name
        );
      }
      updates.name = trimmedName;
    }

    if (updates.nickname !== undefined) {
      const trimmed = updates.nickname.trim();
      updates.nickname = trimmed || undefined;
    }

    const userId = await this.getUserId();
    const { data: existing, error: fetchError } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('players')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();
      if (result.error && result.error.code !== 'PGRST116') {
        throwIfTransient(result);
      }
      return result;
    }, 'updatePlayer-fetch');

    // PGRST116 = row not found - return null
    // Other errors should be classified appropriately
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return null;
      }
      this.classifyAndThrowError(fetchError, 'Failed to fetch player');
    }

    if (!existing) {
      return null;
    }

    const updatedPlayer = { ...this.transformPlayerFromDb(existing), ...updates };
    const now = new Date().toISOString();

    const updatePayload: PlayerUpdate = {
      name: updatedPlayer.name,
      nickname: updatedPlayer.nickname ?? null,
      jersey_number: updatedPlayer.jerseyNumber ?? null,
      is_goalie: updatedPlayer.isGoalie ?? false,
      color: updatedPlayer.color ?? null,
      notes: updatedPlayer.notes ?? null,
      received_fair_play_card: updatedPlayer.receivedFairPlayCard ?? false,
      updated_at: now,
    };

    const { error: updateError } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('players')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', userId);
      throwIfTransient(result);
      return result;
    }, 'updatePlayer');

    if (updateError) {
      this.classifyAndThrowError(updateError, 'Failed to update player');
    }

    return updatedPlayer;
  }

  async deletePlayer(id: string): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    const userId = await this.getUserId();
    const { error, count } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('players')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('user_id', userId);
      throwIfTransient(result);
      return result;
    }, 'deletePlayer');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to delete player');
    }

    return (count ?? 0) > 0;
  }

  // Player transform helpers
  private transformPlayerFromDb(row: PlayerRow): Player {
    return {
      id: row.id,
      name: row.name,
      nickname: row.nickname ?? undefined,
      jerseyNumber: row.jersey_number ?? undefined,
      isGoalie: row.is_goalie ?? false,
      color: row.color ?? undefined,
      notes: row.notes ?? undefined,
      receivedFairPlayCard: row.received_fair_play_card ?? false,
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
    };
  }

  private transformPlayerToDb(player: Player, now: string, userId: string): PlayerInsert {
    return {
      id: player.id,
      user_id: userId,
      name: player.name,
      nickname: player.nickname ?? null,
      jersey_number: player.jerseyNumber ?? null,
      is_goalie: player.isGoalie ?? false,
      color: player.color ?? null,
      notes: player.notes ?? null,
      received_fair_play_card: player.receivedFairPlayCard ?? false,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Upsert a player - inserts if not exists, updates if exists.
   * Preserves the original ID (critical for migration).
   *
   * @param player - Complete player object WITH id
   * @returns The upserted player
   */
  async upsertPlayer(player: Player): Promise<Player> {
    this.ensureInitialized();
    checkOnline();

    const trimmedName = player.name?.trim();
    if (!trimmedName) {
      throw new ValidationError('Player name cannot be empty', 'name', player.name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.PLAYER_NAME_MAX) {
      throw new ValidationError(
        `Player name cannot exceed ${VALIDATION_LIMITS.PLAYER_NAME_MAX} characters`,
        'name',
        player.name
      );
    }

    const now = new Date().toISOString();
    const userId = await this.getUserId();
    const playerToUpsert: Player = {
      ...player,
      name: trimmedName,
      nickname: player.nickname?.trim() || undefined,
      isGoalie: player.isGoalie ?? false,
      receivedFairPlayCard: player.receivedFairPlayCard ?? false,
    };

    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('players')
        .upsert(this.transformPlayerToDb(playerToUpsert, now, userId) as unknown as never, {
          onConflict: 'user_id,id',
        });
      throwIfTransient(result);
      return result;
    }, 'upsertPlayer');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to upsert player');
    }

    return playerToUpsert;
  }

  // ==========================================================================
  // TEAMS
  // ==========================================================================

  async getTeams(includeArchived = false): Promise<Team[]> {
    this.ensureInitialized();
    checkOnline();

    const result = await this.withRetry(async () => {
      let query = this.getClient().from('teams').select('*');
      if (!includeArchived) {
        query = query.eq('archived', false);
      }
      return throwIfTransient(await query.order('created_at', { ascending: false }));
    }, 'getTeams');

    if (result.error) {
      this.classifyAndThrowError(result.error, 'Failed to load teams');
    }

    return (result.data || []).map(this.transformTeamFromDb);
  }

  async getTeamById(id: string): Promise<Team | null> {
    this.ensureInitialized();
    checkOnline();

    // Use withRetry for transient network error resilience (matches getPersonnelById pattern)
    // Note: PGRST116 (no row found) is not transient and handled below
    const { data, error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('teams')
        .select('*')
        .eq('id', id)
        .single();
      // Only throw if it's a transient error (for retry)
      // PGRST116 (not found) is expected and should not be retried
      if (result.error && result.error.code !== 'PGRST116') {
        throwIfTransient(result);
      }
      return result;
    }, 'getTeamById');

    // PGRST116 = row not found - return null
    // Other errors should be classified appropriately
    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      this.classifyAndThrowError(error, 'Failed to fetch team');
    }

    if (!data) {
      return null;
    }

    return this.transformTeamFromDb(data);
  }

  async createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team> {
    this.ensureInitialized();
    checkOnline();

    const trimmedName = normalizeName(team.name);
    if (!trimmedName) {
      throw new ValidationError('Team name cannot be empty', 'name', team.name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.TEAM_NAME_MAX) {
      throw new ValidationError(
        `Team name cannot exceed ${VALIDATION_LIMITS.TEAM_NAME_MAX} characters (got ${trimmedName.length})`,
        'name',
        team.name
      );
    }

    const normalizedAgeGroup = normalizeOptionalString(team.ageGroup);
    if (normalizedAgeGroup && !AGE_GROUPS.includes(normalizedAgeGroup)) {
      throw new ValidationError('Invalid age group', 'ageGroup', team.ageGroup);
    }

    const normalizedNotes = normalizeOptionalString(team.notes);
    if (normalizedNotes && normalizedNotes.length > VALIDATION_LIMITS.TEAM_NOTES_MAX) {
      throw new ValidationError(
        `Team notes cannot exceed ${VALIDATION_LIMITS.TEAM_NOTES_MAX} characters (got ${normalizedNotes.length})`,
        'notes',
        team.notes
      );
    }

    // Validate series binding requires tournament binding
    if (team.boundTournamentSeriesId && !team.boundTournamentId) {
      throw new ValidationError(
        'Cannot bind to tournament series without binding to tournament',
        'boundTournamentSeriesId',
        team.boundTournamentSeriesId
      );
    }

    // Check composite uniqueness (app-level validation per implementation guide Rule #6)
    const existingTeams = await this.getTeams(true);
    const compositeKey = createTeamCompositeKey(
      trimmedName,
      team.boundSeasonId,
      team.boundTournamentId,
      team.boundTournamentSeriesId,
      team.gameType
    );

    const duplicateExists = existingTeams.some(
      (existing) =>
        createTeamCompositeKey(
          existing.name,
          existing.boundSeasonId,
          existing.boundTournamentId,
          existing.boundTournamentSeriesId,
          existing.gameType
        ) === compositeKey
    );

    if (duplicateExists) {
      throw new AlreadyExistsError('team', trimmedName);
    }

    const now = new Date().toISOString();
    const newTeam: Team = {
      id: generateId('team'),
      name: trimmedName,
      boundSeasonId: team.boundSeasonId,
      boundTournamentId: team.boundTournamentId,
      boundTournamentSeriesId: team.boundTournamentSeriesId,
      gameType: team.gameType,
      color: team.color,
      ageGroup: normalizedAgeGroup,
      notes: normalizedNotes,
      archived: team.archived ?? false,
      createdAt: now,
      updatedAt: now,
    };

    const userId = await this.getUserId();
    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('teams')
        .insert(this.transformTeamToDb(newTeam, userId) as unknown as never);
      throwIfTransient(result);
      return result;
    }, 'createTeam');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to create team');
    }

    return newTeam;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | null> {
    this.ensureInitialized();
    checkOnline();

    if (updates.name !== undefined) {
      const trimmedName = normalizeName(updates.name);
      if (!trimmedName) {
        throw new ValidationError('Team name cannot be empty', 'name', updates.name);
      }
      if (trimmedName.length > VALIDATION_LIMITS.TEAM_NAME_MAX) {
        throw new ValidationError(
          `Team name cannot exceed ${VALIDATION_LIMITS.TEAM_NAME_MAX} characters (got ${trimmedName.length})`,
          'name',
          updates.name
        );
      }
      updates.name = trimmedName;
    }

    if (updates.notes !== undefined) {
      const normalizedNotes = normalizeOptionalString(updates.notes);
      if (normalizedNotes && normalizedNotes.length > VALIDATION_LIMITS.TEAM_NOTES_MAX) {
        throw new ValidationError(
          `Team notes cannot exceed ${VALIDATION_LIMITS.TEAM_NOTES_MAX} characters (got ${normalizedNotes.length})`,
          'notes',
          updates.notes
        );
      }
      updates.notes = normalizedNotes;
    }

    if (updates.ageGroup !== undefined) {
      const normalizedAgeGroup = normalizeOptionalString(updates.ageGroup);
      if (normalizedAgeGroup && !AGE_GROUPS.includes(normalizedAgeGroup)) {
        throw new ValidationError('Invalid age group', 'ageGroup', updates.ageGroup);
      }
      updates.ageGroup = normalizedAgeGroup;
    }

    const existing = await this.getTeamById(id);
    if (!existing) {
      return null;
    }

    // Check composite uniqueness for the updated state
    const finalName = updates.name || existing.name;
    const finalSeasonId = 'boundSeasonId' in updates ? updates.boundSeasonId : existing.boundSeasonId;
    const finalTournamentId = 'boundTournamentId' in updates ? updates.boundTournamentId : existing.boundTournamentId;
    const finalSeriesId = 'boundTournamentSeriesId' in updates ? updates.boundTournamentSeriesId : existing.boundTournamentSeriesId;
    const finalGameType = 'gameType' in updates ? updates.gameType : existing.gameType;

    // Validate series binding requires tournament binding
    if (finalSeriesId && !finalTournamentId) {
      throw new ValidationError(
        'Cannot bind to tournament series without binding to tournament',
        'boundTournamentSeriesId',
        finalSeriesId
      );
    }

    const existingTeams = await this.getTeams(true);
    const compositeKey = createTeamCompositeKey(finalName, finalSeasonId, finalTournamentId, finalSeriesId, finalGameType);

    const duplicateExists = existingTeams.some(
      (team) =>
        team.id !== id &&
        createTeamCompositeKey(
          team.name,
          team.boundSeasonId,
          team.boundTournamentId,
          team.boundTournamentSeriesId,
          team.gameType
        ) === compositeKey
    );

    if (duplicateExists) {
      throw new AlreadyExistsError('team', finalName);
    }

    const updatedTeam: Team = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const updatePayload: TeamUpdate = {
      name: updatedTeam.name,
      color: updatedTeam.color ?? null,
      notes: updatedTeam.notes ?? null,
      age_group: updatedTeam.ageGroup ?? null,
      game_type: normalizeGameType(updatedTeam.gameType),
      archived: updatedTeam.archived ?? false,
      bound_season_id: updatedTeam.boundSeasonId ?? null,
      bound_tournament_id: updatedTeam.boundTournamentId ?? null,
      bound_tournament_series_id: updatedTeam.boundTournamentSeriesId ?? null,
      updated_at: updatedTeam.updatedAt,
    };

    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('teams')
        .update(updatePayload)
        .eq('id', id);
      throwIfTransient(result);
      return result;
    }, 'updateTeam');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to update team');
    }

    return updatedTeam;
  }

  async deleteTeam(id: string): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    const userId = await this.getUserId();
    const { error, count } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('teams')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('user_id', userId);
      throwIfTransient(result);
      return result;
    }, 'deleteTeam');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to delete team');
    }

    return (count ?? 0) > 0;
  }

  // Team transform helpers
  private transformTeamFromDb(row: TeamRow): Team {
    return {
      id: row.id,
      name: row.name,
      color: row.color ?? undefined,
      notes: row.notes ?? undefined,
      ageGroup: row.age_group ?? undefined,
      gameType: normalizeGameType(row.game_type) ?? undefined,
      archived: row.archived ?? false,
      boundSeasonId: row.bound_season_id ?? undefined,
      boundTournamentId: row.bound_tournament_id ?? undefined,
      boundTournamentSeriesId: row.bound_tournament_series_id ?? undefined,
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? new Date().toISOString(),
    };
  }

  private transformTeamToDb(team: Team, userId: string): TeamInsert {
    return {
      id: team.id,
      user_id: userId,
      name: team.name,
      color: team.color ?? null,
      notes: team.notes ?? null,
      age_group: team.ageGroup ?? null,
      game_type: normalizeGameType(team.gameType),
      archived: team.archived ?? false,
      bound_season_id: team.boundSeasonId ?? null,
      bound_tournament_id: team.boundTournamentId ?? null,
      bound_tournament_series_id: team.boundTournamentSeriesId ?? null,
      created_at: team.createdAt,
      updated_at: team.updatedAt,
    };
  }

  /**
   * Upsert a team - inserts if not exists, updates if exists.
   * Preserves the original ID (critical for migration).
   *
   * Note: Composite uniqueness checks (Rule 6) are intentionally skipped here.
   * Upsert is used during migration where data is pre-validated by the source DataStore.
   * For new team creation, use createTeam() which enforces composite uniqueness.
   *
   * @param team - Complete team object WITH id
   * @returns The upserted team
   */
  async upsertTeam(team: Team): Promise<Team> {
    this.ensureInitialized();
    checkOnline();

    const trimmedName = normalizeName(team.name);
    if (!trimmedName) {
      throw new ValidationError('Team name cannot be empty', 'name', team.name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.TEAM_NAME_MAX) {
      throw new ValidationError(
        `Team name cannot exceed ${VALIDATION_LIMITS.TEAM_NAME_MAX} characters`,
        'name',
        team.name
      );
    }

    const normalizedNotes = normalizeOptionalString(team.notes);
    const normalizedAgeGroup = normalizeOptionalString(team.ageGroup);

    const now = new Date().toISOString();
    const userId = await this.getUserId();
    const teamToUpsert: Team = {
      ...team,
      name: trimmedName,
      notes: normalizedNotes ?? undefined,
      ageGroup: normalizedAgeGroup ?? undefined,
      archived: team.archived ?? false,
      createdAt: team.createdAt ?? now,
      updatedAt: now,
    };

    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('teams')
        .upsert(this.transformTeamToDb(teamToUpsert, userId) as unknown as never, {
          onConflict: 'user_id,id',
        });
      throwIfTransient(result);
      return result;
    }, 'upsertTeam');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to upsert team');
    }

    return teamToUpsert;
  }

  // ==========================================================================
  // TEAM ROSTERS
  // ==========================================================================

  async getTeamRoster(teamId: string): Promise<TeamPlayer[]> {
    this.ensureInitialized();
    checkOnline();

    // Use withRetry for transient network error resilience (matches getTeams pattern)
    const result = await this.withRetry(async () => {
      return throwIfTransient(
        await this.getClient()
          .from('team_players')
          .select('*')
          .eq('team_id', teamId)
          .order('created_at', { ascending: true })
      );
    }, 'getTeamRoster');

    if (result.error) {
      this.classifyAndThrowError(result.error, 'Failed to fetch team roster');
    }

    return (result.data || []).map(this.transformTeamPlayerFromDb);
  }

  /**
   * Set team roster atomically using RPC function.
   *
   * Uses the RPC function `set_team_roster` for atomic delete + insert.
   * This prevents data loss if network fails mid-operation.
   *
   * @see supabase/migrations/001_rpc_functions.sql
   */
  async setTeamRoster(teamId: string, roster: TeamPlayer[]): Promise<void> {
    this.ensureInitialized();
    checkOnline();

    // Transform roster to database format
    const now = new Date().toISOString();
    const userId = await this.getUserId();
    const rows = roster.map((player) => this.transformTeamPlayerToDb(teamId, player, now, userId));

    // Use RPC for atomic delete + insert within a single PostgreSQL transaction
    // Type assertion needed: RPC functions are not in generated Supabase types until deployed
    // Wrapped with retry for transient network errors (e.g., AbortError on Chrome Mobile Android)
    const { error } = await this.withRetry(async () => {
      const result = await (this.getClient().rpc as unknown as (fn: string, params: unknown) => Promise<{ error: { message: string; code?: string } | null }>)(
        'set_team_roster',
        {
          p_team_id: teamId,
          p_roster: rows,
        }
      );
      throwIfTransient(result);
      return result;
    }, 'setTeamRoster');

    if (error) {
      const errorMessage = error.message.toLowerCase();
      const isMissingRpc =
        error.code === 'PGRST202' ||
        errorMessage.includes('does not exist') ||
        errorMessage.includes('function set_team_roster');
      const isPermissionIssue =
        error.code === '42501' ||
        errorMessage.includes('permission denied');

      // Issue #332: Require RPC availability for data integrity.
      // Non-atomic manual fallback removed - if RPC is unavailable, it's a deployment issue.
      if (isMissingRpc || isPermissionIssue) {
        logger.error('[SupabaseDataStore] set_team_roster RPC unavailable. ' +
          'This is a deployment issue - the RPC function must be available.', {
          code: error.code,
          message: error.message,
        });
        throw new NetworkError(
          'Team roster save temporarily unavailable. The server is being updated. ' +
          'Please try again in a few minutes. Your data has not been lost.'
        );
      }

      this.classifyAndThrowError(error, 'Failed to set team roster');
    }
  }

  async getAllTeamRosters(): Promise<Record<string, TeamPlayer[]>> {
    this.ensureInitialized();
    checkOnline();

    const { data, error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('team_players')
        .select('*')
        .order('created_at', { ascending: true });
      throwIfTransient(result);
      return result;
    }, 'getAllTeamRosters');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to fetch team rosters');
    }

    // Cast data due to placeholder Database types
    const rows = (data || []) as TeamPlayerRow[];
    const rosters: Record<string, TeamPlayer[]> = {};
    for (const row of rows) {
      const teamId = row.team_id;
      if (!rosters[teamId]) {
        rosters[teamId] = [];
      }
      rosters[teamId].push(this.transformTeamPlayerFromDb(row));
    }

    return rosters;
  }

  // Team player transform helpers
  private transformTeamPlayerFromDb(row: TeamPlayerRow): TeamPlayer {
    return {
      id: row.player_id, // Original player ID from master roster
      name: row.name,
      nickname: row.nickname ?? undefined,
      jerseyNumber: row.jersey_number ?? undefined,
      isGoalie: row.is_goalie ?? false,
      color: row.color ?? undefined,
      notes: row.notes ?? undefined,
      receivedFairPlayCard: row.received_fair_play_card ?? false,
    };
  }

  private transformTeamPlayerToDb(teamId: string, player: TeamPlayer, now: string, userId: string): TeamPlayerInsert {
    return {
      id: `${teamId}_${player.id}`, // Composite key
      team_id: teamId,
      player_id: player.id,
      user_id: userId,
      name: player.name,
      nickname: player.nickname ?? null,
      jersey_number: player.jerseyNumber ?? null,
      is_goalie: player.isGoalie ?? false,
      color: player.color ?? null,
      notes: player.notes ?? null,
      received_fair_play_card: player.receivedFairPlayCard ?? false,
      created_at: now,
      updated_at: now,
    };
  }

  // ==========================================================================
  // SEASONS
  // ==========================================================================

  async getSeasons(includeArchived = false): Promise<Season[]> {
    this.ensureInitialized();
    checkOnline();

    // Use withRetry for transient error resilience (matches getTeams pattern)
    // Fixes Sentry issues where seasons fail to load on transient network errors
    const result = await this.withRetry(async () => {
      let query = this.getClient().from('seasons').select('*');
      if (!includeArchived) {
        query = query.eq('archived', false);
      }
      return throwIfTransient(await query.order('created_at', { ascending: false }));
    }, 'getSeasons');

    if (result.error) {
      this.classifyAndThrowError(result.error, 'Failed to load seasons');
    }

    const rows = (result.data || []) as SeasonRow[];
    const { start, end } = await this.getSeasonDates();
    return rows.map((row) => ({
      ...this.transformSeasonFromDb(row),
      // Compute clubSeason on-the-fly for backward compatibility (Rule #16)
      clubSeason: row.club_season ?? calculateClubSeason(row.start_date ?? undefined, start, end),
    }));
  }

  async createSeason(name: string, extra?: Partial<Omit<Season, 'id' | 'name'>>): Promise<Season> {
    this.ensureInitialized();
    checkOnline();

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new ValidationError('Season name cannot be empty', 'name', name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.SEASON_NAME_MAX) {
      throw new ValidationError(
        `Season name cannot exceed ${VALIDATION_LIMITS.SEASON_NAME_MAX} characters (got ${trimmedName.length})`,
        'name',
        name
      );
    }

    const normalizedAgeGroup = normalizeOptionalString(extra?.ageGroup);
    if (normalizedAgeGroup && !AGE_GROUPS.includes(normalizedAgeGroup)) {
      throw new ValidationError('Invalid age group', 'ageGroup', extra?.ageGroup);
    }

    const { start, end } = await this.getSeasonDates();
    const newClubSeason = calculateClubSeason(extra?.startDate, start, end);

    // Check composite uniqueness (Rule #6)
    const existingSeasons = await this.getSeasons(true);
    const compositeKey = createSeasonCompositeKey(
      trimmedName,
      newClubSeason,
      extra?.gameType,
      extra?.gender,
      extra?.ageGroup,
      extra?.leagueId
    );

    const duplicateExists = existingSeasons.some(
      (season) =>
        createSeasonCompositeKey(
          season.name,
          season.clubSeason,
          season.gameType,
          season.gender,
          season.ageGroup,
          season.leagueId
        ) === compositeKey
    );

    if (duplicateExists) {
      throw new AlreadyExistsError('season', trimmedName);
    }

    const now = new Date().toISOString();
    const newSeason: Season = {
      id: generateId('season'),
      name: trimmedName,
      ...(extra || {}),
      clubSeason: newClubSeason,
    };

    const userId = await this.getUserId();
    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('seasons')
        .insert(this.transformSeasonToDb(newSeason, now, userId) as unknown as never);
      throwIfTransient(result);
      return result;
    }, 'createSeason');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to create season');
    }

    return newSeason;
  }

  async updateSeason(season: Season): Promise<Season | null> {
    this.ensureInitialized();
    checkOnline();

    const trimmedName = season.name?.trim();
    if (!season.id || !trimmedName) {
      throw new ValidationError('Season name cannot be empty', 'name', season.name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.SEASON_NAME_MAX) {
      throw new ValidationError(
        `Season name cannot exceed ${VALIDATION_LIMITS.SEASON_NAME_MAX} characters (got ${trimmedName.length})`,
        'name',
        season.name
      );
    }

    const normalizedAgeGroup = normalizeOptionalString(season.ageGroup);
    if (normalizedAgeGroup && !AGE_GROUPS.includes(normalizedAgeGroup)) {
      throw new ValidationError('Invalid age group', 'ageGroup', season.ageGroup);
    }

    const userId = await this.getUserId();

    // Check if season exists (defense-in-depth: user_id filter)
    const { data: existing, error: fetchError } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('seasons')
        .select('*')
        .eq('id', season.id)
        .eq('user_id', userId)
        .single();
      if (result.error && result.error.code !== 'PGRST116') {
        throwIfTransient(result);
      }
      return result;
    }, 'updateSeason-fetch');

    // PGRST116 = row not found - return null
    // Other errors should be thrown as NetworkError
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return null;
      }
      this.classifyAndThrowError(fetchError, 'Failed to fetch season');
    }

    if (!existing) {
      return null;
    }

    const { start, end } = await this.getSeasonDates();
    const newClubSeason = calculateClubSeason(season.startDate, start, end);

    // Check composite uniqueness
    const existingSeasons = await this.getSeasons(true);
    const compositeKey = createSeasonCompositeKey(
      trimmedName,
      newClubSeason,
      season.gameType,
      season.gender,
      season.ageGroup,
      season.leagueId
    );

    const duplicateExists = existingSeasons.some(
      (item) =>
        item.id !== season.id &&
        createSeasonCompositeKey(
          item.name,
          item.clubSeason,
          item.gameType,
          item.gender,
          item.ageGroup,
          item.leagueId
        ) === compositeKey
    );

    if (duplicateExists) {
      throw new AlreadyExistsError('season', trimmedName);
    }

    const updatedSeason: Season = {
      ...this.transformSeasonFromDb(existing),
      ...season,
      name: trimmedName,
      clubSeason: newClubSeason,
    };

    const updatePayload: SeasonUpdate = {
      name: updatedSeason.name,
      location: updatedSeason.location ?? null,
      period_count: normalizePeriodCount(updatedSeason.periodCount),
      period_duration: normalizePositiveNumber(updatedSeason.periodDuration),
      start_date: normalizeDateString(updatedSeason.startDate),
      end_date: normalizeDateString(updatedSeason.endDate),
      game_dates: normalizeDateArray(updatedSeason.gameDates),
      club_season: updatedSeason.clubSeason ?? null,
      game_type: normalizeGameType(updatedSeason.gameType),
      gender: normalizeGender(updatedSeason.gender),
      age_group: updatedSeason.ageGroup ?? null,
      league_id: updatedSeason.leagueId ?? null,
      custom_league_name: updatedSeason.customLeagueName ?? null,
      archived: updatedSeason.archived ?? false,
      notes: updatedSeason.notes ?? null,
      color: updatedSeason.color ?? null,
      badge: updatedSeason.badge ?? null,
      team_placements: normalizeTeamPlacements(updatedSeason.teamPlacements),
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('seasons')
        .update(updatePayload)
        .eq('id', season.id)
        .eq('user_id', userId);
      throwIfTransient(result);
      return result;
    }, 'updateSeason');

    if (updateError) {
      this.classifyAndThrowError(updateError, 'Failed to update season');
    }

    return updatedSeason;
  }

  async deleteSeason(id: string): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    const userId = await this.getUserId();
    const { error, count } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('seasons')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('user_id', userId);
      throwIfTransient(result);
      return result;
    }, 'deleteSeason');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to delete season');
    }

    return (count ?? 0) > 0;
  }

  // Season transform helpers
  private transformSeasonFromDb(row: SeasonRow): Season {
    return {
      id: row.id,
      name: row.name,
      location: row.location ?? undefined,
      periodCount: normalizePeriodCount(row.period_count) ?? undefined,
      periodDuration: normalizePositiveNumber(row.period_duration) ?? undefined,
      startDate: row.start_date ?? undefined,
      endDate: row.end_date ?? undefined,
      gameDates: row.game_dates ?? undefined,
      clubSeason: row.club_season ?? undefined,
      gameType: normalizeGameType(row.game_type) ?? undefined,
      gender: normalizeGender(row.gender) ?? undefined,
      ageGroup: row.age_group ?? undefined,
      leagueId: row.league_id ?? undefined,
      customLeagueName: row.custom_league_name ?? undefined,
      archived: row.archived ?? false,
      notes: row.notes ?? undefined,
      color: row.color ?? undefined,
      badge: row.badge ?? undefined,
      teamPlacements: parseTeamPlacements(row.team_placements),
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
    };
  }

  private transformSeasonToDb(season: Season, now: string, userId: string): SeasonInsert {
    return {
      id: season.id,
      user_id: userId,
      name: season.name,
      location: season.location ?? null,
      period_count: normalizePeriodCount(season.periodCount),
      period_duration: normalizePositiveNumber(season.periodDuration),
      start_date: normalizeDateString(season.startDate),
      end_date: normalizeDateString(season.endDate),
      game_dates: normalizeDateArray(season.gameDates),
      club_season: season.clubSeason ?? null,
      game_type: normalizeGameType(season.gameType),
      gender: normalizeGender(season.gender),
      age_group: season.ageGroup ?? null,
      league_id: season.leagueId ?? null,
      custom_league_name: season.customLeagueName ?? null,
      archived: season.archived ?? false,
      notes: season.notes ?? null,
      color: season.color ?? null,
      badge: season.badge ?? null,
      team_placements: normalizeTeamPlacements(season.teamPlacements),
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Upsert a season - inserts if not exists, updates if exists.
   * Preserves the original ID (critical for migration).
   *
   * Note: Composite uniqueness checks (Rule 6) are intentionally skipped here.
   * Upsert is used during migration where data is pre-validated by the source DataStore.
   * For new season creation, use createSeason() which enforces composite uniqueness.
   *
   * @param season - Complete season object WITH id
   * @returns The upserted season
   */
  async upsertSeason(season: Season): Promise<Season> {
    this.ensureInitialized();
    checkOnline();

    const trimmedName = normalizeName(season.name);
    if (!trimmedName) {
      throw new ValidationError('Season name cannot be empty', 'name', season.name);
    }
    if (trimmedName.length > VALIDATION_LIMITS.SEASON_NAME_MAX) {
      throw new ValidationError(
        `Season name cannot exceed ${VALIDATION_LIMITS.SEASON_NAME_MAX} characters (got ${trimmedName.length})`,
        'name',
        season.name
      );
    }

    const normalizedAgeGroup = normalizeOptionalString(season.ageGroup);
    if (normalizedAgeGroup && !AGE_GROUPS.includes(normalizedAgeGroup)) {
      throw new ValidationError('Invalid age group', 'ageGroup', season.ageGroup);
    }

    const { start, end } = await this.getSeasonDates();
    const clubSeason = calculateClubSeason(season.startDate, start, end);

    const now = new Date().toISOString();
    const userId = await this.getUserId();
    const seasonToUpsert: Season = {
      ...season,
      name: trimmedName,
      ageGroup: normalizedAgeGroup ?? undefined,
      notes: normalizeOptionalString(season.notes) ?? undefined,
      clubSeason,
      archived: season.archived ?? false,
    };

    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('seasons')
        .upsert(this.transformSeasonToDb(seasonToUpsert, now, userId) as unknown as never, {
          onConflict: 'user_id,id',
        });
      throwIfTransient(result);
      return result;
    }, 'upsertSeason');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to upsert season');
    }

    return seasonToUpsert;
  }

  // ==========================================================================
  // TOURNAMENTS
  // ==========================================================================

  async getTournaments(includeArchived = false): Promise<Tournament[]> {
    this.ensureInitialized();
    checkOnline();

    // Use withRetry for transient error resilience (matches getTeams pattern)
    // Fixes Sentry issues where tournaments fail to load on transient network errors
    const result = await this.withRetry(async () => {
      let query = this.getClient().from('tournaments').select('*');
      if (!includeArchived) {
        query = query.eq('archived', false);
      }
      return throwIfTransient(await query.order('created_at', { ascending: false }));
    }, 'getTournaments');

    if (result.error) {
      this.classifyAndThrowError(result.error, 'Failed to load tournaments');
    }

    const rows = (result.data || []) as TournamentRow[];
    const { start, end } = await this.getSeasonDates();
    return rows.map((row) =>
      migrateTournamentLevel({
        ...this.transformTournamentFromDb(row),
        // Compute clubSeason on-the-fly (Rule #16)
        clubSeason: row.club_season ?? calculateClubSeason(row.start_date ?? undefined, start, end),
      })
    );
  }

  async createTournament(
    name: string,
    extra?: Partial<Omit<Tournament, 'id' | 'name'>>
  ): Promise<Tournament> {
    this.ensureInitialized();
    checkOnline();

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new ValidationError('Tournament name cannot be empty', 'name', name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.TOURNAMENT_NAME_MAX) {
      throw new ValidationError(
        `Tournament name cannot exceed ${VALIDATION_LIMITS.TOURNAMENT_NAME_MAX} characters (got ${trimmedName.length})`,
        'name',
        name
      );
    }

    const normalizedAgeGroup = normalizeOptionalString(extra?.ageGroup);
    if (normalizedAgeGroup && !AGE_GROUPS.includes(normalizedAgeGroup)) {
      throw new ValidationError('Invalid age group', 'ageGroup', extra?.ageGroup);
    }

    const { start, end } = await this.getSeasonDates();
    const newClubSeason = calculateClubSeason(extra?.startDate, start, end);

    // Check composite uniqueness (Rule #6)
    const existingTournaments = await this.getTournaments(true);
    const compositeKey = createTournamentCompositeKey(
      trimmedName,
      newClubSeason,
      extra?.gameType,
      extra?.gender,
      extra?.ageGroup
    );

    const duplicateExists = existingTournaments.some(
      (tournament) =>
        createTournamentCompositeKey(
          tournament.name,
          tournament.clubSeason,
          tournament.gameType,
          tournament.gender,
          tournament.ageGroup
        ) === compositeKey
    );

    if (duplicateExists) {
      throw new AlreadyExistsError('tournament', trimmedName);
    }

    const now = new Date().toISOString();
    const { level, ageGroup, ...rest } = extra || {};
    const newTournament: Tournament = {
      id: generateId('tournament'),
      name: trimmedName,
      ...rest,
      ...(level ? { level } : {}),
      ...(ageGroup ? { ageGroup } : {}),
      clubSeason: newClubSeason,
    };

    const userId = await this.getUserId();
    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('tournaments')
        .insert(this.transformTournamentToDb(newTournament, now, userId) as unknown as never);
      throwIfTransient(result);
      return result;
    }, 'createTournament');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to create tournament');
    }

    return newTournament;
  }

  async updateTournament(tournament: Tournament): Promise<Tournament | null> {
    this.ensureInitialized();
    checkOnline();

    const trimmedName = tournament.name?.trim();
    if (!tournament.id || !trimmedName) {
      throw new ValidationError('Tournament name cannot be empty', 'name', tournament.name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.TOURNAMENT_NAME_MAX) {
      throw new ValidationError(
        `Tournament name cannot exceed ${VALIDATION_LIMITS.TOURNAMENT_NAME_MAX} characters (got ${trimmedName.length})`,
        'name',
        tournament.name
      );
    }

    const normalizedAgeGroup = normalizeOptionalString(tournament.ageGroup);
    if (normalizedAgeGroup && !AGE_GROUPS.includes(normalizedAgeGroup)) {
      throw new ValidationError('Invalid age group', 'ageGroup', tournament.ageGroup);
    }

    const userId = await this.getUserId();

    // Check if tournament exists (defense-in-depth: user_id filter)
    const { data: existing, error: fetchError } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('tournaments')
        .select('*')
        .eq('id', tournament.id)
        .eq('user_id', userId)
        .single();
      if (result.error && result.error.code !== 'PGRST116') {
        throwIfTransient(result);
      }
      return result;
    }, 'updateTournament-fetch');

    // PGRST116 = row not found - return null
    // Other errors should be thrown as NetworkError
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return null;
      }
      this.classifyAndThrowError(fetchError, 'Failed to fetch tournament');
    }

    if (!existing) {
      return null;
    }

    const { start, end } = await this.getSeasonDates();
    const newClubSeason = calculateClubSeason(tournament.startDate, start, end);

    // Check composite uniqueness
    const existingTournaments = await this.getTournaments(true);
    const compositeKey = createTournamentCompositeKey(
      trimmedName,
      newClubSeason,
      tournament.gameType,
      tournament.gender,
      tournament.ageGroup
    );

    const duplicateExists = existingTournaments.some(
      (item) =>
        item.id !== tournament.id &&
        createTournamentCompositeKey(
          item.name,
          item.clubSeason,
          item.gameType,
          item.gender,
          item.ageGroup
        ) === compositeKey
    );

    if (duplicateExists) {
      throw new AlreadyExistsError('tournament', trimmedName);
    }

    const updatedTournament: Tournament = {
      ...this.transformTournamentFromDb(existing),
      ...tournament,
      name: trimmedName,
      clubSeason: newClubSeason,
    };

    const updatePayload: TournamentUpdate = {
      name: updatedTournament.name,
      location: updatedTournament.location ?? null,
      period_count: normalizePeriodCount(updatedTournament.periodCount),
      period_duration: normalizePositiveNumber(updatedTournament.periodDuration),
      start_date: normalizeDateString(updatedTournament.startDate),
      end_date: normalizeDateString(updatedTournament.endDate),
      game_dates: normalizeDateArray(updatedTournament.gameDates),
      club_season: updatedTournament.clubSeason ?? null,
      game_type: normalizeGameType(updatedTournament.gameType),
      gender: normalizeGender(updatedTournament.gender),
      age_group: updatedTournament.ageGroup ?? null,
      level: updatedTournament.level ?? null,
      notes: updatedTournament.notes ?? null,
      color: updatedTournament.color ?? null,
      badge: updatedTournament.badge ?? null,
      awarded_player_id: updatedTournament.awardedPlayerId ?? null,
      team_placements: normalizeTeamPlacements(updatedTournament.teamPlacements),
      series: (updatedTournament.series as unknown as Json) ?? null,
      archived: updatedTournament.archived ?? false,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('tournaments')
        .update(updatePayload)
        .eq('id', tournament.id)
        .eq('user_id', userId);
      throwIfTransient(result);
      return result;
    }, 'updateTournament');

    if (updateError) {
      this.classifyAndThrowError(updateError, 'Failed to update tournament');
    }

    return updatedTournament;
  }

  async deleteTournament(id: string): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    const userId = await this.getUserId();
    const { error, count } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('tournaments')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('user_id', userId);
      throwIfTransient(result);
      return result;
    }, 'deleteTournament');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to delete tournament');
    }

    return (count ?? 0) > 0;
  }

  // Tournament transform helpers
  private transformTournamentFromDb(row: TournamentRow): Tournament {
    return {
      id: row.id,
      name: row.name,
      startDate: row.start_date ?? undefined,
      endDate: row.end_date ?? undefined,
      location: row.location ?? undefined,
      periodCount: normalizePeriodCount(row.period_count) ?? undefined,
      periodDuration: normalizePositiveNumber(row.period_duration) ?? undefined,
      gameDates: row.game_dates ?? undefined,
      clubSeason: row.club_season ?? undefined,
      gameType: normalizeGameType(row.game_type) ?? undefined,
      gender: normalizeGender(row.gender) ?? undefined,
      ageGroup: row.age_group ?? undefined,
      level: row.level ?? undefined,
      series: Array.isArray(row.series) ? (row.series as unknown as TournamentSeries[]) : undefined,
      archived: row.archived ?? false,
      notes: row.notes ?? undefined,
      color: row.color ?? undefined,
      badge: row.badge ?? undefined,
      awardedPlayerId: row.awarded_player_id ?? undefined,
      teamPlacements: parseTeamPlacements(row.team_placements),
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
    };
  }

  private transformTournamentToDb(tournament: Tournament, now: string, userId: string): TournamentInsert {
    return {
      id: tournament.id,
      user_id: userId,
      name: tournament.name,
      location: tournament.location ?? null,
      period_count: normalizePeriodCount(tournament.periodCount),
      period_duration: normalizePositiveNumber(tournament.periodDuration),
      start_date: normalizeDateString(tournament.startDate),
      end_date: normalizeDateString(tournament.endDate),
      game_dates: normalizeDateArray(tournament.gameDates),
      club_season: tournament.clubSeason ?? null,
      game_type: normalizeGameType(tournament.gameType),
      gender: normalizeGender(tournament.gender),
      age_group: tournament.ageGroup ?? null,
      level: tournament.level ?? null,
      notes: tournament.notes ?? null,
      color: tournament.color ?? null,
      badge: tournament.badge ?? null,
      awarded_player_id: tournament.awardedPlayerId ?? null,
      team_placements: normalizeTeamPlacements(tournament.teamPlacements),
      series: (tournament.series as unknown as Json) ?? null,
      archived: tournament.archived ?? false,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Upsert a tournament - inserts if not exists, updates if exists.
   * Preserves the original ID (critical for migration).
   *
   * Note: Composite uniqueness checks (Rule 6) are intentionally skipped here.
   * Upsert is used during migration where data is pre-validated by the source DataStore.
   * For new tournament creation, use createTournament() which enforces composite uniqueness.
   *
   * @param tournament - Complete tournament object WITH id
   * @returns The upserted tournament
   */
  async upsertTournament(tournament: Tournament): Promise<Tournament> {
    this.ensureInitialized();
    checkOnline();

    const trimmedName = normalizeName(tournament.name);
    if (!trimmedName) {
      throw new ValidationError('Tournament name cannot be empty', 'name', tournament.name);
    }
    if (trimmedName.length > VALIDATION_LIMITS.TOURNAMENT_NAME_MAX) {
      throw new ValidationError(
        `Tournament name cannot exceed ${VALIDATION_LIMITS.TOURNAMENT_NAME_MAX} characters (got ${trimmedName.length})`,
        'name',
        tournament.name
      );
    }

    const normalizedAgeGroup = normalizeOptionalString(tournament.ageGroup);
    if (normalizedAgeGroup && !AGE_GROUPS.includes(normalizedAgeGroup)) {
      throw new ValidationError('Invalid age group', 'ageGroup', tournament.ageGroup);
    }

    const { start, end } = await this.getSeasonDates();
    const clubSeason = calculateClubSeason(tournament.startDate, start, end);

    const now = new Date().toISOString();
    const userId = await this.getUserId();
    const tournamentToUpsert: Tournament = {
      ...tournament,
      name: trimmedName,
      ageGroup: normalizedAgeGroup ?? undefined,
      level: normalizeOptionalString(tournament.level) ?? undefined,
      notes: normalizeOptionalString(tournament.notes) ?? undefined,
      clubSeason,
      archived: tournament.archived ?? false,
    };

    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('tournaments')
        .upsert(this.transformTournamentToDb(tournamentToUpsert, now, userId) as unknown as never, {
          onConflict: 'user_id,id',
        });
      throwIfTransient(result);
      return result;
    }, 'upsertTournament');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to upsert tournament');
    }

    return tournamentToUpsert;
  }

  // ==========================================================================
  // PERSONNEL
  // ==========================================================================

  async getAllPersonnel(): Promise<Personnel[]> {
    this.ensureInitialized();
    checkOnline();

    // Use withRetry for transient network error resilience
    const result = await this.withRetry(async () => {
      return throwIfTransient(
        await this.getClient()
          .from('personnel')
          .select('*')
          .order('created_at', { ascending: false })
      );
    }, 'getAllPersonnel');

    if (result.error) {
      this.classifyAndThrowError(result.error, 'Failed to fetch personnel');
    }

    return (result.data || []).map(this.transformPersonnelFromDb);
  }

  async getPersonnelById(id: string): Promise<Personnel | null> {
    this.ensureInitialized();
    checkOnline();

    // Use withRetry for transient network error resilience
    // Note: PGRST116 (no row found) is not transient and handled below
    const { data, error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('personnel')
        .select('*')
        .eq('id', id)
        .single();
      // Only throw if it's a transient error (for retry)
      // PGRST116 (not found) is expected and should not be retried
      if (result.error && result.error.code !== 'PGRST116') {
        throwIfTransient(result);
      }
      return result;
    }, 'getPersonnelById');

    if (error) {
      if (error.code === 'PGRST116') {
        // Personnel not found - return null per interface contract
        return null;
      }
      // Actual error (network, permission, etc.) - throw
      this.classifyAndThrowError(error, 'Failed to fetch personnel by ID');
    }

    if (!data) {
      return null;
    }

    return this.transformPersonnelFromDb(data);
  }

  async addPersonnelMember(
    data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Personnel> {
    this.ensureInitialized();
    checkOnline();

    const trimmedName = data.name?.trim();
    if (!trimmedName) {
      throw new ValidationError('Personnel name cannot be empty', 'name', data.name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.PERSONNEL_NAME_MAX) {
      throw new ValidationError(
        `Personnel name cannot exceed ${VALIDATION_LIMITS.PERSONNEL_NAME_MAX} characters (got ${trimmedName.length})`,
        'name',
        data.name
      );
    }

    // Check case-insensitive uniqueness
    const existingPersonnel = await this.getAllPersonnel();
    const normalizedName = normalizeNameForCompare(trimmedName);
    const nameExists = existingPersonnel.some(
      (person) => normalizeNameForCompare(person.name) === normalizedName
    );

    if (nameExists) {
      throw new AlreadyExistsError('personnel', trimmedName);
    }

    const now = new Date().toISOString();
    const newPersonnel: Personnel = {
      ...data,
      id: generateId('personnel'),
      name: trimmedName,
      certifications: data.certifications ?? [], // Rule #9: Include certifications
      createdAt: now,
      updatedAt: now,
    };

    const userId = await this.getUserId();
    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('personnel')
        .insert(this.transformPersonnelToDb(newPersonnel, userId) as unknown as never);
      throwIfTransient(result);
      return result;
    }, 'addPersonnelMember');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to create personnel');
    }

    return newPersonnel;
  }

  async updatePersonnelMember(
    id: string,
    updates: Partial<Personnel>
  ): Promise<Personnel | null> {
    this.ensureInitialized();
    checkOnline();

    const existing = await this.getPersonnelById(id);
    if (!existing) {
      return null;
    }

    if (updates.name !== undefined) {
      const trimmedName = updates.name.trim();
      if (!trimmedName) {
        throw new ValidationError('Personnel name cannot be empty', 'name', updates.name);
      }

      if (trimmedName.length > VALIDATION_LIMITS.PERSONNEL_NAME_MAX) {
        throw new ValidationError(
          `Personnel name cannot exceed ${VALIDATION_LIMITS.PERSONNEL_NAME_MAX} characters (got ${trimmedName.length})`,
          'name',
          updates.name
        );
      }

      // Check case-insensitive uniqueness (excluding current)
      const existingPersonnel = await this.getAllPersonnel();
      const normalizedName = normalizeNameForCompare(trimmedName);
      const nameExists = existingPersonnel.some(
        (person) => person.id !== id && normalizeNameForCompare(person.name) === normalizedName
      );

      if (nameExists) {
        throw new AlreadyExistsError('personnel', trimmedName);
      }

      updates.name = trimmedName;
    }

    const updated: Personnel = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const updatePayload: PersonnelUpdate = {
      name: updated.name,
      role: updated.role,
      email: updated.email ?? null,
      phone: updated.phone ?? null,
      certifications: updated.certifications ?? [],
      notes: updated.notes ?? null,
      updated_at: updated.updatedAt,
    };

    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('personnel')
        .update(updatePayload)
        .eq('id', id);
      throwIfTransient(result);
      return result;
    }, 'updatePersonnelMember');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to update personnel');
    }

    return updated;
  }

  /**
   * Remove a personnel member with cascade delete.
   *
   * Uses the RPC function `delete_personnel_cascade` for atomic cascade delete.
   * This removes the personnel and cleans up all game_personnel references
   * in a single PostgreSQL transaction (Rule #7).
   *
   * @see supabase/migrations/001_rpc_functions.sql
   */
  async removePersonnelMember(id: string): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    // Use RPC for atomic cascade delete within a single PostgreSQL transaction
    // Type assertion needed: RPC functions are not in generated Supabase types until deployed
    // Wrapped with retry for transient network errors (e.g., AbortError on Chrome Mobile Android)
    const { data, error } = await this.withRetry(async () => {
      const result = await (this.getClient().rpc as unknown as (fn: string, params: unknown) => Promise<{ data: boolean | null; error: { message: string } | null }>)(
        'delete_personnel_cascade',
        {
          p_personnel_id: id,
        }
      );
      throwIfTransient(result);
      return result;
    }, 'removePersonnelMember');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to delete personnel');
    }

    // RPC returns boolean: true if deleted, false if not found or unauthorized
    return data === true;
  }

  // Personnel transform helpers
  private transformPersonnelFromDb(row: PersonnelRow): Personnel {
    return {
      id: row.id,
      name: row.name,
      role: row.role as Personnel['role'],
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      certifications: row.certifications ?? [], // Rule #9
      notes: row.notes ?? undefined,
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? new Date().toISOString(),
    };
  }

  private transformPersonnelToDb(personnel: Personnel, userId: string): PersonnelInsert {
    return {
      id: personnel.id,
      user_id: userId,
      name: personnel.name,
      role: personnel.role,
      email: personnel.email ?? null,
      phone: personnel.phone ?? null,
      certifications: personnel.certifications ?? [],
      notes: personnel.notes ?? null,
      created_at: personnel.createdAt,
      updated_at: personnel.updatedAt,
    };
  }

  /**
   * Upsert a personnel member - inserts if not exists, updates if exists.
   * Preserves the original ID (critical for migration).
   *
   * @param personnel - Complete personnel object WITH id
   * @returns The upserted personnel
   */
  async upsertPersonnelMember(personnel: Personnel): Promise<Personnel> {
    this.ensureInitialized();
    checkOnline();

    const trimmedName = personnel.name?.trim();
    if (!trimmedName) {
      throw new ValidationError('Personnel name cannot be empty', 'name', personnel.name);
    }

    const now = new Date().toISOString();
    const userId = await this.getUserId();
    const personnelToUpsert: Personnel = {
      ...personnel,
      name: trimmedName,
      certifications: personnel.certifications ?? [],
      createdAt: personnel.createdAt ?? now,
      updatedAt: now,
    };

    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('personnel')
        .upsert(this.transformPersonnelToDb(personnelToUpsert, userId) as unknown as never, {
          onConflict: 'user_id,id',
        });
      throwIfTransient(result);
      return result;
    }, 'upsertPersonnelMember');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to upsert personnel');
    }

    return personnelToUpsert;
  }

  // ==========================================================================
  // SETTINGS
  // ==========================================================================

  async getSettings(): Promise<AppSettings> {
    this.ensureInitialized();
    checkOnline();

    // Use withRetry for transient network error resilience
    // Note: PGRST116 (no row found) is not transient and handled below
    const { data, error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('user_settings')
        .select('*')
        .single();
      // Only throw if it's a transient error (for retry)
      // PGRST116 (no settings exist) is expected and should not be retried
      if (result.error && result.error.code !== 'PGRST116') {
        throwIfTransient(result);
      }
      return result;
    }, 'getSettings');

    if (error) {
      if (error.code === 'PGRST116') {
        // No settings exist yet - return defaults
        return { ...DEFAULT_APP_SETTINGS };
      }
      // Actual error (network, permission, etc.) - throw
      this.classifyAndThrowError(error, 'Failed to fetch settings');
    }

    if (!data) {
      // No data but also no error - return defaults
      return { ...DEFAULT_APP_SETTINGS };
    }

    return this.transformSettingsFromDb(data);
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.ensureInitialized();
    checkOnline();

    const userId = await this.getUserId();
    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('user_settings')
        .upsert(this.transformSettingsToDb(settings, userId) as unknown as never);
      throwIfTransient(result);
      return result;
    }, 'saveSettings');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to save settings');
    }

    // Invalidate cache if season dates changed
    this.invalidateSettingsCache();
  }

  async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    this.ensureInitialized();
    checkOnline();

    const current = await this.getSettings();
    const updated: AppSettings = { ...current, ...updates };

    await this.saveSettings(updated);

    return updated;
  }

  // Settings transform helpers
  private transformSettingsFromDb(row: UserSettingsRow): AppSettings {
    return {
      currentGameId: row.current_game_id ?? null,
      lastHomeTeamName: row.last_home_team_name ?? '',
      language: (row.language as 'en' | 'fi') ?? 'fi',
      hasSeenAppGuide: row.has_seen_app_guide ?? false,
      useDemandCorrection: row.use_demand_correction ?? false,
      hasConfiguredSeasonDates: row.has_configured_season_dates ?? false,
      clubSeasonStartDate: row.club_season_start_date ?? DEFAULT_APP_SETTINGS.clubSeasonStartDate,
      clubSeasonEndDate: row.club_season_end_date ?? DEFAULT_APP_SETTINGS.clubSeasonEndDate,
      isDrawingModeEnabled: row.is_drawing_mode_enabled ?? false,
    };
  }

  private transformSettingsToDb(settings: AppSettings, userId: string): UserSettingsInsert {
    return {
      user_id: userId,
      current_game_id: settings.currentGameId ?? null,
      last_home_team_name: settings.lastHomeTeamName ?? '',
      language: settings.language ?? 'fi',
      has_seen_app_guide: settings.hasSeenAppGuide ?? false,
      use_demand_correction: settings.useDemandCorrection ?? false,
      has_configured_season_dates: settings.hasConfiguredSeasonDates ?? false,
      club_season_start_date: settings.clubSeasonStartDate ?? DEFAULT_CLUB_SEASON_START_DATE,
      club_season_end_date: settings.clubSeasonEndDate ?? DEFAULT_CLUB_SEASON_END_DATE,
      is_drawing_mode_enabled: settings.isDrawingModeEnabled ?? false,
      updated_at: new Date().toISOString(),
    };
  }

  // ==========================================================================
  // GAME TRANSFORMS
  // ==========================================================================

  /**
   * Transform AppState game to database tables.
   *
   * Converts a single AppState game object into 5 separate database table rows:
   * - game: main game metadata
   * - players: availablePlayers merged with on_field/is_selected flags
   * - events: gameEvents with order_index for ordering
   * - assessments: player assessments with flattened sliders
   * - tacticalData: JSONB fields for tactical data
   *
   * @see docs/03-active-plans/supabase-implementation-guide.md Section 5.6
   */
  private transformGameToTables(gameId: string, game: AppState, userId: string): GameTableSet {
    // Build player rows by merging availablePlayers with playersOnField state
    // Relationship: playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers (nested subsets)
    const selectedIds = new Set(game.selectedPlayerIds ?? []);
    const onFieldMap = new Map((game.playersOnField ?? []).map((p) => [p.id, p]));

    const rawPlayers = game.availablePlayers ?? [];
    const playerRows: GamePlayerInsert[] = [];
    const seenPlayerIds = new Set<string>();
    let droppedPlayers = 0;

    for (const player of rawPlayers) {
      if (!player || typeof player.id !== 'string') {
        droppedPlayers++;
        continue;
      }

      const playerId = player.id;
      if (!playerId.trim() || seenPlayerIds.has(playerId)) {
        droppedPlayers++;
        continue;
      }

      const onFieldPlayer = onFieldMap.get(playerId);
      const displayName = onFieldPlayer?.name ?? player.name;
      if (typeof displayName !== 'string' || displayName.trim() === '') {
        droppedPlayers++;
        continue;
      }

      seenPlayerIds.add(playerId);
      const isOnField = !!onFieldPlayer;
      const isSelected = selectedIds.has(playerId);

      playerRows.push({
        id: `${gameId}_${playerId}`,
        game_id: gameId,
        player_id: playerId,
        user_id: userId,
        // Snapshot fields - use onField version if available (more current state)
        player_name: displayName,
        nickname: onFieldPlayer?.nickname ?? player.nickname ?? '',
        jersey_number: onFieldPlayer?.jerseyNumber ?? player.jerseyNumber ?? '',
        is_goalie: onFieldPlayer?.isGoalie ?? player.isGoalie ?? false,
        color: onFieldPlayer?.color ?? player.color,
        notes: onFieldPlayer?.notes ?? player.notes ?? '',
        received_fair_play_card: onFieldPlayer?.receivedFairPlayCard ?? player.receivedFairPlayCard ?? false,
        // Status flags
        // CRITICAL: Normalize is_selected - if on field, must be selected
        is_selected: isSelected || isOnField,
        on_field: isOnField,
        // Field position (only for on-field players)
        // Use optional chaining with default to prevent crash if data is inconsistent
        rel_x: isOnField ? (onFieldPlayer?.relX ?? 0.5) : null,
        rel_y: isOnField ? (onFieldPlayer?.relY ?? 0.5) : null,
      });
    }

    if (droppedPlayers > 0) {
      logger.warn('[SupabaseDataStore] Dropped invalid or duplicate game players during save', {
        gameId,
        dropped: droppedPlayers,
      });
    }

    // Build event rows with order_index for ordering
    // Filter invalid events to avoid DB constraint failures
    const rawEvents = game.gameEvents ?? [];
    const filteredEvents = rawEvents.filter((event) => {
      const validType = VALID_GAME_EVENT_TYPES.has(event.type);
      const validTime = typeof event.time === 'number' && Number.isFinite(event.time);
      const validId = typeof event.id === 'string' && event.id.trim() !== '';
      return validType && validTime && validId;
    });
    if (filteredEvents.length !== rawEvents.length) {
      logger.warn('[SupabaseDataStore] Dropped invalid game events during save', {
        gameId,
        dropped: rawEvents.length - filteredEvents.length,
      });
    }

    // Deduplicate events by ID to avoid primary key constraint violations
    //
    // STRATEGY: Last-Write-Wins (keep the LAST occurrence of each event ID)
    // - Chosen because: In array context, later position implies later modification
    // - Duplicates indicate data corruption (events should have unique IDs)
    // - Warning logged to Sentry for detection of corruption patterns
    //
    // ALTERNATIVE considered: Throw ValidationError on duplicates (fail fast)
    // - Rejected because: Would block saving valid game data due to one corrupt event
    // - Migration/recovery scenarios need graceful handling of corrupt data
    //
    // If duplicates are frequently logged, investigate the source of corruption.
    const seenEventIds = new Set<string>();
    const deduplicatedEvents = [];
    // Process in reverse to keep last occurrence, then reverse back to maintain order
    for (let i = filteredEvents.length - 1; i >= 0; i--) {
      const event = filteredEvents[i];
      if (!seenEventIds.has(event.id)) {
        seenEventIds.add(event.id);
        deduplicatedEvents.unshift(event);
      }
    }
    const droppedDuplicateEvents = filteredEvents.length - deduplicatedEvents.length;
    if (droppedDuplicateEvents > 0) {
      logger.warn('[SupabaseDataStore] Dropped duplicate game events during save', {
        gameId,
        dropped: droppedDuplicateEvents,
      });
    }

    const eventRows: GameEventInsert[] = deduplicatedEvents.map((e, index) => ({
      id: e.id,
      game_id: gameId,
      user_id: userId,
      event_type: e.type,
      time_seconds: e.time,
      // CRITICAL: Array index becomes order_index for ordering
      order_index: index,
      scorer_id: e.scorerId ?? null,
      assister_id: e.assisterId ?? null,
      entity_id: e.entityId ?? null,
    }));

    // Build assessment rows with flattened sliders
    // Normalize values to avoid DB constraint violations (1-10 range)
    const assessmentRows: PlayerAssessmentInsert[] = Object.entries(game.assessments ?? {}).map(
      ([playerId, a]) => ({
        id: `assessment_${gameId}_${playerId}`,
        game_id: gameId,
        player_id: playerId,
        user_id: userId,
        overall_rating: normalizeRating(a.overall),
        // CRITICAL: Flatten nested sliders object to individual columns
        intensity: normalizeRating(a.sliders?.intensity ?? null),
        courage: normalizeRating(a.sliders?.courage ?? null),
        duels: normalizeRating(a.sliders?.duels ?? null),
        technique: normalizeRating(a.sliders?.technique ?? null),
        creativity: normalizeRating(a.sliders?.creativity ?? null),
        decisions: normalizeRating(a.sliders?.decisions ?? null),
        awareness: normalizeRating(a.sliders?.awareness ?? null),
        teamwork: normalizeRating(a.sliders?.teamwork ?? null),
        fair_play: normalizeRating(a.sliders?.fair_play ?? null),
        impact: normalizeRating(a.sliders?.impact ?? null),
        notes: a.notes ?? null,
        minutes_played: typeof a.minutesPlayed === 'number' && Number.isFinite(a.minutesPlayed)
          ? a.minutesPlayed
          : null,
        created_by: a.createdBy ?? 'coach',
        created_at: typeof a.createdAt === 'number' && Number.isFinite(a.createdAt)
          ? a.createdAt
          : Date.now(),
      })
    );

    // Build tactical data row
    const tacticalDataRow: GameTacticalDataInsert = {
      id: gameId,
      game_id: gameId,
      user_id: userId,
      // CRITICAL: Default undefined tactical fields for legacy games
      // Cast through unknown to Json for JSONB columns
      opponents: (game.opponents ?? []) as unknown as Json,
      drawings: (game.drawings ?? []) as unknown as Json,
      tactical_discs: (game.tacticalDiscs ?? []) as unknown as Json,
      tactical_drawings: (game.tacticalDrawings ?? []) as unknown as Json,
      tactical_ball_position: (game.tacticalBallPosition ?? null) as unknown as Json,
      completed_interval_durations: (game.completedIntervalDurations ?? []) as unknown as Json,
      last_sub_confirmation_time_seconds: game.lastSubConfirmationTimeSeconds ?? null,
    };

    const normalizedGameDate = normalizeDateString(game.gameDate);
    const fallbackGameDate = new Date().toISOString().split('T')[0];
    if (!normalizedGameDate) {
      logger.warn('[SupabaseDataStore] Invalid gameDate detected, defaulting to today', {
        gameId,
        gameDate: game.gameDate,
      });
    }

    return {
      game: {
        id: gameId,
        user_id: userId,
        // === CRITICAL: Empty string → NULL for ALL nullable string fields ===
        season_id: game.seasonId === '' ? null : game.seasonId,
        tournament_id: game.tournamentId === '' ? null : game.tournamentId,
        tournament_series_id: game.tournamentSeriesId === '' ? null : (game.tournamentSeriesId ?? null),
        tournament_level: game.tournamentLevel === '' ? null : (game.tournamentLevel ?? null),
        team_id: game.teamId === '' ? null : (game.teamId ?? null),
        game_time: game.gameTime === '' ? null : (game.gameTime ?? null),
        game_location: game.gameLocation === '' ? null : (game.gameLocation ?? null),
        age_group: game.ageGroup === '' ? null : (game.ageGroup ?? null),
        league_id: game.leagueId === '' ? null : (game.leagueId ?? null),
        custom_league_name: game.customLeagueName === '' ? null : (game.customLeagueName ?? null),
        // === Required fields (direct mapping) ===
        team_name: game.teamName,
        opponent_name: game.opponentName,
        game_date: normalizedGameDate ?? fallbackGameDate,
        // DEFENSIVE: Normalize to valid values; default to home
        home_or_away: normalizeGameHomeOrAway(game.homeOrAway) ?? 'home',
        number_of_periods: normalizePeriodCount(game.numberOfPeriods) ?? 2,
        period_duration_minutes: game.periodDurationMinutes,
        current_period: normalizePeriodCount(game.currentPeriod) ?? 1,
        game_status: normalizeGameStatus(game.gameStatus) ?? 'notStarted',
        // CRITICAL: Local semantics treat undefined as true (legacy migration)
        is_played: game.isPlayed ?? true,
        home_score: game.homeScore,
        away_score: game.awayScore,
        game_notes: game.gameNotes,
        show_player_names: game.showPlayerNames,
        // === Optional fields ===
        sub_interval_minutes: game.subIntervalMinutes ?? null,
        // DEFENSIVE: Guard against invalid values which PostgreSQL rejects
        demand_factor: normalizeDemandFactor(game.demandFactor),
        game_type: normalizeGameType(game.gameType),
        gender: normalizeGender(game.gender),
        went_to_overtime: game.wentToOvertime ?? false,
        went_to_penalties: game.wentToPenalties ?? false,
        show_position_labels: game.showPositionLabels ?? true,
        // === Array/object fields ===
        game_personnel: Array.isArray(game.gamePersonnel)
          ? game.gamePersonnel.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
          : [],
        formation_snap_points: (game.formationSnapPoints ?? null) as unknown as Json,
        // === Timer restoration ===
        time_elapsed_in_seconds: (game.timeElapsedInSeconds != null && isFinite(game.timeElapsedInSeconds))
          ? game.timeElapsedInSeconds : null,
      },
      players: playerRows,
      events: eventRows,
      assessments: assessmentRows,
      tacticalData: tacticalDataRow,
    };
  }

  /**
   * Transform database tables to AppState game.
   *
   * Reverses the transformation to reconstruct an AppState game from the 5 tables.
   *
   * @see docs/03-active-plans/supabase-implementation-guide.md Section 5.6
   */
  private transformTablesToGame(tables: GameTableSetRow): AppState {
    const { game, players, events, assessments, tacticalData } = tables;

    // Reconstruct availablePlayers (ALL game_players, NO relX/relY)
    const availablePlayers: Player[] = players.map((p) => ({
      id: p.player_id,
      name: p.player_name,
      nickname: p.nickname ?? '',
      jerseyNumber: p.jersey_number ?? '',
      isGoalie: p.is_goalie ?? false,
      color: p.color ?? undefined,
      notes: p.notes ?? '',
      receivedFairPlayCard: p.received_fair_play_card ?? false,
    }));

    // Reconstruct playersOnField (game_players WHERE on_field = true, WITH relX/relY)
    // DEFENSIVE: Use default position (center field) if rel_x/rel_y are null due to data corruption
    const playersOnField: Player[] = players
      .filter((p) => p.on_field)
      .map((p) => ({
        id: p.player_id,
        name: p.player_name,
        nickname: p.nickname ?? '',
        jerseyNumber: p.jersey_number ?? '',
        isGoalie: p.is_goalie ?? false,
        color: p.color ?? undefined,
        notes: p.notes ?? '',
        receivedFairPlayCard: p.received_fair_play_card ?? false,
        relX: p.rel_x ?? DEFAULT_FIELD_POSITION.relX,
        relY: p.rel_y ?? DEFAULT_FIELD_POSITION.relY,
      }));

    // Reconstruct selectedPlayerIds (on-field players first for UI ordering)
    const selectedPlayerIds = players
      .filter((p) => p.is_selected)
      .sort((a, b) => {
        if (a.on_field && !b.on_field) return -1;
        if (!a.on_field && b.on_field) return 1;
        return 0;
      })
      .map((p) => p.player_id);

    // CRITICAL: Verify subset relationship playersOnField ⊆ selectedPlayerIds
    // If DB has corrupted data where on_field=true but is_selected=false, auto-fix
    const selectedIdsSet = new Set(selectedPlayerIds);
    for (const onFieldPlayer of playersOnField) {
      if (!selectedIdsSet.has(onFieldPlayer.id)) {
        logger.warn('[SupabaseDataStore] Data corruption detected: on-field player not in selected list', {
          gameId: game.id,
          playerId: onFieldPlayer.id,
        });
        // Auto-fix: add missing player to selected list (at start for UI ordering)
        selectedPlayerIds.unshift(onFieldPlayer.id);
        selectedIdsSet.add(onFieldPlayer.id);
      }
    }

    // Reconstruct gameEvents (sorted by order_index)
    const gameEvents: GameEvent[] = events
      .sort((a, b) => a.order_index - b.order_index)
      .map((e) => ({
        id: e.id,
        type: e.event_type as GameEvent['type'],
        time: e.time_seconds,
        scorerId: e.scorer_id ?? undefined,
        assisterId: e.assister_id ?? undefined,
        entityId: e.entity_id ?? undefined,
      }));

    // Reconstruct assessments as Record<playerId, Assessment>
    // Use normalizeRatingFromDb to handle potentially corrupted data from DB
    const assessmentsRecord: { [playerId: string]: PlayerAssessment } = {};
    for (const a of assessments) {
      assessmentsRecord[a.player_id] = {
        overall: normalizeRatingFromDb(a.overall_rating, 0),
        sliders: {
          intensity: normalizeRatingFromDb(a.intensity, 0),
          courage: normalizeRatingFromDb(a.courage, 0),
          duels: normalizeRatingFromDb(a.duels, 0),
          technique: normalizeRatingFromDb(a.technique, 0),
          creativity: normalizeRatingFromDb(a.creativity, 0),
          decisions: normalizeRatingFromDb(a.decisions, 0),
          awareness: normalizeRatingFromDb(a.awareness, 0),
          teamwork: normalizeRatingFromDb(a.teamwork, 0),
          fair_play: normalizeRatingFromDb(a.fair_play, 0),
          impact: normalizeRatingFromDb(a.impact, 0),
        },
        notes: a.notes ?? '',
        minutesPlayed: a.minutes_played ?? 0,
        createdBy: a.created_by ?? 'coach',
        createdAt: typeof a.created_at === 'number' ? a.created_at : Date.now(),
      };
    }

    return {
      // === NULL → empty string for ALL nullable string fields ===
      seasonId: game.season_id ?? '',
      tournamentId: game.tournament_id ?? '',
      tournamentSeriesId: game.tournament_series_id ?? '',
      tournamentLevel: game.tournament_level ?? '',
      teamId: game.team_id ?? '',
      gameTime: game.game_time ?? '',
      gameLocation: game.game_location ?? '',
      ageGroup: game.age_group ?? '',
      leagueId: game.league_id ?? '',
      customLeagueName: game.custom_league_name ?? '',
      // === Required fields (direct mapping) ===
      teamName: game.team_name,
      opponentName: game.opponent_name,
      gameDate: game.game_date,
      homeOrAway: normalizeGameHomeOrAway(game.home_or_away) ?? 'home',
      numberOfPeriods: (normalizePeriodCount(game.number_of_periods) ?? 2) as 1 | 2,
      periodDurationMinutes: game.period_duration_minutes,
      currentPeriod: normalizePeriodCount(game.current_period) ?? 1,
      gameStatus: normalizeGameStatus(game.game_status) ?? 'notStarted',
      // Rule 2: Legacy default - undefined → true (legacy games assumed played)
      isPlayed: game.is_played ?? true,
      homeScore: game.home_score,
      awayScore: game.away_score,
      gameNotes: game.game_notes,
      showPlayerNames: game.show_player_names,
      // === Optional fields (null → undefined for TypeScript semantics) ===
      subIntervalMinutes: game.sub_interval_minutes ?? undefined,
      demandFactor: game.demand_factor ?? undefined,
      gameType: normalizeGameType(game.game_type) ?? undefined,
      gender: normalizeGender(game.gender) ?? undefined,
      wentToOvertime: game.went_to_overtime ?? undefined,
      wentToPenalties: game.went_to_penalties ?? undefined,
      showPositionLabels: game.show_position_labels ?? true,
      // === Array/object fields (DEFENSIVE: validate array structure for JSONB) ===
      gamePersonnel: Array.isArray(game.game_personnel) ? game.game_personnel : [],
      formationSnapPoints: Array.isArray(game.formation_snap_points) ? game.formation_snap_points as unknown as Point[] : undefined,
      // === Timer restoration ===
      timeElapsedInSeconds: game.time_elapsed_in_seconds ?? undefined,
      // === Player arrays ===
      playersOnField,
      availablePlayers,
      selectedPlayerIds,
      // === Events and assessments ===
      gameEvents,
      assessments: assessmentsRecord,
      // === Tactical data from JSONB columns ===
      // DEFENSIVE: Validate array structure for JSONB fields to guard against DB corruption
      opponents: Array.isArray(tacticalData?.opponents) ? tacticalData.opponents as unknown as Opponent[] : [],
      drawings: Array.isArray(tacticalData?.drawings) ? tacticalData.drawings as unknown as Point[][] : [],
      tacticalDiscs: Array.isArray(tacticalData?.tactical_discs) ? tacticalData.tactical_discs as unknown as TacticalDisc[] : [],
      tacticalDrawings: Array.isArray(tacticalData?.tactical_drawings) ? tacticalData.tactical_drawings as unknown as Point[][] : [],
      tacticalBallPosition: (tacticalData?.tactical_ball_position != null && typeof tacticalData.tactical_ball_position === 'object' && !Array.isArray(tacticalData.tactical_ball_position))
        ? tacticalData.tactical_ball_position as unknown as Point : null,
      completedIntervalDurations: Array.isArray(tacticalData?.completed_interval_durations) ? tacticalData.completed_interval_durations as unknown as IntervalLog[] : [],
      lastSubConfirmationTimeSeconds: tacticalData?.last_sub_confirmation_time_seconds ?? undefined,
      // === Timestamps for conflict resolution ===
      createdAt: game.created_at ?? undefined,
      updatedAt: game.updated_at ?? undefined,
    };
  }

  // ==========================================================================
  // GAMES
  // ==========================================================================

  /**
   * Fetch a single game with all related data from 5 tables.
   */
  private async fetchGameTables(gameId: string): Promise<GameTableSetRow | null> {
    const client = this.getClient();

    // Type aliases for query results (Supabase client type inference doesn't work well with Promise.all)
    // All error types include code?: string since any Supabase query can return PGRST-prefixed errors
    type GameQueryResult = { data: GameRow | null; error: { message: string; code?: string } | null };
    type PlayersQueryResult = { data: GamePlayerRow[] | null; error: { message: string; code?: string } | null };
    type EventsQueryResult = { data: GameEventRow[] | null; error: { message: string; code?: string } | null };
    type AssessmentsQueryResult = { data: PlayerAssessmentRow[] | null; error: { message: string; code?: string } | null };
    type TacticalQueryResult = { data: GameTacticalDataRow | null; error: { message: string; code?: string } | null };

    // Fetch all 5 tables in parallel with retry for transient network errors
    // Note: game_players uses ORDER BY player_id for deterministic ordering
    // (PostgreSQL doesn't guarantee row order without explicit ORDER BY)
    // throwIfTransient ensures transient errors trigger retry of all queries together
    const [gameResult, playersResult, eventsResult, assessmentsResult, tacticalResult] = await this.withRetry(async () => {
      const results = await Promise.all([
        client.from('games').select('*').eq('id', gameId).single() as unknown as Promise<GameQueryResult>,
        client.from('game_players').select('*').eq('game_id', gameId).order('player_id') as unknown as Promise<PlayersQueryResult>,
        client.from('game_events').select('*').eq('game_id', gameId) as unknown as Promise<EventsQueryResult>,
        client.from('player_assessments').select('*').eq('game_id', gameId) as unknown as Promise<AssessmentsQueryResult>,
        client.from('game_tactical_data').select('*').eq('game_id', gameId).single() as unknown as Promise<TacticalQueryResult>,
      ]);
      // Check each result for transient errors - throws to trigger retry
      results.forEach((r) => throwIfTransient(r as { data: unknown; error: { message: string } | null }));
      return results;
    }, 'getGameById');

    // Handle game fetch error - distinguish "not found" from actual errors
    if (gameResult.error) {
      if (gameResult.error.code === 'PGRST116') {
        // Game not found - return null per interface contract
        return null;
      }
      // Actual error (network, permission, etc.) - throw
      this.classifyAndThrowError(gameResult.error, `Failed to fetch game ${gameId}`);
    }
    if (!gameResult.data) {
      return null;
    }

    // Handle errors from child tables - throw to prevent partial data load
    // Child data (players, events, assessments) is essential for a complete game view
    if (playersResult.error) {
      this.classifyAndThrowError(playersResult.error, `Failed to fetch game players for game ${gameId}`);
    }
    if (eventsResult.error) {
      this.classifyAndThrowError(eventsResult.error, `Failed to fetch game events for game ${gameId}`);
    }
    if (assessmentsResult.error) {
      this.classifyAndThrowError(assessmentsResult.error, `Failed to fetch player assessments for game ${gameId}`);
    }
    // Tactical data may legitimately not exist (PGRST116 = not found) - only throw for other errors
    if (tacticalResult.error && tacticalResult.error.code !== 'PGRST116') {
      this.classifyAndThrowError(tacticalResult.error, `Failed to fetch tactical data for game ${gameId}`);
    }

    return {
      game: gameResult.data,
      players: playersResult.data || [],
      events: eventsResult.data || [],
      assessments: assessmentsResult.data || [],
      tacticalData: tacticalResult.data || null,
    };
  }

  async getGames(): Promise<SavedGamesCollection> {
    this.ensureInitialized();
    checkOnline();

    // Fetch all game IDs with retry for transient network errors
    const result = await this.withRetry(async () => {
      return throwIfTransient(
        await this.getClient()
          .from('games')
          .select('id')
          .order('created_at', { ascending: false })
      );
    }, 'getGames');
    const { data: games, error } = result;

    if (error) {
      this.classifyAndThrowError(error, 'Failed to fetch games');
    }

    if (!games || games.length === 0) {
      return {};
    }

    // Fetch full data for each game in parallel batches
    // Batch size of 20 balances parallelism vs. Supabase connection pool limits
    const BATCH_SIZE = 20;
    const collection: SavedGamesCollection = {};
    const allFailedIds: string[] = []; // Track all failures across batches

    for (let i = 0; i < games.length; i += BATCH_SIZE) {
      const batch = games.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async ({ id }) => {
          try {
            const tables = await this.fetchGameTables(id);
            return { id, tables, error: null };
          } catch (err) {
            // Catch errors from individual game fetches to allow batch to continue
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            logger.error(`[SupabaseDataStore] Error fetching game ${id}: ${errorMsg}`);
            // Track in Sentry at error level - partial data loading causes user confusion
            try {
              Sentry.captureException(err, {
                tags: { component: 'SupabaseDataStore', action: 'getGames-fetchGame' },
                level: 'error', // Use error level so these appear in Sentry dashboard
                extra: { gameId: id, errorMsg },
              });
            } catch {
              // Sentry failure must not break batch processing
            }
            return { id, tables: null, error: errorMsg };
          }
        })
      );

      for (const { id, tables } of results) {
        if (tables) {
          // CRITICAL: Wrap in try/catch so single corrupted game doesn't crash entire operation
          // A game with null/undefined version shouldn't prevent loading other valid games
          try {
            const gameData = this.transformTablesToGame(tables);
            // Cache version AFTER successful transform — a failed transform with
            // a cached version could cause spurious ConflictError on subsequent saves
            this.cacheGameVersion(id, tables.game.version);
            collection[id] = gameData;
          } catch (transformErr) {
            // Log and track, but DON'T stop processing other games
            const errorMsg = transformErr instanceof Error ? transformErr.message : 'Unknown transform error';
            logger.error(`[SupabaseDataStore] Error transforming game ${id}: ${errorMsg}`);
            try {
              Sentry.captureException(transformErr, {
                tags: { component: 'SupabaseDataStore', action: 'getGames-transform' },
                level: 'error', // Use error level so these appear in Sentry dashboard
                extra: {
                  gameId: id,
                  errorMsg,
                  // Include game metadata for debugging (omit large fields like players/events)
                  gameVersion: tables.game.version,
                  gameStatus: tables.game.game_status,
                  playersCount: tables.players?.length ?? 0,
                  eventsCount: tables.events?.length ?? 0,
                },
              });
            } catch {
              // Sentry failure must not break batch processing
            }
            allFailedIds.push(id);
          }
        } else {
          allFailedIds.push(id);
        }
      }
    }

    // DATA SAFETY: If some games failed, log/track but RETURN the valid ones
    // Throwing would discard ALL valid games - unacceptable data loss
    // Users can still access their working games while we investigate failures
    if (allFailedIds.length > 0) {
      const loadedCount = Object.keys(collection).length;
      const totalCount = games.length;
      const failedSample = allFailedIds.slice(0, 5).join(', ');
      const errorMsg = `Failed to load ${allFailedIds.length} of ${totalCount} games. ` +
        `Loaded ${loadedCount} successfully. Failed IDs: ${failedSample}${allFailedIds.length > 5 ? '...' : ''}`;

      logger.error(`[SupabaseDataStore] ${errorMsg}`);
      // Wrap in try/catch - Sentry failure must not break returning valid games
      try {
        Sentry.captureMessage('getGames completed with partial failures', {
          level: 'error',
          tags: { component: 'SupabaseDataStore', action: 'getGames-partialFailure' },
          extra: {
            failedCount: allFailedIds.length,
            loadedCount,
            totalCount,
            failedIds: allFailedIds,
          },
        });
      } catch {
        // Sentry failure is acceptable - returning valid games is critical
      }

      // CRITICAL: Return valid games instead of throwing
      // This prevents data lockout when a single game is corrupted
      // UI should check game count and show warning if fewer than expected
      logger.warn(`[SupabaseDataStore] Returning ${loadedCount} valid games despite ${allFailedIds.length} failures`);
    }

    return collection;
  }

  async getGameById(id: string): Promise<AppState | null> {
    this.ensureInitialized();
    checkOnline();

    const tables = await this.fetchGameTables(id);
    if (!tables) {
      return null;
    }

    this.cacheGameVersion(id, tables.game.version);

    return this.transformTablesToGame(tables);
  }

  /**
   * Create a new game with defaults.
   *
   * CRITICAL: Applies defaults per implementation guide Rule #10.
   * Especially periodDurationMinutes which has NO schema default.
   */
  async createGame(partialGame: Partial<AppState> = {}): Promise<{ gameId: string; gameData: AppState }> {
    this.ensureInitialized();
    checkOnline();

    const gameId = generateId('game');
    const now = new Date();

    // Build complete game with defaults (Rule #10)
    const gameData: AppState = {
      // === Defaults that MUST be provided (no DB default) ===
      periodDurationMinutes: 10,
      subIntervalMinutes: 5,
      showPlayerNames: true,
      tacticalBallPosition: DEFAULT_FIELD_POSITION,
      lastSubConfirmationTimeSeconds: 0,
      // === Other sensible defaults (must match LocalDataStore for parity) ===
      teamName: 'My Team',
      opponentName: 'Opponent',
      gameDate: now.toISOString().split('T')[0],
      homeOrAway: 'home',
      numberOfPeriods: 2,
      currentPeriod: 1,
      gameStatus: 'notStarted',
      isPlayed: true,
      homeScore: 0,
      awayScore: 0,
      gameNotes: '',
      // === Arrays default to empty ===
      playersOnField: [],
      availablePlayers: [],
      selectedPlayerIds: [],
      gameEvents: [],
      assessments: {},
      opponents: [],
      drawings: [],
      tacticalDiscs: [],
      tacticalDrawings: [],
      completedIntervalDurations: [],
      gamePersonnel: [],
      // === Nullable strings default to empty ===
      seasonId: '',
      tournamentId: '',
      tournamentSeriesId: '',
      tournamentLevel: '',
      teamId: '',
      gameTime: '',
      gameLocation: '',
      ageGroup: '',
      leagueId: '',
      customLeagueName: '',
      // === Override with provided values ===
      ...partialGame,
    };

    // Save the game
    await this.saveGame(gameId, gameData);

    return { gameId, gameData };
  }

  /**
   * Save (create or update) a game with all related data.
   *
   * Uses the RPC function `save_game_with_relations` for atomic 5-table writes.
   * This ensures all game data is saved in a single PostgreSQL transaction,
   * preventing partial writes if network fails mid-operation.
   *
   * @see supabase/migrations/001_rpc_functions.sql
   */
  async saveGame(id: string, game: AppState): Promise<AppState> {
    const saveStartTime = Date.now();
    logger.info('[SupabaseDataStore] saveGame START', { gameId: id.slice(0, 20) });

    this.ensureInitialized();
    checkOnline();

    // Validate using shared helper (Rule #14 - same validation as LocalDataStore)
    validateGame(game);
    const validateTime = Date.now() - saveStartTime;

    const userId = await this.getUserId();
    const getUserIdTime = Date.now() - saveStartTime;

    const tables = this.transformGameToTables(id, game, userId);
    const transformTime = Date.now() - saveStartTime;

    logger.info('[SupabaseDataStore] saveGame preparation complete', {
      gameId: id.slice(0, 20),
      validateMs: validateTime,
      getUserIdMs: getUserIdTime - validateTime,
      transformMs: transformTime - getUserIdTime,
      totalPrepMs: transformTime,
      eventsCount: tables.events.length,
      playersCount: tables.players.length,
      assessmentsCount: tables.assessments.length,
    });

    // Get expected version for optimistic locking (Issue #330)
    // undefined = new game or version not yet cached (skip version check)
    const expectedVersion = this.gameVersionCache.get(id);

    // Use RPC for atomic 5-table write within a single PostgreSQL transaction
    // Type assertion needed: RPC functions are not in generated Supabase types until deployed
    // Wrapped with retry for transient network errors (critical for mobile reliability)
    // throwIfTransient ensures network errors trigger retry
    // IMPORTANT: Conflict errors (40001/serialization_failure) are NOT retried because:
    //   1. isTransientError() only returns true for specific patterns/codes (40001 is not among them)
    //   2. 40001 indicates real concurrent modification, not a transient network issue
    //   3. User intervention required - they must refresh to see latest changes
    const client = this.getClient();
    const rpcStartTime = Date.now();
    logger.info('[SupabaseDataStore] saveGame RPC START', { gameId: id.slice(0, 20) });

    const rpcResult = await this.withRetry(async () => {
      const attemptStartTime = Date.now();
      const result = await (client.rpc as unknown as (fn: string, params: unknown) => Promise<{ data: number | null; error: { message: string; code?: string } | null }>)(
        'save_game_with_relations',
        {
          p_game: tables.game,
          p_players: tables.players,
          p_events: tables.events,
          p_assessments: tables.assessments,
          p_tactical_data: tables.tacticalData,
          p_expected_version: expectedVersion ?? null,
        }
      );
      const attemptDuration = Date.now() - attemptStartTime;
      logger.info('[SupabaseDataStore] saveGame RPC attempt complete', {
        gameId: id.slice(0, 20),
        durationMs: attemptDuration,
        hasError: result.error !== null,
        errorCode: result.error?.code,
      });
      return throwIfTransient(result);
    }, 'saveGame');

    const rpcTotalDuration = Date.now() - rpcStartTime;
    logger.info('[SupabaseDataStore] saveGame RPC DONE', {
      gameId: id.slice(0, 20),
      totalRpcMs: rpcTotalDuration,
      hasError: rpcResult.error !== null,
    });

    const { data: newVersion, error } = rpcResult;

    if (error) {
      const errorMessage = error.message.toLowerCase();

      // Issue #330: Detect optimistic locking conflict
      // PostgreSQL raises serialization_failure (SQLSTATE 40001) for version mismatch
      // We check error code only - our migration uses ERRCODE = 'serialization_failure'
      const isConflict = error.code === '40001';

      if (isConflict) {
        // DATA SAFETY: Backup the unsaved game data before throwing
        // User can recover this data on next load if they accidentally navigate away
        try {
          const backupKey = `conflict_backup_${id}`;
          const backup = {
            gameId: id,
            gameData: game,
            timestamp: new Date().toISOString(),
            expectedVersion,
          };
          await setStorageItem(backupKey, JSON.stringify(backup));
          logger.info('[SupabaseDataStore] Conflict backup saved for recovery', { gameId: id });
        } catch (backupErr) {
          // Backup failure is non-critical - log but continue with conflict handling
          logger.warn('[SupabaseDataStore] Failed to backup conflicting game data:', backupErr);
        }

        const conflictError = new ConflictError(
          'game',
          id,
          'This game was modified in another tab or device. Your changes have been saved for recovery. Please refresh to see the latest changes.'
        );
        logger.warn('[SupabaseDataStore] Optimistic locking conflict detected for game', {
          gameId: id,
          expectedVersion,
          message: error.message,
        });
        // Track conflict frequency in Sentry for production monitoring
        // Wrap in try/catch - Sentry failure must not prevent conflict error
        try {
          Sentry.captureException(conflictError, {
            level: 'warning',
            tags: { component: 'SupabaseDataStore', action: 'saveGame-conflict' },
            extra: { gameId: id, expectedVersion },
          });
        } catch {
          // Sentry failure is acceptable - conflict handling is critical
        }
        // Clear cached version so next load gets fresh data
        this.gameVersionCache.delete(id);
        throw conflictError;
      }

      const isMissingRpc =
        error.code === 'PGRST202' ||
        errorMessage.includes('does not exist') ||
        errorMessage.includes('function save_game_with_relations');
      const isPermissionIssue =
        error.code === '42501' ||
        errorMessage.includes('permission denied');

      // Issue #332: Require RPC availability for data integrity.
      // Non-atomic manual fallback removed - if RPC is unavailable, it's a deployment issue.
      if (isMissingRpc || isPermissionIssue) {
        logger.error('[SupabaseDataStore] save_game_with_relations RPC unavailable. ' +
          'This is a deployment issue - the RPC function must be available.', {
          code: error.code,
          message: error.message,
        });
        throw new NetworkError(
          'Game save temporarily unavailable. The server is being updated. ' +
          'Please try again in a few minutes. Your data has not been lost.'
        );
      }

      this.classifyAndThrowError(error, 'Failed to save game');
    }

    // Update version cache with new version returned from RPC (Issue #330)
    if (typeof newVersion === 'number') {
      this.gameVersionCache.set(id, newVersion);
    } else {
      // This should never happen - RPC always returns BIGINT version on success.
      // Possible causes: RPC signature mismatch, null from DB trigger bug, or type coercion issue.
      // Clear cache to force fresh load on next read (prevents stale version issues).
      this.gameVersionCache.delete(id);
      logger.error('[SupabaseDataStore] Unexpected non-numeric version from RPC - cache invalidated', {
        gameId: id,
        versionType: typeof newVersion,
        versionValue: newVersion,
      });
    }

    const totalDuration = Date.now() - saveStartTime;
    logger.info('[SupabaseDataStore] saveGame COMPLETE', {
      gameId: id.slice(0, 20),
      totalMs: totalDuration,
    });

    return game;
  }

  /**
   * Save all games (bulk operation for migration).
   *
   * Validates ALL games before saving ANY to ensure atomic-like behavior.
   * If any game fails validation, no games are saved.
   */
  async saveAllGames(games: SavedGamesCollection): Promise<void> {
    this.ensureInitialized();
    checkOnline();

    // Validate ALL games before saving ANY (fail-fast, matches LocalDataStore)
    for (const [gameId, game] of Object.entries(games)) {
      if (!game || typeof game !== 'object') {
        throw new ValidationError(`Invalid game data for ${gameId}`, 'games', game);
      }
      validateGame(game, gameId);
    }

    // Save each game sequentially to avoid overwhelming the database
    for (const [id, game] of Object.entries(games)) {
      await this.saveGame(id, game);
    }
  }

  async deleteGame(id: string): Promise<boolean> {
    const deleteStartTime = Date.now();
    logger.info('[SupabaseDataStore] deleteGame START', { gameId: id.slice(0, 20) });

    this.ensureInitialized();
    checkOnline();

    // Child tables have ON DELETE CASCADE, so just delete the game
    const userId = await this.getUserId();
    const { error, count } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('games')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('user_id', userId);
      throwIfTransient(result);
      return result;
    }, 'deleteGame');

    const deleteDuration = Date.now() - deleteStartTime;
    logger.info('[SupabaseDataStore] deleteGame COMPLETE', {
      gameId: id.slice(0, 20),
      durationMs: deleteDuration,
      hasError: error !== null,
      deletedCount: count,
    });

    if (error) {
      this.classifyAndThrowError(error, 'Failed to delete game');
    }

    // Clear version cache for deleted game (Issue #330)
    this.gameVersionCache.delete(id);

    return (count ?? 0) > 0;
  }

  // ==========================================================================
  // GAME EVENTS (Rule #11: Full-save approach for order_index integrity)
  // ==========================================================================

  /**
   * Add a game event.
   *
   * Uses full-save strategy to maintain contiguous order_index values.
   */
  async addGameEvent(gameId: string, event: GameEvent): Promise<AppState | null> {
    this.ensureInitialized();
    checkOnline();

    const game = await this.getGameById(gameId);
    if (!game) {
      return null;
    }

    // Add event to the end of the array
    const updatedGame: AppState = {
      ...game,
      gameEvents: [...(game.gameEvents ?? []), event],
    };

    // Full save ensures order_index is recalculated
    await this.saveGame(gameId, updatedGame);
    return updatedGame;
  }

  /**
   * Update a game event at a specific index.
   *
   * Uses full-save strategy to maintain order_index integrity.
   */
  async updateGameEvent(gameId: string, eventIndex: number, event: GameEvent): Promise<AppState | null> {
    this.ensureInitialized();
    checkOnline();

    const game = await this.getGameById(gameId);
    if (!game) {
      return null;
    }

    const events = [...(game.gameEvents ?? [])];
    if (eventIndex < 0 || eventIndex >= events.length) {
      return null;
    }

    events[eventIndex] = event;

    const updatedGame: AppState = {
      ...game,
      gameEvents: events,
    };

    await this.saveGame(gameId, updatedGame);
    return updatedGame;
  }

  /**
   * Remove a game event at a specific index.
   *
   * Uses full-save strategy - array splice ensures order_index stays contiguous.
   */
  async removeGameEvent(gameId: string, eventIndex: number): Promise<AppState | null> {
    this.ensureInitialized();
    checkOnline();

    const game = await this.getGameById(gameId);
    if (!game) {
      return null;
    }

    const events = [...(game.gameEvents ?? [])];
    if (eventIndex < 0 || eventIndex >= events.length) {
      return null;
    }

    // Splice removes the event and reindexes remaining
    events.splice(eventIndex, 1);

    const updatedGame: AppState = {
      ...game,
      gameEvents: events,
    };

    await this.saveGame(gameId, updatedGame);
    return updatedGame;
  }

  // ==========================================================================
  // PLAYER ADJUSTMENTS
  // ==========================================================================

  /**
   * Validate adjustment note length (parity with LocalDataStore).
   */
  private validateAdjustmentNote(note: string | undefined): void {
    if (note && note.length > VALIDATION_LIMITS.ADJUSTMENT_NOTES_MAX) {
      throw new ValidationError(
        `Adjustment note cannot exceed ${VALIDATION_LIMITS.ADJUSTMENT_NOTES_MAX} characters (got ${note.length})`,
        'note',
        note
      );
    }
  }

  async getPlayerAdjustments(playerId: string): Promise<PlayerStatAdjustment[]> {
    this.ensureInitialized();
    checkOnline();

    // Use withRetry for transient network error resilience (matches getPlayers pattern)
    const result = await this.withRetry(async () => {
      return throwIfTransient(
        await this.getClient()
          .from('player_adjustments')
          .select('*')
          .eq('player_id', playerId)
          .order('applied_at', { ascending: false })
      );
    }, 'getPlayerAdjustments');

    if (result.error) {
      this.classifyAndThrowError(result.error, 'Failed to fetch player adjustments');
    }

    return (result.data || []).map((row: PlayerAdjustmentRow) => this.transformAdjustmentFromDb(row));
  }

  /**
   * Batch fetch ALL player adjustments for the current user.
   * Returns a Map keyed by playerId for efficient lookup.
   *
   * This is much more efficient than calling getPlayerAdjustments() in a loop
   * (N+1 query problem) - use this for migration/bulk operations.
   */
  async getAllPlayerAdjustments(): Promise<Map<string, PlayerStatAdjustment[]>> {
    this.ensureInitialized();
    checkOnline();

    const { data, error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('player_adjustments')
        .select('*')
        .order('applied_at', { ascending: false });
      throwIfTransient(result);
      return result;
    }, 'getAllPlayerAdjustments');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to fetch all player adjustments');
    }

    const result = new Map<string, PlayerStatAdjustment[]>();
    for (const row of data || []) {
      const playerId = (row as PlayerAdjustmentRow).player_id;
      const adjustment = this.transformAdjustmentFromDb(row as PlayerAdjustmentRow);

      if (!result.has(playerId)) {
        result.set(playerId, []);
      }
      result.get(playerId)!.push(adjustment);
    }

    return result;
  }

  async addPlayerAdjustment(
    adjustment: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string }
  ): Promise<PlayerStatAdjustment> {
    this.ensureInitialized();
    checkOnline();
    this.validateAdjustmentNote(adjustment.note);

    const userId = await this.getUserId();
    const id = adjustment.id || generateId('adjustment');
    const appliedAt = adjustment.appliedAt || new Date().toISOString();

    const dbAdjustment = this.transformAdjustmentToDb(
      { ...adjustment, id, appliedAt } as PlayerStatAdjustment,
      userId
    );

    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('player_adjustments')
        .insert(dbAdjustment as unknown as never);
      throwIfTransient(result);
      return result;
    }, 'addPlayerAdjustment');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to add player adjustment');
    }

    return { ...adjustment, id, appliedAt } as PlayerStatAdjustment;
  }

  /**
   * Upsert a player adjustment (insert or update if exists).
   * Used by migration service for merge mode.
   */
  async upsertPlayerAdjustment(
    adjustment: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string }
  ): Promise<PlayerStatAdjustment> {
    this.ensureInitialized();
    checkOnline();
    this.validateAdjustmentNote(adjustment.note);

    const userId = await this.getUserId();
    const id = adjustment.id || generateId('adjustment');
    const appliedAt = adjustment.appliedAt || new Date().toISOString();

    const dbAdjustment = this.transformAdjustmentToDb(
      { ...adjustment, id, appliedAt } as PlayerStatAdjustment,
      userId
    );

    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('player_adjustments')
        .upsert(dbAdjustment as unknown as never, { onConflict: 'user_id,id' });
      throwIfTransient(result);
      return result;
    }, 'upsertPlayerAdjustment');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to upsert player adjustment');
    }

    return { ...adjustment, id, appliedAt } as PlayerStatAdjustment;
  }

  async updatePlayerAdjustment(
    playerId: string,
    adjustmentId: string,
    patch: Partial<PlayerStatAdjustment>
  ): Promise<PlayerStatAdjustment | null> {
    this.ensureInitialized();
    checkOnline();
    if (patch.note !== undefined) {
      this.validateAdjustmentNote(patch.note);
    }

    const userId = await this.getUserId();

    // Fetch existing adjustment (defense-in-depth: user_id filter matches delete pattern)
    const { data: existing, error: fetchError } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('player_adjustments')
        .select('*')
        .eq('id', adjustmentId)
        .eq('player_id', playerId)
        .eq('user_id', userId)
        .single();
      if (result.error && result.error.code !== 'PGRST116') {
        throwIfTransient(result);
      }
      return result;
    }, 'updatePlayerAdjustment-fetch');

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        // Adjustment not found - return null per interface contract
        return null;
      }
      // Actual error (network, permission, etc.) - throw
      this.classifyAndThrowError(fetchError, 'Failed to fetch player adjustment for update');
    }

    if (!existing) {
      return null;
    }

    const existingAdjustment = this.transformAdjustmentFromDb(existing as PlayerAdjustmentRow);
    const updated = { ...existingAdjustment, ...patch };

    const { error: updateError } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('player_adjustments')
        .update(this.transformAdjustmentToDb(updated, userId) as unknown as never)
        .eq('id', adjustmentId)
        .eq('player_id', playerId)
        .eq('user_id', userId);
      throwIfTransient(result);
      return result;
    }, 'updatePlayerAdjustment');

    if (updateError) {
      this.classifyAndThrowError(updateError, 'Failed to update player adjustment');
    }

    return updated;
  }

  async deletePlayerAdjustment(playerId: string, adjustmentId: string): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    const userId = await this.getUserId();

    const { error, count } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('player_adjustments')
        .delete({ count: 'exact' })
        .eq('id', adjustmentId)
        .eq('player_id', playerId)
        .eq('user_id', userId);
      throwIfTransient(result);
      return result;
    }, 'deletePlayerAdjustment');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to delete player adjustment');
    }

    return (count ?? 0) > 0;
  }

  // Player adjustment transforms
  private transformAdjustmentFromDb(row: PlayerAdjustmentRow): PlayerStatAdjustment {
    return {
      id: row.id,
      playerId: row.player_id,
      seasonId: row.season_id ?? undefined,
      teamId: row.team_id ?? undefined,
      tournamentId: row.tournament_id ?? undefined,
      externalTeamName: row.external_team_name ?? undefined,
      opponentName: row.opponent_name ?? undefined,
      scoreFor: row.score_for ?? undefined,
      scoreAgainst: row.score_against ?? undefined,
      gameDate: row.game_date ?? undefined,
      homeOrAway: normalizeAdjustmentHomeOrAway(row.home_or_away) ?? undefined,
      includeInSeasonTournament: row.include_in_season_tournament ?? false,
      gamesPlayedDelta: row.games_played_delta ?? 0,
      goalsDelta: row.goals_delta ?? 0,
      assistsDelta: row.assists_delta ?? 0,
      fairPlayCardsDelta: row.fair_play_cards_delta ?? undefined,
      note: row.note ?? undefined,
      createdBy: row.created_by ?? undefined,
      appliedAt: row.applied_at ?? new Date().toISOString(),
    };
  }

  private transformAdjustmentToDb(
    adjustment: PlayerStatAdjustment,
    userId: string
  ): PlayerAdjustmentInsert {
    const normalizedSeasonId = normalizeOptionalString(adjustment.seasonId ?? undefined) ?? null;
    const normalizedTeamId = normalizeOptionalString(adjustment.teamId ?? undefined) ?? null;
    const normalizedTournamentId = normalizeOptionalString(adjustment.tournamentId ?? undefined) ?? null;
    const normalizedExternalTeamName = normalizeOptionalString(adjustment.externalTeamName ?? undefined) ?? null;
    const normalizedOpponentName = normalizeOptionalString(adjustment.opponentName ?? undefined) ?? null;
    const normalizedGameDate = normalizeDateString(adjustment.gameDate);

    return {
      id: adjustment.id,
      user_id: userId,
      player_id: adjustment.playerId,
      season_id: normalizedSeasonId,
      team_id: normalizedTeamId,
      tournament_id: normalizedTournamentId,
      external_team_name: normalizedExternalTeamName,
      opponent_name: normalizedOpponentName,
      score_for: adjustment.scoreFor,
      score_against: adjustment.scoreAgainst,
      game_date: normalizedGameDate,
      home_or_away: normalizeAdjustmentHomeOrAway(adjustment.homeOrAway),
      include_in_season_tournament: adjustment.includeInSeasonTournament ?? false,
      games_played_delta: adjustment.gamesPlayedDelta,
      goals_delta: adjustment.goalsDelta,
      assists_delta: adjustment.assistsDelta,
      fair_play_cards_delta: adjustment.fairPlayCardsDelta,
      note: adjustment.note,
      created_by: adjustment.createdBy,
      applied_at: adjustment.appliedAt,
    };
  }

  // ==========================================================================
  // WARMUP PLAN
  // ==========================================================================

  async getWarmupPlan(): Promise<WarmupPlan | null> {
    this.ensureInitialized();
    checkOnline();

    // Each user has at most one warmup plan
    // Note: Using .maybeSingle() instead of .single() to avoid 406 errors when no rows exist.
    // .single() requires exactly 1 row and returns 406 on certain edge cases.
    // .maybeSingle() returns null for 0 rows and errors on >1 rows.
    // Use withRetry for transient network error resilience (matches getPersonnelById pattern)
    const { data, error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('warmup_plans')
        .select('*')
        .limit(1)
        .maybeSingle();
      // Only throw if it's a transient error (for retry)
      // PGRST116 (not found) is expected and should not be retried
      if (result.error && result.error.code !== 'PGRST116') {
        throwIfTransient(result);
      }
      return result;
    }, 'getWarmupPlan');

    if (error) {
      // DIAGNOSTIC: Log full error details to help debug 406 errors
      logger.warn('[SupabaseDataStore] getWarmupPlan error', {
        code: error.code,
        message: error.message,
        details: (error as { details?: string }).details,
        hint: (error as { hint?: string }).hint,
        status: (error as { status?: number }).status,
      });

      // PGRST116 = row not found - this is expected if no plan exists
      if (error.code !== 'PGRST116') {
        this.classifyAndThrowError(error, 'Failed to fetch warmup plan');
      }
    }

    if (!data) {
      return null;
    }

    return this.transformWarmupPlanFromDb(data as WarmupPlanRow);
  }

  async saveWarmupPlan(plan: WarmupPlan): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    const userId = await this.getUserId();

    // Normalize metadata before saving (ensure consistent values)
    const normalizedPlan: WarmupPlan = {
      ...plan,
      lastModified: new Date().toISOString(),
      isDefault: false, // User-saved plans are never defaults
    };

    const dbPlan = this.transformWarmupPlanToDb(normalizedPlan, userId);

    // Use onConflict: 'user_id' since warmup_plans has UNIQUE(user_id) constraint
    // This ensures upsert finds existing row by user_id (not by 'id' which may differ)
    const { error } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('warmup_plans')
        .upsert(dbPlan as unknown as never, { onConflict: 'user_id' });
      throwIfTransient(result);
      return result;
    }, 'saveWarmupPlan');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to save warmup plan');
    }

    return true;
  }

  async deleteWarmupPlan(): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    // Get user ID for explicit filter (defense in depth - don't rely solely on RLS)
    const userId = await this.getUserId();

    // Delete warmup plan for current user only (should be only one)
    const { error, count } = await this.withRetry(async () => {
      const result = await this.getClient()
        .from('warmup_plans')
        .delete({ count: 'exact' })
        .eq('user_id', userId);
      throwIfTransient(result);
      return result;
    }, 'deleteWarmupPlan');

    if (error) {
      this.classifyAndThrowError(error, 'Failed to delete warmup plan');
    }

    return (count ?? 0) > 0;
  }

  // Warmup plan transforms
  private transformWarmupPlanFromDb(row: WarmupPlanRow): WarmupPlan {
    return {
      // Return canonical app-side ID, not the user-scoped DB key.
      // The DB uses `warmup_plan_<userId>` to avoid PK collisions across users,
      // but the app always expects 'user_warmup_plan'.
      id: 'user_warmup_plan',
      version: row.version,
      lastModified: row.last_modified ?? new Date().toISOString(),
      isDefault: row.is_default ?? false,
      sections: (row.sections as unknown as WarmupPlanSection[]) ?? [],
    };
  }

  private transformWarmupPlanToDb(plan: WarmupPlan, userId: string): WarmupPlanInsert {
    // Use user-scoped ID to avoid cross-user PK collisions
    // The schema has both PRIMARY KEY(id) and UNIQUE(user_id), so each user needs a unique id
    const userScopedId = `warmup_plan_${userId}`;

    return {
      id: userScopedId,
      user_id: userId,
      version: plan.version,
      last_modified: plan.lastModified,
      is_default: plan.isDefault,
      sections: plan.sections as unknown as Database['public']['Tables']['warmup_plans']['Insert']['sections'],
    };
  }

  // ==========================================================================
  // TIMER STATE (Local-only, no-ops for cloud)
  // ==========================================================================

  async getTimerState(): Promise<TimerState | null> {
    // Timer state is local-only (high-frequency writes)
    return null;
  }

  async saveTimerState(_state: TimerState): Promise<void> {
    // Timer state is local-only (high-frequency writes)
    // No-op for cloud mode
  }

  async clearTimerState(): Promise<void> {
    // Timer state is local-only (high-frequency writes)
    // No-op for cloud mode
  }

  // ==========================================================================
  // DATA MANAGEMENT
  // ==========================================================================

  /**
   * Clear all user data from cloud.
   *
   * Deletes all data owned by the current user from all tables.
   * Used for:
   * - "Replace cloud data" migration mode
   * - Manual cloud data reset from settings
   *
   * IMPORTANT: This is destructive and irreversible!
   *
   * @throws NetworkError if deletion fails
   */
  async clearAllUserData(): Promise<void> {
    this.ensureInitialized();
    checkOnline();

    const client = this.getClient();

    // Use RPC for ATOMIC deletion - all tables in single PostgreSQL transaction
    // This ensures all-or-nothing semantics: if any delete fails, entire operation rolls back.
    //
    // The RPC function clear_all_user_data():
    // - Uses auth.uid() for user identification (no client-provided user_id)
    // - Deletes tables in FK-compliant order (child tables first)
    // - Runs in single transaction for atomicity
    //
    // Wrapped in withRetry to handle transient AbortError on Chrome Mobile Android
    // where the browser can cancel fetch requests unexpectedly.
    //
    // See: docs/02-technical/database/supabase-schema.md "Clear All User Data (Atomic)"
    const { error } = await withRetry(
      async () => throwIfTransient(await client.rpc('clear_all_user_data')),
      { maxRetries: 3, operationName: 'clearAllUserData' }
    );

    if (!error) {
      // Clear local caches
      this.clearUserCaches();
      logger.info('[SupabaseDataStore] All user data cleared from cloud (atomic RPC)');
      return;
    }

    const errorMessage = error.message.toLowerCase();
    // Use shared transient error detection instead of hardcoded patterns
    // This stays aligned with TRANSIENT_ERROR_PATTERNS from transientErrors.ts
    const isNetworkLikeError = isTransientError(error);
    const isMissingRpc =
      error.code === 'PGRST202' ||
      errorMessage.includes('does not exist') ||
      errorMessage.includes('could not find') ||
      errorMessage.includes('schema cache') ||
      errorMessage.includes('clear_all_user_data');
    const isPermissionIssue =
      error.code === '42501' ||
      errorMessage.includes('permission denied');

    // For network-like errors, use standard error classification
    if (isNetworkLikeError) {
      this.classifyAndThrowError(error, 'Failed to clear user data');
    }

    // For missing RPC or permission issues, throw NetworkError with clear message
    // NO FALLBACK: Non-atomic deletion risks leaving database in inconsistent state
    // The RPC must be deployed and accessible for this operation to succeed
    // See Issue #332 for rationale
    if (isMissingRpc) {
      logger.error('[SupabaseDataStore] clear_all_user_data RPC not available', {
        code: error.code,
        message: error.message,
      });
      throw new NetworkError(
        'Cloud data deletion service is temporarily unavailable. Please try again later or contact support.'
      );
    }

    if (isPermissionIssue) {
      logger.error('[SupabaseDataStore] clear_all_user_data RPC permission denied', {
        code: error.code,
        message: error.message,
      });
      throw new NetworkError(
        'Permission denied while clearing cloud data. Please sign out and sign in again.'
      );
    }

    // Any other error - use standard classification
    this.classifyAndThrowError(error, 'Failed to clear user data');
  }

  // ==========================================================================
  // ENTITY REFERENCE CHECKS
  // ==========================================================================

  /**
   * Check if a season can be safely deleted (no game/team references).
   * Player adjustments use SET NULL and don't block deletion.
   */
  async getSeasonReferences(seasonId: string): Promise<EntityReferences> {
    this.ensureInitialized();
    checkOnline();

    const client = this.getClient();

    // Use parallel COUNT queries for efficiency, wrapped with retry for transient errors
    const [gamesResult, teamsResult, adjustmentsResult] = await this.withRetry(async () => {
      const results = await Promise.all([
        client
          .from('games')
          .select('id', { count: 'exact', head: true })
          .eq('season_id', seasonId),
        client
          .from('teams')
          .select('id', { count: 'exact', head: true })
          .eq('bound_season_id', seasonId),
        client
          .from('player_adjustments')
          .select('id', { count: 'exact', head: true })
          .eq('season_id', seasonId),
      ]);
      results.forEach((r) => throwIfTransient(r as { data: unknown; error: { message: string } | null }));
      return results;
    }, 'getSeasonReferences');

    const gameCount = gamesResult.count ?? 0;
    const teamCount = teamsResult.count ?? 0;
    const adjustmentCount = adjustmentsResult.count ?? 0;

    const counts = { games: gameCount, teams: teamCount, adjustments: adjustmentCount };

    // Only GAMES and TEAMS block deletion
    const canDelete = gameCount === 0 && teamCount === 0;

    const parts: string[] = [];
    if (gameCount > 0) parts.push(`${gameCount} game${gameCount > 1 ? 's' : ''}`);
    if (teamCount > 0) parts.push(`${teamCount} team${teamCount > 1 ? 's' : ''}`);
    if (adjustmentCount > 0) parts.push(`${adjustmentCount} stat adjustment${adjustmentCount > 1 ? 's' : ''} (will be unlinked)`);

    return {
      canDelete,
      counts,
      summary: parts.length > 0 ? `Used by ${parts.join(' and ')}` : 'Not used by any other data',
    };
  }

  /**
   * Check if a tournament can be safely deleted (no game/team references).
   * Player adjustments use SET NULL and don't block deletion.
   */
  async getTournamentReferences(tournamentId: string): Promise<EntityReferences> {
    this.ensureInitialized();
    checkOnline();

    const client = this.getClient();

    // First fetch the tournament to get its actual series IDs
    // Series created via TournamentSeriesManager use arbitrary IDs like series_${timestamp}_${uuid}
    const tournaments = await this.getTournaments(true);
    const tournament = tournaments.find(t => t.id === tournamentId);
    const seriesIds = tournament?.series?.map((s: { id: string }) => s.id) ?? [];

    // For games, we only need to check tournament_id (series refs are within tournament)
    // Wrapped with retry for transient network errors
    const [gamesResult, teamsResult, adjustmentsResult] = await this.withRetry(async () => {
      const results = await Promise.all([
        client
          .from('games')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', tournamentId),
        // Teams bound directly to tournament
        client
          .from('teams')
          .select('id', { count: 'exact', head: true })
          .eq('bound_tournament_id', tournamentId),
        client
          .from('player_adjustments')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', tournamentId),
      ]);
      results.forEach((r) => throwIfTransient(r as { data: unknown; error: { message: string } | null }));
      return results;
    }, 'getTournamentReferences');

    // For teams bound to tournament series, check against actual series IDs
    let teamsSeriesCount = 0;
    if (seriesIds.length > 0) {
      const teamsSeriesResult = await this.withRetry(async () => {
        const result = await client
          .from('teams')
          .select('id', { count: 'exact', head: true })
          .in('bound_tournament_series_id', seriesIds);
        throwIfTransient(result as { data: unknown; error: { message: string } | null });
        return result;
      }, 'getTournamentReferences-series');
      teamsSeriesCount = teamsSeriesResult.count ?? 0;
    }

    const gameCount = gamesResult.count ?? 0;
    const teamCount = (teamsResult.count ?? 0) + teamsSeriesCount;
    const adjustmentCount = adjustmentsResult.count ?? 0;

    const counts = { games: gameCount, teams: teamCount, adjustments: adjustmentCount };

    // Only GAMES and TEAMS block deletion
    const canDelete = gameCount === 0 && teamCount === 0;

    const parts: string[] = [];
    if (gameCount > 0) parts.push(`${gameCount} game${gameCount > 1 ? 's' : ''}`);
    if (teamCount > 0) parts.push(`${teamCount} team${teamCount > 1 ? 's' : ''}`);
    if (adjustmentCount > 0) parts.push(`${adjustmentCount} stat adjustment${adjustmentCount > 1 ? 's' : ''} (will be unlinked)`);

    return {
      canDelete,
      counts,
      summary: parts.length > 0 ? `Used by ${parts.join(' and ')}` : 'Not used by any other data',
    };
  }

  /**
   * Check if a team can be safely deleted (no game references).
   * Team rosters CASCADE delete and don't block deletion.
   */
  async getTeamReferences(teamId: string): Promise<EntityReferences> {
    this.ensureInitialized();
    checkOnline();

    const client = this.getClient();

    const { count: gameCount } = await this.withRetry(async () => {
      const result = await client
        .from('games')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId);
      throwIfTransient(result as { data: unknown; error: { message: string } | null });
      return result;
    }, 'getTeamReferences');

    const counts = { games: gameCount ?? 0 };

    // Only GAMES block deletion
    const canDelete = (gameCount ?? 0) === 0;

    const parts: string[] = [];
    if (gameCount && gameCount > 0) parts.push(`${gameCount} game${gameCount > 1 ? 's' : ''}`);

    return {
      canDelete,
      counts,
      summary: parts.length > 0 ? `Used by ${parts.join(' and ')}` : 'Not used by any other data',
    };
  }

  // ==========================================================================
  // CONFLICT BACKUP UTILITIES (DATA SAFETY)
  // ==========================================================================

  // ===========================================================================
  // CONFLICT BACKUP METHODS (Static)
  //
  // These methods use IndexedDB (via storage helpers) to store conflict backups.
  // Backups are transient/ephemeral - cleared after recovery or manual clear.
  // ===========================================================================

  /**
   * Get all conflict backups for games that couldn't be saved due to version conflicts.
   * These backups are created when a ConflictError is thrown during saveGame.
   *
   * @returns Array of conflict backups with game data and metadata
   */
  static async getConflictBackups(): Promise<Array<{
    gameId: string;
    gameData: AppState;
    timestamp: string;
    expectedVersion: number | null;
  }>> {
    const backups: Array<{
      gameId: string;
      gameData: AppState;
      timestamp: string;
      expectedVersion: number | null;
    }> = [];

    try {
      const allBackupData = await getAllStorageData({ keyPrefix: 'conflict_backup_' });
      for (const [_key, value] of Object.entries(allBackupData)) {
        if (value) {
          try {
            const backup = JSON.parse(value);
            if (backup.gameId && backup.gameData && backup.timestamp) {
              backups.push(backup);
            }
          } catch {
            // Skip invalid backup entries
          }
        }
      }
    } catch (err) {
      logger.warn('[SupabaseDataStore] Failed to retrieve conflict backups:', err);
    }

    return backups;
  }

  /**
   * Clear a specific conflict backup after successful recovery.
   *
   * @param gameId - The game ID whose backup should be cleared
   */
  static async clearConflictBackup(gameId: string): Promise<void> {
    try {
      await removeStorageItem(`conflict_backup_${gameId}`);
      logger.info('[SupabaseDataStore] Conflict backup cleared', { gameId });
    } catch (err) {
      logger.warn('[SupabaseDataStore] Failed to clear conflict backup:', err);
    }
  }

  /**
   * Clear all conflict backups.
   */
  static async clearAllConflictBackups(): Promise<void> {
    try {
      const allBackupData = await getAllStorageData({ keyPrefix: 'conflict_backup_' });
      const keysToRemove = Object.keys(allBackupData);
      for (const key of keysToRemove) {
        await removeStorageItem(key);
      }
      logger.info('[SupabaseDataStore] All conflict backups cleared', { count: keysToRemove.length });
    } catch (err) {
      logger.warn('[SupabaseDataStore] Failed to clear all conflict backups:', err);
    }
  }

  // ==========================================================================
  // DIAGNOSTICS
  // ==========================================================================

  /**
   * Run diagnostic tests to identify Supabase performance issues.
   *
   * Tests performed:
   * 1. Simple SELECT (count games) - baseline read performance
   * 2. Simple SELECT with filter (single game by ID) - indexed read
   * 3. Settings read - typical DataStore operation
   *
   * Results help identify:
   * - Infrastructure slowness (all queries slow) → Supabase tier/region issue
   * - Write-only slowness (reads fast, writes slow) → Connection pooling issue
   * - RPC-only slowness (direct queries fast, RPC slow) → RPC configuration issue
   *
   * @returns Diagnostic results with timing for each operation
   */
  async runDiagnostics(): Promise<{
    connectivity: { ok: boolean; durationMs: number; error?: string };
    simpleRead: { ok: boolean; durationMs: number; count?: number; error?: string };
    indexedRead: { ok: boolean; durationMs: number; error?: string };
    settingsRead: { ok: boolean; durationMs: number; error?: string };
    summary: string;
  }> {
    this.ensureInitialized();
    const client = this.getClient();

    logger.info('[SupabaseDataStore] Running diagnostics...');

    // Test 1: Basic connectivity - simple count
    const connectivityStart = Date.now();
    let connectivity: { ok: boolean; durationMs: number; error?: string };
    try {
      const { error } = await client.from('games').select('id', { count: 'exact', head: true });
      connectivity = {
        ok: !error,
        durationMs: Date.now() - connectivityStart,
        error: error?.message,
      };
    } catch (err) {
      connectivity = {
        ok: false,
        durationMs: Date.now() - connectivityStart,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    logger.info('[SupabaseDataStore] Diagnostic: connectivity', connectivity);

    // Test 2: Simple read - count games
    const simpleReadStart = Date.now();
    let simpleRead: { ok: boolean; durationMs: number; count?: number; error?: string };
    try {
      const { count, error } = await client.from('games').select('*', { count: 'exact', head: true });
      simpleRead = {
        ok: !error,
        durationMs: Date.now() - simpleReadStart,
        count: count ?? 0,
        error: error?.message,
      };
    } catch (err) {
      simpleRead = {
        ok: false,
        durationMs: Date.now() - simpleReadStart,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    logger.info('[SupabaseDataStore] Diagnostic: simpleRead', simpleRead);

    // Test 3: Indexed read - get first game by ID (uses primary key index)
    const indexedReadStart = Date.now();
    let indexedRead: { ok: boolean; durationMs: number; error?: string };
    try {
      const { error } = await client.from('games').select('id, team_name').limit(1);
      indexedRead = {
        ok: !error,
        durationMs: Date.now() - indexedReadStart,
        error: error?.message,
      };
    } catch (err) {
      indexedRead = {
        ok: false,
        durationMs: Date.now() - indexedReadStart,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    logger.info('[SupabaseDataStore] Diagnostic: indexedRead', indexedRead);

    // Test 4: Settings read - typical DataStore operation
    const settingsReadStart = Date.now();
    let settingsRead: { ok: boolean; durationMs: number; error?: string };
    try {
      const userId = await this.getUserId();
      const { error } = await client.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
      settingsRead = {
        ok: !error,
        durationMs: Date.now() - settingsReadStart,
        error: error?.message,
      };
    } catch (err) {
      settingsRead = {
        ok: false,
        durationMs: Date.now() - settingsReadStart,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    logger.info('[SupabaseDataStore] Diagnostic: settingsRead', settingsRead);

    // Generate summary
    const avgDuration = Math.round(
      (connectivity.durationMs + simpleRead.durationMs + indexedRead.durationMs + settingsRead.durationMs) / 4
    );
    let summary: string;
    if (avgDuration > 10000) {
      summary = `CRITICAL: Average query time ${avgDuration}ms - severe infrastructure issue. Check Supabase project status and region.`;
    } else if (avgDuration > 3000) {
      summary = `WARNING: Average query time ${avgDuration}ms - slow infrastructure. May be free tier cold start or high latency region.`;
    } else if (avgDuration > 1000) {
      summary = `MODERATE: Average query time ${avgDuration}ms - acceptable but could be improved. Check region proximity.`;
    } else {
      summary = `GOOD: Average query time ${avgDuration}ms - infrastructure is responsive.`;
    }

    const result = { connectivity, simpleRead, indexedRead, settingsRead, summary };
    logger.info('[SupabaseDataStore] Diagnostics complete', { summary, avgDurationMs: avgDuration });
    return result;
  }
}
