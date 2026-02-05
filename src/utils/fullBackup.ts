import { SavedGamesCollection } from "@/types"; // AppState was removed, SavedGamesCollection is still used.
import { Player, Season, Tournament } from "@/types"; // Corrected import path for these types
// Import the constants from the central file - kept for backup format compatibility
import {
  SAVED_GAMES_KEY,
  APP_SETTINGS_KEY,
  SEASONS_LIST_KEY,
  TOURNAMENTS_LIST_KEY,
  MASTER_ROSTER_KEY,
  PLAYER_ADJUSTMENTS_KEY,
  TEAMS_INDEX_KEY,
  TEAM_ROSTERS_KEY,
  PERSONNEL_KEY,
  WARMUP_PLAN_KEY,
} from "@/config/storageKeys";
import logger from "@/utils/logger";
import i18n from "i18next";
import { getDataStore } from '@/datastore/factory';
import { getLatestGameId } from './savedGames';
import { DEFAULT_GAME_ID } from '@/config/constants';
import type { PlayerAdjustmentsIndex } from './playerAdjustments';
import type { TeamsIndex, TeamRostersIndex } from './teams';
import type { AppSettings } from '@/types/settings';
import type { PersonnelCollection } from '@/types/personnel';
import type { WarmupPlan } from '@/types/warmupPlan';
import { processImportedGames } from './gameImportHelper';
import type { BackupRestoreResult } from '@/components/BackupRestoreResultsModal';
import { retryWithBackoff, countPushFailures } from '@/utils/retry';
import type { PushAllToCloudResult } from '@/datastore/SyncedDataStore';

// Define the structure of the backup file
interface FullBackupData {
  meta: {
    schema: number;
    exportedAt: string;
  };
  localStorage: { // Note: field name kept for backward compatibility with existing backups
    [SAVED_GAMES_KEY]?: SavedGamesCollection | null;
    [APP_SETTINGS_KEY]?: AppSettings | null;
    [SEASONS_LIST_KEY]?: Season[] | null;
    [TOURNAMENTS_LIST_KEY]?: Tournament[] | null;
    [MASTER_ROSTER_KEY]?: Player[] | null;
    [PLAYER_ADJUSTMENTS_KEY]?: PlayerAdjustmentsIndex | null;
    [TEAMS_INDEX_KEY]?: TeamsIndex | null;
    [TEAM_ROSTERS_KEY]?: TeamRostersIndex | null;
    [PERSONNEL_KEY]?: PersonnelCollection | null;
    [WARMUP_PLAN_KEY]?: WarmupPlan | null;
  };
}

/**
 * Validation result for backup data structure.
 */
interface BackupValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate backup data structure before import.
 *
 * Performs pre-flight checks to catch issues before clearing existing data.
 * This prevents data loss from partially invalid backups.
 *
 * Checks:
 * - Arrays are actually arrays (not objects or primitives)
 * - Objects are actually objects (not arrays or primitives)
 * - IDs are unique within each collection
 * - Basic field type validation
 *
 * @param backupData - Parsed backup data to validate
 * @returns Validation result with errors and warnings
 */
