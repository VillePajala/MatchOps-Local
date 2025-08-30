import { 
  createMigrationBackup, 
  restoreMigrationBackup, 
  clearMigrationBackup,
  hasMigrationBackup,
  getMigrationBackupInfo,
  validateMigrationBackup,
  MigrationBackup
} from './migrationBackup';

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    getStore: () => ({ ...store }),
    setStore: (newStore: Record<string, string>) => {
      store = { ...newStore };
    }
  };
})();

// Mock the migration module
jest.mock('./migration', () => ({
  getAppDataVersion: jest.fn(() => 1)
}));

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage
});

describe('Migration Backup System', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
    
    // Set up some test data
    mockLocalStorage.setItem('soccerMasterRoster', JSON.stringify([
      { id: '1', name: 'Player 1' },
      { id: '2', name: 'Player 2' }
    ]));
    mockLocalStorage.setItem('soccerAppSettings', JSON.stringify({ 
      language: 'en',
      theme: 'light'
    }));
    mockLocalStorage.setItem('appDataVersion', '1');
  });

  describe('createMigrationBackup', () => {
    it('should create a complete backup of all critical data', async () => {
      const backup = await createMigrationBackup(2);
      
      expect(backup).toMatchObject({
        version: 1,
        targetVersion: 2,
        timestamp: expect.any(Number),
        data: expect.any(Object),
        checksum: expect.any(String)
      });
      
      // Should include all critical keys
      expect(backup.data).toHaveProperty('soccerMasterRoster');
      expect(backup.data).toHaveProperty('soccerAppSettings');
      expect(backup.data).toHaveProperty('appDataVersion');
      
      // Should preserve the actual data
      expect(backup.data.soccerMasterRoster).toContain('Player 1');
      expect(backup.data.soccerAppSettings).toContain('language');
    });

    it('should store backup temporarily in localStorage', async () => {
      await createMigrationBackup(2);
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'MIGRATION_BACKUP_TEMP',
        expect.any(String)
      );
      
      const storedBackup = mockLocalStorage.getItem('MIGRATION_BACKUP_TEMP');
      expect(storedBackup).toBeTruthy();
      
      const parsedBackup = JSON.parse(storedBackup!);
      expect(parsedBackup).toHaveProperty('data');
      expect(parsedBackup).toHaveProperty('checksum');
    });

    it('should generate consistent checksums', async () => {
      const backup1 = await createMigrationBackup(2);
      
      // Clear and recreate same data
      mockLocalStorage.clear();
      mockLocalStorage.setItem('soccerMasterRoster', JSON.stringify([
        { id: '1', name: 'Player 1' },
        { id: '2', name: 'Player 2' }
      ]));
      mockLocalStorage.setItem('soccerAppSettings', JSON.stringify({ 
        language: 'en',
        theme: 'light'
      }));
      mockLocalStorage.setItem('appDataVersion', '1');
      
      const backup2 = await createMigrationBackup(2);
      
      expect(backup1.checksum).toBe(backup2.checksum);
    });

    it('should handle missing keys gracefully', async () => {
      mockLocalStorage.clear();
      mockLocalStorage.setItem('soccerMasterRoster', JSON.stringify([]));
      
      const backup = await createMigrationBackup(2);
      
      expect(backup.data.soccerMasterRoster).toBeTruthy();
      expect(backup.data.soccerAppSettings).toBeNull();
      expect(backup.checksum).toBeTruthy();
    });

    it('should throw error if storage operation fails', async () => {
      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('Storage quota exceeded');
      });
      
      await expect(createMigrationBackup(2)).rejects.toThrow(/Failed to store migration backup/);
    });
  });

  describe('restoreMigrationBackup', () => {
    it('should restore all data from backup', async () => {
      // Create backup
      const backup = await createMigrationBackup(2);
      
      // Modify current data
      mockLocalStorage.setItem('soccerMasterRoster', JSON.stringify([
        { id: '3', name: 'New Player' }
      ]));
      mockLocalStorage.setItem('soccerAppSettings', JSON.stringify({
        language: 'fi'
      }));
      
      // Restore from backup
      await restoreMigrationBackup(backup);
      
      // Should restore original data
      const restoredRoster = mockLocalStorage.getItem('soccerMasterRoster');
      expect(restoredRoster).toContain('Player 1');
      expect(restoredRoster).not.toContain('New Player');
      
      const restoredSettings = mockLocalStorage.getItem('soccerAppSettings');
      expect(restoredSettings).toContain('language":"en');
    });

    it('should restore from stored backup if none provided', async () => {
      // Create backup (stores it automatically)
      await createMigrationBackup(2);
      
      // Modify data
      mockLocalStorage.setItem('soccerMasterRoster', '[]');
      
      // Restore without providing backup
      await restoreMigrationBackup();
      
      // Should restore original data
      const restored = mockLocalStorage.getItem('soccerMasterRoster');
      expect(restored).toContain('Player 1');
    });

    it('should verify backup integrity before restoring', async () => {
      const backup = await createMigrationBackup(2);
      
      // Corrupt the backup
      backup.checksum = 'invalid-checksum';
      
      await expect(restoreMigrationBackup(backup)).rejects.toThrow(/integrity check failed/);
    });

    it('should handle missing backup gracefully', async () => {
      await expect(restoreMigrationBackup()).rejects.toThrow(/No migration backup found/);
    });

    it('should handle corrupted stored backup', async () => {
      mockLocalStorage.setItem('MIGRATION_BACKUP_TEMP', 'invalid-json');
      
      await expect(restoreMigrationBackup()).rejects.toThrow(/Failed to parse/);
    });
  });

  describe('validateMigrationBackup', () => {
    it('should validate correct backup structure', async () => {
      const backup = await createMigrationBackup(2);
      const validation = validateMigrationBackup(backup);
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const invalidBackup = {
        // Missing timestamp
        version: 1,
        targetVersion: 2,
        data: {},
        checksum: 'test'
      } as MigrationBackup;
      
      const validation = validateMigrationBackup(invalidBackup);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(error => /timestamp/.test(error))).toBe(true);
    });

    it('should detect checksum mismatches', async () => {
      const backup = await createMigrationBackup(2);
      backup.data.soccerMasterRoster = 'tampered-data';
      
      const validation = validateMigrationBackup(backup);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(error => /checksum mismatch/i.test(error))).toBe(true);
    });

    it('should warn about old backups', async () => {
      const backup = await createMigrationBackup(2);
      backup.timestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      
      const validation = validateMigrationBackup(backup);
      
      expect(validation.errors.some(error => /hours old/.test(error))).toBe(true);
    });
  });

  describe('backup management functions', () => {
    it('should detect when backup exists', async () => {
      expect(hasMigrationBackup()).toBe(false);
      
      await createMigrationBackup(2);
      
      expect(hasMigrationBackup()).toBe(true);
    });

    it('should get backup info without loading full data', async () => {
      expect(getMigrationBackupInfo()).toBeNull();
      
      const backup = await createMigrationBackup(2);
      const info = getMigrationBackupInfo();
      
      expect(info).toMatchObject({
        timestamp: backup.timestamp,
        version: backup.version,
        targetVersion: backup.targetVersion
      });
    });

    it('should clear backup correctly', async () => {
      await createMigrationBackup(2);
      expect(hasMigrationBackup()).toBe(true);
      
      clearMigrationBackup();
      expect(hasMigrationBackup()).toBe(false);
    });

    it('should handle corrupt backup info gracefully', () => {
      mockLocalStorage.setItem('MIGRATION_BACKUP_TEMP', 'invalid-json');
      
      expect(getMigrationBackupInfo()).toBeNull();
    });
  });

  describe('error scenarios', () => {
    it('should handle localStorage errors during backup creation', async () => {
      mockLocalStorage.getItem.mockImplementationOnce(() => {
        throw new Error('localStorage error');
      });
      
      await expect(createMigrationBackup(2)).rejects.toThrow(/Failed to backup data/);
    });

    it('should provide detailed error messages', async () => {
      mockLocalStorage.getItem.mockImplementationOnce(() => {
        throw new Error('Quota exceeded');
      });
      
      try {
        await createMigrationBackup(2);
        fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toContain('soccerMasterRoster');
        expect((error as Error).message).toContain('Quota exceeded');
      }
    });

    it('should count restore errors correctly', async () => {
      const backup = await createMigrationBackup(2);
      
      // Mock setItem to fail for specific keys
      let failCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      mockLocalStorage.setItem.mockImplementation((key: string, _value: string) => {
        if (key.startsWith('soccer') && failCount < 2) {
          failCount++;
          throw new Error('Storage error');
        }
      });
      
      await expect(restoreMigrationBackup(backup)).rejects.toThrow(/Failed to restore 2 keys/);
    });
  });

  describe('edge cases', () => {
    it('should handle empty data gracefully', async () => {
      mockLocalStorage.clear();
      
      const backup = await createMigrationBackup(2);
      
      expect(backup.data).toBeDefined();
      expect(backup.checksum).toBeTruthy();
    });

    it('should preserve null values in backup', async () => {
      const backup = await createMigrationBackup(2);
      
      // Should have null for keys that don't exist
      const nonExistentKeys = Object.keys(backup.data).filter(
        key => backup.data[key] === null
      );
      
      expect(nonExistentKeys.length).toBeGreaterThan(0);
    });

    it('should handle large data sets', async () => {
      // Create large dataset
      const largeRoster = Array.from({ length: 100 }, (_, i) => ({
        id: `player-${i}`,
        name: `Player ${i}`,
        stats: Array.from({ length: 10 }, (_, j) => ({ game: j, score: Math.random() }))
      }));
      
      // Ensure the item is properly set in our mock
      const rosterJson = JSON.stringify(largeRoster);
      mockLocalStorage.getItem.mockImplementation((key: string) => {
        if (key === 'soccerMasterRoster') return rosterJson;
        if (key === 'appDataVersion') return '1';
        return null;
      });
      
      const backup = await createMigrationBackup(2);
      
      expect(backup.checksum).toBeTruthy();
      expect(backup.data.soccerMasterRoster).toBeTruthy();
      expect(backup.data.soccerMasterRoster).toContain('player-99');
    });
  });
});