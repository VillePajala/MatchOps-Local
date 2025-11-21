import { SavedGamesCollection } from "@/types"; // AppState was removed, SavedGamesCollection is still used.
import { Player, Season, Tournament } from "@/types"; // Corrected import path for these types
// Import the constants from the central file
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
} from "@/config/storageKeys";
import logger from "@/utils/logger";
import i18n from "i18next";
// Import the new async storage helper functions
import {
  getStorageJSON,
  setStorageJSON,
  removeStorageItem,
} from "./storage";
import { getLatestGameId } from './savedGames';
import { DEFAULT_GAME_ID } from '@/config/constants';
import type { PlayerAdjustmentsIndex } from './playerAdjustments';
import type { TeamsIndex, TeamRostersIndex } from './teams';
import type { AppSettings } from './appSettings';
import type { PersonnelCollection } from '@/types/personnel';
import { processImportedGames } from './gameImportHelper';
import type { BackupRestoreResult } from '@/components/BackupRestoreResultsModal';

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
  };
}

export const generateFullBackupJson = async (): Promise<string> => {
  const backupData: FullBackupData = {
    meta: {
      schema: 1,
      exportedAt: new Date().toISOString(),
    },
    localStorage: {},
  };

  const keysToBackup = [
    SAVED_GAMES_KEY,
    APP_SETTINGS_KEY,
    SEASONS_LIST_KEY,
    TOURNAMENTS_LIST_KEY,
    MASTER_ROSTER_KEY,
    PLAYER_ADJUSTMENTS_KEY,
    TEAMS_INDEX_KEY,
    TEAM_ROSTERS_KEY,
    PERSONNEL_KEY,
  ];

  for (const key of keysToBackup) {
    try {
      const itemData = await getStorageJSON<unknown>(key);
      if (itemData !== null) {
        (backupData.localStorage as Record<string, unknown>)[key] = itemData;
        logger.log(`Backed up data for key: ${key}`);
      } else {
        logger.log(`No data found for key: ${key}, setting to null.`);
        backupData.localStorage[key as keyof FullBackupData['localStorage']] = null;
      }
    } catch (error) {
      logger.error(`Error getting storage item for key ${key}:`, error);
      backupData.localStorage[key as keyof FullBackupData['localStorage']] = null;
    }
  }

  return JSON.stringify(backupData, null, 2);
};

