'use client';

import { useEffect, useState } from 'react';
import UpdateBanner from './UpdateBanner';
import logger from '@/utils/logger';
import i18n from '@/i18n';

interface ChangelogData {
  version: string;
  date: string;
  notes: {
    en: string;
    fi: string;
  };
}

export type UpdatePhase = 'available' | 'installing' | 'ready';

export default function ServiceWorkerRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<string | undefined>();
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('available');

  // Fetch changelog when update is detected
  const fetchReleaseNotes = async () => {
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
          setReleaseNotes(note);
        }
      }
    } catch {
      // Notes are optional, don't block update banner
      logger.debug('[PWA] Could not fetch changelog');
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      logger.log('[PWA] Service Worker is not supported or not in browser.');
      return;
    }

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
        logger.log('[PWA] Update available on registration - showing update banner');
        setWaitingWorker(registration.waiting);
        setShowUpdateBanner(true);
        fetchReleaseNotes();
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
                logger.log('[PWA] New service worker installed - showing update banner');
                setWaitingWorker(newWorker);
                setShowUpdateBanner(true);
                fetchReleaseNotes();
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
      });
    };
  }, []);

  const handleInstall = () => {
    if (waitingWorker) {
      logger.log('[PWA] Posting message to waiting worker to skip waiting.');
      setUpdatePhase('installing');
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      // Don't close banner - wait for controllerchange to transition to 'ready' phase
    }
  };

  const handleReload = () => {
    logger.log('[PWA] User requested reload to apply update.');
    window.location.reload();
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
