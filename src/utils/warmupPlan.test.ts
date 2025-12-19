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

// Mock logger to avoid console noise
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
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
    it('returns null when no plan exists', async () => {
      mockDataStore.getWarmupPlan.mockResolvedValue(null);

      const result = await getWarmupPlan();

      expect(result).toBeNull();
      expect(mockDataStore.getWarmupPlan).toHaveBeenCalledTimes(1);
    });

    it('returns plan when it exists', async () => {
      const validPlan = createValidPlan();
      mockDataStore.getWarmupPlan.mockResolvedValue(validPlan);

      const result = await getWarmupPlan();

      expect(result).toEqual(validPlan);
    });

    it('returns null when DataStore throws an error', async () => {
      mockDataStore.getWarmupPlan.mockRejectedValue(new Error('DataStore error'));

      const result = await getWarmupPlan();

      expect(result).toBeNull();
    });
  });

  describe('saveWarmupPlan', () => {
    it('saves plan via DataStore', async () => {
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

    it('returns false when DataStore throws an error', async () => {
      mockDataStore.saveWarmupPlan.mockRejectedValue(new Error('DataStore error'));
      const plan = createValidPlan();

      const result = await saveWarmupPlan(plan);

      expect(result).toBe(false);
    });
  });

  describe('deleteWarmupPlan', () => {
    it('deletes plan via DataStore', async () => {
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

    it('returns false when DataStore throws an error', async () => {
      mockDataStore.deleteWarmupPlan.mockRejectedValue(new Error('DataStore error'));

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
