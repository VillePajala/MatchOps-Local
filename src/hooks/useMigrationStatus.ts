/**
 * Hook for monitoring migration status
 * Provides real-time migration progress and state information
 */

import { useState, useEffect } from 'react';
import { MigrationProgress } from '@/utils/indexedDbMigration';
import { MIGRATION_SUBSCRIBER_CLEANUP_DELAY } from '@/config/migrationConfig';
import logger from '@/utils/logger';

export interface MigrationStatusInfo {
  isRunning: boolean;
  progress: MigrationProgress | null;
  error: string | null;
  showNotification: boolean;
}

// Global migration status (singleton)
let globalMigrationStatus: MigrationStatusInfo = {
  isRunning: false,
  progress: null,
  error: null,
  showNotification: false
};

// Subscribers for status updates
const statusSubscribers = new Set<(status: MigrationStatusInfo) => void>();

/**
 * Update global migration status and notify subscribers
 */
export function updateMigrationStatus(update: Partial<MigrationStatusInfo>) {
  globalMigrationStatus = {
    ...globalMigrationStatus,
    ...update
  };

  // Notify all subscribers
  statusSubscribers.forEach(subscriber => {
    subscriber(globalMigrationStatus);
  });

  // Clean up stale subscribers when migration is complete and notification dismissed
  if (!globalMigrationStatus.isRunning && !globalMigrationStatus.showNotification) {
    cleanupStaleSubscribers();
  }
}

/**
 * Clean up subscribers when migration is complete to prevent memory leaks
 */
function cleanupStaleSubscribers() {
  // Only cleanup if we have subscribers but no active migration
  if (statusSubscribers.size > 0) {
    // Give components a moment to unmount naturally, then cleanup
    setTimeout(() => {
      if (!globalMigrationStatus.isRunning && !globalMigrationStatus.showNotification) {
        const subscriberCount = statusSubscribers.size;
        statusSubscribers.clear();
        if (subscriberCount > 0) {
          logger.debug(`[Migration] Cleaned up ${subscriberCount} stale migration status subscribers`);
        }
      }
    }, MIGRATION_SUBSCRIBER_CLEANUP_DELAY); // Configurable delay to allow natural component cleanup
  }
}

/**
 * Hook to monitor migration status
 */
export function useMigrationStatus(): MigrationStatusInfo & {
  dismissNotification: () => void;
} {
  const [status, setStatus] = useState<MigrationStatusInfo>(globalMigrationStatus);

  useEffect(() => {
    // Subscribe to status updates
    statusSubscribers.add(setStatus);

    // Set initial status
    setStatus(globalMigrationStatus);

    // Cleanup on unmount
    return () => {
      statusSubscribers.delete(setStatus);
    };
  }, []);

  const dismissNotification = () => {
    updateMigrationStatus({ showNotification: false });
  };

  return {
    ...status,
    dismissNotification
  };
}

/**
 * Reset migration status (for testing)
 */
export function resetMigrationStatus() {
  globalMigrationStatus = {
    isRunning: false,
    progress: null,
    error: null,
    showNotification: false
  };
  statusSubscribers.clear();
}