// Function to export all relevant application data
export const exportFullBackup = async (
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void
): Promise<string> => {
  logger.log("Starting full backup export...");
  try {
    const jsonString = await generateFullBackupJson();
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
 *
 * @returns Promise<BackupRestoreResult | null> - Result object with statistics, or null if cancelled/failed
 *
 * @example
 * // From React component (preferred)
 * const handleConfirm = async () => {
 *   await importFullBackup(jsonContent, onSuccess, showToast, true); // confirmed=true
 * };
 *
 * @example
 * // Direct usage (CLI/utility scripts) - uses window.confirm fallback
 * await importFullBackup(jsonContent); // confirmed=undefined, triggers window.confirm
 *
 * @example
 * // With delayed reload (for results modal)
 * const result = await importFullBackup(jsonContent, undefined, showToast, true, true); // delayReload=true
 * // Show results modal, then manually trigger reload when user closes modal
 */
export const importFullBackup = async (
  jsonContent: string,
  onImportSuccess?: () => void,
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void,
  confirmed?: boolean,
  delayReload?: boolean
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

    // --- Confirmation ---
    if (!confirmed) {
      if (!window.confirm(i18n.t("fullBackup.confirmRestore"))) {
        logger.log("User cancelled the import process.");
        return null; // User cancelled
      }
    }

    logger.log("User confirmed import. Proceeding to overwrite data...");

    // --- Process games to ensure proper player mapping ---
    let processedSavedGames = backupData.localStorage[SAVED_GAMES_KEY];
    
    if (processedSavedGames && typeof processedSavedGames === 'object') {
      try {
        // Get current roster for player mapping
        let currentRoster: Player[] = [];

        try {
          const currentRosterData = await getStorageJSON<Player[]>(MASTER_ROSTER_KEY);
          if (currentRosterData) {
            currentRoster = currentRosterData;
          }
        } catch (error) {
          logger.warn('Could not get current roster for player mapping:', error);
        }
        
        // Process imported games to ensure proper player integration
        if (currentRoster.length > 0) {
          const { processedGames, mappingReport } = processImportedGames(
            processedSavedGames as SavedGamesCollection,
            currentRoster
          );
          
          processedSavedGames = processedGames;

          logger.log('Game import processing completed:', mappingReport);

          // Store mapping report for result modal
          mappingReportData = mappingReport;

          // Note: We'll show detailed results in the modal instead of toast
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

    // --- Overwrite storage data ---
    const keysToRestore = Object.keys(backupData.localStorage) as Array<
      keyof FullBackupData["localStorage"]
    >;

    for (const key of keysToRestore) {
      let dataToRestore = backupData.localStorage[key];

      // Use processed games if we processed them
      if (key === SAVED_GAMES_KEY && processedSavedGames) {
        dataToRestore = processedSavedGames;
      }

      if (dataToRestore !== undefined && dataToRestore !== null) {
        try {
          await setStorageJSON(key as string, dataToRestore);
          logger.log(`Restored data for key: ${key}`);

          // Track statistics based on key
          if (key === SAVED_GAMES_KEY && typeof dataToRestore === 'object') {
            statistics.gamesImported = Object.keys(dataToRestore).length;
          } else if (key === MASTER_ROSTER_KEY && Array.isArray(dataToRestore)) {
            statistics.playersImported = dataToRestore.length;
          } else if (key === TEAMS_INDEX_KEY && typeof dataToRestore === 'object') {
            statistics.teamsImported = Object.keys(dataToRestore).length;
          } else if (key === SEASONS_LIST_KEY && Array.isArray(dataToRestore)) {
            statistics.seasonsImported = dataToRestore.length;
          } else if (key === TOURNAMENTS_LIST_KEY && Array.isArray(dataToRestore)) {
            statistics.tournamentsImported = dataToRestore.length;
          } else if (key === PERSONNEL_KEY && typeof dataToRestore === 'object') {
            statistics.personnelImported = Object.keys(dataToRestore).length;
          }
        } catch (innerError) {
          logger.error(
            `Error setting storage item for key ${key}:`,
            innerError,
          );
          // It's important to alert the user and rethrow or handle appropriately
          if (showToast) {
            showToast(i18n.t("fullBackup.restoreKeyError", { key }), 'error');
          } else {
            alert(i18n.t("fullBackup.restoreKeyError", { key }));
          }
          throw new Error(
            `Failed to restore data for key ${key}. Aborting import.`,
          );
        }
      } else {
        // If data for this key is null/undefined in backup, remove it from storage if it exists
        // Check if item exists before attempting removal to avoid unnecessary operations/logs
        try {
          const currentItem = await getStorageJSON<unknown>(key as string); // Check if item exists
          if (currentItem !== null) {
            await removeStorageItem(key as string);
            logger.log(
              `Removed existing data for key: ${key} as it was explicitly null or not present in the backup.`,
            );
          }
        } catch (error) {
          logger.warn(`Could not check/remove storage item for key ${key}:`, error);
        }
      }
    }

    // --- Ensure currentGameId points to a real game after restore ---
    try {
      const savedGames = await getStorageJSON<SavedGamesCollection | null>(SAVED_GAMES_KEY);
      if (savedGames && typeof savedGames === 'object') {
        const latestId = getLatestGameId(savedGames);
        if (latestId) {
          const currentSettings = await getStorageJSON<AppSettings | null>(APP_SETTINGS_KEY);
          const currentId = currentSettings?.currentGameId ?? null;
          const isStale = !currentId || currentId === DEFAULT_GAME_ID || !(currentId in savedGames);
          if (isStale) {
            const updated: AppSettings = { ...(currentSettings || {}), currentGameId: latestId } as AppSettings;
            await setStorageJSON(APP_SETTINGS_KEY, updated);
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
