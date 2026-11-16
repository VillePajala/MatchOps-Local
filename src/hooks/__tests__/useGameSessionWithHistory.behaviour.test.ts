import { renderHook, act } from '@testing-library/react';
import { useGameSessionWithHistory } from '../useGameSessionWithHistory';
import { initialGameSessionStatePlaceholder } from '../useGameSessionReducer';
import type { GameSessionState } from '../useGameSessionReducer';

/**
 * With the real reducer: a coach edit pushes exactly one history entry carrying the
 * new value (review 4.2 - these three pushed none, so the next Undo reverted them).
 * @critical
 */
describe('useGameSessionWithHistory with the real reducer', () => {
  const setup = () => {
    const saveToHistory = jest.fn();
    const buildHistorySlice = (s: GameSessionState) => ({
      shootoutKicks: s.shootoutKicks,
      playerPositions: s.playerPositions,
      gameNotes: s.gameNotes,
    });
    const hook = renderHook(() =>
      useGameSessionWithHistory(initialGameSessionStatePlaceholder, { buildHistorySlice, saveToHistory }),
    );
    return { ...hook, saveToHistory };
  };

  it('SET_SHOOTOUT_KICKS saves the new kicks to history', () => {
    const { result, saveToHistory } = setup();
    const kicks = [{ team: 'home', scored: true }] as unknown as GameSessionState['shootoutKicks'];
    act(() => { result.current[1]({ type: 'SET_SHOOTOUT_KICKS', payload: kicks ?? [] }); });
    expect(saveToHistory).toHaveBeenCalledTimes(1);
    expect(saveToHistory.mock.calls[0][0].shootoutKicks).toEqual(kicks);
  });

  it('SET_PLAYER_POSITIONS saves the new positions to history', () => {
    const { result, saveToHistory } = setup();
    act(() => { result.current[1]({ type: 'SET_PLAYER_POSITIONS', payload: { p1: ['gk'] } }); });
    expect(saveToHistory).toHaveBeenCalledTimes(1);
    expect(saveToHistory.mock.calls[0][0].playerPositions).toEqual({ p1: ['gk'] });
  });

  it('APPLY_REPORT_DRAFT saves the new report text to history', () => {
    const { result, saveToHistory } = setup();
    act(() => { result.current[1]({ type: 'APPLY_REPORT_DRAFT', payload: { gameNotes: 'Draft report' } }); });
    expect(saveToHistory).toHaveBeenCalledTimes(1);
    expect(saveToHistory.mock.calls[0][0].gameNotes).toBe('Draft report');
  });

  /**
   * Review 4.27: clock and period transitions are not undo steps (undo never moves
   * match time), so a "Goal logged - Undo" tapped just after the whistle undoes the
   * goal, not the whistle.
   * @critical
   */
  it('kick-off, pause, period end and continue save nothing to history', () => {
    const { result, saveToHistory } = setup();
    act(() => { result.current[1]({ type: 'START_PERIOD', payload: { nextPeriod: 1, periodDurationMinutes: 15, subIntervalMinutes: 5 } }); });
    act(() => { result.current[1]({ type: 'PAUSE_TIMER', payload: 30 }); });
    act(() => { result.current[1]({ type: 'END_PERIOD_OR_GAME', payload: { newStatus: 'periodEnd', finalTime: 900 } }); });
    act(() => { result.current[1]({ type: 'CONTINUE_CLOCK', payload: { period: 1 } }); });
    expect(saveToHistory).not.toHaveBeenCalled();
  });

  /**
   * Review 4.33: a coach action followed by a clock tick before the effect ran still
   * gets its history entry (the tick used to become the last action and skip it).
   * @critical
   */
  it('a coach action followed by a tick in the same batch is still saved', () => {
    const { result, saveToHistory } = setup();
    act(() => {
      result.current[1]({ type: 'APPLY_REPORT_DRAFT', payload: { gameNotes: 'Draft' } });
      result.current[1]({ type: 'SET_TIMER_ELAPSED', payload: 5 });
    });
    expect(saveToHistory).toHaveBeenCalledTimes(1);
    expect(saveToHistory.mock.calls[0][0].gameNotes).toBe('Draft');
  });

  it('a no-op coach action leaves no pending entry for the next tick', () => {
    const { result, saveToHistory } = setup();
    act(() => { result.current[1]({ type: 'SET_HOME_OR_AWAY', payload: result.current[0].homeOrAway }); }); // already chosen
    act(() => { result.current[1]({ type: 'SET_TIMER_ELAPSED', payload: 5 }); });
    expect(saveToHistory).not.toHaveBeenCalled();
  });

  it('a pending entry is dropped when the session is replaced by a load', () => {
    const { result, saveToHistory } = setup();
    act(() => {
      result.current[1]({ type: 'APPLY_REPORT_DRAFT', payload: { gameNotes: 'Draft' } });
      result.current[1]({ type: 'LOAD_GAME_SESSION_STATE', payload: { gameNotes: 'Loaded' } });
    });
    expect(saveToHistory).not.toHaveBeenCalled();
  });

  it('a system action (timer tick) saves nothing', () => {
    const { result, saveToHistory } = setup();
    act(() => { result.current[1]({ type: 'SET_TIMER_ELAPSED', payload: 5 }); });
    expect(saveToHistory).not.toHaveBeenCalled();
  });
});
