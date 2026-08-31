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
  /** Already-translated one-to-three-line note. */
  text: string;
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

  // Visual language borrowed from the app-update banner (owner round 2: the
  // one-time note should read as a SYSTEM moment, distinct from form chrome):
  // dark glass shell + the gradient hairline. The field overlay sits BELOW the
  // field's own top buttons (top-16, z-30) so neither covers the other.
  const shell =
    'relative overflow-hidden rounded-2xl bg-slate-900/80 border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.45)] backdrop-blur-md';
  const base = overlay ? `absolute inset-x-3 top-16 z-30 ${shell}` : `${shell} mb-4`;

  return (
    <div data-testid={`first-visit-${surface}`} className={`${base} ${className}`.trim()}>
      <div
        className="absolute left-1/2 top-0 h-[2px] w-[60%] -translate-x-1/2 bg-gradient-to-r from-sky-400 via-indigo-400 to-fuchsia-500 opacity-80"
        aria-hidden="true"
      />
      <div className="flex items-start gap-3 px-4 py-3">
        <p className="flex-1 text-sm leading-snug text-slate-100">{text}</p>
        <button
          type="button"
          data-testid={`first-visit-${surface}-dismiss`}
          onClick={() => {
            markSeen(surface, userId);
            setDismissed(true);
          }}
          className="flex-none rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors"
        >
          {t('firstVisit.gotIt', 'Got it')}
        </button>
      </div>
    </div>
  );
};

export default FirstVisitIntro;
