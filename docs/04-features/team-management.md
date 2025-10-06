# Team Management - Multi-Team Architecture

This document details the multi-team architecture, team CRUD operations, player assignment, and UI management components in MatchOps-Local.

## Architecture Overview

The team management system supports multiple independent teams, each with their own roster, while maintaining a global master roster for easy player sharing. This architecture enables:

- Multiple teams with independent rosters
- Players can be assigned to multiple teams simultaneously
- Team-specific player data (jersey numbers, positions, notes)
- Contextual team selection rather than global "active team"
- Atomic roster operations to prevent data corruption

## Data Structures

### Team Interface
**File**: `/src/types/index.ts` (lines 23-30)

```typescript
export interface Team {
  id: string;                 // team_[timestamp]_[random]
  name: string;               // "PEPO U10", "Thunder Bolts"
  color?: string;             // Brand/accent color (hex)
  createdAt: string;          // ISO timestamp
  updatedAt: string;          // ISO timestamp
}
```

### TeamPlayer Interface
**File**: `/src/types/index.ts` (lines 32-44)

```typescript
export interface TeamPlayer {
  id: string;                 // player_[timestamp]_[random]
  name: string;
  nickname?: string;
  jerseyNumber?: string;
  isGoalie?: boolean;
  color?: string;
  notes?: string;
  receivedFairPlayCard?: boolean;
  // Note: relX/relY are removed as they're field-specific, not roster-specific
}
```

### Key Differences from Global Players
- `TeamPlayer` uses team-specific IDs, not master roster IDs
- No field position data (`relX`/`relY`) - that's game-specific
- Team-specific customizations (jersey numbers, notes)

## Storage Implementation

### localStorage Keys
**File**: `/src/config/storageKeys.ts`
- `TEAMS_INDEX_KEY` - All teams metadata
- `TEAM_ROSTERS_KEY` - All team rosters data

### Storage Format

#### Teams Index
**File**: `/src/utils/teams.ts` (lines 10-13)

```typescript
// Team index storage format: { [teamId: string]: Team }
export interface TeamsIndex {
  [teamId: string]: Team;
}
```

#### Team Rosters Index
**File**: `/src/utils/teams.ts` (lines 15-18)

```typescript
// Team rosters storage format: { [teamId: string]: TeamPlayer[] }
export interface TeamRostersIndex {
  [teamId: string]: TeamPlayer[];
}
```

## Core Team Operations

### Team CRUD Operations
**File**: `/src/utils/teams.ts`

#### Get All Teams (lines 32-35)
```typescript
export const getTeams = async (): Promise<Team[]> => {
  const teamsIndex = await getAllTeams();
  return Object.values(teamsIndex);
};
```

#### Create New Team (lines 67-87)
```typescript
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
```

#### Update Team (lines 90-110)
```typescript
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
```

#### Name Validation (lines 44-64)
```typescript
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
```

### Team Duplication (lines 194-214)
```typescript
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
```

## Roster Management with Atomic Operations

### Lock Manager Integration
**File**: `/src/utils/teams.ts` (lines 8, 135-136)

```typescript
import { withRosterLock } from './lockManager';

// Lock mechanism for atomic roster operations is now handled by lockManager
// The withRosterLock function is imported from './lockManager'
```

### Atomic Roster Operations

#### Get Team Roster (lines 138-143)
```typescript
export const getTeamRoster = async (teamId: string): Promise<TeamPlayer[]> => {
  return withRosterLock(async () => {
    const rostersIndex = await getAllTeamRosters();
    return rostersIndex[teamId] || [];
  });
};
```

#### Add Player to Roster (lines 154-162)
```typescript
export const addPlayerToRoster = async (teamId: string, player: TeamPlayer): Promise<void> => {
  return withRosterLock(async () => {
    const rostersIndex = await getAllTeamRosters();
    const roster = rostersIndex[teamId] || [];
    const updatedRoster = [...roster, player];
    rostersIndex[teamId] = updatedRoster;
    setLocalStorageItem(TEAM_ROSTERS_KEY, JSON.stringify(rostersIndex));
  });
};
```

