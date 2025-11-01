import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useGameTimer } from '../useGameTimer';
import { GameSessionState, gameSessionReducer } from '../useGameSessionReducer';

test('startPause toggles running state', () => {
  const initialState: GameSessionState = {
    teamName: '', opponentName: '', gameDate: '', homeScore: 0, awayScore: 0,
    gameNotes: '', homeOrAway: 'home', numberOfPeriods: 2, periodDurationMinutes: 1,
    currentPeriod: 1, gameStatus: 'notStarted', selectedPlayerIds: [], gamePersonnel: [], seasonId: '',
    tournamentId: '', gameLocation: '', gameTime: '', demandFactor: 1, gameEvents: [],
    timeElapsedInSeconds: 0, startTimestamp: null, isTimerRunning: false,
    subIntervalMinutes: 1, nextSubDueTimeSeconds: 60, subAlertLevel: 'none',
    lastSubConfirmationTimeSeconds: 0, completedIntervalDurations: [], showPlayerNames: true
  };

  const { result } = renderHook(() => {
    const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
    return useGameTimer({ state, dispatch, currentGameId: 'game1' });
  });

  expect(result.current.isTimerRunning).toBe(false);
  act(() => {
    result.current.startPause();
  });
  expect(result.current.isTimerRunning).toBe(true);
});

test('timer state changes correctly when started', () => {
  const initialState: GameSessionState = {
    teamName: '', opponentName: '', gameDate: '', homeScore: 0, awayScore: 0,
    gameNotes: '', homeOrAway: 'home', numberOfPeriods: 2, periodDurationMinutes: 1,
    currentPeriod: 1, gameStatus: 'notStarted', selectedPlayerIds: [], gamePersonnel: [], seasonId: '',
    tournamentId: '', gameLocation: '', gameTime: '', demandFactor: 1, gameEvents: [],
    timeElapsedInSeconds: 0, startTimestamp: null, isTimerRunning: false,
    subIntervalMinutes: 1, nextSubDueTimeSeconds: 60, subAlertLevel: 'none',
    lastSubConfirmationTimeSeconds: 0, completedIntervalDurations: [], showPlayerNames: true
  };

  const { result } = renderHook(() => {
    const [state, dispatch] = React.useReducer(gameSessionReducer, initialState);
    return useGameTimer({ state, dispatch, currentGameId: 'game1' });
  });

  // Initially not running
  expect(result.current.isTimerRunning).toBe(false);
  expect(result.current.timeElapsedInSeconds).toBe(0);

  // Start timer
  act(() => {
    result.current.startPause();
  });

  // Should now be running and have timer functions available
  expect(result.current.isTimerRunning).toBe(true);
  expect(typeof result.current.timeElapsedInSeconds).toBe('number');
  expect(typeof result.current.startPause).toBe('function');
});
