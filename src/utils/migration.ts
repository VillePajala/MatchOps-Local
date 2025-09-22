import { Team, TeamPlayer, Player } from '@/types';
import {
  APP_DATA_VERSION_KEY,
  MASTER_ROSTER_KEY,
  SAVED_GAMES_KEY,
  SEASONS_LIST_KEY,
  TOURNAMENTS_LIST_KEY
} from '@/config/storageKeys';
import { getLocalStorageItem, setLocalStorageItem } from './localStorage';
import { getMasterRoster } from './masterRosterManager';
// Note: Removed imports for global entity migration (seasons/tournaments/saved games/adjustments remain global)
import { getLastHomeTeamName } from './appSettings';
import { addTeam, setTeamRoster } from './teams';
import { getStorageConfig } from './storageFactory';
import { IndexedDbMigrationOrchestratorMemoryOptimized } from './indexedDbMigrationMemoryOptimized';
import { updateMigrationStatus } from '@/hooks/useMigrationStatus';
import { createMigrationMetrics, completeMigrationMetrics } from './migrationMetrics';
import { performStorageQuotaCheck } from './storageQuotaCheck';
import {
  CURRENT_DATA_VERSION,
  INDEXEDDB_STORAGE_VERSION,
  MIGRATION_TEAM_NAME_FALLBACK
} from '@/config/migrationConfig';
import logger from './logger';

// Check if there's any existing app data (used to detect fresh installations)
const checkForExistingData = (): boolean => {
  // Check for key data that would exist in a v1 installation
  const masterRoster = getLocalStorageItem(MASTER_ROSTER_KEY);
  const savedGames = getLocalStorageItem(SAVED_GAMES_KEY);
  const seasons = getLocalStorageItem(SEASONS_LIST_KEY);
  const tournaments = getLocalStorageItem(TOURNAMENTS_LIST_KEY);
  
  return !!(masterRoster || savedGames || seasons || tournaments);
};

// Check if migration is needed
export const isMigrationNeeded = (): boolean => {
  const currentVersion = getAppDataVersion();
  return currentVersion < CURRENT_DATA_VERSION;
};

// Get current app data version
export const getAppDataVersion = (): number => {
  const stored = getLocalStorageItem(APP_DATA_VERSION_KEY);
  if (stored) {
    return parseInt(stored, 10);
  }
  
  // For fresh installations with no version stored, check if there's any existing data
  // If no existing data, set to current version immediately to avoid unnecessary migration
  const hasExistingData = checkForExistingData();
  if (!hasExistingData) {
    // Fresh installation - set to current version
    setAppDataVersion(CURRENT_DATA_VERSION);
    return CURRENT_DATA_VERSION;
  }
  
  // Has existing data but no version - this is a v1 installation that needs migration
  return 1;
};

// Set app data version
export const setAppDataVersion = (version: number): void => {
  setLocalStorageItem(APP_DATA_VERSION_KEY, version.toString());
};

