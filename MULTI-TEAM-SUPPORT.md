# Multi-Team Support Implementation Plan

## Vision & Requirements

### Core Concept
Teams are **manageable data entities** (similar to seasons/tournaments). Users select teams during specific workflows (game creation, stats filtering) rather than having a global "active team" that changes the entire app context.

### User Stories
- **As a coach**, I can create and manage multiple teams with independent rosters
- **As a coach**, when creating a new game, I select which team I'm playing as
- **As a coach**, selecting a team automatically loads that team's roster for player selection
- **As a coach**, I can view statistics filtered by specific teams to compare performance
- **As a coach**, seasons and tournaments remain global entities that any team can participate in
- **As a coach**, I can manage team rosters independently without affecting other teams

### Key Principles
1. **No Global Team State** - Teams are selected contextually, not app-wide
2. **Entity-Based Design** - Teams are data entities like seasons/tournaments
3. **Contextual Selection** - Team selection happens in relevant modals (New Game, Stats)
4. **Data Isolation** - Each team has its own roster, but shares seasons/tournaments
5. **Backward Compatibility** - Existing games without team associations remain functional

## Data Model

### Team Entity
```typescript
export interface Team {
  id: string;                 // "team_<timestamp>"
  name: string;               // "Galaxy U10", "Barcelona Youth"
  color?: string;             // "#FF0000" for visual identification
  createdAt: string;          // ISO timestamp
  updatedAt: string;          // ISO timestamp
}

export interface TeamRoster {
  teamId: string;
  players: Player[];          // Reuse existing Player interface
}
```

### Game Association
```typescript
export interface AppState {
  // ...existing fields...
  teamId?: string;            // Which team was selected for this game
}
```

### Storage Keys
```typescript
// New storage keys for teams
const TEAMS_KEY = 'soccerTeams';                    // Team[]
const TEAM_ROSTERS_KEY = 'soccerTeamRosters';      // { [teamId: string]: Player[] }

// Existing keys (unchanged)
const SAVED_GAMES_KEY = 'savedSoccerGames';        // Games now optionally have teamId
const SEASONS_KEY = 'soccerSeasons';               // Remain global
const TOURNAMENTS_KEY = 'soccerTournaments';       // Remain global
const MASTER_ROSTER_KEY = 'masterRoster';          // Remains as fallback/default
```

## Implementation Phases

### Phase 1: Core Team Management (2-3 days)

#### 1.1 Data Layer Implementation
**File: `src/utils/teams.ts`**
```typescript
// Team CRUD operations
export const getTeams = async (): Promise<Team[]>
export const addTeam = async (team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team>
export const updateTeam = async (teamId: string, updates: Partial<Team>): Promise<Team | null>
export const deleteTeam = async (teamId: string): Promise<boolean>

// Team roster management
export const getTeamRoster = async (teamId: string): Promise<Player[]>
export const setTeamRoster = async (teamId: string, players: Player[]): Promise<void>
export const addPlayerToTeamRoster = async (teamId: string, player: Player): Promise<void>
export const updatePlayerInTeamRoster = async (teamId: string, player: Player): Promise<void>
export const removePlayerFromTeamRoster = async (teamId: string, playerId: string): Promise<void>
```

#### 1.2 Team Management Modal
**File: `src/components/TeamManagementModal.tsx`**

Features to implement:
- **Team List**: Display all teams with visual indicators (color, name)
- **Team CRUD**: Create, edit, rename, duplicate, delete teams
- **Team Selection**: Click to select and manage individual team
- **Roster Management**: Full player CRUD for selected team's roster
- **Visual Elements**: Color picker, team badges
- **Confirmation Dialogs**: Delete confirmations with impact warnings
- **Import/Export**: Import master roster to team, export team roster

