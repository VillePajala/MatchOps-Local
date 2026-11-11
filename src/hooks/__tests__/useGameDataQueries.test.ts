import { renderHook } from '@testing-library/react';
import { useGameDataQueries } from '../useGameDataQueries';
import { useQuery } from '@tanstack/react-query';

// Mock useDataStore hook to provide userId for user-scoped storage
const TEST_USER_ID = 'test-user-123';
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({
    userId: TEST_USER_ID,
    getStore: jest.fn(),
    isUserScoped: true,
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('@/utils/masterRosterManager', () => ({
  getMasterRoster: jest.fn(),
}));
jest.mock('@/utils/seasons', () => ({
  getSeasons: jest.fn(),
}));
jest.mock('@/utils/tournaments', () => ({
  getTournaments: jest.fn(),
}));
jest.mock('@/utils/savedGames', () => ({
  getSavedGames: jest.fn(),
}));
jest.mock('@/utils/appSettings', () => ({
  getCurrentGameIdSetting: jest.fn(),
}));

const mockUseQuery = useQuery as jest.Mock;

describe('useGameDataQueries', () => {
  afterEach(() => {
    mockUseQuery.mockReset();
  });

  test('returns aggregated data', () => {
    mockUseQuery
      .mockReturnValueOnce({ data: [{ id: 'p1' }], isLoading: false })
      .mockReturnValueOnce({ data: [{ id: 's1' }], isLoading: false })
      .mockReturnValueOnce({ data: [{ id: 't1' }], isLoading: false })
      .mockReturnValueOnce({ data: { game1: {} }, isLoading: false })
      .mockReturnValueOnce({ data: 'game1', isLoading: false });

    const { result } = renderHook(() => useGameDataQueries());

    expect(result.current.masterRoster).toEqual([{ id: 'p1' }]);
    expect(result.current.seasons).toEqual([{ id: 's1' }]);
    expect(result.current.tournaments).toEqual([{ id: 't1' }]);
    expect(result.current.savedGames).toEqual({ game1: {} });
    expect(result.current.currentGameId).toBe('game1');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  /**
   * Review 1.4: a roster query with no data (first load failed) must return the
   * SAME empty array every render - a fresh [] re-ran every effect depending on
   * it in an endless render loop. Its error is reported on its own, not as the
   * saved-games/boot error.
   * @critical
   */
  test('failed roster load: stable empty roster, separate roster error', () => {
    const rosterError = new Error('IndexedDB read failed');
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) =>
      queryKey[0] === 'masterRoster'
        ? { data: undefined, isLoading: false, error: rosterError }
        : { data: undefined, isLoading: false, error: null });

    const { result, rerender } = renderHook(() => useGameDataQueries());
    const first = result.current.masterRoster;
    rerender();

    expect(result.current.masterRoster).toEqual([]);
    expect(result.current.masterRoster).toBe(first);
    expect(result.current.masterRosterError).toBe(rosterError);
    expect(result.current.error).toBeNull();
  });

  test('loading true when any query is loading', () => {
    mockUseQuery
      .mockReturnValueOnce({ data: [], isLoading: true, failureCount: 0 })
      .mockReturnValue({ data: [], isLoading: false });

    const { result } = renderHook(() => useGameDataQueries());

    expect(result.current.loading).toBe(true);
  });

  /**
   * Review 1.4 (Codex): the roster's retries after a failed first read run in
   * the background - they must not hold the match boot for ~7s when everything
   * else is ready. Only its first attempt gates boot.
   * @critical
   */
  test('roster retries do not gate boot; its first attempt does', () => {
    const roster = (failureCount: number) => ({ queryKey }: { queryKey: unknown[] }) =>
      queryKey[0] === 'masterRoster'
        ? { data: undefined, isLoading: true, failureCount, error: null }
        : { data: undefined, isLoading: false, error: null };

    mockUseQuery.mockImplementation(roster(0));
    const { result, rerender } = renderHook(() => useGameDataQueries());
    expect(result.current.loading).toBe(true);

    mockUseQuery.mockImplementation(roster(1));
    rerender();
    expect(result.current.loading).toBe(false);
    expect(result.current.masterRoster).toEqual([]);
  });
});
