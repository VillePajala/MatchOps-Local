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
  PlayerStatAdjustment,
} from '@/types';
import type { AppState, SavedGamesCollection, GameEvent, Point, Opponent, TacticalDisc, IntervalLog } from '@/types/game';
import type { PlayerAssessment } from '@/types/playerAssessment';
import type { Personnel } from '@/types/personnel';
import type { WarmupPlan, WarmupPlanSection } from '@/types/warmupPlan';
import type { AppSettings } from '@/types/settings';
import type { TimerState } from '@/utils/timerStateManager';
import type { DataStore } from '@/interfaces/DataStore';
import type { Database } from '@/types/supabase';
import {
  AlreadyExistsError,
  AuthError,
  NetworkError,
  NotInitializedError,
  ValidationError,
} from '@/interfaces/DataStoreErrors';
import { validateGame } from '@/datastore/validation';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import { AGE_GROUPS } from '@/config/gameOptions';
import { generateId } from '@/utils/idGenerator';
import { normalizeName, normalizeNameForCompare } from '@/utils/normalization';
import { getClubSeasonForDate } from '@/utils/clubSeason';
import { DEFAULT_CLUB_SEASON_START_DATE, DEFAULT_CLUB_SEASON_END_DATE } from '@/config/clubSeasonDefaults';
import logger from '@/utils/logger';

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

// Default settings matching LocalDataStore
const DEFAULT_APP_SETTINGS: AppSettings = {
  currentGameId: null,
  lastHomeTeamName: '',
  language: 'fi',
  hasSeenAppGuide: false,
  useDemandCorrection: false,
  hasConfiguredSeasonDates: false,
  clubSeasonStartDate: DEFAULT_CLUB_SEASON_START_DATE,
  clubSeasonEndDate: DEFAULT_CLUB_SEASON_END_DATE,
};

/**
 * Default field position for players (center of field).
 * Used when player position data is missing or undefined.
 */
const DEFAULT_FIELD_POSITION = { relX: 0.5, relY: 0.5 } as const;

/**
 * Normalize optional string: trim whitespace, convert empty to undefined.
 */
const normalizeOptionalString = (value?: string): string | undefined => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

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
 */
