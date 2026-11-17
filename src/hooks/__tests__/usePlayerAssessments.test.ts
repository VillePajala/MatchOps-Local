import { renderHook, act } from '@testing-library/react';
import usePlayerAssessments, { validateAssessment } from '../usePlayerAssessments';
import { getPlayerAssessments, savePlayerAssessment, deletePlayerAssessment } from '@/utils/playerAssessments';
import type { AppState } from '@/types';
import { allowConsoleMessagesInThisFile } from '../../../tests/utils/allowConsole';

// This file drives these error paths on purpose (review 9.5: allowed here only).
allowConsoleMessagesInThisFile(['Failed to load']);

jest.mock('@/utils/playerAssessments');

const mockedGet = getPlayerAssessments as jest.MockedFunction<typeof getPlayerAssessments>;
const mockedSave = savePlayerAssessment as jest.MockedFunction<typeof savePlayerAssessment>;
const mockedDelete = deletePlayerAssessment as jest.MockedFunction<typeof deletePlayerAssessment>;

const assessment = {
  overall: 5,
  sliders: { intensity: 5, courage: 5, duels: 5, technique: 5, creativity: 5, decisions: 5, awareness: 5, teamwork: 5, fair_play: 5, impact: 5 },
  notes: '',
  minutesPlayed: 0,
  createdAt: 1,
  createdBy: 'me'
};

describe('usePlayerAssessments', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSave.mockReset();
    mockedDelete.mockReset();
  });

  it('loads assessments', async () => {
    mockedGet.mockResolvedValue({ p1: assessment });
    const { result } = renderHook(() => usePlayerAssessments('g1'));
    await act(async () => {});
    expect(result.current.assessments.p1).toEqual(assessment);
  });

  it('saves assessment', async () => {
    mockedGet.mockResolvedValue({});
    mockedSave.mockResolvedValue({ assessments: { p1: assessment } } as unknown as AppState);
    const { result } = renderHook(() => usePlayerAssessments('g1'));
    await act(async () => {
      await result.current.saveAssessment('p1', assessment);
    });
    expect(mockedSave).toHaveBeenCalled();
    expect(result.current.assessments.p1).toEqual(assessment);
  });

  /**
   * Review 4.34: minutesPlayed is the match time when saved (the clock), not the sum
   * of sub intervals - a game with no confirmed subs used to record 0 minutes.
   * @critical
   */
  it('records the match clock as minutes played', async () => {
    mockedGet.mockResolvedValue({});
    mockedSave.mockResolvedValue({ assessments: { p1: assessment } } as unknown as AppState);
    const { result } = renderHook(() => usePlayerAssessments('g1', 2400));
    await act(async () => {
      await result.current.saveAssessment('p1', assessment);
    });
    expect(mockedSave).toHaveBeenCalledWith('g1', 'p1', expect.objectContaining({ minutesPlayed: 40 }));
  });

  it('deletes assessment', async () => {
    mockedGet.mockResolvedValue({ p1: assessment });
    mockedDelete.mockResolvedValue({ assessments: {} } as unknown as AppState);
    const { result } = renderHook(() => usePlayerAssessments('g1'));
    await act(async () => {
      await result.current.deleteAssessment('p1');
    });
    expect(mockedDelete).toHaveBeenCalled();
    expect(result.current.assessments.p1).toBeUndefined();
  });

  /**
   * Review 3.23: `loaded` tells autosave whether `assessments` is the stored set.
   * @critical
   */
  describe('loaded', () => {
    it('is false while loading, true once the stored set has loaded', async () => {
      let resolve: (v: Record<string, typeof assessment>) => void = () => {};
      mockedGet.mockReturnValue(new Promise((r) => { resolve = r; }));
      const { result } = renderHook(() => usePlayerAssessments('g1'));
      expect(result.current.loaded).toBe(false);
      await act(async () => { resolve({ p1: assessment }); });
      expect(result.current.loaded).toBe(true);
    });

    it('stays false when the load fails', async () => {
      mockedGet.mockRejectedValue(new Error('IndexedDB read failed'));
      const { result } = renderHook(() => usePlayerAssessments('g1'));
      await act(async () => {});
      expect(result.current.loaded).toBe(false);
      expect(result.current.error).toBe('load');
    });

    it('becomes true after a successful save (the save returns the full stored set)', async () => {
      mockedGet.mockRejectedValue(new Error('IndexedDB read failed'));
      mockedSave.mockResolvedValue({ assessments: { p1: assessment, p2: assessment } } as unknown as AppState);
      const { result } = renderHook(() => usePlayerAssessments('g1'));
      await act(async () => {});
      await act(async () => { await result.current.saveAssessment('p1', assessment); });
      expect(result.current.loaded).toBe(true);
      expect(Object.keys(result.current.assessments)).toEqual(['p1', 'p2']);
    });

    it('ignores a load for the previous game that finishes after a switch', async () => {
      let resolveG1: (v: Record<string, typeof assessment>) => void = () => {};
      mockedGet.mockReturnValueOnce(new Promise((r) => { resolveG1 = r; })).mockReturnValueOnce(new Promise(() => {}));
      const { result, rerender } = renderHook(({ id }) => usePlayerAssessments(id), { initialProps: { id: 'g1' } });
      rerender({ id: 'g2' });
      await act(async () => { resolveG1({ p1: assessment }); });
      expect(result.current.loaded).toBe(false);
      expect(result.current.assessments).toEqual({});
    });

    it('resets when the game changes, including back to a game loaded before', async () => {
      const pending = () => new Promise<never>(() => {});
      mockedGet.mockResolvedValueOnce({ p1: assessment }).mockReturnValueOnce(pending()).mockReturnValueOnce(pending());
      const { result, rerender } = renderHook(({ id }) => usePlayerAssessments(id), { initialProps: { id: 'g1' } });
      await act(async () => {});
      expect(result.current.loaded).toBe(true);
      rerender({ id: 'g2' });
      expect(result.current.loaded).toBe(false);
      // Back to g1 while its ratings reload: the hook still holds g2's set.
      rerender({ id: 'g1' });
      expect(result.current.loaded).toBe(false);
    });
  });
});

describe('validateAssessment', () => {
  it('validates ranges', () => {
    expect(validateAssessment(assessment)).toBe(true);
    expect(validateAssessment({ ...assessment, overall: 11 })).toBe(false);
    expect(validateAssessment({ ...assessment, sliders: { ...assessment.sliders, intensity: 0 } })).toBe(false);
    expect(validateAssessment({ ...assessment, sliders: { ...assessment.sliders, intensity: 11 } })).toBe(false);
  });
});
