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
 * - Forces page reload for very long background periods (60+ minutes, see
 *   FORCE_RELOAD_AFTER_BACKGROUND_MS)
 *
 * Error handling:
 * - If page reload fails (rare), logs to Sentry with 'fatal' level
 * - Dispatches 'app-resume-reload-failed' event so UI can show "Please close and reopen" message
 * - Falls back to soft recovery as last resort (may not work for corrupted state)
 */
import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';
import logger from '@/utils/logger';
import { isMatchLive } from '@/utils/matchTimerSignal';
import { isRecordingSessionActive } from '@/utils/recordingSessionSignal';
import { hasUnsavedInput } from '@/utils/unsavedInputSignal';

/**
 * Background time after which a return reloads the whole page (when it is safe to).
 *
 * Was 5 minutes. The reload came in for Android TWA / iOS returns that showed a black
 * screen or an empty field (Dec 2025). Every part of that recovery now also runs on
 * the soft path a return takes below this threshold: the field redraws itself
 * (SoccerField: visibilitychange / pageshow / 'app-resume'), React Query refetches,
 * page.tsx re-checks the start state in the background and pulls cloud changes after
 * CLOUD_PULL_AFTER_BACKGROUND_MS, the sync engine resumes ('app-resume'), the
 * Supabase client refreshes an expired token on its own when the page becomes
 * visible, and the match clock re-anchors to wall time (useGameTimer). A reload after
 * 5-60 minutes therefore only cost the coach a cold start (loading screen, sign-in
 * restore, launch pull) each time they came back from another app. After an hour the
 * reload stays, as the safety net for a WebView left in a state the soft path cannot
 * repair. An OS that killed the app in between starts it cold anyway.
 */
export const FORCE_RELOAD_AFTER_BACKGROUND_MS = 60 * 60 * 1000;

/**
 * Background time after which a return also pulls cloud changes (page.tsx). The old
 * reload threshold: before, such a return reloaded and so ran the launch pull - sync
 * is push-only, so without this pull another device's edits would not show until the
 * next cold start.
 */
export const CLOUD_PULL_AFTER_BACKGROUND_MS = 5 * 60 * 1000;

/** What page.tsx knows when the app returns, for shouldPullCloudOnResume. */
export interface ResumeCloudPullState {
  mode: 'local' | 'cloud';
  isAuthenticated: boolean;
  userId: string | undefined;
  /** The launch's post-login check has completed (the app is past its loading screen). */
  postLoginCheckComplete: boolean;
  /** The match view is mounted. */
  matchOpen: boolean;
  /** This account's data is on the device (migration flag) - else usePendingCloudPull owns the pull. */
  migrationDone: boolean;
  /** A background pull is already running. */
  pullRunning: boolean;
}

/**
 * Whether a return from the background pulls cloud changes (page.tsx handleAppResume).
 *
 * After CLOUD_PULL_AFTER_BACKGROUND_MS - the old reload threshold, so such a return
 * still gets the pull the reload's launch used to run - for a signed-in cloud account
 * past its launch checks, when:
 * - no match is open: the launch-pull gate would unmount it, and the pull would rewrite
 *   the game it holds in memory (a save from that outdated copy is refused by the sync's
 *   version check, review 3.7, and the newer copy shows the next time it is opened);
 * - a reload would have been allowed (mayReplaceScreenOnResume: no live match,
 *   recording or typed input, not offline);
 * - this account's data is already on the device, and no pull is running.
 */
export function shouldPullCloudOnResume(backgroundDuration: number, state: ResumeCloudPullState): boolean {
  if (backgroundDuration <= CLOUD_PULL_AFTER_BACKGROUND_MS) return false;
  if (state.mode !== 'cloud' || !state.isAuthenticated || !state.userId || !state.postLoginCheckComplete) return false;
  if (state.matchOpen || !state.migrationDone || state.pullRunning) return false;
  return mayReplaceScreenOnResume();
}