// Main migration function (idempotent - safe to run multiple times)
export const runMigration = async (): Promise<void> => {
  // First, check if app data migration is needed
  const appMigrationNeeded = isMigrationNeeded();

  // Then, check if IndexedDB migration is needed
  const storageConfig = getStorageConfig();
  const indexedDbMigrationNeeded = storageConfig.mode === 'localStorage' &&
                                   storageConfig.version !== INDEXEDDB_STORAGE_VERSION &&
                                   storageConfig.forceMode !== 'localStorage';

  if (!appMigrationNeeded && !indexedDbMigrationNeeded) {
    if (storageConfig.forceMode === 'localStorage') {
      logger.log('[Migration] No migration needed. App version:', getAppDataVersion(), 'Storage mode:', storageConfig.mode, '(localStorage forced)');
    } else {
      logger.log('[Migration] No migration needed. App version:', getAppDataVersion(), 'Storage mode:', storageConfig.mode);
    }
    return;
  }

  // Handle app data migration first (if needed)
  if (appMigrationNeeded) {
    const currentVersion = getAppDataVersion();
    logger.log(`[Migration] Starting app data migration from version ${currentVersion} to version ${CURRENT_DATA_VERSION}`);

    // Import backup functions here to avoid circular dependencies
    const {
      createMigrationBackup,
      restoreMigrationBackup,
      clearMigrationBackup,
      hasMigrationBackup,
      getMigrationBackupInfo
    } = await import('./migrationBackup');

    // Check for existing backup (from failed previous migration)
    if (hasMigrationBackup()) {
      const backupInfo = getMigrationBackupInfo();
      logger.warn('[Migration] Found existing migration backup from:', new Date(backupInfo?.timestamp || 0));
      logger.warn('[Migration] This suggests a previous migration failed. Backup will be replaced.');
    }

    // Create backup before migration
    let backup;
    try {
      backup = await createMigrationBackup(CURRENT_DATA_VERSION);
      logger.log('[Migration] Created backup successfully');
    } catch (error) {
      logger.error('[Migration] Failed to create backup:', error);
      throw new Error(`Cannot proceed with migration - backup creation failed: ${error}`);
    }

    try {
      // Execute migration steps
      await performMigrationSteps();

      // Update app data version only if all steps succeed
      setAppDataVersion(CURRENT_DATA_VERSION);

      // Clear backup on successful migration
      clearMigrationBackup();
      logger.log('[Migration] App data migration completed successfully');

    } catch (error) {
      logger.error('[Migration] Migration failed, attempting rollback:', error);

      try {
        await restoreMigrationBackup(backup);
        clearMigrationBackup();
        logger.log('[Migration] Successfully rolled back to previous state');

        // Re-throw the original migration error
        throw new Error(`Migration failed and was rolled back: ${error}`);

      } catch (rollbackError) {
        logger.error('[Migration] CRITICAL: Rollback failed:', rollbackError);

        // Don't clear backup if rollback failed - user might need it
        throw new Error(`Migration failed and rollback unsuccessful. Original error: ${error}. Rollback error: ${rollbackError}. Please restore from a manual backup or contact support.`);
      }
    }
  }

  // Handle IndexedDB migration (if needed)
  if (indexedDbMigrationNeeded) {
    logger.log('[Migration] Starting IndexedDB storage migration');

    // Perform storage quota pre-flight check
    logger.log('[Migration] Performing storage quota pre-flight check...');
    const quotaCheck = await performStorageQuotaCheck();

    if (!quotaCheck.canProceed) {
      const errorMessage = `Storage quota insufficient for migration. ${quotaCheck.warnings.join('. ')}`;
      logger.error('[Migration] Storage quota check failed:', {
        warnings: quotaCheck.warnings,
        recommendations: quotaCheck.recommendations,
        currentUsage: quotaCheck.quotaInfo.usage,
        available: quotaCheck.quotaInfo.available,
        required: quotaCheck.estimate.totalRequiredSpace
      });

      // Notify UI of storage quota failure
      updateMigrationStatus({
        isRunning: false,
        progress: null,
        error: errorMessage + ' ' + quotaCheck.recommendations.join('. '),
        showNotification: true
      });

      throw new Error(errorMessage);
    }

    // Log warnings if any (but proceed)
    if (quotaCheck.warnings.length > 0) {
      logger.warn('[Migration] Storage quota warnings:', quotaCheck.warnings);
    }

    // Start metrics tracking
    const migrationId = `migration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const metrics = createMigrationMetrics(migrationId);

    // Notify UI that migration is starting
    updateMigrationStatus({
      isRunning: true,
      progress: null,
      error: null,
      showNotification: false
    });

    try {
      const migrationOrchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized({
        targetVersion: INDEXEDDB_STORAGE_VERSION,
        verifyData: true,
        keepBackupOnSuccess: false,
        enablePartialRecovery: true,
        // Memory optimization settings
        enableMemoryOptimization: true,
        memoryOptimizationThreshold: 0.7,
        enableProgressiveLoading: true,
        progressiveLoadingThreshold: 100 * 1024 * 1024, // 100MB
        enableForcedGC: true,
        memoryMonitoringInterval: 2000, // 2 seconds
        progressCallback: (progress) => {
          // Get memory optimization status
          const memoryStatus = migrationOrchestrator.getMemoryOptimizationStatus();

          logger.log('[IndexedDB Migration Progress]', {
            state: progress.state,
            percentage: `${progress.percentage}%`,
            currentStep: progress.currentStep,
            processedKeys: `${progress.processedKeys}/${progress.totalKeys}`,
            estimatedTime: progress.estimatedTimeRemainingText,
            // Memory optimization info
            memoryUsage: `${memoryStatus.memoryUsage.toFixed(1)}%`,
            memoryPressure: memoryStatus.memoryPressure,
            chunkSize: memoryStatus.currentChunkSize,
            availableMemoryMB: memoryStatus.availableMemoryMB,
            gcTriggered: memoryStatus.gcTriggered
          });

          // Update UI with progress
          updateMigrationStatus({
            isRunning: true,
            progress,
            error: null,
            showNotification: false
          });
        },
        notificationCallback: (message, type) => {
          logger.log(`[IndexedDB Migration ${type}]`, message);
        }
      });

      const result = await migrationOrchestrator.migrate();

      if (result.success) {
        logger.log('[Migration] IndexedDB storage migration completed successfully', {
          duration: `${result.duration}ms`,
          state: result.state
        });

        // Complete metrics tracking
        completeMigrationMetrics(
          metrics,
          true,
          0, // totalDataSizeMB - will be calculated by orchestrator
          0, // keysTransferred - will be calculated by orchestrator
          undefined
        );

        // Migration completed successfully
        updateMigrationStatus({
          isRunning: false,
          progress: null,
          error: null,
          showNotification: true
        });
      } else {
        logger.error('[Migration] IndexedDB storage migration failed', {
          state: result.state,
          errors: result.errors
        });

        const errorMessage = `Storage upgrade failed: ${result.errors.join(', ')}. Continuing with standard storage.`;
        const errorType = result.errors.length > 0 ? result.errors[0] : 'unknown_error';

        // Complete metrics tracking with failure
        completeMigrationMetrics(
          metrics,
          false,
          0,
          0,
          errorType
        );

        // Show error notification
        updateMigrationStatus({
          isRunning: false,
          progress: null,
          error: errorMessage,
          showNotification: true
        });

        throw new Error(`IndexedDB migration failed: ${result.errors.join(', ')}`);
      }
    } catch (error) {
      logger.error('[Migration] IndexedDB migration error:', error);

      const errorMessage = 'Storage upgrade failed. The app will continue using standard storage.';
      const errorType = error instanceof Error ? error.message : 'unexpected_error';

      // Complete metrics tracking with exception
      completeMigrationMetrics(
        metrics,
        false,
        0,
        0,
        errorType
      );

      // Show error notification but don't crash the app
      updateMigrationStatus({
        isRunning: false,
        progress: null,
        error: errorMessage,
        showNotification: true
      });

      // Don't throw here - app can still work with localStorage
      logger.warn('[Migration] Continuing with localStorage mode due to IndexedDB migration failure');
    }
  }
};

// Execute the actual migration steps
const performMigrationSteps = async (): Promise<void> => {
  // Step 1: Create default team from current data
  const defaultTeam = await createDefaultTeam();
  logger.log('[Migration] Created default team:', defaultTeam);

  // Step 2: Move roster to team rosters
  await migrateRosterToTeam(defaultTeam.id);
  logger.log('[Migration] Migrated roster to team');

  // Step 3: Seasons and tournaments remain global (no teamId tagging per plan)
  logger.log('[Migration] Seasons and tournaments remain global entities');

  // Step 4: Saved games remain untagged (legacy games stay global per plan) 
  logger.log('[Migration] Saved games remain global (legacy data preserved)');

  // Step 5: Player adjustments remain untagged (historical data preserved)
  logger.log('[Migration] Player adjustments remain global (historical data preserved)');

  // Step 6: Set as active team
  // Note: Active team concept removed - teams are contextually selected
  logger.log('[Migration] Created default team for legacy data');
};

// Create default team from current data
const createDefaultTeam = async (): Promise<Team> => {
  // Try to get team name from settings, fallback to default
  let teamName: string;
  try {
    const lastTeamName = await getLastHomeTeamName();
    teamName = lastTeamName || MIGRATION_TEAM_NAME_FALLBACK;
  } catch {
    teamName = MIGRATION_TEAM_NAME_FALLBACK;
  }

  return await addTeam({
    name: teamName,
    color: '#6366F1', // Default indigo color
  });
};

// Move existing roster to team roster structure
const migrateRosterToTeam = async (teamId: string): Promise<void> => {
  try {
    const masterRoster = await getMasterRoster();
    
    // Convert Player[] to TeamPlayer[] (remove field-specific properties)
    const teamRoster: TeamPlayer[] = masterRoster.map(player => ({
      id: player.id,
      name: player.name,
      nickname: player.nickname,
      jerseyNumber: player.jerseyNumber,
      isGoalie: player.isGoalie,
      color: player.color,
      notes: player.notes,
      receivedFairPlayCard: player.receivedFairPlayCard,
      // Note: relX/relY are field-specific and not copied to team roster
    }));

    await setTeamRoster(teamId, teamRoster);
  } catch (error) {
    logger.warn('[Migration] Could not migrate roster:', error);
    // Set empty roster if migration fails
    await setTeamRoster(teamId, []);
  }
};

// Note: Previous functions removed per plan - seasons/tournaments/saved games/adjustments remain global
// - migrateSeasonsToTeam: Seasons remain global entities (no teamId tagging)
// - migrateTournamentsToTeam: Tournaments remain global entities (no teamId tagging) 
// - migrateSavedGamesToTeam: Legacy games preserved as global (no historical data mutation)
// - migratePlayerAdjustmentsToTeam: Historical adjustments preserved (no retrospective tagging)

/**
 * Manual recovery function for failed migrations
 * This can be called from settings or developer tools
 */
export const recoverFromFailedMigration = async (): Promise<boolean> => {
  const { 
    hasMigrationBackup, 
    restoreMigrationBackup, 
    clearMigrationBackup,
    getMigrationBackupInfo,
    validateMigrationBackup
  } = await import('./migrationBackup');

  if (!hasMigrationBackup()) {
    logger.log('[Migration Recovery] No migration backup found');
    return false;
  }

  const backupInfo = getMigrationBackupInfo();
  if (!backupInfo) {
    logger.error('[Migration Recovery] Backup exists but cannot read info');
    return false;
  }

  logger.log(`[Migration Recovery] Found backup from ${new Date(backupInfo.timestamp)} (version ${backupInfo.version})`);

  try {
    // Load and validate the backup
    const backupData = JSON.parse(getLocalStorageItem('MIGRATION_BACKUP_TEMP') || '{}');
    const validation = validateMigrationBackup(backupData);
    
    if (!validation.valid) {
      logger.error('[Migration Recovery] Backup validation failed:', validation.errors);
      return false;
    }

    // Restore from backup
    await restoreMigrationBackup();
    clearMigrationBackup();
    
    logger.log('[Migration Recovery] Successfully restored from backup');
    return true;

  } catch (error) {
    logger.error('[Migration Recovery] Recovery failed:', error);
    return false;
  }
};

/**
 * Get migration status and backup info
 */
export const getMigrationStatus = async () => {
  const { hasMigrationBackup, getMigrationBackupInfo } = await import('./migrationBackup');
  const storageConfig = getStorageConfig();

  return {
    currentVersion: getAppDataVersion(),
    targetVersion: CURRENT_DATA_VERSION,
    migrationNeeded: isMigrationNeeded(),
    hasBackup: hasMigrationBackup(),
    backupInfo: getMigrationBackupInfo(),
    storageMode: storageConfig.mode,
    storageVersion: storageConfig.version,
    storageForceMode: storageConfig.forceMode,
    indexedDbTargetVersion: INDEXEDDB_STORAGE_VERSION,
    indexedDbMigrationNeeded: isIndexedDbMigrationNeeded(),
    indexedDbMigrationState: storageConfig.migrationState
  };
};

/**
 * Check if IndexedDB migration is needed
 */
export const isIndexedDbMigrationNeeded = (): boolean => {
  const storageConfig = getStorageConfig();
  return storageConfig.mode === 'localStorage' &&
         storageConfig.version !== INDEXEDDB_STORAGE_VERSION &&
         storageConfig.forceMode !== 'localStorage';
};

/**
 * Manually trigger IndexedDB migration (for settings UI)
 */
export const triggerIndexedDbMigration = async (): Promise<boolean> => {
  const storageConfig = getStorageConfig();

  if (storageConfig.mode === 'indexedDB') {
    logger.log('[Migration] Already using IndexedDB storage');
    return true;
  }

  if (storageConfig.forceMode === 'localStorage') {
    logger.log('[Migration] Migration skipped: localStorage mode is forced');
    return false;
  }

  try {
    logger.log('[Migration] Manually triggered IndexedDB storage migration');

    const migrationOrchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized({
      targetVersion: INDEXEDDB_STORAGE_VERSION,
      verifyData: true,
      keepBackupOnSuccess: false,
      enablePartialRecovery: true,
      progressCallback: (progress: { state: string; percentage: number; currentStep?: string }) => {
        logger.log('[IndexedDB Migration Progress]', {
          state: progress.state,
          percentage: `${progress.percentage}%`,
          currentStep: progress.currentStep
        });
      }
    });

    const result = await migrationOrchestrator.migrate();

    if (result.success) {
      logger.log('[Migration] IndexedDB storage migration completed successfully');
      return true;
    } else {
      logger.error('[Migration] IndexedDB storage migration failed', result.errors);
      return false;
    }
  } catch (error) {
    logger.error('[Migration] IndexedDB migration error:', error);
    return false;
  }
};

// Create compatibility shims for existing code during migration
export const getMasterRosterCompat = async (): Promise<Player[]> => {
  // Note: Active team concept removed - this function now just returns master roster
  // This will be refactored when implementing contextual team selection
  return getMasterRoster();
};