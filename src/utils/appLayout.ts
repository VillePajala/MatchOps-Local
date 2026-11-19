/**
 * The app layout (Onboarding v3, D21): pure reads, no storage.
 *
 * Two layouts only - 'basic' (Perusnäkymä) and 'full' (Koko näkymä, the app as
 * it has always been). The stored value is checked, never cast: a settings row
 * holds whatever was last written to it, and anything that is not exactly
 * 'basic' must land on the layout every existing coach already has.
 *
 * Kept free of imports from the data layer so the DataStores can use the
 * sanitizers below without an import cycle.
 */

import {
  APP_LAYOUTS,
  ONBOARDING_MILESTONES,
  type AppLayout,
  type AppSettings,
  type OnboardingMilestones,
} from '@/types/settings';

/** A stored value as a layout, or undefined when it is not one of the two. */
export function parseAppLayout(value: unknown): AppLayout | undefined {
  return (APP_LAYOUTS as readonly unknown[]).includes(value) ? (value as AppLayout) : undefined;
}

/**
 * The layout an account sees. UNSET IS 'full' (OD4, D14): every account that
 * existed before layouts - including the ones with players but no game - keeps
 * the full app. Only an explicit 'basic' gives the basic layout.
 */
export function resolveAppLayout(settings: Pick<AppSettings, 'appLayout'> | null | undefined): AppLayout {
  return settings?.appLayout === 'basic' ? 'basic' : 'full';
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Milestones read from storage, entry by entry: known milestone names with a
 * real ISO timestamp survive, anything else is dropped. Undefined when nothing
 * valid is left (the same as "none recorded").
 */
export function sanitizeOnboardingMilestones(value: unknown): OnboardingMilestones | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const out: OnboardingMilestones = {};
  for (const name of ONBOARDING_MILESTONES) {
    const at = source[name];
    if (typeof at === 'string' && ISO_TIMESTAMP.test(at) && !Number.isNaN(Date.parse(at))) {
      out[name] = at;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
