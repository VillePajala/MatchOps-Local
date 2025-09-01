# Smart Roster Detection and Guard Conditions

This document details the smart detection logic and guard conditions that prevent empty roster scenarios and provide intelligent UI state management in MatchOps-Local.

## Architecture Overview

The smart roster detection system analyzes the application state on startup to:
- Detect whether users have created any players in their roster
- Determine if users have any saved games
- Identify first-time users who need guidance
- Enable/disable UI features based on available data
- Prevent user frustration with empty state scenarios

## Detection Logic Implementation

### Main Detection Hook
**File**: `/src/app/page.tsx` (lines 26-59)

```typescript
useEffect(() => {
  const checkAppState = async () => {
    try {
      // Run migration first (idempotent - safe to run multiple times)
      await runMigration();
      
      // Check for resume capability
      const lastId = await getCurrentGameIdSetting();
      const games = await getSavedGames();
      
      if (lastId && games[lastId]) {
        setCanResume(true);
      }
      
      // Check if user has any saved games
      setHasSavedGames(Object.keys(games).length > 0);
      
      // Check if user has any players in roster
      const roster = await getMasterRoster();
      setHasPlayers(roster.length > 0);
      
      // Check if user has any seasons or tournaments
      const seasons = await getSeasons();
      const tournaments = await getTournaments();
      setHasSeasonsTournaments(seasons.length > 0 || tournaments.length > 0);
    } catch {
      setCanResume(false);
      setHasSavedGames(false);
      setHasPlayers(false);
      setHasSeasonsTournaments(false);
    }
  };
  checkAppState();
}, []);
```

### First-Time User Detection
**File**: `/src/app/page.tsx` (lines 22-24)

```typescript
// A user is considered "first time" if they haven't created a roster OR a game yet.
// This ensures they are guided through the full setup process.
const isFirstTimeUser = !hasPlayers || !hasSavedGames;
```

This logic uses **OR** condition to be inclusive - if either players or games are missing, the user needs guidance.

### State Variables

The detection system maintains several boolean flags:

1. **`hasPlayers`** - Whether master roster contains any players
2. **`hasSavedGames`** - Whether any games have been saved
3. **`hasSeasonsTournaments`** - Whether seasons or tournaments exist
4. **`canResume`** - Whether a specific game can be resumed
5. **`isFirstTimeUser`** - Derived flag for new user detection

## Guard Conditions in UI Components

### StartScreen Guard Logic
**File**: `/src/components/StartScreen.tsx` (lines 24-28, 42-45)

```typescript
interface StartScreenProps {
  // ... other props
  hasPlayers?: boolean;
  hasSavedGames?: boolean;
  hasSeasonsTournaments?: boolean;
  isFirstTimeUser?: boolean;
}

const StartScreen: React.FC<StartScreenProps> = ({
  // ... other props
  hasPlayers = false,
  hasSavedGames = false,
  hasSeasonsTournaments = false,
  isFirstTimeUser = false,
}) => {
```

### Conditional UI Rendering

#### First-Time User Experience (lines 197-228)
```typescript
{isFirstTimeUser ? (
  // First-time user gets "Get Started" button
  <button
    onClick={onGetStarted}
    className={primaryButtonStyle}
  >
    {t('startScreen.getStartedButton', 'Get Started')}
  </button>
) : (
  // Experienced users get "Quick Start" option
  <button
    onClick={onStartNewGame}
    className={primaryButtonStyle}
  >
    {t('startScreen.quickStart', 'Quick Start')}
  </button>
)}
```

#### Empty Roster Warning (lines 229-244)
```typescript
{!hasPlayers && (
  <div className="w-full p-3 bg-amber-900/30 border border-amber-600/40 rounded-lg text-amber-200 text-sm leading-relaxed">
    <div className="flex items-start gap-2">
      <div className="flex-shrink-0 mt-0.5">
        <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
          <span className="text-xs text-amber-900">!</span>
        </div>
      </div>
      <div>
        <p className="font-medium mb-1">
          {t('startScreen.emptyRosterWarning', 'No players in roster')}
        </p>
        <p className="text-xs opacity-80">
          {t('startScreen.setupRosterFirst', 'Set up your player roster first to unlock all features.')}
        </p>
      </div>
    </div>
  </div>
)}
```

#### Feature-Gated Buttons

**Load Games Button** (lines 245-252)
```typescript
<button
  className={hasSavedGames ? primaryButtonStyle : disabledButtonStyle}
  onClick={hasSavedGames ? onLoadGame : undefined}
  disabled={!hasSavedGames}
  title={!hasSavedGames ? t('startScreen.noGamesHint', 'No saved games available') : undefined}
>
  {t('startScreen.loadGameButton', 'Load Game')}
</button>
```

