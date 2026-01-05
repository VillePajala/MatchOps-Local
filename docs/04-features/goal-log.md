# Goal Log

**Status**: ✅ Implemented
**Last Updated**: January 5, 2026

## Overview

Detailed logging and editing of goals and game events. Track scorers, assist providers, and goal types.

## Key Components

- `GoalLogModal.tsx` - View and edit goal history
- Game state event tracking

## Goal Event Data

```typescript
interface GoalEvent {
  id: string;
  type: 'goal';
  timestamp: number;
  period: number;
  scoringTeam: 'home' | 'away';
  scorerId?: string;    // Player who scored
  assistId?: string;    // Player who assisted
  goalType?: 'open_play' | 'penalty' | 'free_kick' | 'own_goal';
}
```

## Features

- **Goal Recording**: Quick-tap goal logging during games
- **Player Attribution**: Select scorer and assister
- **Goal Types**: Categorize by play type
- **Edit History**: Modify or delete past events
- **Undo Support**: Undo accidental entries

## Goal Types

| Type | Description |
|------|-------------|
| Open Play | Regular goal from open play |
| Penalty | Penalty kick conversion |
| Free Kick | Direct free kick goal |
| Own Goal | Own goal (credited to opponent) |

## User Flow

### During Game
1. Tap score button when goal scored
2. Select scoring team
3. Optionally select scorer
4. Optionally select assister
5. Goal logged with timestamp

### Editing
1. Open Goal Log from Game Stats
2. View all events chronologically
3. Tap event to edit
4. Modify details or delete
5. Changes saved immediately

## Statistics Integration

- Goal totals shown in Game Stats
- Scorer/assister stats aggregated
- Period-by-period breakdown available
