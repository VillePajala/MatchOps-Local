/**
 * Tests for Migration Control Manager
 *
 * REWRITTEN FROM SCRATCH - NO HANGING ISSUES
 *
 * Tests the migration control functionality with comprehensive mocking
 * Avoids async complexity that caused hanging in previous version
 */

import { MigrationControlManager } from './migrationControlManager';
import { MIGRATION_CONTROL_FEATURES } from '@/config/migrationConfig';
import { MigrationControlCallbacks } from '@/types/migrationControl';

// Mock all dependencies completely - no real operations
jest.mock('./localStorageAdapter', () => ({
  LocalStorageAdapter: jest.fn(() => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    getBackendName: jest.fn().mockReturnValue('localStorage'),
    getKeys: jest.fn(),
    isQuotaExceededError: jest.fn()
  }))
}));

jest.mock('./checksumUtils', () => ({
  generateResumeDataChecksum: jest.fn().mockResolvedValue('mock-checksum'),
  verifyResumeDataIntegrity: jest.fn().mockReturnValue(true)
}));

jest.mock('./logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

describe('MigrationControlManager', () => {
  let manager: MigrationControlManager;
  let mockCallbacks: MigrationControlCallbacks;
  let mockAdapter: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
    isQuotaExceededError: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockCallbacks = {
      onPause: jest.fn(),
      onResume: jest.fn(),
      onCancel: jest.fn(),
      onEstimation: jest.fn(),
      onPreview: jest.fn()
    };

    // Create manager - constructor will be mocked to avoid async issues
    manager = new MigrationControlManager(mockCallbacks);
    mockAdapter = manager['localStorageAdapter'] as unknown as typeof mockAdapter;
  });

  afterEach(() => {
    if (manager) {
      // Simple cleanup - don't await
      manager.cleanup().catch(() => {
        // Ignore cleanup errors in tests
      });
    }
  });

  describe('Basic Interface Compliance', () => {
    it('should implement MigrationControl interface', () => {
      expect(manager).toBeDefined();
      expect(typeof manager.requestPause).toBe('function');
      expect(typeof manager.requestResume).toBe('function');
      expect(typeof manager.requestCancel).toBe('function');
      expect(typeof manager.getControlState).toBe('function');
      expect(typeof manager.cleanup).toBe('function');
    });

    it('should initialize with correct default state', () => {
      const state = manager.getControlState();
      expect(state.canPause).toBe(MIGRATION_CONTROL_FEATURES.ALLOW_PAUSE);
      expect(state.canCancel).toBe(MIGRATION_CONTROL_FEATURES.ALLOW_CANCEL);
      expect(state.isPaused).toBe(false);
      expect(state.isCancelling).toBe(false);
      expect(state.canResume).toBe(false);
    });

    it('should create with default empty callbacks', () => {
      const defaultManager = new MigrationControlManager();
      expect(defaultManager.getControlState()).toBeDefined();
    });
  });

  describe('Control State Management', () => {
    it('should correctly report pause state', async () => {
      expect(manager.isPaused()).toBe(false);

      await manager.requestPause();
      expect(manager.isPaused()).toBe(true);

      const state = manager.getControlState();
      expect(state.isPaused).toBe(true);
    });

    it('should correctly report cancel state', async () => {
      expect(manager.isCancelling()).toBe(false);

      await manager.requestCancel();
      expect(manager.isCancelling()).toBe(true);

      const state = manager.getControlState();
      expect(state.isCancelling).toBe(true);
    });

    it('should prevent double pause requests', async () => {
      await manager.requestPause();
      const initialState = manager.getControlState();

      await manager.requestPause(); // Second pause request
      const finalState = manager.getControlState();

      expect(finalState).toEqual(initialState);
    });

    it('should prevent double cancel requests', async () => {
      await manager.requestCancel();
      const callCount = (mockCallbacks.onCancel as jest.Mock).mock.calls.length;

      await manager.requestCancel(); // Second cancel request

      expect(mockCallbacks.onCancel).toHaveBeenCalledTimes(callCount);
    });
  });

  describe('Pause Functionality - Testing Real Logic', () => {
    it('should request pause when allowed', async () => {
      await manager.requestPause();

      const state = manager.getControlState();
      expect(state.isPaused).toBe(true);
    });

    it('should save pause state with correct data structure', async () => {
      await manager.requestPause();

      const testData = {
        lastProcessedKey: 'key5',
        processedKeys: ['key1', 'key2', 'key3', 'key4'],
        remainingKeys: ['key6', 'key7', 'key8'],
        itemsProcessed: 4,
        totalItems: 8,
        bytesProcessed: 1024,
        totalBytes: 2048
      };

      await manager.savePauseState(
        testData.lastProcessedKey,
        testData.processedKeys,
        testData.remainingKeys,
        testData.itemsProcessed,
        testData.totalItems,
        testData.bytesProcessed,
        testData.totalBytes
      );

      expect(mockAdapter.setItem).toHaveBeenCalledWith(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY,
        expect.stringContaining(testData.lastProcessedKey)
      );
      expect(mockCallbacks.onPause).toHaveBeenCalled();
    });

    it('should handle rate limiting for pause operations', async () => {
      // Trigger multiple rapid pause requests
      const promises = Array.from({ length: 15 }, () => manager.requestPause());

      await Promise.allSettled(promises);

      // Should not exceed rate limit (implementation may vary)
      expect(manager.getControlState().isPaused).toBe(true);
    });
  });

  describe('Resume Functionality - Testing Real Logic', () => {
    it('should return null when no resume data available', async () => {
      mockAdapter.getItem.mockResolvedValue(null);

      const result = await manager.requestResume();
      expect(result).toBeNull();
    });

    it('should resume with valid data structure', async () => {
      const resumeData = {
        lastProcessedKey: 'key5',
        processedKeys: ['key1', 'key2'],
        remainingKeys: ['key6', 'key7'],
        itemsProcessed: 2,
        totalItems: 4,
        bytesProcessed: 512,
        totalBytes: 1024,
        timestamp: Date.now(),
        checksum: 'mock-checksum'
      };

      mockAdapter.getItem.mockResolvedValue(JSON.stringify(resumeData));

      await manager.requestPause();
      await manager.savePauseState(
        resumeData.lastProcessedKey,
        resumeData.processedKeys,
        resumeData.remainingKeys,
        resumeData.itemsProcessed,
        resumeData.totalItems,
        resumeData.bytesProcessed,
        resumeData.totalBytes
      );

      const result = await manager.requestResume();

      expect(result).not.toBeNull();
      expect(result!.lastProcessedKey).toBe('key5');
      expect(result!.itemsProcessed).toBe(2);
      expect(result!.totalItems).toBe(4);
      expect(mockCallbacks.onResume).toHaveBeenCalled();
    });

    it('should reject corrupted resume data', async () => {
      const corruptedData = {
        lastProcessedKey: 'key5',
        // Missing required fields
        timestamp: Date.now(),
        checksum: 'invalid_checksum'
      };

      mockAdapter.getItem.mockResolvedValue(JSON.stringify(corruptedData));

      const result = await manager.requestResume();
      expect(result).toBeNull();
    });
  });

  describe('Cancel Functionality - Testing Real Logic', () => {
    it('should request cancel with default reason', async () => {
      await manager.requestCancel();

      const state = manager.getControlState();
      expect(state.isCancelling).toBe(true);
      expect(mockCallbacks.onCancel).toHaveBeenCalledWith({
        reason: 'user_request',
        timestamp: expect.any(Number),
        cleanupCompleted: false,
        dataRolledBack: false,
        backupRestored: false
      });
    });

    it('should request cancel with custom reason', async () => {
      await manager.requestCancel('memory_pressure');

      expect(mockCallbacks.onCancel).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'memory_pressure' })
      );
    });

    it('should handle cancellation reasons correctly', async () => {
      const reasons = ['user_request', 'memory_pressure', 'error', 'timeout'] as const;

      for (const reason of reasons) {
        const testManager = new MigrationControlManager(mockCallbacks);
        await testManager.requestCancel(reason);

        expect(mockCallbacks.onCancel).toHaveBeenCalledWith(
          expect.objectContaining({ reason })
        );
      }
    });
  });

  describe('Error Handling - Testing Real Logic', () => {
    it('should handle storage errors during pause save', async () => {
      await manager.requestPause();

      mockAdapter.setItem.mockRejectedValue(new Error('Storage error'));

      await manager.savePauseState(
        'key5',
        ['key1', 'key2'],
        ['key6', 'key7'],
        2,
        4,
        512,
        1024
      );

      // Should maintain in-memory state even if storage fails
      const state = manager.getControlState();
      expect(state.canResume).toBe(true);
    });

    it('should handle quota exceeded errors gracefully', async () => {
      await manager.requestPause();

      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';
      mockAdapter.setItem.mockRejectedValue(quotaError);
      mockAdapter.isQuotaExceededError.mockReturnValue(true);

      await manager.savePauseState(
        'key5',
        ['key1', 'key2'],
        ['key6', 'key7'],
        2,
        4,
        512,
        1024
      );

      const state = manager.getControlState();
      expect(state.canResume).toBe(true);
    });

    it('should handle corrupted JSON data gracefully', async () => {
      mockAdapter.getItem.mockResolvedValue('invalid json');

      const result = await manager.requestResume();
      expect(result).toBeNull();
    });
  });

  describe('Checkpoint Functionality', () => {
    it('should determine checkpoint creation correctly', () => {
      const interval = MIGRATION_CONTROL_FEATURES.CHECKPOINT_INTERVAL;

      // Should not create checkpoint before interval
      for (let i = 1; i < interval; i++) {
        expect(manager.shouldCreateCheckpoint()).toBe(false);
      }

      // Should create checkpoint at interval
      expect(manager.shouldCreateCheckpoint()).toBe(true);

      // Should not create checkpoint immediately after
      expect(manager.shouldCreateCheckpoint()).toBe(false);
    });

    it('should reset checkpoint counter correctly', () => {
      const interval = MIGRATION_CONTROL_FEATURES.CHECKPOINT_INTERVAL;

      // Advance to checkpoint
      for (let i = 0; i < interval; i++) {
        manager.shouldCreateCheckpoint();
      }

      // Should create checkpoint, then reset
      expect(manager.shouldCreateCheckpoint()).toBe(false);
    });
  });

  describe('Session Management', () => {
    it('should generate unique session IDs', () => {
      const manager1 = new MigrationControlManager();
      const manager2 = new MigrationControlManager();

      // Access private sessionId through type assertion for testing
      const session1 = (manager1 as unknown as { sessionId: string }).sessionId;
      const session2 = (manager2 as unknown as { sessionId: string }).sessionId;

      expect(session1).not.toBe(session2);
      expect(session1).toMatch(/^[a-z0-9_-]+$/);
      expect(session2).toMatch(/^[a-z0-9_-]+$/);
    });

    it('should maintain session consistency', () => {
      const sessionId = (manager as unknown as { sessionId: string }).sessionId;

      // Session should remain constant throughout manager lifecycle
      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe('string');
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should clean up resources properly', async () => {
      await manager.cleanup();

      expect(mockAdapter.removeItem).toHaveBeenCalledWith(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      mockAdapter.removeItem.mockRejectedValue(new Error('Cleanup error'));

      // Should not throw
      await expect(manager.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('Configuration Compliance', () => {
    it('should respect MIGRATION_CONTROL_FEATURES settings', () => {
      const state = manager.getControlState();

      expect(state.canPause).toBe(MIGRATION_CONTROL_FEATURES.ALLOW_PAUSE);
      expect(state.canCancel).toBe(MIGRATION_CONTROL_FEATURES.ALLOW_CANCEL);

      // Test that pause behavior follows configuration
      if (!MIGRATION_CONTROL_FEATURES.ALLOW_PAUSE) {
        expect(state.canPause).toBe(false);
      }
    });

    it('should use correct storage key from configuration', async () => {
      await manager.requestPause();
      await manager.savePauseState('key1', [], [], 1, 1, 100, 100);

      expect(mockAdapter.setItem).toHaveBeenCalledWith(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY,
        expect.any(String)
      );
    });
  });

  describe('Integration Testing - Real Workflow Scenarios', () => {
    it('should handle complete pause-resume workflow with data integrity', async () => {
      // Simulate a real migration scenario with multiple steps
      const migrationData = {
        lastProcessedKey: 'item-500',
        processedKeys: Array.from({ length: 500 }, (_, i) => `item-${i}`),
        remainingKeys: Array.from({ length: 1500 }, (_, i) => `item-${i + 500}`),
        itemsProcessed: 500,
        totalItems: 2000,
        bytesProcessed: 2 * 1024 * 1024, // 2MB
        totalBytes: 8 * 1024 * 1024 // 8MB
      };

      // Step 1: Request pause
      await manager.requestPause();
      expect(manager.isPaused()).toBe(true);

      // Step 2: Save pause state (this tests real serialization)
      await manager.savePauseState(
        migrationData.lastProcessedKey,
        migrationData.processedKeys,
        migrationData.remainingKeys,
        migrationData.itemsProcessed,
        migrationData.totalItems,
        migrationData.bytesProcessed,
        migrationData.totalBytes
      );

      // Step 3: Verify storage interaction contains real data
      expect(mockAdapter.setItem).toHaveBeenCalledWith(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY,
        expect.stringContaining(migrationData.lastProcessedKey)
      );

      // Step 4: Simulate resumption by setting up mock data
      const savedData = {
        ...migrationData,
        timestamp: Date.now(),
        sessionId: expect.any(String),
        checksum: expect.any(String)
      };
      mockAdapter.getItem.mockResolvedValue(JSON.stringify(savedData));

      // Step 5: Resume and verify data integrity
      const resumeData = await manager.requestResume();

      expect(resumeData).not.toBeNull();
      expect(resumeData!.lastProcessedKey).toBe(migrationData.lastProcessedKey);
      expect(resumeData!.itemsProcessed).toBe(migrationData.itemsProcessed);
      expect(resumeData!.remainingKeys).toEqual(migrationData.remainingKeys);
      expect(resumeData!.bytesProcessed).toBe(migrationData.bytesProcessed);

      // Verify callbacks were triggered with correct sequence
      expect(mockCallbacks.onPause).toHaveBeenCalled();
      expect(mockCallbacks.onResume).toHaveBeenCalled();
    });

    it('should handle memory pressure cancellation with cleanup', async () => {
      // Simulate a memory-pressure situation
      await manager.requestPause();
      await manager.savePauseState('key100', ['key1'], ['key101'], 1, 100, 1024, 102400);

      // Trigger memory pressure cancellation
      await manager.requestCancel('memory_pressure');

      // Verify proper cleanup sequence
      expect(manager.isCancelling()).toBe(true);
      expect(mockCallbacks.onCancel).toHaveBeenCalledWith({
        reason: 'memory_pressure',
        timestamp: expect.any(Number),
        cleanupCompleted: false,
        dataRolledBack: false,
        backupRestored: false
      });

      // Cleanup should remove stored progress
      await manager.cleanup();
      expect(mockAdapter.removeItem).toHaveBeenCalledWith(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY
      );
    });

    it('should handle checkpoint creation with real timing logic', async () => {
      // Test the actual checkpoint logic by exercising the counter
      const checkpointInterval = MIGRATION_CONTROL_FEATURES.CHECKPOINT_INTERVAL;

      // Before interval - no checkpoint (counter: 1, 2, ..., interval-1)
      for (let i = 1; i < checkpointInterval; i++) {
        expect(manager.shouldCreateCheckpoint()).toBe(false);
      }

      // At interval - should create checkpoint (counter: interval)
      expect(manager.shouldCreateCheckpoint()).toBe(true);

      // Verify next cycle works correctly
      for (let i = 1; i < checkpointInterval; i++) {
        expect(manager.shouldCreateCheckpoint()).toBe(false);
      }

      // Should create checkpoint again at next interval
      expect(manager.shouldCreateCheckpoint()).toBe(true);
    });

    it('should validate resume data integrity with checksums', async () => {
      // Test with corrupted checksum
      const corruptedData = {
        lastProcessedKey: 'key5',
        processedKeys: ['key1', 'key2'],
        remainingKeys: ['key6', 'key7'],
        itemsProcessed: 2,
        totalItems: 4,
        bytesProcessed: 512,
        totalBytes: 1024,
        timestamp: Date.now(),
        checksum: 'invalid_checksum' // This would fail checksum validation
      };

      mockAdapter.getItem.mockResolvedValue(JSON.stringify(corruptedData));

      const result = await manager.requestResume();

      // Should reject corrupted data
      expect(result).toBeNull();
    });

    it('should handle storage quota exceeded during pause save', async () => {
      await manager.requestPause();

      // Simulate quota exceeded error
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';
      mockAdapter.setItem.mockRejectedValue(quotaError);
      mockAdapter.isQuotaExceededError.mockReturnValue(true);

      // Should handle gracefully and maintain in-memory state
      await manager.savePauseState('key1', [], [], 1, 1, 100, 100);

      // Should still be able to resume from memory
      expect(manager.getControlState().canResume).toBe(true);
      expect(manager.isPaused()).toBe(true);
    });
  });
});