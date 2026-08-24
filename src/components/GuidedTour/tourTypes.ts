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
  /** Live master-roster size (from the shared React Query cache), for the
   *  add-players progress/goal. */
  playersCount: number;
  /** The add-players goal - the on-field size of the coach's format (5v5 /
   *  8v8 / 11v11), chosen via the step's chips. Default 8. */
  targetPlayers: number;
  /** Live team count (from the shared React Query cache), so the create-team
   *  step advances the moment the team is created - not only on modal close. */
  teamsCount: number;
  /** A formation template was applied in the current match view (resets per
   *  match) - advances the set-formation step. */
  hasAppliedFormation: boolean;
}

/** One stage of a step's tap chain: a control to spotlight + what to do there. */
export interface TourTarget {
  /** CSS selector (`[data-testid="..."]` or `#id`) of the control to spotlight. */
  selector: string;
  /** i18n key for this stage's one-line instruction. */
  hintKey: string;
  /** English fallback for the hint (also what tests assert on). */
  hint: string;
  /**
   * Compact mode for IN-FORM stages: instead of the full card (which on a phone
   * inevitably covers form fields - owner-reported: it sat on the player name
   * input), render only the ring plus a slim text-only pill that is entirely
   * pointer-events-none, so it can never block typing or taps. No dimming
   * either - the form must stay fully visible.
   */
  compact?: boolean;
  /**
   * Extra gate for stages whose controls coexist in the DOM (a form's fields
   * are all present at once, so presence alone cannot ORDER them). Evaluated at
   * resolve time; the stage is skipped while it returns false. May read the DOM
   * (e.g. "the name input is still empty") and receives `seen(selector)` - true
   * once that selector has been spotlighted during this step - to sequence
   * "go pick players" before "now create" without app-state wiring.
   */
  when?: (seen: (selector: string) => boolean) => boolean;
}

/**
 * A one-tap choice rendered as a chip on the step's card (e.g. the 5v5 / 8v8 /
 * 11v11 format picker). Tapping merges `apply` into the tour signals; a chip
 * reads as selected when every entry of `apply` matches the current signals.
 */
export interface TourChoice {
  id: string;
  /** Literal label (format strings like "5v5" need no translation). */
  label: string;
  apply: Partial<TourSignals>;
}

/** Optional live progress shown on a step's card (e.g. "3 / 8 players added"). */
export interface TourProgress {
  /** i18n key for the progress label; interpolates {{done}} and {{target}}. */
  key: string;
  /** English fallback template (same placeholders). */
  fallback: string;
  compute: (signals: TourSignals) => { done: number; target: number };
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
  /** Optional live progress line on the card ("3 / 8 players added"). */
  progress?: TourProgress;
  /** Optional one-tap chips on the card (e.g. the format picker); each merges
   *  its `apply` into the signals. Optionally titled via choicesLabelKey. */
  choices?: TourChoice[];
  choicesLabelKey?: string;
  choicesLabel?: string;
  /**
   * When this predicate returns true for the current signals, the step
   * auto-advances. Omitted = advance only when the user taps Next.
   */
  advanceWhen?: (signals: TourSignals) => boolean;
}
