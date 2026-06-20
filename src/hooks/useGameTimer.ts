import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { saveTimerState, clearTimerState, TimerState } from '@/utils/timerStateManager';
import { setMatchTimerRunning } from '@/utils/matchTimerSignal';
import { reportTimerDiag } from '@/utils/timerDiagnostics';
import { writeTimerAnchor, clearTimerAnchor } from '@/utils/timerAnchor';
import { useWakeLock } from './useWakeLock';
import { usePrecisionTimer } from './usePrecisionTimer';
import { GameSessionState, GameSessionAction } from './useGameSessionReducer';

interface UseGameTimerArgs {
  state: GameSessionState;
  dispatch: React.Dispatch<GameSessionAction>;
  currentGameId: string;
}

export const useGameTimer = ({ state, dispatch, currentGameId }: UseGameTimerArgs) => {
  const { syncWakeLock } = useWakeLock();

  // Debounce timer for IndexedDB writes (reduce write frequency)
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const SAVE_DEBOUNCE_MS = 2000; // 2 second debounce

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
      } else {
        dispatch({
          type: 'START_PERIOD',
          payload: {
            nextPeriod: 1,
            periodDurationMinutes,
            subIntervalMinutes,
          },
        });
      }
    } else if (gameStatus === 'periodEnd') {
      dispatch({
        type: 'START_PERIOD',
        payload: {
          nextPeriod: currentPeriod + 1,
          periodDurationMinutes,
          subIntervalMinutes,
        },
      });
    } else if (gameStatus === 'inProgress') {
      // Use proper START_TIMER/PAUSE_TIMER actions instead of SET_TIMER_RUNNING
      // to ensure startTimestamp is correctly managed
      if (isTimerRunning) {
        // Get precise current time from precision timer to prevent race conditions
        const preciseTime = precisionTimerRef.current?.getCurrentTime();
        dispatch({ type: 'PAUSE_TIMER', payload: preciseTime });
        // Explicit pause: drop the wall-clock anchor so a later reload doesn't
        // auto-resume a clock the user intentionally stopped.
        clearTimerAnchor();
      } else {
        dispatch({ type: 'START_TIMER' });
      }
    }
  }, [dispatch, gameStatus, isTimerRunning, currentPeriod, periodDurationMinutes, subIntervalMinutes]);

  const reset = useCallback(async () => {
    // Clear timer state from IndexedDB
    await clearTimerState();
    clearTimerAnchor();
    // Clear any pending debounced save
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dispatch({ type: 'RESET_TIMER_ONLY' });
  }, [dispatch]);

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
    const periodEnd = s.currentPeriod * s.periodDurationMinutes * 60;

    // Save timer state with debouncing to reduce IndexedDB writes.
    // Skip while hidden: the hide handler writes an authoritative wasRunning
    // marker, and a throttled background tick must not overwrite it with a
    // record that lacks wasRunning (which would break reload-time recovery).
    if (currentGameId && !document.hidden) {
      const timerState: TimerState = {
        gameId: currentGameId,
        timeElapsedInSeconds: elapsedSeconds,
        timestamp: Date.now(),
      };

      // Refresh the durable wall-clock anchor synchronously every tick. Cheap
      // (one localStorage write) and means a freeze/kill at any moment leaves a
      // fresh anchor for boot to recover from. The hide handler also writes it.
      if (elapsedSeconds < periodEnd) {
        writeTimerAnchor(currentGameId, elapsedSeconds);
      }

      // Clear existing debounce timer
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      // Set up debounced save
      saveTimerRef.current = setTimeout(async () => {
        await saveTimerState(timerState);
      }, SAVE_DEBOUNCE_MS);
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
      clearTimerAnchor();
      if (s.currentPeriod === s.numberOfPeriods) {
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

  useEffect(() => {
    syncWakeLock(state.isTimerRunning);
  }, [state.isTimerRunning, syncWakeLock]);

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
          // TEMP diagnostic: record what we captured at lock time.
          reportTimerDiag('hide', {
            gameId: currentGameId || '',
            elapsedAtHide,
            hiddenAt: hideTimestamp,
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
          const gapSec = (Date.now() - hidden.hiddenAt) / 1000;
          const trueElapsed = Math.floor(hidden.elapsedAtHide + gapSec);
          if (stateRef.current.gameStatus === 'inProgress') {
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

          // TEMP diagnostic: in-session foreground (no reload). Tells us whether the
          // reanchor path ran and how much wall-clock the WebView actually saw.
          reportTimerDiag('resume', {
            gameId: currentGameId || '',
            elapsedAtHide: hidden.elapsedAtHide,
            gapSec: Math.round(gapSec),
            trueElapsed,
            gameStatus: stateRef.current.gameStatus,
            reanchored: stateRef.current.gameStatus === 'inProgress',
          });

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
    ackSubstitution,
    setSubInterval,
  }), [
    state.timeElapsedInSeconds, state.isTimerRunning,
    state.nextSubDueTimeSeconds, state.subAlertLevel,
    state.lastSubConfirmationTimeSeconds,
    startPause, reset, ackSubstitution, setSubInterval,
  ]);
};
