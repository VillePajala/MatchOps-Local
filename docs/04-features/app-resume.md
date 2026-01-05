# App Resume System

**Status**: Implemented
**Last Updated**: January 5, 2026

## Overview

Handles app recovery when returning from background on mobile devices. Addresses blank screen issues on Android TWA and iOS Safari when the app is restored after extended periods.

## Key Components

- `useAppResume.ts` - Main app resume hook
- React Query cache invalidation
- Custom event dispatching for component recovery

## Problem Solved

Mobile browsers may freeze app state when backgrounded for extended periods. When restored:
- React state may be stale
- IndexedDB connections may be closed
- UI may appear blank or unresponsive

## Recovery Triggers

| Event | When | Action |
|-------|------|--------|
| `visibilitychange` | Tab becomes visible | Check background duration |
| `pageshow` (persisted) | bfcache restoration | Force refresh |
| `pagehide` (persisted) | Entering bfcache | Record timestamp |

## Configuration

```typescript
interface UseAppResumeOptions {
  onResume?: () => void;
  onBeforeForceReload?: () => void | Promise<void>;
  minBackgroundTime?: number;  // Default: 30000 (30s)
  forceReloadTime?: number;    // Default: 300000 (5min)
}
```

## Recovery Levels

### Soft Recovery (30s - 5min background)
1. Invalidate React Query caches
2. Dispatch `app-resume` custom event
3. Call `onResume` callback

### Force Reload (5min+ background)
1. Call `onBeforeForceReload` (show notification)
2. Execute `window.location.reload()`
3. If reload fails: fall back to soft recovery + dispatch `app-resume-reload-failed`

## Custom Events

Components can listen for recovery events:

```typescript
// App resume (soft recovery)
window.addEventListener('app-resume', (e) => {
  const { backgroundDuration, timestamp } = e.detail;
  // Handle recovery
});

// Reload failed (critical error)
window.addEventListener('app-resume-reload-failed', (e) => {
  const { error, backgroundDuration } = e.detail;
  // Show "Please close and reopen" message
});
```

## Edge Case Handling

- **Debouncing**: Rapid pageshow events (iOS gesture nav) debounced at 1s
- **Resume debouncing**: Prevents duplicate events from pageshow + visibilitychange race (100ms)
- **Reload guard**: Prevents duplicate reloads via `isReloadingRef`
- **bfcache**: Handles iOS Safari not firing visibilitychange on freeze/thaw

## PWA Considerations

- Works with Android TWA
- Handles iOS Safari bfcache
- Compatible with service worker lifecycle
- Error tracking via Sentry with `fatal` level for reload failures