interface UseAppResumeOptions {
  /** Callback when app resumes from background, with how long it was away (ms) */
  onResume?: (backgroundDuration: number) => void;
  /** Callback before force reload - can be used to show notification. Return Promise to delay reload. */
  onBeforeForceReload?: () => void | Promise<void>;
  /** Minimum time in background (ms) before triggering refresh. Default: 30000 (30 seconds) */
  minBackgroundTime?: number;
  /** Time in background (ms) after which to force a full page reload. Default: FORCE_RELOAD_AFTER_BACKGROUND_MS (60 minutes) */
  forceReloadTime?: number;
}

// Debounce rapid pageshow events (iOS Safari gesture navigation edge case)
const PAGESHOW_DEBOUNCE_MS = 1000;
// Debounce app-resume events across handlers (prevents duplicate events from pageshow + visibilitychange race)
const RESUME_DEBOUNCE_MS = 100;

/** True only when the browser is sure there is no connection (onLine === false).
 *  onLine === true doesn't prove reachability, so it never blocks anything here. */
function isDeviceOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Whether a return from the background may replace what the coach has on screen (a
 * reload, or a cloud pull that rewrites the stored data): never during a live match
 * (the wall-clock timer re-anchors itself on foreground, and a reload would drop the
 * user to the start screen with a paused clock), a voice recording, or a form with
 * typed input (review 7.1), and never offline (nothing new can be fetched, and in
 * cloud mode a reload restarts a sign-in that cannot finish without signal).
 */
export function mayReplaceScreenOnResume(): boolean {
  return !isMatchLive() && !isRecordingSessionActive() && !hasUnsavedInput() && !isDeviceOffline();
}

