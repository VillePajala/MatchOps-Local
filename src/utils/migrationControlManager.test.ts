/**
 * Simplified Tests for Migration Control Manager
 * Focuses on core functionality without problematic async constructor behavior
 */

import { MigrationControlManager } from './migrationControlManager';
import { MIGRATION_CONTROL_FEATURES } from '@/config/migrationConfig';
import { LocalStorageAdapter } from './localStorageAdapter';
import { MigrationControlCallbacks } from '@/types/migrationControl';

// Mock all dependencies
jest.mock('./localStorageAdapter');
jest.mock('./checksumUtils', () => ({
  generateResumeDataChecksum: jest.fn().mockResolvedValue('mock-checksum'),
  verifyResumeDataIntegrity: jest.fn().mockReturnValue(true)
}));
jest.mock('./logger', () => ({
  createLogger: () => ({
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

// Mock the problematic loadResumeData method before any instances are created
jest.spyOn(MigrationControlManager.prototype, 'loadResumeData' as any)
  .mockImplementation(() => Promise.resolve());

const mockLocalStorageAdapter = {
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
  getBackendName: jest.fn().mockReturnValue('test'),
  getKeys: jest.fn().mockResolvedValue([]),
  formatSize: jest.fn().mockReturnValue('0 B'),
  isQuotaExceededError: jest.fn().mockReturnValue(false)
} as unknown as jest.Mocked<LocalStorageAdapter>;

(LocalStorageAdapter as jest.Mock).mockImplementation(() => mockLocalStorageAdapter);

describe('MigrationControlManager (Simplified)', () => {
  let manager: MigrationControlManager;
  let mockCallbacks: MigrationControlCallbacks;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCallbacks = {
      onPause: jest.fn(),
      onResume: jest.fn(),
      onCancel: jest.fn(),
      onEstimation: jest.fn(),
      onPreview: jest.fn()
    };

    manager = new MigrationControlManager(mockCallbacks);
  });

  afterEach(() => {
    if (manager) {
      // Synchronous cleanup only to avoid hanging
      manager.cleanup().catch(() => {
        // Ignore cleanup errors
      });
    }
  });

  describe('basic functionality', () => {
    it('should initialize with correct default state', () => {
      const state = manager.getControlState();
      expect(state.canPause).toBe(MIGRATION_CONTROL_FEATURES.ALLOW_PAUSE);
      expect(state.canCancel).toBe(MIGRATION_CONTROL_FEATURES.ALLOW_CANCEL);
      expect(state.isPaused).toBe(false);
      expect(state.isCancelling).toBe(false);
    });

    it('should request pause when allowed', async () => {
      await manager.requestPause();
      const state = manager.getControlState();
      expect(state.isPaused).toBe(true);
    });

    it('should request cancel when allowed', async () => {
      await manager.requestCancel();
      const state = manager.getControlState();
      expect(state.isCancelling).toBe(true);
    });
  });
});