UI Structure:
```
┌─ Team Management Modal ────────────────────────────────┐
│ Teams                                            [×]   │
├────────────────────────────────────────────────────────┤
│ [New Team]                                             │
│                                                        │
│ Team List          │  Selected Team Details           │
│ ┌─────────────────┐ │  ┌──────────────────────────────┐ │
│ │ 🔴 Galaxy U10   │ │  │ Team Name: [Galaxy U10    ] │ │
│ │ 🔵 Barcelona FC │ │  │ Color: [🔴🔵🟢🟡⚪⚫]        │ │
│ │ 🟢 Real Madrid  │ │  │                              │ │
│ └─────────────────┘ │  │ Roster (15 players):         │ │
│                     │  │ ┌────────────────────────────┐ │ │
│                     │  │ │ #10 Alice Johnson        │ │ │
│                     │  │ │ #7  Bob Smith            │ │ │
│                     │  │ │ ... (scrollable)         │ │ │
│                     │  │ └────────────────────────────┘ │ │
│                     │  │                              │ │
│                     │  │ [Manage Roster] [Import...] │ │
│                     │  │ [Edit] [Duplicate] [Delete] │ │
│                     │  └──────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

#### 1.3 Integration Points
- **Main Menu**: Add "Manage Teams" option to hamburger menu
- **Settings Modal**: Add teams section with team count and management link
- **React Query**: Add team-related query keys and cache management

### Phase 2: Game Creation Integration (1-2 days)

#### 2.1 Enhanced New Game Setup Modal
**File: `src/components/NewGameSetupModal.tsx`**

Key changes:
1. **Team Selection Dropdown**: Add team selector at the top of scrollable content
2. **Roster Loading**: When team is selected, load that team's roster
3. **Auto-Population**: Pre-select all players from the selected team's roster
4. **Fallback Behavior**: If no team selected, use master roster (backward compatibility)
5. **Team Association**: Pass selected teamId to game creation

Enhanced flow:
```typescript
const handleTeamSelection = async (teamId: string) => {
  if (teamId) {
    // Load team's roster
    const teamRoster = await getTeamRoster(teamId);
    setAvailablePlayersForSetup(teamRoster);
    setSelectedPlayerIds(teamRoster.map(p => p.id));
    
    // Auto-fill team name (but keep it editable)
    const team = teams.find(t => t.id === teamId);
    if (team) {
      setHomeTeamName(team.name);
    }
  } else {
    // Fallback to master roster
    const masterRoster = await getMasterRoster();
    setAvailablePlayersForSetup(masterRoster);
    setSelectedPlayerIds([]);
    setHomeTeamName('');
  }
};
```

UI Changes:
- Move team selection from fixed header to scrollable area
- Keep team/opponent name inputs in fixed header for easy access
- Add visual team indicator next to team name when team is selected

#### 2.2 Game State Integration
**File: `src/app/page.tsx`**

Update `handleStartNewGameWithSetup` function:
```typescript
const handleStartNewGameWithSetup = (
  // ...existing parameters...
  teamId: string | null
) => {
  const newGameState = {
    // ...existing state...
    teamId: teamId || undefined, // Store team association
  };
  
  // Continue with existing game creation logic
};
```

### Phase 3: Load Game & Statistics (1-2 days)

#### 3.1 Load Game Modal Enhancement
**File: `src/components/LoadGameModal.tsx`**

Add team filtering without changing global state:
```typescript
interface LoadGameModalProps {
  // ...existing props...
  teams: Team[];  // Pass teams list from parent
}

// Inside component:
const [selectedTeamFilter, setSelectedTeamFilter] = useState<string | 'all'>('all');

