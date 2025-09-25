/**
 * Test fixtures for migration components
 *
 * Provides consistent, reusable test data for migration-related tests
 * following the established fixture architecture patterns.
 *
 * @critical - Used in core migration workflow tests
 */

import { BackgroundTask } from '../../utils/backgroundMigrationScheduler';
import { DataClassification, MigrationPriority } from '../../utils/migrationPriorityManager';

/**
 * Background task fixtures for scheduler tests
 */
export const MigrationFixtures = {
  /**
   * Creates a basic background task with optional overrides
   * @param overrides - Optional properties to override defaults
   */
  backgroundTask: (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
    id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Task',
    priority: 1,
    estimatedDuration: 10,
    processor: jest.fn().mockResolvedValue(undefined),
    ...overrides
  }),

  /**
   * Creates a background task that throws an error
   * Useful for testing error handling scenarios
   */
  failingBackgroundTask: (errorMessage = 'Test error'): BackgroundTask => ({
    id: `failing_task_${Date.now()}`,
    name: 'Failing Test Task',
    priority: 1,
    estimatedDuration: 10,
    processor: jest.fn().mockRejectedValue(new Error(errorMessage)),
    onError: jest.fn()
  }),

  /**
   * Creates a long-running background task
   * Useful for testing timeout and cancellation scenarios
   */
  longRunningTask: (duration = 1000): BackgroundTask => ({
    id: `long_task_${Date.now()}`,
    name: 'Long Running Task',
    priority: 5,
    estimatedDuration: duration,
    processor: jest.fn().mockImplementation(() =>
      new Promise(resolve => setTimeout(resolve, duration))
    )
  }),

  /**
   * Creates multiple background tasks with different priorities
   * Useful for testing priority queue ordering
   */
  priorityTaskSet: (): BackgroundTask[] => [
    {
      id: 'high_priority',
      name: 'High Priority Task',
      priority: 1,
      estimatedDuration: 5,
      processor: jest.fn().mockResolvedValue(undefined)
    },
    {
      id: 'medium_priority',
      name: 'Medium Priority Task',
      priority: 5,
      estimatedDuration: 15,
      processor: jest.fn().mockResolvedValue(undefined)
    },
    {
      id: 'low_priority',
      name: 'Low Priority Task',
      priority: 10,
      estimatedDuration: 20,
      processor: jest.fn().mockResolvedValue(undefined)
    }
  ],

  /**
   * Data classification fixtures for priority manager tests
   */
  dataClassification: {
    /**
     * Creates a critical data classification
     */
    critical: (key = 'soccerAppSettings'): DataClassification => ({
      key,
      priority: MigrationPriority.CRITICAL,
      estimatedSize: 1024,
      reasoning: 'App settings required for basic functionality'
    }),

    /**
     * Creates an important data classification
     */
    important: (key = 'recentGame'): DataClassification => ({
      key,
      priority: MigrationPriority.IMPORTANT,
      estimatedSize: 5120,
      reasoning: 'Recent data needed for optimal experience'
    }),

    /**
     * Creates a background data classification
     */
    background: (key = 'oldGameData'): DataClassification => ({
      key,
      priority: MigrationPriority.BACKGROUND,
      estimatedSize: 51200,
      reasoning: 'Historical data - migrate when convenient'
    }),

    /**
     * Creates a mixed set of data classifications for testing
     */
    mixedDataSet: (): DataClassification[] => [
      MigrationFixtures.dataClassification.critical('soccerAppSettings'),
      MigrationFixtures.dataClassification.critical('soccerMasterRoster'),
      MigrationFixtures.dataClassification.important('currentGame'),
      MigrationFixtures.dataClassification.important('activeSeason'),
      MigrationFixtures.dataClassification.background('oldGame1'),
      MigrationFixtures.dataClassification.background('oldGame2'),
      MigrationFixtures.dataClassification.background('archivedSeason')
    ]
  },

  /**
   * Storage adapter mock for testing
   */
  mockStorageAdapter: () => ({
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    getAllKeys: jest.fn().mockResolvedValue([]),
    clear: jest.fn().mockResolvedValue(undefined)
  }),

  /**
   * Migration configuration fixtures
   */
  migrationConfig: {
    /**
     * Standard background migration configuration
     */
    standard: () => ({
      enableBackgroundProcessing: true,
      criticalDataTimeout: 10000,
      backgroundProcessingDelay: 1000,
      enableProgressPersistence: true,
      autoResumeOnLoad: true
    }),

    /**
     * Fast migration configuration for testing
     */
    fast: () => ({
      enableBackgroundProcessing: true,
      criticalDataTimeout: 1000,
      backgroundProcessingDelay: 10,
      enableProgressPersistence: false,
      autoResumeOnLoad: false
    }),

    /**
     * Synchronous-only migration configuration
     */
    syncOnly: () => ({
      enableBackgroundProcessing: false,
      criticalDataTimeout: 5000,
      backgroundProcessingDelay: 0,
      enableProgressPersistence: false,
      autoResumeOnLoad: false
    })
  },

  /**
   * Test data entries for migration testing
   */
  testDataEntries: () => [
    { key: 'soccerAppSettings', size: 512, metadata: { isActive: true } },
    { key: 'soccerMasterRoster', size: 2048, metadata: { lastModified: Date.now() } },
    { key: 'currentGame', size: 1024, metadata: { isCurrent: true } },
    { key: 'oldGame', size: 4096, metadata: { lastModified: Date.now() - 86400000 } }, // 1 day old
    { key: 'largeDataset', size: 1048576, metadata: {} } // 1MB
  ],

  /**
   * Scheduler configuration fixtures
   */
  schedulerConfig: {
    /**
     * Default scheduler configuration
     */
    default: () => ({
      minimumIdleTime: 5,
      maximumIdleTime: 50,
      idleRetryDelay: 100,
      maxConsecutiveAttempts: 5,
      enableTabVisibility: true,
      enablePerformanceMonitoring: true
    }),

    /**
     * High performance scheduler configuration
     */
    highPerformance: () => ({
      minimumIdleTime: 10,
      maximumIdleTime: 100,
      idleRetryDelay: 50,
      maxConsecutiveAttempts: 10,
      enableTabVisibility: true,
      enablePerformanceMonitoring: true
    }),

    /**
     * Conservative scheduler configuration
     */
    conservative: () => ({
      minimumIdleTime: 2,
      maximumIdleTime: 20,
      idleRetryDelay: 500,
      maxConsecutiveAttempts: 3,
      enableTabVisibility: true,
      enablePerformanceMonitoring: false
    })
  }
};

/**
 * Quick access to commonly used fixtures
 */
export const QuickMigrationFixtures = {
  task: () => MigrationFixtures.backgroundTask(),
  failingTask: () => MigrationFixtures.failingBackgroundTask(),
  priorityTasks: () => MigrationFixtures.priorityTaskSet(),
  criticalData: () => MigrationFixtures.dataClassification.critical(),
  backgroundData: () => MigrationFixtures.dataClassification.background(),
  mockAdapter: () => MigrationFixtures.mockStorageAdapter(),
  fastConfig: () => MigrationFixtures.migrationConfig.fast()
};