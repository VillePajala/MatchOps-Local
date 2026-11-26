import { renderHook, waitFor, act } from '@testing-library/react';
import {
  DUE_WINDOW_SECONDS,
  groupSubs,
  mostUrgentAlert,
  plannedClockAlertLevel,
  usePlannedSubPrompts,
} from './usePlannedSubPrompts';
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
      current: {
        timeSeconds: 720, inNames: ['Niko'], outNames: ['Sam'], inShortNames: ['Niko'], outShortNames: ['Sam'],
        swapNames: [], swapShortNames: [], due: false,
      },
      overdueEarlier: 0,
      hasPlan: true,
      nextAheadSeconds: 720,
    });
  });

  /**
   * D3c: the next planned change is always visible - the upcoming group ahead
   * of the clock moves on as each group falls due, and is null after the last.
   * @critical
   */
  it('the shown group is quiet until due, due for a minute, then the next one shows', async () => {
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
    rerender({ t: 659 });
    expect(result.current.current).toMatchObject({ timeSeconds: 600, due: true });
    rerender({ t: 1200 });
    expect(result.current.current).toMatchObject({ timeSeconds: 1200, due: true });
    expect(result.current.overdueEarlier).toBe(0);
  });

  /**
   * Review R13: once its time has passed, the block clears - the next change
   * ahead shows quietly instead, and after the last one nothing does.
   * @critical
   */
  it('an overdue group clears: the next upcoming shows, or nothing after the last', async () => {
    mockGetGameSubs.mockResolvedValue([
      sub({ id: 'a', timeSeconds: 900, inPlayerId: 'in1' }),
      sub({ id: 'b', timeSeconds: 1500, inPlayerId: 'in2' }),
    ]);
    const { result, rerender } = renderHook(
      ({ t }) => usePlannedSubPrompts('g1', t, players),
      { initialProps: { t: 900 } },
    );
    // At the break the clock stands at 15:00, so the change stays due.
    await waitFor(() => expect(result.current.current).toMatchObject({ timeSeconds: 900, due: true }));
    rerender({ t: 900 + DUE_WINDOW_SECONDS });
    expect(result.current.current).toMatchObject({ timeSeconds: 1500, due: false });
    rerender({ t: 1500 + DUE_WINDOW_SECONDS });
    expect(result.current.current).toBeNull();
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
    expect(result.current.current).toEqual({
      timeSeconds: 720, inNames: ['Niko'], outNames: ['Sam'], inShortNames: ['Niko'], outShortNames: ['Sam'], swapNames: [], swapShortNames: [], due: true,
    });
  });

  it('re-reads the schedule when refreshKey changes (re-apply plan)', async () => {
    // First read: no subs. After a plan re-apply, the store has a due sub and the
    // caller bumps refreshKey to force a re-read for the same game.
    mockGetGameSubs.mockResolvedValueOnce([]).mockResolvedValueOnce([sub({ timeSeconds: 600 })]);
    const { result, rerender } = renderHook(
      ({ key }) => usePlannedSubPrompts('g1', 610, players, key),
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
    expect(result.current.current).toEqual({
      timeSeconds: 1500,
      inNames: ['Niko', 'Alex', 'Aapo'],
      outNames: ['Sam'],
      inShortNames: ['Niko', 'Alex', 'Aapo'],
      outShortNames: ['Sam'], swapNames: [], swapShortNames: [],
      due: true,
    });
    expect(result.current.overdueEarlier).toBe(0);
  });

  /**
   * Reopening the app at 31:00 with groups at 10, 20, 30 and 40: the passed
   * ones are over, so the next one ahead shows.
   * @critical
   */
  it('after a resume, shows the next change ahead rather than passed ones', async () => {
    mockGetGameSubs.mockResolvedValue([
      sub({ id: 'a', timeSeconds: 600, inPlayerId: 'in1' }),
      sub({ id: 'b', timeSeconds: 1200, inPlayerId: 'in2' }),
      sub({ id: 'c', timeSeconds: 1800, inPlayerId: 'eino' }),
      sub({ id: 'd', timeSeconds: 2400, inPlayerId: 'aapo' }),
    ]);
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 1860, players));
    await waitFor(() => expect(result.current.current?.timeSeconds).toBe(2400));
    expect(result.current.current?.due).toBe(false);
    expect(result.current.overdueEarlier).toBe(0);
  });

  it('counts other groups due in the same window', async () => {
    mockGetGameSubs.mockResolvedValue([
      sub({ id: 'a', timeSeconds: 600, inPlayerId: 'in1' }),
      sub({ id: 'b', timeSeconds: 630, inPlayerId: 'in2' }),
    ]);
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 640, players));
    await waitFor(() => expect(result.current.current?.timeSeconds).toBe(630));
    expect(result.current.overdueEarlier).toBe(1);
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
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 620, players));
    await waitFor(() => expect(result.current.current).not.toBeNull());
    expect(result.current.current).toEqual({ timeSeconds: 600, inNames: ['Alex'], outNames: [], inShortNames: ['Alex'], outShortNames: [], swapNames: [], swapShortNames: [], due: true });
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

  /**
   * The timer shows the disc names (nickname, else first name), kept unique
   * across the squad; the full names stay alongside for screen readers.
   */
  it('gives each group the short disc names, disambiguated across the squad', async () => {
    const squad: Player[] = [
      { id: 'tq', name: 'Tomas Qvist' },
      { id: 'tv', name: 'Tomas Virta' },
      { id: 'mt', name: 'Muhammed Toor', nickname: 'Mukke' },
      { id: 'jt', name: 'Jasper Tuulmägi' },
    ];
    mockGetGameSubs.mockResolvedValue([
      sub({ id: 'a', timeSeconds: 600, inPlayerId: 'tq', outPlayerId: 'jt' }),
      sub({ id: 'b', timeSeconds: 600, inPlayerId: 'mt', outPlayerId: null }),
    ]);
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 620, squad));
    await waitFor(() => expect(result.current.current).not.toBeNull());
    expect(result.current.current).toMatchObject({
      inNames: ['Tomas Qvist', 'Muhammed Toor'],
      inShortNames: ['Tomas Q.', 'Mukke'],
      outNames: ['Jasper Tuulmägi'],
      outShortNames: ['Jasper'],
    });
  });

  /** The timer picks its sub mechanism from this: plan block vs interval timer. */
  it('reports whether the game has a plan, and null while it loads', async () => {
    let resolve: (subs: PlannedGameSub[]) => void = () => {};
    mockGetGameSubs.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 0, players));
    expect(result.current.hasPlan).toBeNull();
    await act(async () => resolve([]));
    expect(result.current.hasPlan).toBe(false);
  });

  it('a plan with every group behind the clock still counts as a plan', async () => {
    mockGetGameSubs.mockResolvedValue([sub({ timeSeconds: 60 })]);
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 2000, players));
    await waitFor(() => expect(result.current.hasPlan).toBe(true));
    expect(result.current.current).toBeNull();
  });

  it('with no game loaded there is no plan (and nothing to wait for)', () => {
    const { result } = renderHook(() => usePlannedSubPrompts(null, 0, players));
    expect(result.current.hasPlan).toBe(false);
  });
});

