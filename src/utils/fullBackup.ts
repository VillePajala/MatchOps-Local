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
} from "@/config/storageKeys";
import logger from "@/utils/logger";
import i18n from "i18next";
// Import the new async storage helper functions
import {
  getStorageJSON,
  setStorageJSON,
  removeStorageItem,
} from "./storage";
import type { PlayerAdjustmentsIndex } from './playerAdjustments';
import type { TeamsIndex, TeamRostersIndex } from './teams';
import { processImportedGames } from './gameImportHelper';

// Define the structure of the backup file
interface FullBackupData {
  meta: {
    schema: number;
    exportedAt: string;
  };
  localStorage: { // Note: field name kept for backward compatibility with existing backups
    [SAVED_GAMES_KEY]?: SavedGamesCollection | null;
    [APP_SETTINGS_KEY]?: { currentGameId: string | null } | null;
    [SEASONS_LIST_KEY]?: Season[] | null;
    [TOURNAMENTS_LIST_KEY]?: Tournament[] | null;
    [MASTER_ROSTER_KEY]?: Player[] | null;
    [PLAYER_ADJUSTMENTS_KEY]?: PlayerAdjustmentsIndex | null;
    [TEAMS_INDEX_KEY]?: TeamsIndex | null;
    [TEAM_ROSTERS_KEY]?: TeamRostersIndex | null;
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
 *
 * @returns Promise<boolean> - true if import succeeded, false if user cancelled or import failed
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
 */
export const importFullBackup = async (
  jsonContent: string,
  onImportSuccess?: () => void,
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void,
  confirmed?: boolean
): Promise<boolean> => {
  logger.log("Starting full backup import...");
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
        return false; // User cancelled
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
          
          // Show user-friendly summary
          if (mappingReport.gamesWithMappedPlayers > 0) {
            const message = `Successfully processed ${mappingReport.totalGames} games. ${mappingReport.gamesWithMappedPlayers} games had players mapped to your current roster. This ensures imported games appear in player statistics.`;
            // We'll show this after the main success message
            if (showToast) {
              setTimeout(() => showToast(message, 'info'), 1000);
            } else {
              setTimeout(() => alert(message), 1000);
            }
          }
        }
      } catch (error) {
        logger.error('Error processing imported games for player mapping:', error);
        // Continue with import even if processing fails
      }
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

    // --- Final Step: Trigger app refresh ---
    logger.log("Data restored successfully. Triggering app state refresh...");
    if (showToast) {
      showToast(i18n.t("fullBackup.restoreSuccess"), 'success');
    } else {
      alert(i18n.t("fullBackup.restoreSuccess"));
    }

    // Use callback to refresh app state without reload, or fallback to reload
    if (onImportSuccess) {
      // Use setTimeout to ensure the alert is seen before refresh
      setTimeout(() => {
        onImportSuccess();
      }, 500);
    } else {
      // Fallback to reload for backward compatibility
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }

    return true; // Indicate success
  } catch (error) {
    logger.error("Failed to import full backup:", error);
    // Type check for error before accessing message
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (showToast) {
      showToast(i18n.t("fullBackup.restoreError", { error: errorMessage }), 'error');
    } else {
      alert(i18n.t("fullBackup.restoreError", { error: errorMessage }));
    }
    return false; // Indicate failure
  }
};
