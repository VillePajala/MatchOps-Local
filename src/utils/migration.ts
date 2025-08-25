import { Team, TeamPlayer, Player } from '@/types';
import { SavedGamesCollection } from '@/types/game';
import { APP_DATA_VERSION_KEY } from '@/config/storageKeys';
import { getLocalStorageItem, setLocalStorageItem } from './localStorage';
import { getMasterRoster } from './masterRosterManager';
import { getSavedGames } from './savedGames';
import { getSeasons } from './seasons';
import { getTournaments } from './tournaments';
import { getAllPlayerAdjustments } from './playerAdjustments';
import { getLastHomeTeamName } from './appSettings';
import { createTeam, setActiveTeamId, setTeamRoster } from './teams';
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

    // Step 3: Tag existing seasons/tournaments with teamId
    await migrateSeasonsToTeam(defaultTeam.id);
    await migrateTournamentsToTeam(defaultTeam.id);
    logger.log('[Migration] Migrated seasons and tournaments');

    // Step 4: Update saved games to include teamId
    await migrateSavedGamesToTeam(defaultTeam.id);
    logger.log('[Migration] Migrated saved games');

    // Step 5: Update external player adjustments
    await migratePlayerAdjustmentsToTeam(defaultTeam.id);
    logger.log('[Migration] Migrated player adjustments');

    // Step 6: Set as active team
    setActiveTeamId(defaultTeam.id);
    logger.log('[Migration] Set default team as active');

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

  return await createTeam({
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

// Add teamId to existing seasons
const migrateSeasonsToTeam = async (teamId: string): Promise<void> => {
  try {
    const seasons = await getSeasons();
    const updatedSeasons = seasons.map(season => ({
      ...season,
      teamId: season.teamId || teamId, // Only set if not already set
    }));

    // Save updated seasons back to localStorage
    setLocalStorageItem('soccerSeasons', JSON.stringify(updatedSeasons));
  } catch (error) {
    logger.warn('[Migration] Could not migrate seasons:', error);
  }
};

// Add teamId to existing tournaments
const migrateTournamentsToTeam = async (teamId: string): Promise<void> => {
  try {
    const tournaments = await getTournaments();
    const updatedTournaments = tournaments.map(tournament => ({
      ...tournament,
      teamId: tournament.teamId || teamId, // Only set if not already set
    }));

    // Save updated tournaments back to localStorage
    setLocalStorageItem('soccerTournaments', JSON.stringify(updatedTournaments));
  } catch (error) {
    logger.warn('[Migration] Could not migrate tournaments:', error);
  }
};

// Add teamId to existing saved games
const migrateSavedGamesToTeam = async (teamId: string): Promise<void> => {
  try {
    const savedGames = await getSavedGames();
    const updatedGames: SavedGamesCollection = {};

    Object.entries(savedGames).forEach(([gameId, gameState]) => {
      updatedGames[gameId] = {
        ...gameState,
        teamId: gameState.teamId || teamId, // Only set if not already set
      };
    });

    // Save updated games back to localStorage
    setLocalStorageItem('savedSoccerGames', JSON.stringify(updatedGames));
  } catch (error) {
    logger.warn('[Migration] Could not migrate saved games:', error);
  }
};

// Add teamId to existing player adjustments
const migratePlayerAdjustmentsToTeam = async (teamId: string): Promise<void> => {
  try {
    const adjustmentsIndex = await getAllPlayerAdjustments();
    let hasUpdates = false;

    Object.keys(adjustmentsIndex).forEach(playerId => {
      const adjustments = adjustmentsIndex[playerId];
      adjustments.forEach(adjustment => {
        if (!adjustment.teamId) {
          adjustment.teamId = teamId;
          hasUpdates = true;
        }
      });
    });

    if (hasUpdates) {
      // Save updated adjustments back to localStorage
      setLocalStorageItem('soccerPlayerAdjustments', JSON.stringify(adjustmentsIndex));
    }
  } catch (error) {
    logger.warn('[Migration] Could not migrate player adjustments:', error);
  }
};

// Create compatibility shims for existing code during migration
export const getMasterRosterCompat = async (): Promise<Player[]> => {
  // If migration is complete, get roster from active team
  if (!isMigrationNeeded()) {
    const { getActiveTeamId, getTeamRoster } = await import('./teams');
    const activeTeamId = getActiveTeamId();
    if (activeTeamId) {
      const teamRoster = await getTeamRoster(activeTeamId);
      // Convert TeamPlayer back to Player for compatibility
      return teamRoster.map(teamPlayer => ({
        ...teamPlayer,
        relX: undefined,
        relY: undefined,
      })) as Player[];
    }
  }
  
  // Fallback to original method during migration
  return getMasterRoster();
};