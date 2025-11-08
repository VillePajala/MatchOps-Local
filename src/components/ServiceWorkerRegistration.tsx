'use client';

import { useEffect, useState } from 'react';
import UpdateBanner from './UpdateBanner';
import logger from '@/utils/logger';

export default function ServiceWorkerRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      logger.log('[PWA] Service Worker is not supported or not in browser.');
      return;
    }

    const fetchReleaseNotes = async () => {
      try {
        const res = await fetch('/release-notes.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setReleaseNotes(data.notes);
        }
      } catch (error) {
        logger.error('Failed to fetch release notes', error);
      }
    };

    const swUrl = '/sw.js';
    let updateInterval: NodeJS.Timeout | null = null;

    navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' }).then(registration => {
      logger.log('[PWA] Service Worker registered: ', registration);
      logger.log('[PWA] Registration state - active:', registration.active?.state, 'waiting:', registration.waiting?.state, 'installing:', registration.installing?.state);

      // Look for a waiting service worker
      if (registration.waiting) {
        logger.log('[PWA] Update available on registration - showing update banner');
        setWaitingWorker(registration.waiting);
        fetchReleaseNotes();
        setShowUpdateBanner(true);
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
                fetchReleaseNotes();
                setShowUpdateBanner(true);
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
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    // Cleanup interval on unmount
    return () => {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
      // Remove controllerchange listener on unmount to avoid leaks
      try {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      } catch {}
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
      notes={releaseNotes || undefined}
      onDismiss={() => setShowUpdateBanner(false)}
    />
  ) : null;
}