#### Update Player in Roster (lines 165-177)
```typescript
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
```

#### Remove Player from Roster (lines 180-190)
```typescript
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
```

## React Query Integration

### Query Keys
**File**: `/src/config/queryKeys.ts` (lines 9-10)

```typescript
export const queryKeys = {
  // Team-specific entities
  teams: ['teams'] as const,
  teamRoster: (teamId: string) => ['teams', teamId, 'roster'] as const,
};
```

### Team Queries Hook
**File**: `/src/hooks/useTeamQueries.ts`

Custom hook providing team-related queries and mutations with proper caching:

```typescript
// Team queries
export const useTeamsQuery = () => useQuery({
  queryKey: queryKeys.teams,
  queryFn: getTeams,
});

export const useTeamRosterQuery = (teamId: string | null) => useQuery({
  queryKey: queryKeys.teamRoster(teamId || 'none'),
  queryFn: () => teamId ? getTeamRoster(teamId) : Promise.resolve([]),
  enabled: !!teamId,
});

// Team mutations with invalidation
export const useAddTeamMutation = () => useMutation({
  mutationFn: addTeam,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.teams }),
});
```

### Team-Aware Game Data Queries
**File**: `/src/hooks/useGameDataQueries.ts` (lines 96-168)

```typescript
// Team-aware version of useGameDataQueries
export function useTeamGameDataQueries(teamId?: string): TeamGameDataQueriesResult {
  // Get all teams
  const teams = useQuery<Team[], Error>({
    queryKey: queryKeys.teams,
    queryFn: getTeams,
  });

  // Note: Active team concept removed - teams are contextually selected
  // This will be refactored in Phase 2 when implementing contextual team selection
  
  // Use provided teamId (no fallback to global active team)
  const effectiveTeamId = teamId;

  // Get team roster (only if we have a team ID)
  const teamRoster = useQuery<TeamPlayer[], Error>({
    queryKey: queryKeys.teamRoster(effectiveTeamId || 'none'),
    queryFn: () => effectiveTeamId ? getTeamRoster(effectiveTeamId) : Promise.resolve([]),
    enabled: !!effectiveTeamId,
  });

  return {
    teams: teams.data || [],
    activeTeamId: null, // Active team concept removed
    teamRoster: teamRoster.data || [],
    seasons: seasons.data || [],
    tournaments: tournaments.data || [],
    savedGames: savedGames.data || null,
    currentGameId: currentGameId.data || null,
    loading,
    error,
  };
}
```

## UI Management Components

### TeamManagerModal Component
**File**: `/src/components/TeamManagerModal.tsx`

Main interface for team CRUD operations:

#### Props Interface (lines 25-31)
```typescript
interface TeamManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  teams: Team[];
  onManageRoster?: (teamId: string) => void;
  onManageOrphanedGames?: () => void;
}
```

#### Team Creation Form (lines 256-314)
```typescript
<div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
  <div className="space-y-3">
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">
        {t('teamManager.teamName', 'Team Name')}
      </label>
      <input
        ref={newTeamInputRef}
        type="text"
        value={newTeamName}
        onChange={(e) => setNewTeamName(e.target.value)}
        placeholder={t('teamManager.namePlaceholder', 'Enter team name')}
        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCreateTeam();
          if (e.key === 'Escape') setIsCreatingTeam(false);
        }}
      />
    </div>
    
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">
        {t('teamManager.teamColor', 'Team Color')}
      </label>
      <div className="flex gap-2">
        {predefinedColors.map((color) => (
          <button
            key={color}
            onClick={() => setNewTeamColor(color)}
            className={`w-8 h-8 rounded-full border-2 transition-all ${
              newTeamColor === color
                ? 'border-white scale-110'
                : 'border-slate-500 hover:border-slate-300'
            }`}
            style={{ backgroundColor: color }}
            aria-label={`Select color ${color}`}
          />
        ))}
      </div>
    </div>
  </div>
</div>
```

