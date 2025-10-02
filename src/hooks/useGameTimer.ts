import { useEffect, useCallback, useRef } from 'react';
import { TIMER_STATE_KEY } from '@/config/storageKeys';
import { setStorageJSON, getStorageJSON, removeStorageItem } from '@/utils/storage';
import { useWakeLock } from './useWakeLock';
import { usePrecisionTimer, useTimerRestore } from './usePrecisionTimer';
import { GameSessionState, GameSessionAction } from './useGameSessionReducer';
import logger from '@/utils/logger';

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

  const reset = useCallback(async () => {
    // Clear timer state from IndexedDB
    try {
      await removeStorageItem(TIMER_STATE_KEY);
    } catch (error) {
      // Silent fail - timer state clear is not critical
      logger.debug('Failed to clear timer state (non-critical)', { error });
    }
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
  stateRef.current = state;

  const { handleVisibilityChange } = useTimerRestore();

  // Precision timer callback
  const handleTimerTick = useCallback((elapsedSeconds: number) => {
    const s = stateRef.current;
    const periodEnd = s.currentPeriod * s.periodDurationMinutes * 60;

    // Save timer state with debouncing to reduce IndexedDB writes
    if (currentGameId) {
      const timerState = {
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
        try {
          await setStorageJSON(TIMER_STATE_KEY, timerState);
        } catch (error) {
          // Silent fail - timer state save is not critical
          logger.debug('Failed to save timer state (non-critical)', { error });
        }
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
      removeStorageItem(TIMER_STATE_KEY).catch(() => {
        // Silent fail - timer state clear is not critical
      });
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
          // Save immediately when tab becomes hidden
          try {
            await setStorageJSON(TIMER_STATE_KEY, timerState);
          } catch (error) {
            // Silent fail - timer state save is not critical
            logger.debug('Failed to save timer state on tab hidden (non-critical)', { error });
          }
          dispatch({ type: 'PAUSE_TIMER_FOR_HIDDEN' });
        }
      } else {
        // Restore timer state when tab becomes visible
        try {
          const savedTimerState = await getStorageJSON<{
            gameId: string;
            timeElapsedInSeconds: number;
            timestamp: number;
          }>(TIMER_STATE_KEY);

          if (savedTimerState && state.isTimerRunning && savedTimerState.gameId === currentGameId) {
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
        } catch (error) {
          // Silent fail - timer state restore is not critical
          logger.debug('Failed to restore timer state on tab visible (non-critical)', { error });
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
