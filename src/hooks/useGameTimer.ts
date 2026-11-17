import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { saveTimerState, clearTimerState } from '@/utils/timerStateManager';
import { setMatchTimerRunning, setMatchLive } from '@/utils/matchTimerSignal';
import { writeTimerAnchor, clearTimerAnchor } from '@/utils/timerAnchor';
import { useWakeLock } from './useWakeLock';
import { useRecordingSessionActive } from '@/utils/recordingSessionSignal';
import { usePrecisionTimer } from './usePrecisionTimer';
import { GameSessionState, GameSessionAction } from './useGameSessionReducer';
import { clockContinuation } from '@/utils/clockContinuation';
import { isLastPeriod, periodEndSeconds, periodStartSeconds } from '@/utils/matchStructure';

interface UseGameTimerArgs {
  state: GameSessionState;
  dispatch: React.Dispatch<GameSessionAction>;
  currentGameId: string;
}

export const useGameTimer = ({ state, dispatch, currentGameId }: UseGameTimerArgs) => {
  const { syncWakeLock } = useWakeLock();

  // Debounce timer for IndexedDB writes (reduce write frequency)
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const DOUBLE_TAP_GUARD_MS = 600;

  // Store precision timer reference for precise pause timing and background re-anchoring
  const precisionTimerRef = useRef<{
    getCurrentTime: () => number;
    reanchor: (newElapsedSeconds: number) => void;
  } | null>(null);

  // Captures the running clock at the moment the app is backgrounded, so the
  // timer can be re-anchored to wall-clock time on return WITHOUT pausing.
  // null whenever the timer was not running when hidden (e.g. user paused).
  const hiddenWhileRunningRef = useRef<{ elapsedAtHide: number; hiddenAt: number } | null>(null);

  // Destructure only the fields used by startPause to avoid recreation on every tick
  const { gameStatus, isTimerRunning, currentPeriod, periodDurationMinutes, subIntervalMinutes } = state;

  const stateRef = useRef(state);

  // Keep a stable ref to the latest state for callbacks that must not
  // re-create on every tick (mutating refs during render is unsafe)
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const startPause = useCallback(() => {
    // Write the recovery anchor the moment the clock starts (review 4.22), not on the
    // first tick a second later: a lock, kill or reload inside that second otherwise
    // left nothing to recover a running clock from.
    const anchorStart = (elapsed: number) => {
      if (currentGameId) writeTimerAnchor(currentGameId, elapsed);
    };
    if (gameStatus === 'notStarted') {
      // Read elapsed via ref: it changes on every tick and must not recreate
      // this callback (see destructure note above).
      // INVARIANT: 'notStarted' with elapsed > 0 only exists as the product of
      // LOAD_PERSISTED_GAME_DATA's coercion of an in-progress game; every
      // reset path zeroes the clock. If a new state source ever violates
      // this, the resume discriminator below must be revisited.
      if (stateRef.current.timeElapsedInSeconds > 0) {
        // A loaded in-progress game: LOAD_PERSISTED_GAME_DATA coerces
        // 'inProgress' to 'notStarted' but preserves the clock. Resume at the
        // saved time/period instead of START_PERIOD(1), which would reset the
        // match clock and wipe interval history.
        dispatch({ type: 'RESUME_GAME' });
        // stateRef still holds the PRE-dispatch state here: skip the write when the
        // clock was already running, the case in which the reducer ignores RESUME.
        if (!stateRef.current.isTimerRunning) anchorStart(stateRef.current.timeElapsedInSeconds);
      } else {
        dispatch({
          type: 'START_PERIOD',
          payload: {
            nextPeriod: 1,
            periodDurationMinutes,
            subIntervalMinutes,
          },
        });
        anchorStart(0);
      }
    } else if (gameStatus === 'periodEnd') {
      if (isLastPeriod(stateRef.current, currentPeriod)) return; // nothing left to start
      dispatch({
        type: 'START_PERIOD',
        payload: {
          nextPeriod: currentPeriod + 1,
          periodDurationMinutes,
          subIntervalMinutes,
        },
      });
      anchorStart(periodEndSeconds(stateRef.current, currentPeriod));
    } else if (gameStatus === 'gameEnd') {
      // Full time came early and the coach has since corrected the period length
      // or count (review 1.11): continue from where the clock stopped.
      const next = clockContinuation(stateRef.current);
      if (next?.kind === 'resume') {
        dispatch({ type: 'CONTINUE_CLOCK', payload: { period: next.period } });
        if (!stateRef.current.isTimerRunning) anchorStart(stateRef.current.timeElapsedInSeconds);
      } else if (next?.kind === 'nextPeriod') {
        dispatch({
          type: 'START_PERIOD',
          payload: { nextPeriod: next.period, periodDurationMinutes, subIntervalMinutes },
        });
        anchorStart(periodStartSeconds(stateRef.current, next.period));
      }
    } else if (gameStatus === 'inProgress') {
      // Use proper START_TIMER/PAUSE_TIMER actions instead of SET_TIMER_RUNNING
      // to ensure startTimestamp is correctly managed
      if (isTimerRunning) {
        // A double-tap on Start / Start Period 2 (review 4.33): the same button turns
        // into Pause under the finger, so the second tap paused the clock it had just
        // started. A pause within this window of starting is that second tap.
        const startedAt = stateRef.current.startTimestamp;
        const sinceStart = startedAt === null ? Infinity : Date.now() - startedAt;
        // >= 0: a wall clock stepped backwards must not swallow every pause.
        if (sinceStart >= 0 && sinceStart < DOUBLE_TAP_GUARD_MS) return;
        // Get precise current time from precision timer to prevent race conditions
        const preciseTime = precisionTimerRef.current?.getCurrentTime();
        dispatch({ type: 'PAUSE_TIMER', payload: preciseTime });
        // Explicit pause: drop the wall-clock anchor so a later reload doesn't
        // auto-resume a clock the user intentionally stopped.
        if (currentGameId) clearTimerAnchor(currentGameId);
      } else {
        dispatch({ type: 'START_TIMER' });
        anchorStart(stateRef.current.timeElapsedInSeconds);
      }
    }
  }, [dispatch, gameStatus, isTimerRunning, currentPeriod, periodDurationMinutes, subIntervalMinutes, currentGameId]);

  const reset = useCallback(async () => {
    // Reset NOW, in the tap (review 4.33): awaiting IndexedDB first kept the clock
    // running until it answered (mobile IndexedDB stalls), and a tick in that gap
    // could rewrite the anchor after it was cleared.
    if (currentGameId) clearTimerAnchor(currentGameId);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dispatch({ type: 'RESET_TIMER_ONLY' });
    await clearTimerState();
  }, [dispatch, currentGameId]);

  /**
   * End the current period now (review 4.31, owner decision 2026-11-16): the referee
   * blew early, or the clock was set up longer than the match. The clock moves to the
   * period's end - the football convention the next period starts from anyway (Start
   * Period 2 starts at (n-1) x length) - so a break always sits at its boundary: an
   * ended match never offers "Resume", and a later length edit never reopens the half.
   * On the last period this is full time. The timer view asks for confirmation.
   */
  const endPeriodNow = useCallback(() => {
    const s = stateRef.current;
    if (s.gameStatus !== 'inProgress') return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void clearTimerState();
    if (currentGameId) clearTimerAnchor(currentGameId);
    dispatch({
      type: 'END_PERIOD_OR_GAME',
      payload: {
        newStatus: isLastPeriod(s, s.currentPeriod) ? 'gameEnd' : 'periodEnd',
        finalTime: periodEndSeconds(s, s.currentPeriod),
        manual: true, // a later length edit must not reopen it as a false half-time
      },
    });
  }, [dispatch, currentGameId]);

  const ackSubstitution = useCallback(() => {
    dispatch({ type: 'CONFIRM_SUBSTITUTION' });
  }, [dispatch]);

  const setSubInterval = useCallback(
    (minutes: number) => {
      dispatch({ type: 'SET_SUB_INTERVAL', payload: Math.max(1, minutes) });
    },
    [dispatch]
  );

  // Precision timer callback
  const handleTimerTick = useCallback((elapsedSeconds: number) => {
    const s = stateRef.current;
    const periodEnd = periodEndSeconds(s, s.currentPeriod);

    // Refresh the durable wall-clock anchor synchronously every tick. Cheap (one
    // localStorage write) and means a freeze/kill at any moment leaves a fresh anchor
    // for boot to recover from. The hide handler also writes it. Skipped while hidden:
    // the hide handler wrote the authoritative one.
    // (A debounced IndexedDB timer-state save used to sit here. Re-armed by every
    // 1 s tick, its 2 s debounce only ever fired after the clock stopped, writing a
    // record without wasRunning that boot ignores - dead weight, removed in 4.33. The
    // IndexedDB record is written on hide only, as a fallback behind the anchor.)
    if (currentGameId && !document.hidden && elapsedSeconds < periodEnd) {
      writeTimerAnchor(currentGameId, elapsedSeconds);
    }

    // Check if period/game should end
    if (elapsedSeconds >= periodEnd) {
      // Clear timer state immediately when game/period ends
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      // Clear timer state asynchronously
      clearTimerState();
      // Period/game ended — drop the anchor so boot won't resume past the end.
      if (currentGameId) clearTimerAnchor(currentGameId);
      // >= : a corrected structure must never leave a period past the last one.
      if (isLastPeriod(s, s.currentPeriod)) {
        dispatch({ type: 'END_PERIOD_OR_GAME', payload: { newStatus: 'gameEnd', finalTime: periodEnd } });
      } else {
        dispatch({ type: 'END_PERIOD_OR_GAME', payload: { newStatus: 'periodEnd', finalTime: periodEnd } });
      }
    } else {
      dispatch({ type: 'SET_TIMER_ELAPSED', payload: elapsedSeconds });
    }
  }, [currentGameId, dispatch]);

  // Use state for values needed during render (React 19 compliant)
  const [stableStartTime, setStableStartTime] = useState(state.timeElapsedInSeconds);

  // Update startTime when timer is not running (paused/stopped) to ensure proper synchronization
  React.useLayoutEffect(() => {
    if (!state.isTimerRunning && stableStartTime !== state.timeElapsedInSeconds) {
      setStableStartTime(state.timeElapsedInSeconds);
    }
  }, [state.isTimerRunning, state.timeElapsedInSeconds, stableStartTime]);

  const precisionTimer = usePrecisionTimer({
    onTick: handleTimerTick,
    isRunning: state.isTimerRunning && state.gameStatus === 'inProgress',
    startTime: stableStartTime,
    interval: 50 // Check every 50ms (20fps) for smoother UI updates while maintaining precision
  });

  // Store precision timer reference in effect (React 19 compliant)
  useEffect(() => {
    precisionTimerRef.current = precisionTimer;
  }, [precisionTimer]);

  // Kirjuri PR 0: the screen stays on whenever the coach may dictate, not only
  // while the clock runs - at half-time (periodEnd), during an in-play pause,
  // and while a recording session is armed. notStarted/gameEnd release it.
  // Accepted trade-off: a game left inProgress keeps the screen on until the
  // coach ends it or locks the phone (the lock never blocks the power button).
  const recordingSessionActive = useRecordingSessionActive();
  const holdScreen =
    state.isTimerRunning ||
    state.gameStatus === 'inProgress' ||
    state.gameStatus === 'periodEnd' ||
    recordingSessionActive;
  useEffect(() => {
    syncWakeLock(holdScreen);
  }, [holdScreen, syncWakeLock]);

  // Use ref for isTimerRunning check in visibility handler to avoid
  // re-registering the listener on every tick (was 20x/sec)
  const isTimerRunningRef = useRef(state.isTimerRunning);
  useEffect(() => { isTimerRunningRef.current = state.isTimerRunning; }, [state.isTimerRunning]);

  // Publish whether a match clock is actively running so useAppResume can skip
  // its >5min force-reload during a live match (the reanchor below keeps the
  // clock going; reloading would drop the user to the start screen, paused).
  useEffect(() => {
    setMatchTimerRunning(state.isTimerRunning && state.gameStatus === 'inProgress');
    return () => setMatchTimerRunning(false);
  }, [state.isTimerRunning, state.gameStatus]);

  // ...and whether a live match is mounted at all (review 4.24): started and not
  // finished - running, paused (incl. the load-coerced notStarted with time on the
  // clock) or at a period break. Blocks the long-background reload too.
  const matchIsLive = state.gameStatus === 'inProgress'
    || state.gameStatus === 'periodEnd'
    || (state.gameStatus === 'notStarted' && state.timeElapsedInSeconds > 0);
  useEffect(() => {
    setMatchLive(matchIsLive);
    return () => setMatchLive(false);
  }, [matchIsLive]);

  useEffect(() => {
    const handleDocumentVisibilityChange = () => {
      if (document.hidden) {
        // App going to background. The timer is NOT paused — a match clock keeps
        // running while the phone is locked or the app is backgrounded. We only
        // capture the running clock so we can re-anchor to wall-clock time on
        // return (robust against deep-sleep, where performance.now() may freeze),
        // and persist a marker for the reload-recovery path (>5min → useAppResume
        // force-reload → consumed at boot). Pausing only ever happens on the
        // explicit Start/Pause control.
        if (isTimerRunningRef.current) {
          const elapsedAtHide = precisionTimerRef.current?.getCurrentTime() ?? stateRef.current.timeElapsedInSeconds;
          hiddenWhileRunningRef.current = { elapsedAtHide, hiddenAt: Date.now() };

          // Cancel any pending debounced tick-save so it can't overwrite the
          // wasRunning marker below with a record that lacks the flag.
          if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
          }
          const hideTimestamp = Date.now();
          // Durable, SYNCHRONOUS anchor — completes before the OS can freeze the
          // WebView. This is the primary recovery record (the async IndexedDB
          // write below does not reliably flush on Android lock).
          writeTimerAnchor(currentGameId || '', elapsedAtHide);
          void saveTimerState({
            gameId: currentGameId || '',
            timeElapsedInSeconds: elapsedAtHide,
            timestamp: hideTimestamp,
            wasRunning: true,
          });
        }
      } else {
        // Returning to foreground. If the timer was running when hidden and the
        // game is still in progress, re-anchor to wall-clock truth and keep
        // running — no pause, no resume dance, no IndexedDB read dependency.
        const hidden = hiddenWhileRunningRef.current;
        hiddenWhileRunningRef.current = null;

        // Only act when the timer was running when hidden. If the user had
        // explicitly paused before backgrounding, we wrote no marker and must
        // NOT touch persisted timer state — clearing it would wipe state the
        // reload-recovery path may still need.
        if (hidden) {
          if (stateRef.current.gameStatus === 'inProgress') {
            // Not floored (review 4.25): flooring dropped ~0.5 s on every lock/unlock
            // (reanchor floors only what it reports to onTick). Never earlier than at
            // hide, so a wall clock stepped backwards cannot rewind the match.
            const trueElapsed = Math.max(
              hidden.elapsedAtHide,
              hidden.elapsedAtHide + (Date.now() - hidden.hiddenAt) / 1000
            );
            // flushSync so the display anchor is updated before the re-anchor's
            // onTick lands, preventing a one-frame flash of the pre-background time.
            flushSync(() => {
              setStableStartTime(trueElapsed);
            });
            // reanchor fires onTick(trueElapsed) → handleTimerTick, which advances
            // the reducer clock (SET_TIMER_ELAPSED) or ends the period/game if the
            // clock passed the period boundary while backgrounded.
            precisionTimerRef.current?.reanchor(trueElapsed);
          }

          // We wrote a wasRunning marker on hide; consume it now that the
          // in-session return is handled so it can't be replayed at reload.
          void clearTimerState();
        }
      }
    };

    document.addEventListener('visibilitychange', handleDocumentVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleDocumentVisibilityChange);
      // Clean up debounce timer on unmount
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  // Note: precisionTimerRef is used via ref (not as dependency) to avoid re-registering
  // the visibility listener on every tick (precisionTimer changes frequently)
  }, [currentGameId, dispatch, setStableStartTime]);

  return useMemo(() => ({
    timeElapsedInSeconds: state.timeElapsedInSeconds,
    isTimerRunning: state.isTimerRunning,
    nextSubDueTimeSeconds: state.nextSubDueTimeSeconds,
    subAlertLevel: state.subAlertLevel,
    lastSubConfirmationTimeSeconds: state.lastSubConfirmationTimeSeconds,
    startPause,
    reset,
    endPeriodNow,
    ackSubstitution,
    setSubInterval,
  }), [
    state.timeElapsedInSeconds, state.isTimerRunning,
    state.nextSubDueTimeSeconds, state.subAlertLevel,
    state.lastSubConfirmationTimeSeconds,
    startPause, reset, endPeriodNow, ackSubstitution, setSubInterval,
  ]);
};
