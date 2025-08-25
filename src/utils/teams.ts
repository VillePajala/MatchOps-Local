import { Team, TeamPlayer } from '@/types';
import { 
  TEAMS_INDEX_KEY, 
  ACTIVE_TEAM_ID_KEY, 
  TEAM_ROSTERS_KEY 
} from '@/config/storageKeys';
import { getLocalStorageItem, setLocalStorageItem } from './localStorage';

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

// Create new team
export const createTeam = async (teamData: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team> => {
  const now = new Date().toISOString();
  const team: Team = {
    id: `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...teamData,
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

// Active team management
export const getActiveTeamId = (): string | null => {
  const stored = getLocalStorageItem(ACTIVE_TEAM_ID_KEY);
  return stored || null;
};

export const setActiveTeamId = (teamId: string | null): void => {
  if (teamId) {
    setLocalStorageItem(ACTIVE_TEAM_ID_KEY, teamId);
  } else {
    localStorage.removeItem(ACTIVE_TEAM_ID_KEY);
  }
};

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

export const getTeamRoster = async (teamId: string): Promise<TeamPlayer[]> => {
  const rostersIndex = await getAllTeamRosters();
  return rostersIndex[teamId] || [];
};

export const setTeamRoster = async (teamId: string, roster: TeamPlayer[]): Promise<void> => {
  const rostersIndex = await getAllTeamRosters();
  rostersIndex[teamId] = roster;
  setLocalStorageItem(TEAM_ROSTERS_KEY, JSON.stringify(rostersIndex));
};

// Add player to team roster
export const addPlayerToRoster = async (teamId: string, player: TeamPlayer): Promise<void> => {
  const roster = await getTeamRoster(teamId);
  const updatedRoster = [...roster, player];
  await setTeamRoster(teamId, updatedRoster);
};

// Update player in team roster
export const updatePlayerInRoster = async (teamId: string, playerId: string, updates: Partial<TeamPlayer>): Promise<boolean> => {
  const roster = await getTeamRoster(teamId);
  const playerIndex = roster.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return false;

  roster[playerIndex] = { ...roster[playerIndex], ...updates };
  await setTeamRoster(teamId, roster);
  return true;
};

// Remove player from team roster
export const removePlayerFromRoster = async (teamId: string, playerId: string): Promise<boolean> => {
  const roster = await getTeamRoster(teamId);
  const filteredRoster = roster.filter(p => p.id !== playerId);
  if (filteredRoster.length === roster.length) return false; // Player not found

  await setTeamRoster(teamId, filteredRoster);
  return true;
};

// Duplicate team (creates new team with copied roster)
export const duplicateTeam = async (sourceTeamId: string, newName: string): Promise<Team | null> => {
  const sourceTeam = await getTeam(sourceTeamId);
  if (!sourceTeam) return null;

  const sourceRoster = await getTeamRoster(sourceTeamId);

  // Create new team
  const newTeam = await createTeam({
    name: newName,
    color: sourceTeam.color,
  });

  // Copy roster with new player IDs
  const copiedRoster: TeamPlayer[] = sourceRoster.map(player => ({
    ...player,
    id: `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  }));

  await setTeamRoster(newTeam.id, copiedRoster);
  return newTeam;
};