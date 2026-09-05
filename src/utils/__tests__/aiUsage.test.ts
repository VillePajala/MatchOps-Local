/**
 * Device-local AI cost counter (Kirjuri PR 9c).
 *
 * @critical - this is the number a coach checks to answer "is this costing me
 * anything?". It must never over-claim precision, never lose a count on a
 * corrupt value, and never leave the device.
 */
import { getAiUsage, recordAiUsage, resetAiUsage, resetAiUsageStateForTests } from '../aiUsage';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

beforeEach(() => {
  localStorage.clear();
  resetAiUsageStateForTests();
});

describe('aiUsage', () => {
  it('starts empty, with no date claimed before anything was used', () => {
    expect(getAiUsage()).toEqual({ since: '', transcriptions: 0, drafts: 0, estimatedUsd: 0 });
  });

  it('counts each kind separately and sums the estimates', () => {
    recordAiUsage('transcription', 0.003);
    recordAiUsage('transcription', 0.003);
    recordAiUsage('drafting', 0.0021);

    const usage = getAiUsage();
    expect(usage.transcriptions).toBe(2);
    expect(usage.drafts).toBe(1);
    expect(usage.estimatedUsd).toBeCloseTo(0.0081, 4);
    expect(usage.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps the original start date across later requests', () => {
    recordAiUsage('drafting', 0.002);
    const first = getAiUsage().since;
    recordAiUsage('drafting', 0.002);

    expect(getAiUsage().since).toBe(first);
  });

  it('ignores a nonsense amount rather than corrupting the total', () => {
    recordAiUsage('drafting', 0.002);
    recordAiUsage('drafting', Number.NaN);
    recordAiUsage('drafting', -5);

    expect(getAiUsage().estimatedUsd).toBeCloseTo(0.002, 4);
    expect(getAiUsage().drafts).toBe(3);
  });

  it('survives a corrupt stored value by starting over', () => {
    localStorage.setItem('matchops_ai_usage', 'not json at all');
    resetAiUsageStateForTests();

    expect(getAiUsage()).toEqual({ since: '', transcriptions: 0, drafts: 0, estimatedUsd: 0 });
    recordAiUsage('drafting', 0.001);
    expect(getAiUsage().drafts).toBe(1);
  });

  it('reset clears the counter and the date', () => {
    recordAiUsage('transcription', 0.01);
    resetAiUsage();

    expect(getAiUsage()).toEqual({ since: '', transcriptions: 0, drafts: 0, estimatedUsd: 0 });
  });

  /** @critical - device-local like the key, and it must not touch the key itself. */
  it('writes its own device-local key and leaves the provider key alone', () => {
    localStorage.setItem('matchops_ai_key', 'sk-untouched');

    recordAiUsage('drafting', 0.002);

    const stored = JSON.parse(localStorage.getItem('matchops_ai_usage') as string);
    expect(stored.drafts).toBe(1);
    expect(stored.estimatedUsd).toBeCloseTo(0.002, 4);
    expect(localStorage.getItem('matchops_ai_key')).toBe('sk-untouched');
    // Nothing about the coach's data or key ends up in the counter.
    expect(localStorage.getItem('matchops_ai_usage')).not.toContain('sk-');
  });
});
