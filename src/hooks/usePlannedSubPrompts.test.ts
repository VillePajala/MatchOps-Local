import { renderHook, waitFor, act } from '@testing-library/react';
import { usePlannedSubPrompts } from './usePlannedSubPrompts';
import { getGameSubs, type PlannedGameSub } from '@/utils/playtimePlanner/gameSubs';
import type { Player } from '@/types';

jest.mock('@/utils/playtimePlanner/gameSubs', () => ({
  getGameSubs: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockGetGameSubs = getGameSubs as jest.MockedFunction<typeof getGameSubs>;

const players: Player[] = [
  { id: 'in1', name: 'Niko' },
  { id: 'out1', name: 'Sam' },
  { id: 'in2', name: 'Alex' },
  { id: 'aapo', name: 'Aapo' },
  { id: 'eino', name: 'Eino' },
];

const sub = (over: Partial<PlannedGameSub> = {}): PlannedGameSub => ({
  id: 's1',
  timeSeconds: 720,
  slotId: 'x',
  inPlayerId: 'in1',
  outPlayerId: 'out1',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetGameSubs.mockResolvedValue([]);
});

describe('usePlannedSubPrompts', () => {
  it('before the clock reaches a planned sub time, shows that group as not yet due', async () => {
    mockGetGameSubs.mockResolvedValue([sub()]);
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 0, players));
    // Give the load effect a tick to resolve, then assert nothing is due (720 > 0).
    await act(async () => {});
    expect(result.current).toEqual({
      current: { timeSeconds: 720, inNames: ['Niko'], outNames: ['Sam'], due: false },
      overdueEarlier: 0,
    });
  });

  /**
   * D3c: the next planned change is always visible - the upcoming group ahead
   * of the clock moves on as each group falls due, and is null after the last.
   * @critical
   */
  it('the shown group is quiet until due, then due until the next group falls due', async () => {
    mockGetGameSubs.mockResolvedValue([
      sub({ id: 'a', timeSeconds: 600, inPlayerId: 'in1' }),
      sub({ id: 'b', timeSeconds: 1200, inPlayerId: 'in2' }),
    ]);
    const { result, rerender } = renderHook(
      ({ t }) => usePlannedSubPrompts('g1', t, players),
      { initialProps: { t: 0 } },
    );
    await waitFor(() => expect(result.current.current?.timeSeconds).toBe(600));
    expect(result.current.current?.due).toBe(false);
    rerender({ t: 600 });
    expect(result.current.current).toMatchObject({ timeSeconds: 600, due: true });
    rerender({ t: 1199 });
    expect(result.current.current).toMatchObject({ timeSeconds: 600, due: true });
    rerender({ t: 1200 });
    expect(result.current.current).toMatchObject({ timeSeconds: 1200, due: true });
    expect(result.current.overdueEarlier).toBe(1);
  });

  it('surfaces the due group with resolved player names once the clock passes it', async () => {
    mockGetGameSubs.mockResolvedValue([sub()]);
    const { result, rerender } = renderHook(
      ({ t }) => usePlannedSubPrompts('g1', t, players),
      { initialProps: { t: 0 } },
    );
    await act(async () => {});
    rerender({ t: 720 });
    await waitFor(() => expect(result.current.current).not.toBeNull());
    expect(result.current.current).toEqual({ timeSeconds: 720, inNames: ['Niko'], outNames: ['Sam'], due: true });
  });

  it('re-reads the schedule when refreshKey changes (re-apply plan)', async () => {
    // First read: no subs. After a plan re-apply, the store has a due sub and the
    // caller bumps refreshKey to force a re-read for the same game.
    mockGetGameSubs.mockResolvedValueOnce([]).mockResolvedValueOnce([sub({ timeSeconds: 600 })]);
    const { result, rerender } = renderHook(
      ({ key }) => usePlannedSubPrompts('g1', 1000, players, key),
      { initialProps: { key: 0 } },
    );
    await act(async () => {});
    expect(result.current.current).toBeNull();

    rerender({ key: 1 });
    await waitFor(() => expect(result.current.current?.timeSeconds).toBe(600));
    expect(mockGetGameSubs).toHaveBeenCalledTimes(2);
  });

  /**
   * Review 1.6: coaches don't move discs during play, so a starter brought back
   * on is still "on the field" in the app. Both changes must show, in turn.
   * @critical
   */
  it('a sub that brings a starter back shows, with no disc moved', async () => {
    mockGetGameSubs.mockResolvedValue([
      sub({ id: 'a', timeSeconds: 600, inPlayerId: 'eino', outPlayerId: 'aapo' }),
      sub({ id: 'b', timeSeconds: 1200, inPlayerId: 'aapo', outPlayerId: 'eino' }),
    ]);
    const { result, rerender } = renderHook(
      ({ t }) => usePlannedSubPrompts('g1', t, players),
      { initialProps: { t: 600 } },
    );
    await waitFor(() => expect(result.current.current?.inNames).toEqual(['Eino']));
    rerender({ t: 1200 });
    await waitFor(() => expect(result.current.current?.inNames).toEqual(['Aapo']));
    expect(result.current.current?.outNames).toEqual(['Eino']);
  });

  /**
   * Six changes at half-time are one group, not six prompts in a row.
   * @critical
   */
  it('subs planned for the same moment form one group', async () => {
    const ids = ['in1', 'in2', 'aapo'];
    mockGetGameSubs.mockResolvedValue(
      ids.map((id, i) => sub({ id: `h${i}`, timeSeconds: 1500, inPlayerId: id, outPlayerId: i === 0 ? 'out1' : null })),
    );
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 1500, players));
    await waitFor(() => expect(result.current.current).not.toBeNull());
    expect(result.current.current).toEqual({ timeSeconds: 1500, inNames: ['Niko', 'Alex', 'Aapo'], outNames: ['Sam'], due: true });
    expect(result.current.overdueEarlier).toBe(0);
  });

  /**
   * Reopening the app at 31:00 with groups at 10, 20 and 30 shows the latest
   * group and how many earlier ones were also due.
   * @critical
   */
  it('after a resume, shows the latest due group and counts the earlier ones', async () => {
    mockGetGameSubs.mockResolvedValue([
      sub({ id: 'a', timeSeconds: 600, inPlayerId: 'in1' }),
      sub({ id: 'b', timeSeconds: 1200, inPlayerId: 'in2' }),
      sub({ id: 'c', timeSeconds: 1800, inPlayerId: 'eino' }),
      sub({ id: 'd', timeSeconds: 2400, inPlayerId: 'aapo' }),
    ]);
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 1860, players));
    await waitFor(() => expect(result.current.current?.timeSeconds).toBe(1800));
    expect(result.current.current?.inNames).toEqual(['Eino']);
    expect(result.current.overdueEarlier).toBe(2);
  });

  it('removes the dismissal keys the old prompt left in sessionStorage', async () => {
    sessionStorage.setItem('matchops_dismissed_sub_prompts_g1', '["a"]');
    sessionStorage.setItem('matchops_dismissed_sub_prompts_g2', '["b"]');
    sessionStorage.setItem('unrelated_key', 'keep');
    renderHook(() => usePlannedSubPrompts('g1', 0, players));
    await act(async () => {});
    expect(sessionStorage.getItem('matchops_dismissed_sub_prompts_g1')).toBeNull();
    expect(sessionStorage.getItem('matchops_dismissed_sub_prompts_g2')).toBeNull();
    expect(sessionStorage.getItem('unrelated_key')).toBe('keep');
    sessionStorage.clear();
  });

  it('leaves out a sub whose incoming player was deleted, and an empty slot has no off name', async () => {
    mockGetGameSubs.mockResolvedValue([
      sub({ id: 'gone', timeSeconds: 600, inPlayerId: 'deleted_player' }),
      sub({ id: 'ok', timeSeconds: 600, inPlayerId: 'in2', outPlayerId: null }),
    ]);
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 720, players));
    await waitFor(() => expect(result.current.current).not.toBeNull());
    expect(result.current.current).toEqual({ timeSeconds: 600, inNames: ['Alex'], outNames: [], due: true });
  });

  it('loads nothing and shows nothing when there is no game', async () => {
    const { result } = renderHook(() => usePlannedSubPrompts(null, 9999, players));
    await act(async () => {});
    expect(mockGetGameSubs).not.toHaveBeenCalled();
    expect(result.current.current).toBeNull();
  });

  it('stays quiet if loading the planned subs fails', async () => {
    mockGetGameSubs.mockRejectedValue(new Error('storage down'));
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 9999, players));
    await act(async () => {});
    expect(result.current.current).toBeNull();
  });
});
