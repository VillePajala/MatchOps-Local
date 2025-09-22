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
import { getStorageConfig, updateStorageConfig } from './storageFactory';
import { IndexedDbMigrationOrchestrator } from './indexedDbMigration';
import * as migrationBackup from './migrationBackup';
import * as localStorage from './localStorage';
import * as masterRosterManager from './masterRosterManager';
import * as teams from './teams';
import * as appSettings from './appSettings';
import logger from './logger';

// Mock dependencies
jest.mock('./storageFactory');
jest.mock('./indexedDbMigration');
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
      (IndexedDbMigrationOrchestrator as jest.MockedClass<any>).mockImplementation(() => ({
        migrate: mockMigrate
      }));

      await runMigration();

      expect(IndexedDbMigrationOrchestrator).toHaveBeenCalledWith(
        expect.objectContaining({
          targetVersion: '2.0.0',
          verifyData: true,
          keepBackupOnSuccess: false,
          enablePartialRecovery: true
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
      (IndexedDbMigrationOrchestrator as jest.MockedClass<any>).mockImplementation(() => ({
        migrate: mockMigrate
      }));

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
  });

  describe('triggerIndexedDbMigration', () => {
    it('should return true if already using IndexedDB', async () => {
      (getStorageConfig as jest.Mock).mockReturnValue({
        mode: 'indexedDB',
        version: '2.0.0'
      });

      const result = await triggerIndexedDbMigration();

      expect(result).toBe(true);
      expect(IndexedDbMigrationOrchestrator).not.toHaveBeenCalled();
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
      (IndexedDbMigrationOrchestrator as jest.MockedClass<any>).mockImplementation(() => ({
        migrate: mockMigrate
      }));

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
      (IndexedDbMigrationOrchestrator as jest.MockedClass<any>).mockImplementation(() => ({
        migrate: mockMigrate
      }));

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
      (IndexedDbMigrationOrchestrator as jest.MockedClass<any>).mockImplementation(() => ({
        migrate: mockMigrate
      }));

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
});