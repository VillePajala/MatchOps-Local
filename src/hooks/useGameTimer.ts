import { useEffect, useCallback, useRef } from 'react';
import { TIMER_STATE_KEY } from '@/config/storageKeys';
import {
  removeLocalStorageItem,
  setLocalStorageItem,
  getLocalStorageItem,
} from '@/utils/localStorage';
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
      dispatch({ type: 'SET_TIMER_RUNNING', payload: !state.isTimerRunning });
    }
  }, [dispatch, state]);

  const reset = useCallback(() => {
    removeLocalStorageItem(TIMER_STATE_KEY);
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
  stateRef.current = state;

  const { handleVisibilityChange } = useTimerRestore();

  // Precision timer callback
  const handleTimerTick = useCallback((elapsedSeconds: number) => {
    const s = stateRef.current;
    const periodEnd = s.currentPeriod * s.periodDurationMinutes * 60;

    // Save timer state periodically
    if (currentGameId) {
      const timerState = {
        gameId: currentGameId,
        timeElapsedInSeconds: elapsedSeconds,
        timestamp: Date.now(),
      };
      setLocalStorageItem(TIMER_STATE_KEY, JSON.stringify(timerState));
    }

    // Check if period/game should end
    if (elapsedSeconds >= periodEnd) {
      removeLocalStorageItem(TIMER_STATE_KEY);
      if (s.currentPeriod === s.numberOfPeriods) {
        dispatch({ type: 'END_PERIOD_OR_GAME', payload: { newStatus: 'gameEnd', finalTime: periodEnd } });
      } else {
        dispatch({ type: 'END_PERIOD_OR_GAME', payload: { newStatus: 'periodEnd', finalTime: periodEnd } });
      }
    } else {
      dispatch({ type: 'SET_TIMER_ELAPSED', payload: elapsedSeconds });
    }
  }, [currentGameId, dispatch]);

  // Initialize precision timer with stable startTime reference
  const stableStartTimeRef = useRef(state.timeElapsedInSeconds);
  
  // Update startTime when timer is not running (paused/stopped) to ensure proper synchronization
  useEffect(() => {
    if (!state.isTimerRunning && stableStartTimeRef.current !== state.timeElapsedInSeconds) {
      stableStartTimeRef.current = state.timeElapsedInSeconds;
    }
  }, [state.isTimerRunning, state.timeElapsedInSeconds]);

  const precisionTimer = usePrecisionTimer({
    onTick: handleTimerTick,
    isRunning: state.isTimerRunning && state.gameStatus === 'inProgress',
    startTime: stableStartTimeRef.current,
    interval: 50 // Check every 50ms (20fps) for smoother UI updates while maintaining precision
  });

  useEffect(() => {
    syncWakeLock(state.isTimerRunning);
  }, [state.isTimerRunning, syncWakeLock]);

  useEffect(() => {
    const handleDocumentVisibilityChange = async () => {
      if (document.hidden) {
        // Save timer state when tab becomes hidden
        if (state.isTimerRunning) {
          const timerState = {
            gameId: currentGameId || '',
            timeElapsedInSeconds: precisionTimer.getCurrentTime(),
            timestamp: Date.now(),
          };
          setLocalStorageItem(TIMER_STATE_KEY, JSON.stringify(timerState));
          dispatch({ type: 'PAUSE_TIMER_FOR_HIDDEN' });
        }
      } else {
        // Restore timer state when tab becomes visible
        const savedTimerStateJSON = getLocalStorageItem(TIMER_STATE_KEY);
        if (savedTimerStateJSON && state.isTimerRunning) {
          const savedTimerState = JSON.parse(savedTimerStateJSON);
          if (savedTimerState && savedTimerState.gameId === currentGameId) {
            // Use the precision restore utility
            handleVisibilityChange(
              savedTimerState.timestamp,
              savedTimerState.timeElapsedInSeconds,
              (restoredTime) => {
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
      }
    };

    document.addEventListener('visibilitychange', handleDocumentVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleDocumentVisibilityChange);
    };
  }, [state.isTimerRunning, currentGameId, dispatch, precisionTimer, handleVisibilityChange]);

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
