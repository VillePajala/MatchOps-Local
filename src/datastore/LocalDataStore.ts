/**
 * LocalDataStore
 *
 * IndexedDB-backed implementation of the DataStore interface.
 * Uses direct storage access via @/utils/storage (no manager delegation).
 */

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
import type { Personnel, PersonnelCollection } from '@/types/personnel';
import type { WarmupPlan } from '@/types/warmupPlan';
import type { AppSettings } from '@/types/settings';
import type { TimerState } from '@/utils/timerStateManager';
import type { DataStore } from '@/interfaces/DataStore';
import {
  AlreadyExistsError,
  NotInitializedError,
  ValidationError,
} from '@/interfaces/DataStoreErrors';
import { validateGame } from '@/datastore/validation';
import {
  APP_SETTINGS_KEY,
  LAST_HOME_TEAM_NAME_KEY,
  MASTER_ROSTER_KEY,
  SAVED_GAMES_KEY,
  SEASONS_LIST_KEY,
  TOURNAMENTS_LIST_KEY,
  PLAYER_ADJUSTMENTS_KEY,
  TEAMS_INDEX_KEY,
  TEAM_ROSTERS_KEY,
  PERSONNEL_KEY,
  WARMUP_PLAN_KEY,
  TIMER_STATE_KEY,
} from '@/config/storageKeys';
import { AGE_GROUPS } from '@/config/gameOptions';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import {
  clearAdapterCacheWithCleanup,
  getStorageItem,
  getStorageJSON,
  isIndexedDBAvailable,
  removeStorageItem,
  setStorageItem,
  setStorageJSON,
} from '@/utils/storage';
import { withKeyLock } from '@/utils/storageKeyLock';
import { generateId } from '@/utils/idGenerator';
import logger from '@/utils/logger';
import { normalizeName, normalizeNameForCompare } from '@/utils/normalization';
import { getClubSeasonForDate } from '@/utils/clubSeason';
import { DEFAULT_CLUB_SEASON_START_DATE, DEFAULT_CLUB_SEASON_END_DATE } from '@/config/clubSeasonDefaults';

// Team index storage format: { [teamId: string]: Team }
type TeamsIndex = Record<string, Team>;

// Team rosters storage format: { [teamId: string]: TeamPlayer[] }
type TeamRostersIndex = Record<string, TeamPlayer[]>;

// Player adjustments storage format: { [playerId: string]: PlayerStatAdjustment[] }
type PlayerAdjustmentsIndex = Record<string, PlayerStatAdjustment[]>;

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
 * Calculate club season label from a date string.
 * Uses provided season dates or falls back to defaults.
 *
 * @param gameDate - ISO date string (e.g., "2024-11-15")
 * @param seasonStartDate - Season start date (defaults from DEFAULT_APP_SETTINGS)
 * @param seasonEndDate - Season end date (defaults from DEFAULT_APP_SETTINGS)
 * @returns Club season label (e.g., "24/25") or undefined if no date provided
 */
const calculateClubSeason = (
  gameDate?: string,
  seasonStartDate?: string,
  seasonEndDate?: string
): string | undefined => {
  if (!gameDate) return undefined;
  const result = getClubSeasonForDate(
    gameDate,
    seasonStartDate ?? DEFAULT_APP_SETTINGS.clubSeasonStartDate!,
    seasonEndDate ?? DEFAULT_APP_SETTINGS.clubSeasonEndDate!
  );
  return result;
};

/**
 * Type guard for checking if a value is a plain object (Record).
 *
 * Note: This is a weak structural check that only verifies the value is
 * a non-null, non-array object. It does not validate content or shape.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Type guard for AppSettings with basic field validation.
 * Prevents settings corruption that could break the app.
 */
const isValidAppSettings = (value: unknown): value is Partial<AppSettings> => {
  if (!isRecord(value)) return false;

  // Validate language if present (check type before value)
  if (value.language !== undefined &&
      (typeof value.language !== 'string' || !['en', 'fi'].includes(value.language))) {
    return false;
  }

  // Validate currentGameId if present (must be string or null)
  if (value.currentGameId !== undefined && value.currentGameId !== null && typeof value.currentGameId !== 'string') {
    return false;
  }

  // Validate boolean fields if present
  if (value.hasSeenAppGuide !== undefined && typeof value.hasSeenAppGuide !== 'boolean') {
    return false;
  }

  if (value.useDemandCorrection !== undefined && typeof value.useDemandCorrection !== 'boolean') {
    return false;
  }

  return true;
};

/**
 * Type guard for WarmupPlanSection with field validation.
 */
const isValidWarmupPlanSection = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.title !== 'string') return false;
  if (typeof value.content !== 'string') return false;
  return true;
};

/**
 * Type guard for WarmupPlan with structure validation.
 * Validates that sections is an array and each section has required fields.
 */
const isValidWarmupPlan = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.version !== 'number') return false;
  if (!('sections' in value) || !Array.isArray(value.sections)) return false;

  // Validate each section has required structure
  for (const section of value.sections) {
    if (!isValidWarmupPlanSection(section)) return false;
  }

  return true;
};

const normalizeOptionalString = (value?: string): string | undefined => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

// Team-specific aliases for semantic clarity (use shared normalization utilities)
const normalizeTeamName = normalizeName;
const normalizeTeamNameForCompare = normalizeNameForCompare;

/**
 * Creates a composite key for team uniqueness comparison.
 * Teams with the same name can coexist if they have different context bindings.
 *
 * Key structure: normalizedName[::season:id][::tournament:id][::type:gameType]
 * - Parts are ordered deterministically: name → season → tournament → gameType
 * - Empty/undefined values are omitted (not included in key)
 *
 * Entity reference validation note:
 * - boundSeasonId/boundTournamentId are NOT validated against existing entities
 * - Seasons/tournaments can be deleted after teams reference them
 * - Display layer handles missing references gracefully (see getTeamContextDisplay)
 * - This is intentional: binding persists even if referenced entity is deleted
 *
 * @param name - Normalized team name
 * @param boundSeasonId - Optional season ID for context
 * @param boundTournamentId - Optional tournament ID for context
 * @param boundTournamentSeriesId - Optional tournament series ID for context
 * @param gameType - Optional game type for context
 * @returns Composite key string for uniqueness check
 */
const createTeamCompositeKey = (
  name: string,
  boundSeasonId?: string,
  boundTournamentId?: string,
  boundTournamentSeriesId?: string,
  gameType?: string
): string => {
  const parts = [normalizeTeamNameForCompare(name)];
  if (boundSeasonId) parts.push(`season:${boundSeasonId}`);
  if (boundTournamentId) parts.push(`tournament:${boundTournamentId}`);
  if (boundTournamentSeriesId) parts.push(`series:${boundTournamentSeriesId}`);
  if (gameType) parts.push(`type:${gameType}`);
  return parts.join('::');
};

