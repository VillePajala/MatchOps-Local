# Goal Log

**Status**: ✅ Implemented
**Last Updated**: 2026-11-20

## Overview

Detailed logging and editing of goals and game events. Track scorers, assist providers, and goal types.

## Key Components

- `TimerOverlay.tsx` - "Goal for us" and opponent-goal buttons, directly under start/pause
- `QuickGoalSheet.tsx` - Optional "who scored / who assisted" sheet shown after a goal is logged (onboarding v3, D16)
- `GoalLogModal.tsx` - Full goal form
- `GameStatsModal` goal editor - Edit or delete logged goals afterwards

## Goal Event Data

Goals are `GameEvent`s (`src/types/game.ts`):

```typescript
interface GameEvent {
  id: string;
  type: GameEventType; // 'goal' (ours) | 'opponentGoal' | 'substitution' | 'periodEnd' | 'gameEnd' | 'fairPlayCard' | 'note'
  time: number;        // game clock, seconds
  scorerId?: string;   // absent = unknown scorer (counts for the team, no player)
  assisterId?: string;
  // ...note/card-only fields
}
```

There is no goal-type field (penalty, free kick, own goal).

## Features

- **One-tap goal**: "Goal for us" logs the goal and moves the score immediately
- **Optional attribution**: The quick sheet asks for the scorer, then the assister; both can be skipped
- **Opponent goals**: Separate button, confirmed before logging
- **Edit History**: Modify or delete past goals
- **Undo Support**: Undoing the goal also closes the quick sheet

## User Flow

### During Game
1. Tap "Goal for us" on the timer view - goal logged with the clock time
2. Optionally pick the scorer, then the assister (players in this game's squad), or skip
3. For the opponent, tap the opponent-goal button and confirm

### Editing
1. Open the game's stats (GameStatsModal)
2. Edit a goal's time, scorer or assister, or delete it
3. Changes saved immediately

## Statistics Integration

- Goal totals shown in Game Stats
- Scorer/assister stats aggregated
- Period-by-period breakdown available
