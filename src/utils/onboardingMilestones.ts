/**
 * Onboarding milestones (Onboarding v3, D17) - the ONE seam every milestone
 * goes through.
 *
 * Each milestone is a first-time ISO timestamp in the coach's own settings row
 * (`AppSettings.onboardingMilestones`; cloud column `onboarding_milestones`,
 * migration 062), so local and cloud behave the same and the record follows the
 * account to a new phone. No event stream, no content, no third party.
 *
 * Writes are serialized through one chain: every write is a read-modify-write
 * of the settings, and two milestones recorded in the same moment (the wizard
 * records two within a second) must not overwrite each other.
 *
 * A milestone that cannot be written is not an error the coach sees:
 * milestones are measurement, never app data, and must never block anything.
 */

import { getAppSettings, updateAppSettings } from '@/utils/appSettings';
import type { AppSettings, OnboardingMilestone, OnboardingMilestones } from '@/types/settings';
import logger from '@/utils/logger';

export type { OnboardingMilestone } from '@/types/settings';

let writeChain: Promise<void> = Promise.resolve();

/** Run one settings read-modify-write after every earlier one has finished. */
function enqueue(task: () => Promise<void>): Promise<void> {
  const next = writeChain.then(task).catch((error) => {
    logger.warn('[onboardingMilestones] write failed (ignored)', { error });
  });
  writeChain = next;
  return next;
}

const toStoreId = (userId: string | null | undefined): string | undefined => userId ?? undefined;

/**
 * The settings patch that records `milestones` that are not recorded yet, or
 * null when there is nothing new. Pure, for the tests.
 */
export function milestonePatch(
  current: OnboardingMilestones | undefined,
  milestones: OnboardingMilestone[],
  at: Date,
): Pick<AppSettings, 'onboardingMilestones'> | null {
  const missing = milestones.filter((m) => !current?.[m]);
  if (missing.length === 0) return null;
  const next: OnboardingMilestones = { ...current };
  for (const m of missing) next[m] = at.toISOString();
  return { onboardingMilestones: next };
}

/** Record a milestone once; later calls keep the first timestamp. */
export function recordMilestone(
  milestone: OnboardingMilestone,
  userId: string | null | undefined,
  at: Date = new Date(),
): Promise<void> {
  return enqueue(async () => {
    const settings = await getAppSettings(toStoreId(userId));
    const patch = milestonePatch(settings.onboardingMilestones, [milestone], at);
    if (patch) await updateAppSettings(patch, toStoreId(userId));
  });
}

/**
 * Whether this ACCOUNT has already been through the setup wizard - finished
 * ("Valmis") or skipped (review R9). Read from the synced settings row, so a new
 * phone knows it too; the per-device localStorage flag is only a fast cache.
 */
export function hasSeenSetupWizard(milestones: OnboardingMilestones | undefined | null): boolean {
  return !!(milestones?.wizardDone || milestones?.wizardSkipped);
}

/** Every milestone recorded for the account (empty when none). */
export async function getMilestones(userId: string | null | undefined): Promise<OnboardingMilestones> {
  try {
    const settings = await getAppSettings(toStoreId(userId));
    return settings.onboardingMilestones ?? {};
  } catch {
    return {};
  }
}

/**
 * A NEW account reached the setup wizard: it gets the basic layout and its
 * sign-up time is recorded, in one write.
 *
 * Called only where the wizard is shown, which is only for an account whose
 * empty-account check succeeded - so an existing account never lands here and
 * keeps the full layout (OD4). A layout already chosen is never overwritten.
 * `signedUpAt` is the auth record's creation time when known: the moment the
 * account was made, not the moment this ran.
 */
export function beginNewAccountOnboarding(
  userId: string | null | undefined,
  signedUpAt?: Date,
): Promise<void> {
  return enqueue(async () => {
    const settings = await getAppSettings(toStoreId(userId));
    const at = signedUpAt && !Number.isNaN(signedUpAt.getTime()) ? signedUpAt : new Date();
    const milestones = milestonePatch(settings.onboardingMilestones, ['signedUp'], at);
    const patch: Partial<AppSettings> = {
      ...(settings.appLayout ? {} : { appLayout: 'basic' as const }),
      ...(milestones ?? {}),
    };
    if (Object.keys(patch).length > 0) await updateAppSettings(patch, toStoreId(userId));
  });
}

/**
 * A game reached full time. `finishedGames` counts every finished game of the
 * account INCLUDING this one. Only accounts that signed up under milestone
 * tracking (a `signedUp` timestamp exists) get game milestones: stamping "now"
 * on a coach with forty games would record a first game that never happened
 * today.
 */
export function recordGameFinished(
  userId: string | null | undefined,
  finishedGames: number,
  at: Date = new Date(),
): Promise<void> {
  if (finishedGames < 1) return Promise.resolve();
  return enqueue(async () => {
    const settings = await getAppSettings(toStoreId(userId));
    if (!settings.onboardingMilestones?.signedUp) return;
    const reached: OnboardingMilestone[] =
      finishedGames >= 2 ? ['firstGameFinished', 'secondGameFinished'] : ['firstGameFinished'];
    const patch = milestonePatch(settings.onboardingMilestones, reached, at);
    if (patch) await updateAppSettings(patch, toStoreId(userId));
  });
}

/** Test seam: wait for every queued write. */
export function flushMilestoneWrites(): Promise<void> {
  return writeChain;
}
