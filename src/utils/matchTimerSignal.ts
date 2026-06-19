/**
 * Cross-cutting signal: is a match clock currently running?
 *
 * `useGameTimer` and `useAppResume` live in different parts of the tree, so this
 * module-level flag lets the resume handler make a synchronous decision without
 * threading game state up through props/context.
 *
 * Why it exists: `useAppResume` force-reloads the page after a long background
 * (>5 min) as blank-screen / corrupt-state recovery. That's the right safety net
 * when the app is idle, but during a live match it throws away the in-game view
 * and the wall-clock timer that `useGameTimer`'s reanchor already preserves —
 * dropping the user back to the start screen with a paused clock. So while a
 * match clock is running we suppress the force-reload and let the reanchor keep
 * the timer going.
 *
 * The timer does NOT pause on backgrounding (see useGameTimer), so this stays
 * true across the hidden period and is read on the foreground transition.
 */

let matchTimerRunning = false;

/** Set by useGameTimer whenever the running/in-progress state changes. */
export const setMatchTimerRunning = (running: boolean): void => {
  matchTimerRunning = running;
};

/** Read by useAppResume before deciding to force-reload. */
export const isMatchTimerRunning = (): boolean => matchTimerRunning;
