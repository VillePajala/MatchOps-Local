/**
 * Tests for datastore normalizers
 */

import { normalizeWarmupPlanForSave } from '../normalizers';
import type { WarmupPlan } from '@/types/warmupPlan';

describe('normalizeWarmupPlanForSave', () => {
  const basePlan: WarmupPlan = {
    id: 'test-plan',
    version: 1,
    lastModified: '2020-01-01T00:00:00.000Z',
    isDefault: true,
    sections: [{ id: 'section-1', title: 'Test', content: 'Content' }],
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should set lastModified to current timestamp', () => {
    const result = normalizeWarmupPlanForSave(basePlan);
    expect(result.lastModified).toBe('2024-06-15T12:00:00.000Z');
  });

  it('should set isDefault to false', () => {
    const result = normalizeWarmupPlanForSave(basePlan);
    expect(result.isDefault).toBe(false);
  });

  it('should preserve other fields', () => {
    const result = normalizeWarmupPlanForSave(basePlan);
    expect(result.id).toBe('test-plan');
    expect(result.version).toBe(1);
    expect(result.sections).toEqual(basePlan.sections);
  });

  it('should not mutate the input plan', () => {
    const originalLastModified = basePlan.lastModified;
    const originalIsDefault = basePlan.isDefault;

    normalizeWarmupPlanForSave(basePlan);

    expect(basePlan.lastModified).toBe(originalLastModified);
    expect(basePlan.isDefault).toBe(originalIsDefault);
  });

  it('should handle plan that is already not default', () => {
    const nonDefaultPlan = { ...basePlan, isDefault: false };
    const result = normalizeWarmupPlanForSave(nonDefaultPlan);
    expect(result.isDefault).toBe(false);
  });
});
