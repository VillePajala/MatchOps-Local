# First Game Onboarding

## Overview
Comprehensive onboarding system with three layers:
1. **Center Overlay** - Initial setup guidance on the default workspace
2. **Top Warning Banner** - Temporary workspace alerts 
3. **First Game Interface Guide** - Tutorial overlay for actual game interface

The system now provides dynamic feedback based on existing teams and seasons/tournaments.

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

## First Game Interface Guide
New overlay that appears when users enter their first real game to explain the interface.

### When Shown
```js
!hasSeenFirstGameGuide && 
currentGameId !== DEFAULT_GAME_ID && 
playersOnField.length === 0 &&
initialLoadComplete
```

### Content Structure
**Pre-Game Setup (Steps 1-5):**
- Player Selection (top bar): tap discs, yellow borders, goalie setup
- Field: drag players, double-tap removal, tactical drawings
- Formation planning and player positioning

**During Game (Steps 6-7):**
- Tactical view and settings access
- Game clock and event recording

**Key Features:**
- Compact overlay design (max-h-[85vh] with scroll)
- Accurate icon representations: [▣] [⚽] [🕐] [≡]
- Covers tactical view, game settings, opponent discs
- One-time display with localStorage persistence

### Files
- Guide content in `src/components/HomePage.tsx` (around line 2785+)
- Styling uses compact spacing to prevent overflow behind control bar

## Instructions Modal Improvements (December 2024)

### Comprehensive 7-Step Guide
The InstructionsModal (`src/components/InstructionsModal.tsx`) has been significantly expanded to provide a complete workflow guide based on the first game tutorial content.

#### Sections Added:
1. **Player Selection** - Selecting players, setting goalies, placing on field
2. **The Field** - Drag controls, double-tap removal, tactical drawing
3. **Tactical View** - Formation mode, tactical positioning
4. **Game Controls** - Timer, goal logging, game flow
5. **Menu Navigation** - Settings access, data management
6. **Data Management** - Import/export, backups, statistics
7. **Teams & Organization** - Team creation, season management

#### Key Features:
- **Consistent Icons**: Uses same HeroIcons as the actual interface
- **Visual Cues**: Color-coded icons matching UI (purple, red, amber, etc.)
- **Comprehensive Coverage**: From basic player selection to advanced data management
- **Full-Screen Design**: Utilizes entire screen space with proper scroll handling
- **Professional Styling**: Matches app's visual design with gradients and effects

#### Content Structure:
Each section includes:
- **Clear Headings**: Yellow-tinted section titles
- **Bullet Points**: Easy-to-scan instruction lists
- **Icon Integration**: Inline icons showing which buttons to use
- **Contextual Tips**: Practical advice for real game situations

#### Files Updated:
- `src/components/InstructionsModal.tsx` - Main component expansion
- Translation files - New instruction content keys
- UI consistent with `firstGameGuide.*` translation structure

## i18n
- `firstGame.*` - Center overlay and banner
- `firstGameGuide.*` - Interface tutorial content including:
  - `playerSelection`, `theField`, `tacticalView`, `quickActions`
  - `tapToSelect`, `goalieInstructions`, `tacticalViewDesc`
  - `placeAllDesc`, `logGoalDesc`, `timerDesc`, `menuDesc`
- **Team Management**: `firstGame.manageTeams`, `firstGame.createTeam`
- **Seasons**: `firstGame.manageSeasonsAndTournaments`
- **Instructions Modal**: Expanded content using same `firstGameGuide.*` keys
