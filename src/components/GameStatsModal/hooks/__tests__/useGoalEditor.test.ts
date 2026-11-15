import { renderHook, act } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { useGoalEditor } from '../useGoalEditor';
import type { GameEvent } from '@/types';

/**
 * Review 4.15: a goal logged while paused has a fractional time; editing it must
 * prefill whole MM:SS and save without "Invalid time format".
 * @critical
 */
describe('useGoalEditor', () => {
  const setup = (goal: GameEvent) => {
    const showToast = jest.fn();
    const onUpdateGameEvent = jest.fn();
    const hook = renderHook(() => useGoalEditor({
      gameEvents: [goal],
      onUpdateGameEvent,
      setLocalGameEvents: jest.fn(),
      setIsEditingNotes: jest.fn(),
      t: ((_k: string, fallback?: string) => fallback ?? _k) as unknown as TFunction,
      showToast,
    }));
    return { ...hook, showToast, onUpdateGameEvent };
  };

  it('prefills a fractional time as whole MM:SS and saves it', () => {
    const goal = { id: 'g1', type: 'goal', time: 610.09, scorerId: 'p1' } as GameEvent;
    const { result, showToast, onUpdateGameEvent } = setup(goal);
    act(() => { result.current.handleStartEditGoal(goal); });
    expect(result.current.editGoalTime).toBe('10:10');
    act(() => { result.current.handleSaveEditGoal(); });
    expect(showToast).not.toHaveBeenCalledWith(expect.stringMatching(/Invalid time/), 'error');
    expect(onUpdateGameEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1', time: 610 }));
  });
});