#### Team Actions Menu (lines 420-445)
```typescript
{actionsMenuTeamId === team.id && (
  <div className="absolute right-0 mt-1 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-50">
    <button
      onClick={() => handleStartEdit(team)}
      className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2"
    >
      <HiOutlinePencil className="w-4 h-4" />
      {t('teamManager.rename', 'Rename')}
    </button>
    <button
      onClick={() => handleDuplicateTeam(team)}
      className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2"
      disabled={duplicateTeamMutation.isPending}
    >
      <HiOutlineDocumentDuplicate className="w-4 h-4" />
      {t('teamManager.duplicate', 'Duplicate')}
    </button>
    <button
      onClick={() => handleDeleteTeam(team.id)}
      className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-600/20 flex items-center gap-2"
    >
      <HiOutlineTrash className="w-4 h-4" />
      {t('teamManager.delete', 'Delete')}
    </button>
  </div>
)}
```

### TeamRosterModal Component
**File**: `/src/components/TeamRosterModal.tsx`

Interface for managing individual team rosters:

#### Master Roster Integration (lines 47-87)
```typescript
// Load master roster when selecting from master
useEffect(() => {
  if (isSelectingFromMaster && masterRosterPlayers.length === 0) {
    getMasterRoster()
      .then((players) => {
        setMasterRosterPlayers(players || []);
        
        // Pre-select current team players after master roster is loaded
        if (teamRoster.length > 0 && players && players.length > 0) {
          logger.log('[TeamRoster] Pre-selecting current team players');
          
          // Create a set of current team player names for comparison
          const teamPlayerNames = new Set(
            teamRoster.map(p => p.name.toLowerCase().trim())
          );
          
          // Find master roster players that match current team players
          const preSelectedIds = players
            .filter(p => {
              const matches = teamPlayerNames.has(p.name.toLowerCase().trim());
              return matches;
            })
            .map(p => p.id);
          
          setSelectedPlayerIds(preSelectedIds);
        }
      })
      .catch((error) => {
        logger.error('Failed to load master roster:', error);
        setMasterRosterPlayers([]);
      });
  }
}, [isSelectingFromMaster, masterRosterPlayers.length, teamRoster]);
```

