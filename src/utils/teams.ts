import { Team, TeamPlayer } from '@/types';
import { TEAM_ROSTERS_KEY } from '@/config/storageKeys';
import { getStorageItem } from './storage';
import { withRosterLock } from './lockManager';
import logger from '@/utils/logger';
import { getDataStore } from '@/datastore';

// Note: TEAM_ROSTERS_KEY and getStorageItem are needed for getAllTeamRosters().
// See getAllTeamRosters() JSDoc for design rationale.

// Team index storage format: { [teamId: string]: Team }
export interface TeamsIndex {
  [teamId: string]: Team;
}

// Team rosters storage format: { [teamId: string]: TeamPlayer[] }
export interface TeamRostersIndex {
  [teamId: string]: TeamPlayer[];
}

/**
 * Retrieves all teams from IndexedDB as an index (object map by teamId).
 * DataStore handles initialization and storage access.
 *
 * @internal Used internally for roster operations that need the index format.
 * @returns A promise that resolves to a TeamsIndex object.
 */
export const getAllTeams = async (): Promise<TeamsIndex> => {
  try {
    const dataStore = await getDataStore();
    const teams = await dataStore.getTeams();
    // Convert array to index format for backwards compatibility
    const teamsIndex: TeamsIndex = {};
    for (const team of teams) {
      teamsIndex[team.id] = team;
    }
    return teamsIndex;
  } catch (error) {
    logger.warn('[getAllTeams] Failed to load teams, returning empty', { error });
    return {};
  }
};

/**
 * Retrieves all teams from IndexedDB as an array.
 * DataStore handles initialization and storage access.
 * @returns A promise that resolves to an array of Team objects.
 */
export const getTeams = async (): Promise<Team[]> => {
  try {
    const dataStore = await getDataStore();
    return await dataStore.getTeams();
  } catch (error) {
    logger.error('[getTeams] Error getting teams:', error);
    return [];
  }
};

/**
 * Retrieves a single team by ID.
 * DataStore handles storage access.
 * @param teamId - The ID of the team to retrieve.
 * @returns A promise that resolves to the Team object, or null if not found.
 */
export const getTeam = async (teamId: string): Promise<Team | null> => {
  try {
    const dataStore = await getDataStore();
    return await dataStore.getTeamById(teamId);
  } catch (error) {
    logger.error('[getTeam] Error getting team:', { teamId, error });
    return null;
  }
};

/**
 * Creates a new team.
 * DataStore handles ID generation, validation (name, ageGroup, notes), storage,
 * and initializing an empty roster for the new team.
 *
 * Error handling: Throws on validation errors (empty name, invalid ageGroup, duplicate name, etc.)
 * to match the existing contract. Use try/catch in calling code.
 *
 * @param teamData - The team data without id, createdAt, updatedAt.
 * @returns A promise that resolves to the newly created Team object.
 * @throws Error if validation fails (empty name, invalid ageGroup, too long notes, duplicate name).
 */
