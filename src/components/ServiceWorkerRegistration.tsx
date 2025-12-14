'use client';

import { useEffect, useState } from 'react';
import UpdateBanner from './UpdateBanner';
import logger from '@/utils/logger';

export default function ServiceWorkerRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<string | undefined>();

  // Fetch release notes when update is detected
  const fetchReleaseNotes = async () => {
    try {
      // Cache bust to ensure we get the latest notes
      const res = await fetch('/release-notes.json?t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (data.notes) {
          setReleaseNotes(data.notes);
        }
      }
    } catch {
      // Notes are optional, don't block update banner
      logger.debug('[PWA] Could not fetch release notes');
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      logger.log('[PWA] Service Worker is not supported or not in browser.');
      return;
    }

    const swUrl = '/sw.js';
    let updateInterval: NodeJS.Timeout | null = null;

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

      // Check for updates every 60 seconds (helpful for development and quick deployments)
      updateInterval = setInterval(() => {
        logger.log('[PWA] Periodic update check started (every 60s)');
        registration.update().then(() => {
          logger.log('[PWA] Update check completed successfully');
          logger.log('[PWA] Post-check state - active:', registration.active?.state, 'waiting:', registration.waiting?.state, 'installing:', registration.installing?.state);
        }).catch(error => {
          logger.error('[PWA] Update check failed:', error);
        });
      }, 60000); // 60 seconds

      // Also do an immediate check on mount
      logger.log('[PWA] Running immediate update check on mount');
      registration.update().then(() => {
        logger.log('[PWA] Initial update check completed');
      }).catch(error => {
        logger.error('[PWA] Initial update check failed:', error);
      });
    }).catch(error => {
      logger.error('[PWA] Service Worker registration failed: ', error);
    });

    // Listen for controller changes
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    // Cleanup interval on unmount
    return () => {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
    };
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      logger.log('[PWA] Posting message to waiting worker to skip waiting.');
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      setShowUpdateBanner(false);
    }
  };

  return showUpdateBanner ? (
    <UpdateBanner
      onUpdate={handleUpdate}
      onDismiss={() => setShowUpdateBanner(false)}
      notes={releaseNotes}
    />
  ) : null;
}
