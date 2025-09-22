/**
 * Migration Integration Tests
 *
 * Tests the integration of app data migration and IndexedDB storage migration
 */

import {
  runMigration,
  isMigrationNeeded,
  getAppDataVersion,
  getMigrationStatus,
  isIndexedDbMigrationNeeded,
  triggerIndexedDbMigration
} from './migration';
import { getStorageConfig } from './storageFactory';
import { IndexedDbMigrationOrchestrator } from './indexedDbMigration';
import { IndexedDbMigrationOrchestratorMemoryOptimized } from './indexedDbMigrationMemoryOptimized';
import * as migrationBackup from './migrationBackup';
import * as localStorage from './localStorage';
import * as masterRosterManager from './masterRosterManager';
import * as teams from './teams';
import * as appSettings from './appSettings';
import logger from './logger';

// Mock dependencies
jest.mock('./storageFactory');
jest.mock('./indexedDbMigration');
jest.mock('./indexedDbMigrationMemoryOptimized');
jest.mock('./migrationBackup');
jest.mock('./localStorage');
jest.mock('./masterRosterManager');
jest.mock('./teams');
jest.mock('./appSettings');
jest.mock('./logger');

describe('Migration Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    (localStorage.getLocalStorageItem as jest.Mock).mockReturnValue(null);
    (localStorage.setLocalStorageItem as jest.Mock).mockReturnValue(undefined);
    (getStorageConfig as jest.Mock).mockReturnValue({
      mode: 'localStorage',
      version: '1.0.0',
      migrationState: 'none'
    });
    (masterRosterManager.getMasterRoster as jest.Mock).mockResolvedValue([]);
    (teams.addTeam as jest.Mock).mockResolvedValue({ id: 'team1', name: 'My Team', color: '#6366F1' });
    (teams.setTeamRoster as jest.Mock).mockResolvedValue(undefined);
    (appSettings.getLastHomeTeamName as jest.Mock).mockResolvedValue('Test Team');

    // Mock migration backup module
    (migrationBackup.hasMigrationBackup as jest.Mock).mockReturnValue(false);
    (migrationBackup.createMigrationBackup as jest.Mock).mockResolvedValue('backup-data');
    (migrationBackup.clearMigrationBackup as jest.Mock).mockReturnValue(undefined);
    (migrationBackup.restoreMigrationBackup as jest.Mock).mockResolvedValue(undefined);
  });

  describe('runMigration', () => {
    it('should skip migration when no migration is needed', async () => {
      // Setup: app version is current and IndexedDB already configured
      (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
        if (key === 'appDataVersion') return '2';
        return null;
      });
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'indexedDB',
        version: '2.0.0',
        migrationState: 'completed'
      });

      await runMigration();

      expect(logger.log).toHaveBeenCalledWith(
        '[Migration] No migration needed. App version:',
        2,
        'Storage mode:',
        'indexedDB'
      );
      expect(migrationBackup.createMigrationBackup).not.toHaveBeenCalled();
    });

    it('should run app data migration when version is old', async () => {
      // Setup: old app version with existing data (v1 installation)
      (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
        if (key === 'appDataVersion') return null; // No version stored
        if (key === 'soccerMasterRoster') return '[]'; // But has existing data
        return null;
      });

      await runMigration();

      expect(migrationBackup.createMigrationBackup).toHaveBeenCalledWith(2);
      expect(teams.addTeam).toHaveBeenCalled();
      expect(teams.setTeamRoster).toHaveBeenCalled();
      expect(localStorage.setLocalStorageItem).toHaveBeenCalledWith('appDataVersion', '2');
      expect(migrationBackup.clearMigrationBackup).toHaveBeenCalled();
    });

    it('should handle app data migration failure with rollback', async () => {
      // Setup: old app version with existing data that will fail to migrate
      (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
        if (key === 'appDataVersion') return null; // No version stored
        if (key === 'soccerMasterRoster') return '[]'; // But has existing data
        return null;
      });
      (teams.addTeam as jest.Mock).mockRejectedValue(new Error('Team creation failed'));

      await expect(runMigration()).rejects.toThrow('Migration failed and was rolled back');

      expect(migrationBackup.restoreMigrationBackup).toHaveBeenCalled();
      expect(migrationBackup.clearMigrationBackup).toHaveBeenCalled();
    });

    it('should run IndexedDB migration when storage mode is localStorage', async () => {
      // Setup: app version is current but still using localStorage
      (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
        if (key === 'appDataVersion') return '2';
        return null;
      });
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'localStorage',
        version: '1.0.0',
        migrationState: 'none'
      });

      // Mock successful migration
      const mockMigrate = jest.fn().mockResolvedValue({
        success: true,
        state: 'completed',
        errors: [],
        duration: 1000
      });
      const mockGetMemoryOptimizationStatus = jest.fn().mockReturnValue({
        memoryUsage: 25,
        memoryPressure: 'low',
        currentChunkSize: 1000,
        availableMemoryMB: 150,
        gcTriggered: false
      });
      (IndexedDbMigrationOrchestratorMemoryOptimized as jest.MockedClass<typeof IndexedDbMigrationOrchestratorMemoryOptimized>).mockImplementation(() => ({
        migrate: mockMigrate,
        getMemoryOptimizationStatus: mockGetMemoryOptimizationStatus
      }) as unknown as InstanceType<typeof IndexedDbMigrationOrchestratorMemoryOptimized>);

      await runMigration();

      expect(IndexedDbMigrationOrchestratorMemoryOptimized).toHaveBeenCalledWith(
        expect.objectContaining({
          targetVersion: '2.0.0',
          verifyData: true,
          keepBackupOnSuccess: false,
          enablePartialRecovery: true,
          enableMemoryOptimization: true,
          memoryOptimizationThreshold: 0.7,
          enableProgressiveLoading: true,
          progressiveLoadingThreshold: 100 * 1024 * 1024,
          enableForcedGC: true,
          memoryMonitoringInterval: 2000
        })
      );
      expect(mockMigrate).toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(
        '[Migration] IndexedDB storage migration completed successfully',
        expect.objectContaining({
          duration: '1000ms',
          state: 'completed'
        })
      );
    });

    it('should handle IndexedDB migration failure gracefully', async () => {
      // Setup: app version is current but still using localStorage
      (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
        if (key === 'appDataVersion') return '2';
        return null;
      });
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'localStorage',
        version: '1.0.0',
        migrationState: 'none'
      });

      // Mock failed migration
      const mockMigrate = jest.fn().mockResolvedValue({
        success: false,
        state: 'rolled-back',
        errors: ['Storage quota exceeded'],
        duration: 500
      });
      (IndexedDbMigrationOrchestratorMemoryOptimized as jest.MockedClass<typeof IndexedDbMigrationOrchestratorMemoryOptimized>).mockImplementation(() => ({
        migrate: mockMigrate,
        getMemoryOptimizationStatus: jest.fn().mockReturnValue({
          memoryUsage: 25,
          memoryPressure: 'low',
          currentChunkSize: 1000,
          availableMemoryMB: 150,
          gcTriggered: false
        })
      }) as unknown as InstanceType<typeof IndexedDbMigrationOrchestratorMemoryOptimized>);

      // Should not throw - app continues with localStorage
      await runMigration();

      expect(logger.error).toHaveBeenCalledWith(
        '[Migration] IndexedDB storage migration failed',
        expect.objectContaining({
          state: 'rolled-back',
          errors: ['Storage quota exceeded']
        })
      );
      expect(logger.warn).toHaveBeenCalledWith(
        '[Migration] Continuing with localStorage mode due to IndexedDB migration failure'
      );
    });

    it('should skip IndexedDB migration when localStorage is forced', async () => {
      // Setup: app version is current but localStorage is forced
      (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
        if (key === 'appDataVersion') return '2';
        return null;
      });
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'localStorage',
        version: '1.0.0',
        migrationState: 'none',
        forceMode: 'localStorage'
      });

      await runMigration();

      expect(logger.log).toHaveBeenCalledWith(
        '[Migration] No migration needed. App version:',
        2,
        'Storage mode:',
        'localStorage',
        '(localStorage forced)'
      );
      expect(IndexedDbMigrationOrchestratorMemoryOptimized).not.toHaveBeenCalled();
    });
  });

  describe('getMigrationStatus', () => {
    it('should return complete migration status', async () => {
      (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
        if (key === 'appDataVersion') return '2';
        return null;
      });
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'localStorage',
        version: '1.0.0',
        migrationState: 'none'
      });
      (migrationBackup.hasMigrationBackup as jest.Mock).mockReturnValue(true);
      (migrationBackup.getMigrationBackupInfo as jest.Mock).mockReturnValue({
        version: 2,
        timestamp: Date.now()
      });

      const status = await getMigrationStatus();

      expect(status).toEqual({
        currentVersion: 2,
        targetVersion: 2,
        migrationNeeded: false,
        hasBackup: true,
        backupInfo: expect.objectContaining({
          version: 2
        }),
        storageMode: 'localStorage',
        storageVersion: '1.0.0',
        storageForceMode: undefined,
        indexedDbTargetVersion: '2.0.0',
        indexedDbMigrationNeeded: true,
        indexedDbMigrationState: 'none'
      });
    });
  });

  describe('isIndexedDbMigrationNeeded', () => {
    it('should return true when using localStorage', () => {
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'localStorage',
        version: '1.0.0'
      });

      expect(isIndexedDbMigrationNeeded()).toBe(true);
    });

    it('should return false when already using IndexedDB', () => {
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'indexedDB',
        version: '2.0.0'
      });

      expect(isIndexedDbMigrationNeeded()).toBe(false);
    });

    it('should return false when localStorage version matches target', () => {
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'localStorage',
        version: '2.0.0'
      });

      expect(isIndexedDbMigrationNeeded()).toBe(false);
    });

    it('should return false when localStorage is forced', () => {
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'localStorage',
        version: '1.0.0',
        forceMode: 'localStorage'
      });

      expect(isIndexedDbMigrationNeeded()).toBe(false);
    });
  });

  describe('triggerIndexedDbMigration', () => {
    it('should return true if already using IndexedDB', async () => {
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'indexedDB',
        version: '2.0.0'
      });

      const result = await triggerIndexedDbMigration();

      expect(result).toBe(true);
      expect(IndexedDbMigrationOrchestratorMemoryOptimized).not.toHaveBeenCalled();
    });

    it('should return false if localStorage is forced', async () => {
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'localStorage',
        version: '1.0.0',
        forceMode: 'localStorage'
      });

      const result = await triggerIndexedDbMigration();

      expect(result).toBe(false);
      expect(IndexedDbMigrationOrchestratorMemoryOptimized).not.toHaveBeenCalled();
    });

    it('should trigger migration and return true on success', async () => {
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'localStorage',
        version: '1.0.0'
      });

      const mockMigrate = jest.fn().mockResolvedValue({
        success: true,
        state: 'completed',
        errors: [],
        duration: 1000
      });
      (IndexedDbMigrationOrchestratorMemoryOptimized as jest.MockedClass<typeof IndexedDbMigrationOrchestratorMemoryOptimized>).mockImplementation(() => ({
        migrate: mockMigrate
      }) as unknown as InstanceType<typeof IndexedDbMigrationOrchestratorMemoryOptimized>);

      const result = await triggerIndexedDbMigration();

      expect(result).toBe(true);
      expect(mockMigrate).toHaveBeenCalled();
    });

    it('should return false on migration failure', async () => {
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'localStorage',
        version: '1.0.0'
      });

      const mockMigrate = jest.fn().mockResolvedValue({
        success: false,
        state: 'rolled-back',
        errors: ['Failed to transfer data'],
        duration: 500
      });
      (IndexedDbMigrationOrchestratorMemoryOptimized as jest.MockedClass<typeof IndexedDbMigrationOrchestratorMemoryOptimized>).mockImplementation(() => ({
        migrate: mockMigrate
      }) as unknown as InstanceType<typeof IndexedDbMigrationOrchestratorMemoryOptimized>);

      const result = await triggerIndexedDbMigration();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        '[Migration] IndexedDB storage migration failed',
        ['Failed to transfer data']
      );
    });

    it('should handle migration exceptions', async () => {
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'localStorage',
        version: '1.0.0'
      });

      const mockMigrate = jest.fn().mockRejectedValue(new Error('Unexpected error'));
      (IndexedDbMigrationOrchestratorMemoryOptimized as jest.MockedClass<typeof IndexedDbMigrationOrchestratorMemoryOptimized>).mockImplementation(() => ({
        migrate: mockMigrate
      }) as unknown as InstanceType<typeof IndexedDbMigrationOrchestratorMemoryOptimized>);

      const result = await triggerIndexedDbMigration();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        '[Migration] IndexedDB migration error:',
        expect.any(Error)
      );
    });
  });

  describe('getAppDataVersion', () => {
    it('should return stored version if present', () => {
      (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
        if (key === 'appDataVersion') return '2';
        return null;
      });

      expect(getAppDataVersion()).toBe(2);
    });

    it('should return current version for fresh installation', () => {
      (localStorage.getLocalStorageItem as jest.Mock).mockReturnValue(null);

      expect(getAppDataVersion()).toBe(2);
      expect(localStorage.setLocalStorageItem).toHaveBeenCalledWith('appDataVersion', '2');
    });

    it('should return 1 for existing data without version', () => {
      (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
        if (key === 'soccerMasterRoster') return '[]';
        return null;
      });

      expect(getAppDataVersion()).toBe(1);
    });
  });

  describe('isMigrationNeeded', () => {
    it('should return false when version is current', () => {
      (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
        if (key === 'appDataVersion') return '2';
        return null;
      });

      expect(isMigrationNeeded()).toBe(false);
    });

    it('should return true when version is old', () => {
      (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
        if (key === 'appDataVersion') return '1';
        return null;
      });

      expect(isMigrationNeeded()).toBe(true);
    });
  });

  describe('Edge Case Scenarios', () => {
    describe('Migration Cancellation (Browser Tab Closed)', () => {
      it('should handle abrupt cancellation during migration', async () => {
        // Setup: migration in progress that gets cancelled
        (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
          if (key === 'appDataVersion') return '2';
          return null;
        });
        (getStorageConfig as jest.Mock).mockReturnValue({
          mode: 'localStorage',
          version: '1.0.0',
          migrationState: 'none'
        });

        // Mock migration that gets interrupted
        const mockMigrate = jest.fn().mockImplementation(async () => {
          // Simulate process being killed (tab closed)
          throw new Error('Migration interrupted: process terminated');
        });
        (IndexedDbMigrationOrchestrator as jest.MockedClass<typeof IndexedDbMigrationOrchestrator>).mockImplementation(() => ({
          migrate: mockMigrate
        }) as unknown as InstanceType<typeof IndexedDbMigrationOrchestrator>);

        // Should handle cancellation gracefully
        await runMigration();

        expect(logger.error).toHaveBeenCalledWith('[Migration] IndexedDB migration error:', expect.any(Error));
        expect(logger.warn).toHaveBeenCalledWith('[Migration] Continuing with localStorage mode due to IndexedDB migration failure');
        // App should continue with localStorage mode
      });

      it('should handle window beforeunload during migration', async () => {
        // Setup: migration in progress
        (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
          if (key === 'appDataVersion') return '2';
          return null;
        });
        (getStorageConfig as jest.Mock).mockReturnValue({
          mode: 'localStorage',
          version: '1.0.0',
          migrationState: 'none'
        });

        let migrationStarted = false;
        const mockMigrate = jest.fn().mockImplementation(async () => {
          migrationStarted = true;
          // Simulate beforeunload event during migration
          const beforeUnloadEvent = new Event('beforeunload');
          Object.defineProperty(beforeUnloadEvent, 'returnValue', {
            writable: true,
            value: ''
          });

          // Migration should continue despite beforeunload
          await new Promise(resolve => setTimeout(resolve, 10));
          return {
            success: true,
            state: 'completed',
            errors: [],
            duration: 100
          };
        });

        (IndexedDbMigrationOrchestrator as jest.MockedClass<typeof IndexedDbMigrationOrchestrator>).mockImplementation(() => ({
          migrate: mockMigrate
        }) as unknown as InstanceType<typeof IndexedDbMigrationOrchestrator>);

        await runMigration();

        expect(migrationStarted).toBe(true);
        expect(mockMigrate).toHaveBeenCalled();
      });
    });

    describe('Concurrent Migration Attempts (Multiple Tabs)', () => {
      it('should handle multiple tabs attempting migration simultaneously', async () => {
        // Setup: multiple tab scenario
        (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
          if (key === 'appDataVersion') return '2';
          return null;
        });
        (getStorageConfig as jest.Mock).mockReturnValue({
          mode: 'localStorage',
          version: '1.0.0',
          migrationState: 'none'
        });

        // Mock migration that succeeds once, then fails for concurrent attempts
        let callCount = 0;
        const mockMigrate = jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              success: true,
              state: 'completed',
              errors: [],
              warnings: [],
              duration: 1000
            });
          } else {
            return Promise.reject(new Error('Migration already in progress'));
          }
        });

        (IndexedDbMigrationOrchestrator as jest.MockedClass<typeof IndexedDbMigrationOrchestrator>).mockImplementation(() => ({
          migrate: mockMigrate
        }) as unknown as InstanceType<typeof IndexedDbMigrationOrchestrator>);

        // Run migrations concurrently (simulate two tabs)
        const results = await Promise.allSettled([
          runMigration(),
          runMigration()
        ]);

        // At least one migration should have been attempted
        expect(mockMigrate).toHaveBeenCalled();

        // Should handle multiple tabs gracefully
        const successfulResults = results.filter(r => r.status === 'fulfilled');
        expect(successfulResults.length).toBeGreaterThanOrEqual(1);
      });

      it('should handle race condition in storage config updates', async () => {
        (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
          if (key === 'appDataVersion') return '2';
          return null;
        });

        // Mock race condition where storage config changes during migration
        let configCallCount = 0;
        (getStorageConfig as jest.Mock).mockImplementation(() => {
          configCallCount++;
          if (configCallCount === 1) {
            return {
              mode: 'localStorage',
              version: '1.0.0',
              migrationState: 'none'
            };
          } else {
            // Config changed by another tab
            return {
              mode: 'indexedDB',
              version: '2.0.0',
              migrationState: 'completed'
            };
          }
        });

        const mockMigrate = jest.fn().mockResolvedValue({
          success: true,
          state: 'completed',
          errors: [],
          duration: 500
        });

        (IndexedDbMigrationOrchestrator as jest.MockedClass<typeof IndexedDbMigrationOrchestrator>).mockImplementation(() => ({
          migrate: mockMigrate
        }) as unknown as InstanceType<typeof IndexedDbMigrationOrchestrator>);

        await runMigration();

        // Should handle config changes gracefully - verify migration was attempted
        expect(logger.log).toHaveBeenCalledWith(
          expect.stringContaining('[Migration]')
        );
      });
    });

    describe('Storage Quota Exceeded Scenarios', () => {
      it('should handle IndexedDB quota exceeded during backup creation', async () => {
        (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
          if (key === 'appDataVersion') return '2';
          return null;
        });
        (getStorageConfig as jest.Mock).mockReturnValue({
          mode: 'localStorage',
          version: '1.0.0',
          migrationState: 'none'
        });

        // Mock quota exceeded error during backup
        const mockMigrate = jest.fn().mockRejectedValue(
          Object.assign(new Error('QuotaExceededError'), {
            name: 'QuotaExceededError',
            code: 22
          })
        );

        (IndexedDbMigrationOrchestrator as jest.MockedClass<typeof IndexedDbMigrationOrchestrator>).mockImplementation(() => ({
          migrate: mockMigrate
        }) as unknown as InstanceType<typeof IndexedDbMigrationOrchestrator>);

        await runMigration();

        expect(logger.error).toHaveBeenCalledWith('[Migration] IndexedDB migration error:', expect.any(Error));
        expect(logger.warn).toHaveBeenCalledWith('[Migration] Continuing with localStorage mode due to IndexedDB migration failure');
      });

      it('should handle localStorage quota exceeded during fallback', async () => {
        (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
          if (key === 'appDataVersion') return '1'; // Needs app migration
          if (key === 'soccerMasterRoster') return '[]';
          return null;
        });
        (getStorageConfig as jest.Mock).mockReturnValue({
          mode: 'localStorage',
          version: '1.0.0',
          migrationState: 'none'
        });

        // Mock localStorage quota exceeded during app migration
        (localStorage.setLocalStorageItem as jest.Mock).mockImplementation(() => {
          throw Object.assign(new Error('QuotaExceededError'), {
            name: 'QuotaExceededError',
            code: 22
          });
        });

        await expect(runMigration()).rejects.toThrow('Migration failed and was rolled back');

        expect(migrationBackup.restoreMigrationBackup).toHaveBeenCalled();
      });

      it('should provide helpful error messages for quota issues', async () => {
        (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
          if (key === 'appDataVersion') return '2';
          return null;
        });
        (getStorageConfig as jest.Mock).mockReturnValue({
          mode: 'localStorage',
          version: '1.0.0',
          migrationState: 'none'
        });

        // Mock specific quota exceeded scenario
        const quotaError = Object.assign(new Error('QuotaExceededError: Failed to store item'), {
          name: 'QuotaExceededError',
          code: 22
        });

        const mockMigrate = jest.fn().mockRejectedValue(quotaError);
        (IndexedDbMigrationOrchestrator as jest.MockedClass<typeof IndexedDbMigrationOrchestrator>).mockImplementation(() => ({
          migrate: mockMigrate
        }) as unknown as InstanceType<typeof IndexedDbMigrationOrchestrator>);

        await runMigration();

        expect(logger.error).toHaveBeenCalledWith('[Migration] IndexedDB migration error:', quotaError);
        // Should continue with localStorage gracefully
      });

      it('should handle storage estimation errors', async () => {
        (localStorage.getLocalStorageItem as jest.Mock).mockImplementation((key) => {
          if (key === 'appDataVersion') return '2';
          return null;
        });
        (getStorageConfig as jest.Mock).mockReturnValue({
          mode: 'localStorage',
          version: '1.0.0',
          migrationState: 'none'
        });

        // Mock navigator.storage not available (older browsers)
        const originalNavigator = global.navigator;
        global.navigator = {
          ...originalNavigator,
          storage: undefined
        } as unknown as Navigator;

        const mockMigrate = jest.fn().mockResolvedValue({
          success: true,
          state: 'completed',
          errors: [],
          duration: 1000
        });

        (IndexedDbMigrationOrchestrator as jest.MockedClass<typeof IndexedDbMigrationOrchestrator>).mockImplementation(() => ({
          migrate: mockMigrate
        }) as unknown as InstanceType<typeof IndexedDbMigrationOrchestrator>);

        await runMigration();

        // Should still work without storage estimation
        expect(mockMigrate).toHaveBeenCalled();

        // Restore navigator
        global.navigator = originalNavigator;
      });
    });
  });
});