/**
 * Migration Mutex for Tab Coordination
 *
 * Prevents concurrent migration operations across multiple browser tabs
 * using localStorage-based locking with heartbeat mechanism.
 */

import logger from './logger';

export interface MigrationLock {
  tabId: string;
  timestamp: number;
  operation: string;
  heartbeat: number;
}

export class MigrationMutex {
  private static readonly LOCK_KEY = 'migration_lock';
  private static readonly HEARTBEAT_KEY = 'migration_heartbeat';
  private static readonly LOCK_TIMEOUT = 30000; // 30 seconds
  private static readonly HEARTBEAT_INTERVAL = 5000; // 5 seconds
  private static readonly MAX_WAIT_TIME = 60000; // 1 minute max wait

  private tabId: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lockOwnerStatus: boolean = false;

  constructor() {
    this.tabId = this.generateTabId();
  }

  /**
   * Attempt to acquire migration lock
   */
  public async acquireLock(operation: string = 'migration'): Promise<boolean> {
    const maxAttempts = Math.ceil(MigrationMutex.MAX_WAIT_TIME / 1000); // 1 attempt per second

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (await this.tryAcquireLock(operation)) {
        this.startHeartbeat();
        this.lockOwnerStatus = true;
        logger.log('Migration lock acquired', { tabId: this.tabId, operation });
        return true;
      }

      // Wait and check if lock is stale
      await this.sleep(1000);
      this.cleanupStaleLocks();
    }

    logger.warn('Failed to acquire migration lock after maximum wait time', {
      tabId: this.tabId,
      operation,
      maxWaitTime: MigrationMutex.MAX_WAIT_TIME
    });
    return false;
  }

  /**
   * Release the migration lock
   */
  public releaseLock(): void {
    if (!this.lockOwnerStatus) {
      return;
    }

    try {
      localStorage.removeItem(MigrationMutex.LOCK_KEY);
      localStorage.removeItem(MigrationMutex.HEARTBEAT_KEY);
      this.stopHeartbeat();
      this.lockOwnerStatus = false;
      logger.log('Migration lock released', { tabId: this.tabId });
    } catch (error) {
      logger.error('Failed to release migration lock', { tabId: this.tabId, error });
    }
  }

  /**
   * Check if this tab owns the lock
   */
  public isLockOwner(): boolean {
    return this.lockOwnerStatus;
  }

  /**
   * Get current lock information
   */
  public getCurrentLock(): MigrationLock | null {
    try {
      const lockData = localStorage.getItem(MigrationMutex.LOCK_KEY);
      return lockData ? JSON.parse(lockData) : null;
    } catch {
      return null;
    }
  }

  /**
   * Force release lock (use with caution)
   */
  public forceReleaseLock(): void {
    try {
      localStorage.removeItem(MigrationMutex.LOCK_KEY);
      localStorage.removeItem(MigrationMutex.HEARTBEAT_KEY);
      logger.warn('Migration lock force-released', { tabId: this.tabId });
    } catch (error) {
      logger.error('Failed to force-release migration lock', { error });
    }
  }

  /**
   * Clean up on tab close
   */
  public cleanup(): void {
    this.releaseLock();
  }

  // Private methods

  private async tryAcquireLock(operation: string): Promise<boolean> {
    try {
      const existingLock = this.getCurrentLock();

      // No existing lock, try to acquire
      if (!existingLock) {
        return this.createLock(operation);
      }

      // Check if existing lock is stale
      if (this.isLockStale(existingLock)) {
        logger.warn('Removing stale migration lock', existingLock);
        this.forceReleaseLock();
        return this.createLock(operation);
      }

      // Lock is active and owned by another tab
      return false;
    } catch (error) {
      logger.error('Error checking migration lock', { error, tabId: this.tabId });
      return false;
    }
  }

  private createLock(operation: string): boolean {
    try {
      const lock: MigrationLock = {
        tabId: this.tabId,
        timestamp: Date.now(),
        operation,
        heartbeat: Date.now()
      };

      localStorage.setItem(MigrationMutex.LOCK_KEY, JSON.stringify(lock));

      // Verify lock was acquired (prevent race conditions)
      const verifyLock = this.getCurrentLock();
      return verifyLock?.tabId === this.tabId;
    } catch (error) {
      logger.error('Failed to create migration lock', { error, tabId: this.tabId });
      return false;
    }
  }

  private isLockStale(lock: MigrationLock): boolean {
    const now = Date.now();
    const lockAge = now - lock.timestamp;
    const heartbeatAge = now - lock.heartbeat;

    // Lock is stale if it's older than timeout or heartbeat is stale
    return lockAge > MigrationMutex.LOCK_TIMEOUT || heartbeatAge > MigrationMutex.HEARTBEAT_INTERVAL * 2;
  }

  private cleanupStaleLocks(): void {
    const lock = this.getCurrentLock();
    if (lock && this.isLockStale(lock)) {
      logger.warn('Cleaning up stale migration lock', lock);
      this.forceReleaseLock();
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat(); // Ensure no duplicate intervals

    this.heartbeatInterval = setInterval(() => {
      if (this.lockOwnerStatus) {
        try {
          const lock = this.getCurrentLock();
          if (lock && lock.tabId === this.tabId) {
            lock.heartbeat = Date.now();
            localStorage.setItem(MigrationMutex.LOCK_KEY, JSON.stringify(lock));
          }
        } catch (error) {
          logger.error('Failed to update heartbeat', { error, tabId: this.tabId });
        }
      }
    }, MigrationMutex.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private generateTabId(): string {
    return `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Global instance for tab coordination
export const migrationMutex = new MigrationMutex();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    migrationMutex.cleanup();
  });

  // Handle visibility change (tab switching)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && migrationMutex.isLockOwner()) {
      // Keep lock but stop operations if tab becomes hidden during migration
      logger.log('Tab became hidden during migration', { tabId: migrationMutex['tabId'] });
    }
  });
}