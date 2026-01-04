# Plan: Fix Blank Screen on TWA Resume from Background

## Problem
When the Android TWA (Play Store installed PWA) returns from background after extended periods, users see:
- Blank screen requiring force-close and restart
- Green soccer field with no players/UI content

## Root Cause
The app only handles visibility change for the **timer**. When the app resumes:
- Game data is not refreshed
- React Query cache may be stale
- No mechanism triggers re-initialization
- ErrorBoundary has no recovery on resume

## Solution: Create `useAppResume` Hook

A centralized hook that handles app lifecycle events and triggers recovery.

---

## Files to Create/Modify

### 1. Create: `src/hooks/useAppResume.ts` (NEW)

```typescript
/**
 * Hook to handle app resume from background
 * Triggers state refresh when app returns to foreground
 */
import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import logger from '@/utils/logger';

interface UseAppResumeOptions {
  onResume?: () => void;
  minBackgroundTime?: number; // ms before triggering refresh (default 30s)
}

export function useAppResume(options: UseAppResumeOptions = {}) {
  const { onResume, minBackgroundTime = 30000 } = options;
  const queryClient = useQueryClient();
  const backgroundStartRef = useRef<number | null>(null);

  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      // Going to background - record timestamp
      backgroundStartRef.current = Date.now();
    } else {
      // Returning to foreground
      const backgroundDuration = backgroundStartRef.current
        ? Date.now() - backgroundStartRef.current
        : 0;

      if (backgroundDuration > minBackgroundTime) {
        logger.log('[useAppResume] App resumed after', backgroundDuration, 'ms - triggering refresh');

        // Invalidate all React Query caches to force refetch
        queryClient.invalidateQueries();

        // Call custom resume handler
        onResume?.();
      }

      backgroundStartRef.current = null;
    }
  }, [queryClient, onResume, minBackgroundTime]);

  // Handle pageshow for bfcache restoration (Android TWA specific)
  const handlePageShow = useCallback((event: PageTransitionEvent) => {
    if (event.persisted) {
      logger.log('[useAppResume] Page restored from bfcache - triggering refresh');
      queryClient.invalidateQueries();
      onResume?.();
    }
  }, [queryClient, onResume]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [handleVisibilityChange, handlePageShow]);
}
```

### 2. Modify: `src/app/page.tsx`

Add the hook to trigger `checkAppState()` on resume:

```typescript
// Add import
import { useAppResume } from '@/hooks/useAppResume';

// Inside Home component, add:
useAppResume({
  onResume: () => {
    setRefreshTrigger(prev => prev + 1);
  },
  minBackgroundTime: 30000, // 30 seconds
});
```

**Location:** After the existing `useEffect` for `checkAppState` (~line 80)

### 3. Modify: `src/components/ErrorBoundary.tsx`

Add visibility change handler to auto-recover:

```typescript
// Add to componentDidMount:
componentDidMount() {
  this.handleVisibilityChange = () => {
    if (!document.hidden && this.state.hasError) {
      // Auto-reset error state when app becomes visible
      this.setState({ hasError: false, error: null });
    }
  };
  document.addEventListener('visibilitychange', this.handleVisibilityChange);
}

componentWillUnmount() {
  if (this.handleVisibilityChange) {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }
}
```

---

## Implementation Order

1. Create `src/hooks/useAppResume.ts`
2. Add hook to `src/app/page.tsx`
3. Enhance `src/components/ErrorBoundary.tsx`
4. Test build and existing tests pass
5. Manual testing on Android TWA

## Testing Strategy

Since we can't access Android logs:
- Test in Chrome DevTools with manual visibility toggle
- Test with Chrome's "Performance" tab throttling
- Use `document.hidden = true` simulation in console
- Deploy to Vercel preview and test on actual Android device

## Risk Assessment

- **Low risk**: Changes are additive, don't modify existing state logic
- **Isolated**: New hook is opt-in, only used in page.tsx
- **Reversible**: Easy to remove if issues arise