export function useAppResume(options: UseAppResumeOptions = {}) {
  const { onResume, onBeforeForceReload, minBackgroundTime = 30000, forceReloadTime = FORCE_RELOAD_AFTER_BACKGROUND_MS } = options;
  const queryClient = useQueryClient();
  const backgroundStartRef = useRef<number | null>(null);
  const lastPageShowRef = useRef<number>(0);
  const lastResumeTimestampRef = useRef<number>(0);
  const isReloadingRef = useRef<boolean>(false);

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

  /**
   * Trigger resume with debounce protection across handlers
   * Prevents duplicate app-resume events when pageshow and visibilitychange fire in quick succession
   */
  const triggerResumeWithDebounce = useCallback((backgroundDuration: number) => {
    const now = Date.now();
    if (now - lastResumeTimestampRef.current < RESUME_DEBOUNCE_MS) {
      logger.debug('[useAppResume] Debouncing duplicate resume event');
      return;
    }
    lastResumeTimestampRef.current = now;

    dispatchResumeEvent(backgroundDuration);
    onResume?.(backgroundDuration);
  }, [dispatchResumeEvent, onResume]);

  /**
   * Dispatch event when reload fails - allows UI to show error message
   * Components can listen to this to display "Please close and reopen the app" message
   */
  const dispatchReloadFailedEvent = useCallback((error: unknown, backgroundDuration: number) => {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('app-resume-reload-failed', {
        detail: {
          error: error instanceof Error ? error.message : String(error),
          backgroundDuration,
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(event);
    }
  }, []);

  /**
   * Force reload with notification and error handling
   * Shared function to eliminate duplication between visibilitychange and pageshow handlers
   */
  const forceReloadWithNotification = useCallback(
    (backgroundDuration: number, trigger: 'visibilitychange' | 'pageshow_bfcache') => {
      // Guard against duplicate reloads - reload() is async and other handlers may fire
      if (isReloadingRef.current) return;
      isReloadingRef.current = true;

      logger.debug(
        `[useAppResume] ${trigger === 'pageshow_bfcache' ? 'bfcache restore' : 'App was in background'} for`,
        Math.round(backgroundDuration / 1000),
        'seconds - forcing page reload'
      );
      backgroundStartRef.current = null;

      // Execute reload with proper error handling
      (async () => {
        try {
          // Call optional callback (e.g., to show toast notification)
          await onBeforeForceReload?.();
          // Re-check after the notice (review 4.24): a match may have gone live
          // during it (the coach tapped Start on returning). Reloading now would
          // throw that start away - refresh in place instead. Same for a form the
          // coach opened during the notice (review 7.1).
          const cancelCause = isMatchLive()
            ? 'a match went live'
            : isRecordingSessionActive()
              ? 'a recording started'
              : hasUnsavedInput()
                ? 'a form was opened'
                : null;
          if (cancelCause) {
            logger.info(`[useAppResume] Reload cancelled: ${cancelCause} during the notice`);
            isReloadingRef.current = false;
            queryClient.invalidateQueries();
            dispatchResumeEvent(backgroundDuration);
            onResume?.(backgroundDuration);
            return;
          }
          // Note: Tests should mock window.location.reload to verify this code path
          window.location.reload();
        } catch (error) {
          // This is rare but critical - log to Sentry with high severity
          logger.error('[useAppResume] Failed to reload page:', error);
          try {
            Sentry.captureException(error, {
              level: 'fatal',
              tags: {
                component: 'useAppResume',
                action: 'force_reload_failed',
                backgroundDuration: String(backgroundDuration)
              },
              extra: {
                backgroundDurationMs: backgroundDuration,
                trigger
              }
            });
          } catch {
            // Sentry failure must not affect resume error handling
          }

          isReloadingRef.current = false;

          // Dispatch event so UI can show "Please close and reopen the app" message
          dispatchReloadFailedEvent(error, backgroundDuration);

          // Attempt soft recovery as last resort (may not work if state is corrupted)
          queryClient.invalidateQueries();
          dispatchResumeEvent(backgroundDuration);
          onResume?.(backgroundDuration);
        }
      })().catch((err) => {
        // Catch any unhandled promise rejection from the IIFE
        logger.error('[useAppResume] Unhandled error in reload IIFE:', err);
      });
    },
    [onBeforeForceReload, onResume, queryClient, dispatchResumeEvent, dispatchReloadFailedEvent]
  );

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
      // This handles cases where app state may have become corrupted - but only when
      // that cannot throw away a live match, a recording or typed input, and not
      // offline (see mayReplaceScreenOnResume). Otherwise fall through to the soft
      // refresh.
      if (backgroundDuration > forceReloadTime && mayReplaceScreenOnResume()) {
        forceReloadWithNotification(backgroundDuration, 'visibilitychange');
        return;
      }

      // Strict inequality: refresh only if duration exceeds threshold (not at exactly threshold)
      if (backgroundDuration > minBackgroundTime) {
        logger.debug(
          '[useAppResume] App resumed after',
          Math.round(backgroundDuration / 1000),
          'seconds - triggering refresh'
        );

        // Invalidate all React Query caches to force refetch
        queryClient.invalidateQueries();

        // Dispatch custom event and call resume handler (with debounce protection)
        triggerResumeWithDebounce(backgroundDuration);
      } else {
        logger.debug(
          '[useAppResume] App resumed after',
          Math.round(backgroundDuration / 1000),
          'seconds - no refresh needed'
        );
      }

      backgroundStartRef.current = null;
    }
  }, [queryClient, minBackgroundTime, forceReloadTime, triggerResumeWithDebounce, forceReloadWithNotification]);

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

        // Skip if no background timestamp - either already handled by visibilitychange
        // or pageshow fired without prior pagehide (browser edge case)
        if (!backgroundStartRef.current) {
          logger.debug('[useAppResume] pageshow without background timestamp - skipping');
          return;
        }

        const backgroundDuration = now - backgroundStartRef.current;

        // Skip the force-reload during a live match or offline (see visibilitychange note).
        if (backgroundDuration > forceReloadTime && mayReplaceScreenOnResume()) {
          forceReloadWithNotification(backgroundDuration, 'pageshow_bfcache');
          return;
        }

        logger.debug('[useAppResume] Page restored from bfcache - triggering refresh');
        // Safe even if visibilitychange also fires - invalidateQueries is idempotent.
        queryClient.invalidateQueries();

        // Dispatch custom event and call resume handler (with debounce protection)
        triggerResumeWithDebounce(backgroundDuration);

        // Reset background start to prevent visibilitychange from double-triggering
        // (pageshow often fires before visibilitychange on iOS Safari)
        backgroundStartRef.current = null;
      }
    },
    [queryClient, forceReloadTime, triggerResumeWithDebounce, forceReloadWithNotification]
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