#### Player Assignment Logic (lines 96-130)
```typescript
const handleAddSelectedPlayers = async () => {
  if (!teamId || selectedPlayerIds.length === 0) return;

  try {
    // Map the selected master players to team-local players (new IDs)
    const selectedPlayers = masterRosterPlayers.filter(p => 
      selectedPlayerIds.includes(p.id)
    );
    
    const teamPlayers: TeamPlayer[] = selectedPlayers.map(masterPlayer => ({
      id: `player_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      name: masterPlayer.name,
      nickname: masterPlayer.nickname,
      jerseyNumber: masterPlayer.jerseyNumber,
      isGoalie: masterPlayer.isGoalie,
      color: masterPlayer.color,
      notes: masterPlayer.notes,
      receivedFairPlayCard: masterPlayer.receivedFairPlayCard,
    }));

    // Replace the entire roster
    await setTeamRosterMutation.mutateAsync({ teamId, roster: teamPlayers });
    
    // Reset selection state
    setIsSelectingFromMaster(false);
    setSelectedPlayerIds([]);
    
    logger.log('[TeamRoster] Successfully updated team roster');
  } catch (error) {
    logger.error('[TeamRoster] Failed to update team roster:', error);
  }
};
```

## Prop-Driven Modals and Teams

- Modals that need the list of Teams (e.g., Load/Setup modals) receive `teams` via props sourced from React Query; they do not fetch teams on open.
- When team mutations occur, invalidate `queryKeys.teams` so modal props reflect the current list immediately.

## Deletion Impact Analysis

### Game Impact Counting (lines 217-235)
```typescript
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
```

### Deletion Warning (TeamManagerModal lines 492-501)
```typescript
{deleteTeamGamesCount > 0 && (
  <div className="p-3 bg-amber-900/20 border border-amber-600/30 rounded-md">
    <p className="text-amber-300 text-sm font-medium">
      {t('teamManager.deleteImpactWarning', 
        'This will orphan {{count}} game(s). Games will remain but won\'t be associated with this team.',
        { count: deleteTeamGamesCount }
      )}
    </p>
  </div>
)}
```

## Validation System

### Team Validation
**File**: `/src/utils/validation.ts` (lines 19-36)

```typescript
export const validateTeam = (team: Partial<Team>): ValidationResult => {
  const errors: ValidationError[] = [];

  if (!team.name || team.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Team name is required' });
  } else if (team.name.trim().length > 50) {
    errors.push({ field: 'name', message: 'Team name must be 50 characters or less' });
  }

  if (team.color && !/^#[0-9A-F]{6}$/i.test(team.color)) {
    errors.push({ field: 'color', message: 'Team color must be a valid hex color' });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
```

### Player Validation
**File**: `/src/utils/validation.ts` (lines 39-64)

```typescript
export const validatePlayer = (player: Partial<TeamPlayer>): ValidationResult => {
  const errors: ValidationError[] = [];

  if (!player.name || player.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Player name is required' });
  } else if (player.name.trim().length > 50) {
    errors.push({ field: 'name', message: 'Player name must be 50 characters or less' });
  }

  if (player.nickname && player.nickname.length > 20) {
    errors.push({ field: 'nickname', message: 'Nickname must be 20 characters or less' });
  }

  if (player.jerseyNumber && (isNaN(Number(player.jerseyNumber)) || Number(player.jerseyNumber) < 0 || Number(player.jerseyNumber) > 999)) {
    errors.push({ field: 'jerseyNumber', message: 'Jersey number must be a number between 0 and 999' });
  }

  if (player.notes && player.notes.length > 200) {
    errors.push({ field: 'notes', message: 'Notes must be 200 characters or less' });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
```

### ID Format Validation (lines 130-136)
```typescript
export const isValidTeamId = (id: string): boolean => {
  return /^team_\d+_[a-z0-9]+$/i.test(id);
};

export const isValidPlayerId = (id: string): boolean => {
  return /^player_\d+_[a-z0-9]+(_\d+)?$/i.test(id);
};
```

## Color Management

### Predefined Color Palette (TeamManagerModal lines 210-219)
```typescript
const predefinedColors = [
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#06B6D4', // Cyan
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#EC4899', // Pink
  '#84CC16', // Lime
];
```

## Translation Keys

### Team Manager Modal
**Structure**: `teamManager.*`

Key translation keys:
- `teamManager.title` - Modal title
- `teamManager.newTeam` - Create new team button
- `teamManager.teamName` - Team name field label
- `teamManager.teamColor` - Team color field label
- `teamManager.namePlaceholder` - Name input placeholder
- `teamManager.roster` - Roster management button
- `teamManager.rename` - Rename action
- `teamManager.duplicate` - Duplicate action
- `teamManager.delete` - Delete action
- `teamManager.confirmDelete` - Delete confirmation message
- `teamManager.deleteImpactWarning` - Warning about orphaned games
- `teamManager.noGamesImpact` - No games affected message
- `teamManager.createdAt` - Created date display
- `teamManager.orphanedGames` - Orphaned games management
- `teamManager.noTeams` - Empty state message

## Key Benefits

1. **Team Independence**: Each team operates independently with its own roster
2. **Player Sharing**: Players from master roster can be assigned to multiple teams
3. **Data Integrity**: Atomic operations prevent corruption during concurrent access
4. **Flexible Assignment**: Team-specific player data without affecting master roster
5. **Safe Deletion**: Clear warnings about data impact before deletion
6. **Contextual Selection**: Teams are selected contextually rather than globally

## Implementation Gotchas

### ID Management
- Team players get new IDs, not master roster IDs
- Player duplication creates truly independent copies
- ID format validation prevents corruption

### Atomic Operations
- All roster modifications use locking to prevent race conditions
- Failed operations rollback cleanly without partial updates
- Concurrent access is safely handled

### Master Roster Integration
- Player name matching is case-insensitive and trimmed
- Pre-selection logic handles empty rosters gracefully
- Master roster changes don't automatically update team rosters

## Future Enhancements

Potential improvements to the team system:
- Bulk player operations (import/export rosters)
- Team templates for quick setup
- Advanced roster management with positions and formations
- Team statistics and performance analytics
- Multi-team tournaments with bracket management
- Player transfer history between teams
