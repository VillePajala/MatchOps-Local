/**
 * Warmup Plan Utility Tests
 *
 * Tests for the warmup plan storage operations:
 * - getWarmupPlan: retrieval from storage
 * - saveWarmupPlan: persistence to storage
 * - deleteWarmupPlan: reset functionality
 * - createDefaultWarmupPlan: default template generation
 *
 * @critical - User data persistence
 */

import {
  getWarmupPlan,
  saveWarmupPlan,
  deleteWarmupPlan,
  createDefaultWarmupPlan,
} from './warmupPlan';
import { WARMUP_PLAN_KEY } from '@/config/storageKeys';
import { WARMUP_PLAN_SCHEMA_VERSION } from '@/types/warmupPlan';
import type { WarmupPlan } from '@/types/warmupPlan';
import type { TFunction } from 'i18next';

// Mock storage utilities
jest.mock('@/utils/storage', () => ({
  getStorageItem: jest.fn(),
  setStorageItem: jest.fn(),
}));

// Mock storageKeyLock
jest.mock('./storageKeyLock', () => ({
  withKeyLock: jest.fn((key, fn) => fn()),
}));

// Mock logger to avoid console noise
jest.mock('@/utils/logger', () => ({
  error: jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

const { getStorageItem, setStorageItem } = jest.requireMock('@/utils/storage');

// Mock translation function
const createMockT = (): TFunction => {
  const t = jest.fn((key: string, defaultValueOrOptions?: string | { returnObjects?: boolean; defaultValue?: unknown }) => {
    // Handle returnObjects case for arrays
    if (typeof defaultValueOrOptions === 'object' && defaultValueOrOptions.returnObjects) {
      // Return mock arrays for warmup plan points
      if (key.includes('Points')) {
        return ['Point 1', 'Point 2', 'Point 3'];
      }
      if (key.includes('Activities')) {
        return ['Activity 1', 'Activity 2'];
      }
      return defaultValueOrOptions.defaultValue ?? [];
    }
    // Return the default value or the key
    return typeof defaultValueOrOptions === 'string' ? defaultValueOrOptions : key;
  }) as unknown as TFunction;
  return t;
};

// Valid plan fixture
const createValidPlan = (): WarmupPlan => ({
  id: 'user_warmup_plan',
  version: WARMUP_PLAN_SCHEMA_VERSION,
  lastModified: '2024-01-01T00:00:00.000Z',
  isDefault: false,
  sections: [
    {
      id: 'section_1',
      title: 'Section 1',
      content: '• Point 1\n• Point 2',
    },
    {
      id: 'section_2',
      title: 'Section 2',
      content: '• Activity 1\n• Activity 2',
    },
  ],
});

describe('warmupPlan utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getWarmupPlan', () => {
    it('returns null when no plan exists in storage', async () => {
      getStorageItem.mockResolvedValue(null);

      const result = await getWarmupPlan();

      expect(result).toBeNull();
      expect(getStorageItem).toHaveBeenCalledWith(WARMUP_PLAN_KEY);
    });

    it('returns null when storage contains empty string', async () => {
      getStorageItem.mockResolvedValue('');

      const result = await getWarmupPlan();

      expect(result).toBeNull();
    });

    it('returns parsed plan when valid JSON exists', async () => {
      const validPlan = createValidPlan();
      getStorageItem.mockResolvedValue(JSON.stringify(validPlan));

      const result = await getWarmupPlan();

      expect(result).toEqual(validPlan);
    });

    it('returns null when JSON is invalid', async () => {
      getStorageItem.mockResolvedValue('not valid json {{{');

      const result = await getWarmupPlan();

      expect(result).toBeNull();
    });

    it('returns null when parsed data lacks sections field', async () => {
      getStorageItem.mockResolvedValue(JSON.stringify({ id: 'test', version: 1 }));

      const result = await getWarmupPlan();

      expect(result).toBeNull();
    });

    it('returns null when storage throws an error', async () => {
      getStorageItem.mockRejectedValue(new Error('Storage error'));

      const result = await getWarmupPlan();

      expect(result).toBeNull();
    });
  });

  describe('saveWarmupPlan', () => {
    it('saves plan to storage with updated lastModified', async () => {
      setStorageItem.mockResolvedValue(undefined);
      const plan = createValidPlan();
      const originalLastModified = plan.lastModified;

      const result = await saveWarmupPlan(plan);

      expect(result).toBe(true);
      expect(setStorageItem).toHaveBeenCalledWith(
        WARMUP_PLAN_KEY,
        expect.any(String)
      );

      // Verify the saved data
      const savedData = JSON.parse(setStorageItem.mock.calls[0][1]);
      expect(savedData.lastModified).not.toBe(originalLastModified);
      expect(savedData.isDefault).toBe(false);
    });

    it('sets isDefault to false when saving', async () => {
      setStorageItem.mockResolvedValue(undefined);
      const plan = createValidPlan();
      plan.isDefault = true;

      await saveWarmupPlan(plan);

      const savedData = JSON.parse(setStorageItem.mock.calls[0][1]);
      expect(savedData.isDefault).toBe(false);
    });

    it('returns false when storage throws an error', async () => {
      setStorageItem.mockRejectedValue(new Error('Storage error'));
      const plan = createValidPlan();

      const result = await saveWarmupPlan(plan);

      expect(result).toBe(false);
    });
  });

  describe('deleteWarmupPlan', () => {
    it('clears the plan from storage', async () => {
      setStorageItem.mockResolvedValue(undefined);

      const result = await deleteWarmupPlan();

      expect(result).toBe(true);
      expect(setStorageItem).toHaveBeenCalledWith(WARMUP_PLAN_KEY, '');
    });

    it('returns false when storage throws an error', async () => {
      setStorageItem.mockRejectedValue(new Error('Storage error'));

      const result = await deleteWarmupPlan();

      expect(result).toBe(false);
    });
  });

  describe('createDefaultWarmupPlan', () => {
    it('creates a plan with correct structure', () => {
      const t = createMockT();

      const result = createDefaultWarmupPlan(t);

      expect(result.id).toBe('user_warmup_plan');
      expect(result.version).toBe(WARMUP_PLAN_SCHEMA_VERSION);
      expect(result.isDefault).toBe(true);
      expect(result.sections).toBeInstanceOf(Array);
      expect(result.sections.length).toBeGreaterThan(0);
    });

    it('generates unique IDs for each section', () => {
      const t = createMockT();

      const result = createDefaultWarmupPlan(t);

      const sectionIds = result.sections.map((s) => s.id);
      const uniqueIds = new Set(sectionIds);
      expect(uniqueIds.size).toBe(sectionIds.length);
    });

    it('creates sections with title and content', () => {
      const t = createMockT();

      const result = createDefaultWarmupPlan(t);

      result.sections.forEach((section) => {
        expect(section).toHaveProperty('id');
        expect(section).toHaveProperty('title');
        expect(section).toHaveProperty('content');
        expect(typeof section.id).toBe('string');
        expect(typeof section.title).toBe('string');
        expect(typeof section.content).toBe('string');
      });
    });

    it('sets lastModified to current ISO timestamp', () => {
      const t = createMockT();
      const before = new Date().toISOString();

      const result = createDefaultWarmupPlan(t);

      const after = new Date().toISOString();
      expect(result.lastModified >= before).toBe(true);
      expect(result.lastModified <= after).toBe(true);
    });
  });
});