describe('groupSubs - position swaps', () => {
  const squad: Player[] = ['vaino', 'onni', 'eino', 'aapo', 'a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
  }));
  const at = (timeSeconds: number, inPlayerId: string, outPlayerId: string | null, slotId = inPlayerId) =>
    sub({ id: `${timeSeconds}-${inPlayerId}`, timeSeconds, slotId, inPlayerId, outPlayerId });

  /** Väinö and Onni trade positions: both stay on, so neither is "on" or "off". */
  it('a pure swap is a swap only', () => {
    const [g] = groupSubs([at(600, 'vaino', 'onni', 'rm'), at(600, 'onni', 'vaino', 'lm')], squad);
    expect(g).toMatchObject({ inNames: [], outNames: [], swapNames: ['Vaino', 'Onni'], swapShortNames: ['Vaino', 'Onni'] });
  });

  it('a swap and a real sub in the same group are kept apart', () => {
    const [g] = groupSubs(
      [at(600, 'vaino', 'onni', 'rm'), at(600, 'eino', 'aapo', 'st'), at(600, 'onni', 'vaino', 'lm')],
      squad,
    );
    expect(g).toMatchObject({ inNames: ['Eino'], outNames: ['Aapo'], swapNames: ['Vaino', 'Onni'] });
  });

  /** A on for B, B moves on for C: B stays on (position change), A comes on, C goes off. */
  it('a chain A -> B -> C makes only the middle player a position change', () => {
    const [g] = groupSubs([at(900, 'a', 'b', 's1'), at(900, 'b', 'c', 's2')], squad);
    expect(g).toMatchObject({ inNames: ['A'], outNames: ['C'], swapNames: ['B'] });
  });

  it('a half-time mass change keeps the real changes and lists the movers once', () => {
    const [g] = groupSubs(
      [
        at(1500, 'a', 'd', 's1'),
        at(1500, 'b', 'e', 's2'),
        at(1500, 'c', 'f', 's3'),
        at(1500, 'vaino', 'onni', 's4'),
        at(1500, 'onni', 'eino', 's5'),
        at(1500, 'eino', 'vaino', 's6'),
      ],
      squad,
    );
    expect(g.inNames).toEqual(['A', 'B', 'C']);
    expect(g.outNames).toEqual(['D', 'E', 'F']);
    expect(g.swapNames).toEqual(['Vaino', 'Onni', 'Eino']);
  });

  it('only players of the same moment count as moving', () => {
    const groups = groupSubs([at(600, 'vaino', 'onni'), at(900, 'onni', 'vaino')], squad);
    expect(groups.map((g) => [g.inNames, g.outNames, g.swapNames])).toEqual([
      [['Vaino'], ['Onni'], []],
      [['Onni'], ['Vaino'], []],
    ]);
  });

  it('an empty slot filled keeps a lone "on", and an unknown player is skipped', () => {
    const [g] = groupSubs([at(600, 'a', null), at(600, 'ghost', 'b'), at(600, 'c', 'gone')], squad);
    expect(g).toMatchObject({ inNames: ['A', 'C'], outNames: [], swapNames: [] });
  });
});

