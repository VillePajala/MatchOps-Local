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
 * - Long background periods that may corrupt app state
 *
 * Recovery mechanisms:
 * - Invalidates React Query caches to force data refetch
 * - Calls custom onResume callback for app-specific recovery
 * - Dispatches custom 'app-resume' event for components to handle recovery
 * - Forces page reload for very long background periods (5+ minutes)
 */
import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import logger from '@/utils/logger';

interface UseAppResumeOptions {
  /** Callback when app resumes from background */
  onResume?: () => void;
  /** Minimum time in background (ms) before triggering refresh. Default: 30000 (30 seconds) */
  minBackgroundTime?: number;
  /** Time in background (ms) after which to force a full page reload. Default: 300000 (5 minutes) */
  forceReloadTime?: number;
}

// Debounce rapid pageshow events (iOS Safari gesture navigation edge case)
const PAGESHOW_DEBOUNCE_MS = 1000;

export function useAppResume(options: UseAppResumeOptions = {}) {
  const { onResume, minBackgroundTime = 30000, forceReloadTime = 300000 } = options;
  const queryClient = useQueryClient();
  const backgroundStartRef = useRef<number | null>(null);
  const lastPageShowRef = useRef<number>(0);

  /**
   * Dispatch a custom event that components can listen to for recovery
   * This allows components to perform their own cleanup/refresh logic
   */
  const dispatchResumeEvent = useCallback((backgroundDuration: number) => {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('app-resume', {
        detail: { backgroundDuration, timestamp: Date.now() }
      });
      window.dispatchEvent(event);
    }
  }, []);

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

      // For very long background periods, force a full page reload
      // This handles cases where app state may have become corrupted
      if (backgroundDuration > forceReloadTime) {
        logger.log(
          '[useAppResume] App was in background for',
          Math.round(backgroundDuration / 1000),
          'seconds - forcing page reload for recovery'
        );
        // Clear backgroundStartRef before reload to prevent any race conditions
        backgroundStartRef.current = null;
        window.location.reload();
        return;
      }

      // Strict inequality: refresh only if duration exceeds threshold (not at exactly threshold)
      if (backgroundDuration > minBackgroundTime) {
        logger.log(
          '[useAppResume] App resumed after',
          Math.round(backgroundDuration / 1000),
          'seconds - triggering refresh'
        );

        // Invalidate all React Query caches to force refetch
        queryClient.invalidateQueries();

        // Dispatch custom event for component-level recovery
        dispatchResumeEvent(backgroundDuration);

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
  }, [queryClient, onResume, minBackgroundTime, forceReloadTime, dispatchResumeEvent]);

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

        // Check if we were in background for a very long time
        const backgroundDuration = backgroundStartRef.current
          ? now - backgroundStartRef.current
          : 0;

        if (backgroundDuration > forceReloadTime) {
          logger.log(
            '[useAppResume] bfcache restore after',
            Math.round(backgroundDuration / 1000),
            'seconds - forcing page reload'
          );
          backgroundStartRef.current = null;
          window.location.reload();
          return;
        }

        logger.log('[useAppResume] Page restored from bfcache - triggering refresh');
        // Safe even if visibilitychange also fires - invalidateQueries is idempotent.
        // The null guard on backgroundStartRef prevents onResume from double-firing.
        queryClient.invalidateQueries();

        // Dispatch custom event for component-level recovery
        dispatchResumeEvent(backgroundDuration);

        onResume?.();

        // Reset background start to prevent visibilitychange from double-triggering
        // (pageshow often fires before visibilitychange on iOS Safari)
        backgroundStartRef.current = null;
      }
    },
    [queryClient, onResume, forceReloadTime, dispatchResumeEvent]
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
