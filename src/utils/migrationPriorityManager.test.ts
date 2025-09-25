/**
 * Tests for Migration Priority Manager
 *
 * Validates data classification logic and priority-based sorting for background migration.
 */

import {
  MigrationPriorityManager,
  MigrationPriority,
  createPriorityManager,
  DataClassification,
  PriorityConfiguration
} from './migrationPriorityManager';

describe('MigrationPriorityManager', () => {
  let manager: MigrationPriorityManager;
  const mockConfig: Partial<PriorityConfiguration> = {
    criticalSizeLimit: 50 * 1024, // 50KB
    importantSizeLimit: 500 * 1024, // 500KB
    backgroundAgeThreshold: 30, // 30 days
    currentGameId: 'game_123'
  };

  beforeEach(() => {
    manager = new MigrationPriorityManager(mockConfig);
  });

  describe('classifyData', () => {
    describe('critical data classification', () => {
      it('should classify app settings as critical', () => {
        const result = manager.classifyData('soccerAppSettings', 1024);

        expect(result.priority).toBe(MigrationPriority.CRITICAL);
        expect(result.reasoning).toContain('App settings required for basic functionality');
      });

      it('should classify roster data as critical', () => {
        const result = manager.classifyData('soccerMasterRoster', 25600);

        expect(result.priority).toBe(MigrationPriority.CRITICAL);
        expect(result.reasoning).toContain('Player roster needed for game creation');
      });

      it('should classify current game data as critical', () => {
        const result = manager.classifyData('soccerSavedGames_game_123', 5120);

        expect(result.priority).toBe(MigrationPriority.CRITICAL);
        expect(result.reasoning).toContain('Current active game data');
      });

      it('should classify user profile data as critical', () => {
        const result = manager.classifyData('userProfile', 2048);

        expect(result.priority).toBe(MigrationPriority.CRITICAL);
        expect(result.reasoning).toContain('Critical app functionality data');
      });

      it('should classify configuration data as critical', () => {
        const result = manager.classifyData('appConfig', 1536);

        expect(result.priority).toBe(MigrationPriority.CRITICAL);
        expect(result.reasoning).toBe('App settings required for basic functionality');
      });
    });

    describe('important data classification', () => {
      it('should classify small datasets as important', () => {
        const result = manager.classifyData('someSmallData', 25600); // 25KB < 50KB limit

        expect(result.priority).toBe(MigrationPriority.IMPORTANT);
        expect(result.reasoning).toBe('Small dataset - migrate soon');
      });

      it('should classify recent games as important', () => {
        const recentDate = Date.now() - (10 * 24 * 60 * 60 * 1000); // 10 days ago
        const metadata = { lastModified: recentDate };

        const result = manager.classifyData('soccerGame_recent', 102400, metadata); // 100KB

        expect(result.priority).toBe(MigrationPriority.IMPORTANT);
        expect(result.reasoning).toContain('Recent or active data');
      });

      it('should classify active season as important', () => {
        const metadata = { isActive: true };

        const result = manager.classifyData('season_2024', 204800, metadata); // 200KB

        expect(result.priority).toBe(MigrationPriority.IMPORTANT);
        expect(result.reasoning).toContain('Recent or active data');
      });

      it('should classify current tournament as important', () => {
        const metadata = { isCurrent: true };

        const result = manager.classifyData('tournament_current', 153600, metadata); // 150KB

        expect(result.priority).toBe(MigrationPriority.IMPORTANT);
        expect(result.reasoning).toContain('Recent or active data');
      });
    });

    describe('background data classification', () => {
      it('should classify large datasets as background', () => {
        const result = manager.classifyData('massiveHistoricalData', 1024 * 1024); // 1MB

        expect(result.priority).toBe(MigrationPriority.BACKGROUND);
        expect(result.reasoning).toBe('Large dataset - migrate during idle time');
      });

      it('should classify old games as background', () => {
        const oldDate = Date.now() - (60 * 24 * 60 * 60 * 1000); // 60 days ago
        const metadata = { lastModified: oldDate };

        const result = manager.classifyData('soccerGame_old', 102400, metadata); // 100KB

        expect(result.priority).toBe(MigrationPriority.BACKGROUND);
        expect(result.reasoning).toBe('Historical data - migrate when convenient');
      });

      it('should classify unknown data as background by default', () => {
        const result = manager.classifyData('unknownData', 76800); // 75KB

        expect(result.priority).toBe(MigrationPriority.BACKGROUND);
        expect(result.reasoning).toBe('Historical data - migrate when convenient');
      });

      it('should classify games without metadata as background if size is large', () => {
        const result = manager.classifyData('soccerGame_noMetadata', 600 * 1024); // 600KB > important limit

        expect(result.priority).toBe(MigrationPriority.BACKGROUND);
        expect(result.reasoning).toBe('Large dataset - migrate during idle time');
      });
    });
  });

  describe('classifyAndSortData', () => {
    it('should classify and sort data by priority and size', () => {
      const entries = [
        { key: 'largeBackground', size: 1024 * 1024 }, // 1MB background
        { key: 'soccerAppSettings', size: 2048 }, // Critical
        { key: 'smallImportant', size: 30720 }, // 30KB important
        { key: 'soccerMasterRoster', size: 51200 }, // 50KB critical
        { key: 'mediumBackground', size: 512 * 1024 }, // 512KB background
        { key: 'tinyImportant', size: 10240 } // 10KB important
      ];

      const result = manager.classifyAndSortData(entries);

      // Should be sorted by priority first, then size within priority
      expect(result[0].key).toBe('soccerAppSettings'); // Critical, smallest
      expect(result[0].priority).toBe(MigrationPriority.CRITICAL);

      expect(result[1].key).toBe('soccerMasterRoster'); // Critical, larger
      expect(result[1].priority).toBe(MigrationPriority.CRITICAL);

      expect(result[2].key).toBe('tinyImportant'); // Important, smallest
      expect(result[2].priority).toBe(MigrationPriority.IMPORTANT);

      expect(result[3].key).toBe('smallImportant'); // Important, larger
      expect(result[3].priority).toBe(MigrationPriority.IMPORTANT);

      expect(result[4].key).toBe('mediumBackground'); // Background, smaller
      expect(result[4].priority).toBe(MigrationPriority.BACKGROUND);

      expect(result[5].key).toBe('largeBackground'); // Background, largest
      expect(result[5].priority).toBe(MigrationPriority.BACKGROUND);
    });

    it('should handle empty array', () => {
      const result = manager.classifyAndSortData([]);
      expect(result).toEqual([]);
    });

    it('should handle single entry', () => {
      const entries = [{ key: 'singleEntry', size: 1024 }];
      const result = manager.classifyAndSortData(entries);

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('singleEntry');
    });
  });

  describe('getEntriesByPriority', () => {
    let classifications: DataClassification[];

    beforeEach(() => {
      const entries = [
        { key: 'unknownLargeData', size: 600000 }, // Background (large, unknown)
        { key: 'soccerAppSettings', size: 2048 }, // Critical
        { key: 'important1', size: 30720 }, // Important (small)
        { key: 'background1', size: 1024000 } // Background (large)
      ];
      classifications = manager.classifyAndSortData(entries);
    });

    it('should return only critical entries', () => {
      const critical = manager.getEntriesByPriority(classifications, MigrationPriority.CRITICAL);

      expect(critical).toHaveLength(1);
      expect(critical[0].key).toBe('soccerAppSettings');
    });

    it('should return only important entries', () => {
      const important = manager.getEntriesByPriority(classifications, MigrationPriority.IMPORTANT);

      expect(important).toHaveLength(1);
      expect(important[0].key).toBe('important1');
    });

    it('should return only background entries', () => {
      const background = manager.getEntriesByPriority(classifications, MigrationPriority.BACKGROUND);

      expect(background).toHaveLength(2);
      expect(background.map(b => b.key)).toContain('unknownLargeData');
      expect(background.map(b => b.key)).toContain('background1');
    });
  });

  describe('priority checks', () => {
    it('should identify critical priority for immediate processing', () => {
      expect(manager.shouldProcessImmediately(MigrationPriority.CRITICAL)).toBe(true);
      expect(manager.shouldProcessImmediately(MigrationPriority.IMPORTANT)).toBe(false);
      expect(manager.shouldProcessImmediately(MigrationPriority.BACKGROUND)).toBe(false);
    });

    it('should identify background priority for idle processing', () => {
      expect(manager.shouldProcessDuringIdle(MigrationPriority.BACKGROUND)).toBe(true);
      expect(manager.shouldProcessDuringIdle(MigrationPriority.IMPORTANT)).toBe(false);
      expect(manager.shouldProcessDuringIdle(MigrationPriority.CRITICAL)).toBe(false);
    });
  });

  describe('current game ID updates', () => {
    it('should update current game ID for priority calculations', () => {
      manager.updateCurrentGameId('new_game_456');

      const result = manager.classifyData('soccerSavedGames_new_game_456', 5120);
      expect(result.priority).toBe(MigrationPriority.CRITICAL);
      expect(result.reasoning).toContain('Current active game data');
    });

    it('should handle undefined game ID', () => {
      manager.updateCurrentGameId(undefined);

      const result = manager.classifyData('soccerSavedGames_game_123', 5120);
      // Should not be critical anymore since no current game ID
      expect(result.priority).toBe(MigrationPriority.IMPORTANT);
    });
  });

  describe('edge cases', () => {
    it('should handle data with zero size', () => {
      const result = manager.classifyData('emptyData', 0);
      expect(result.priority).toBe(MigrationPriority.IMPORTANT); // Small size
      expect(result.estimatedSize).toBe(0);
    });

    it('should handle very large data sizes', () => {
      const result = manager.classifyData('massiveData', Number.MAX_SAFE_INTEGER);
      expect(result.priority).toBe(MigrationPriority.BACKGROUND);
    });

    it('should handle special characters in key names', () => {
      const result = manager.classifyData('data@#$%^&*()', 1024);
      expect(result.priority).toBe(MigrationPriority.IMPORTANT); // Small size = important
      expect(result.key).toBe('data@#$%^&*()');
    });

    it('should handle metadata with missing fields', () => {
      const metadata = { someField: 'value' }; // No lastModified, isActive, etc.
      const result = manager.classifyData('gameWithIncompleteMetadata', 100000, metadata);

      expect(result.priority).toBe(MigrationPriority.IMPORTANT); // Game data < importantSizeLimit
    });
  });

  describe('createPriorityManager factory', () => {
    it('should create manager with default config', () => {
      const manager = createPriorityManager();

      const result = manager.classifyData('soccerAppSettings', 1024);
      expect(result.priority).toBe(MigrationPriority.CRITICAL);
    });

    it('should create manager with custom config', () => {
      const customConfig = {
        criticalSizeLimit: 100 * 1024, // 100KB
        currentGameId: 'custom_game'
      };

      const manager = createPriorityManager(customConfig);

      const result = manager.classifyData('soccerSavedGames_custom_game', 5120);
      expect(result.priority).toBe(MigrationPriority.CRITICAL);
    });
  });

  describe('realistic scenarios', () => {
    it('should properly classify a typical app dataset', () => {
      const typicalEntries = [
        { key: 'soccerAppSettings', size: 2048 },
        { key: 'soccerMasterRoster', size: 25600 },
        { key: 'soccerSavedGames_current', size: 10240 },
        { key: 'soccerSavedGames_archived', size: 1024000 },
        { key: 'seasonsList', size: 5120 },
        { key: 'tournamentsList', size: 3072 },
        { key: 'gameStats_recent', size: 51200, metadata: { lastModified: Date.now() - 86400000 } }, // 1 day ago
        { key: 'gameStats_old', size: 204800, metadata: { lastModified: Date.now() - 5184000000 } } // 60 days ago
      ];

      const result = manager.classifyAndSortData(typicalEntries);

      // Check critical entries are first
      const critical = result.filter(r => r.priority === MigrationPriority.CRITICAL);
      expect(critical.length).toBe(2); // Settings and roster
      expect(critical.map(c => c.key)).toContain('soccerAppSettings');
      expect(critical.map(c => c.key)).toContain('soccerMasterRoster');

      // Check important entries
      const important = result.filter(r => r.priority === MigrationPriority.IMPORTANT);
      expect(important.length).toBeGreaterThan(0);

      // Check background entries include large/old data
      const background = result.filter(r => r.priority === MigrationPriority.BACKGROUND);
      expect(background.map(b => b.key)).toContain('soccerSavedGames_archived');
      expect(background.map(b => b.key)).toContain('gameStats_old');
    });
  });
});