describe('plannedClockAlertLevel (clock colour, option B)', () => {
  const group = (timeSeconds: number, due: boolean) => ({
    timeSeconds, inNames: ['Niko'], outNames: [], inShortNames: ['Niko'], outShortNames: [],
    swapNames: [], swapShortNames: [], due,
  });
  const none = () => false;

  /** @critical - orange a minute ahead, red while due, normal otherwise. */
  it('walks the clock through orange to red and back', () => {
    expect(plannedClockAlertLevel({ current: group(720, false), nextAheadSeconds: 720 }, 600, none)).toBe('none');
    expect(plannedClockAlertLevel({ current: group(720, false), nextAheadSeconds: 720 }, 660, none)).toBe('warning');
    expect(plannedClockAlertLevel({ current: group(720, true), nextAheadSeconds: null }, 720, none)).toBe('due');
    // Window over: the hook moves on, nothing is due and nothing is near.
    expect(plannedClockAlertLevel({ current: null, nextAheadSeconds: null }, 720 + DUE_WINDOW_SECONDS, none)).toBe('none');
  });

  /** @critical - "Done ✓" quiets the clock at once for that group only. */
  it('a group marked done neither warns nor turns red', () => {
    const done = (t: number) => t === 720;
    expect(plannedClockAlertLevel({ current: group(720, true), nextAheadSeconds: 1500 }, 730, done)).toBe('none');
    expect(plannedClockAlertLevel({ current: group(720, false), nextAheadSeconds: 720 }, 700, done)).toBe('none');
    // The next group still warns on its own.
    expect(plannedClockAlertLevel({ current: group(720, true), nextAheadSeconds: 760 }, 730, done)).toBe('warning');
  });

  it('the more urgent colour wins when the interval timer also speaks', () => {
    expect(mostUrgentAlert('warning', 'due')).toBe('due');
    expect(mostUrgentAlert('due', 'none')).toBe('due');
    expect(mostUrgentAlert('none', 'warning')).toBe('warning');
    expect(mostUrgentAlert('none', 'none')).toBe('none');
  });
});
