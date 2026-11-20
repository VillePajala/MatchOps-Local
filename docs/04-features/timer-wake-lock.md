# Timer & Wake Lock

**Status**: ✅ Implemented
**Last Updated**: 2026-11-20

## Overview

Precision game timer with screen wake lock to prevent device sleep during matches.

## Key Components

- `TimerOverlay.tsx` - Timer display UI
- `useGameTimer.ts` - Timer logic hook
- `usePrecisionTimer.ts` - High-precision timing
- `useWakeLock.ts` - Screen wake lock management
- `timerStateManager.ts` - Timer state persistence

## Timer Features

- **Precision Timing**: Millisecond-accurate game clock
- **Period Support**: Configurable periods (halves, quarters)
- **Pause/Resume**: Pause during stoppages
- **Background Persistence**: Timer continues when app backgrounded
- **State Recovery**: Resumes after app restart
- **Timer view layout**: Goal buttons ("Goal for us" / opponent goal) sit directly under start/pause; see [goal-log.md](./goal-log.md)
- **Sub interval**: "Vaihto tehty" ("Sub done") restarts the substitution-interval countdown without recording who came on; disabled while the clock is stopped and hidden in the basic app layout

## Wake Lock

Prevents device screen from turning off during games:
```typescript
// useWakeLock.ts
const wakeLock = await navigator.wakeLock.request('screen');
```

### Browser Support
- Chrome/Edge: Full support
- Safari: Partial support (iOS 16.4+)
- Firefox: Limited support

### Fallback
If Wake Lock API unavailable:
- The hook logs that it is unsupported; no prompt is shown
- Timer continues even if screen locks (elapsed time is recomputed from timestamps)

## Timer States

`gameStatus` in `useGameSessionReducer.ts`, plus a separate running/paused flag:

| State | Description |
|-------|-------------|
| `notStarted` | Game not started |
| `inProgress` | Period in play (clock running or paused) |
| `periodEnd` | Between periods |
| `gameEnd` | Game finished |

## Persistence

Timer state saved to IndexedDB:
- Current elapsed time
- Period number
- Timer state
- Recovered on app resume

## User Flow

1. Start game → Timer begins
2. Score/event → Timer continues
3. Stoppage → Pause timer
4. Half time → Period break
5. Full time → Timer stops

## PWA Considerations

- Works offline
- Survives app backgrounding
- Handles iOS Safari bfcache
- Android TWA compatible
