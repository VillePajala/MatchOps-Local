/**
 * Migration Metrics Collection
 *
 * Tracks and stores basic migration performance metrics for monitoring
 */

import logger from './logger';

export interface MigrationMetrics {
  migrationId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  storageMode: 'localStorage' | 'indexedDB';
  totalDataSizeMB: number;
  keysTransferred: number;
  transferSpeedMBps?: number;
  errorType?: string;
  retryCount: number;
  browserInfo: {
    userAgent: string;
    cookieEnabled: boolean;
    language: string;
  };
}

/**
 * Create new migration metrics tracking
 */
export function createMigrationMetrics(migrationId: string): MigrationMetrics {
  return {
    migrationId,
    startTime: Date.now(),
    success: false,
    storageMode: 'localStorage',
    totalDataSizeMB: 0,
    keysTransferred: 0,
    retryCount: 0,
    browserInfo: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      cookieEnabled: typeof navigator !== 'undefined' ? navigator.cookieEnabled : false,
      language: typeof navigator !== 'undefined' ? navigator.language : 'unknown'
    }
  };
}

/**
 * Complete migration metrics and calculate final values
 */
export function completeMigrationMetrics(
  metrics: MigrationMetrics,
  success: boolean,
  totalDataSizeMB: number,
  keysTransferred: number,
  errorType?: string
): MigrationMetrics {
  const endTime = Date.now();
  const duration = endTime - metrics.startTime;
  const transferSpeedMBps = duration > 0 ? (totalDataSizeMB / (duration / 1000)) : 0;

  const completedMetrics: MigrationMetrics = {
    ...metrics,
    endTime,
    duration,
    success,
    totalDataSizeMB,
    keysTransferred,
    transferSpeedMBps,
    errorType,
    storageMode: success ? 'indexedDB' : 'localStorage'
  };

  // Log metrics for monitoring
  logger.info('[Migration Metrics]', {
    migrationId: completedMetrics.migrationId,
    success: completedMetrics.success,
    duration: `${completedMetrics.duration}ms`,
    dataSizeMB: completedMetrics.totalDataSizeMB.toFixed(2),
    keysTransferred: completedMetrics.keysTransferred,
    transferSpeed: completedMetrics.transferSpeedMBps?.toFixed(2) + ' MB/s',
    errorType: completedMetrics.errorType || 'none',
    retryCount: completedMetrics.retryCount
  });

  // Store metrics in localStorage for later analysis
  try {
    const existingMetrics = getStoredMigrationMetrics();
    const updatedMetrics = [...existingMetrics, completedMetrics].slice(-10); // Keep last 10 migrations
    localStorage.setItem('migration_metrics', JSON.stringify(updatedMetrics));
  } catch (error) {
    logger.warn('Failed to store migration metrics', { error });
  }

  return completedMetrics;
}

/**
 * Get stored migration metrics
 */
export function getStoredMigrationMetrics(): MigrationMetrics[] {
  try {
    const stored = localStorage.getItem('migration_metrics');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    logger.warn('Failed to retrieve stored migration metrics', { error });
    return [];
  }
}

/**
 * Get migration statistics summary
 */
export function getMigrationStatistics(): {
  totalMigrations: number;
  successRate: number;
  averageDuration: number;
  averageDataSize: number;
  averageTransferSpeed: number;
  commonErrors: string[];
} {
  const metrics = getStoredMigrationMetrics();

  if (metrics.length === 0) {
    return {
      totalMigrations: 0,
      successRate: 0,
      averageDuration: 0,
      averageDataSize: 0,
      averageTransferSpeed: 0,
      commonErrors: []
    };
  }

  const successfulMigrations = metrics.filter(m => m.success);
  const successRate = (successfulMigrations.length / metrics.length) * 100;

  const averageDuration = metrics
    .filter(m => m.duration)
    .reduce((sum, m) => sum + (m.duration || 0), 0) / metrics.length;

  const averageDataSize = metrics
    .reduce((sum, m) => sum + m.totalDataSizeMB, 0) / metrics.length;

  const averageTransferSpeed = successfulMigrations
    .filter(m => m.transferSpeedMBps)
    .reduce((sum, m) => sum + (m.transferSpeedMBps || 0), 0) / (successfulMigrations.length || 1);

  const errorCounts: Record<string, number> = {};
  metrics.forEach(m => {
    if (m.errorType) {
      errorCounts[m.errorType] = (errorCounts[m.errorType] || 0) + 1;
    }
  });

  const commonErrors = Object.entries(errorCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([error]) => error);

  return {
    totalMigrations: metrics.length,
    successRate,
    averageDuration,
    averageDataSize,
    averageTransferSpeed,
    commonErrors
  };
}

/**
 * Clear stored migration metrics (for testing or privacy)
 */
export function clearStoredMigrationMetrics(): void {
  try {
    localStorage.removeItem('migration_metrics');
    logger.info('Cleared stored migration metrics');
  } catch (error) {
    logger.warn('Failed to clear migration metrics', { error });
  }
}