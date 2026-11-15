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

  it('a system action (timer tick) saves nothing', () => {
    const { result, saveToHistory } = setup();
    act(() => { result.current[1]({ type: 'SET_TIMER_ELAPSED', payload: 5 }); });
    expect(saveToHistory).not.toHaveBeenCalled();
  });
});
