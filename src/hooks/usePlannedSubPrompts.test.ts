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
  it('shows no prompt before the clock reaches a planned sub time', async () => {
    mockGetGameSubs.mockResolvedValue([sub()]);
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 0, players));
    // Give the load effect a tick to resolve, then assert still null (720 > 0).
    await act(async () => {});
    expect(result.current.prompt).toBeNull();
  });

  it('surfaces the due sub with resolved player names once the clock passes it', async () => {
    mockGetGameSubs.mockResolvedValue([sub()]);
    const { result, rerender } = renderHook(
      ({ t }) => usePlannedSubPrompts('g1', t, players),
      { initialProps: { t: 0 } },
    );
    await act(async () => {});
    rerender({ t: 720 });
    await waitFor(() => expect(result.current.prompt).not.toBeNull());
    expect(result.current.prompt).toMatchObject({ subId: 's1', inName: 'Niko', outName: 'Sam' });
  });

  it('shows the earliest due sub first', async () => {
    mockGetGameSubs.mockResolvedValue([
      sub({ id: 'late', timeSeconds: 900, inPlayerId: 'in2' }),
      sub({ id: 'early', timeSeconds: 600, inPlayerId: 'in1' }),
    ]);
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 1000, players));
    await waitFor(() => expect(result.current.prompt?.subId).toBe('early'));
  });

  it('dismiss removes the prompt and reveals the next due sub', async () => {
    mockGetGameSubs.mockResolvedValue([
      sub({ id: 'a', timeSeconds: 600, inPlayerId: 'in1' }),
      sub({ id: 'b', timeSeconds: 700, inPlayerId: 'in2' }),
    ]);
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 1000, players));
    await waitFor(() => expect(result.current.prompt?.subId).toBe('a'));
    act(() => result.current.dismiss('a'));
    await waitFor(() => expect(result.current.prompt?.subId).toBe('b'));
    act(() => result.current.dismiss('b'));
    await waitFor(() => expect(result.current.prompt).toBeNull());
  });

  it('reports a null outName when the planned slot had no starter', async () => {
    mockGetGameSubs.mockResolvedValue([sub({ outPlayerId: null })]);
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 720, players));
    await waitFor(() => expect(result.current.prompt).not.toBeNull());
    expect(result.current.prompt?.outName).toBeNull();
  });

  it('loads nothing and prompts nothing when there is no game', async () => {
    const { result } = renderHook(() => usePlannedSubPrompts(null, 9999, players));
    await act(async () => {});
    expect(mockGetGameSubs).not.toHaveBeenCalled();
    expect(result.current.prompt).toBeNull();
  });

  it('stays quiet if loading the planned subs fails', async () => {
    mockGetGameSubs.mockRejectedValue(new Error('storage down'));
    const { result } = renderHook(() => usePlannedSubPrompts('g1', 9999, players));
    await act(async () => {});
    expect(result.current.prompt).toBeNull();
  });
});
