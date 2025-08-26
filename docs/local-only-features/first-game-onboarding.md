# First Game Onboarding

## Overview
Guides first-time users on the field using a center overlay and a top warning banner for the temporary workspace.

## Center Overlay
Shown when:
```js
currentGameId === DEFAULT_GAME_ID &&
playersOnField.length === 0 &&
drawings.length === 0 &&
!hasUsedWorkspace
```

Content:
- No players → CTA to open Roster modal
- Has players → CTA to open New Game setup; optional CTA to Seasons/Tournaments

## Workspace Warning Banner
Shown when:
```js
currentGameId === DEFAULT_GAME_ID && (
  playersOnField.length > 0 || drawings.length > 0 || hasUsedWorkspace
)
```

## Files
- Overlay and banner logic live in `src/components/HomePage.tsx`.

## i18n
- `firstGame.title`, `firstGame.desc`, `firstGame.titleNoPlayers`, `firstGame.descNoPlayers`, `firstGame.setupRoster`, `firstGame.createGame`, `firstGame.createSeasonFirst`, `firstGame.workspaceWarning`, `firstGame.createRealGame`
