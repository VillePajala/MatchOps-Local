'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGuidedTourActive, useOnboardingUserId } from '@/components/setupWizardActive';
import { primaryButtonStyle } from '@/styles/modalStyles';

/**
 * FirstVisitIntro - Onboarding v2's permanent education layer (PR 21).
 *
 * A short highlighted note at the top of a surface, shown ONCE per user per
 * surface: "Selvä" dismisses it forever. Never a pre-modal gate - the surface
 * opens normally and the note sits beside the controls it explains (owner
 * decision: education in place, never blocking). This is what teaches months
 * after install - the first time a coach opens stats or the planner, they get
 * one line of orientation, then never again.
 */

const SEEN_PREFIX = 'matchops_first_visit_';

function seenKey(surface: string, userId: string | null | undefined): string {
  return `${SEEN_PREFIX}${surface}_${userId ?? 'local'}`;
}

/** On any storage failure report "seen" - never nag a user we can't remember. */
function isSeen(surface: string, userId: string | null | undefined): boolean {
  if (typeof window === 'undefined') return true;
  try {
    // eslint-disable-next-line no-restricted-globals -- one-time UI education flag, not app data (same pattern as the tour/wizard flags)
    return localStorage.getItem(seenKey(surface, userId)) === '1';
  } catch {
    return true;
  }
}

/**
 * The surfaces the FIRST-RUN guided tour teaches. Finishing the tour retires
 * their notes (owner rule: the tour and the notes must never teach the same
 * view); stats/planner/seasons keep theirs - the tour never covers them.
 */
export const TOUR_COVERED_SURFACES = ['team-form', 'game-setup', 'match-field', 'timer', 'goal-log'] as const;

/** Called by GuidedTourProvider when the first-run tour COMPLETES (not skip). */
export function markTourCoveredFirstVisitsSeen(userId: string | null | undefined): void {
  for (const surface of TOUR_COVERED_SURFACES) {
    markSeen(surface, userId);
  }
}

function markSeen(surface: string, userId: string | null | undefined): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- one-time UI education flag, not app data (same pattern as the tour/wizard flags)
    localStorage.setItem(seenKey(surface, userId), '1');
  } catch {
    // Not persistable - the in-session dismissal below still hides it.
  }
}

interface FirstVisitIntroProps {
  /** Stable surface id - keys the per-user seen flag (e.g. "team-form"). */
  surface: string;
  /** Already-translated one-to-three-line note; may embed inline icons. */
  text: React.ReactNode;
  /** Absolute card variant for the field view (overlays, never blocks). */
  overlay?: boolean;
  /** Extra layout classes from the host surface (e.g. margins). */
  className?: string;
}

const FirstVisitIntro: React.FC<FirstVisitIntroProps> = ({ surface, text, overlay = false, className = '' }) => {
  const { t } = useTranslation();
  // Store-fed, context-FREE on purpose (review #728 rounds 1-2): host-modal
  // suites partially mock the providers, so any context import here is a
  // breakage vector. page.tsx publishes the settled user id (undefined while
  // auth resolves -> banner hidden, no 'local'-key misfiling) and the tour
  // provider mirrors its active flag - while the tour runs its own hints own
  // these surfaces, so the banner yields without consuming its one showing.
  const userId = useOnboardingUserId();
  const tourActive = useGuidedTourActive();
  const [dismissed, setDismissed] = useState(false);
  // Memoized: FieldContainer re-renders per drag frame and TimerOverlay per
  // clock tick - no localStorage read on those hot paths (review #728).
  const initiallySeen = useMemo(
    () => (userId === undefined ? true : isSeen(surface, userId)),
    [surface, userId],
  );

  if (dismissed || tourActive || userId === undefined || initiallySeen) return null;

  // A navy card on the app's popup surface. The field overlay COVERS the
  // temporarily-irrelevant top buttons (top-3, z-30): the card is temporary
  // and dismissible, and in that moment the guidance matters more than
  // rules/camera shortcuts (owner round 4).
  const frame =
    'rounded-2xl bg-surface-2 font-ui shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10),0_16px_32px_-8px_rgb(2_6_23/0.9)]';
  const base = overlay ? `absolute inset-x-3 top-3 z-30 ${frame}` : frame;

  return (
    <div data-testid={`first-visit-${surface}`} className={`${base} ${className}`.trim()}>
      {/* Composition (owner round 8): text full-width, then a full-width
          Selva row - the house's solid full-width-on-phone style; a
          bottom-right button left a hollow band across the card on short
          notes. */}
      <div className="px-4 py-4">
        <p className="text-[15px] leading-snug text-ink">{text}</p>
        <button
          type="button"
          data-testid={`first-visit-${surface}-dismiss`}
          onClick={() => {
            markSeen(surface, userId);
            setDismissed(true);
          }}
          className={`${primaryButtonStyle} w-full mt-3`}
        >
          {t('firstVisit.gotIt', 'Got it')}
        </button>
      </div>
    </div>
  );
};

export default FirstVisitIntro;
