/**
 * Migration Backup System
 * 
 * Provides transactional backup and restore capabilities for safe migrations
 */

import { getLocalStorageItem, setLocalStorageItem, removeLocalStorageItem } from './localStorage';
import { getAppDataVersion } from './migration';
import logger from './logger';

// All storage keys that need to be backed up during migration
const CRITICAL_STORAGE_KEYS = [
  // Core data
  'soccerMasterRoster',
  'soccerSeasons',
  'soccerTournaments', 
  'savedSoccerGames',
  'soccerAppSettings',
  
  // Team data (v2+)
  'soccerTeamsIndex',
  'soccerTeamRosters',
  
  // Other data
  'soccerPlayerAdjustments',
  'appDataVersion'
];

export interface MigrationBackup {
  timestamp: number;
  version: number;
  targetVersion: number;
  data: Record<string, string | null>;
  checksum: string;
}

const MIGRATION_BACKUP_KEY = 'MIGRATION_BACKUP_TEMP';

/**
 * Create a complete backup of all application data before migration
 */
export const createMigrationBackup = async (targetVersion: number): Promise<MigrationBackup> => {
  logger.log('[Migration Backup] Creating backup...');
  
  const backup: MigrationBackup = {
    timestamp: Date.now(),
    version: getAppDataVersion(),
    targetVersion,
    data: {},
    checksum: ''
  };

  // Backup all critical data
  for (const key of CRITICAL_STORAGE_KEYS) {
    try {
      const value = getLocalStorageItem(key);
      backup.data[key] = value; // Store null if key doesn't exist
    } catch (error) {
      logger.error(`[Migration Backup] Failed to backup key "${key}":`, error);
      throw new Error(`Failed to backup data for key "${key}": ${error}`);
    }
  }

  // Generate checksum for integrity verification
  backup.checksum = generateChecksum(backup.data);

  // Store backup temporarily
  try {
    setLocalStorageItem(MIGRATION_BACKUP_KEY, JSON.stringify(backup));
    logger.log('[Migration Backup] Backup created successfully');
    return backup;
  } catch (error) {
    logger.error('[Migration Backup] Failed to store backup:', error);
    throw new Error(`Failed to store migration backup: ${error}`);
  }
};

/**
 * Restore data from a migration backup
 */
export const restoreMigrationBackup = async (backup?: MigrationBackup): Promise<void> => {
  let backupToRestore = backup;
  
  // If no backup provided, try to load from storage
  if (!backupToRestore) {
    const storedBackup = getLocalStorageItem(MIGRATION_BACKUP_KEY);
    if (!storedBackup) {
      throw new Error('No migration backup found to restore from');
    }
    
    try {
      backupToRestore = JSON.parse(storedBackup);
    } catch (error) {
      throw new Error(`Failed to parse stored migration backup: ${error}`);
    }
  }

  if (!backupToRestore) {
    throw new Error('No valid backup data available');
  }

  logger.log('[Migration Backup] Starting restore from backup...');

  // Verify backup integrity
  const currentChecksum = generateChecksum(backupToRestore.data);
  if (currentChecksum !== backupToRestore.checksum) {
    throw new Error('Backup data integrity check failed - backup may be corrupted');
  }

  // Clear all current data first
  for (const key of CRITICAL_STORAGE_KEYS) {
    try {
      removeLocalStorageItem(key);
    } catch (error) {
      logger.warn(`[Migration Backup] Warning: Could not clear key "${key}":`, error);
    }
  }

  // Restore all data
  let restoredCount = 0;
  let errorCount = 0;
  
  for (const [key, value] of Object.entries(backupToRestore.data)) {
    try {
      if (value === null) {
        // Key was not present in original backup, ensure it's removed
        removeLocalStorageItem(key);
      } else {
        setLocalStorageItem(key, value);
        restoredCount++;
      }
    } catch (error) {
      logger.error(`[Migration Backup] Failed to restore key "${key}":`, error);
      errorCount++;
    }
  }

  if (errorCount > 0) {
    throw new Error(`Failed to restore ${errorCount} keys during backup restore`);
  }

  logger.log(`[Migration Backup] Successfully restored ${restoredCount} keys from backup`);
};

/**
 * Clear the temporary migration backup
 */
export const clearMigrationBackup = (): void => {
  try {
    removeLocalStorageItem(MIGRATION_BACKUP_KEY);
    logger.log('[Migration Backup] Temporary backup cleared');
  } catch (error) {
    logger.warn('[Migration Backup] Could not clear temporary backup:', error);
  }
};

/**
 * Check if a migration backup exists
 */
export const hasMigrationBackup = (): boolean => {
  return getLocalStorageItem(MIGRATION_BACKUP_KEY) !== null;
};

/**
 * Get migration backup info without loading full data
 */
export const getMigrationBackupInfo = (): { timestamp: number; version: number; targetVersion: number } | null => {
  const stored = getLocalStorageItem(MIGRATION_BACKUP_KEY);
  if (!stored) return null;
  
  try {
    const backup = JSON.parse(stored);
    return {
      timestamp: backup.timestamp,
      version: backup.version,
      targetVersion: backup.targetVersion
    };
  } catch (error) {
    logger.error('[Migration Backup] Failed to parse backup info:', error);
    return null;
  }
};

/**
 * Generate a simple checksum for data integrity verification
 */
function generateChecksum(data: Record<string, string | null>): string {
  // Create a consistent string representation of the data
  const sortedEntries = Object.entries(data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value || 'null'}`)
    .join('|');
  
  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < sortedEntries.length; i++) {
    hash = (hash * 33) ^ sortedEntries.charCodeAt(i);
  }
  
  return (hash >>> 0).toString(16); // Convert to unsigned 32-bit hex
}

/**
 * Validate that a backup can be restored
 */
export const validateMigrationBackup = (backup: MigrationBackup): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // Check required fields
  if (typeof backup.timestamp !== 'number' || backup.timestamp <= 0) {
    errors.push('Invalid or missing timestamp');
  }
  
  if (typeof backup.version !== 'number' || backup.version < 1) {
    errors.push('Invalid or missing version number');
  }
  
  if (typeof backup.targetVersion !== 'number' || backup.targetVersion < 1) {
    errors.push('Invalid or missing target version number');
  }
  
  if (!backup.data || typeof backup.data !== 'object') {
    errors.push('Missing or invalid backup data');
  }
  
  if (typeof backup.checksum !== 'string' || backup.checksum.length === 0) {
    errors.push('Missing or invalid checksum');
  }
  
  // Verify checksum
  if (errors.length === 0) {
    const expectedChecksum = generateChecksum(backup.data);
    if (expectedChecksum !== backup.checksum) {
      errors.push('Checksum mismatch - backup data may be corrupted');
    }
  }
  
  // Check backup age (warn if older than 24 hours)
  const backupAge = Date.now() - backup.timestamp;
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  if (backupAge > maxAge) {
    errors.push(`Backup is ${Math.round(backupAge / (60 * 60 * 1000))} hours old - may be stale`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};