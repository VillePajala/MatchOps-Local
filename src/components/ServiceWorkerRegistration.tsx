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

    navigator.serviceWorker.register(swUrl).then(registration => {
      logger.log('[PWA] Service Worker registered: ', registration);

      // Look for a waiting service worker
      if (registration.waiting) {
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
                setWaitingWorker(newWorker);
                fetchReleaseNotes();
                setShowUpdateBanner(true);
              }
          };
        }
      };

      // Check for updates every 60 seconds (helpful for development and quick deployments)
      updateInterval = setInterval(() => {
        logger.log('[PWA] Checking for service worker updates...');
        registration.update().catch(error => {
          logger.error('[PWA] Update check failed:', error);
        });
      }, 60000); // 60 seconds
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
      notes={releaseNotes || undefined}
      onDismiss={() => setShowUpdateBanner(false)}
    />
  ) : null;
}