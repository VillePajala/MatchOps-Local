# Game Type Support (Soccer/Futsal)

**Status**: Phase 1 Complete
**Last Updated**: December 11, 2025

MatchOps supports both outdoor soccer and indoor futsal games, allowing coaches to track and filter their games by sport type.

---

## Overview

Finnish youth soccer seasons often include both outdoor soccer matches and indoor futsal games. The game type feature allows coaches to:

- Label each game as Soccer or Futsal
- Set season/tournament-level defaults
- Filter statistics by game type
- See visual indicators in game lists

## Current Features (Phase 1)

### Game Type Selection

Games can be labeled as either `soccer` or `futsal`:

| Location | Behavior |
|----------|----------|
| **NewGameSetupModal** | Select game type when creating new game |
| **GameSettingsModal** | Change game type for existing games |
| **SeasonDetailsModal** | Set default game type for season |
| **TournamentDetailsModal** | Set default game type for tournament |

### Inheritance & Defaults

- New games inherit the game type from their parent season/tournament
- If no parent or parent has no default, games default to `soccer`
- Legacy games (created before this feature) are treated as `soccer`

### Visual Indicators

- Futsal games display a badge/indicator in game lists
- Filter controls in stats views allow viewing soccer-only, futsal-only, or all games

### Data Model

```typescript
// src/types/game.ts
export type GameType = 'soccer' | 'futsal';

// On Game, Season, Tournament interfaces
gameType?: GameType;  // Optional for backward compatibility
```

## Planned Features (Phase 2)

Future enhancements that may be implemented based on user feedback:

### Futsal Field Visualization
- Smaller court with futsal-specific markings
- Different aspect ratio (40m x 20m vs 105m x 68m)
- Futsal goal dimensions

### Default Formations
- Soccer: 11 players (4-4-2, 4-3-3, etc.)
- Futsal: 5 players (1-2-2, 2-2, etc.)

### Futsal-Specific Features
- Futsal-specific tactical overlays
- Flying substitution tracking
- Accumulated fouls per half

## Technical Details

### Backward Compatibility

- `gameType` field is optional on all interfaces
- Missing `gameType` defaults to `'soccer'` in filtering logic
- No data migration required - existing games continue to work

### Files Modified

| File | Purpose |
|------|---------|
| `src/types/game.ts` | GameType type definition |
| `src/types/index.ts` | GameType on Season, Tournament interfaces |
| `src/components/NewGameSetupModal.tsx` | Game type selector |
| `src/components/GameSettingsModal.tsx` | Game type editor |
| `src/components/SeasonDetailsModal.tsx` | Season default |
| `src/components/TournamentDetailsModal.tsx` | Tournament default |

### Translations

Both English and Finnish translations are provided:

```
gameType.label: "Game Type" / "Pelityyppi"
gameType.soccer: "Soccer" / "Jalkapallo"
gameType.futsal: "Futsal" / "Futsal"
```

## Related Documents

- [UNIFIED-ROADMAP.md](../03-active-plans/UNIFIED-ROADMAP.md) - Priority 4 item
- [seasons-tournaments.md](./seasons-tournaments.md) - Season/tournament organization
