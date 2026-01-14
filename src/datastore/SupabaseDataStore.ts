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
import type { AppState, SavedGamesCollection, GameEvent } from '@/types/game';
import type { Personnel } from '@/types/personnel';
import type { WarmupPlan } from '@/types/warmupPlan';
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
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import { AGE_GROUPS } from '@/config/gameOptions';
import { generateId } from '@/utils/idGenerator';
import { normalizeName, normalizeNameForCompare } from '@/utils/normalization';
import { getClubSeasonForDate } from '@/utils/clubSeason';
import { DEFAULT_CLUB_SEASON_START_DATE, DEFAULT_CLUB_SEASON_END_DATE } from '@/config/clubSeasonDefaults';
import logger from '@/utils/logger';

// Type-safe helper for database operations with placeholder types
// Using explicit any for database operations until proper types are generated from Supabase
//
// TODO(PR #4/#5): Generate proper Supabase types to replace these placeholders
// Run: npx supabase gen types typescript --project-id <project-id> > src/types/supabase.ts
// Then update Database type in src/types/supabase.ts and remove these any-based types
//
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbInsertData = Record<string, any>;
type DbRow = Record<string, any>;

// Row type aliases for readability - these will resolve to proper types after regeneration
type PlayerRow = DbRow;
type TeamRow = DbRow;
type TeamPlayerRow = DbRow;
type SeasonRow = DbRow;
type TournamentRow = DbRow;
type PersonnelRow = DbRow;
type UserSettingsRow = DbRow;
/* eslint-enable @typescript-eslint/no-explicit-any */

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

    // Quick health check
    try {
      const { error } = await this.supabase.from('players').select('id').limit(1);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- placeholder Database types until generated
      .insert(this.transformPlayerToDb(newPlayer, now, userId) as any);

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
      .delete()
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

  private transformPlayerToDb(player: Player, now: string, userId: string): DbInsertData {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- placeholder Database types until generated
      .insert(this.transformTeamToDb(newTeam, userId) as any);

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
      .delete()
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

  private transformTeamToDb(team: Team, userId: string): DbInsertData {
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

  async setTeamRoster(teamId: string, roster: TeamPlayer[]): Promise<void> {
    this.ensureInitialized();
    checkOnline();

    // Delete existing roster
    const { error: deleteError } = await this.getClient()
      .from('team_players')
      .delete()
      .eq('team_id', teamId);

    if (deleteError) {
      throw new NetworkError(`Failed to clear team roster: ${deleteError.message}`);
    }

    if (roster.length === 0) {
      return;
    }

    // Insert new roster
    const now = new Date().toISOString();
    const userId = await this.getUserId();
    const rows = roster.map((player) => this.transformTeamPlayerToDb(teamId, player, now, userId));

    const { error: insertError } = await this.getClient()
      .from('team_players')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- placeholder Database types until generated
      .insert(rows as any);

    if (insertError) {
      throw new NetworkError(`Failed to set team roster: ${insertError.message}`);
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

  private transformTeamPlayerToDb(teamId: string, player: TeamPlayer, now: string, userId: string): DbInsertData {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- placeholder Database types until generated
      .insert(this.transformSeasonToDb(newSeason, now, userId) as any);

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
      .delete()
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

  private transformSeasonToDb(season: Season, now: string, userId: string): DbInsertData {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- placeholder Database types until generated
      .insert(this.transformTournamentToDb(newTournament, now, userId) as any);

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
      .delete()
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
      series: (row.series as TournamentSeries[] | null) ?? undefined,
      archived: row.archived ?? false,
    };
  }

  private transformTournamentToDb(tournament: Tournament, now: string, userId: string): DbInsertData {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- placeholder Database types until generated
      .insert(this.transformPersonnelToDb(newPersonnel, userId) as any);

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

  async removePersonnelMember(id: string): Promise<boolean> {
    this.ensureInitialized();
    checkOnline();

    // NOTE: Cascade delete (removing from games) is handled by the RPC function
    // or will be implemented in PR #4 when games are added.
    // For now, just delete the personnel record.
    const { error, count } = await this.getClient()
      .from('personnel')
      .delete()
      .eq('id', id);

    if (error) {
      throw new NetworkError(`Failed to delete personnel: ${error.message}`);
    }

    return (count ?? 0) > 0;
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

  private transformPersonnelToDb(personnel: Personnel, userId: string): DbInsertData {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- placeholder Database types until generated
      .upsert(this.transformSettingsToDb(settings, userId) as any);

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
    };
  }

  private transformSettingsToDb(settings: AppSettings, userId: string): DbInsertData {
    return {
      user_id: userId,
      current_game_id: settings.currentGameId ?? null,
      last_home_team_name: settings.lastHomeTeamName ?? '',
      language: settings.language ?? 'fi',
      has_seen_app_guide: settings.hasSeenAppGuide ?? false,
      use_demand_correction: settings.useDemandCorrection ?? false,
      has_configured_season_dates: settings.hasConfiguredSeasonDates ?? false,
      club_season_start_date: settings.clubSeasonStartDate ?? null,
      club_season_end_date: settings.clubSeasonEndDate ?? null,
      updated_at: new Date().toISOString(),
    };
  }

  // ==========================================================================
  // GAMES (PR #4 - Stub implementations)
  // ==========================================================================

  async getGames(): Promise<SavedGamesCollection> {
    throw new Error('Games not implemented - PR #4');
  }

  async getGameById(_id: string): Promise<AppState | null> {
    throw new Error('Games not implemented - PR #4');
  }

  async createGame(_game: Partial<AppState>): Promise<{ gameId: string; gameData: AppState }> {
    throw new Error('Games not implemented - PR #4');
  }

  async saveGame(_id: string, _game: AppState): Promise<AppState> {
    throw new Error('Games not implemented - PR #4');
  }

  async saveAllGames(_games: SavedGamesCollection): Promise<void> {
    throw new Error('Games not implemented - PR #4');
  }

  async deleteGame(_id: string): Promise<boolean> {
    throw new Error('Games not implemented - PR #4');
  }

  // ==========================================================================
  // GAME EVENTS (PR #4 - Stub implementations)
  // ==========================================================================

  async addGameEvent(_gameId: string, _event: GameEvent): Promise<AppState | null> {
    throw new Error('Game events not implemented - PR #4');
  }

  async updateGameEvent(_gameId: string, _eventIndex: number, _event: GameEvent): Promise<AppState | null> {
    throw new Error('Game events not implemented - PR #4');
  }

  async removeGameEvent(_gameId: string, _eventIndex: number): Promise<AppState | null> {
    throw new Error('Game events not implemented - PR #4');
  }

  // ==========================================================================
  // PLAYER ADJUSTMENTS (PR #4 - Stub implementations)
  // ==========================================================================

  async getPlayerAdjustments(_playerId: string): Promise<PlayerStatAdjustment[]> {
    throw new Error('Player adjustments not implemented - PR #4');
  }

  async addPlayerAdjustment(
    _adjustment: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string }
  ): Promise<PlayerStatAdjustment> {
    throw new Error('Player adjustments not implemented - PR #4');
  }

  async updatePlayerAdjustment(
    _playerId: string,
    _adjustmentId: string,
    _patch: Partial<PlayerStatAdjustment>
  ): Promise<PlayerStatAdjustment | null> {
    throw new Error('Player adjustments not implemented - PR #4');
  }

  async deletePlayerAdjustment(_playerId: string, _adjustmentId: string): Promise<boolean> {
    throw new Error('Player adjustments not implemented - PR #4');
  }

  // ==========================================================================
  // WARMUP PLAN (PR #4 - Stub implementations)
  // ==========================================================================

  async getWarmupPlan(): Promise<WarmupPlan | null> {
    throw new Error('Warmup plan not implemented - PR #4');
  }

  async saveWarmupPlan(_plan: WarmupPlan): Promise<boolean> {
    throw new Error('Warmup plan not implemented - PR #4');
  }

  async deleteWarmupPlan(): Promise<boolean> {
    throw new Error('Warmup plan not implemented - PR #4');
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