**Season Management Button** (lines 254-261)
```typescript
<button
  className={hasPlayers ? primaryButtonStyle : disabledButtonStyle}
  onClick={hasPlayers ? onCreateSeason : undefined}
  disabled={!hasPlayers}
  title={!hasPlayers ? t('startScreen.needPlayersHint', 'Set up players first') : undefined}
>
  {t('startScreen.manageSeasonsButton', 'Seasons & Tournaments')}
</button>
```

**Team Management Button** (lines 263-270)
```typescript
<button
  className={hasPlayers ? primaryButtonStyle : disabledButtonStyle}
  onClick={hasPlayers ? onManageTeams : undefined}
  disabled={!hasPlayers}
  title={!hasPlayers ? t('startScreen.needPlayersHint', 'Set up players first') : undefined}
>
  {t('startScreen.manageTeamsButton', 'Manage Teams')}
</button>
```

**View Statistics Button** (lines 272-279)
```typescript
<button
  className={hasSavedGames ? primaryButtonStyle : disabledButtonStyle}
  onClick={hasSavedGames ? onViewStats : undefined}
  disabled={!hasSavedGames}
  title={!hasSavedGames ? t('startScreen.noStatsHint', 'Play some games first to see statistics') : undefined}
>
  {t('startScreen.viewStatsButton', 'Player Stats')}
</button>
```

## Roster Hook Guard Conditions

### useRoster Hook Implementation
**File**: `/src/hooks/useRoster.ts`

The `useRoster` hook provides several guard mechanisms:

#### Error State Management (lines 14-15)
```typescript
const [rosterError, setRosterError] = useState<string | null>(null);
const [isRosterUpdating, setIsRosterUpdating] = useState(false);
```

#### Safe Player Operations (lines 22-51)
```typescript
const handleAddPlayer = async (
  data: Omit<Player, 'id' | 'isGoalie' | 'receivedFairPlayCard'>,
) => {
  const prev = [...availablePlayers];
  const temp: Player = {
    id: `temp-${Date.now()}`,
    isGoalie: false,
    receivedFairPlayCard: false,
    ...data,
  };
  setIsRosterUpdating(true);
  setAvailablePlayers([...availablePlayers, temp]);
  try {
    const saved = await addPlayer(data);
    if (saved) {
      setAvailablePlayers((players) =>
        players.map((p) => (p.id === temp.id ? saved : p)),
      );
      setRosterError(null);
    } else {
      setAvailablePlayers(prev);
      setRosterError('Failed to add player');
    }
  } catch {
    setAvailablePlayers(prev);
    setRosterError('Failed to add player');
  } finally {
    setIsRosterUpdating(false);
  }
};
```

#### Optimistic Updates with Rollback
The hook uses optimistic updates that rollback on failure:
1. Backup current state
2. Apply optimistic change
3. Attempt persistent save
4. On failure, restore backup and show error
5. On success, confirm change and clear errors

## Validation Guard Conditions

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

### Roster Validation
**File**: `/src/utils/validation.ts` (lines 67-109)

```typescript
export const validateRoster = (roster: TeamPlayer[]): ValidationResult => {
  const errors: ValidationError[] = [];

  if (!Array.isArray(roster)) {
    errors.push({ field: 'roster', message: 'Roster must be an array' });
    return { isValid: false, errors };
  }

  // Check for duplicate names
  const names = roster.map(p => p.name.toLowerCase().trim());
  const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicateNames.length > 0) {
    errors.push({ field: 'roster', message: `Duplicate player names found: ${duplicateNames.join(', ')}` });
  }

  // Check for duplicate jersey numbers
  const jerseyNumbers = roster
    .map(p => p.jerseyNumber)
    .filter(num => num && !isNaN(Number(num)))
    .map(num => Number(num));
  const duplicateNumbers = jerseyNumbers.filter((num, index) => jerseyNumbers.indexOf(num) !== index);
  if (duplicateNumbers.length > 0) {
    errors.push({ field: 'roster', message: `Duplicate jersey numbers found: ${duplicateNumbers.join(', ')}` });
  }

  // Validate each player
  roster.forEach((player, index) => {
    const playerValidation = validatePlayer(player);
    if (!playerValidation.isValid) {
      playerValidation.errors.forEach(error => {
        errors.push({ 
          field: `roster[${index}].${error.field}`, 
          message: `Player ${index + 1}: ${error.message}` 
        });
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
};
```

### Data Integrity Checks
**File**: `/src/utils/validation.ts` (lines 139-163)

```typescript
export const validateTeamIntegrity = (team: Team, roster: TeamPlayer[]): ValidationResult => {
  const errors: ValidationError[] = [];

  // Check if team ID is valid
  if (!isValidTeamId(team.id)) {
    errors.push({ field: 'id', message: 'Invalid team ID format' });
  }

  // Check if all player IDs are valid
  roster.forEach((player, index) => {
    if (!isValidPlayerId(player.id)) {
      errors.push({ field: `roster[${index}].id`, message: `Invalid player ID format: ${player.id}` });
    }
  });

  // Check if team has reasonable roster size
  if (roster.length > 50) {
    errors.push({ field: 'roster', message: 'Team roster cannot exceed 50 players' });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
```