// Filter games by team selection
const filteredByTeam = savedGames.filter(game => 
  selectedTeamFilter === 'all' || 
  game.teamId === selectedTeamFilter ||
  (!game.teamId && selectedTeamFilter === 'legacy') // Handle legacy games
);
```

UI Structure:
```
┌─ Load Game ────────────────────────────────────────────┐
│ Load Saved Game                                  [×]   │
├────────────────────────────────────────────────────────┤
│ Filters:                                               │
│ Team: [All Teams ▼] Season: [All ▼] Search: [____]   │
├────────────────────────────────────────────────────────┤
│ ┌─ Game List (scrollable) ─────────────────────────────┐ │
│ │ 🔴 Galaxy U10 vs Barcelona FC    2024-03-15        │ │
│ │ 🔵 Barcelona FC vs Real Madrid   2024-03-12        │ │  
│ │ 📄 Legacy Game vs City FC        2024-03-10        │ │
│ └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

#### 3.2 Statistics Enhancement
**File: `src/components/GameStatsModal.tsx`**
**File: `src/components/PlayerStatsView.tsx`**

Add team-aware statistics:
```typescript
// In GameStatsModal
const [selectedTeamFilter, setSelectedTeamFilter] = useState<string | 'all'>('all');

// Filter data for statistics
const getFilteredGamesForStats = () => {
  return savedGames.filter(game => {
    // Team filter
    const teamMatch = selectedTeamFilter === 'all' || 
                     game.teamId === selectedTeamFilter ||
                     (!game.teamId && selectedTeamFilter === 'legacy');
    
    // Continue with existing season/tournament filtering
    return teamMatch && /* existing filters */;
  });
};
```

Enhance `calculatePlayerStats` function:
```typescript
// In src/utils/playerStats.ts
export const calculatePlayerStats = (
  player: Player,
  savedGames: SavedGame[],
  seasons: Season[],
  tournaments: Tournament[],
  adjustments: PlayerStatAdjustment[],
  teamId?: string  // Optional team filtering
): PlayerStats => {
  // Filter games by team if specified
  const relevantGames = teamId 
    ? savedGames.filter(game => game.teamId === teamId)
    : savedGames;
  
  // Filter adjustments by team if specified
  const relevantAdjustments = teamId
    ? adjustments.filter(adj => adj.teamId === teamId || !adj.teamId) // Include legacy adjustments
    : adjustments;
  
  // Continue with existing calculation logic
};
```

### Phase 4: Data Migration & Compatibility (1 day)

#### 4.1 Migration Strategy
**File: `src/utils/migration.ts`**

Create a gentle migration that preserves all existing data:

```typescript
export const migrateToMultiTeam = async (): Promise<void> => {
  // Check if migration is needed
  const existingTeams = await getTeams();
  if (existingTeams.length > 0) {
    return; // Already migrated or teams exist
  }

  // Check if there's existing data to migrate
  const masterRoster = await getMasterRoster();
  const savedGames = await getSavedGames();
  
  if (masterRoster.length === 0 && Object.keys(savedGames).length === 0) {
    return; // Fresh installation, no migration needed
  }

  // Create default team from existing data
  const defaultTeamName = 'My Team'; // Could be from app settings
  const defaultTeam = await addTeam({
    name: defaultTeamName,
    color: '#FF0000'
  });

  // Copy master roster to default team
  if (masterRoster.length > 0) {
    await setTeamRoster(defaultTeam.id, masterRoster);
  }

  // No need to modify existing games - they'll work without teamId
  // Future games will have team association
  
  console.log('Multi-team migration completed:', defaultTeam);
};
```

#### 4.2 Backward Compatibility
- **Games without teamId**: Display as "Legacy Game" in load modal
- **Master roster**: Remains available as fallback option
- **Statistics**: Include option to view "All Games" (including legacy)
- **No breaking changes**: All existing functionality continues to work

### Phase 5: UI Integration & Polish (1 day)

#### 5.1 Navigation Integration
**File: `src/components/ControlBar.tsx`**
- Add "Manage Teams" option to hamburger menu
- Show team count in menu if teams exist

**File: `src/components/StartScreen.tsx`**  
- Add teams overview section showing team count
- Add quick access to team management

