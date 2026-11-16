/**
 * Cross-cutting signal: is the coach in the middle of typing something that
 * is not saved yet? (review 7.1)
 *
 * After 5+ minutes in the background useAppResume forces a full page reload,
 * which throws away everything held only in component state: the setup wizard
 * (team name, players typed so far), a half-filled New Game form, a player
 * being added or edited. Coaches leave the app exactly then - to read names
 * from WhatsApp or the club's roster app. While any such form is open, the
 * reload is skipped and the soft refresh runs instead, as it already does for
 * a live match (`matchTimerSignal`) and an armed recording
 * (`recordingSessionSignal`).
 *
 * A counter, not a flag: forms can be open at the same time (a player form
 * over the roster), and one closing must not release the others' hold.
 */

import { useEffect } from 'react';

let holders = 0;

/** Hold the signal; call the returned function exactly once to release it. */
export const holdUnsavedInput = (): (() => void) => {
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
  };
};

export const hasUnsavedInput = (): boolean => holders > 0;

/** Holds the signal while `active` is true and the component is mounted. */
export const useHoldUnsavedInput = (active: boolean): void => {
  useEffect(() => {
    if (!active) return;
    return holdUnsavedInput();
  }, [active]);
};

/** Test-only reset. */
export const __resetUnsavedInputForTests = (): void => {
  holders = 0;
};
