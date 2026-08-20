/**
 * Types for the guided first-run tour engine.
 *
 * The tour is a small state machine, not a fixed coachmark reel: each step
 * declares a TAP CHAIN - an ordered list of controls, most specific first - and
 * the overlay spotlights the first one currently present in the DOM, showing
 * that stage's hint. This guides the coach one tap at a time toward the step's
 * goal (e.g. "Open the Club tab" -> "Tap Players" -> "Add a player") instead of
 * only pointing at a destination that may not even be on screen. Steps either
 * wait for a Next tap or auto-advance when an app-state predicate becomes true.
 *
 * The overlay is a GUIDANCE LAYER, not a gate: it never blocks interaction with
 * the app (pointer-events pass through everywhere except the tour card itself),
 * so the coach can always act - including in ways the tour did not point at.
 *
 * See docs/03-active-plans/new-user-funnel-fix-plan.md ("PR-chopped execution plan").
 */

/**
 * App-state signals the tour observes to auto-advance. Sourced from page.tsx's
 * checkAppState (`hasPlayers` / `hasTeam` / `hasTeamLinkedGame`) plus the current
 * screen, and from the match view (timer running, goal logged).
 */
export interface TourSignals {
  hasPlayers: boolean;
  hasTeam: boolean;
  hasTeamLinkedGame: boolean;
  screen: 'start' | 'home';
  isTimerRunning: boolean;
  hasLoggedGoal: boolean;
}

/** One stage of a step's tap chain: a control to spotlight + what to do there. */
export interface TourTarget {
  /** CSS selector (`[data-testid="..."]` or `#id`) of the control to spotlight. */
  selector: string;
  /** i18n key for this stage's one-line instruction. */
  hintKey: string;
  /** English fallback for the hint (also what tests assert on). */
  hint: string;
}

export interface TourStep {
  /** Stable step id (used for React keys and tests). */
  id: string;
  /** i18n key for the step title. */
  titleKey: string;
  /** English fallback for the title. */
  title: string;
  /** i18n key for the step body copy (shown when no target is on screen). */
  bodyKey: string;
  /** English fallback for the body copy. */
  body: string;
  /**
   * Tap chain, most specific first: the overlay spotlights the FIRST target
   * currently present (and laid out) in the DOM and shows its hint. Omitted =
   * a card with the body copy and no spotlight (welcome/done bookends).
   */
  targets?: TourTarget[];
  /**
   * When this predicate returns true for the current signals, the step
   * auto-advances. Omitted = advance only when the user taps Next.
   */
  advanceWhen?: (signals: TourSignals) => boolean;
}
