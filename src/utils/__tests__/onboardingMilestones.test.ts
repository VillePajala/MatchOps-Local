/**
 * Onboarding v3: which accounts get the basic layout (new accounts whose
 * wizard ran; every existing account stays full) and the milestone
 * timestamps (D17) in the settings storage.
 * @critical
 */
import {
  beginNewAccountOnboarding,
  flushMilestoneWrites,
  getMilestones,
  hasSeenSetupWizard,
  milestonePatch,
  recordGameFinished,
  recordMilestone,
} from '../onboardingMilestones';
import { parseAppLayout, resolveAppLayout, sanitizeOnboardingMilestones } from '../appLayout';
import type { AppSettings } from '@/types/settings';

let stored: AppSettings;

jest.mock('@/utils/appSettings', () => ({
  getAppSettings: jest.fn(async () => ({ ...stored })),
  // Shallow merge, like DataStore.updateSettings.
  updateAppSettings: jest.fn(async (patch: Partial<AppSettings>) => {
    stored = { ...stored, ...patch };
    return stored;
  }),
}));
jest.mock('@/utils/logger', () => {
  const log = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() };
  return { __esModule: true, default: log, createLogger: () => log };
});

const T1 = new Date('2026-11-19T10:00:00.000Z');
const T2 = new Date('2026-11-20T10:00:00.000Z');

beforeEach(() => {
  stored = { currentGameId: null };
});

describe('layout resolution', () => {
  it('an account with no layout written (every existing account) is full', () => {
    expect(resolveAppLayout({})).toBe('full');
    expect(resolveAppLayout(null)).toBe('full');
    expect(resolveAppLayout({ appLayout: undefined })).toBe('full');
  });

  it('only an explicit basic is basic', () => {
    expect(resolveAppLayout({ appLayout: 'basic' })).toBe('basic');
    expect(resolveAppLayout({ appLayout: 'full' })).toBe('full');
  });

  /** @edge-case - a stored value is checked, never cast */
  it('parses only the two layouts', () => {
    expect(parseAppLayout('basic')).toBe('basic');
    expect(parseAppLayout('full')).toBe('full');
    expect(parseAppLayout('simple')).toBeUndefined();
    expect(parseAppLayout(null)).toBeUndefined();
  });

  it('keeps only known milestones with real timestamps', () => {
    expect(
      sanitizeOnboardingMilestones({ signedUp: T1.toISOString(), wizardDone: 'yesterday', bogus: T1.toISOString() }),
    ).toEqual({ signedUp: T1.toISOString() });
    expect(sanitizeOnboardingMilestones([])).toBeUndefined();
    expect(sanitizeOnboardingMilestones('x')).toBeUndefined();
  });
});

describe('beginNewAccountOnboarding (the wizard opened)', () => {
  it('gives a new account the basic layout and records its sign-up time', async () => {
    await beginNewAccountOnboarding('u1', T1);
    expect(resolveAppLayout(stored)).toBe('basic');
    expect(stored.onboardingMilestones).toEqual({ signedUp: T1.toISOString() });
  });

  it('never overwrites a layout the coach already chose', async () => {
    stored = { currentGameId: null, appLayout: 'full' };
    await beginNewAccountOnboarding('u1', T1);
    expect(stored.appLayout).toBe('full');
  });

  it('keeps an earlier sign-up time', async () => {
    await beginNewAccountOnboarding('u1', T1);
    await beginNewAccountOnboarding('u1', T2);
    expect(stored.onboardingMilestones?.signedUp).toBe(T1.toISOString());
  });
});

describe('milestones', () => {
  it('records a milestone once, keeping the first timestamp', async () => {
    await recordMilestone('wizardDone', 'u1', T1);
    await recordMilestone('wizardDone', 'u1', T2);
    expect(await getMilestones('u1')).toEqual({ wizardDone: T1.toISOString() });
  });

  /** @edge-case - the wizard records two milestones within a second */
  it('two milestones recorded at once both land', async () => {
    void recordMilestone('wizardDone', 'u1', T1);
    void recordMilestone('firstPlanSeen', 'u1', T2);
    await flushMilestoneWrites();
    expect(stored.onboardingMilestones).toEqual({
      wizardDone: T1.toISOString(),
      firstPlanSeen: T2.toISOString(),
    });
  });

  it('game milestones are not stamped on an account that predates tracking', async () => {
    await recordGameFinished('u1', 5, T1);
    expect(stored.onboardingMilestones).toBeUndefined();
  });

  it('records the first and then the second finished game for a tracked account', async () => {
    await beginNewAccountOnboarding('u1', T1);
    await recordGameFinished('u1', 0, T1);
    expect(stored.onboardingMilestones?.firstGameFinished).toBeUndefined();
    await recordGameFinished('u1', 1, T1);
    expect(stored.onboardingMilestones?.firstGameFinished).toBe(T1.toISOString());
    expect(stored.onboardingMilestones?.secondGameFinished).toBeUndefined();
    await recordGameFinished('u1', 2, T2);
    expect(stored.onboardingMilestones).toMatchObject({
      firstGameFinished: T1.toISOString(),
      secondGameFinished: T2.toISOString(),
    });
  });

  /**
   * The wizard is remembered with the ACCOUNT (review R9): finished or skipped.
   * @critical
   */
  it('hasSeenSetupWizard: true once the wizard was finished or skipped', async () => {
    expect(hasSeenSetupWizard(undefined)).toBe(false);
    expect(hasSeenSetupWizard({ signedUp: T1.toISOString() })).toBe(false);
    expect(hasSeenSetupWizard({ wizardDone: T1.toISOString() })).toBe(true);
    await recordMilestone('wizardSkipped', 'u1', T1);
    expect(hasSeenSetupWizard(await getMilestones('u1'))).toBe(true);
    expect(sanitizeOnboardingMilestones({ wizardSkipped: T1.toISOString() })).toEqual({
      wizardSkipped: T1.toISOString(),
    });
  });

  it('milestonePatch returns null when everything is already recorded', () => {
    expect(milestonePatch({ signedUp: T1.toISOString() }, ['signedUp'], T2)).toBeNull();
  });

  it('a failed write is swallowed (measurement never blocks the coach)', async () => {
    const { updateAppSettings } = jest.requireMock('@/utils/appSettings') as { updateAppSettings: jest.Mock };
    updateAppSettings.mockRejectedValueOnce(new Error('offline'));
    await expect(recordMilestone('wizardDone', 'u1', T1)).resolves.toBeUndefined();
    // The chain keeps working afterwards.
    await recordMilestone('firstPlanSeen', 'u1', T2);
    expect(stored.onboardingMilestones?.firstPlanSeen).toBe(T2.toISOString());
  });
});