export const addTeam = async (teamData: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team> => {
  const dataStore = await getDataStore();
  return await dataStore.createTeam(teamData);
};

/**
 * Updates an existing team.
 * DataStore handles validation and storage.
 *
 * @param teamId - The ID of the team to update.
 * @param updates - Partial team data to update (excludes id, createdAt).
 * @returns A promise that resolves to the updated Team object, or null if not found.
 * @throws Error if validation fails (empty name, invalid ageGroup, too long notes, duplicate name).
 */
export const updateTeam = async (teamId: string, updates: Partial<Omit<Team, 'id' | 'createdAt'>>): Promise<Team | null> => {
  if (!teamId) {
    logger.error('[updateTeam] Invalid team ID provided.');
    return null;
  }

  const dataStore = await getDataStore();
  return await dataStore.updateTeam(teamId, updates);
};

/**
 * Deletes a team from storage by its ID.
 * DataStore handles storage and atomicity.
 * Note: Roster data is kept for potential recovery (not deleted).
 *
 * @param teamId - The ID of the team to delete.
 * @returns A promise that resolves to true if successful, false if not found or error occurs.
 */
export const deleteTeam = async (teamId: string): Promise<boolean> => {
  if (!teamId) {
    logger.error('[deleteTeam] Invalid team ID provided.');
    return false;
  }

  try {
    const dataStore = await getDataStore();
    const deleted = await dataStore.deleteTeam(teamId);

    if (!deleted) {
      logger.error(`[deleteTeam] Team with id ${teamId} not found.`);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('[deleteTeam] Unexpected error deleting team:', {
      teamId,
      error
    });
    return false;
  }
};

// Note: Active team management removed - teams are contextually selected

/**
 * Get all team rosters as an index.
 *
 * NOTE: Reads directly from storage (not via DataStore) for bulk read performance.
 * Used by TeamManagerModal for roster count display.
 *
 * @see DataStore interface - consider adding getAllTeamRosters() for full backend abstraction
 * @returns Promise resolving to TeamRostersIndex (empty object on error)
 */
export const getAllTeamRosters = async (): Promise<TeamRostersIndex> => {
  try {
    const json = await getStorageItem(TEAM_ROSTERS_KEY);
    if (!json) return {};
    return JSON.parse(json) as TeamRostersIndex;
  } catch (error) {
    logger.warn('Failed to load team rosters index, returning empty', { error });
    return {};
  }
};

// Lock mechanism for atomic roster operations is now handled by lockManager
// The withRosterLock function is imported from './lockManager'

export const getTeamRoster = async (teamId: string): Promise<TeamPlayer[]> => {
  return withRosterLock(async () => {
    const dataStore = await getDataStore();
    return await dataStore.getTeamRoster(teamId);
  });
};

export const setTeamRoster = async (teamId: string, roster: TeamPlayer[]): Promise<void> => {
  return withRosterLock(async () => {
    const dataStore = await getDataStore();
    await dataStore.setTeamRoster(teamId, roster);
  });
};

// Add player to team roster (atomic operation)
export const addPlayerToRoster = async (teamId: string, player: TeamPlayer): Promise<void> => {
  return withRosterLock(async () => {
    const dataStore = await getDataStore();
    const roster = await dataStore.getTeamRoster(teamId);
    const updatedRoster = [...roster, player];
    await dataStore.setTeamRoster(teamId, updatedRoster);
  });
};

// Update player in team roster (atomic operation)
export const updatePlayerInRoster = async (teamId: string, playerId: string, updates: Partial<TeamPlayer>): Promise<boolean> => {
  return withRosterLock(async () => {
    const dataStore = await getDataStore();
    const roster = await dataStore.getTeamRoster(teamId);
    const playerIndex = roster.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return false;

    roster[playerIndex] = { ...roster[playerIndex], ...updates };
    await dataStore.setTeamRoster(teamId, roster);
    return true;
  });
};

// Remove player from team roster (atomic operation)
export const removePlayerFromRoster = async (teamId: string, playerId: string): Promise<boolean> => {
  return withRosterLock(async () => {
    const dataStore = await getDataStore();
    const roster = await dataStore.getTeamRoster(teamId);
    const filteredRoster = roster.filter(p => p.id !== playerId);
    if (filteredRoster.length === roster.length) return false; // Player not found

    await dataStore.setTeamRoster(teamId, filteredRoster);
    return true;
  });
};

// Duplicate team (with new player IDs)
export const duplicateTeam = async (teamId: string): Promise<Team | null> => {
  const originalTeam = await getTeam(teamId);
  if (!originalTeam) return null;

  const originalRoster = await getTeamRoster(teamId);
  
  // Create new team with "(Copy)" suffix
  const newTeam = await addTeam({
    name: `${originalTeam.name} (Copy)`,
    color: originalTeam.color,
    ageGroup: originalTeam.ageGroup,
    notes: originalTeam.notes,
  });

  // Duplicate roster with new player IDs (per plan: globally unique IDs)
  const newRoster: TeamPlayer[] = originalRoster.map((player, index) => ({
    ...player,
    id: `player_${Date.now()}_${Math.random().toString(36).slice(2, 11)}_${index}`, // More unique ID with index
  }));

  await setTeamRoster(newTeam.id, newRoster);
  return newTeam;
};

/**
 * Count games associated with a team (for deletion impact analysis).
 * DataStore handles loading saved games.
 *
 * Error handling: Returns 0 on failure (graceful degradation for UI display).
 * This function is used for informational purposes (showing deletion impact),
 * not critical logic. Silent failure is acceptable - user can still proceed.
 *
 * Defensive checks: IndexedDB data could be corrupted or from old app versions,
 * so we validate each game entry before accessing properties.
 *
 * @param teamId - The ID of the team to count games for.
 * @returns A promise that resolves to the number of games associated with this team.
 *          Returns 0 if team has no games OR if an error occurs (logged for debugging).
 */
export const countGamesForTeam = async (teamId: string): Promise<number> => {
  try {
    const dataStore = await getDataStore();
    const savedGames = await dataStore.getGames();

    let count = 0;
    for (const gameState of Object.values(savedGames)) {
      // Defensive check: IndexedDB data could be corrupted or from old versions
      if (gameState && typeof gameState === 'object' && 'teamId' in gameState) {
        if (gameState.teamId === teamId) {
          count++;
        }
      }
    }

    return count;
  } catch (error) {
    logger.warn('[countGamesForTeam] Failed to count games for team, returning 0', { teamId, error });
    return 0;
  }
};