const createTeamCompositeKey = (
  name: string,
  boundSeasonId?: string,
  boundTournamentId?: string,
  boundTournamentSeriesId?: string,
  gameType?: string
): string => {
  const parts = [normalizeNameForCompare(name)];
  if (boundSeasonId) parts.push(`season:${boundSeasonId}`);
  if (boundTournamentId) parts.push(`tournament:${boundTournamentId}`);
  if (boundTournamentSeriesId) parts.push(`series:${boundTournamentSeriesId}`);
  if (gameType) parts.push(`type:${gameType}`);
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
  const parts = [
    normalizeNameForCompare(name),
    `clubSeason:${clubSeason ?? 'none'}`,
    `gameType:${gameType ?? 'none'}`,
    `gender:${gender ?? 'none'}`,
    `ageGroup:${ageGroup ?? 'none'}`,
    `leagueId:${leagueId ?? 'none'}`,
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
  const parts = [
    normalizeNameForCompare(name),
    `clubSeason:${clubSeason ?? 'none'}`,
    `gameType:${gameType ?? 'none'}`,
    `gender:${gender ?? 'none'}`,
    `ageGroup:${ageGroup ?? 'none'}`,
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

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Lazy load supabase client to avoid bundling in local mode
    const { getSupabaseClient } = await import('@/datastore/supabase');
    this.supabase = getSupabaseClient();
    this.initialized = true;
    logger.info('[SupabaseDataStore] Initialized');
  }

  async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    this.initialized = false;
    this.seasonDatesCache = null;
    this.cachedUserId = null;
    // Note: Supabase client is a singleton, don't close it
    logger.info('[SupabaseDataStore] Closed');
  }

  getBackendName(): string {
    return 'supabase';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.initialized || !this.supabase) {
      return false;
    }

    // Quick health check using auth session (faster than table query, doesn't depend on RLS)
    try {
      const { error } = await this.supabase.auth.getSession();
      return !error;
    } catch {
      return false;
    }
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
   */
  private async getUserId(): Promise<string> {
    if (this.cachedUserId) {
      return this.cachedUserId;
    }

    const { data: { user }, error } = await this.getClient().auth.getUser();
    if (error || !user) {
      throw new AuthError('Not authenticated. Please sign in to use cloud mode.');
    }

    this.cachedUserId = user.id;
    return user.id;
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
    logger.debug('[SupabaseDataStore] User caches cleared');
  }

  // ==========================================================================
  // PLAYERS
  // ==========================================================================

  async getPlayers(): Promise<Player[]> {
    this.ensureInitialized();
    checkOnline();

    const { data, error } = await this.getClient()
      .from('players')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new NetworkError(`Failed to fetch players: ${error.message}`);
    }

    return (data || []).map(this.transformPlayerFromDb);
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
    const { error } = await this.getClient()
      .from('players')
       
      .insert(this.transformPlayerToDb(newPlayer, now, userId) as unknown as never);

    if (error) {
      throw new NetworkError(`Failed to create player: ${error.message}`);
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

    const { data: existing, error: fetchError } = await this.getClient()
      .from('players')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return null;
    }

    const updatedPlayer = { ...this.transformPlayerFromDb(existing), ...updates };
    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.getClient() as any;
    const { error: updateError } = await client
      .from('players')
      .update({
        name: updatedPlayer.name,
        nickname: updatedPlayer.nickname ?? null,
        jersey_number: updatedPlayer.jerseyNumber ?? null,
        is_goalie: updatedPlayer.isGoalie ?? false,
        color: updatedPlayer.color ?? null,
        notes: updatedPlayer.notes ?? null,
        received_fair_play_card: updatedPlayer.receivedFairPlayCard ?? false,
        updated_at: now,
      })
      .eq('id', id);

    if (updateError) {
      throw new NetworkError(`Failed to update player: ${updateError.message}`);
    }

    return updatedPlayer;
  }

  async deletePlayer(id: string): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    const { error, count } = await this.getClient()
      .from('players')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      throw new NetworkError(`Failed to delete player: ${error.message}`);
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

  // ==========================================================================
  // TEAMS
  // ==========================================================================

  async getTeams(includeArchived = false): Promise<Team[]> {
    this.ensureInitialized();
    checkOnline();

    let query = this.getClient().from('teams').select('*');
    if (!includeArchived) {
      query = query.eq('archived', false);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new NetworkError(`Failed to fetch teams: ${error.message}`);
    }

    return (data || []).map(this.transformTeamFromDb);
  }

  async getTeamById(id: string): Promise<Team | null> {
    this.ensureInitialized();
    checkOnline();

    const { data, error } = await this.getClient()
      .from('teams')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
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
    const { error } = await this.getClient()
      .from('teams')
       
      .insert(this.transformTeamToDb(newTeam, userId) as unknown as never);

    if (error) {
      throw new NetworkError(`Failed to create team: ${error.message}`);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.getClient() as any;
    const { error } = await client
      .from('teams')
      .update({
        name: updatedTeam.name,
        color: updatedTeam.color ?? null,
        notes: updatedTeam.notes ?? null,
        age_group: updatedTeam.ageGroup ?? null,
        game_type: updatedTeam.gameType ?? null,
        archived: updatedTeam.archived ?? false,
        bound_season_id: updatedTeam.boundSeasonId ?? null,
        bound_tournament_id: updatedTeam.boundTournamentId ?? null,
        bound_tournament_series_id: updatedTeam.boundTournamentSeriesId ?? null,
        updated_at: updatedTeam.updatedAt,
      })
      .eq('id', id);

    if (error) {
      throw new NetworkError(`Failed to update team: ${error.message}`);
    }

    return updatedTeam;
  }

  async deleteTeam(id: string): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    const { error, count } = await this.getClient()
      .from('teams')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      throw new NetworkError(`Failed to delete team: ${error.message}`);
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
      gameType: row.game_type as 'soccer' | 'futsal' | undefined,
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
      game_type: team.gameType ?? null,
      archived: team.archived ?? false,
      bound_season_id: team.boundSeasonId ?? null,
      bound_tournament_id: team.boundTournamentId ?? null,
      bound_tournament_series_id: team.boundTournamentSeriesId ?? null,
      created_at: team.createdAt,
      updated_at: team.updatedAt,
    };
  }

  // ==========================================================================
  // TEAM ROSTERS
  // ==========================================================================

  async getTeamRoster(teamId: string): Promise<TeamPlayer[]> {
    this.ensureInitialized();
    checkOnline();

    const { data, error } = await this.getClient()
      .from('team_players')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new NetworkError(`Failed to fetch team roster: ${error.message}`);
    }

    return (data || []).map(this.transformTeamPlayerFromDb);
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
    const { error } = await (this.getClient().rpc as unknown as (fn: string, params: unknown) => Promise<{ error: { message: string } | null }>)(
      'set_team_roster',
      {
        p_team_id: teamId,
        p_roster: rows,
      }
    );

    if (error) {
      throw new NetworkError(`Failed to set team roster: ${error.message}`);
    }
  }

  async getAllTeamRosters(): Promise<Record<string, TeamPlayer[]>> {
    this.ensureInitialized();
    checkOnline();

    const { data, error } = await this.getClient()
      .from('team_players')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      throw new NetworkError(`Failed to fetch team rosters: ${error.message}`);
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

    let query = this.getClient().from('seasons').select('*');
    if (!includeArchived) {
      query = query.eq('archived', false);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new NetworkError(`Failed to fetch seasons: ${error.message}`);
    }

    const rows = (data || []) as SeasonRow[];
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
    const { error } = await this.getClient()
      .from('seasons')
       
      .insert(this.transformSeasonToDb(newSeason, now, userId) as unknown as never);

    if (error) {
      throw new NetworkError(`Failed to create season: ${error.message}`);
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

    // Check if season exists
    const { data: existing, error: fetchError } = await this.getClient()
      .from('seasons')
      .select('*')
      .eq('id', season.id)
      .single();

    if (fetchError || !existing) {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.getClient() as any;
    const { error: updateError } = await client
      .from('seasons')
      .update({
        name: updatedSeason.name,
        start_date: updatedSeason.startDate ?? null,
        end_date: updatedSeason.endDate ?? null,
        club_season: updatedSeason.clubSeason ?? null,
        game_type: updatedSeason.gameType ?? null,
        gender: updatedSeason.gender ?? null,
        age_group: updatedSeason.ageGroup ?? null,
        league_id: updatedSeason.leagueId ?? null,
        custom_league_name: updatedSeason.customLeagueName ?? null,
        archived: updatedSeason.archived ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', season.id);

    if (updateError) {
      throw new NetworkError(`Failed to update season: ${updateError.message}`);
    }

    return updatedSeason;
  }

  async deleteSeason(id: string): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    const { error, count } = await this.getClient()
      .from('seasons')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      throw new NetworkError(`Failed to delete season: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }

  // Season transform helpers
  private transformSeasonFromDb(row: SeasonRow): Season {
    return {
      id: row.id,
      name: row.name,
      startDate: row.start_date ?? undefined,
      endDate: row.end_date ?? undefined,
      clubSeason: row.club_season ?? undefined,
      gameType: row.game_type as 'soccer' | 'futsal' | undefined,
      gender: row.gender as 'boys' | 'girls' | undefined,
      ageGroup: row.age_group ?? undefined,
      leagueId: row.league_id ?? undefined,
      customLeagueName: row.custom_league_name ?? undefined,
      archived: row.archived ?? false,
    };
  }

  private transformSeasonToDb(season: Season, now: string, userId: string): SeasonInsert {
    return {
      id: season.id,
      user_id: userId,
      name: season.name,
      start_date: season.startDate ?? null,
      end_date: season.endDate ?? null,
      club_season: season.clubSeason ?? null,
      game_type: season.gameType ?? null,
      gender: season.gender ?? null,
      age_group: season.ageGroup ?? null,
      league_id: season.leagueId ?? null,
      custom_league_name: season.customLeagueName ?? null,
      archived: season.archived ?? false,
      created_at: now,
      updated_at: now,
    };
  }

  // ==========================================================================
  // TOURNAMENTS
  // ==========================================================================

  async getTournaments(includeArchived = false): Promise<Tournament[]> {
    this.ensureInitialized();
    checkOnline();

    let query = this.getClient().from('tournaments').select('*');
    if (!includeArchived) {
      query = query.eq('archived', false);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new NetworkError(`Failed to fetch tournaments: ${error.message}`);
    }

    const rows = (data || []) as TournamentRow[];
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
    const { error } = await this.getClient()
      .from('tournaments')
       
      .insert(this.transformTournamentToDb(newTournament, now, userId) as unknown as never);

    if (error) {
      throw new NetworkError(`Failed to create tournament: ${error.message}`);
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

    // Check if tournament exists
    const { data: existing, error: fetchError } = await this.getClient()
      .from('tournaments')
      .select('*')
      .eq('id', tournament.id)
      .single();

    if (fetchError || !existing) {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.getClient() as any;
    const { error: updateError } = await client
      .from('tournaments')
      .update({
        name: updatedTournament.name,
        start_date: updatedTournament.startDate ?? null,
        end_date: updatedTournament.endDate ?? null,
        location: updatedTournament.location ?? null,
        club_season: updatedTournament.clubSeason ?? null,
        game_type: updatedTournament.gameType ?? null,
        gender: updatedTournament.gender ?? null,
        age_group: updatedTournament.ageGroup ?? null,
        level: updatedTournament.level ?? null,
        series: updatedTournament.series ?? null,
        archived: updatedTournament.archived ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tournament.id);

    if (updateError) {
      throw new NetworkError(`Failed to update tournament: ${updateError.message}`);
    }

    return updatedTournament;
  }

  async deleteTournament(id: string): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    const { error, count } = await this.getClient()
      .from('tournaments')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      throw new NetworkError(`Failed to delete tournament: ${error.message}`);
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
      clubSeason: row.club_season ?? undefined,
      gameType: row.game_type as 'soccer' | 'futsal' | undefined,
      gender: row.gender as 'boys' | 'girls' | undefined,
      ageGroup: row.age_group ?? undefined,
      level: row.level ?? undefined,
      series: Array.isArray(row.series) ? (row.series as TournamentSeries[]) : undefined,
      archived: row.archived ?? false,
    };
  }

  private transformTournamentToDb(tournament: Tournament, now: string, userId: string): TournamentInsert {
    return {
      id: tournament.id,
      user_id: userId,
      name: tournament.name,
      start_date: tournament.startDate ?? null,
      end_date: tournament.endDate ?? null,
      location: tournament.location ?? null,
      club_season: tournament.clubSeason ?? null,
      game_type: tournament.gameType ?? null,
      gender: tournament.gender ?? null,
      age_group: tournament.ageGroup ?? null,
      level: tournament.level ?? null,
      series: tournament.series ?? null,
      archived: tournament.archived ?? false,
      created_at: now,
      updated_at: now,
    };
  }

  // ==========================================================================
  // PERSONNEL
  // ==========================================================================

  async getAllPersonnel(): Promise<Personnel[]> {
    this.ensureInitialized();
    checkOnline();

    const { data, error } = await this.getClient()
      .from('personnel')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new NetworkError(`Failed to fetch personnel: ${error.message}`);
    }

    return (data || []).map(this.transformPersonnelFromDb);
  }

  async getPersonnelById(id: string): Promise<Personnel | null> {
    this.ensureInitialized();
    checkOnline();

    const { data, error } = await this.getClient()
      .from('personnel')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
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
    const { error } = await this.getClient()
      .from('personnel')
       
      .insert(this.transformPersonnelToDb(newPersonnel, userId) as unknown as never);

    if (error) {
      throw new NetworkError(`Failed to create personnel: ${error.message}`);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.getClient() as any;
    const { error } = await client
      .from('personnel')
      .update({
        name: updated.name,
        role: updated.role,
        email: updated.email ?? null,
        phone: updated.phone ?? null,
        certifications: updated.certifications ?? [],
        notes: updated.notes ?? null,
        updated_at: updated.updatedAt,
      })
      .eq('id', id);

    if (error) {
      throw new NetworkError(`Failed to update personnel: ${error.message}`);
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
    const { data, error } = await (this.getClient().rpc as unknown as (fn: string, params: unknown) => Promise<{ data: boolean | null; error: { message: string } | null }>)(
      'delete_personnel_cascade',
      {
        p_personnel_id: id,
      }
    );

    if (error) {
      throw new NetworkError(`Failed to delete personnel: ${error.message}`);
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

  // ==========================================================================
  // SETTINGS
  // ==========================================================================

  async getSettings(): Promise<AppSettings> {
    this.ensureInitialized();
    checkOnline();

    const { data, error } = await this.getClient()
      .from('user_settings')
      .select('*')
      .single();

    if (error || !data) {
      // Return defaults if no settings exist
      return { ...DEFAULT_APP_SETTINGS };
    }

    return this.transformSettingsFromDb(data);
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.ensureInitialized();
    checkOnline();

    const userId = await this.getUserId();
    const { error } = await this.getClient()
      .from('user_settings')
       
      .upsert(this.transformSettingsToDb(settings, userId) as unknown as never);

    if (error) {
      throw new NetworkError(`Failed to save settings: ${error.message}`);
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

    const playerRows: GamePlayerInsert[] = (game.availablePlayers ?? []).map((player) => {
      const onFieldPlayer = onFieldMap.get(player.id);
      const isOnField = !!onFieldPlayer;
      const isSelected = selectedIds.has(player.id);

      return {
        id: `${gameId}_${player.id}`,
        game_id: gameId,
        player_id: player.id,
        user_id: userId,
        // Snapshot fields - use onField version if available (more current state)
        player_name: onFieldPlayer?.name ?? player.name,
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
        rel_x: isOnField ? onFieldPlayer!.relX : null,
        rel_y: isOnField ? onFieldPlayer!.relY : null,
      };
    });

    // Build event rows with order_index for ordering
    const eventRows: GameEventInsert[] = (game.gameEvents ?? []).map((e, index) => ({
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
    const assessmentRows: PlayerAssessmentInsert[] = Object.entries(game.assessments ?? {}).map(
      ([playerId, a]) => ({
        id: `assessment_${gameId}_${playerId}`,
        game_id: gameId,
        player_id: playerId,
        user_id: userId,
        overall_rating: a.overall ?? null,
        // CRITICAL: Flatten nested sliders object to individual columns
        intensity: a.sliders?.intensity ?? null,
        courage: a.sliders?.courage ?? null,
        duels: a.sliders?.duels ?? null,
        technique: a.sliders?.technique ?? null,
        creativity: a.sliders?.creativity ?? null,
        decisions: a.sliders?.decisions ?? null,
        awareness: a.sliders?.awareness ?? null,
        teamwork: a.sliders?.teamwork ?? null,
        fair_play: a.sliders?.fair_play ?? null,
        impact: a.sliders?.impact ?? null,
        notes: a.notes ?? null,
        minutes_played: a.minutesPlayed ?? null,
        created_by: a.createdBy ?? 'coach',
        created_at: a.createdAt ?? Date.now(),
      })
    );

    // Build tactical data row
    const tacticalDataRow: GameTacticalDataInsert = {
      id: gameId,
      game_id: gameId,
      user_id: userId,
      // CRITICAL: Default undefined tactical fields for legacy games
      opponents: (game.opponents ?? []) as unknown,
      drawings: (game.drawings ?? []) as unknown,
      tactical_discs: (game.tacticalDiscs ?? []) as unknown,
      tactical_drawings: (game.tacticalDrawings ?? []) as unknown,
      tactical_ball_position: (game.tacticalBallPosition ?? null) as unknown,
      completed_interval_durations: (game.completedIntervalDurations ?? []) as unknown,
      last_sub_confirmation_time_seconds: game.lastSubConfirmationTimeSeconds ?? null,
    };

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
        game_date: game.gameDate,
        // DEFENSIVE: Use || to catch both undefined AND empty string
        home_or_away: game.homeOrAway || 'home',
        number_of_periods: game.numberOfPeriods,
        period_duration_minutes: game.periodDurationMinutes,
        current_period: game.currentPeriod,
        game_status: game.gameStatus,
        // CRITICAL: Local semantics treat undefined as true (legacy migration)
        is_played: game.isPlayed ?? true,
        home_score: game.homeScore,
        away_score: game.awayScore,
        game_notes: game.gameNotes,
        show_player_names: game.showPlayerNames,
        // === Optional fields ===
        sub_interval_minutes: game.subIntervalMinutes ?? null,
        // DEFENSIVE: Guard against NaN/Infinity which PostgreSQL rejects
        demand_factor: (game.demandFactor != null && isFinite(game.demandFactor)) ? game.demandFactor : null,
        game_type: game.gameType ?? null,
        gender: game.gender ?? null,
        // === Array/object fields ===
        game_personnel: game.gamePersonnel ?? [],
        formation_snap_points: (game.formationSnapPoints ?? null) as unknown,
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
    const assessmentsRecord: { [playerId: string]: PlayerAssessment } = {};
    for (const a of assessments) {
      assessmentsRecord[a.player_id] = {
        overall: a.overall_rating ?? 0,
        sliders: {
          intensity: a.intensity ?? 0,
          courage: a.courage ?? 0,
          duels: a.duels ?? 0,
          technique: a.technique ?? 0,
          creativity: a.creativity ?? 0,
          decisions: a.decisions ?? 0,
          awareness: a.awareness ?? 0,
          teamwork: a.teamwork ?? 0,
          fair_play: a.fair_play ?? 0,
          impact: a.impact ?? 0,
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
      homeOrAway: game.home_or_away as 'home' | 'away',
      numberOfPeriods: game.number_of_periods as 1 | 2,
      periodDurationMinutes: game.period_duration_minutes,
      currentPeriod: game.current_period,
      gameStatus: game.game_status as AppState['gameStatus'],
      isPlayed: game.is_played,
      homeScore: game.home_score,
      awayScore: game.away_score,
      gameNotes: game.game_notes,
      showPlayerNames: game.show_player_names,
      // === Optional fields (null → undefined for TypeScript semantics) ===
      subIntervalMinutes: game.sub_interval_minutes ?? undefined,
      demandFactor: game.demand_factor ?? undefined,
      gameType: game.game_type as AppState['gameType'] ?? undefined,
      gender: game.gender as AppState['gender'] ?? undefined,
      // === Array/object fields ===
      gamePersonnel: game.game_personnel ?? [],
      formationSnapPoints: (game.formation_snap_points as Point[] | null) ?? undefined,
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
      opponents: (tacticalData?.opponents as Opponent[] | null) ?? [],
      drawings: (tacticalData?.drawings as Point[][] | null) ?? [],
      tacticalDiscs: (tacticalData?.tactical_discs as TacticalDisc[] | null) ?? [],
      tacticalDrawings: (tacticalData?.tactical_drawings as Point[][] | null) ?? [],
      tacticalBallPosition: (tacticalData?.tactical_ball_position as Point | null) ?? null,
      completedIntervalDurations: (tacticalData?.completed_interval_durations as IntervalLog[] | null) ?? [],
      lastSubConfirmationTimeSeconds: tacticalData?.last_sub_confirmation_time_seconds ?? undefined,
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
    type GameQueryResult = { data: GameRow | null; error: { message: string; code?: string } | null };
    type PlayersQueryResult = { data: GamePlayerRow[] | null; error: { message: string } | null };
    type EventsQueryResult = { data: GameEventRow[] | null; error: { message: string } | null };
    type AssessmentsQueryResult = { data: PlayerAssessmentRow[] | null; error: { message: string } | null };
    type TacticalQueryResult = { data: GameTacticalDataRow | null; error: { message: string; code?: string } | null };

    // Fetch all 5 tables in parallel
    const [gameResult, playersResult, eventsResult, assessmentsResult, tacticalResult] = await Promise.all([
      client.from('games').select('*').eq('id', gameId).single() as unknown as Promise<GameQueryResult>,
      client.from('game_players').select('*').eq('game_id', gameId) as unknown as Promise<PlayersQueryResult>,
      client.from('game_events').select('*').eq('game_id', gameId) as unknown as Promise<EventsQueryResult>,
      client.from('player_assessments').select('*').eq('game_id', gameId) as unknown as Promise<AssessmentsQueryResult>,
      client.from('game_tactical_data').select('*').eq('game_id', gameId).single() as unknown as Promise<TacticalQueryResult>,
    ]);

    // Game not found
    if (gameResult.error || !gameResult.data) {
      return null;
    }

    // Handle errors from child tables (non-fatal since game exists)
    if (playersResult.error) {
      logger.warn(`[SupabaseDataStore] Failed to fetch game_players: ${playersResult.error.message}`);
    }
    if (eventsResult.error) {
      logger.warn(`[SupabaseDataStore] Failed to fetch game_events: ${eventsResult.error.message}`);
    }
    if (assessmentsResult.error) {
      logger.warn(`[SupabaseDataStore] Failed to fetch player_assessments: ${assessmentsResult.error.message}`);
    }
    // Tactical data may legitimately not exist (PGRST116 = not found)
    if (tacticalResult.error && tacticalResult.error.code !== 'PGRST116') {
      logger.warn(`[SupabaseDataStore] Failed to fetch game_tactical_data: ${tacticalResult.error.message}`);
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

    // Fetch all games
    const { data: games, error } = await this.getClient()
      .from('games')
      .select('id')
      .order('created_at', { ascending: false });

    if (error) {
      throw new NetworkError(`Failed to fetch games: ${error.message}`);
    }

    if (!games || games.length === 0) {
      return {};
    }

    // Fetch full data for each game
    const collection: SavedGamesCollection = {};
    for (const { id } of games) {
      const tables = await this.fetchGameTables(id);
      if (tables) {
        collection[id] = this.transformTablesToGame(tables);
      }
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
    this.ensureInitialized();
    checkOnline();

    // Validate using shared helper (Rule #14 - same validation as LocalDataStore)
    validateGame(game);

    const userId = await this.getUserId();
    const tables = this.transformGameToTables(id, game, userId);

    // Use RPC for atomic 5-table write within a single PostgreSQL transaction
    // Type assertion needed: RPC functions are not in generated Supabase types until deployed
    const client = this.getClient();
    const { error } = await (client.rpc as unknown as (fn: string, params: unknown) => Promise<{ error: { message: string } | null }>)(
      'save_game_with_relations',
      {
        p_game: tables.game,
        p_players: tables.players,
        p_events: tables.events,
        p_assessments: tables.assessments,
        p_tactical_data: tables.tacticalData,
      }
    );

    if (error) {
      throw new NetworkError(`Failed to save game: ${error.message}`);
    }

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
    this.ensureInitialized();
    checkOnline();

    // Child tables have ON DELETE CASCADE, so just delete the game
    const { error, count } = await this.getClient()
      .from('games')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      throw new NetworkError(`Failed to delete game: ${error.message}`);
    }

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

  async getPlayerAdjustments(playerId: string): Promise<PlayerStatAdjustment[]> {
    this.ensureInitialized();
    checkOnline();

    const { data, error } = await this.getClient()
      .from('player_adjustments')
      .select('*')
      .eq('player_id', playerId)
      .order('applied_at', { ascending: false });

    if (error) {
      throw new NetworkError(`Failed to fetch player adjustments: ${error.message}`);
    }

    return (data || []).map((row: PlayerAdjustmentRow) => this.transformAdjustmentFromDb(row));
  }

  async addPlayerAdjustment(
    adjustment: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string }
  ): Promise<PlayerStatAdjustment> {
    this.ensureInitialized();
    checkOnline();

    const userId = await this.getUserId();
    const id = adjustment.id || generateId('adjustment');
    const appliedAt = adjustment.appliedAt || new Date().toISOString();

    const dbAdjustment = this.transformAdjustmentToDb(
      { ...adjustment, id, appliedAt } as PlayerStatAdjustment,
      userId
    );

    const { error } = await this.getClient()
      .from('player_adjustments')
       
      .insert(dbAdjustment as unknown as never);

    if (error) {
      throw new NetworkError(`Failed to add player adjustment: ${error.message}`);
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

    // Fetch existing adjustment
    const { data: existing, error: fetchError } = await this.getClient()
      .from('player_adjustments')
      .select('*')
      .eq('id', adjustmentId)
      .eq('player_id', playerId)
      .single();

    if (fetchError || !existing) {
      return null;
    }

    const existingAdjustment = this.transformAdjustmentFromDb(existing as PlayerAdjustmentRow);
    const updated = { ...existingAdjustment, ...patch };
    const userId = await this.getUserId();

    const { error: updateError } = await this.getClient()
      .from('player_adjustments')
       
      .update(this.transformAdjustmentToDb(updated, userId) as unknown as never)
      .eq('id', adjustmentId)
      .eq('player_id', playerId);

    if (updateError) {
      throw new NetworkError(`Failed to update player adjustment: ${updateError.message}`);
    }

    return updated;
  }

  async deletePlayerAdjustment(playerId: string, adjustmentId: string): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    const { error, count } = await this.getClient()
      .from('player_adjustments')
      .delete({ count: 'exact' })
      .eq('id', adjustmentId)
      .eq('player_id', playerId);

    if (error) {
      throw new NetworkError(`Failed to delete player adjustment: ${error.message}`);
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
      homeOrAway: (row.home_or_away as 'home' | 'away' | 'neutral') ?? undefined,
      includeInSeasonTournament: row.include_in_season_tournament ?? true,
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
    return {
      id: adjustment.id,
      user_id: userId,
      player_id: adjustment.playerId,
      season_id: adjustment.seasonId,
      team_id: adjustment.teamId,
      tournament_id: adjustment.tournamentId,
      external_team_name: adjustment.externalTeamName,
      opponent_name: adjustment.opponentName,
      score_for: adjustment.scoreFor,
      score_against: adjustment.scoreAgainst,
      game_date: adjustment.gameDate,
      home_or_away: adjustment.homeOrAway,
      include_in_season_tournament: adjustment.includeInSeasonTournament ?? true,
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
    const { data, error } = await this.getClient()
      .from('warmup_plans')
      .select('*')
      .limit(1)
      .single();

    // PGRST116 = row not found - this is expected if no plan exists
    if (error && error.code !== 'PGRST116') {
      throw new NetworkError(`Failed to fetch warmup plan: ${error.message}`);
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
    const dbPlan = this.transformWarmupPlanToDb(plan, userId);

    const { error } = await this.getClient()
      .from('warmup_plans')
       
      .upsert(dbPlan as unknown as never);

    if (error) {
      throw new NetworkError(`Failed to save warmup plan: ${error.message}`);
    }

    return true;
  }

  async deleteWarmupPlan(): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    // Get user ID for explicit filter (defense in depth - don't rely solely on RLS)
    const userId = await this.getUserId();

    // Delete warmup plan for current user only (should be only one)
    const { error, count } = await this.getClient()
      .from('warmup_plans')
      .delete({ count: 'exact' })
      .eq('user_id', userId);

    if (error) {
      throw new NetworkError(`Failed to delete warmup plan: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }

  // Warmup plan transforms
  private transformWarmupPlanFromDb(row: WarmupPlanRow): WarmupPlan {
    return {
      id: row.id,
      version: row.version,
      lastModified: row.last_modified,
      isDefault: row.is_default,
      sections: (row.sections as WarmupPlanSection[]) ?? [],
    };
  }

  private transformWarmupPlanToDb(plan: WarmupPlan, userId: string): WarmupPlanInsert {
    return {
      id: plan.id,
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
}
