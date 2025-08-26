import { Team, TeamPlayer, Player } from '@/types';
import { APP_DATA_VERSION_KEY } from '@/config/storageKeys';
import { getLocalStorageItem, setLocalStorageItem } from './localStorage';
import { getMasterRoster } from './masterRosterManager';
// Note: Removed imports for global entity migration (seasons/tournaments/saved games/adjustments remain global)
import { getLastHomeTeamName } from './appSettings';
import { addTeam, setTeamRoster } from './teams';
import logger from './logger';

const CURRENT_DATA_VERSION = 2;
const MIGRATION_TEAM_NAME_FALLBACK = 'My Team';

// Check if migration is needed
export const isMigrationNeeded = (): boolean => {
  const currentVersion = getAppDataVersion();
  return currentVersion < CURRENT_DATA_VERSION;
};

// Get current app data version
export const getAppDataVersion = (): number => {
  const stored = getLocalStorageItem(APP_DATA_VERSION_KEY);
  return stored ? parseInt(stored, 10) : 1; // Default to version 1 for existing data
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

  logger.log('[Migration] Starting migration to version', CURRENT_DATA_VERSION);

  try {
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

    // Step 7: Update app data version
    setAppDataVersion(CURRENT_DATA_VERSION);
    logger.log('[Migration] Migration completed successfully');

  } catch (error) {
    logger.error('[Migration] Migration failed:', error);
    throw error;
  }
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

// Create compatibility shims for existing code during migration
export const getMasterRosterCompat = async (): Promise<Player[]> => {
  // Note: Active team concept removed - this function now just returns master roster
  // This will be refactored when implementing contextual team selection
  return getMasterRoster();
};