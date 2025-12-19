/**
 * Warmup Plan Utility Tests
 *
 * Tests for the warmup plan storage operations:
 * - getWarmupPlan: retrieval via DataStore
 * - saveWarmupPlan: persistence via DataStore
 * - deleteWarmupPlan: reset functionality via DataStore
 * - createDefaultWarmupPlan: default template generation (business logic)
 *
 * @critical - User data persistence
 */

import {
  getWarmupPlan,
  saveWarmupPlan,
  deleteWarmupPlan,
  createDefaultWarmupPlan,
} from './warmupPlan';
import { WARMUP_PLAN_SCHEMA_VERSION } from '@/types/warmupPlan';
import type { WarmupPlan } from '@/types/warmupPlan';
import type { DataStore } from '@/interfaces/DataStore';
import type { TFunction } from 'i18next';

// Create mock DataStore
const mockDataStore: jest.Mocked<Pick<DataStore, 'getWarmupPlan' | 'saveWarmupPlan' | 'deleteWarmupPlan'>> = {
  getWarmupPlan: jest.fn(),
  saveWarmupPlan: jest.fn(),
  deleteWarmupPlan: jest.fn(),
};

// Mock the datastore factory
jest.mock('@/datastore', () => ({
  getDataStore: jest.fn(() => Promise.resolve(mockDataStore)),
}));

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
    it('returns plan from DataStore when it exists', async () => {
      const validPlan = createValidPlan();
      mockDataStore.getWarmupPlan.mockResolvedValue(validPlan);

      const result = await getWarmupPlan();

      expect(mockDataStore.getWarmupPlan).toHaveBeenCalledTimes(1);
      expect(result).toEqual(validPlan);
    });

    it('returns null when no plan exists', async () => {
      mockDataStore.getWarmupPlan.mockResolvedValue(null);

      const result = await getWarmupPlan();

      expect(result).toBeNull();
    });

    it('propagates DataStore errors', async () => {
      mockDataStore.getWarmupPlan.mockRejectedValue(new Error('DataStore error'));

      await expect(getWarmupPlan()).rejects.toThrow('DataStore error');
    });
  });

  describe('saveWarmupPlan', () => {
    it('saves plan via DataStore and returns success', async () => {
      mockDataStore.saveWarmupPlan.mockResolvedValue(true);
      const plan = createValidPlan();

      const result = await saveWarmupPlan(plan);

      expect(result).toBe(true);
      expect(mockDataStore.saveWarmupPlan).toHaveBeenCalledWith(plan);
    });

    it('returns false when DataStore save fails', async () => {
      mockDataStore.saveWarmupPlan.mockResolvedValue(false);
      const plan = createValidPlan();

      const result = await saveWarmupPlan(plan);

      expect(result).toBe(false);
    });

    it('propagates DataStore errors', async () => {
      mockDataStore.saveWarmupPlan.mockRejectedValue(new Error('DataStore error'));
      const plan = createValidPlan();

      await expect(saveWarmupPlan(plan)).rejects.toThrow('DataStore error');
    });
  });

  describe('deleteWarmupPlan', () => {
    it('deletes plan via DataStore and returns success', async () => {
      mockDataStore.deleteWarmupPlan.mockResolvedValue(true);

      const result = await deleteWarmupPlan();

      expect(result).toBe(true);
      expect(mockDataStore.deleteWarmupPlan).toHaveBeenCalledTimes(1);
    });

    it('returns false when DataStore delete fails', async () => {
      mockDataStore.deleteWarmupPlan.mockResolvedValue(false);

      const result = await deleteWarmupPlan();

      expect(result).toBe(false);
    });

    it('propagates DataStore errors', async () => {
      mockDataStore.deleteWarmupPlan.mockRejectedValue(new Error('DataStore error'));

      await expect(deleteWarmupPlan()).rejects.toThrow('DataStore error');
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
