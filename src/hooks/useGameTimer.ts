import React, { useEffect, useCallback, useRef, useState } from 'react';
import { saveTimerState, loadTimerState, clearTimerState, TimerState } from '@/utils/timerStateManager';
import { useWakeLock } from './useWakeLock';
import { usePrecisionTimer, useTimerRestore } from './usePrecisionTimer';
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

  // Store precision timer reference for precise pause timing
  const precisionTimerRef = useRef<{ getCurrentTime: () => number } | null>(null);

  const startPause = useCallback(() => {
    if (state.gameStatus === 'notStarted') {
      dispatch({
        type: 'START_PERIOD',
        payload: {
          nextPeriod: 1,
          periodDurationMinutes: state.periodDurationMinutes,
          subIntervalMinutes: state.subIntervalMinutes,
        },
      });
    } else if (state.gameStatus === 'periodEnd') {
      dispatch({
        type: 'START_PERIOD',
        payload: {
          nextPeriod: state.currentPeriod + 1,
          periodDurationMinutes: state.periodDurationMinutes,
          subIntervalMinutes: state.subIntervalMinutes,
        },
      });
    } else if (state.gameStatus === 'inProgress') {
      // Use proper START_TIMER/PAUSE_TIMER actions instead of SET_TIMER_RUNNING
      // to ensure startTimestamp is correctly managed
      if (state.isTimerRunning) {
        // Get precise current time from precision timer to prevent race conditions
        const preciseTime = precisionTimerRef.current?.getCurrentTime();
        dispatch({ type: 'PAUSE_TIMER', payload: preciseTime });
      } else {
        dispatch({ type: 'START_TIMER' });
      }
    }
  }, [dispatch, state]);

  const reset = useCallback(async () => {
    // Clear timer state from IndexedDB
    await clearTimerState();
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

  const stateRef = useRef(state);

  // Update ref in effect to comply with React 19 hooks rules
  useEffect(() => {
    stateRef.current = state;
  });

  const { handleVisibilityChange } = useTimerRestore();

  // Precision timer callback
  const handleTimerTick = useCallback((elapsedSeconds: number) => {
    const s = stateRef.current;
    const periodEnd = s.currentPeriod * s.periodDurationMinutes * 60;

    // Save timer state with debouncing to reduce IndexedDB writes
    if (currentGameId) {
      const timerState: TimerState = {
        gameId: currentGameId,
        timeElapsedInSeconds: elapsedSeconds,
        timestamp: Date.now(),
      };

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

  useEffect(() => {
    const handleDocumentVisibilityChange = async () => {
      if (document.hidden) {
        // Save timer state when tab becomes hidden
        if (state.isTimerRunning) {
          const timerState: TimerState = {
            gameId: currentGameId || '',
            timeElapsedInSeconds: precisionTimer.getCurrentTime(),
            timestamp: Date.now(),
            wasRunning: true, // Track that timer should resume on return
          };
          // Save immediately when tab becomes hidden
          await saveTimerState(timerState);
          dispatch({ type: 'PAUSE_TIMER_FOR_HIDDEN' });
        }
      } else {
        // Restore timer state when tab becomes visible
        const savedTimerState = await loadTimerState();

        if (savedTimerState && savedTimerState.wasRunning && savedTimerState.gameId === currentGameId) {
          // Use the precision restore utility
          handleVisibilityChange(
            savedTimerState.timestamp,
            savedTimerState.timeElapsedInSeconds,
            (restoredTime) => {
              // Update stable start time BEFORE dispatching to prevent precision timer from using old value
              setStableStartTime(restoredTime);

              dispatch({
                type: 'RESTORE_TIMER_STATE',
                payload: {
                  savedTime: restoredTime,
                  timestamp: savedTimerState.timestamp,
                },
              });
            }
          );
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
  }, [state.isTimerRunning, currentGameId, dispatch, precisionTimer, handleVisibilityChange, setStableStartTime]);

  return {
    timeElapsedInSeconds: state.timeElapsedInSeconds,
    isTimerRunning: state.isTimerRunning,
    nextSubDueTimeSeconds: state.nextSubDueTimeSeconds,
    subAlertLevel: state.subAlertLevel,
    lastSubConfirmationTimeSeconds: state.lastSubConfirmationTimeSeconds,
    startPause,
    reset,
    ackSubstitution,
    setSubInterval,
  };
};
