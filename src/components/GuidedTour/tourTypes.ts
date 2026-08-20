/**
 * Types for the guided first-run tour engine.
 *
 * The tour is a small state machine, not a fixed coachmark reel: each step
 * spotlights one control (by CSS selector / data-testid) and either waits for a
 * Next tap or auto-advances when an app-state predicate becomes true. This lets
 * the tour observe real progress (a player was added, a game was created) rather
 * than intercept individual buttons - the target controls live inside modals.
 *
 * See docs/03-active-plans/new-user-funnel-fix-plan.md ("PR-chopped execution plan").
 */

/**
 * App-state signals the tour observes to auto-advance. Sourced from page.tsx's
 * checkAppState (`hasPlayers` / `hasTeam` / `hasTeamLinkedGame`) plus the current
 * screen and live-match flags. Extended as later PRs add match-view steps.
 */
export interface TourSignals {
  hasPlayers: boolean;
  hasTeam: boolean;
  hasTeamLinkedGame: boolean;
  screen: 'start' | 'home';
  isTimerRunning: boolean;
  hasLoggedGoal: boolean;
}

export interface TourStep {
  /** Stable step id (used for React keys and tests). */
  id: string;
  /** i18n key for the step title. */
  titleKey: string;
  /** English fallback for the title (also what tests assert on). */
  title: string;
  /** i18n key for the step body copy. */
  bodyKey: string;
  /** English fallback for the body copy. */
  body: string;
  /**
   * CSS selector(s) of the control to spotlight (e.g. `[data-testid="..."]` or
   * `#id`). An array is tried in order and the first control currently present in
   * the DOM wins - this lets one step spotlight the modal-opener while the modal
   * is closed and the inner control once it opens. Omitted = a centered card.
   */
  targetSelector?: string | string[];
  /**
   * When this predicate returns true for the current signals, the step
   * auto-advances. Omitted = advance only when the user taps Next.
   */
  advanceWhen?: (signals: TourSignals) => boolean;
}
