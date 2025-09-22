/**
 * Hook for monitoring migration status
 * Provides real-time migration progress and state information
 */

import { useState, useEffect } from 'react';
import { MigrationProgress } from '@/utils/indexedDbMigration';

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