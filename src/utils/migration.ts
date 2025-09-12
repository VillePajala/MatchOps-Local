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
import logger from './logger';

const CURRENT_DATA_VERSION = 2;
const MIGRATION_TEAM_NAME_FALLBACK = 'My Team';

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
  if (!isMigrationNeeded()) {
    logger.log('[Migration] No migration needed, current version:', getAppDataVersion());
    return;
  }

  const currentVersion = getAppDataVersion();
  logger.log(`[Migration] Starting migration from version ${currentVersion} to version ${CURRENT_DATA_VERSION}`);

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
    logger.warn('[Migration] Found existing migration backup from:', { context: new Date(backupInfo?.timestamp || 0), component: 'migration', section: 'runMigration' });
    logger.warn('[Migration] This suggests a previous migration failed. Backup will be replaced.');
  }

  // Create backup before migration
  let backup;
  try {
    backup = await createMigrationBackup(CURRENT_DATA_VERSION);
    logger.log('[Migration] Created backup successfully');
  } catch (error) {
    logger.error('[Migration] Failed to create backup', error as Error, { component: 'migration', section: 'runMigration' });
    throw new Error(`Cannot proceed with migration - backup creation failed: ${error}`);
  }

  try {
    // Execute migration steps
    await performMigrationSteps();
    
    // Update app data version only if all steps succeed
    setAppDataVersion(CURRENT_DATA_VERSION);
    
    // Clear backup on successful migration
    clearMigrationBackup();
    logger.log('[Migration] Migration completed successfully');

  } catch (error) {
    logger.error('[Migration] Migration failed, attempting rollback', error as Error, { component: 'migration', section: 'runMigration' });
    
    try {
      await restoreMigrationBackup(backup);
      clearMigrationBackup();
      logger.log('[Migration] Successfully rolled back to previous state');
      
      // Re-throw the original migration error
      throw new Error(`Migration failed and was rolled back: ${error}`);
      
    } catch (rollbackError) {
      logger.error('[Migration] CRITICAL: Rollback failed', rollbackError as Error, { component: 'migration', section: 'runMigration' });
      
      // Don't clear backup if rollback failed - user might need it
      throw new Error(`Migration failed and rollback unsuccessful. Original error: ${error}. Rollback error: ${rollbackError}. Please restore from a manual backup or contact support.`);
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
    logger.warn('[Migration] Could not migrate roster', { context: error, component: 'migration', section: 'migrateRosterToTeam' });
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
      logger.error('[Migration Recovery] Backup validation failed', new Error(validation.errors.join(', ')), { component: 'migration', section: 'recoverFromFailedMigration' });
      return false;
    }

    // Restore from backup
    await restoreMigrationBackup();
    clearMigrationBackup();
    
    logger.log('[Migration Recovery] Successfully restored from backup');
    return true;

  } catch (error) {
    logger.error('[Migration Recovery] Recovery failed', error as Error, { component: 'migration', section: 'recoverFromFailedMigration' });
    return false;
  }
};

/**
 * Get migration status and backup info
 */
export const getMigrationStatus = async () => {
  const { hasMigrationBackup, getMigrationBackupInfo } = await import('./migrationBackup');
  
  return {
    currentVersion: getAppDataVersion(),
    targetVersion: CURRENT_DATA_VERSION,
    migrationNeeded: isMigrationNeeded(),
    hasBackup: hasMigrationBackup(),
    backupInfo: getMigrationBackupInfo()
  };
};

// Create compatibility shims for existing code during migration
export const getMasterRosterCompat = async (): Promise<Player[]> => {
  // Note: Active team concept removed - this function now just returns master roster
  // This will be refactored when implementing contextual team selection
  return getMasterRoster();
};