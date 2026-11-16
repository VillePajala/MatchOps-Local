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

/**
 * Is a LIVE match mounted - started and not finished, whether the clock runs, is
 * paused, or the match is at a period break (review 4.24)? Only a running clock
 * used to block the long-background reload, so half-time or a paused match away
 * for 5+ minutes got a full page reload: a slow return to the match (boot, auth,
 * cloud pull, network-first navigation), with any open dialog and undo lost, and a
 * "Start Period 2" tapped during the reload's notice could be lost to it.
 */
let matchLive = false;

/** Set by useGameTimer whenever the match's live state changes. */
export const setMatchLive = (live: boolean): void => {
  matchLive = live;
};

/** True while a running OR paused OR half-time match is mounted. A running clock
 *  implies a live match, so the `|| matchTimerRunning` is only a safety net for a
 *  caller that publishes one signal but not the other.
 *  No upper bound on purpose: a match left paused for hours is still never
 *  force-reloaded - the in-place refresh still runs and new versions still come
 *  through the update banner. */
export const isMatchLive = (): boolean => matchLive || matchTimerRunning;
