# Auto-Save System

**Status**: Implemented
**Last Updated**: January 5, 2026

## Overview

Smart auto-save with tiered debouncing for different state change types. Critical game data saves instantly while less critical data uses delayed saves to reduce storage operations.

## Key Components

- `useAutoSave.ts` - Main auto-save hook with tiered delays
- React Query integration for cache management
- IndexedDB persistence via DataStore

## Save Tiers

| Tier | Delay | Use Case | Examples |
|------|-------|----------|----------|
| Immediate | 0ms | Critical game data | Goals, scores, game events |
| Short | 500ms | User-visible metadata | Team names, player notes |
| Long | 2000ms | Tactical data | Field positions, drawings |

## Configuration

```typescript
interface UseAutoSaveConfig {
  immediate?: StateGroup;  // 0ms delay
  short?: StateGroup;      // 500ms delay
  long?: StateGroup;       // 2000ms delay
  saveFunction: () => void | Promise<void>;
  enabled: boolean;
  currentGameId: string | null;
}

interface StateGroup {
  states: Record<string, unknown>;
  delay: number;
}
```

## Implementation Details

### State Change Detection
- Uses JSON serialization for deep equality comparison
- Typical state sizes: 5-10KB per tier
- Performance: ~0.1-0.5ms for 20KB serialization

### Debouncing
- Each tier has independent debounce timers
- New changes reset the timer (coalesces rapid changes)
- Saves cancelled when `enabled` becomes false

### Retry Logic
Transient errors retry with exponential backoff:
- Attempt 1: immediate
- Attempt 2: after 1s
- Attempt 3: after 2s
- Attempt 4: after 4s

Transient errors include:
- Quota exceeded (temporary)
- IndexedDB locked
- Timeout/network errors
- AbortError

### Error Handling
- Non-transient errors thrown immediately
- Failed saves logged to Sentry
- App continues running even if save fails

## Usage Example

```typescript
useAutoSave({
  immediate: {
    states: { gameEvents, homeScore, awayScore },
    delay: 0
  },
  short: {
    states: { teamName, opponentName },
    delay: 500
  },
  long: {
    states: { playersOnField, drawings },
    delay: 2000
  },
  saveFunction: handleQuickSaveGame,
  enabled: currentGameId !== DEFAULT_GAME_ID,
  currentGameId
});
```

## Behavior Notes

- Auto-save disabled for unsaved games (DEFAULT_GAME_ID)
- Saves paused when modals are open
- Cleanup on unmount clears pending timers
- Uses ref pattern to avoid stale closures
