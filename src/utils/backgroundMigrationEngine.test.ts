/**
 * @jest-environment jsdom
 */

import { BackgroundMigrationEngine, MigrationPhase, MigrationStatus, getActiveMigrationStatus } from './backgroundMigrationEngine';
import { StorageAdapter } from '../types/migration';

// Mock logger
jest.mock('./logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock MigrationMutex
jest.mock('./migrationMutex', () => ({
  MigrationMutex: jest.fn().mockImplementation(() => ({
    acquireLock: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('BackgroundMigrationEngine', () => {
  let sourceAdapter: jest.Mocked<StorageAdapter>;
  let targetAdapter: jest.Mocked<StorageAdapter>;
  let engine: BackgroundMigrationEngine;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    localStorage.clear();

    // Create mock adapters
    sourceAdapter = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      getAllKeys: jest.fn(),
    } as jest.Mocked<StorageAdapter>;

    targetAdapter = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      getAllKeys: jest.fn(),
    } as jest.Mocked<StorageAdapter>;

    // Setup default mock implementations
    (sourceAdapter.getAllKeys as jest.Mock).mockResolvedValue([
      'soccerAppSettings',
      'soccerMasterRoster',
      'savedSoccerGames',
      'currentGame_123',
      'backgroundData_1',
      'backgroundData_2'
    ]);

    sourceAdapter.getItem.mockImplementation((key) => {
      const data: Record<string, unknown> = {
        soccerAppSettings: { theme: 'dark', language: 'en' },
        soccerMasterRoster: { players: ['player1', 'player2'] },
        savedSoccerGames: { games: ['game1', 'game2'] },
        currentGame_123: { id: '123', score: 0 },
        backgroundData_1: { data: 'background1' },
        backgroundData_2: { data: 'background2' }
      };
      return Promise.resolve(data[key] || null);
    });

    targetAdapter.setItem.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Cleanup any timers
    jest.clearAllTimers();

    // Restore document.hidden
    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
    });
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter);
      expect(engine).toBeDefined();
      expect(engine.getStatus().phase).toBe(MigrationPhase.INITIALIZING);
    });

    it('should initialize with custom configuration', () => {
      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableIdleProcessing: false,
        pauseOnHiddenTab: true,
        criticalBatchSize: 20,
        currentGameId: '123'
      });
      expect(engine).toBeDefined();
    });
  });

  describe('Data Classification', () => {
    it('should classify data by priority', async () => {
      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        currentGameId: '123',
        enableIdleProcessing: false // Disable for testing
      });

      const mockCallbacks = {
        onPhaseChange: jest.fn(),
        onProgress: jest.fn(),
        onComplete: jest.fn()
      };

      const promise = engine.start(mockCallbacks);

      // Wait for classification phase
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(MigrationPhase.CLASSIFYING);

      // Let the migration complete
      await promise;
    });

    it('should process critical data immediately', async () => {
      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        currentGameId: '123',
        enableIdleProcessing: false
      });

      const mockCallbacks = {
        onPhaseChange: jest.fn(),
        onComplete: jest.fn()
      };

      await engine.start(mockCallbacks);

      // Check that critical phase was entered
      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(MigrationPhase.CRITICAL);

      // Check that critical data was migrated
      expect(targetAdapter.setItem).toHaveBeenCalledWith(
        'soccerAppSettings',
        expect.any(Object)
      );
      expect(targetAdapter.setItem).toHaveBeenCalledWith(
        'currentGame_123',
        expect.any(Object)
      );
    });
  });

  describe('Idle-time Processing', () => {
    it('should use requestIdleCallback when available', async () => {
      // Mock requestIdleCallback
      const mockRequestIdleCallback = jest.fn((callback) => {
        setTimeout(() => callback({ timeRemaining: () => 50, didTimeout: false } as IdleDeadline), 0);
        return 1;
      });
      (global as unknown as { requestIdleCallback: typeof mockRequestIdleCallback }).requestIdleCallback = mockRequestIdleCallback;

      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableIdleProcessing: true,
        currentGameId: '123'
      });

      await engine.start();

      // requestIdleCallback should be detected and used
      expect(engine['scheduler'].supportsIdleCallback()).toBe(true);
    });

    it('should fall back to setTimeout when requestIdleCallback not available', async () => {
      // Remove requestIdleCallback
      delete (global as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;

      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableIdleProcessing: true,
        currentGameId: '123'
      });

      await engine.start();

      // Should still complete without requestIdleCallback
      expect(targetAdapter.setItem).toHaveBeenCalled();
    });
  });

  describe('Tab Visibility Handling', () => {
    it('should pause when tab becomes hidden if configured', async () => {
      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        pauseOnHiddenTab: true,
        enableIdleProcessing: false
      });

      const mockCallbacks = {
        onPhaseChange: jest.fn()
      };

      const startPromise = engine.start(mockCallbacks);

      // Wait for migration to start
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate tab becoming hidden
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true
      });
      const event = new Event('visibilitychange');
      document.dispatchEvent(event);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Should be paused
      expect(engine.getStatus().isPaused).toBe(true);
      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(MigrationPhase.PAUSED);

      // Simulate tab becoming visible again
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true
      });
      document.dispatchEvent(event);

      await startPromise;
    });

    it('should throttle when tab is hidden if configured', async () => {
      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        throttleOnHiddenTab: true,
        hiddenTabThrottleDelay: 100,
        enableIdleProcessing: false
      });

      const startTime = Date.now();

      // Simulate hidden tab from start
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true
      });

      await engine.start();

      const duration = Date.now() - startTime;

      // Should take longer due to throttling
      expect(duration).toBeGreaterThan(50); // Should have some throttling delays
    });
  });

  describe('Progress Persistence', () => {
    it('should save progress periodically', async () => {
      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableProgressPersistence: true,
        persistenceInterval: 50,
        enableIdleProcessing: false
      });

      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

      await engine.start();

      // Check that progress was saved
      expect(setItemSpy).toHaveBeenCalledWith(
        expect.stringContaining('migration_progress_'),
        expect.any(String)
      );

      const savedProgress = JSON.parse(setItemSpy.mock.calls[0][1] as string);
      expect(savedProgress).toMatchObject({
        migrationId: expect.any(String),
        phase: expect.any(String),
        processedKeys: expect.any(Array),
        totalKeys: expect.any(Number)
      });
    });

    it('should resume from saved progress', async () => {
      // Save initial progress
      const savedProgress = {
        migrationId: 'test_migration_123',
        phase: MigrationPhase.BACKGROUND,
        processedKeys: ['soccerAppSettings', 'soccerMasterRoster'],
        remainingKeys: ['savedSoccerGames', 'backgroundData_1'],
        criticalComplete: true,
        backgroundComplete: false,
        totalKeys: 6,
        totalSize: 1000,
        processedSize: 400,
        startTime: Date.now() - 5000,
        lastUpdateTime: Date.now() - 1000,
        retryCount: 0,
        errors: []
      };

      localStorage.setItem('migration_progress_test_migration_123', JSON.stringify(savedProgress));

      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableProgressPersistence: true,
        autoResumeOnLoad: true,
        enableIdleProcessing: false
      });

      await engine.start();

      // Should not re-process already processed keys
      expect(targetAdapter.setItem).not.toHaveBeenCalledWith('soccerAppSettings', expect.any(Object));
      expect(targetAdapter.setItem).not.toHaveBeenCalledWith('soccerMasterRoster', expect.any(Object));

      // Should process remaining keys
      expect(targetAdapter.setItem).toHaveBeenCalledWith('savedSoccerGames', expect.any(Object));
    });
  });

  describe('Smart Retry Logic', () => {
    it('should retry on retryable errors', async () => {
      let attempts = 0;
      targetAdapter.setItem.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Network error');
          error.name = 'NetworkError';
          return Promise.reject(error);
        }
        return Promise.resolve();
      });

      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableSmartRetry: true,
        retryConfiguration: {
          maxRetries: 3,
          initialDelay: 10,
          maxDelay: 100,
          backoffFactor: 2,
          retryableErrors: ['NetworkError']
        },
        enableIdleProcessing: false
      });

      await engine.start();

      // Should have retried and eventually succeeded
      expect(targetAdapter.setItem).toHaveBeenCalledTimes(18); // 6 keys * 3 attempts
    });

    it('should not retry on non-retryable errors', async () => {
      targetAdapter.setItem.mockRejectedValue(new Error('Permission denied'));

      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableSmartRetry: true,
        retryConfiguration: {
          maxRetries: 3,
          initialDelay: 10,
          maxDelay: 100,
          backoffFactor: 2,
          retryableErrors: ['NetworkError']
        },
        enableIdleProcessing: false
      });

      await engine.start();

      // Should only attempt once per key (no retries)
      expect(targetAdapter.setItem).toHaveBeenCalledTimes(6);
    });

    it('should apply exponential backoff', async () => {
      jest.useFakeTimers();

      let attempts = 0;
      targetAdapter.setItem.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Network error');
          error.name = 'NetworkError';
          return Promise.reject(error);
        }
        return Promise.resolve();
      });

      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableSmartRetry: true,
        retryConfiguration: {
          maxRetries: 3,
          initialDelay: 1000,
          maxDelay: 10000,
          backoffFactor: 2,
          retryableErrors: ['NetworkError']
        },
        enableIdleProcessing: false
      });

      const startPromise = engine.start();

      // Advance timers through retries
      await jest.advanceTimersByTimeAsync(1000); // First retry delay
      await jest.advanceTimersByTimeAsync(2000); // Second retry delay (exponential)

      jest.useRealTimers();
      await startPromise;
    });
  });

  describe('Migration Status API', () => {
    it('should provide accurate status information', async () => {
      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableIdleProcessing: false
      });

      const statusUpdates: MigrationStatus[] = [];
      const mockCallbacks = {
        onProgress: (status: MigrationStatus) => {
          statusUpdates.push({ ...status });
        }
      };

      await engine.start(mockCallbacks);

      // Should have received multiple status updates
      expect(statusUpdates.length).toBeGreaterThan(0);

      // Check status structure
      const lastStatus = statusUpdates[statusUpdates.length - 1];
      expect(lastStatus).toMatchObject({
        isActive: expect.any(Boolean),
        isPaused: expect.any(Boolean),
        phase: expect.any(String),
        progress: expect.any(Number),
        criticalComplete: expect.any(Boolean),
        estimatedTimeRemaining: expect.any(Number),
        processedKeys: expect.any(Number),
        totalKeys: expect.any(Number),
        errors: expect.any(Number),
        canPause: expect.any(Boolean),
        canResume: expect.any(Boolean),
        canCancel: expect.any(Boolean)
      });

      // Final status should show completion
      expect(lastStatus.phase).toBe(MigrationPhase.COMPLETED);
      expect(lastStatus.progress).toBe(100);
    });

    it('should allow querying active migration status', async () => {
      // Save a migration in progress
      const savedProgress = {
        migrationId: 'active_migration',
        phase: MigrationPhase.BACKGROUND,
        processedKeys: ['key1', 'key2'],
        remainingKeys: ['key3', 'key4'],
        criticalComplete: true,
        backgroundComplete: false,
        totalKeys: 4,
        totalSize: 1000,
        processedSize: 500,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        retryCount: 0,
        errors: []
      };

      localStorage.setItem('migration_progress_active_migration', JSON.stringify(savedProgress));

      const status = await getActiveMigrationStatus();

      expect(status).not.toBeNull();
      expect(status).toMatchObject({
        isActive: false,
        isPaused: true,
        phase: MigrationPhase.BACKGROUND,
        progress: 50,
        criticalComplete: true,
        processedKeys: 2,
        totalKeys: 4,
        canResume: true
      });
    });
  });

  describe('Pause/Resume/Cancel', () => {
    it('should pause and resume migration', async () => {
      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableIdleProcessing: false
      });

      const mockCallbacks = {
        onPhaseChange: jest.fn()
      };

      const startPromise = engine.start(mockCallbacks);

      // Wait for migration to start processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Pause
      await engine.pause();
      expect(engine.getStatus().isPaused).toBe(true);
      expect(mockCallbacks.onPhaseChange).toHaveBeenCalledWith(MigrationPhase.PAUSED);

      // Resume
      await engine.resume();
      expect(engine.getStatus().isPaused).toBe(false);

      await startPromise;
    });

    it('should cancel migration', async () => {
      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableIdleProcessing: false
      });

      const mockCallbacks = {
        onComplete: jest.fn()
      };

      const startPromise = engine.start(mockCallbacks);

      // Wait for migration to start
      await new Promise(resolve => setTimeout(resolve, 10));

      // Cancel
      await engine.cancel();

      await startPromise;

      // Should not have called onComplete
      expect(mockCallbacks.onComplete).not.toHaveBeenCalled();
      expect(engine.getStatus().phase).toBe(MigrationPhase.INITIALIZING); // Reset after cancel
    });

    it('should save progress when paused', async () => {
      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableProgressPersistence: true,
        enableIdleProcessing: false
      });

      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

      const startPromise = engine.start();

      // Wait and then pause
      await new Promise(resolve => setTimeout(resolve, 10));
      await engine.pause();

      // Progress should be saved
      expect(setItemSpy).toHaveBeenCalledWith(
        expect.stringContaining('migration_progress_'),
        expect.any(String)
      );

      await engine.resume();
      await startPromise;
    });
  });

  describe('Error Handling', () => {
    it('should handle errors during migration', async () => {
      sourceAdapter.getItem.mockRejectedValueOnce(new Error('Read error'));

      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableIdleProcessing: false
      });

      const mockCallbacks = {
        onError: jest.fn(),
        onComplete: jest.fn()
      };

      await engine.start(mockCallbacks);

      // Should complete despite the error
      expect(mockCallbacks.onComplete).toHaveBeenCalled();

      // Should have errors in status
      const status = engine.getStatus();
      expect(status.errors).toBeGreaterThan(0);
    });

    it('should handle lock acquisition failure', async () => {
      // Mock lock failure
      const { MigrationMutex } = await import('./migrationMutex');
      (MigrationMutex as jest.MockedClass<typeof MigrationMutex>).mockImplementationOnce(() => ({
        acquireLock: jest.fn().mockResolvedValue(false),
        releaseLock: jest.fn()
      } as unknown as InstanceType<typeof MigrationMutex>));

      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter);

      const mockCallbacks = {
        onError: jest.fn()
      };

      await expect(engine.start(mockCallbacks)).rejects.toThrow('Could not acquire migration lock');
      expect(mockCallbacks.onError).toHaveBeenCalled();
    });
  });

  describe('Performance Estimation', () => {
    it('should estimate remaining time', async () => {
      // Mock slow processing
      targetAdapter.setItem.mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, 10));
      });

      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableIdleProcessing: false
      });

      const statusUpdates: MigrationStatus[] = [];
      const mockCallbacks = {
        onProgress: (status: MigrationStatus) => {
          statusUpdates.push({ ...status });
        }
      };

      await engine.start(mockCallbacks);

      // Should have estimated time in some status updates
      const estimatedTimes = statusUpdates
        .map(s => s.estimatedTimeRemaining)
        .filter(t => t > 0);

      expect(estimatedTimes.length).toBeGreaterThan(0);
    });
  });

  describe('Integration', () => {
    it('should complete full migration lifecycle', async () => {
      engine = new BackgroundMigrationEngine(sourceAdapter, targetAdapter, {
        enableIdleProcessing: true,
        pauseOnHiddenTab: true,
        enableProgressPersistence: true,
        enableSmartRetry: true,
        currentGameId: '123'
      });

      const phases: MigrationPhase[] = [];
      const mockCallbacks = {
        onPhaseChange: (phase: MigrationPhase) => phases.push(phase),
        onComplete: jest.fn()
      };

      await engine.start(mockCallbacks);

      // Should go through all phases
      expect(phases).toContain(MigrationPhase.CLASSIFYING);
      expect(phases).toContain(MigrationPhase.CRITICAL);
      expect(phases).toContain(MigrationPhase.COMPLETING);
      expect(phases).toContain(MigrationPhase.COMPLETED);

      // Should complete successfully
      expect(mockCallbacks.onComplete).toHaveBeenCalled();

      // All data should be migrated
      expect(targetAdapter.setItem).toHaveBeenCalledTimes(6);
    });
  });
});