# First Game Onboarding

## Overview
Guides first-time users on the field using a center overlay and a top warning banner for the temporary workspace. The overlay now provides dynamic feedback based on existing teams and seasons/tournaments.

## Center Overlay
Shown when:
```js
currentGameId === DEFAULT_GAME_ID &&
playersOnField.length === 0 &&
drawings.length === 0 &&
!hasUsedWorkspace
```

Content:
- **No players** → CTA to open Roster modal
- **Has players** → Three action buttons:
  1. **Create First Game** - Primary action (indigo button)
  2. **Team Management** - Dynamic button:
     - If no teams exist: "Create First Team" (bright emerald)
     - If teams exist: "Manage Teams" (dimmed slate with border)
  3. **Seasons/Tournaments** - Dynamic button:
     - If none exist: "Create Season/Tournament First" (slate)
     - If exist: "Manage Seasons & Tournaments" (dimmed slate)

## Dynamic Button Behavior
The overlay buttons now provide visual feedback about existing content:

### Team Button Logic
```js
teams.length > 0 
  ? { text: 'Manage Teams', style: 'dimmed slate' }
  : { text: 'Create First Team', style: 'bright emerald' }
```

### Seasons/Tournaments Button Logic
```js
(seasons.length > 0 || tournaments.length > 0)
  ? { text: 'Manage Seasons & Tournaments', style: 'dimmed slate' }
  : { text: 'Create Season/Tournament First', style: 'darker slate' }
```

## Workspace Warning Banner
Shown when:
```js
currentGameId === DEFAULT_GAME_ID && (
  playersOnField.length > 0 || drawings.length > 0 || hasUsedWorkspace
)
```

## Files
- Overlay and banner logic live in `src/components/HomePage.tsx` (around line 2700+)

## Fresh Installation Behavior
- New users see bright "Create First..." buttons
- After creating teams/seasons, buttons automatically become dimmed "Manage..." variants
- No automatic team creation on fresh installations (fixed migration issue)

## i18n
- `firstGame.title`, `firstGame.desc`, `firstGame.titleNoPlayers`, `firstGame.descNoPlayers`, `firstGame.setupRoster`, `firstGame.createGame`, `firstGame.createSeasonFirst`, `firstGame.workspaceWarning`, `firstGame.createRealGame`
- **New keys**: `firstGame.manageTeams`, `firstGame.manageSeasonsAndTournaments`, `firstGame.createTeam`
