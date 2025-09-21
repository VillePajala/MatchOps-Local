/**
 * Tests for IndexedDB Migration Orchestrator
 */

import {
  IndexedDbMigrationOrchestrator,
  MigrationState,
  isIndexedDbMigrationNeeded,
  getLastMigrationBackup,
  clearMigrationBackup
} from './indexedDbMigration';
import { StorageError, StorageErrorType } from './storageAdapter';
import * as storageFactory from './storageFactory';
import * as fullBackup from './fullBackup';
import {
  SAVED_GAMES_KEY,
  MASTER_ROSTER_KEY,
  SEASONS_LIST_KEY
} from '@/config/storageKeys';

// Mock storage adapters
const mockLocalStorageAdapter = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  getKeys: jest.fn(),
  getBackendName: jest.fn().mockReturnValue('localStorage')
};

const mockIndexedDbAdapter = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  getKeys: jest.fn(),
  getBackendName: jest.fn().mockReturnValue('indexedDB')
};

// Mock dependencies
jest.mock('./storageFactory', () => ({
  createStorageAdapter: jest.fn(),
  getStorageConfig: jest.fn(),
  updateStorageConfig: jest.fn()
}));

jest.mock('./fullBackup', () => ({
  generateFullBackupJson: jest.fn(),
  importFromBackupJson: jest.fn()
}));