/**
 * Creates a composite key for season uniqueness checking.
 * Allows same name if any distinguishing factor differs.
 *
 * @param name - Season name
 * @param clubSeason - Club season (e.g., "24/25", "off-season", or undefined)
 * @param gameType - Sport type (soccer/futsal)
 * @param gender - Gender (boys/girls)
 * @param ageGroup - Age group (e.g., "U12", "U14")
 * @param leagueId - League ID
 * @returns Composite key string for uniqueness check
 *
 * @example
 * // These are all DIFFERENT seasons despite same name:
 * "Spring League" + "24/25" + soccer + boys + U12 + sm-sarja
 * "Spring League" + "24/25" + soccer + girls + U12 + sm-sarja  // different gender
 * "Spring League" + "24/25" + futsal + boys + U12 + sm-sarja   // different gameType
 * "Spring League" + "24/25" + soccer + boys + U14 + sm-sarja   // different ageGroup
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
 * Creates a composite key for tournament uniqueness checking.
 * Allows same name if any distinguishing factor differs.
 *
 * @param name - Tournament name
 * @param clubSeason - Club season (e.g., "24/25", "off-season", or undefined)
 * @param gameType - Sport type (soccer/futsal)
 * @param gender - Gender (boys/girls)
 * @param ageGroup - Age group (e.g., "U12", "U14")
 * @returns Composite key string for uniqueness check
 *
 * @example
 * // These are all DIFFERENT tournaments despite same name:
 * "Helsinki Cup" + "24/25" + soccer + boys + U12
 * "Helsinki Cup" + "24/25" + soccer + girls + U12  // different gender
 * "Helsinki Cup" + "24/25" + futsal + boys + U12   // different gameType
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

const convertMonthToDate = (month: number): string => {
  const monthStr = month.toString().padStart(2, '0');
  return `2000-${monthStr}-01`;
};

const generateGameId = (): string => generateId('game');

const migrateTournamentLevel = (tournament: Tournament): Tournament => {
  if (tournament.series && tournament.series.length > 0) {
    return tournament;
  }

  if (tournament.level) {
    const newSeries: TournamentSeries = {
      id: `series_${tournament.id}_${tournament.level.toLowerCase().replace(/\s+/g, '-')}`,
      level: tournament.level,
    };

    return {
      ...tournament,
      series: [newSeries],
    };
  }

  return tournament;
};

// Type for parsed settings with legacy month fields
type ParsedSettingsWithLegacy = AppSettings & {
  clubSeasonStartMonth?: number;
  clubSeasonEndMonth?: number;
};

export class LocalDataStore implements DataStore {
  private initialized = false;
  private settingsMigrated = false;
  private settingsMigrationPromise: Promise<void> | null = null;
  private seasonDatesCache: { start: string; end: string } | null = null;

  /**
   * Gets cached season dates or loads from settings.
   * Used by season/tournament creation to use user-configured dates for clubSeason calculation.
   *
   * @cached - Results are cached until invalidateSettingsCache() is called.
   * Cache is automatically invalidated when updateSettings() modifies season dates.
   */
  private async getSeasonDates(): Promise<{ start: string; end: string }> {
    if (this.seasonDatesCache) {
      return this.seasonDatesCache;
    }

    // Load settings to get user-configured dates
    const settings = await this.getSettings();
    this.seasonDatesCache = {
      start: settings.clubSeasonStartDate ?? DEFAULT_APP_SETTINGS.clubSeasonStartDate!,
      end: settings.clubSeasonEndDate ?? DEFAULT_APP_SETTINGS.clubSeasonEndDate!,
    };
    return this.seasonDatesCache;
  }

  /**
   * Invalidates the season dates cache.
   * Called automatically by updateSettings() when clubSeasonStartDate or clubSeasonEndDate changes.
   * Next call to getSeasonDates() will reload fresh values from storage.
   */
  public invalidateSettingsCache(): void {
    this.seasonDatesCache = null;
  }

  /**
   * Migrate legacy month-based season date fields to date format.
   * Used by both getSettings and updateSettings to ensure consistent migration.
   * @param parsed - Parsed settings from storage (may contain legacy fields)
   * @returns Object with migrated settings and flag indicating if migration occurred
   */
  private migrateSeasonDates(parsed: ParsedSettingsWithLegacy): {
    settings: AppSettings;
    needsMigration: boolean;
  } {
    const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, ...parsed };
    let needsMigration = false;

    if (parsed.clubSeasonStartMonth !== undefined && !parsed.clubSeasonStartDate) {
      settings.clubSeasonStartDate = convertMonthToDate(parsed.clubSeasonStartMonth);
      settings.hasConfiguredSeasonDates = true;
      needsMigration = true;
    }

    if (parsed.clubSeasonEndMonth !== undefined && !parsed.clubSeasonEndDate) {
      settings.clubSeasonEndDate = convertMonthToDate(parsed.clubSeasonEndMonth);
      settings.hasConfiguredSeasonDates = true;
      needsMigration = true;
    }

    return { settings, needsMigration };
  }

  /**
   * Remove legacy month fields from settings before saving.
   * @param settings - Settings object that may contain legacy fields
   * @returns Clean settings object without legacy fields
   */
  private removeLegacyMonthFields(settings: AppSettings): AppSettings {
    const clean = { ...settings } as ParsedSettingsWithLegacy;
    delete clean.clubSeasonStartMonth;
    delete clean.clubSeasonEndMonth;
    return clean;
  }

  /**
   * Merge parsed settings with defaults.
   * @param parsed - Parsed settings from storage (may be null)
   * @returns Complete settings with defaults applied
   */
  private mergeWithDefaults(parsed: Partial<AppSettings> | null): AppSettings {
    return parsed ? { ...DEFAULT_APP_SETTINGS, ...parsed } : { ...DEFAULT_APP_SETTINGS };
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    this.initialized = false;
    this.settingsMigrated = false;
    this.settingsMigrationPromise = null;
    this.seasonDatesCache = null;
    await clearAdapterCacheWithCleanup();
  }

  getBackendName(): string {
    return 'local';
  }

  async isAvailable(): Promise<boolean> {
    return isIndexedDBAvailable();
  }

  async getPlayers(): Promise<Player[]> {
    this.ensureInitialized();
    return this.loadPlayers();
  }

  async createPlayer(player: Omit<Player, 'id'>): Promise<Player> {
    this.ensureInitialized();

    const trimmedName = player.name?.trim();
    if (!trimmedName) {
      throw new ValidationError('Player name cannot be empty', 'name', player.name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.PLAYER_NAME_MAX) {
      throw new ValidationError(`Player name cannot exceed ${VALIDATION_LIMITS.PLAYER_NAME_MAX} characters (got ${trimmedName.length})`, 'name', player.name);
    }

    return withKeyLock(MASTER_ROSTER_KEY, async () => {
      const roster = await this.loadPlayers();
      const newPlayer: Player = {
        ...player,
        id: generateId('player'),
        name: trimmedName,
        nickname: player.nickname?.trim() || undefined,
        isGoalie: player.isGoalie ?? false,
        receivedFairPlayCard: player.receivedFairPlayCard ?? false,
      };

      roster.push(newPlayer);
      await setStorageItem(MASTER_ROSTER_KEY, JSON.stringify(roster));
      return newPlayer;
    });
  }

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player | null> {
    this.ensureInitialized();

    if (updates.name !== undefined) {
      const trimmedName = updates.name.trim();
      if (!trimmedName) {
        throw new ValidationError('Player name cannot be empty', 'name', updates.name);
      }
      if (trimmedName.length > VALIDATION_LIMITS.PLAYER_NAME_MAX) {
        throw new ValidationError(`Player name cannot exceed ${VALIDATION_LIMITS.PLAYER_NAME_MAX} characters (got ${trimmedName.length})`, 'name', updates.name);
      }
    }

    return withKeyLock(MASTER_ROSTER_KEY, async () => {
      const roster = await this.loadPlayers();
      const playerIndex = roster.findIndex((player) => player.id === id);

      if (playerIndex === -1) {
        return null;
      }

      const updatedPlayer: Player = {
        ...roster[playerIndex],
        ...updates,
      };

      if (updatedPlayer.name) {
        updatedPlayer.name = updatedPlayer.name.trim();
      }
      // Normalize nickname: trim whitespace, convert empty to undefined
      if (updatedPlayer.nickname !== undefined) {
        const trimmed = updatedPlayer.nickname.trim();
        updatedPlayer.nickname = trimmed || undefined;
      }

      roster[playerIndex] = updatedPlayer;
      await setStorageItem(MASTER_ROSTER_KEY, JSON.stringify(roster));

      return updatedPlayer;
    });
  }

  async deletePlayer(id: string): Promise<boolean> {
    this.ensureInitialized();

    return withKeyLock(MASTER_ROSTER_KEY, async () => {
      const roster = await this.loadPlayers();
      const updatedRoster = roster.filter((player) => player.id !== id);

      if (updatedRoster.length === roster.length) {
        return false;
      }

      await setStorageItem(MASTER_ROSTER_KEY, JSON.stringify(updatedRoster));
      return true;
    });
  }

  /**
   * Upsert a player (insert or update if exists).
   * Used by reverse migration to preserve IDs from cloud.
   */
  async upsertPlayer(player: Player): Promise<Player> {
    this.ensureInitialized();

    const trimmedName = player.name?.trim();
    if (!trimmedName) {
      throw new ValidationError('Player name cannot be empty', 'name', player.name);
    }

    return withKeyLock(MASTER_ROSTER_KEY, async () => {
      const roster = await this.loadPlayers();
      const existingIndex = roster.findIndex((p) => p.id === player.id);

      const normalizedPlayer: Player = {
        ...player,
        name: trimmedName,
        nickname: player.nickname?.trim() || undefined,
        isGoalie: player.isGoalie ?? false,
        receivedFairPlayCard: player.receivedFairPlayCard ?? false,
      };

      if (existingIndex !== -1) {
        roster[existingIndex] = normalizedPlayer;
      } else {
        roster.push(normalizedPlayer);
      }

      await setStorageItem(MASTER_ROSTER_KEY, JSON.stringify(roster));
      return normalizedPlayer;
    });
  }

  async getTeams(includeArchived = false): Promise<Team[]> {
    this.ensureInitialized();

    return Object.values(await this.loadTeamsIndex()).filter(
      (team) => includeArchived || !team.archived
    );
  }

  async getTeamById(id: string): Promise<Team | null> {
    this.ensureInitialized();

    const teamsIndex = await this.loadTeamsIndex();
    return teamsIndex[id] || null;
  }

  async createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team> {
    this.ensureInitialized();

    const trimmedName = normalizeTeamName(team.name);
    if (!trimmedName) {
      throw new ValidationError('Team name cannot be empty', 'name', team.name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.TEAM_NAME_MAX) {
      throw new ValidationError(`Team name cannot exceed ${VALIDATION_LIMITS.TEAM_NAME_MAX} characters (got ${trimmedName.length})`, 'name', team.name);
    }

    const normalizedAgeGroup = normalizeOptionalString(team.ageGroup);
    if (normalizedAgeGroup && !AGE_GROUPS.includes(normalizedAgeGroup)) {
      throw new ValidationError('Invalid age group', 'ageGroup', team.ageGroup);
    }

    const normalizedNotes = normalizeOptionalString(team.notes);
    if (normalizedNotes && normalizedNotes.length > VALIDATION_LIMITS.TEAM_NOTES_MAX) {
      throw new ValidationError(`Team notes cannot exceed ${VALIDATION_LIMITS.TEAM_NOTES_MAX} characters (got ${normalizedNotes.length})`, 'notes', team.notes);
    }

    // Validate series binding requires tournament binding
    if (team.boundTournamentSeriesId && !team.boundTournamentId) {
      throw new ValidationError('Cannot bind to tournament series without binding to tournament', 'boundTournamentSeriesId', team.boundTournamentSeriesId);
    }

    return withKeyLock(TEAMS_INDEX_KEY, async () => {
      const teamsIndex = await this.loadTeamsIndex();

      // Use composite key for uniqueness: name + context bindings
      const compositeKey = createTeamCompositeKey(
        trimmedName,
        team.boundSeasonId,
        team.boundTournamentId,
        team.boundTournamentSeriesId,
        team.gameType
      );
      const duplicateExists = Object.values(teamsIndex).some(existing =>
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
        archived: team.archived,
        createdAt: now,
        updatedAt: now,
      };

      teamsIndex[newTeam.id] = newTeam;
      await setStorageItem(TEAMS_INDEX_KEY, JSON.stringify(teamsIndex));
      await this.setTeamRoster(newTeam.id, []);

      return newTeam;
    });
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | null> {
    this.ensureInitialized();

    if (updates.name !== undefined) {
      const trimmedName = normalizeTeamName(updates.name);
      if (!trimmedName) {
        throw new ValidationError('Team name cannot be empty', 'name', updates.name);
      }

      if (trimmedName.length > VALIDATION_LIMITS.TEAM_NAME_MAX) {
        throw new ValidationError(`Team name cannot exceed ${VALIDATION_LIMITS.TEAM_NAME_MAX} characters (got ${trimmedName.length})`, 'name', updates.name);
      }

      updates.name = trimmedName;
    }

    if (updates.notes !== undefined) {
      const normalizedNotes = normalizeOptionalString(updates.notes);
      if (normalizedNotes && normalizedNotes.length > VALIDATION_LIMITS.TEAM_NOTES_MAX) {
        throw new ValidationError(`Team notes cannot exceed ${VALIDATION_LIMITS.TEAM_NOTES_MAX} characters (got ${normalizedNotes.length})`, 'notes', updates.notes);
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

    return withKeyLock(TEAMS_INDEX_KEY, async () => {
      const teamsIndex = await this.loadTeamsIndex();
      const existing = teamsIndex[id];

      if (!existing) {
        return null;
      }

      // Check for duplicates using composite key (final state after updates)
      // Use 'key' in updates to detect explicit undefined values (e.g., clearing a field)
      const finalName = updates.name || existing.name;
      const finalSeasonId = 'boundSeasonId' in updates ? updates.boundSeasonId : existing.boundSeasonId;
      const finalTournamentId = 'boundTournamentId' in updates ? updates.boundTournamentId : existing.boundTournamentId;
      const finalSeriesId = 'boundTournamentSeriesId' in updates ? updates.boundTournamentSeriesId : existing.boundTournamentSeriesId;
      const finalGameType = 'gameType' in updates ? updates.gameType : existing.gameType;

      // Validate series binding requires tournament binding
      if (finalSeriesId && !finalTournamentId) {
        throw new ValidationError('Cannot bind to tournament series without binding to tournament', 'boundTournamentSeriesId', finalSeriesId);
      }

      const compositeKey = createTeamCompositeKey(finalName, finalSeasonId, finalTournamentId, finalSeriesId, finalGameType);
      const duplicateExists = Object.values(teamsIndex).some(team =>
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

      teamsIndex[id] = updatedTeam;
      await setStorageItem(TEAMS_INDEX_KEY, JSON.stringify(teamsIndex));
      return updatedTeam;
    });
  }

  async deleteTeam(id: string): Promise<boolean> {
    this.ensureInitialized();

    return withKeyLock(TEAMS_INDEX_KEY, async () => {
      const teamsIndex = await this.loadTeamsIndex();
      if (!teamsIndex[id]) {
        return false;
      }

      delete teamsIndex[id];
      await setStorageItem(TEAMS_INDEX_KEY, JSON.stringify(teamsIndex));
      return true;
    });
  }

  /**
   * Upsert a team (insert or update if exists).
   * Used by reverse migration to preserve IDs from cloud.
   */
  async upsertTeam(team: Team): Promise<Team> {
    this.ensureInitialized();

    const trimmedName = normalizeTeamName(team.name);
    if (!trimmedName) {
      throw new ValidationError('Team name cannot be empty', 'name', team.name);
    }

    return withKeyLock(TEAMS_INDEX_KEY, async () => {
      const teamsIndex = await this.loadTeamsIndex();

      const normalizedTeam: Team = {
        ...team,
        name: trimmedName,
        notes: normalizeOptionalString(team.notes),
        ageGroup: normalizeOptionalString(team.ageGroup),
      };

      teamsIndex[team.id] = normalizedTeam;
      await setStorageItem(TEAMS_INDEX_KEY, JSON.stringify(teamsIndex));
      return normalizedTeam;
    });
  }

  /**
   * Get team roster. Raw storage operation - no locking.
   * Callers (teams.ts) are responsible for atomicity via withRosterLock.
   */
  async getTeamRoster(teamId: string): Promise<TeamPlayer[]> {
    this.ensureInitialized();

    const rostersIndex = await this.loadTeamRosters();
    return rostersIndex[teamId] || [];
  }

  /**
   * Set team roster. Raw storage operation - no locking.
   * Callers (teams.ts) are responsible for atomicity via withRosterLock.
   */
  async setTeamRoster(teamId: string, roster: TeamPlayer[]): Promise<void> {
    this.ensureInitialized();

    const rostersIndex = await this.loadTeamRosters();
    rostersIndex[teamId] = roster;
    await setStorageItem(TEAM_ROSTERS_KEY, JSON.stringify(rostersIndex));
  }

  /**
   * Get all team rosters as an index.
   */
  async getAllTeamRosters(): Promise<Record<string, TeamPlayer[]>> {
    this.ensureInitialized();
    return await this.loadTeamRosters();
  }

  async getSeasons(includeArchived = false): Promise<Season[]> {
    this.ensureInitialized();

    const seasons = await this.loadSeasons();
    const { start, end } = await this.getSeasonDates();
    return seasons
      .filter((season) => includeArchived || !season.archived)
      .map((season) => ({
        ...season,
        ageGroup: season.ageGroup ?? undefined,
        // Compute clubSeason on-the-fly for backward compatibility
        clubSeason: season.clubSeason ?? calculateClubSeason(season.startDate, start, end),
      }));
  }

  async createSeason(name: string, extra?: Partial<Omit<Season, 'id' | 'name'>>): Promise<Season> {
    this.ensureInitialized();

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new ValidationError('Season name cannot be empty', 'name', name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.SEASON_NAME_MAX) {
      throw new ValidationError(`Season name cannot exceed ${VALIDATION_LIMITS.SEASON_NAME_MAX} characters (got ${trimmedName.length})`, 'name', name);
    }

    const normalizedAgeGroup = normalizeOptionalString(extra?.ageGroup);
    if (normalizedAgeGroup && !AGE_GROUPS.includes(normalizedAgeGroup)) {
      throw new ValidationError('Invalid age group', 'ageGroup', extra?.ageGroup);
    }

    // Get user-configured season dates before acquiring lock
    const { start, end } = await this.getSeasonDates();

    return withKeyLock(SEASONS_LIST_KEY, async () => {
      const currentSeasons = await this.loadSeasons();

      // Calculate clubSeason first to use in uniqueness check
      const newClubSeason = calculateClubSeason(extra?.startDate, start, end);

      // Allow same name if any distinguishing factor differs
      const compositeKey = createSeasonCompositeKey(
        trimmedName,
        newClubSeason,
        extra?.gameType,
        extra?.gender,
        extra?.ageGroup,
        extra?.leagueId
      );
      const duplicateExists = currentSeasons.some(
        (season) => createSeasonCompositeKey(
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

      const newSeason: Season = {
        id: generateId('season'),
        name: trimmedName,
        ...(extra || {}),
        clubSeason: newClubSeason,
      };

      await setStorageItem(SEASONS_LIST_KEY, JSON.stringify([...currentSeasons, newSeason]));
      return newSeason;
    });
  }

  async updateSeason(season: Season): Promise<Season | null> {
    this.ensureInitialized();

    const trimmedName = season.name?.trim();
    if (!season.id || !trimmedName) {
      throw new ValidationError('Season name cannot be empty', 'name', season.name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.SEASON_NAME_MAX) {
      throw new ValidationError(`Season name cannot exceed ${VALIDATION_LIMITS.SEASON_NAME_MAX} characters (got ${trimmedName.length})`, 'name', season.name);
    }

    const normalizedAgeGroup = normalizeOptionalString(season.ageGroup);
    if (normalizedAgeGroup && !AGE_GROUPS.includes(normalizedAgeGroup)) {
      throw new ValidationError('Invalid age group', 'ageGroup', season.ageGroup);
    }

    // Get user-configured season dates before acquiring lock
    const { start, end } = await this.getSeasonDates();

    return withKeyLock(SEASONS_LIST_KEY, async () => {
      const currentSeasons = await this.loadSeasons();
      const seasonIndex = currentSeasons.findIndex((item) => item.id === season.id);

      if (seasonIndex === -1) {
        return null;
      }

      // Recalculate clubSeason from startDate
      const newClubSeason = calculateClubSeason(season.startDate, start, end);

      // Allow same name if any distinguishing factor differs
      const compositeKey = createSeasonCompositeKey(
        trimmedName,
        newClubSeason,
        season.gameType,
        season.gender,
        season.ageGroup,
        season.leagueId
      );
      const duplicateExists = currentSeasons.some(
        (item) => item.id !== season.id && createSeasonCompositeKey(
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
      currentSeasons[seasonIndex] = updatedSeason;
      await setStorageItem(SEASONS_LIST_KEY, JSON.stringify(currentSeasons));

      return updatedSeason;
    });
  }

  async deleteSeason(id: string): Promise<boolean> {
    this.ensureInitialized();

    return withKeyLock(SEASONS_LIST_KEY, async () => {
      const currentSeasons = await this.loadSeasons();
      const nextSeasons = currentSeasons.filter((season) => season.id !== id);

      if (nextSeasons.length === currentSeasons.length) {
        return false;
      }

      await setStorageItem(SEASONS_LIST_KEY, JSON.stringify(nextSeasons));
      return true;
    });
  }

  /**
   * Upsert a season - insert if not exists, update if exists.
   * Used for reverse migration to preserve cloud IDs.
   *
   * @param season - The season to upsert (must have an ID)
   * @returns The upserted season
   */
  async upsertSeason(season: Season): Promise<Season> {
    this.ensureInitialized();

    const trimmedName = season.name?.trim();
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

    return withKeyLock(SEASONS_LIST_KEY, async () => {
      const currentSeasons = await this.loadSeasons();
      const existingIndex = currentSeasons.findIndex((s) => s.id === season.id);

      const clubSeason = calculateClubSeason(season.startDate, start, end);

      const normalizedSeason: Season = {
        ...season,
        name: trimmedName,
        ageGroup: normalizedAgeGroup ?? undefined,
        notes: normalizeOptionalString(season.notes) ?? undefined,
        clubSeason,
      };

      if (existingIndex !== -1) {
        // Update existing
        currentSeasons[existingIndex] = normalizedSeason;
      } else {
        // Insert new
        currentSeasons.push(normalizedSeason);
      }

      await setStorageItem(SEASONS_LIST_KEY, JSON.stringify(currentSeasons));
      return normalizedSeason;
    });
  }

  async getTournaments(includeArchived = false): Promise<Tournament[]> {
    this.ensureInitialized();

    const tournaments = await this.loadTournaments();
    const { start, end } = await this.getSeasonDates();
    // Filter first, then map - avoids migrating tournaments that will be filtered out
    return tournaments
      .filter((tournament) => includeArchived || !tournament.archived)
      .map((tournament) =>
        migrateTournamentLevel({
          ...tournament,
          level: tournament.level ?? undefined,
          ageGroup: tournament.ageGroup ?? undefined,
          // Compute clubSeason on-the-fly for backward compatibility
          clubSeason: tournament.clubSeason ?? calculateClubSeason(tournament.startDate, start, end),
        })
      );
  }

  async createTournament(
    name: string,
    extra?: Partial<Omit<Tournament, 'id' | 'name'>>
  ): Promise<Tournament> {
    this.ensureInitialized();

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new ValidationError('Tournament name cannot be empty', 'name', name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.TOURNAMENT_NAME_MAX) {
      throw new ValidationError(`Tournament name cannot exceed ${VALIDATION_LIMITS.TOURNAMENT_NAME_MAX} characters (got ${trimmedName.length})`, 'name', name);
    }

    const normalizedAgeGroup = normalizeOptionalString(extra?.ageGroup);
    if (normalizedAgeGroup && !AGE_GROUPS.includes(normalizedAgeGroup)) {
      throw new ValidationError('Invalid age group', 'ageGroup', extra?.ageGroup);
    }

    // Get user-configured season dates before acquiring lock
    const { start, end } = await this.getSeasonDates();

    return withKeyLock(TOURNAMENTS_LIST_KEY, async () => {
      const currentTournaments = await this.loadTournaments();

      // Calculate clubSeason first to use in uniqueness check
      const newClubSeason = calculateClubSeason(extra?.startDate, start, end);

      // Allow same name if any distinguishing factor differs
      const compositeKey = createTournamentCompositeKey(
        trimmedName,
        newClubSeason,
        extra?.gameType,
        extra?.gender,
        extra?.ageGroup
      );
      const duplicateExists = currentTournaments.some(
        (tournament) => createTournamentCompositeKey(
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

      const { level, ageGroup, ...rest } = extra || {};
      const newTournament: Tournament = {
        id: generateId('tournament'),
        name: trimmedName,
        ...rest,
        ...(level ? { level } : {}),
        ...(ageGroup ? { ageGroup } : {}),
        clubSeason: newClubSeason,
      };

      await setStorageItem(TOURNAMENTS_LIST_KEY, JSON.stringify([...currentTournaments, newTournament]));
      return newTournament;
    });
  }

  async updateTournament(tournament: Tournament): Promise<Tournament | null> {
    this.ensureInitialized();

    const trimmedName = tournament.name?.trim();
    if (!tournament.id || !trimmedName) {
      throw new ValidationError('Tournament name cannot be empty', 'name', tournament.name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.TOURNAMENT_NAME_MAX) {
      throw new ValidationError(`Tournament name cannot exceed ${VALIDATION_LIMITS.TOURNAMENT_NAME_MAX} characters (got ${trimmedName.length})`, 'name', tournament.name);
    }

    const normalizedAgeGroup = normalizeOptionalString(tournament.ageGroup);
    if (normalizedAgeGroup && !AGE_GROUPS.includes(normalizedAgeGroup)) {
      throw new ValidationError('Invalid age group', 'ageGroup', tournament.ageGroup);
    }

    // Get user-configured season dates before acquiring lock
    const { start, end } = await this.getSeasonDates();

    return withKeyLock(TOURNAMENTS_LIST_KEY, async () => {
      const currentTournaments = await this.loadTournaments();
      const tournamentIndex = currentTournaments.findIndex((item) => item.id === tournament.id);

      if (tournamentIndex === -1) {
        return null;
      }

      // Recalculate clubSeason from startDate
      const newClubSeason = calculateClubSeason(tournament.startDate, start, end);

      // Allow same name if any distinguishing factor differs
      const compositeKey = createTournamentCompositeKey(
        trimmedName,
        newClubSeason,
        tournament.gameType,
        tournament.gender,
        tournament.ageGroup
      );
      const duplicateExists = currentTournaments.some(
        (item) => item.id !== tournament.id && createTournamentCompositeKey(
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
        ...currentTournaments[tournamentIndex],
        ...tournament,
        name: trimmedName,
        clubSeason: newClubSeason,
      };

      currentTournaments[tournamentIndex] = updatedTournament;
      await setStorageItem(TOURNAMENTS_LIST_KEY, JSON.stringify(currentTournaments));

      return updatedTournament;
    });
  }

  async deleteTournament(id: string): Promise<boolean> {
    this.ensureInitialized();

    return withKeyLock(TOURNAMENTS_LIST_KEY, async () => {
      const currentTournaments = await this.loadTournaments();
      const nextTournaments = currentTournaments.filter((tournament) => tournament.id !== id);

      if (nextTournaments.length === currentTournaments.length) {
        return false;
      }

      await setStorageItem(TOURNAMENTS_LIST_KEY, JSON.stringify(nextTournaments));
      return true;
    });
  }

  /**
   * Upsert a tournament - insert if not exists, update if exists.
   * Used for reverse migration to preserve cloud IDs.
   *
   * @param tournament - The tournament to upsert (must have an ID)
   * @returns The upserted tournament
   */
  async upsertTournament(tournament: Tournament): Promise<Tournament> {
    this.ensureInitialized();

    const trimmedName = tournament.name?.trim();
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

    return withKeyLock(TOURNAMENTS_LIST_KEY, async () => {
      const currentTournaments = await this.loadTournaments();
      const existingIndex = currentTournaments.findIndex((t) => t.id === tournament.id);

      const clubSeason = calculateClubSeason(tournament.startDate, start, end);

      const normalizedTournament: Tournament = {
        ...tournament,
        name: trimmedName,
        ageGroup: normalizedAgeGroup ?? undefined,
        level: normalizeOptionalString(tournament.level) ?? undefined,
        notes: normalizeOptionalString(tournament.notes) ?? undefined,
        clubSeason,
      };

      if (existingIndex !== -1) {
        // Update existing
        currentTournaments[existingIndex] = normalizedTournament;
      } else {
        // Insert new
        currentTournaments.push(normalizedTournament);
      }

      await setStorageItem(TOURNAMENTS_LIST_KEY, JSON.stringify(currentTournaments));
      return normalizedTournament;
    });
  }

  async getAllPersonnel(): Promise<Personnel[]> {
    this.ensureInitialized();

    const collection = await this.loadPersonnelCollection();
    return Object.values(collection).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getPersonnelById(id: string): Promise<Personnel | null> {
    this.ensureInitialized();

    const collection = await this.loadPersonnelCollection();
    return collection[id] || null;
  }

  async addPersonnelMember(
    data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Personnel> {
    this.ensureInitialized();

    const trimmedName = data.name?.trim();
    if (!trimmedName) {
      throw new ValidationError('Personnel name cannot be empty', 'name', data.name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.PERSONNEL_NAME_MAX) {
      throw new ValidationError(`Personnel name cannot exceed ${VALIDATION_LIMITS.PERSONNEL_NAME_MAX} characters (got ${trimmedName.length})`, 'name', data.name);
    }

    return withKeyLock(PERSONNEL_KEY, async () => {
      const collection = await this.loadPersonnelCollection();
      const existingPersonnel = Object.values(collection);
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
        createdAt: now,
        updatedAt: now,
      };

      collection[newPersonnel.id] = newPersonnel;
      await setStorageItem(PERSONNEL_KEY, JSON.stringify(collection));
      return newPersonnel;
    });
  }

  async updatePersonnelMember(
    id: string,
    updates: Partial<Personnel>
  ): Promise<Personnel | null> {
    this.ensureInitialized();

    return withKeyLock(PERSONNEL_KEY, async () => {
      const collection = await this.loadPersonnelCollection();
      const existing = collection[id];

      if (!existing) {
        return null;
      }

      if (updates.name !== undefined) {
        const trimmedName = updates.name.trim();
        if (!trimmedName) {
          throw new ValidationError('Personnel name cannot be empty', 'name', updates.name);
        }

        if (trimmedName.length > VALIDATION_LIMITS.PERSONNEL_NAME_MAX) {
          throw new ValidationError(`Personnel name cannot exceed ${VALIDATION_LIMITS.PERSONNEL_NAME_MAX} characters (got ${trimmedName.length})`, 'name', updates.name);
        }

        const normalizedName = normalizeNameForCompare(trimmedName);
        const nameExists = Object.values(collection).some(
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
        id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };

      collection[id] = updated;
      await setStorageItem(PERSONNEL_KEY, JSON.stringify(collection));
      return updated;
    });
  }

  /**
   * Upsert a personnel member - insert if not exists, update if exists.
   * Used for reverse migration to preserve cloud IDs.
   *
   * @param personnel - The personnel to upsert (must have an ID)
   * @returns The upserted personnel
   */
  async upsertPersonnelMember(personnel: Personnel): Promise<Personnel> {
    this.ensureInitialized();

    const trimmedName = personnel.name?.trim();
    if (!trimmedName) {
      throw new ValidationError('Personnel name cannot be empty', 'name', personnel.name);
    }

    if (trimmedName.length > VALIDATION_LIMITS.PERSONNEL_NAME_MAX) {
      throw new ValidationError(
        `Personnel name cannot exceed ${VALIDATION_LIMITS.PERSONNEL_NAME_MAX} characters (got ${trimmedName.length})`,
        'name',
        personnel.name
      );
    }

    return withKeyLock(PERSONNEL_KEY, async () => {
      const collection = await this.loadPersonnelCollection();
      const existing = collection[personnel.id];

      const now = new Date().toISOString();

      const normalizedPersonnel: Personnel = {
        ...personnel,
        name: trimmedName,
        createdAt: existing?.createdAt ?? personnel.createdAt ?? now,
        updatedAt: now,
      };

      collection[personnel.id] = normalizedPersonnel;
      await setStorageItem(PERSONNEL_KEY, JSON.stringify(collection));
      return normalizedPersonnel;
    });
  }

  /**
   * Remove a personnel member and cascade delete references.
   *
   * @remarks
   * CASCADE DELETE: Removes personnel ID from all games' gamePersonnel arrays.
   * Uses atomic backup/rollback pattern for data integrity - if any operation
   * fails, both personnel and games are restored to their pre-deletion state.
   *
   * @param id - The personnel member ID to remove
   * @returns true if deleted, false if not found
   * @throws Error if cascade delete fails and rollback also fails (data may be inconsistent)
   */
  async removePersonnelMember(id: string): Promise<boolean> {
    this.ensureInitialized();

    return withKeyLock(PERSONNEL_KEY, async () => {
      return withKeyLock(SAVED_GAMES_KEY, async () => {
        // Backup for rollback: Personnel IDs are only referenced in games via gamePersonnel[].
        // Seasons, tournaments, and teams have free-text notes fields (not ID references),
        // so they are unaffected by cascade delete and don't need backup.
        const backup = {
          personnel: await this.loadPersonnelCollection(),
          games: await this.loadSavedGames(),
        };

        try {
          const collection = await this.loadPersonnelCollection();
          if (!collection[id]) {
            return false;
          }

          const games = await this.loadSavedGames();
          let gamesUpdated = 0;

          for (const [gameId, gameState] of Object.entries(games)) {
            if (gameState.gamePersonnel?.includes(id)) {
              gameState.gamePersonnel = gameState.gamePersonnel.filter((personnelId) => personnelId !== id);
              games[gameId] = gameState;
              gamesUpdated++;
            }
          }

          if (gamesUpdated > 0) {
            await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(games));
          }

          delete collection[id];
          await setStorageItem(PERSONNEL_KEY, JSON.stringify(collection));

          return true;
        } catch (error) {
          try {
            await setStorageItem(PERSONNEL_KEY, JSON.stringify(backup.personnel));
            await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(backup.games));

            // Verify rollback succeeded by re-reading data
            const restoredPersonnel = await this.loadPersonnelCollection();
            const restoredGames = await this.loadSavedGames();

            const personnelRestored = Object.keys(restoredPersonnel).length === Object.keys(backup.personnel).length;
            const gamesRestored = Object.keys(restoredGames).length === Object.keys(backup.games).length;

            if (!personnelRestored || !gamesRestored) {
              logger.error('Rollback verification failed - data may be inconsistent', {
                originalError: error,
                personnelId: id,
                expectedPersonnelCount: Object.keys(backup.personnel).length,
                actualPersonnelCount: Object.keys(restoredPersonnel).length,
                expectedGamesCount: Object.keys(backup.games).length,
                actualGamesCount: Object.keys(restoredGames).length,
              });
              throw new Error('CASCADE DELETE rollback verification failed - data may be inconsistent');
            }
          } catch (rollbackError) {
            logger.error('Rollback failed after personnel deletion error', {
              originalError: error,
              rollbackError,
              personnelId: id,
            });
            throw new Error(`CASCADE DELETE failed and rollback also failed: ${rollbackError}`);
          }

          logger.error('Error removing personnel member (rolled back):', error);
          throw error;
        }
      });
    });
  }

  async getGames(): Promise<SavedGamesCollection> {
    this.ensureInitialized();
    return this.loadSavedGames();
  }

  async getGameById(id: string): Promise<AppState | null> {
    this.ensureInitialized();

    const games = await this.loadSavedGames();
    return games[id] || null;
  }

  async createGame(game: Partial<AppState>): Promise<{ gameId: string; gameData: AppState }> {
    this.ensureInitialized();

    if (game.gameNotes && game.gameNotes.length > VALIDATION_LIMITS.GAME_NOTES_MAX) {
      throw new ValidationError(`Game notes cannot exceed ${VALIDATION_LIMITS.GAME_NOTES_MAX} characters (got ${game.gameNotes.length})`, 'gameNotes', game.gameNotes);
    }

    if (game.ageGroup && !AGE_GROUPS.includes(game.ageGroup)) {
      throw new ValidationError('Invalid age group', 'ageGroup', game.ageGroup);
    }

    const gameId = generateGameId();
    const newGame: AppState = {
      playersOnField: game.playersOnField || [],
      opponents: game.opponents || [],
      drawings: game.drawings || [],
      availablePlayers: game.availablePlayers || [],
      showPlayerNames: game.showPlayerNames === undefined ? true : game.showPlayerNames,
      teamName: game.teamName || 'My Team',
      gameEvents: game.gameEvents || [],
      opponentName: game.opponentName || 'Opponent',
      gameDate: game.gameDate || new Date().toISOString().split('T')[0],
      homeScore: game.homeScore || 0,
      awayScore: game.awayScore || 0,
      gameNotes: game.gameNotes || '',
      homeOrAway: game.homeOrAway || 'home',
      numberOfPeriods: game.numberOfPeriods || 2,
      periodDurationMinutes: game.periodDurationMinutes || 10,
      currentPeriod: game.currentPeriod || 1,
      gameStatus: game.gameStatus || 'notStarted',
      isPlayed: game.isPlayed === undefined ? true : game.isPlayed,
      selectedPlayerIds: game.selectedPlayerIds || [],
      assessments: game.assessments || {},
      seasonId: game.seasonId || '',
      tournamentId: game.tournamentId || '',
      tournamentLevel: game.tournamentLevel || '',
      ageGroup: game.ageGroup || '',
      gameLocation: game.gameLocation || '',
      gameTime: game.gameTime || '',
      tacticalDiscs: game.tacticalDiscs || [],
      tacticalDrawings: game.tacticalDrawings || [],
      tacticalBallPosition:
        game.tacticalBallPosition === undefined ? { relX: 0.5, relY: 0.5 } : game.tacticalBallPosition,
      subIntervalMinutes: game.subIntervalMinutes === undefined ? 5 : game.subIntervalMinutes,
      completedIntervalDurations: game.completedIntervalDurations || [],
      lastSubConfirmationTimeSeconds:
        game.lastSubConfirmationTimeSeconds === undefined ? 0 : game.lastSubConfirmationTimeSeconds,
      gamePersonnel: game.gamePersonnel ?? [],
      ...game,
    };

    const savedGame = await this.saveGame(gameId, newGame);
    return { gameId, gameData: savedGame };
  }

  async saveGame(id: string, game: AppState): Promise<AppState> {
    this.ensureInitialized();

    // Validate using shared helper (defense in depth - TypeScript doesn't guarantee runtime presence)
    validateGame(game);

    return withKeyLock(SAVED_GAMES_KEY, async () => {
      const games = await this.loadSavedGames();
      games[id] = game;
      await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(games));
      return game;
    });
  }

  async saveAllGames(games: SavedGamesCollection): Promise<void> {
    this.ensureInitialized();

    if (!games || typeof games !== 'object' || Array.isArray(games)) {
      throw new ValidationError('Invalid games collection', 'games', games);
    }

    // Defense in depth: validate each game using shared helper.
    // Note: importGamesFromJson validates with Zod schema (more comprehensive - validates
    // format, types, ranges). This validation protects against future callers that bypass Zod.
    for (const [gameId, game] of Object.entries(games)) {
      if (!game || typeof game !== 'object') {
        throw new ValidationError(`Invalid game data for ${gameId}`, 'games', game);
      }
      // Use shared validation (required fields, gameNotes length, ageGroup)
      validateGame(game, gameId);
    }

    return withKeyLock(SAVED_GAMES_KEY, async () => {
      await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(games));
    });
  }

  async deleteGame(id: string): Promise<boolean> {
    this.ensureInitialized();

    return withKeyLock(SAVED_GAMES_KEY, async () => {
      const games = await this.loadSavedGames();
      if (!games[id]) {
        return false;
      }

      delete games[id];
      await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(games));
      return true;
    });
  }

  async addGameEvent(gameId: string, event: GameEvent): Promise<AppState | null> {
    this.ensureInitialized();

    return withKeyLock(SAVED_GAMES_KEY, async () => {
      const games = await this.loadSavedGames();
      const game = games[gameId];

      if (!game) {
        return null;
      }

      const updatedGame: AppState = {
        ...game,
        gameEvents: [...(game.gameEvents || []), event],
      };

      games[gameId] = updatedGame;
      await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(games));

      return updatedGame;
    });
  }

  async updateGameEvent(
    gameId: string,
    eventIndex: number,
    event: GameEvent
  ): Promise<AppState | null> {
    this.ensureInitialized();

    return withKeyLock(SAVED_GAMES_KEY, async () => {
      const games = await this.loadSavedGames();
      const game = games[gameId];

      if (!game) {
        return null;
      }

      const events = [...(game.gameEvents || [])];
      if (eventIndex < 0 || eventIndex >= events.length) {
        return null;
      }

      events[eventIndex] = event;
      const updatedGame: AppState = {
        ...game,
        gameEvents: events,
      };

      games[gameId] = updatedGame;
      await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(games));

      return updatedGame;
    });
  }

  async removeGameEvent(gameId: string, eventIndex: number): Promise<AppState | null> {
    this.ensureInitialized();

    return withKeyLock(SAVED_GAMES_KEY, async () => {
      const games = await this.loadSavedGames();
      const game = games[gameId];

      if (!game) {
        return null;
      }

      const events = [...(game.gameEvents || [])];
      if (eventIndex < 0 || eventIndex >= events.length) {
        return null;
      }

      events.splice(eventIndex, 1);
      const updatedGame: AppState = {
        ...game,
        gameEvents: events,
      };

      games[gameId] = updatedGame;
      await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(games));

      return updatedGame;
    });
  }

  /**
   * Gets application settings from storage.
   *
   * NOTE: Reads are unlocked for performance. Migration writes (one-time) use
   * locking for consistency. For atomic read-modify-write operations, use
   * updateSettings() instead of get-modify-save patterns.
   */
  async getSettings(): Promise<AppSettings> {
    this.ensureInitialized();

    try {
      const settingsJson = await getStorageItem(APP_SETTINGS_KEY);
      if (!settingsJson) {
        this.settingsMigrated = false; // Reset so migration runs when settings restored
        return { ...DEFAULT_APP_SETTINGS };
      }

      let parsed: (AppSettings & {
        clubSeasonStartMonth?: number;
        clubSeasonEndMonth?: number;
      }) | null = null;

      try {
        parsed = JSON.parse(settingsJson) as AppSettings & {
          clubSeasonStartMonth?: number;
          clubSeasonEndMonth?: number;
        };
      } catch (parseError) {
        logger.error('[LocalDataStore] Failed to parse app settings, using defaults', parseError);
        this.settingsMigrated = false; // Reset so migration runs when valid settings restored
        return { ...DEFAULT_APP_SETTINGS };
      }

      if (!parsed || !isValidAppSettings(parsed)) {
        logger.warn('[LocalDataStore] Invalid app settings structure, using defaults');
        this.settingsMigrated = false; // Reset so migration runs when valid settings restored
        return { ...DEFAULT_APP_SETTINGS };
      }

      // Migrate legacy month fields if needed (skip if already migrated this session)
      let settings: AppSettings;
      if (this.settingsMigrated) {
        // Already migrated - just merge with defaults
        settings = this.mergeWithDefaults(parsed);
      } else {
        // Wait for any in-progress migration to complete
        if (this.settingsMigrationPromise) {
          await this.settingsMigrationPromise;
          // After waiting, check if migration completed
          if (this.settingsMigrated) {
            settings = this.mergeWithDefaults(parsed);
          } else {
            // Migration failed, proceed with in-memory migration
            const { settings: migratedSettings } = this.migrateSeasonDates(parsed);
            settings = migratedSettings;
          }
        } else {
          const { settings: migratedSettings, needsMigration } = this.migrateSeasonDates(parsed);
          settings = migratedSettings;

          if (needsMigration) {
            const toSave = this.removeLegacyMonthFields(settings);

            // Create migration promise to synchronize concurrent calls
            this.settingsMigrationPromise = withKeyLock(APP_SETTINGS_KEY, async () => {
              try {
                await setStorageItem(APP_SETTINGS_KEY, JSON.stringify(toSave));
                logger.info('[LocalDataStore] Successfully migrated app settings to new format');
                this.settingsMigrated = true;
              } catch (saveError) {
                // Don't re-throw: app can still work with in-memory migrated values.
                // Old format is preserved, so migration will retry on next startup.
                logger.warn(
                  '[LocalDataStore] Failed to persist migrated app settings - will retry on next startup',
                  { error: saveError }
                );
                // Don't set settingsMigrated - retry on next call
              }
            }).finally(() => {
              this.settingsMigrationPromise = null;
            });

            await this.settingsMigrationPromise;
          } else {
            // No legacy fields - mark as migrated to skip future checks
            this.settingsMigrated = true;
          }
        }
      }

      if (!settings.lastHomeTeamName) {
        try {
          const legacyValue = await getStorageItem(LAST_HOME_TEAM_NAME_KEY);
          if (legacyValue) {
            settings.lastHomeTeamName = legacyValue;
          }
        } catch (error) {
          logger.debug('[LocalDataStore] Failed to read legacy lastHomeTeamName', error);
        }
      }

      return settings;
    } catch (error) {
      logger.error('[LocalDataStore] Error reading app settings', error);
      return { ...DEFAULT_APP_SETTINGS };
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.ensureInitialized();

    await withKeyLock(APP_SETTINGS_KEY, async () => {
      await setStorageItem(APP_SETTINGS_KEY, JSON.stringify(settings));
    });

    // Invalidate season dates cache in case dates were changed
    this.invalidateSettingsCache();
  }

  async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    this.ensureInitialized();

    if (Object.keys(updates).length === 0) {
      throw new ValidationError('Cannot update with empty object', 'updates', updates);
    }

    return withKeyLock(APP_SETTINGS_KEY, async () => {
      // Read directly from storage (avoid nested lock)
      const stored = await getStorageItem(APP_SETTINGS_KEY);

      // Parse with validation - fall back to defaults on corruption
      // Use same validation as getSettings() for consistency
      let parsed: ParsedSettingsWithLegacy | null = null;
      if (stored) {
        try {
          const rawParsed = JSON.parse(stored);
          // Full validation: object type + isValidAppSettings (matches getSettings behavior)
          if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed) && isValidAppSettings(rawParsed)) {
            parsed = rawParsed as ParsedSettingsWithLegacy;
          } else {
            logger.warn('[LocalDataStore.updateSettings] Invalid settings structure, using defaults');
          }
        } catch (parseError) {
          logger.warn('[LocalDataStore.updateSettings] Corrupted settings JSON, using defaults', { error: parseError });
        }
      }

      // Get current settings - skip migration if already done this session
      let current: AppSettings;
      if (this.settingsMigrated || !parsed) {
        current = this.mergeWithDefaults(parsed);
      } else {
        current = this.migrateSeasonDates(parsed).settings;
      }

      const updated = { ...current, ...updates };

      // Remove legacy fields before saving
      const toSave = this.removeLegacyMonthFields(updated);

      await setStorageItem(APP_SETTINGS_KEY, JSON.stringify(toSave));
      // Legacy fields removed from storage - mark as migrated
      this.settingsMigrated = true;

      // Invalidate season dates cache if season dates were changed
      if (updates.clubSeasonStartDate !== undefined || updates.clubSeasonEndDate !== undefined) {
        this.invalidateSettingsCache();
      }

      return updated;
    });
  }

  async getPlayerAdjustments(playerId: string): Promise<PlayerStatAdjustment[]> {
    this.ensureInitialized();

    const all = await this.loadPlayerAdjustments();
    return all[playerId] || [];
  }

  /**
   * Helper to build a PlayerStatAdjustment with defaults.
   * Extracted to avoid duplication between add and upsert methods.
   */
  private buildPlayerAdjustment(
    adjustment: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string }
  ): PlayerStatAdjustment {
    return {
      id: adjustment.id || generateId('adj'),
      appliedAt: adjustment.appliedAt || new Date().toISOString(),
      playerId: adjustment.playerId,
      seasonId: adjustment.seasonId,
      teamId: adjustment.teamId,
      tournamentId: adjustment.tournamentId,
      externalTeamName: adjustment.externalTeamName,
      opponentName: adjustment.opponentName,
      scoreFor: adjustment.scoreFor,
      scoreAgainst: adjustment.scoreAgainst,
      gameDate: adjustment.gameDate,
      homeOrAway: adjustment.homeOrAway,
      includeInSeasonTournament: adjustment.includeInSeasonTournament,
      gamesPlayedDelta: adjustment.gamesPlayedDelta || 0,
      goalsDelta: adjustment.goalsDelta || 0,
      assistsDelta: adjustment.assistsDelta || 0,
      fairPlayCardsDelta: adjustment.fairPlayCardsDelta,
      note: adjustment.note,
      createdBy: adjustment.createdBy,
    };
  }

  /**
   * Validate adjustment note length.
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

  async addPlayerAdjustment(
    adjustment: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string }
  ): Promise<PlayerStatAdjustment> {
    this.ensureInitialized();
    this.validateAdjustmentNote(adjustment.note);

    return withKeyLock(PLAYER_ADJUSTMENTS_KEY, async () => {
      const all = await this.loadPlayerAdjustments();
      const newAdjustment = this.buildPlayerAdjustment(adjustment);

      const list = all[newAdjustment.playerId] || [];
      all[newAdjustment.playerId] = [...list, newAdjustment];
      await setStorageItem(PLAYER_ADJUSTMENTS_KEY, JSON.stringify(all));

      return newAdjustment;
    });
  }

  async upsertPlayerAdjustment(
    adjustment: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string }
  ): Promise<PlayerStatAdjustment> {
    this.ensureInitialized();
    this.validateAdjustmentNote(adjustment.note);

    return withKeyLock(PLAYER_ADJUSTMENTS_KEY, async () => {
      const all = await this.loadPlayerAdjustments();
      const newAdjustment = this.buildPlayerAdjustment(adjustment);

      const list = all[newAdjustment.playerId] || [];
      // Upsert: Replace existing if found, otherwise append
      const existingIndex = list.findIndex((item) => item.id === newAdjustment.id);
      if (existingIndex !== -1) {
        list[existingIndex] = newAdjustment;
      } else {
        list.push(newAdjustment);
      }
      all[newAdjustment.playerId] = list;
      await setStorageItem(PLAYER_ADJUSTMENTS_KEY, JSON.stringify(all));

      return newAdjustment;
    });
  }

  async updatePlayerAdjustment(
    playerId: string,
    adjustmentId: string,
    patch: Partial<PlayerStatAdjustment>
  ): Promise<PlayerStatAdjustment | null> {
    this.ensureInitialized();

    if (patch.note !== undefined && patch.note && patch.note.length > VALIDATION_LIMITS.ADJUSTMENT_NOTES_MAX) {
      throw new ValidationError(`Adjustment note cannot exceed ${VALIDATION_LIMITS.ADJUSTMENT_NOTES_MAX} characters (got ${patch.note.length})`, 'note', patch.note);
    }

    return withKeyLock(PLAYER_ADJUSTMENTS_KEY, async () => {
      const all = await this.loadPlayerAdjustments();
      const list = all[playerId] || [];
      const index = list.findIndex((item) => item.id === adjustmentId);

      if (index === -1) {
        return null;
      }

      const updated = { ...list[index], ...patch } as PlayerStatAdjustment;
      list[index] = updated;
      all[playerId] = list;
      await setStorageItem(PLAYER_ADJUSTMENTS_KEY, JSON.stringify(all));

      return updated;
    });
  }

  async deletePlayerAdjustment(playerId: string, adjustmentId: string): Promise<boolean> {
    this.ensureInitialized();

    return withKeyLock(PLAYER_ADJUSTMENTS_KEY, async () => {
      const all = await this.loadPlayerAdjustments();
      const list = all[playerId] || [];
      const nextList = list.filter((item) => item.id !== adjustmentId);

      if (nextList.length === list.length) {
        return false;
      }

      all[playerId] = nextList;
      await setStorageItem(PLAYER_ADJUSTMENTS_KEY, JSON.stringify(all));
      return true;
    });
  }

  async getWarmupPlan(): Promise<WarmupPlan | null> {
    this.ensureInitialized();

    try {
      const planJson = await getStorageItem(WARMUP_PLAN_KEY);
      if (!planJson) {
        return null;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(planJson);
      } catch (parseError) {
        logger.error('[LocalDataStore] Failed to parse warmup plan', parseError);
        return null;
      }

      if (!isValidWarmupPlan(parsed)) {
        logger.error('[LocalDataStore] Invalid warmup plan structure');
        return null;
      }

      return parsed as WarmupPlan;
    } catch (error) {
      logger.error('[LocalDataStore] Error reading warmup plan', error);
      return null;
    }
  }

  async saveWarmupPlan(plan: WarmupPlan): Promise<boolean> {
    this.ensureInitialized();

    return withKeyLock(WARMUP_PLAN_KEY, async () => {
      try {
        const planToSave: WarmupPlan = {
          ...plan,
          lastModified: new Date().toISOString(),
          isDefault: false,
        };
        await setStorageItem(WARMUP_PLAN_KEY, JSON.stringify(planToSave));
        return true;
      } catch (error) {
        logger.error('[LocalDataStore] Error saving warmup plan', error);
        return false;
      }
    });
  }

  async deleteWarmupPlan(): Promise<boolean> {
    this.ensureInitialized();

    return withKeyLock(WARMUP_PLAN_KEY, async () => {
      try {
        await setStorageItem(WARMUP_PLAN_KEY, '');
        return true;
      } catch (error) {
        logger.error('[LocalDataStore] Error deleting warmup plan', error);
        return false;
      }
    });
  }

  async getTimerState(): Promise<TimerState | null> {
    this.ensureInitialized();

    try {
      return await getStorageJSON<TimerState>(TIMER_STATE_KEY);
    } catch (error) {
      logger.debug('[LocalDataStore] Failed to load timer state', error);
      return null;
    }
  }

  async saveTimerState(state: TimerState): Promise<void> {
    this.ensureInitialized();

    try {
      await setStorageJSON(TIMER_STATE_KEY, state);
    } catch (error) {
      logger.debug('[LocalDataStore] Failed to save timer state', error);
    }
  }

  async clearTimerState(): Promise<void> {
    this.ensureInitialized();

    try {
      await removeStorageItem(TIMER_STATE_KEY);
    } catch (error) {
      logger.debug('[LocalDataStore] Failed to clear timer state', error);
    }
  }

  // ==========================================================================
  // DATA MANAGEMENT
  // ==========================================================================

  /**
   * Clear all user data from local storage.
   *
   * Deletes all data from IndexedDB.
   * Does NOT clear localStorage settings (backend mode, migration flags).
   *
   * @throws {Error} If deletion fails
   */
  async clearAllUserData(): Promise<void> {
    this.ensureInitialized();

    // Import dynamically to avoid circular dependencies
    // clearStorage() clears IndexedDB only, NOT localStorage.
    // This preserves app settings (backend mode, migration flags, etc.)
    // which is intentional: clearing data shouldn't reset preferences.
    const { clearStorage } = await import('@/utils/storage');
    await clearStorage();

    logger.info('[LocalDataStore] All user data cleared from local storage');
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new NotInitializedError();
    }
  }

  private async loadPlayers(): Promise<Player[]> {
    try {
      const rosterJson = await getStorageItem(MASTER_ROSTER_KEY);
      if (!rosterJson) {
        return [];
      }

      const parsed = JSON.parse(rosterJson);
      return Array.isArray(parsed) ? (parsed as Player[]) : [];
    } catch (error) {
      logger.error('[LocalDataStore] Failed to load master roster', error);
      return [];
    }
  }

  private async loadTeamsIndex(): Promise<TeamsIndex> {
    try {
      const json = await getStorageItem(TEAMS_INDEX_KEY);
      if (!json) {
        return {};
      }

      const parsed = JSON.parse(json);
      if (!isRecord(parsed)) {
        return {};
      }

      return parsed as TeamsIndex;
    } catch (error) {
      logger.warn('[LocalDataStore] Failed to load teams index', { error });
      return {};
    }
  }

  private async loadTeamRosters(): Promise<TeamRostersIndex> {
    try {
      const json = await getStorageItem(TEAM_ROSTERS_KEY);
      if (!json) {
        return {};
      }

      const parsed = JSON.parse(json);
      if (!isRecord(parsed)) {
        return {};
      }

      return parsed as TeamRostersIndex;
    } catch (error) {
      logger.warn('[LocalDataStore] Failed to load team rosters', { error });
      return {};
    }
  }

  private async loadSeasons(): Promise<Season[]> {
    try {
      const seasonsJson = await getStorageItem(SEASONS_LIST_KEY);
      if (!seasonsJson) {
        return [];
      }

      const parsed = JSON.parse(seasonsJson);
      return Array.isArray(parsed) ? (parsed as Season[]) : [];
    } catch (error) {
      logger.error('[LocalDataStore] Failed to load seasons', error);
      return [];
    }
  }

  private async loadTournaments(): Promise<Tournament[]> {
    try {
      const tournamentsJson = await getStorageItem(TOURNAMENTS_LIST_KEY);
      if (!tournamentsJson) {
        return [];
      }

      const parsed = JSON.parse(tournamentsJson);
      return Array.isArray(parsed) ? (parsed as Tournament[]) : [];
    } catch (error) {
      logger.error('[LocalDataStore] Failed to load tournaments', error);
      return [];
    }
  }

  private async loadPersonnelCollection(): Promise<PersonnelCollection> {
    try {
      const personnelJson = await getStorageItem(PERSONNEL_KEY);
      if (!personnelJson) {
        return {};
      }

      const parsed = JSON.parse(personnelJson);
      if (!isRecord(parsed)) {
        return {};
      }

      return parsed as PersonnelCollection;
    } catch (error) {
      logger.error('[LocalDataStore] Failed to load personnel collection', error);
      return {};
    }
  }

  private async loadSavedGames(): Promise<SavedGamesCollection> {
    try {
      const gamesJson = await getStorageItem(SAVED_GAMES_KEY);
      if (!gamesJson) {
        return {};
      }

      const parsed = JSON.parse(gamesJson);
      if (!isRecord(parsed)) {
        return {};
      }

      return parsed as SavedGamesCollection;
    } catch (error) {
      logger.error('[LocalDataStore] Failed to load saved games', error);
      return {};
    }
  }

  private async loadPlayerAdjustments(): Promise<PlayerAdjustmentsIndex> {
    try {
      const json = await getStorageItem(PLAYER_ADJUSTMENTS_KEY);
      if (!json) {
        return {};
      }

      const parsed = JSON.parse(json);
      if (!isRecord(parsed)) {
        return {};
      }

      return parsed as PlayerAdjustmentsIndex;
    } catch (error) {
      logger.warn('[LocalDataStore] Failed to load player adjustments', { error });
      return {};
    }
  }
}
