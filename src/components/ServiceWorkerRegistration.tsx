'use client';

import { useEffect, useState } from 'react';
import UpdateBanner from './UpdateBanner';
import logger from '@/utils/logger';
import i18n from '@/i18n';

interface ChangelogData {
  version: string;
  date: string;
  notes: {
    en: string[];
    fi: string[];
  };
  /** True for a release that changes nothing a coach can see (deps, refactors). */
  internal?: boolean;
}

export type UpdatePhase = 'available' | 'installing' | 'ready';

export default function ServiceWorkerRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<string[] | undefined>();
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('available');

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      logger.log('[PWA] Service Worker is not supported or not in browser.');
      return;
    }

    // Fetch changelog when update is detected. Tells the caller whether the
    // release is internal; unknown (fetch failed) counts as visible, so a
    // broken changelog can never hide an update.
    const fetchReleaseNotes = async (): Promise<{ internal: boolean }> => {
      try {
        // Cache bust to ensure we get the latest notes
        const res = await fetch('/changelog.json?t=' + Date.now());
        if (res.ok) {
          const data: ChangelogData = await res.json();
          if (data.notes) {
            // Get language directly from i18n (already loaded from localStorage)
            // This avoids DataStore initialization conflicts (MATCHOPS-LOCAL-2N)
            const lang = i18n.language || 'fi';
            const note = data.notes[lang as keyof typeof data.notes] || data.notes.fi;
            // Tolerate the legacy single-string shape just in case a stale
            // changelog.json is cached; always hand the banner an array.
            setReleaseNotes(Array.isArray(note) ? note : note ? [note] : undefined);
          }
          return { internal: data.internal === true };
        }
      } catch {
        // Notes are optional, don't block update banner
        logger.debug('[PWA] Could not fetch changelog');
      }
      return { internal: false };
    };

    /**
     * A new worker is installed and waiting. Visible releases get the banner.
     * Internal ones (release note marked `internal: true`) stay waiting
     * silently and activate on the next launch, which is the browser's own
     * lifecycle: a waiting worker takes over once the old one has no clients
     * left. A later visible release replaces the waiting worker and comes back
     * through here with its own changelog, so the banner is never lost.
     */
    const offerUpdate = async (worker: ServiceWorker, how: string) => {
      const { internal } = await fetchReleaseNotes();
      setWaitingWorker(worker);
      if (internal) {
        logger.log(`[PWA] Update ${how} is internal - installed silently, applies on the next launch`);
        return;
      }
      logger.log(`[PWA] Update ${how} - showing update banner`);
      setShowUpdateBanner(true);
    };

    const swUrl = '/sw.js';
    let updateInterval: NodeJS.Timeout | null = null;

    // Helper to check for updates (only when online)
    const checkForUpdates = (registration: ServiceWorkerRegistration, reason: string) => {
      if (!navigator.onLine) {
        logger.debug(`[PWA] Skipping update check (${reason}) - offline`);
        return;
      }

      logger.log(`[PWA] Update check started (${reason})`);
      registration.update().then(() => {
        logger.log('[PWA] Update check completed successfully');
      }).catch(error => {
        // Use warn instead of error - offline/network failures are expected in offline-first app
        logger.warn('[PWA] Update check failed (expected when offline):', error);
      });
    };

    navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' }).then(registration => {
      logger.log('[PWA] Service Worker registered: ', registration);
      logger.log('[PWA] Registration state - active:', registration.active?.state, 'waiting:', registration.waiting?.state, 'installing:', registration.installing?.state);

      // Look for a waiting service worker
      if (registration.waiting) {
        offerUpdate(registration.waiting, 'available on registration');
        return;
      }

      // Listen for updates
      registration.onupdatefound = () => {
        const newWorker = registration.installing;
        logger.log('[PWA] New service worker found:', newWorker);
        if (newWorker) {
          newWorker.onstatechange = () => {
            logger.log('[PWA] New service worker state changed:', newWorker.state);
            // When the new worker is installed and waiting
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                offerUpdate(newWorker, 'installed');
              }
          };
        }
      };

      // Polling interval: frequent in dev for quick iteration, hourly in prod to save battery
      const isDev = process.env.NODE_ENV === 'development';
      const pollingInterval = isDev ? 60_000 : 60 * 60_000; // 1 min dev, 1 hour prod

      updateInterval = setInterval(() => {
        checkForUpdates(registration, isDev ? 'periodic-dev' : 'periodic-hourly');
      }, pollingInterval);

      // Check when tab becomes visible (user returns to app)
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          checkForUpdates(registration, 'visibility-change');
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      // Check when coming back online
      const handleOnline = () => {
        checkForUpdates(registration, 'online-event');
      };
      window.addEventListener('online', handleOnline);

      // Store cleanup functions
      (registration as ServiceWorkerRegistration & { _cleanup?: () => void })._cleanup = () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('online', handleOnline);
      };

      // Immediate check on mount
      checkForUpdates(registration, 'initial');
    }).catch(error => {
      logger.error('[PWA] Service Worker registration failed: ', error);
    });

    // Listen for controller changes
    // When a new SW takes control, transition banner to "ready to reload" phase
    const handleControllerChange = () => {
      logger.log('[PWA] Service worker controller changed - update ready, prompting reload');
      setUpdatePhase('ready');
      // Don't auto-reload - let user click "Reload to apply" when ready
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Cleanup on unmount
    return () => {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
      // Clean up event listeners
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      navigator.serviceWorker.getRegistration().then(registration => {
        if (registration) {
          const cleanup = (registration as ServiceWorkerRegistration & { _cleanup?: () => void })._cleanup;
          if (cleanup) cleanup();
        }
      }).catch(() => {
        // Registration lookup during cleanup is non-critical
      });
    };
  }, []);

  /**
   * How long to wait for `controllerchange` before offering the reload anyway.
   *
   * Reloading is safe whatever state the worker is in - the new version is
   * already downloaded and a reload picks it up - so a timeout that lands
   * early costs nothing, while no timeout at all strands the coach on a
   * spinner for as long as they are willing to look at it.
   */
  const CONTROLLER_CHANGE_TIMEOUT_MS = 3000;

  /**
   * Take the update.
   *
   * THIS USED TO DO NOTHING ABOUT ONE TIME IN TEN (owner, 2026-09-16: "the
   * prompt stays there and the reload prompt never arrives"). It was
   * `if (waitingWorker) { ... }` with no else, and three separate things could
   * leave that branch unreachable or ineffective:
   *
   * 1. `waitingWorker` was null. The banner's visibility is `showUpdateBanner`,
   *    tracked separately, so the banner could be on screen with no worker
   *    behind it - and the tap did literally nothing, silently.
   * 2. The reference was STALE. It is captured when the banner appears, which
   *    can be many minutes before the tap; if the browser discarded or
   *    replaced that worker (another tab activated it, or a newer build
   *    installed) the postMessage went nowhere, the phase moved to
   *    'installing', and controllerchange never came.
   * 3. controllerchange never fires at all when the new worker already
   *    controls the page.
   *
   * The fix rests on one fact: A RELOAD ALWAYS WORKS. The new version is
   * already on the device, so reloading applies it regardless of what the
   * worker is doing. Every uncertain path therefore ends at the reload button
   * rather than at nothing.
   */
  const handleInstall = async () => {
    setUpdatePhase('installing');

    // Re-resolve at TAP time. The captured reference may be minutes old.
    let worker: ServiceWorker | null = null;
    let lookedUp = false;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      worker = registration?.waiting ?? null;
      lookedUp = true;
    } catch (e) {
      logger.warn('[PWA] Could not re-read the registration:', e);
    }
    // The captured reference is a fallback for a FAILED lookup only. If the
    // lookup succeeded and found no waiting worker, that is the browser saying
    // there is none - trusting a stale object over that is how the tap ends up
    // posting into the void and waiting forever.
    if (!lookedUp && waitingWorker?.state === 'installed') worker = waitingWorker;

    if (!worker) {
      // Nothing to activate: either it already activated, or the reference is
      // gone. Offer the reload rather than leaving the coach tapping a dead
      // button - this is the case that produced the original report.
      logger.log('[PWA] No waiting worker at tap time - offering reload directly.');
      setUpdatePhase('ready');
      return;
    }

    logger.log('[PWA] Posting message to waiting worker to skip waiting.');
    worker.postMessage({ type: 'SKIP_WAITING' });

    // Safety net for cases 2 and 3: if the controller never changes, the
    // reload still applies the update, so stop waiting and say so.
    window.setTimeout(() => {
      setUpdatePhase((phase) => {
        if (phase !== 'installing') return phase;
        logger.log('[PWA] No controllerchange in time - offering reload anyway.');
        return 'ready';
      });
    }, CONTROLLER_CHANGE_TIMEOUT_MS);
  };

  const handleReload = async () => {
    logger.log('[PWA] User requested reload to apply update.');
    // Clear all SW caches to prevent stale assets after update.
    // Chrome's installed PWA context can serve old content from disk cache
    // even after SW update — a fresh navigation to '/' is more reliable
    // than window.location.reload() which may hit browser caches.
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      logger.log(`[PWA] Cleared ${cacheNames.length} caches before reload`);
    } catch (e) {
      logger.warn('[PWA] Cache clear failed, reloading anyway:', e);
    }
    window.location.replace('/');
  };

  const handleDismiss = () => {
    setShowUpdateBanner(false);
    setUpdatePhase('available'); // Reset phase for next update
  };

  return showUpdateBanner ? (
    <UpdateBanner
      phase={updatePhase}
      onInstall={handleInstall}
      onReload={handleReload}
      onDismiss={handleDismiss}
      notes={releaseNotes}
    />
  ) : null;
}
