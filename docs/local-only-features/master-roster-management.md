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

## Migration Impact
Existing games maintain their team names through the `teamId` association, not through the master roster modal. This change only affects the roster management interface, not data integrity.