# Seasons and Tournaments - Decoupled Architecture

This document details how seasons and tournaments operate independently from team rosters in MatchOps-Local, providing a flexible system for organizing games without tight coupling to specific teams.

## Architecture Overview

Seasons and tournaments are **global entities** that exist independently of teams. This decoupled design allows:
- Seasons/tournaments to be reused across multiple teams
- Teams to participate in multiple seasons/tournaments simultaneously
- Historical data preservation when teams are modified or deleted
- Flexible game organization without structural dependencies

## Data Structures

### Season Interface
**File**: `/src/types/index.ts` (lines 45-61)

```typescript
export interface Season {
  id: string;                    // season_[timestamp]_[random]
  name: string;                  // "Spring 2024", "U10 League"
  location?: string;             // Optional venue
  periodCount?: number;          // 1 or 2 periods per game
  periodDuration?: number;       // Minutes per period
  startDate?: string;           // ISO date string
  endDate?: string;             // ISO date string
  gameDates?: string[];         // Array of game dates
  archived?: boolean;           // Archive status
  notes?: string;               // Free-form notes
  color?: string;               // Display color (hex)
  badge?: string;               // Display badge/icon
  ageGroup?: string;            // "U8", "U10", "U12", etc.
  // Note: teamId removed - seasons are global entities per plan
  // Note: roster management removed - teams handle rosters now
}
```

### Tournament Interface
**File**: `/src/types/index.ts` (lines 63-80)

```typescript
export interface Tournament {
  id: string;                    // tournament_[timestamp]_[random]
  name: string;                  // "Summer Cup", "Regional Tournament"
  location?: string;             // Optional venue
  periodCount?: number;          // 1 or 2 periods per game
  periodDuration?: number;       // Minutes per period
  startDate?: string;           // ISO date string
  endDate?: string;             // ISO date string
  gameDates?: string[];         // Array of game dates
  archived?: boolean;           // Archive status
  notes?: string;               // Free-form notes
  color?: string;               // Display color (hex)
  badge?: string;               // Display badge/icon
  level?: string;               // "Recreational", "Competitive", "Elite"
  ageGroup?: string;            // "U8", "U10", "U12", etc.
  // Note: teamId removed - tournaments are global entities per plan
  // Note: roster management removed - teams handle rosters now
}
```

## Storage Implementation

### localStorage Keys
**File**: `/src/config/storageKeys.ts`
- `SEASONS_LIST_KEY` = 'seasons_list' - All seasons data
- `TOURNAMENTS_LIST_KEY` = 'tournaments_list' - All tournaments data

### Seasons Storage Manager
**File**: `/src/utils/seasons.ts`

#### Core Operations

```typescript
// Retrieve all seasons (lines 17-29)
export const getSeasons = async (): Promise<Season[]> => {
  try {
    const seasonsJson = getLocalStorageItem(SEASONS_LIST_KEY);
    if (!seasonsJson) {
      return Promise.resolve([]);
    }
    const seasons = JSON.parse(seasonsJson) as Season[];
    return Promise.resolve(seasons.map(s => ({ ...s, ageGroup: s.ageGroup ?? undefined })));
  } catch (error) {
    logger.error('[getSeasons] Error reading seasons from localStorage:', error);
    return Promise.resolve([]); // Resolve with empty array on error
  }
};

// Save all seasons (lines 36-44)
export const saveSeasons = async (seasons: Season[]): Promise<boolean> => {
  try {
    setLocalStorageItem(SEASONS_LIST_KEY, JSON.stringify(seasons));
    return Promise.resolve(true);
  } catch (error) {
    logger.error('[saveSeasons] Error saving seasons to localStorage:', error);
    return Promise.resolve(false);
  }
};

// Add new season with validation (lines 52-81)
export const addSeason = async (newSeasonName: string, extra: Partial<Season> = {}): Promise<Season | null> => {
  const trimmedName = newSeasonName.trim();
  if (!trimmedName) {
    logger.error('[addSeason] Validation failed: Season name cannot be empty.');
    return Promise.resolve(null);
  }

  try {
    const currentSeasons = await getSeasons();
    if (currentSeasons.some(s => s.name.toLowerCase() === trimmedName.toLowerCase())) {
      logger.error(`[addSeason] Validation failed: A season with name "${trimmedName}" already exists.`);
      return Promise.resolve(null);
    }
    const newSeason: Season = {
      id: `season_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: trimmedName,
      ...extra,
    };
    const updatedSeasons = [...currentSeasons, newSeason];
    const success = await saveSeasons(updatedSeasons);

    if (!success) {
      return Promise.resolve(null);
    }
    return Promise.resolve(newSeason);
  } catch (error) {
    logger.error('[addSeason] Unexpected error adding season:', error);
    return Promise.resolve(null);
  }
};
```

### Tournaments Storage Manager
**File**: `/src/utils/tournaments.ts`

#### Core Operations

```typescript
// Retrieve all tournaments (lines 17-35)
export const getTournaments = async (): Promise<Tournament[]> => {
  try {
    const tournamentsJson = getLocalStorageItem(TOURNAMENTS_LIST_KEY);
    if (!tournamentsJson) {
      return Promise.resolve([]);
    }
    const tournaments = JSON.parse(tournamentsJson) as Tournament[];
    return Promise.resolve(
      tournaments.map(t => ({
        ...t,
        level: t.level ?? undefined,
        ageGroup: t.ageGroup ?? undefined,
      }))
    );
  } catch (error) {
    logger.error('[getTournaments] Error getting tournaments from localStorage:', error);
    return Promise.resolve([]);
  }
};