#### 5.2 Visual Enhancements
- **Team Badges**: Show team colors as small circles/badges
- **Team Names**: Display team names in game cards and lists
- **Icons**: Use team-specific icons/colors throughout UI
- **Empty States**: Helpful messages when no teams exist

#### 5.3 Responsive Design
- Ensure team management modal works on mobile
- Optimize team selection dropdowns for touch
- Maintain accessibility standards

### Phase 6: Testing & Quality Assurance (1-2 days)

#### 6.1 Unit Tests
**File: `src/utils/teams.test.ts`**
- Test all CRUD operations
- Test roster management functions
- Test data isolation between teams
- Test migration scenarios

**File: `src/utils/teamIntegration.test.ts`**
- Test game creation with team selection
- Test statistics filtering by team
- Test load game filtering
- Test backward compatibility

#### 6.2 Integration Tests
- Test complete user workflows:
  1. Create team → Add players → Create game → Load game
  2. Multiple teams → Switch between them → Verify data isolation
  3. Migration from single-team → Multi-team setup
  4. Statistics comparison between teams

#### 6.3 Edge Cases
- Empty teams (no players)
- Team deletion with existing games
- Invalid team IDs in saved games
- Concurrent team operations
- Large numbers of teams/players

## Technical Implementation Details

### Query Keys Strategy
```typescript
// src/config/queryKeys.ts
export const queryKeys = {
  // Teams
  teams: ['teams'] as const,
  teamRoster: (teamId: string) => ['teams', teamId, 'roster'] as const,
  
  // Global entities (unchanged)
  seasons: ['seasons'] as const,
  tournaments: ['tournaments'] as const,
  savedGames: ['savedGames'] as const,
  
  // Legacy (maintained for backward compatibility)
  masterRoster: ['masterRoster'] as const,
};
```

### React Query Integration
```typescript
// src/hooks/useTeamQueries.ts
export const useTeamsQuery = () => {
  return useQuery({
    queryKey: queryKeys.teams,
    queryFn: getTeams,
  });
};

export const useTeamRosterQuery = (teamId: string | null) => {
  return useQuery({
    queryKey: queryKeys.teamRoster(teamId!),
    queryFn: () => getTeamRoster(teamId!),
    enabled: !!teamId,
  });
};

// Mutations with proper cache invalidation
export const useAddTeamMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: addTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams });
    },
  });
};
```

### Error Handling Strategy
```typescript
// Graceful degradation for missing teams
export const getTeamRosterWithFallback = async (teamId?: string): Promise<Player[]> => {
  if (!teamId) {
    return getMasterRoster(); // Fallback to master roster
  }
  
  try {
    const roster = await getTeamRoster(teamId);
    return roster.length > 0 ? roster : getMasterRoster();
  } catch (error) {
    console.warn('Failed to load team roster, falling back to master roster:', error);
    return getMasterRoster();
  }
};
```

## Internationalization

### New Translation Keys
```json
{
  "teamManager": {
    "title": "Teams",
    "newTeam": "New Team",
    "teamName": "Team Name",
    "teamColor": "Team Color",
    "roster": "Roster",
    "manageRoster": "Manage Roster",
    "importRoster": "Import Master Roster",
    "noTeams": "No teams yet.",
    "createFirst": "Create your first team to get started.",
    "selectTeam": "Select a team or create a new one",
    "confirmDelete": "Delete team \"{name}\"?",
    "deleteWarning": "This will permanently delete the team. Games and statistics will remain but won't be associated with this team.",
    "rename": "Rename",
    "duplicate": "Duplicate",
    "rosterCount": "Players: {{count}}"
  },
  "newGameSetupModal": {
    "selectTeam": "Select Team",
    "noTeam": "No Team (Use Master Roster)"
  },
  "loadGameModal": {
    "teamFilter": "Filter by Team",
    "allTeams": "All Teams",
    "legacyGames": "Legacy Games"
  },
  "gameStatsModal": {
    "teamFilter": "Team Filter",
    "compareTeams": "Compare Teams"
  },
  "controlBar": {
    "manageTeams": "Manage Teams"
  }
}
```