jest.mock('./logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

describe('IndexedDbMigrationOrchestrator', () => {
  let orchestrator: IndexedDbMigrationOrchestrator;
  let progressCallback: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    progressCallback = jest.fn();
    orchestrator = new IndexedDbMigrationOrchestrator({
      progressCallback
    });

    // Setup default mocks
    (storageFactory.createStorageAdapter as jest.Mock).mockImplementation((mode) => {
      return mode === 'localStorage' ? mockLocalStorageAdapter : mockIndexedDbAdapter;
    });

    (storageFactory.getStorageConfig as jest.Mock).mockReturnValue({
      mode: 'localStorage',
      version: '1.0.0',
      migrationState: 'not-started'
    });

    (fullBackup.generateFullBackupJson as jest.Mock).mockResolvedValue(
      JSON.stringify({ test: 'backup' })
    );
  });

  describe('Migration State Management', () => {
    test('should initialize with NOT_STARTED state', () => {
      expect(orchestrator.getState()).toBe(MigrationState.NOT_STARTED);
      expect(orchestrator.getErrors()).toHaveLength(0);
    });

    test('should track state transitions during migration', async () => {
      // Setup successful migration scenario
      mockLocalStorageAdapter.getItem.mockResolvedValue('test-data');
      mockIndexedDbAdapter.getItem.mockResolvedValue('test-data');

      await orchestrator.migrate();

      // Check that all states were visited
      const states = progressCallback.mock.calls.map(call => call[0].state);
      expect(states).toContain(MigrationState.BACKING_UP);
      expect(states).toContain(MigrationState.TRANSFERRING);
      expect(states).toContain(MigrationState.VERIFYING);
      expect(states).toContain(MigrationState.SWITCHING);
    });

    test('should skip migration if already completed', async () => {
      (storageFactory.getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'indexedDB',
        version: '2.0.0',
        migrationState: 'completed'
      });

      const result = await orchestrator.migrate();

      expect(result.success).toBe(true);
      expect(result.state).toBe(MigrationState.COMPLETED);
      expect(fullBackup.generateFullBackupJson).not.toHaveBeenCalled();
    });
  });

  describe('Backup Creation', () => {
    test('should create and store backup', async () => {
      const backupData = JSON.stringify({ test: 'backup-data' });
      (fullBackup.generateFullBackupJson as jest.Mock).mockResolvedValue(backupData);

      mockLocalStorageAdapter.getItem.mockResolvedValue('test-data');
      mockIndexedDbAdapter.getItem.mockResolvedValue('test-data');

      await orchestrator.migrate();

      expect(fullBackup.generateFullBackupJson).toHaveBeenCalledTimes(1);
      expect(localStorage.setItem).toHaveBeenCalledWith(
        expect.stringContaining('migration_backup_'),
        backupData
      );
    });

    test('should handle backup creation failure', async () => {
      (fullBackup.generateFullBackupJson as jest.Mock).mockRejectedValue(
        new Error('Backup failed')
      );

      const result = await orchestrator.migrate();

      expect(result.success).toBe(false);
      expect(result.state).toBe(MigrationState.ROLLED_BACK);
      expect(result.errors.some(e => e.includes('Failed to create backup'))).toBe(true);
    });
  });

  describe('Data Transfer', () => {
    test('should transfer all critical keys', async () => {
      const testData = {
        [SAVED_GAMES_KEY]: JSON.stringify({ games: [] }),
        [MASTER_ROSTER_KEY]: JSON.stringify([]),
        [SEASONS_LIST_KEY]: JSON.stringify([])
      };

      mockLocalStorageAdapter.getItem.mockImplementation((key) => testData[key] || null);
      mockIndexedDbAdapter.getItem.mockImplementation((key) => testData[key] || null);

      await orchestrator.migrate();

      // Verify all keys were read from localStorage
      expect(mockLocalStorageAdapter.getItem).toHaveBeenCalledWith(SAVED_GAMES_KEY);
      expect(mockLocalStorageAdapter.getItem).toHaveBeenCalledWith(MASTER_ROSTER_KEY);
      expect(mockLocalStorageAdapter.getItem).toHaveBeenCalledWith(SEASONS_LIST_KEY);

      // Verify all keys were written to IndexedDB
      expect(mockIndexedDbAdapter.setItem).toHaveBeenCalledWith(
        SAVED_GAMES_KEY,
        testData[SAVED_GAMES_KEY]
      );
      expect(mockIndexedDbAdapter.setItem).toHaveBeenCalledWith(
        MASTER_ROSTER_KEY,
        testData[MASTER_ROSTER_KEY]
      );
    });

    test('should handle large payloads', async () => {
      const largeData = 'x'.repeat(2 * 1024 * 1024); // 2MB
      mockLocalStorageAdapter.getItem.mockResolvedValue(largeData);
      mockIndexedDbAdapter.getItem.mockResolvedValue(largeData);

      await orchestrator.migrate();

      expect(mockIndexedDbAdapter.setItem).toHaveBeenCalled();
    });

    test('should retry failed transfers', async () => {
      mockLocalStorageAdapter.getItem.mockResolvedValue('test-data');
      // First call in batch fails, retry succeeds
      mockIndexedDbAdapter.setItem
        .mockRejectedValueOnce(new Error('Transfer failed'))
        .mockResolvedValue(undefined);
      mockIndexedDbAdapter.getItem.mockResolvedValue('test-data');

      await orchestrator.migrate();

      // Should have succeeded after retry
      expect(mockIndexedDbAdapter.setItem).toHaveBeenCalled();
    });

    test('should handle quota exceeded errors', async () => {
      const largeData = 'x'.repeat(10 * 1024 * 1024); // 10MB
      mockLocalStorageAdapter.getItem.mockResolvedValue(largeData);
      // Always reject to simulate persistent quota error
      mockIndexedDbAdapter.setItem.mockRejectedValue(
        new StorageError(StorageErrorType.QUOTA_EXCEEDED, 'Quota exceeded')
      );

      const result = await orchestrator.migrate();

      expect(result.success).toBe(false);
      // Check for either the specific quota error or the retry failure error
      const hasQuotaError = result.errors.some(e =>
        e.includes('Cannot transfer large payload') ||
        e.includes('Quota exceeded') ||
        e.includes('Failed to transfer')
      );
      expect(hasQuotaError).toBe(true);
    });
  });

  describe('Data Verification', () => {
    test('should verify data integrity', async () => {
      const testData = 'test-data';
      mockLocalStorageAdapter.getItem.mockResolvedValue(testData);
      mockIndexedDbAdapter.getItem.mockResolvedValue(testData);
      mockIndexedDbAdapter.setItem.mockResolvedValue(undefined);

      await orchestrator.migrate();

      // Verification should have been performed
      const verifyingState = progressCallback.mock.calls.find(
        call => call[0].state === MigrationState.VERIFYING
      );
      expect(verifyingState).toBeDefined();
    });

    test('should detect data mismatch', async () => {
      mockLocalStorageAdapter.getItem.mockResolvedValue('data-1');
      mockIndexedDbAdapter.setItem.mockResolvedValue(undefined);
      // After transfer, verification reads different value
      mockIndexedDbAdapter.getItem.mockResolvedValue('data-2');

      const result = await orchestrator.migrate();

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Data verification failed'))).toBe(true);
    });

    test('should verify JSON data structure', async () => {
      const jsonData = JSON.stringify({ key: 'value', nested: { data: true } });
      mockLocalStorageAdapter.getItem.mockResolvedValue(jsonData);
      mockIndexedDbAdapter.setItem.mockResolvedValue(undefined);
      mockIndexedDbAdapter.getItem.mockResolvedValue(jsonData);

      await orchestrator.migrate();

      const verifyingCall = progressCallback.mock.calls.find(
        call => call[0].state === MigrationState.VERIFYING
      );
      expect(verifyingCall).toBeDefined();
    });

    test('should skip verification when configured', async () => {
      orchestrator = new IndexedDbMigrationOrchestrator({
        verifyData: false,
        progressCallback
      });

      mockLocalStorageAdapter.getItem.mockResolvedValue('test-data');
      mockIndexedDbAdapter.getItem.mockResolvedValue('test-data');

      await orchestrator.migrate();

      // Verification state should not be reached
      const states = progressCallback.mock.calls.map(call => call[0].state);
      expect(states).not.toContain(MigrationState.VERIFYING);
    });
  });

  describe('Storage Mode Switching', () => {
    test('should update storage configuration on success', async () => {
      mockLocalStorageAdapter.getItem.mockResolvedValue('test-data');
      mockIndexedDbAdapter.setItem.mockResolvedValue(undefined);
      mockIndexedDbAdapter.getItem.mockResolvedValue('test-data');
      (storageFactory.updateStorageConfig as jest.Mock).mockResolvedValue(undefined);

      await orchestrator.migrate();

      expect(storageFactory.updateStorageConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'indexedDB',
          version: '2.0.0',
          migrationState: 'completed'
        })
      );
    });

    test('should handle switch failure', async () => {
      mockLocalStorageAdapter.getItem.mockResolvedValue('test-data');
      mockIndexedDbAdapter.getItem.mockResolvedValue('test-data');
      (storageFactory.updateStorageConfig as jest.Mock).mockRejectedValue(
        new Error('Switch failed')
      );

      const result = await orchestrator.migrate();

      expect(result.success).toBe(false);
      expect(result.state).toBe(MigrationState.ROLLED_BACK);
    });
  });

  describe('Rollback Mechanism', () => {
    test('should rollback on migration failure', async () => {
      mockLocalStorageAdapter.getItem.mockRejectedValue(new Error('Read failed'));

      const result = await orchestrator.migrate();

      expect(result.success).toBe(false);
      expect(result.state).toBe(MigrationState.ROLLED_BACK);
      expect(storageFactory.updateStorageConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'localStorage',
          migrationState: 'failed'
        })
      );
    });

    test('should preserve backup on rollback', async () => {
      const backupData = JSON.stringify({ test: 'backup' });
      (fullBackup.generateFullBackupJson as jest.Mock).mockResolvedValue(backupData);
      mockLocalStorageAdapter.getItem.mockRejectedValue(new Error('Transfer failed'));

      const result = await orchestrator.migrate();

      expect(result.backup).toBe(backupData);
    });

    test('should increment failure count on rollback', async () => {
      (storageFactory.getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'localStorage',
        version: '1.0.0',
        migrationFailureCount: 2
      });

      mockLocalStorageAdapter.getItem.mockRejectedValue(new Error('Failed'));

      await orchestrator.migrate();

      expect(storageFactory.updateStorageConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          migrationFailureCount: 3
        })
      );
    });
  });

  describe('Progress Reporting', () => {
    test('should report progress during migration', async () => {
      mockLocalStorageAdapter.getItem.mockResolvedValue('test-data');
      mockIndexedDbAdapter.getItem.mockResolvedValue('test-data');

      await orchestrator.migrate();

      // Check progress was reported
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          totalKeys: expect.any(Number),
          processedKeys: expect.any(Number),
          percentage: expect.any(Number)
        })
      );
    });

    test('should report errors in progress', async () => {
      mockLocalStorageAdapter.getItem.mockRejectedValue(new Error('Test error'));

      await orchestrator.migrate();

      // Check if errors were collected
      const result = await orchestrator.migrate();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Migration Result', () => {
    test('should return successful result', async () => {
      mockLocalStorageAdapter.getItem.mockResolvedValue('test-data');
      mockIndexedDbAdapter.setItem.mockResolvedValue(undefined);
      mockIndexedDbAdapter.getItem.mockResolvedValue('test-data');
      (storageFactory.updateStorageConfig as jest.Mock).mockResolvedValue(undefined);

      const result = await orchestrator.migrate();

      expect(result).toMatchObject({
        success: true,
        state: MigrationState.COMPLETED,
        errors: [],
        duration: expect.any(Number)
      });
    });

    test('should return failed result with errors', async () => {
      mockLocalStorageAdapter.getItem.mockRejectedValue(new Error('Migration failed'));
      (storageFactory.updateStorageConfig as jest.Mock).mockResolvedValue(undefined);

      const result = await orchestrator.migrate();

      expect(result.success).toBe(false);
      expect(result.state).toBe(MigrationState.ROLLED_BACK);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    test('should measure migration duration', async () => {
      mockLocalStorageAdapter.getItem.mockResolvedValue('test-data');
      mockIndexedDbAdapter.setItem.mockResolvedValue(undefined);
      mockIndexedDbAdapter.getItem.mockResolvedValue('test-data');
      (storageFactory.updateStorageConfig as jest.Mock).mockResolvedValue(undefined);

      const result = await orchestrator.migrate();

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });
  });
});

describe('Utility Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('isIndexedDbMigrationNeeded', () => {
    test('should return true when in localStorage mode', () => {
      (storageFactory.getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'localStorage',
        migrationState: 'not-started'
      });

      expect(isIndexedDbMigrationNeeded()).toBe(true);
    });

    test('should return false when migration completed', () => {
      (storageFactory.getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'indexedDB',
        migrationState: 'completed'
      });

      expect(isIndexedDbMigrationNeeded()).toBe(false);
    });
  });

  describe('Backup Management', () => {
    test('should retrieve last migration backup', () => {
      const backupData = JSON.stringify({ test: 'backup' });
      localStorage.setItem('migration_backup_123', backupData);
      localStorage.setItem('last_migration_backup_key', 'migration_backup_123');

      expect(getLastMigrationBackup()).toBe(backupData);
    });

    test('should clear migration backup', () => {
      localStorage.setItem('migration_backup_123', 'backup');
      localStorage.setItem('last_migration_backup_key', 'migration_backup_123');

      clearMigrationBackup();

      expect(localStorage.getItem('migration_backup_123')).toBeNull();
      expect(localStorage.getItem('last_migration_backup_key')).toBeNull();
    });
  });
});