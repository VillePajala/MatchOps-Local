# Multi-Team Support Implementation Plan

## Vision & Requirements

### Core Concept
Teams are **integral roster management containers** that transform the core coaching workflow. Rather than managing one large player pool, coaches create teams as organized sub-rosters for different contexts (age groups, skill levels, tournament squads). When creating a game, selecting a team instantly loads that team's curated roster, auto-fills the team name, and establishes the tactical context. Teams enable coaches to:

- **Instant Game Setup**: Select "Galaxy U10" → roster auto-loads → tactical lineup ready
- **Strategic Organization**: Separate rosters for different competitions, training groups, or developmental levels  
- **Precise Analytics**: Filter tournament/season stats by specific team to track tactical effectiveness
- **Workflow Efficiency**: No more scrolling through 50+ players to find your starting lineup

Teams are not optional data labels - they are the primary organizational unit that enables strategic coaching and data-driven team development.

### User Stories
- **As a youth coach**, I can create "Galaxy U10", "Galaxy U12", and "Tournament Squad" with different player rosters for different competitive contexts
- **As a tactical coach**, when setting up the next game, I select "Galaxy U10" and my preferred starting lineup instantly loads - no hunting through 50+ players
- **As a development coach**, I can track "Galaxy U10" statistics separately from "Galaxy U12" to measure age-group specific tactical progress
- **As a multi-team coach**, I can prepare different tactical approaches by maintaining separate rosters: "Defensive Squad" for tough opponents, "Attacking Squad" for weaker teams
- **As a data-driven coach**, I filter season statistics by team to identify which tactical setup (formation, player combinations) performs best against different opponent types
- **As an organized coach**, I can duplicate successful team compositions ("Clone Tournament Squad → Regional Squad") to quickly create variations for different competitions

### Key Principles
1. **Roster Management First** - Teams are fundamentally about organizing players for tactical efficiency, not just labeling games
2. **Contextual Workflow Integration** - Team selection happens at key decision points (game creation, performance analysis) to support coaching workflow
3. **Strategic Flexibility** - Coaches can maintain multiple tactical approaches through different team compositions without affecting historical data
4. **Instant Tactical Setup** - Selecting a team immediately provides the relevant player context, eliminating setup friction
5. **Performance Context** - Statistics and analytics are filtered by team to provide tactical insights rather than mixed data
6. **Data Integrity** - Historical games and global entities (seasons/tournaments) remain unaffected, ensuring data continuity

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
- **Strategic Team Organization**: Display teams as tactical units with visual indicators (color, formation hints)
- **Rapid Team Creation**: Create, duplicate ("Clone Galaxy U10 → Tournament Squad"), and organize teams for different tactical contexts
- **Roster Optimization**: Full player CRUD focused on building optimal lineups for specific competitive scenarios
- **Tactical Visual Cues**: Color coding and badges that reflect team purpose (developmental, competitive, tournament)
- **Impact-Aware Operations**: Deletion warnings show affected games count and orphaned data implications
- **Master Roster Integration**: Import proven players from master pool, export successful team compositions for reuse

