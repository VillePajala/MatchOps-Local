/**
 * Hook to handle app resume from background
 *
 * Triggers state refresh when app returns to foreground after extended periods.
 * Addresses blank screen issues on Android TWA and iOS Safari when app is restored from background.
 *
 * Handles:
 * - visibilitychange events (standard browser API)
 * - pageshow events with persisted flag (bfcache restoration)
 * - pagehide events with persisted flag (iOS Safari bfcache entry - may not fire visibilitychange)
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

// Debounce rapid pageshow events (iOS Safari gesture navigation edge case)
const PAGESHOW_DEBOUNCE_MS = 1000;

export function useAppResume(options: UseAppResumeOptions = {}) {
  const { onResume, minBackgroundTime = 30000 } = options;
  const queryClient = useQueryClient();
  const backgroundStartRef = useRef<number | null>(null);
  const lastPageShowRef = useRef<number>(0);

  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      // Going to background - record timestamp
      backgroundStartRef.current = Date.now();
      logger.debug('[useAppResume] App going to background');
    } else {
      // Returning to foreground
      // Skip if backgroundStartRef is null (pageshow already handled this resume)
      if (backgroundStartRef.current === null) {
        logger.debug('[useAppResume] visibilitychange skipped - already handled by pageshow');
        return;
      }

      const backgroundDuration = Date.now() - backgroundStartRef.current;

      // Strict inequality: refresh only if duration exceeds threshold (not at exactly threshold)
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

  // Handle pageshow for bfcache restoration (Android TWA, iOS Safari)
  const handlePageShow = useCallback(
    (event: PageTransitionEvent) => {
      if (event.persisted) {
        // Debounce rapid pageshow events (iOS Safari gesture navigation)
        const now = Date.now();
        if (now - lastPageShowRef.current < PAGESHOW_DEBOUNCE_MS) {
          logger.debug('[useAppResume] Debouncing rapid pageshow event');
          return;
        }
        lastPageShowRef.current = now;

        logger.log('[useAppResume] Page restored from bfcache - triggering refresh');
        queryClient.invalidateQueries();
        onResume?.();

        // Reset background start to prevent visibilitychange from double-triggering
        // (pageshow often fires before visibilitychange on iOS Safari)
        backgroundStartRef.current = null;
      }
    },
    [queryClient, onResume]
  );

  // Handle pagehide for iOS Safari bfcache entry
  // iOS Safari may not fire visibilitychange on freeze/thaw, but pagehide with
  // persisted=true reliably indicates entry into bfcache
  const handlePageHide = useCallback((event: PageTransitionEvent) => {
    if (event.persisted) {
      backgroundStartRef.current = Date.now();
      logger.debug('[useAppResume] Page entering bfcache (pagehide)');
    }
  }, []);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [handleVisibilityChange, handlePageShow, handlePageHide]);
}