## Storage Guard Conditions

### Master Roster Manager Guards
**File**: `/src/utils/masterRosterManager.ts`

Every operation includes error handling:

```typescript
export const getMasterRoster = async (): Promise<Player[]> => {
    try {
        const roster = await utilGetMasterRoster();
        return roster;
    } catch (error) {
        logger.error("[masterRosterManager] Error in getMasterRoster:", error);
        return []; // Return empty array on error to maintain type consistency
    }
};
```

### Teams Storage Guards
**File**: `/src/utils/teams.ts`

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

#### Atomic Roster Operations
**File**: `/src/utils/teams.ts` (lines 138-143)

```typescript
export const getTeamRoster = async (teamId: string): Promise<TeamPlayer[]> => {
  return withRosterLock(async () => {
    const rostersIndex = await getAllTeamRosters();
    return rostersIndex[teamId] || [];
  });
};
```

The `withRosterLock` function ensures atomic operations and prevents race conditions.

## Test Coverage

### StartScreen Tests
**File**: `/src/components/StartScreen.test.tsx`

#### First-Time User Scenario (lines 104-120)
```typescript
it('renders first-time user interface with proper guards', () => {
  render(
    <StartScreen
      onGetStarted={mockOnGetStarted}
      onStartNewGame={mockOnStartNewGame}
      onLoadGame={mockOnLoadGame}
      onCreateSeason={mockOnCreateSeason}
      onViewStats={mockOnViewStats}
      onSetupRoster={mockOnSetupRoster}
      onManageTeams={mockOnManageTeams}
      hasPlayers={false}
      hasSavedGames={false}
      hasSeasonsTournaments={false}
      isFirstTimeUser={true} // First-time user interface
    />
  );
  
  // First-time users should see "Get Started" instead of "Quick Start"
  expect(screen.getByText('Get Started')).toBeInTheDocument();
  
  // Buttons should be disabled when prerequisites aren't met
  expect(screen.getByText('Load Game')).toBeDisabled();
  expect(screen.getByText('Seasons & Tournaments')).toBeDisabled();
});
```

#### Experienced User Scenario (lines 57-80)
```typescript
it('renders experienced user interface with enabled features', () => {
  render(
    <StartScreen
      onGetStarted={mockOnGetStarted}
      onStartNewGame={mockOnStartNewGame}
      onLoadGame={mockOnLoadGame}
      onCreateSeason={mockOnCreateSeason}
      onViewStats={mockOnViewStats}
      onSetupRoster={mockOnSetupRoster}
      onManageTeams={mockOnManageTeams}
      hasPlayers={true}
      hasSavedGames={true}
      hasSeasonsTournaments={true}
      isFirstTimeUser={false} // Experienced user interface
    />
  );
  
  // Experienced users get different primary action
  expect(screen.getByText('Quick Start')).toBeInTheDocument();
  
  // Features should be enabled when prerequisites are met
  expect(screen.getByText('Load Game')).not.toBeDisabled();
  expect(screen.getByText('Seasons & Tournaments')).not.toBeDisabled();
});
```

## Translation Keys

### Guard Condition Messages
**Structure**: `startScreen.*`

Key translation keys for guard conditions:
- `startScreen.emptyRosterWarning` - Warning when no players exist
- `startScreen.setupRosterFirst` - Guidance message for roster setup
- `startScreen.noGamesHint` - Tooltip when no saved games exist
- `startScreen.needPlayersHint` - Tooltip when players needed for feature
- `startScreen.noStatsHint` - Tooltip when no stats available
- `startScreen.getStartedButton` - First-time user call-to-action
- `startScreen.quickStart` - Experienced user call-to-action

## Implementation Benefits

1. **Prevents Empty States**: Users never encounter broken functionality
2. **Progressive Disclosure**: Features unlock as prerequisites are met
3. **Clear Guidance**: Visual cues and messaging guide users
4. **Data Integrity**: Validation prevents corrupt or invalid data
5. **Error Recovery**: Optimistic updates with rollback on failure
6. **Race Condition Prevention**: Atomic operations with locking
7. **Type Safety**: Comprehensive TypeScript guards

## Implementation Gotchas

### False Positives
- Migration must complete before detection runs
- localStorage parsing errors should not crash the app
- Empty arrays vs. null/undefined require careful handling

### Performance Considerations
- Detection runs on every app startup
- Multiple async operations should be batched where possible
- Failed operations should not block UI rendering

### Edge Cases
- Partially corrupted data should gracefully degrade
- Network timing issues should not affect localStorage detection
- Race conditions during concurrent modifications need locking

## Future Enhancements

Potential improvements to the guard system:
- Cached detection results for better performance
- Real-time updates when data changes
- More granular feature gates based on data quality
- Progressive onboarding flows with step tracking
- Advanced validation rules based on user patterns