function validateBackupData(backupData: FullBackupData): BackupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const localStorage = backupData.localStorage;

  // Validate players array
  const players = localStorage[MASTER_ROSTER_KEY];
  if (players !== null && players !== undefined) {
    if (!Array.isArray(players)) {
      errors.push('Players (masterRoster) must be an array');
    } else {
      const playerIds = new Set<string>();
      for (const player of players) {
        if (!player.id) {
          errors.push('Player is missing required "id" field');
        } else if (playerIds.has(player.id)) {
          errors.push(`Duplicate player ID: ${player.id}`);
        } else {
          playerIds.add(player.id);
        }
        if (!player.name || typeof player.name !== 'string') {
          warnings.push(`Player ${player.id || '(no id)'} has invalid or missing name`);
        }
      }
    }
  }

  // Validate seasons array
  const seasons = localStorage[SEASONS_LIST_KEY];
  if (seasons !== null && seasons !== undefined) {
    if (!Array.isArray(seasons)) {
      errors.push('Seasons must be an array');
    } else {
      const seasonIds = new Set<string>();
      for (const season of seasons) {
        if (!season.id) {
          errors.push('Season is missing required "id" field');
        } else if (seasonIds.has(season.id)) {
          errors.push(`Duplicate season ID: ${season.id}`);
        } else {
          seasonIds.add(season.id);
        }
      }
    }
  }

  // Validate tournaments array
  const tournaments = localStorage[TOURNAMENTS_LIST_KEY];
  if (tournaments !== null && tournaments !== undefined) {
    if (!Array.isArray(tournaments)) {
      errors.push('Tournaments must be an array');
    } else {
      const tournamentIds = new Set<string>();
      for (const tournament of tournaments) {
        if (!tournament.id) {
          errors.push('Tournament is missing required "id" field');
        } else if (tournamentIds.has(tournament.id)) {
          errors.push(`Duplicate tournament ID: ${tournament.id}`);
        } else {
          tournamentIds.add(tournament.id);
        }
      }
    }
  }

  // Validate teams object
  const teams = localStorage[TEAMS_INDEX_KEY];
  if (teams !== null && teams !== undefined) {
    if (typeof teams !== 'object' || Array.isArray(teams)) {
      errors.push('Teams must be an object (not array)');
    } else {
      for (const [teamId, team] of Object.entries(teams)) {
        if (!team || typeof team !== 'object') {
          errors.push(`Team ${teamId} is not a valid object`);
        } else if ((team as { id?: string }).id !== teamId) {
          warnings.push(`Team key ${teamId} doesn't match team.id ${(team as { id?: string }).id}`);
        }
      }
    }
  }

  // Validate games object
  const games = localStorage[SAVED_GAMES_KEY];
  if (games !== null && games !== undefined) {
    if (typeof games !== 'object' || Array.isArray(games)) {
      errors.push('Games (savedSoccerGames) must be an object (not array)');
    } else {
      const gameCount = Object.keys(games).length;
      if (gameCount > 1000) {
        warnings.push(`Large backup: ${gameCount} games may take a while to import`);
      }
    }
  }

  // Validate personnel object
  const personnel = localStorage[PERSONNEL_KEY];
  if (personnel !== null && personnel !== undefined) {
    if (typeof personnel !== 'object' || Array.isArray(personnel)) {
      errors.push('Personnel must be an object (not array)');
    }
  }

  // Validate player adjustments object
  const adjustments = localStorage[PLAYER_ADJUSTMENTS_KEY];
  if (adjustments !== null && adjustments !== undefined) {
    if (typeof adjustments !== 'object' || Array.isArray(adjustments)) {
      errors.push('Player adjustments must be an object (not array)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Generate backup JSON from DataStore.
 *
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns JSON string of backup data
 */
export const generateFullBackupJson = async (userId?: string): Promise<string> => {
  const backupData: FullBackupData = {
    meta: {
      schema: 1,
      exportedAt: new Date().toISOString(),
    },
    localStorage: {},
  };

  try {
    const dataStore = await getDataStore(userId);

    // Get all data using DataStore methods
    const [
      games,
      settings,
      seasons,
      tournaments,
      players,
      adjustmentsMap,
      teams,
      teamRosters,
      personnel,
      warmupPlan,
    ] = await Promise.all([
      dataStore.getGames(),
      dataStore.getSettings(),
      dataStore.getSeasons(true), // Include archived
      dataStore.getTournaments(true), // Include archived
      dataStore.getPlayers(),
      dataStore.getAllPlayerAdjustments(),
      dataStore.getTeams(true), // Include archived
      dataStore.getAllTeamRosters(),
      dataStore.getAllPersonnel(),
      dataStore.getWarmupPlan(),
    ]);

    // Convert DataStore formats to backup format (for backward compatibility)
    // Games: already in SavedGamesCollection format
    if (Object.keys(games).length > 0) {
      backupData.localStorage[SAVED_GAMES_KEY] = games;
      logger.log(`Backed up ${Object.keys(games).length} games`);
    } else {
      backupData.localStorage[SAVED_GAMES_KEY] = null;
    }

    // Settings: already in AppSettings format
    backupData.localStorage[APP_SETTINGS_KEY] = settings;
    logger.log('Backed up settings');

    // Seasons: already in array format
    if (seasons.length > 0) {
      backupData.localStorage[SEASONS_LIST_KEY] = seasons;
      logger.log(`Backed up ${seasons.length} seasons`);
    } else {
      backupData.localStorage[SEASONS_LIST_KEY] = null;
    }

    // Tournaments: already in array format
    if (tournaments.length > 0) {
      backupData.localStorage[TOURNAMENTS_LIST_KEY] = tournaments;
      logger.log(`Backed up ${tournaments.length} tournaments`);
    } else {
      backupData.localStorage[TOURNAMENTS_LIST_KEY] = null;
    }

    // Players: already in array format
    if (players.length > 0) {
      backupData.localStorage[MASTER_ROSTER_KEY] = players;
      logger.log(`Backed up ${players.length} players`);
    } else {
      backupData.localStorage[MASTER_ROSTER_KEY] = null;
    }

    // Player adjustments: Convert Map to PlayerAdjustmentsIndex
    if (adjustmentsMap.size > 0) {
      const adjustmentsIndex: PlayerAdjustmentsIndex = {};
      for (const [playerId, adjustments] of adjustmentsMap) {
        adjustmentsIndex[playerId] = adjustments;
      }
      backupData.localStorage[PLAYER_ADJUSTMENTS_KEY] = adjustmentsIndex;
      logger.log(`Backed up adjustments for ${adjustmentsMap.size} players`);
    } else {
      backupData.localStorage[PLAYER_ADJUSTMENTS_KEY] = null;
    }

    // Teams: Convert array to TeamsIndex
    if (teams.length > 0) {
      const teamsIndex: TeamsIndex = {};
      for (const team of teams) {
        teamsIndex[team.id] = team;
      }
      backupData.localStorage[TEAMS_INDEX_KEY] = teamsIndex;
      logger.log(`Backed up ${teams.length} teams`);
    } else {
      backupData.localStorage[TEAMS_INDEX_KEY] = null;
    }

    // Team rosters: already in TeamRostersIndex format
    if (Object.keys(teamRosters).length > 0) {
      backupData.localStorage[TEAM_ROSTERS_KEY] = teamRosters;
      logger.log(`Backed up rosters for ${Object.keys(teamRosters).length} teams`);
    } else {
      backupData.localStorage[TEAM_ROSTERS_KEY] = null;
    }

    // Personnel: Convert array to PersonnelCollection
    if (personnel.length > 0) {
      const personnelCollection: PersonnelCollection = {};
      for (const member of personnel) {
        personnelCollection[member.id] = member;
      }
      backupData.localStorage[PERSONNEL_KEY] = personnelCollection;
      logger.log(`Backed up ${personnel.length} personnel`);
    } else {
      backupData.localStorage[PERSONNEL_KEY] = null;
    }

    // Warmup plan: already in WarmupPlan format
    backupData.localStorage[WARMUP_PLAN_KEY] = warmupPlan;
    if (warmupPlan) {
      logger.log('Backed up warmup plan');
    }

  } catch (error) {
    logger.error('Error generating backup:', error);
    throw error;
  }

  return JSON.stringify(backupData, null, 2);
};

/**
 * Export all relevant application data to a downloadable JSON file.
 *
 * @param showToast - Optional toast notification function for user feedback
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 * @returns JSON string of backup data
 */
export const exportFullBackup = async (
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void,
  userId?: string
): Promise<string> => {
  logger.log("Starting full backup export...");
  try {
    const jsonString = await generateFullBackupJson(userId);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    // Generate filename with timestamp
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}_${now.getHours().toString().padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}${now.getSeconds().toString().padStart(2, "0")}`;
    a.download = `MatchOpsLocal_Backup_${timestamp}.json`;

    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logger.log(`Full backup exported successfully as ${a.download}`);
    if (showToast) {
      showToast(i18n.t("fullBackup.exportSuccess"), 'success');
    } else {
      alert(i18n.t("fullBackup.exportSuccess"));
    }
    return jsonString;
  } catch (error) {
    logger.error("Failed to export full backup:", error);
    if (showToast) {
      showToast(i18n.t("fullBackup.exportError"), 'error');
    } else {
      alert(i18n.t("fullBackup.exportError"));
    }
    throw error;
  }
};

/**
 * Imports application data from a backup file, restoring all saved games, roster, and settings.
 *
 * @param jsonContent - The JSON string containing the backup data
 * @param onImportSuccess - Optional callback to execute after successful import (e.g., refresh app state)
 * @param showToast - Optional toast notification function for user feedback
 * @param confirmed - When true, bypasses the confirmation prompt for React component usage.
 *                    React components should show ConfirmationModal first, then pass confirmed=true.
 *                    The window.confirm fallback (lines 156-161) is intentional for CLI/utility-only usage
 *                    and maintains backward compatibility with direct function calls outside React context.
 * @param delayReload - When true, skips automatic reload/refresh. Caller is responsible for triggering reload.
 *                      Used when showing results modal before reload.
 * @param userId - User ID for user-scoped storage. Pass undefined for legacy storage.
 *
 * @returns Promise<BackupRestoreResult | null> - Result object with statistics, or null if cancelled/failed
 *
 * @example
 * // From React component (preferred)
 * const handleConfirm = async () => {
 *   await importFullBackup(jsonContent, onSuccess, showToast, true, false, userId); // with userId
 * };
 *
 * @example
 * // Direct usage (CLI/utility scripts) - uses window.confirm fallback
 * await importFullBackup(jsonContent); // confirmed=undefined, triggers window.confirm
 *
 * @example
 * // With delayed reload (for results modal)
 * const result = await importFullBackup(jsonContent, undefined, showToast, true, true, userId);
 * // Show results modal, then manually trigger reload when user closes modal
 */
export const importFullBackup = async (
  jsonContent: string,
  onImportSuccess?: () => void,
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void,
  confirmed?: boolean,
  delayReload?: boolean,
  userId?: string
): Promise<BackupRestoreResult | null> => {
  logger.log("Starting full backup import...");
  let mappingReportData: BackupRestoreResult['mappingReport'] | undefined;

  // Initialize statistics
  const statistics: BackupRestoreResult['statistics'] = {
    gamesImported: 0,
    playersImported: 0,
    teamsImported: 0,
    seasonsImported: 0,
    tournamentsImported: 0,
    personnelImported: 0,
  };
  const warnings: string[] = [];

  try {
    const backupData: FullBackupData = JSON.parse(jsonContent);

    // --- Basic Validation ---
    if (typeof backupData !== "object" || backupData === null) {
      throw new Error(
        "Invalid format: Backup file is not a valid JSON object.",
      );
    }
    if (!backupData.meta || typeof backupData.meta !== "object") {
      throw new Error("Invalid format: Missing 'meta' information.");
    }
    if (backupData.meta.schema !== 1) {
      // Basic schema check - can be expanded later
      throw new Error(
        `Unsupported schema version: ${backupData.meta.schema}. This tool supports schema version 1.`,
      );
    }
    if (
      !backupData.localStorage ||
      typeof backupData.localStorage !== "object"
    ) {
      throw new Error("Invalid format: Missing 'localStorage' data object.");
    }

    // --- Pre-flight Data Validation (BEFORE clearing existing data) ---
    // This prevents data loss from partially invalid backups.
    // We validate the structure and catch errors BEFORE clearing anything.
    const validationResult = validateBackupData(backupData);
    if (!validationResult.valid) {
      const errorSummary = validationResult.errors.slice(0, 5).join('; ');
      const moreErrors = validationResult.errors.length > 5
        ? ` (+${validationResult.errors.length - 5} more errors)`
        : '';
      logger.error('[Import] Backup validation failed:', validationResult.errors);
      throw new Error(
        `Backup validation failed: ${errorSummary}${moreErrors}. ` +
        `Your existing data has NOT been modified.`
      );
    }
    // Add validation warnings to the warnings array
    if (validationResult.warnings.length > 0) {
      warnings.push(...validationResult.warnings);
      logger.warn('[Import] Backup validation warnings:', validationResult.warnings);
    }

    // --- Confirmation ---
    if (!confirmed) {
      if (!window.confirm(i18n.t("fullBackup.confirmRestore"))) {
        logger.log("User cancelled the import process.");
        return null; // User cancelled
      }
    }

    logger.log("User confirmed import. Proceeding to overwrite data...");

    // Get the DataStore for the user
    const dataStore = await getDataStore(userId);

    // --- Get current roster BEFORE clearing (needed for legacy imports without roster) ---
    let currentRosterBeforeClear: Player[] = [];
    try {
      currentRosterBeforeClear = await dataStore.getPlayers();
    } catch (error) {
      logger.warn('Could not get current roster before clear:', error);
    }

    // --- Clear all existing app data for a clean restore ---
    // Use aggressive retry to handle persistent AbortError from Supabase auth locks.
    // Android Chrome is particularly prone to this issue on repeated imports.
    // 5 retries with 1000ms initial = up to ~31s total wait (1+2+4+8+16s)
    try {
      await retryWithBackoff(
        () => dataStore.clearAllUserData(),
        { operationName: 'clearAllUserData', maxRetries: 5, initialDelayMs: 1000 }
      );
      logger.log("Cleared existing app data for clean restore");
    } catch (error) {
      logger.error('Failed to clear user data before restore:', error);
      throw new Error('Failed to clear existing data before restore. Aborting import.');
    }

    // --- Process games to ensure proper player mapping ---
    let processedSavedGames = backupData.localStorage[SAVED_GAMES_KEY];

    if (processedSavedGames && typeof processedSavedGames === 'object') {
      try {
        // Check if backup contains its own roster
        // If yes, games and roster are already consistent - skip remapping
        const backupRoster = backupData.localStorage[MASTER_ROSTER_KEY];

        if (backupRoster && Array.isArray(backupRoster) && backupRoster.length > 0) {
          // Full backup with matching roster - no remapping needed
          // Games already have correct player IDs that match the backup's roster
          logger.log('Backup contains matching roster - skipping player remapping');
        } else {
          // Legacy/partial import without roster - remap using roster we saved before clearing
          // Process imported games to ensure proper player integration
          if (currentRosterBeforeClear.length > 0) {
            const { processedGames, mappingReport } = processImportedGames(
              processedSavedGames as SavedGamesCollection,
              currentRosterBeforeClear
            );

            processedSavedGames = processedGames;

            logger.log('Game import processing completed:', mappingReport);

            // Store mapping report for result modal
            mappingReportData = mappingReport;

            // Note: We'll show detailed results in the modal instead of toast
          }
        }
      } catch (error) {
        logger.error('Error processing imported games for player mapping:', error);
        // Continue with import even if processing fails
      }
    }

    // Normalize legacy keys (best-effort). Some old exports might use different names.
    try {
      // Legacy: 'savedGames' -> SAVED_GAMES_KEY
      const anyLocal = backupData.localStorage as Record<string, unknown>;
      if (!anyLocal[SAVED_GAMES_KEY] && anyLocal['savedGames']) {
        anyLocal[SAVED_GAMES_KEY] = anyLocal['savedGames'] as unknown;
        logger.log('Normalized legacy key: savedGames -> savedSoccerGames');
      }
    } catch (e) {
      logger.warn('Legacy key normalization failed (non-fatal)', e);
    }

    // --- Restore data using DataStore methods ---
    try {
      // Restore players first (games may reference them)
      const playersToRestore = backupData.localStorage[MASTER_ROSTER_KEY];
      if (playersToRestore && Array.isArray(playersToRestore)) {
        for (const player of playersToRestore) {
          await dataStore.upsertPlayer(player);
        }
        statistics.playersImported = playersToRestore.length;
        logger.log(`Restored ${playersToRestore.length} players`);
      }

      // Restore seasons (games may reference them)
      const seasonsToRestore = backupData.localStorage[SEASONS_LIST_KEY];
      if (seasonsToRestore && Array.isArray(seasonsToRestore)) {
        for (const season of seasonsToRestore) {
          await dataStore.upsertSeason(season);
        }
        statistics.seasonsImported = seasonsToRestore.length;
        logger.log(`Restored ${seasonsToRestore.length} seasons`);
      }

      // Restore tournaments (games may reference them)
      const tournamentsToRestore = backupData.localStorage[TOURNAMENTS_LIST_KEY];
      if (tournamentsToRestore && Array.isArray(tournamentsToRestore)) {
        for (const tournament of tournamentsToRestore) {
          await dataStore.upsertTournament(tournament);
        }
        statistics.tournamentsImported = tournamentsToRestore.length;
        logger.log(`Restored ${tournamentsToRestore.length} tournaments`);
      }

      // Restore teams (games may reference them)
      const teamsToRestore = backupData.localStorage[TEAMS_INDEX_KEY];
      if (teamsToRestore && typeof teamsToRestore === 'object') {
        const teamIds = Object.keys(teamsToRestore);
        for (const teamId of teamIds) {
          await dataStore.upsertTeam(teamsToRestore[teamId]);
        }
        statistics.teamsImported = teamIds.length;
        logger.log(`Restored ${teamIds.length} teams`);
      }

      // Restore team rosters
      const teamRostersToRestore = backupData.localStorage[TEAM_ROSTERS_KEY];
      if (teamRostersToRestore && typeof teamRostersToRestore === 'object') {
        const rosterTeamIds = Object.keys(teamRostersToRestore);
        for (const teamId of rosterTeamIds) {
          await dataStore.setTeamRoster(teamId, teamRostersToRestore[teamId]);
        }
        logger.log(`Restored rosters for ${rosterTeamIds.length} teams`);
      }

      // Restore personnel (games may reference them)
      const personnelToRestore = backupData.localStorage[PERSONNEL_KEY];
      if (personnelToRestore && typeof personnelToRestore === 'object') {
        const personnelIds = Object.keys(personnelToRestore);
        for (const personnelId of personnelIds) {
          await dataStore.upsertPersonnelMember(personnelToRestore[personnelId]);
        }
        statistics.personnelImported = personnelIds.length;
        logger.log(`Restored ${personnelIds.length} personnel`);
      }

      // Restore games (use processed games if available)
      const gamesToRestore = processedSavedGames ?? backupData.localStorage[SAVED_GAMES_KEY];
      if (gamesToRestore && typeof gamesToRestore === 'object') {
        await dataStore.saveAllGames(gamesToRestore as SavedGamesCollection);
        statistics.gamesImported = Object.keys(gamesToRestore).length;
        logger.log(`Restored ${Object.keys(gamesToRestore).length} games`);
      }

      // Restore player adjustments
      const adjustmentsToRestore = backupData.localStorage[PLAYER_ADJUSTMENTS_KEY];
      if (adjustmentsToRestore && typeof adjustmentsToRestore === 'object') {
        const playerIds = Object.keys(adjustmentsToRestore);
        for (const playerId of playerIds) {
          const adjustments = adjustmentsToRestore[playerId];
          if (Array.isArray(adjustments)) {
            for (const adjustment of adjustments) {
              await dataStore.upsertPlayerAdjustment(adjustment);
            }
          }
        }
        logger.log(`Restored adjustments for ${playerIds.length} players`);
      }

      // Restore settings
      const settingsToRestore = backupData.localStorage[APP_SETTINGS_KEY];
      if (settingsToRestore) {
        await dataStore.saveSettings(settingsToRestore);
        logger.log('Restored settings');
      }

      // Restore warmup plan
      const warmupPlanToRestore = backupData.localStorage[WARMUP_PLAN_KEY];
      if (warmupPlanToRestore) {
        await dataStore.saveWarmupPlan(warmupPlanToRestore);
        logger.log('Restored warmup plan');
      }

    } catch (innerError) {
      logger.error('Error restoring data:', innerError);
      if (showToast) {
        showToast(i18n.t("fullBackup.restoreKeyError", { key: 'data' }), 'error');
      } else {
        alert(i18n.t("fullBackup.restoreKeyError", { key: 'data' }));
      }
      throw new Error('Failed to restore data. Aborting import.');
    }

    // --- Ensure currentGameId points to a real game after restore ---
    try {
      const savedGames = await dataStore.getGames();
      if (savedGames && Object.keys(savedGames).length > 0) {
        const latestId = getLatestGameId(savedGames);
        if (latestId) {
          const currentSettings = await dataStore.getSettings();
          const currentId = currentSettings?.currentGameId ?? null;
          const isStale = !currentId || currentId === DEFAULT_GAME_ID || !(currentId in savedGames);
          if (isStale) {
            await dataStore.updateSettings({ currentGameId: latestId });
            logger.log('[Import] Set currentGameId to latest imported game', { latestId });
          }
        }
      }
    } catch (e) {
      // This can happen if IndexedDB rejects writes (quota exceeded, storage corruption, or browser policies).
      // Import is still considered successful, but we surface a warning so the user can manually pick a game.
      logger.warn('[Import] Unable to set currentGameId post-restore (non-fatal)', e);
      warnings.push(i18n.t("fullBackup.currentGameWarning", {
        defaultValue: "Could not update the current game selection automatically. Please select a game manually.",
      }));
    }

    // --- Final Step: Create result object and trigger app refresh ---
    logger.log("Data restored successfully. Creating result report...");

    const result: BackupRestoreResult = {
      success: true,
      statistics,
      mappingReport: mappingReportData,
      warnings,
    };

    // For cloud mode: Use direct bulk push instead of sync queue for reliability
    // The sync queue approach fails due to Supabase auth lock AbortErrors
    // This runs regardless of delayReload - user expects data in cloud
    let cloudPushSucceeded = false;
    if ('pushAllToCloud' in dataStore && typeof dataStore.pushAllToCloud === 'function') {
      logger.log('[importFullBackup] Using direct bulk push to cloud...');
      try {
        // Runtime-verified method call (checked above with typeof guard)
        const pushSummary = await dataStore.pushAllToCloud() as PushAllToCloudResult;
        logger.log('[importFullBackup] Bulk push complete:', pushSummary);

        // Report any failures to user (items that failed after all retries)
        if (pushSummary.failures) {
          const totalFailures = countPushFailures(pushSummary.failures);
          if (totalFailures > 0) {
            // Build detailed breakdown of failures by entity type
            const failureDetails: string[] = [];
            const f = pushSummary.failures;
            if (f.players.length > 0) failureDetails.push(`${f.players.length} players`);
            if (f.teams.length > 0) failureDetails.push(`${f.teams.length} teams`);
            if (f.seasons.length > 0) failureDetails.push(`${f.seasons.length} seasons`);
            if (f.tournaments.length > 0) failureDetails.push(`${f.tournaments.length} tournaments`);
            if (f.personnel.length > 0) failureDetails.push(`${f.personnel.length} personnel`);
            if (f.games.length > 0) failureDetails.push(`${f.games.length} games`);
            if (f.rosters.length > 0) failureDetails.push(`${f.rosters.length} rosters`);
            if (f.adjustments.length > 0) failureDetails.push(`${f.adjustments.length} adjustments`);
            if (f.settings) failureDetails.push('settings');
            if (f.warmupPlan) failureDetails.push('warmup plan');

            const detailStr = failureDetails.length > 0
              ? ` (${failureDetails.join(', ')})`
              : '';
            warnings.push(`${totalFailures} items failed to sync to cloud${detailStr}. You can retry from Settings.`);

            // Log detailed failure IDs for debugging (visible in browser console)
            logger.warn('[importFullBackup] Failed item IDs:', {
              players: f.players,
              teams: f.teams,
              seasons: f.seasons,
              tournaments: f.tournaments,
              personnel: f.personnel,
              games: f.games,
              rosters: f.rosters,
              adjustments: f.adjustments,
              settings: f.settings,
              warmupPlan: f.warmupPlan,
            });
          } else {
            // No failures - mark cloud push as successful
            cloudPushSucceeded = true;
          }
        } else {
          // No failures object means full success
          cloudPushSucceeded = true;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('[importFullBackup] Bulk push failed after retries:', errorMsg);
        warnings.push('Some data might not have synced to cloud. You can manually sync from Settings.');
        // Don't throw - local data is safe, user can retry sync manually
      }
    }

    // If cloud push succeeded, set migration flag to prevent migration wizard from appearing
    // This avoids showing "Sync to Cloud" wizard when data is already synced
    if (cloudPushSucceeded && userId) {
      try {
        const { setMigrationCompleted } = await import('@/config/backendConfig');
        setMigrationCompleted(userId);
        logger.log('[importFullBackup] Set migration flag - cloud push succeeded, no wizard needed');
      } catch (flagError) {
        logger.warn('[importFullBackup] Failed to set migration flag (non-fatal):', flagError);
      }
    }

    // Skip automatic reload/refresh if caller wants to handle it manually (e.g., after showing results modal)
    if (delayReload) {
      logger.log("Skipping automatic reload - caller will handle it manually");
      return result;
    }

    // Use callback to refresh app state without reload, or fallback to reload
    if (onImportSuccess) {
      // Use setTimeout to allow the caller to process the result
      setTimeout(() => {
        onImportSuccess();
      }, 100);
    } else {
      // Fallback to reload for backward compatibility
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }

    return result;
  } catch (error) {
    logger.error("Failed to import full backup:", error);
    // Type check for error before accessing message
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (showToast) {
      showToast(i18n.t("fullBackup.restoreError", { error: errorMessage }), 'error');
    } else {
      alert(i18n.t("fullBackup.restoreError", { error: errorMessage }));
    }
    return null; // Indicate failure
  }
};
