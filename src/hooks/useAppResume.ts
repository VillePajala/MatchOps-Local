/**
 * Hook to handle app resume from background
 *
 * Triggers state refresh when app returns to foreground after extended periods.
 * Addresses blank screen issues on Android TWA when app is restored from background.
 *
 * Handles:
 * - visibilitychange events (standard browser API)
 * - pageshow events with persisted flag (bfcache restoration, common on Android TWA)
 */
import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import logger from '@/utils/logger';

interface UseAppResumeOptions {
  /** Callback when app resumes from background */
  onResume?: () => void;
  /** Minimum time in background (ms) before triggering refresh. Default: 30000 (30 seconds) */
  minBackgroundTime?: number;
}

export function useAppResume(options: UseAppResumeOptions = {}) {
  const { onResume, minBackgroundTime = 30000 } = options;
  const queryClient = useQueryClient();
  const backgroundStartRef = useRef<number | null>(null);

  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      // Going to background - record timestamp
      backgroundStartRef.current = Date.now();
      logger.debug('[useAppResume] App going to background');
    } else {
      // Returning to foreground
      const backgroundDuration = backgroundStartRef.current
        ? Date.now() - backgroundStartRef.current
        : 0;

      if (backgroundDuration > minBackgroundTime) {
        logger.log(
          '[useAppResume] App resumed after',
          Math.round(backgroundDuration / 1000),
          'seconds - triggering refresh'
        );

        // Invalidate all React Query caches to force refetch
        queryClient.invalidateQueries();

        // Call custom resume handler
        onResume?.();
      } else {
        logger.debug(
          '[useAppResume] App resumed after',
          Math.round(backgroundDuration / 1000),
          'seconds - no refresh needed'
        );
      }

      backgroundStartRef.current = null;
    }
  }, [queryClient, onResume, minBackgroundTime]);

  // Handle pageshow for bfcache restoration (Android TWA specific)
  const handlePageShow = useCallback(
    (event: PageTransitionEvent) => {
      if (event.persisted) {
        logger.log('[useAppResume] Page restored from bfcache - triggering refresh');
        queryClient.invalidateQueries();
        onResume?.();
      }
    },
    [queryClient, onResume]
  );

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [handleVisibilityChange, handlePageShow]);
}