### Finnish Translations
```json
{
  "teamManager": {
    "title": "Joukkueet",
    "newTeam": "Uusi joukkue",
    "teamName": "Joukkueen nimi",
    "teamColor": "Joukkueen väri",
    "roster": "Kokoonpano",
    "manageRoster": "Hallinnoi kokoonpanoa",
    "importRoster": "Tuo pääroster",
    "noTeams": "Ei vielä joukkueita.",
    "createFirst": "Luo ensimmäinen joukkue aloittaaksesi.",
    "selectTeam": "Valitse joukkue tai luo uusi",
    "confirmDelete": "Poista joukkue \"{name}\"?",
    "deleteWarning": "Tämä poistaa joukkueen pysyvästi. Pelit ja tilastot säilyvät, mutta eivät ole enää yhdistettyjä tähän joukkueeseen.",
    "rename": "Nimeä uudelleen",
    "duplicate": "Monista",
    "rosterCount": "Pelaajia: {{count}}"
  }
}
```

## Success Criteria

### Functional Requirements
1. ✅ **Team Management**: Users can create, edit, delete, and duplicate teams
2. ✅ **Independent Rosters**: Each team maintains its own player roster
3. ✅ **Game Association**: New games are associated with selected team
4. ✅ **Statistics Filtering**: Stats can be filtered and compared by team
5. ✅ **Backward Compatibility**: Existing games continue to work
6. ✅ **Data Migration**: Smooth transition from single-team to multi-team

### Technical Requirements
1. ✅ **No Global State**: Teams are contextual selections, not app-wide state
2. ✅ **Data Isolation**: Team data is properly isolated and doesn't leak
3. ✅ **Performance**: Team operations are efficient and don't impact app performance
4. ✅ **Error Handling**: Graceful degradation when team data is missing
5. ✅ **Testing**: Comprehensive test coverage for all team functionality

### User Experience Requirements
1. ✅ **Intuitive Interface**: Team management is easy to discover and use
2. ✅ **Visual Clarity**: Teams are visually distinct with colors/badges
3. ✅ **Workflow Integration**: Team selection fits naturally into existing workflows
4. ✅ **Mobile Friendly**: All team features work well on mobile devices
5. ✅ **Accessibility**: All team interfaces meet accessibility standards

## Risk Mitigation

### Data Loss Prevention
- **Backup Strategy**: Automatic backup before any migration
- **Rollback Plan**: Ability to restore previous state if migration fails
- **Validation**: Extensive validation of migrated data
- **Testing**: Comprehensive testing with real user data scenarios

### Performance Considerations
- **Lazy Loading**: Team rosters loaded on-demand
- **Caching**: Proper React Query caching for team data
- **Pagination**: If needed for teams/players lists in the future
- **Optimization**: Efficient data structures and queries

### User Experience Risks
- **Learning Curve**: Clear documentation and helpful UI hints
- **Feature Discovery**: Prominent placement of team management features
- **Error Recovery**: Clear error messages and recovery paths
- **Progressive Enhancement**: New features don't break existing workflows

## Implementation Timeline

### Week 1 (Days 1-5)
- **Days 1-2**: Phase 1 (Core Team Management)
- **Days 3-4**: Phase 2 (Game Creation Integration) 
- **Day 5**: Phase 3 (Load Game & Statistics)

### Week 2 (Days 6-10)
- **Day 6**: Phase 4 (Data Migration & Compatibility)
- **Day 7**: Phase 5 (UI Integration & Polish)
- **Days 8-9**: Phase 6 (Testing & Quality Assurance)
- **Day 10**: Final integration, documentation, and deployment preparation

**Total Estimated Effort: 8-10 working days**

This comprehensive plan provides a clear, step-by-step roadmap for implementing multi-team support while maintaining the integrity of existing functionality and user experience.