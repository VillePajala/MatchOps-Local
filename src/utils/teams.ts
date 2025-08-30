import { Team, TeamPlayer } from '@/types';
import type { AppState } from '@/types/game';
import { 
  TEAMS_INDEX_KEY,
  TEAM_ROSTERS_KEY 
} from '@/config/storageKeys';
import { getLocalStorageItem, setLocalStorageItem } from './localStorage';
import { withRosterLock } from './lockManager';

// Team index storage format: { [teamId: string]: Team }
export interface TeamsIndex {
  [teamId: string]: Team;
}

// Team rosters storage format: { [teamId: string]: TeamPlayer[] }
export interface TeamRostersIndex {
  [teamId: string]: TeamPlayer[];
}

// Get all teams
export const getAllTeams = async (): Promise<TeamsIndex> => {
  const json = getLocalStorageItem(TEAMS_INDEX_KEY);
  if (!json) return {};
  try {
    return JSON.parse(json) as TeamsIndex;
  } catch {
    return {};
  }
};

// Get teams as array
export const getTeams = async (): Promise<Team[]> => {
  const teamsIndex = await getAllTeams();
  return Object.values(teamsIndex);
};

// Get single team by id
export const getTeam = async (teamId: string): Promise<Team | null> => {
  const teamsIndex = await getAllTeams();
  return teamsIndex[teamId] || null;
};

// Validate team name uniqueness (case-insensitive, normalized)
const validateTeamName = async (name: string, excludeTeamId?: string): Promise<void> => {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Team name cannot be empty');
  }
  if (trimmed.length > 48) {
    throw new Error('Team name cannot exceed 48 characters');
  }

  const teams = await getTeams();
  const normalizedName = trimmed.toLowerCase().normalize('NFKC');
  
  const existingTeam = teams.find(team => 
    team.id !== excludeTeamId && 
    team.name.toLowerCase().normalize('NFKC') === normalizedName
  );
  
  if (existingTeam) {
    throw new Error(`A team named '${trimmed}' already exists.`);
  }
};

// Create new team
export const addTeam = async (teamData: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team> => {
  await validateTeamName(teamData.name);
  
  const now = new Date().toISOString();
  const team: Team = {
    id: `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...teamData,
    name: teamData.name.trim(), // Ensure trimmed
    createdAt: now,
    updatedAt: now,
  };

  const teamsIndex = await getAllTeams();
  teamsIndex[team.id] = team;
  setLocalStorageItem(TEAMS_INDEX_KEY, JSON.stringify(teamsIndex));

  // Initialize empty roster for new team
  await setTeamRoster(team.id, []);

  return team;
};

// Update existing team
export const updateTeam = async (teamId: string, updates: Partial<Omit<Team, 'id' | 'createdAt'>>): Promise<Team | null> => {
  const teamsIndex = await getAllTeams();
  const existing = teamsIndex[teamId];
  if (!existing) return null;

  // Validate name if being updated
  if (updates.name !== undefined) {
    await validateTeamName(updates.name, teamId);
    updates.name = updates.name.trim();
  }

  const updatedTeam: Team = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  teamsIndex[teamId] = updatedTeam;
  setLocalStorageItem(TEAMS_INDEX_KEY, JSON.stringify(teamsIndex));
  return updatedTeam;
};

// Delete team (remove from index but keep roster data for potential recovery)
export const deleteTeam = async (teamId: string): Promise<boolean> => {
  const teamsIndex = await getAllTeams();
  if (!teamsIndex[teamId]) return false;

  delete teamsIndex[teamId];
  setLocalStorageItem(TEAMS_INDEX_KEY, JSON.stringify(teamsIndex));
  return true;
};

// Note: Active team management removed - teams are contextually selected

// Team roster management
export const getAllTeamRosters = async (): Promise<TeamRostersIndex> => {
  const json = getLocalStorageItem(TEAM_ROSTERS_KEY);
  if (!json) return {};
  try {
    return JSON.parse(json) as TeamRostersIndex;
  } catch {
    return {};
  }
};

// Lock mechanism for atomic roster operations is now handled by lockManager
// The withRosterLock function is imported from './lockManager'

export const getTeamRoster = async (teamId: string): Promise<TeamPlayer[]> => {
  return withRosterLock(async () => {
    const rostersIndex = await getAllTeamRosters();
    return rostersIndex[teamId] || [];
  });
};

export const setTeamRoster = async (teamId: string, roster: TeamPlayer[]): Promise<void> => {
  return withRosterLock(async () => {
    const rostersIndex = await getAllTeamRosters();
    rostersIndex[teamId] = roster;
    setLocalStorageItem(TEAM_ROSTERS_KEY, JSON.stringify(rostersIndex));
  });
};

// Add player to team roster (atomic operation)
export const addPlayerToRoster = async (teamId: string, player: TeamPlayer): Promise<void> => {
  return withRosterLock(async () => {
    const rostersIndex = await getAllTeamRosters();
    const roster = rostersIndex[teamId] || [];
    const updatedRoster = [...roster, player];
    rostersIndex[teamId] = updatedRoster;
    setLocalStorageItem(TEAM_ROSTERS_KEY, JSON.stringify(rostersIndex));
  });
};

// Update player in team roster (atomic operation)
export const updatePlayerInRoster = async (teamId: string, playerId: string, updates: Partial<TeamPlayer>): Promise<boolean> => {
  return withRosterLock(async () => {
    const rostersIndex = await getAllTeamRosters();
    const roster = rostersIndex[teamId] || [];
    const playerIndex = roster.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return false;

    roster[playerIndex] = { ...roster[playerIndex], ...updates };
    rostersIndex[teamId] = roster;
    setLocalStorageItem(TEAM_ROSTERS_KEY, JSON.stringify(rostersIndex));
    return true;
  });
};

// Remove player from team roster (atomic operation)
export const removePlayerFromRoster = async (teamId: string, playerId: string): Promise<boolean> => {
  return withRosterLock(async () => {
    const rostersIndex = await getAllTeamRosters();
    const roster = rostersIndex[teamId] || [];
    const filteredRoster = roster.filter(p => p.id !== playerId);
    if (filteredRoster.length === roster.length) return false; // Player not found

    rostersIndex[teamId] = filteredRoster;
    setLocalStorageItem(TEAM_ROSTERS_KEY, JSON.stringify(rostersIndex));
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
  });

  // Duplicate roster with new player IDs (per plan: globally unique IDs)
  const newRoster: TeamPlayer[] = originalRoster.map((player, index) => ({
    ...player,
    id: `player_${Date.now()}_${Math.random().toString(36).slice(2, 11)}_${index}`, // More unique ID with index
  }));

  await setTeamRoster(newTeam.id, newRoster);
  return newTeam;
};

// Count games associated with a team (for deletion impact analysis)
export const countGamesForTeam = async (teamId: string): Promise<number> => {
  try {
    const savedGamesJson = getLocalStorageItem('savedSoccerGames');
    if (!savedGamesJson) return 0;
    
    const savedGames = JSON.parse(savedGamesJson);
    let count = 0;
    
    for (const gameState of Object.values(savedGames)) {
      if ((gameState as AppState).teamId === teamId) {
        count++;
      }
    }
    
    return count;
  } catch {
    return 0;
  }
};