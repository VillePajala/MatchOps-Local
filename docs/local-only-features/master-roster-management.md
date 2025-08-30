# Master Roster Management

## Overview
The RosterSettingsModal has been refactored to exclusively manage the master player roster, with team name functionality removed to avoid confusion with the separate team management system.

## Key Changes (Multi-Team Support)

### Before
- RosterSettingsModal managed both player roster and team name
- Team name was editable within the roster modal
- Confusing UX where team name in roster settings conflicted with separate teams

### After
- **Master Roster Focus**: Modal exclusively manages the global player pool
- **Team Name Removed**: No team name editing functionality within roster settings
- **Clear Separation**: Team management handled separately via TeamManagerModal
- **Updated Title**: "Master Roster" instead of "Manage Roster" for clarity

## Interface Changes

### Removed Props
```typescript
// REMOVED from RosterSettingsModalProps:
// teamName: string;
// onTeamNameChange: (newName: string) => void;
```

### Removed UI Elements
- Team name input section (lines 265-293 in original component)
- Team name editing state management
- Team name validation logic

## Files Affected
- **Component**: `src/components/RosterSettingsModal.tsx` 
- **Tests**: `src/components/RosterSettingsModal.test.tsx`
- **Parent**: `src/components/HomePage.tsx` (removed team name props)
- **Translations**: Updated titles in English/Finnish

## Translation Updates
- **English**: `rosterSettingsModal.title` → "Master Roster"
- **Finnish**: `rosterSettingsModal.title` → "Pääkokoonpano"

## Architectural Benefits
1. **Clear Separation of Concerns**: Master roster vs team-specific rosters
2. **Reduced Confusion**: No conflicting team name sources
3. **Streamlined UX**: Focus on player management only
4. **Consistent Terminology**: "Master Roster" clearly indicates global player pool

## Usage Context
The RosterSettingsModal is now used purely for:
- Adding/removing players from master roster
- Editing player details (names, numbers, notes)
- Setting player properties (goalkeeper status, jersey numbers)
- Managing the global player pool that teams are built from

Team-specific operations (team names, team rosters) are handled exclusively through:
- `TeamManagerModal.tsx` - Team CRUD operations
- `TeamRosterModal.tsx` - Team-specific roster management
- Game creation flows - Team selection and pre-population

## Recent Updates (December 2024)

### Checkbox Removal for Clear UX
**Problem**: RosterSettingsModal had dual functionality that created confusion with the new team system:
- Checkboxes controlled current game player selection
- This conflicted with team-based roster management
- Users were confused whether unchecking meant "remove from team" or "not available for this game"

**Solution**: Removed player selection checkboxes from RosterSettingsModal entirely.

#### Changes Made:
1. **Props Removed**:
   ```typescript
   // REMOVED from RosterSettingsModalProps:
   selectedPlayerIds: string[];
   onTogglePlayerSelection: (playerId: string) => void;
   ```

2. **UI Elements Removed**:
   - Player selection checkboxes
   - "Selected" counter from header
   - Checkbox column from player list

3. **Layout Simplified**:
   - Player rows now use full width without checkbox space
   - Header shows only "Total Players" count
   - Clean, focused interface for pure roster management

#### Separation of Concerns:
- **RosterSettingsModal**: Pure master roster CRUD (add/edit/delete players)
- **GameSettingsModal**: Current game player selection (has player checkboxes)
- **TeamRosterModal**: Team-specific roster management
- **NewGameSetupModal**: Initial game player selection

#### Benefits:
1. **Clear Purpose**: Each modal has a single, well-defined role
2. **No Confusion**: No ambiguity about what checking/unchecking does
3. **Flexible Game Management**: Guest players can be added via GameSettings without affecting team rosters
4. **Guest Player Stats**: Guest players added to games properly contribute to team statistics

#### Guest Player Handling:
When a coach adds a "guest" player to a game via GameSettingsModal:
- Guest player stats count toward team statistics (intended behavior)
- Guest players receive proper credit for their contributions
- No complex filtering or separate tracking needed

## Migration Impact
Existing games maintain their team names through the `teamId` association, not through the master roster modal. This change only affects the roster management interface, not data integrity.