// Add tournament with level/ageGroup handling (lines 58-90)
export const addTournament = async (newTournamentName: string, extra: Partial<Tournament> = {}): Promise<Tournament | null> => {
  const trimmedName = newTournamentName.trim();
  if (!trimmedName) {
    logger.error('[addTournament] Validation failed: Tournament name cannot be empty.');
    return Promise.resolve(null);
  }

  try {
    const currentTournaments = await getTournaments();
    if (currentTournaments.some(t => t.name.toLowerCase() === trimmedName.toLowerCase())) {
      logger.error(`[addTournament] Validation failed: A tournament with name "${trimmedName}" already exists.`);
      return Promise.resolve(null);
    }
    const { level, ageGroup, ...rest } = extra;
    const newTournament: Tournament = {
      id: `tournament_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: trimmedName,
      ...rest,
      ...(level ? { level } : {}),
      ...(ageGroup ? { ageGroup } : {}),
    };
    const updatedTournaments = [...currentTournaments, newTournament];
    const success = await saveTournaments(updatedTournaments);

    if (!success) {
      return Promise.resolve(null);
    }
    return Promise.resolve(newTournament);
  } catch (error) {
    logger.error('[addTournament] Unexpected error adding tournament:', error);
    return Promise.resolve(null);
  }
};
```

## React Query Integration

### Query Keys
**File**: `/src/config/queryKeys.ts` (lines 4-5)

```typescript
export const queryKeys = {
  // Global entities (not team-specific, according to plan)
  masterRoster: ['masterRoster'] as const,
  seasons: ['seasons'] as const,          // Global seasons query
  tournaments: ['tournaments'] as const,  // Global tournaments query
  savedGames: ['savedGames'] as const,
  
  // Team-specific entities
  teams: ['teams'] as const,
  teamRoster: (teamId: string) => ['teams', teamId, 'roster'] as const,
  
  // App settings
  appSettingsCurrentGameId: ['appSettingsCurrentGameId'] as const,
};
```

### Data Queries Hook
**File**: `/src/hooks/useGameDataQueries.ts` (lines 116-127)

```typescript
// Get seasons (global entities - no team filtering per plan)
const seasons = useQuery<Season[], Error>({
  queryKey: queryKeys.seasons,
  queryFn: getSeasons,
});

// Get tournaments (global entities - no team filtering per plan)  
const tournaments = useQuery<Tournament[], Error>({
  queryKey: queryKeys.tournaments,
  queryFn: getTournaments,
});
```

## Management UI Component

### SeasonTournamentManagementModal
**File**: `/src/components/SeasonTournamentManagementModal.tsx`

This component provides a unified interface for managing both seasons and tournaments:

#### Props Interface (lines 11-22)
```typescript
interface SeasonTournamentManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    seasons: Season[];
    tournaments: Tournament[];
    addSeasonMutation: UseMutationResult<Season | null, Error, Partial<Season> & { name: string }, unknown>;
    addTournamentMutation: UseMutationResult<Tournament | null, Error, Partial<Tournament> & { name: string }, unknown>;
    updateSeasonMutation: UseMutationResult<Season | null, Error, Season, unknown>;
    deleteSeasonMutation: UseMutationResult<boolean, Error, string, unknown>;
    updateTournamentMutation: UseMutationResult<Tournament | null, Error, Tournament, unknown>;
    deleteTournamentMutation: UseMutationResult<boolean, Error, string, unknown>;
}
```

#### Field Sanitization (lines 36-48)
```typescript
const sanitizeFields = (fields: Partial<Season | Tournament>): Partial<Season | Tournament> => {
    const sanitized: Partial<Season | Tournament> = { ...fields };
    if (sanitized.periodCount !== undefined) {
        sanitized.periodCount =
            sanitized.periodCount === 1 || sanitized.periodCount === 2
                ? sanitized.periodCount
                : undefined;
    }
    if (sanitized.periodDuration !== undefined) {
        sanitized.periodDuration = sanitized.periodDuration > 0 ? sanitized.periodDuration : undefined;
    }
    return sanitized;
};
```

#### Game Statistics Loading (lines 66-85)
```typescript
React.useEffect(() => {
    const loadStats = async () => {
        const { getFilteredGames } = await import('@/utils/savedGames');
        const seasonStats: Record<string, { games: number; goals: number }> = {};
        for (const s of seasons) {
            const games = await getFilteredGames({ seasonId: s.id });
            const goals = games.reduce((sum, [, g]) => sum + (g.gameEvents?.filter(e => e.type === 'goal').length || 0), 0);
            seasonStats[s.id] = { games: games.length, goals };
        }
        for (const t of tournaments) {
            const games = await getFilteredGames({ tournamentId: t.id });
            const goals = games.reduce((sum, [, g]) => sum + (g.gameEvents?.filter(e => e.type === 'goal').length || 0), 0);
            seasonStats[t.id] = { games: games.length, goals };
        }
        setStats(seasonStats);
    };
    if (isOpen) {
        loadStats();
    }
}, [isOpen, seasons, tournaments]);
```

### Form Fields

#### Age Group Selection (lines 191-200)
```typescript
<select
    value={(type==='season'?newSeasonFields.ageGroup:newTournamentFields.ageGroup) || ''}
    onChange={(e)=>type==='season'?setNewSeasonFields(f=>({...f,ageGroup:e.target.value})):setNewTournamentFields(f=>({...f,ageGroup:e.target.value}))}
    className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
>
    <option value="">{t('common.selectAgeGroup', '-- Select Age Group --')}</option>
    {AGE_GROUPS.map(group => (
        <option key={group} value={group}>{group}</option>
    ))}
</select>
```

#### Tournament-Specific Level Selection (lines 201-212)
```typescript
{type==='tournament' && (
    <select
        value={newTournamentFields.level || ''}
        onChange={e=>setNewTournamentFields(f=>({...f,level:e.target.value}))}
        className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
    >
        <option value="">{t('common.selectLevel', '-- Select Level --')}</option>
        {LEVELS.map(lvl => (
            <option key={lvl} value={lvl}>{t(`common.level${lvl}` as TranslationKey, lvl)}</option>
        ))}
    </select>
)}
```

## Configuration Values

### Age Groups
**File**: `/src/config/gameOptions.ts`
```typescript
export const AGE_GROUPS = ['U6', 'U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'Adult'];
```

### Tournament Levels
**File**: `/src/config/gameOptions.ts`
```typescript
export const LEVELS = ['Recreational', 'Competitive', 'Elite'];
```

## Translation Keys

### Season/Tournament Management Modal
**Structure**: `seasonTournamentModal.*`

Key translation keys used:
- `seasonTournamentModal.title` - Modal title
- `seasonTournamentModal.seasons` - Seasons section header
- `seasonTournamentModal.tournaments` - Tournaments section header
- `seasonTournamentModal.createNew` - Create new button text
- `seasonTournamentModal.newSeasonPlaceholder` - Season name input placeholder
- `seasonTournamentModal.newTournamentPlaceholder` - Tournament name input placeholder
- `seasonTournamentModal.locationLabel` - Location field label
- `seasonTournamentModal.periodCountLabel` - Period count field label
- `seasonTournamentModal.periodDurationLabel` - Period duration field label
- `seasonTournamentModal.startDateLabel` - Start date field label
- `seasonTournamentModal.endDateLabel` - End date field label
- `seasonTournamentModal.notesLabel` - Notes field label
- `seasonTournamentModal.archiveLabel` - Archive checkbox label
- `seasonTournamentModal.statsGames` - Games statistics label
- `seasonTournamentModal.statsGoals` - Goals statistics label
- `seasonTournamentModal.confirmDelete` - Delete confirmation message
- `seasonTournamentModal.searchPlaceholder` - Search input placeholder

## Implementation Details

### Validation Rules

1. **Name Uniqueness**: Case-insensitive name checking within each type
2. **Required Fields**: Name is required and cannot be empty after trimming
3. **Period Constraints**: Period count must be 1 or 2, duration must be positive
4. **Data Sanitization**: All optional fields are sanitized before storage

### Error Handling

1. **Graceful Degradation**: Failed operations return null/false rather than throwing
2. **Logging**: All errors are logged with context using the logger utility
3. **Recovery**: Empty arrays returned on parse/read failures

### ID Generation

Both seasons and tournaments use timestamp + random string format:
- `season_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
- `tournament_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

### Relationship to Games

Games reference seasons and tournaments via:
- `seasonId?: string` - Optional season association
- `tournamentId?: string` - Optional tournament association

This loose coupling allows:
- Games without season/tournament association
- Season/tournament deletion without breaking games (orphaned games)
- Multiple teams participating in same season/tournament

## Key Benefits

1. **Flexibility**: Teams can participate in multiple seasons/tournaments
2. **Reusability**: Same season/tournament can be used across teams
3. **Data Integrity**: Deleting teams doesn't affect season/tournament data
4. **Scalability**: Global entities scale better than team-coupled data
5. **Reporting**: Statistics can be aggregated across teams within seasons/tournaments

## Future Considerations

- Tournament bracket/playoff support
- Multi-team season leaderboards
- Cross-team statistics within seasons/tournaments
- Season/tournament templates for quick setup
- Import/export of season/tournament configurations