UI Structure:
```
┌─ Team Management Modal ────────────────────────────────┐
│ Strategic Team Organization                      [×]   │
├────────────────────────────────────────────────────────┤
│ [New Tactical Unit]                                    │
│                                                        │
│ Tactical Units     │  Selected Team Context           │
│ ┌─────────────────┐ │  ┌──────────────────────────────┐ │
│ │ 🔴 Galaxy U10   │ │  │ Team Name: [Galaxy U10    ] │ │
│ │   (15 players)  │ │  │ Purpose: [⚽ Competition   ▼] │ │
│ │ 🔵 Tournament   │ │  │ Color: [🔴🔵🟢🟡⚪⚫]        │ │
│ │   Squad (11)    │ │  │                              │ │
│ │ 🟢 Training     │ │  │ Tactical Roster (15):        │ │
│ │   Group (20)    │ │  │ ┌────────────────────────────┐ │ │
│ └─────────────────┘ │  │ │ #10 Alice (⭐ Captain)   │ │ │
│                     │  │ │ #7  Bob (🥅 Keeper)     │ │ │
│                     │  │ │ #9  Charlie (⚽ Striker) │ │ │
│                     │  │ └────────────────────────────┘ │ │
│                     │  │                              │ │
│                     │  │ [Optimize Lineup] [Import]  │ │
│                     │  │ [Clone Team] [Archive]      │ │
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

Key tactical workflow enhancements:
1. **Strategic Context Selection**: Team dropdown immediately establishes tactical context ("Galaxy U10" vs "Tournament Squad")
2. **Instant Lineup Loading**: Team selection auto-loads curated roster, eliminating manual player selection from large pool
3. **Tactical Auto-Population**: Pre-select players from team's proven lineup, with easy adjustments for tactical variations
4. **Formation Continuity**: Team selection auto-fills team name and tactical context for consistent coaching approach
5. **Strategic Association**: Games are linked to tactical context, enabling performance analysis by team composition
6. **Master Roster Fallback**: "No Team" option maintains backward compatibility while encouraging team-based organization

Enhanced tactical workflow:
```typescript
const handleTeamSelection = async (teamId: string) => {
  if (teamId) {
    // Load tactical unit's curated roster
    const teamRoster = await getTeamRoster(teamId);
    setAvailablePlayersForSetup(teamRoster);
    
    // Auto-select proven lineup for immediate tactical readiness
    setSelectedPlayerIds(teamRoster.map(p => p.id));
    
    // Establish tactical context and team identity
    const team = teams.find(t => t.id === teamId);
    if (team) {
      setHomeTeamName(team.name);
      // Future: Could auto-load preferred formation/positions
    }
  } else {
    // Fallback to full master roster (requires manual tactical organization)
    const masterRoster = await getMasterRoster();
    setAvailablePlayersForSetup(masterRoster);
    setSelectedPlayerIds([]); // Coach must manually select tactical lineup
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

Add tactical context filtering for game analysis:
```typescript
interface LoadGameModalProps {
  // ...existing props...
  teams: Team[];  // Strategic contexts for filtering
}

// Inside component:
const [selectedTeamFilter, setSelectedTeamFilter] = useState<string | 'all'>('all');

// Filter games by tactical context for performance analysis
const filteredByTeam = savedGames.filter(game => {
  if (selectedTeamFilter === 'all') return true;
  if (selectedTeamFilter === 'legacy') return !game.teamId; // Pre-team organization games
  return game.teamId === selectedTeamFilter; // Specific tactical context games
});
```

UI Structure:
```
┌─ Load Game ────────────────────────────────────────────┐
│ Load Tactical Context                            [×]   │
├────────────────────────────────────────────────────────┤
│ Tactical Filters:                                      │
│ Context: [All Teams ▼] Season: [All ▼] Search: [___] │
├────────────────────────────────────────────────────────┤
│ ┌─ Game History (by tactical context) ────────────────┐ │
│ │ 🔴 Galaxy U10 vs Barcelona FC    W 3-1  2024-03-15│ │
│ │    ↳ Strong defensive performance with this lineup │ │
│ │ 🔵 Tournament Squad vs Madrid    L 1-2  2024-03-12│ │  
│ │    ↳ Attacking formation worked, lost to penalties│ │
│ │ 📄 Legacy Game vs City FC        W 2-0  2024-03-10│ │
│ │    ↳ Before team organization system              │ │
│ └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

#### 3.2 Statistics Enhancement
**File: `src/components/GameStatsModal.tsx`**
**File: `src/components/PlayerStatsView.tsx`**

Add tactical performance analytics:
```typescript
// In GameStatsModal
const [selectedTeamFilter, setSelectedTeamFilter] = useState<string | 'all'>('all');

// Filter data for tactical performance analysis
const getFilteredGamesForStats = () => {
  return savedGames.filter(game => {
    // Tactical context filter - analyze specific team compositions
    const teamMatch = selectedTeamFilter === 'all' || 
                     game.teamId === selectedTeamFilter ||
                     (!game.teamId && selectedTeamFilter === 'legacy');
    
    // Enable comparison of tactical approaches across seasons/tournaments
    return teamMatch && /* existing season/tournament filters */;
  });
};
```

Enhance tactical player performance analysis:
```typescript
// In src/utils/playerStats.ts
export const calculatePlayerStats = (
  player: Player,
  savedGames: SavedGame[],
  seasons: Season[],
  tournaments: Tournament[],
  adjustments: PlayerStatAdjustment[],
  teamId?: string  // Filter by tactical context
): PlayerStats => {
  // Analyze player performance within specific tactical system
  const relevantGames = teamId 
    ? savedGames.filter(game => game.teamId === teamId) // Performance in this tactical context
    : savedGames; // Overall performance across all contexts
  
  // Include tactical adjustments and legacy performance data
  const relevantAdjustments = teamId
    ? adjustments.filter(adj => adj.teamId === teamId || !adj.teamId) // Context-specific + legacy
    : adjustments;
  
  // Calculate performance metrics for tactical decision-making
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

---

## Scope, Non-Goals, and Definitions

### Scope
- Multiple Teams (CRUD) with independent rosters
- Team selection at game creation time; team filtering in Load/Stats
- Seasons and tournaments remain global
- Backward compatibility with legacy data (no teamId on games)

### Non-Goals (v1)
- Multi-user/roles, cloud sync, or permissions
- Cross-team shared player identity graph (beyond reusing Player shape)
- Cross-device synchronization
- Complex merge tools for moving games between teams

### Definitions
- Legacy Game: A saved game without `teamId`
- Team Roster: The list of players belonging to a specific Team
- Master Roster: Global roster used as a fallback for legacy/new flows

## Data Validation & Constraints

### Team
- name: required, trimmed, unique (case-insensitive) within Teams list
- color: optional, hex or predefined palette value
- id: generated `team_<timestamp>_<rand>`

### Team Roster
- players: reuse Player shape; ensure `id` unique within team
- jerseyNumber: not strictly unique, but warn on duplicates (UX hint)

### Game (AppState)
- teamId: optional; if present, must match an existing Team id
- selectedPlayerIds: must be subset of chosen team’s roster (or master roster for legacy)

### Seasons/Tournaments
- Global entities; must not be filtered by team in data layer
- name: unique (case-insensitive) within own collection

## Deletion & Referential Integrity

### Deleting a Team
- Default policy (v1): allow deletion; existing games remain with their `teamId` unmodified; the UI treats them as “orphaned” (display team name string if preserved in game, otherwise show “Unknown Team”) and still loads
- Recommended future enhancement: Archive instead of hard-delete, plus reassignment tools

### Deleting Players from Team Roster
- Do not retroactively mutate prior games; historical games remain intact
- Warn user that removing a player from the team does not change past games

## Backward Compatibility Matrix

| Scenario | Expected Behavior |
| --- | --- |
| No teams exist; only master roster | New Game prompts to create/select a Team (CTA). Fallback to master roster allowed once, with guidance to create a Team. |
| Legacy games (no teamId) | Visible under “All Teams” filter in Load/Stats. Excluded when a specific team is selected. |
| Seasons/Tournaments with accidental teamId (from prior builds) | Ignored; one-time cleanup strips teamId. Lists remain global. |
| Team created after many legacy games | Legacy games remain visible under “All Teams”; new games can be associated with the new team. |
| Player adjustments without teamId | Counted under “All Teams”; excluded for specific team filters. |

## Migration Plan (Rigorous)

### Preconditions
- Read Teams list; read master roster; read saved games

### Actions
1. If Teams list is empty and user enters New Game: offer CTA to create Team (no forced migration)
2. If seasons/tournaments contain `teamId`, run one-time cleanup to remove it (preserve other fields)
3. Do not mutate existing games—keep legacy games as-is

### Rollback
- No destructive writes to games; seasons/tournaments cleanup can be re-run idempotently

## Feature Flag & Rollout (Optional, recommended for production)

- Add a local feature flag `enableMultiTeam` (default true)
- If disabled, UI hides Teams and falls back to master roster & legacy behaviors

## Telemetry (Optional)

- Events: team_created, team_deleted, new_game_with_team, stats_filtered_by_team, load_filtered_by_team
- Metrics: teams_count, avg_roster_size, percent_legacy_games_loaded

## Accessibility & UX Baselines

- All menus and selectors keyboard-navigable (Tab/Arrow/Enter/Escape)
- High contrast for team badges/colors; do not rely on color alone
- Clear empty states: “No teams yet”, “No games for this team”, “Legacy games only”
- Mobile: large touch targets; dropdowns render properly on small screens

## Error States & Messaging

- Creating duplicate team name: “A team named ‘X’ already exists.”
- Loading team roster fails: “Couldn’t load roster for this team. Falling back to master roster.”
- Saving game without team when team is required: prompt to select or create a team

## Performance Budgets

- Teams list: O(1) to render typical (<20 teams); lazy-load rosters on demand
- Team roster fetch: <50ms for typical sizes; fallback cache via React Query
- Load Game filtering: client-side filter over in-memory saved games; consider pagination only if games > 1000

## Open Questions (defaults chosen)

1. Enforce jersey uniqueness per team? Default: warn but allow duplicates
2. Auto-create a default team during migration? Default: no—prompt user on first New Game
3. Export/import of teams? Default: out-of-scope v1 (use existing backup)

## Expanded Acceptance Criteria (Definition of Done)

Functional
- New Game requires team selection (or explicit “No Team / Master Roster” fallback) and persists teamId
- Load Game supports Team filter (All Teams, each Team, Legacy)
- Stats support Team filter; totals and graphs update correctly

Compatibility
- Legacy games behave as documented; seasons/tournaments remain global
- One-time cleanup removes teamId from seasons/tournaments if present

Quality
- Unit tests for teams CRUD/rosters; integration tests for New Game, Load Game, Stats filters; migration tests
- A11y checks pass for modals and selectors

## Example Storage Snapshots

### Before (Legacy)
```json
{
  "savedSoccerGames": {
    "game_123": { "selectedPlayerIds": ["p1", "p2"], "gameDate": "2024-02-12" }
  },
  "masterRoster": [{ "id": "p1", "name": "Alice" }, { "id": "p2", "name": "Bob" }]
}
```

### After (Teams present; legacy games untouched)
```json
{
  "soccerTeams": [
    { "id": "team_1700000000_abcd", "name": "Galaxy U10", "color": "#FF0000", "createdAt": "...", "updatedAt": "..." }
  ],
  "soccerTeamRosters": {
    "team_1700000000_abcd": [{ "id": "p1", "name": "Alice" }, { "id": "p2", "name": "Bob" }]
  },
  "savedSoccerGames": {
    "game_123": { "selectedPlayerIds": ["p1", "p2"], "gameDate": "2024-02-12" },
    "game_456": { "teamId": "team_1700000000_abcd", "selectedPlayerIds": ["p1"], "gameDate": "2024-03-01" }
  }
}
```

## Developer Checklist (Quick)

- [ ] Team Manager modal reachable from Control Bar + Start Screen + Settings
- [ ] New Game: Team dropdown + roster load + teamId saved
- [ ] Load Game: Team filter (All/each Team/Legacy)
- [ ] Stats: Team filter wired to calculators
- [ ] Seasons/Tournaments are global everywhere; cleanup strip if necessary
- [ ] Entity-centric query keys only; remove global team scoping
- [ ] Tests: unit + integration + migration

## Implementation Order & Dependencies

### Critical Path Dependencies
1. **Teams Data Layer** → **Team Management Modal** → **Navigation Integration**
2. **Teams Data Layer** → **New Game Integration** → **Game Creation Flow**
3. **New Game Integration** → **Load Game Filtering** → **Statistics Filtering**
4. **All Core Features** → **Migration & Polish** → **Testing & QA**

### Parallel Work Opportunities
- **UI Components** can be developed alongside **Data Layer** using mock data
- **Internationalization** can be added incrementally per component
- **Testing** can be written alongside feature development (TDD approach)
- **Documentation** updates can happen in parallel with implementation

## Quality Gates

### Phase Completion Criteria
Each phase must meet these criteria before proceeding:

**Phase 1 Complete When:**
- [ ] All team CRUD operations pass unit tests
- [ ] Team Management Modal renders without errors
- [ ] Team roster operations work end-to-end
- [ ] Build passes with no TypeScript errors

**Phase 2 Complete When:**
- [ ] Team selection in New Game works correctly
- [ ] Team roster loads when team is selected
- [ ] Game creation saves teamId properly
- [ ] Integration tests pass for game creation flow

**Phase 3 Complete When:**
- [ ] Load Game filtering by team works correctly
- [ ] Statistics filtering by team shows correct data
- [ ] Legacy games display properly in "All Teams" view
- [ ] Performance remains acceptable with team filtering

## Risk Mitigation Strategies

### Technical Risks
1. **Data Corruption**: Implement comprehensive backup before any storage changes
2. **Performance Degradation**: Monitor query performance, implement lazy loading
3. **Memory Leaks**: Proper cleanup of React Query caches and event listeners
4. **Storage Size**: Monitor localStorage usage, implement cleanup strategies

### User Experience Risks
1. **Learning Curve**: Progressive disclosure, helpful tooltips, clear documentation
2. **Data Loss Fear**: Clear messaging about data preservation during migration
3. **Feature Discoverability**: Prominent placement in navigation, onboarding hints
4. **Workflow Disruption**: Maintain all existing workflows, add teams as enhancement

### Rollback Plan
1. **Feature Flag**: Implement toggle to disable teams and revert to legacy behavior
2. **Data Backup**: Automatic backup before any migration or major changes
3. **Staged Rollout**: Test with subset of users before full deployment
4. **Recovery Scripts**: Automated scripts to restore from backup if needed

## Success Metrics & KPIs

### Functional Success
- [ ] Users can create and manage multiple teams
- [ ] Team selection works in all relevant workflows  
- [ ] Data isolation between teams is complete
- [ ] Legacy data continues to work without issues
- [ ] No data loss during migration or normal operations

### Performance Success
- [ ] Team operations complete within 100ms
- [ ] No memory leaks after extended use
- [ ] App startup time not impacted by teams feature
- [ ] UI remains responsive with multiple teams and large rosters

### User Experience Success
- [ ] Teams feature is discoverable within 30 seconds
- [ ] New team creation completes in under 2 minutes
- [ ] Team switching feels instant and intuitive
- [ ] Error states provide clear recovery paths
- [ ] Mobile experience matches desktop quality

---

## Critical Gaps & Unintended Consequences Analysis

### 🚨 **Major Ambiguities Requiring Clarification**

#### 1. Player ID Management & Cross-Team Duplication
**Issue**: Plan doesn't clarify player ID uniqueness scope.
- Are player IDs globally unique or team-scoped?
- When duplicating teams, are player IDs regenerated or reused?
- What happens if Team A has player "Alice" with ID "p1" and Team B imports/creates another "Alice"?

**Recommendation**: 
```typescript
// CLARIFY: Use globally unique player IDs always
const createPlayer = () => ({ 
  id: `player_${Date.now()}_${Math.random()}`, // Always globally unique
  // ... other fields
});
```

#### 2. Game Loading with Deleted Teams (Orphaned Games)
**Issue**: Plan mentions "orphaned games" but UI behavior is undefined.
- How do you load a game whose team was deleted?
- Does the game show "Unknown Team" or fail to load?
- Can you still play/edit these games?
- What roster is available for orphaned games?

**Critical UX Decision Needed**:
```
Option A: Orphaned games load with master roster as fallback
Option B: Orphaned games become read-only with frozen roster
Option C: Prompt user to reassign orphaned games to existing team
```

#### 3. "No Team" Selection Edge Cases  
**Issue**: NewGameSetupModal "No Team" behavior is underspecified.
- What if master roster is empty but user selects "No Team"?
- Should "No Team" option disappear if teams exist?
- How does this interact with the "prompt to create team" CTA?

**Flow Contradiction**: 
- Plan says "New Game requires team selection" 
- But also allows "No Team / Master Roster" fallback
- These seem contradictory for the intended user experience

#### 4. Player Roster Consistency During Game Loading
**Issue**: What happens when loading a game where selected players no longer exist in team roster?
```
Scenario: 
1. Save game with Team A players: [Alice, Bob, Charlie]
2. Later remove Bob from Team A roster  
3. Load the saved game - what happens to Bob?
```

**Options**:
- A: Show error, prevent loading
- B: Load game but mark missing players as "unavailable"
- C: Auto-remove missing players from selection
- D: Load with warning, allow user to decide

### 🔄 **Unintended Side Effects**

#### 1. Statistics Fragmentation
**Issue**: Team filtering might fragment statistics in unexpected ways.
- Season stats become meaningless if teams switch mid-season
- Tournament comparisons broken if some games are "legacy"
- Player development tracking lost when switching between teams

**Example**:
```
Jan: 10 games with "Galaxy U10" 
Feb: User renames team to "Galaxy FC"
Mar: 5 games with "Galaxy FC"
Result: Statistics show as 2 different teams!
```

#### 2. Performance Degradation Cascade
**Issue**: Client-side filtering can cascade into performance issues.
```
Load Game Modal:
- Filters 500+ games by team → client-side expensive
- Each team switch → re-filter all games → UI lag
- Multiple teams with large rosters → memory pressure
```

#### 3. React Query Cache Explosion
**Issue**: Team-specific query keys can create cache bloat.
```typescript
// This creates separate cache entry per team per query type
['teams', 'team_1', 'roster']
['teams', 'team_2', 'roster'] 
['teams', 'team_3', 'roster']
// With 10 teams × 5 query types = 50 cache entries
```

#### 4. Mobile UX Breakdown
**Issue**: Team Management Modal complexity doesn't translate to mobile.
- Two-panel layout (team list + details) problematic on small screens
- Color picker requires precision touch
- Long team names break mobile layouts
- Dropdown selectors with many teams become unwieldy

### 💥 **Critical Missing Specifications**

#### 1. Team Deletion Workflow
**Current**: "Default policy: allow deletion"  
**Missing**: Complete user workflow specification

**Required Flow**:
```
1. User clicks Delete Team
2. System checks: How many games reference this team?
3. Show count: "This will orphan 15 games. Continue?"
4. User confirms → What exactly happens to those 15 games?
5. Post-deletion: How do users find/manage orphaned games?
```

#### 2. Master Roster vs Team Roster Relationship
**Ambiguity**: Plan doesn't clarify the relationship.
- Is master roster deprecated once teams exist?
- Can changes to master roster affect team rosters?
- What happens if master roster and team rosters have conflicting player data?

#### 3. Error Recovery & Data Corruption Handling
**Missing**: Specific error recovery flows.
```
What if:
- Team roster localStorage becomes corrupted?
- React Query cache inconsistent with localStorage?
- User has teams but all rosters are empty?
- Migration partially fails (some teams created, others failed)?
```

#### 4. Internationalization Edge Cases
**Missing**: Non-Latin character handling, sorting, and display.
- Team names with emoji or special characters
- Sorting teams by name across different locales  
- Right-to-left language support in team management modal

### 🔧 **Recommended Clarifications**

#### 1. Add "Data Integrity" Section
```markdown
## Data Integrity Guarantees

### Player ID Consistency
- Player IDs are globally unique across all teams
- Duplicating teams generates new player IDs
- Cross-team player references always resolved by ID

### Game Loading Robustness  
- Games with deleted teams load with warning banner
- Missing players marked as "unavailable" but game remains playable
- Orphaned games accessible via "All Teams" filter

### Storage Corruption Recovery
- Automatic data validation on app startup
- Graceful degradation when team data is corrupted
- One-click repair tool for common data issues
```

#### 2. Add "Complex Scenarios" Section
```markdown
## Complex User Scenarios

### Scenario: Team Rename During Season
User renames "Galaxy U10" → "Galaxy FC" mid-season
- Historical games retain original context
- Statistics show continuity (same teamId)
- UI displays current team name with "(renamed)" indicator

### Scenario: Large Roster Performance
Team with 50+ players
- Roster loading uses pagination (20 players per page)
- Search/filter functionality within team roster
- Player selection uses virtualized lists for performance

### Scenario: Mobile Team Management
Two-panel layout becomes stacked on mobile:
- Panel 1: Team list (full width)
- Panel 2: Team details (slides over, covers list)
- Color picker uses mobile-friendly grid layout
```

#### 3. Add "Migration Edge Cases" Section  
```markdown
## Migration Edge Cases

### Empty Master Roster + Saved Games
If master roster is empty but games exist:
- Create temporary "Unknown Players" for missing IDs
- Prompt user to identify/recreate missing players
- Games remain loadable with placeholder names

### Partial Migration Failure
If migration fails partway through:
- Rollback all changes automatically
- Preserve original data intact
- Show clear error message with recovery options
- Allow retry or manual intervention
```

These gaps could cause significant implementation delays and user experience issues if not addressed upfront.

---

## Clarifications & Decisions (v1.1)

### Team Naming & Uniqueness
- Max length: 48 characters; allow full Unicode, trim whitespace
- Case-insensitive uniqueness; normalize using Unicode NFKC for comparisons
- Rename collisions show: "A team named ‘{name}’ already exists."

### Player Identity Across Teams
- Player IDs are globally unique (existing generator retained)
- Team duplication regenerates player IDs; imports preserve source IDs
- Stats are per-game; no cross-team merging by player ID in v1

### "No Team" Behavior
- Always visible option: "No Team (Use Master Roster)"
- If master roster empty: disable option and show CTA to create team
- New Game allows proceeding with master roster for backward compatibility

### Orphaned Games UX
- Banner on load: "Original team no longer exists. Using master roster."
- Game remains editable; missing players marked "Unavailable"
- Action: "Reassign to Team" opens selector; persisting writes teamId

### Stats & Filters
- Load/Stats default Team filter: "All Teams" (includes legacy)
- Selecting a Team excludes legacy games and games of other teams
- Cross-team comparison out-of-scope for v1 (single-team filter at a time)

### Cache & Performance
- React Query keys are entity-centric; avoid global team-scoped keys
- Team roster cache: TTL 15 minutes; LRU retain max 5 rosters
- Load/Stats: enable search after 50 games, paginate/virtualize ≥ 250

### Mobile & i18n
- Long names truncate with middle-ellipsis; maintain 4.5:1 contrast for badges
- Locale-aware sorting; case folding and Unicode NFKC normalization
- RTL supported in Team Management; two-pane stacks on mobile

### Backup & Rollback
- Before migration/write-heavy ops: store JSON snapshot in `backup_multi_team_<timestamp>`
- Retain last 3 backups; Settings provides restore action

### Access Points
- Control Bar: "Manage Teams" entry
- Start Screen: Teams overview + quick access button
- Settings: Teams section with count and manage link

### Validation on Startup
- Validate teams/rosters JSON; on corruption, reset keys and notify with repair option

### Defaults Reiterated
- Seasons/Tournaments remain global; strip stray teamId fields idempotently
- Master roster is not deprecated; used as fallback/import source

## ✅ **CODEBASE ANALYSIS & RESOLUTIONS**

Based on analysis of the existing codebase, here are the **concrete answers** to the critical gaps identified:

### 🔍 **Player ID Management - RESOLVED**
**Analysis**: Examined `src/utils/masterRoster.ts:60`
```typescript
// Current implementation uses globally unique IDs
id: `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
```
**✅ Decision**: Player IDs are **globally unique across all teams**. This prevents ID collisions and simplifies cross-team operations.

### 🔍 **Orphaned Game Handling - RESOLUTION NEEDED**
**Analysis**: Current `LoadGameModal.tsx:101` filters out `DEFAULT_GAME_ID` but has no orphaned team logic.
```typescript
const initialIds = Object.keys(savedGames).filter(id => id !== DEFAULT_GAME_ID);
```
**📋 Required Implementation**:
```typescript
// Option A (Recommended): Load with warning, use master roster fallback
const handleOrphanedGame = (game: AppState) => {
  if (game.teamId && !teamExists(game.teamId)) {
    // Show warning banner: "Team no longer exists"
    // Load game with master roster as fallback
    // Mark missing players as "unavailable" but keep game playable
  }
};
```

### 🔍 **"No Team" vs "Required Team" - RESOLUTION**
**Analysis**: No current team selection in `NewGameSetupModal.tsx`
**✅ Decision**: 
- **Required for new implementation**: Team selection dropdown with "No Team (Use Master Roster)" option
- **Fallback behavior**: Empty teams list → show "Create Team" CTA prominently
- **User flow**: Encourage team creation but allow master roster fallback

### 🔍 **Master Roster Relationship - RESOLVED**
**Analysis**: `src/utils/masterRosterManager.ts` shows master roster is **not deprecated**
```typescript
export const getMasterRoster = async (): Promise<Player[]> => {
  return await utilGetMasterRoster();
};
```
**✅ Decision**: Master roster remains as **global fallback** for:
- Legacy games without teamId
- "No Team" selection in new games  
- Empty team rosters (import source)

### 🔍 **Mobile Responsiveness - CURRENT STATUS**
**Analysis**: Existing modals use responsive patterns:
```typescript
// SeasonTournamentManagementModal.tsx:326
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
// GoalLogModal.tsx:138  
<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
```
**📋 Required Pattern**: Team Management Modal must follow same responsive approach:
```typescript
// Mobile: Stacked single column
// Tablet+: Side-by-side panels
<div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
  <div className="lg:border-r lg:border-slate-700/20 lg:pr-4">
    {/* Team List */}
  </div>
  <div className="lg:pl-4">
    {/* Team Details */}
  </div>
</div>
```

### 🔍 **React Query Cache Strategy - OPTIMIZATION NEEDED**
**Analysis**: Existing `useTeamGameDataQueries.ts:96` shows team-scoped queries already exist
```typescript
export function useTeamGameDataQueries(teamId?: string): TeamGameDataQueriesResult
```
**⚠️ Issue**: This creates separate cache per team, leading to cache explosion
**✅ Resolution**: Use entity-specific keys only:
```typescript
// AVOID: Team-scoped global queries
queryKeys.teamSeasons(teamId)   // ❌ Creates cache per team

// USE: Entity-specific queries  
queryKeys.teams                 // ✅ Global teams list
queryKeys.teamRoster(teamId)    // ✅ On-demand team roster
queryKeys.seasons               // ✅ Global seasons list
```

## 📋 **CONCRETE IMPLEMENTATION DECISIONS**

### 1. Player ID Strategy
- **Use existing globally unique pattern**: `player_${Date.now()}_${Math.random()...}`
- **Team duplication**: Generate new player IDs for duplicated teams
- **Cross-team imports**: Preserve original player IDs

### 2. Orphaned Game Workflow
```
1. Game loads normally but shows warning banner
2. Banner text: "⚠️ Original team 'Galaxy U10' no longer exists"  
3. Game uses master roster for player selection
4. Missing players marked as "Unavailable" but game remains playable
5. User can reassign game to existing team via game settings
```

### 3. Team Deletion Policy (v1)
```
1. Check game count: "Delete team? This will orphan 15 games."
2. User confirms → Team deleted from teams list
3. Orphaned games remain in savedGames with original teamId
4. UI handles orphaned games gracefully per workflow above
5. Future: Add reassignment tool before deletion
```

### 4. Master Roster Relationship
- **Remains active**: Master roster coexists with teams
- **Legacy games**: Continue using master roster
- **New games**: Can select "No Team" to use master roster  
- **Team rosters**: Can import from master roster
- **No automatic sync**: Teams and master roster are independent

### 5. Mobile UX Pattern
```html
<!-- Mobile (< lg): Stacked -->
<div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-4">
  <div className="lg:border-r lg:border-slate-700/20 lg:pr-4 mb-4 lg:mb-0">
    <!-- Team list full width on mobile -->
  </div>
  <div className="lg:pl-4">
    <!-- Team details below list on mobile -->  
  </div>
</div>
```

### 6. Error Recovery Flows
```typescript
// localStorage corruption recovery
const validateTeamData = () => {
  try {
    const teams = JSON.parse(localStorage.getItem('soccerTeams') || '[]');
    return Array.isArray(teams);
  } catch {
    // Corrupted data - reset teams
    localStorage.removeItem('soccerTeams');
    localStorage.removeItem('soccerTeamRosters');
    return false;
  }
};
```

## 🎯 **UPDATED SUCCESS CRITERIA**

### Must Have (v1)
- [x] Player IDs globally unique (existing implementation)
- [ ] Orphaned games load with warning + master roster fallback
- [ ] Team Management Modal responsive (stacked mobile, panels desktop)
- [ ] Master roster coexistence with teams
- [ ] Team deletion with game count warning

### Performance Requirements  
- [ ] Team operations < 100ms (measured)
- [ ] Cache keys entity-specific, not team-scoped globally
- [ ] Mobile touch targets ≥ 44px (accessibility standard)

### User Experience
- [ ] Team feature discoverable in ≤ 30 seconds
- [ ] Error states provide clear recovery paths  
- [ ] Orphaned game workflow tested and intuitive

---

## 🔄 IMPLEMENTATION STATUS

### ❌ REALITY vs PLAN ASSESSMENT

**Current Status:** Implementation deviated significantly from plan. Previous "completed" status was incorrect.

| Issue | Status | Location | Fix Required |
|-------|--------|----------|-------------|
| **Global "active team" still present** | ✅ **FIXED** | | |
| - ACTIVE_TEAM_ID_KEY exists | ✅ | `src/config/storageKeys.ts` | ~~Remove key~~ |
| - setActiveTeamId usage | ✅ | `src/components/TeamManagerModal.tsx` | ~~Strip all usage~~ |
| - activeTeamId references | ✅ | `src/hooks/useGameDataQueries.ts` | ~~Remove effectiveTeamId logic~~ |
| **Global entities wrongly team-scoped** | ✅ **FIXED** | | |
| - teamSeasons, teamTournaments keys | ✅ | `src/config/queryKeys.ts` | ~~Remove team-scoped keys~~ |
| - Seasons/tournaments filtered by team | ✅ | `src/hooks/useGameDataQueries.ts` | ~~Remove filters~~ |
| **Migration contradicts plan** | ✅ **FIXED** | | |
| - Tags seasons with teamId | ✅ | `src/utils/migration.ts` | ~~Keep seasons global~~ |
| - Tags tournaments with teamId | ✅ | `src/utils/migration.ts` | ~~Keep tournaments global~~ |
| - Tags saved games with teamId | ✅ | `src/utils/migration.ts` | ~~Don't mutate legacy games~~ |
| - Tags adjustments with teamId | ✅ | `src/utils/migration.ts` | ~~Don't mutate historical data~~ |
| **Types drift from plan** | ✅ **FIXED** | | |
| - teamId on Season/Tournament | ✅ | `src/types/index.ts` | ~~Remove teamId from global entities~~ |
| **Missing per-flow UI** | ❌ Not Implemented | | |
| - Team selector in NewGameSetupModal | ❌ | Missing | Add required Team dropdown |
| - Team filter in LoadGameModal | ❌ | Missing | Add "All/Team/Legacy" filter |
| - Team filter in Stats views | ❌ | Missing | Add team filtering |
| - Orphaned game banner/behavior | ❌ | Missing | Add reassignment UI |

### 🚨 TOP RISKS FROM CURRENT STATE
1. **Hidden global context** leaks into filters, cache, and UX
2. **Migration mutates historical data** against spec (risk of unexpected data grouping)  
3. **Cache bloat risk** from team-scoped keys
4. **Legacy games invisible** without "All Teams" default

### 📋 CORRECTIVE ACTION PLAN

#### Step 1: Remove Global Active Team (Complete Cleanup) ✅ **COMPLETED**
- ✅ Delete `ACTIVE_TEAM_ID_KEY` from `src/config/storageKeys.ts`
- ✅ Strip `setActiveTeamId`/`onTeamSwitch` from `TeamManagerModal.tsx`  
- ✅ Replace `useTeamGameDataQueries` with entity-centric hooks

#### Step 2: Fix Query Keys (Entity-Centric Design) ✅ **COMPLETED**  
- ✅ Remove `teamSeasons`, `teamTournaments` from `src/config/queryKeys.ts`
- ✅ Keep: `teams`, `teamRoster(teamId)`, `seasons`, `tournaments`, `savedGames`

#### Step 3: Correct Migration (Preserve Historical Data) ✅ **COMPLETED**
- ✅ Stop tagging seasons/tournaments/saved games/adjustments with `teamId`
- ✅ Do not auto-create default team; prompt in New Game instead

#### Step 4: Align Types (Global vs Team-Specific) ✅ **COMPLETED**
- ✅ Remove `teamId` from Season/Tournament types
- ✅ Keep `teamId?` optional on AppState and adjustments only

#### Step 5: Add Per-Flow UI (Contextual Team Selection) ✅ **COMPLETED**
- ✅ New Game: Team dropdown with "No Team (Master Roster)" fallback implemented with roster auto-loading
- ✅ Load Game: Team filter (All/each team/Legacy) badges implemented with orphaned game detection
- ✅ Stats: Team filter integrated with filtering logic for all views
- ✅ Orphaned game banner + "Reassign to Team" action **[COMPLETED]**

---

### 🎯 CORRECTIVE IMPLEMENTATION COMPLETED

**Date:** August 25, 2025  
**Status:** Core architectural issues resolved, ready for UI implementation

#### ✅ **What Was Fixed**
1. **Complete removal of global active team state** - No more hidden global context
2. **Entity-centric query keys** - Seasons/tournaments are truly global, no cache bloat  
3. **Preserved historical data** - No retrospective tagging of legacy entities
4. **Aligned types with plan** - Global entities clean of teamId pollution  

#### ✅ **Validation Results**
- **Build Status:** Clean compilation ✅
- **Linting:** No warnings or errors ✅  
- **Architecture:** Matches MULTI-TEAM-SUPPORT.md v1.1 specification ✅
- **Data Safety:** Historical data preserved ✅

#### 📋 **Per-Flow UI Implementation - COMPLETED**  
The foundation is correctly established and contextual team selection has been implemented in all major user flows:

**Implemented Components:**
- ✅ **NewGameSetupModal.tsx** - Team dropdown with roster loading and "No Team" fallback
- ✅ **LoadGameModal.tsx** - Team filter buttons (All Teams, Legacy Games, individual teams)  
- ✅ **GameStatsModal.tsx** - Team filtering for all stats views with proper game filtering

**Implementation Complete:** All major multi-team support features have been successfully implemented:

✅ **Core Features Implemented:**
- Team Management Modal with full CRUD operations
- Contextual team selection in New Game with roster auto-loading and team name auto-fill
- Team filtering in Load Game with visual team badges and orphaned game detection
- Team filtering in Stats views for all statistics types  
- Orphaned game handling with warning banner and reassignment modal
- Complete removal of global team state - teams are contextual selections
- Backward compatibility with legacy games without team associations
- Data migration support preserving historical data integrity

**Architecture:**
- Entity-centric design with teams as data entities
- React Query integration for efficient data management
- No global team state pollution
- Seasons and tournaments remain global entities as specified