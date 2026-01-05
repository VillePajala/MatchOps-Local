# Game Import

**Status**: ✅ Implemented
**Last Updated**: January 5, 2026

## Overview

Import game data from JSON exports, enabling data sharing between coaches and device migration.

## Key Components

- `ImportResultsModal.tsx` - Import results display
- `gameImport.ts` - Import logic
- `gameImportHelper.ts` - Helper utilities
- `useGameImport.ts` - Hook for import handling

## Import Format

Accepts JSON files with game data structure:
```json
{
  "games": {
    "game_123": {
      "gameId": "game_123",
      "homeTeam": "Team A",
      "awayTeam": "Team B",
      "homeScore": 2,
      "awayScore": 1,
      ...
    }
  }
}
```

## Import Process

1. User selects JSON file
2. System validates format and structure
3. Duplicate detection by game ID
4. User confirms import
5. Games added to saved games
6. Results modal shows imported count

## Conflict Handling

- **Duplicate Games**: Skip or overwrite option
- **Missing Fields**: Defaults applied
- **Invalid Data**: Skipped with warning

## User Flow

1. Go to Load Game → Import
2. Select JSON file
3. Review import preview
4. Confirm import
5. View results summary

## Use Cases

- Import games from another coach
- Restore from partial backup
- Migrate from external tracking tools
