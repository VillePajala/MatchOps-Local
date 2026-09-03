'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGuidedTourActive, useOnboardingUserId } from '@/components/setupWizardActive';

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

  // Visual language borrowed from the app-update banner, upgraded per owner
  // round 3: the gradient runs as a full EDGE around the card (1.5px frame
  // around a dark glass inner), so the note reads as a system moment from any
  // angle. The field overlay sits BELOW the field's own top buttons (top-16,
  // z-30). Owner round 4: the overlay COVERS the field's top buttons while
  // visible - the card is temporary and dismissible, and in that moment the
  // guidance matters more than rules/camera shortcuts.
  const frame =
    'rounded-2xl p-[1.5px] bg-gradient-to-br from-sky-400 via-indigo-400 to-fuchsia-500 shadow-[0_12px_36px_rgba(0,0,0,0.45)]';
  const base = overlay ? `absolute inset-x-3 top-3 z-30 ${frame}` : `${frame} mb-4`;

  return (
    <div data-testid={`first-visit-${surface}`} className={`${base} ${className}`.trim()}>
      {/* Dialog composition (owner round 6): text full-width, action pinned
          bottom-right - the old side-by-side row left the button floating at
          the top of a tall ragged column on multi-line notes. */}
      <div className="rounded-[14px] bg-slate-900/95 backdrop-blur-md px-4 py-3">
        <p className="text-sm leading-snug text-slate-100">{text}</p>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            data-testid={`first-visit-${surface}-dismiss`}
            onClick={() => {
              markSeen(surface, userId);
              setDismissed(true);
            }}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 text-sm font-semibold text-white transition-colors"
          >
            {t('firstVisit.gotIt', 'Got it')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FirstVisitIntro;
