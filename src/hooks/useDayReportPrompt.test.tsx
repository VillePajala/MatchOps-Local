/**
 * The two day-report prompt hooks read plans, links and games and apply the
 * rules in dayReportPrompts.ts (tested there in full); these check the wiring.
 */
import { renderHook, waitFor } from '@testing-library/react';
import type { AppState } from '@/types/game';
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';
import { TestFixtures } from '../../tests/fixtures';
import { todayIso } from '@/utils/todayIso';
import { useDayReportPrompt, useLastDayGamePlan } from './useDayReportPrompt';

const mockGetPlans = jest.fn();
const mockGetPlan = jest.fn();
jest.mock('@/utils/playtimePlanner/storage', () => ({
  getPlans: () => mockGetPlans(),
  getPlan: (id: string) => mockGetPlan(id),
}));
const mockGetAllPlanLinks = jest.fn();
const mockGetPlanLink = jest.fn();
jest.mock('@/utils/playtimePlanner/planLinks', () => ({
  getAllPlanLinks: () => mockGetAllPlanLinks(),
  getPlanLink: (id: string) => mockGetPlanLink(id),
}));
const mockGetSavedGames = jest.fn();
jest.mock('@/utils/savedGames', () => ({ getSavedGames: (...a: unknown[]) => mockGetSavedGames(...a) }));
jest.mock('@/hooks/useDataStore', () => ({ useDataStore: () => ({ userId: undefined }) }));

const today = todayIso();
const plan: PlaytimePlan = {
  id: 'p',
  name: 'Joulufutis 12.12.',
  version: 1,
  createdAt: '',
  updatedAt: '',
  players: [],
  games: ['a', 'b'].map((id) => ({
    id,
    label: id,
    formationId: '5v5',
    numberOfPeriods: 1,
    periodMinutes: 15,
    included: true,
    startingSlots: [],
    subs: [],
  })),
};
const links = { game_1_x: { planId: 'p', planGameId: 'a' }, game_2_x: { planId: 'p', planGameId: 'b' } };
const done = (over: Partial<AppState> = {}): AppState =>
  TestFixtures.games.completed({ gameDate: today, gameStatus: 'gameEnd', homeScore: 1, awayScore: 0, ...over });
const notStarted = (): AppState =>
  TestFixtures.games.completed({ gameDate: today, gameStatus: 'notStarted', homeScore: 0, awayScore: 0, gameEvents: [] });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPlans.mockResolvedValue({ p: plan });
  mockGetPlan.mockResolvedValue(plan);
  mockGetAllPlanLinks.mockResolvedValue(links);
  mockGetPlanLink.mockImplementation(async (id: string) => links[id as keyof typeof links] ?? null);
});

describe('useDayReportPrompt (Home)', () => {
  it('returns the finished day', async () => {
    mockGetSavedGames.mockResolvedValue({ game_1_x: done(), game_2_x: done() });
    const { result } = renderHook(() => useDayReportPrompt(true, 1));
    await waitFor(() => expect(result.current).toEqual({ planId: 'p', planName: 'Joulufutis 12.12.', lastGameDate: today }));
  });

  it('returns null while a game is unplayed, and does not look while disabled', async () => {
    mockGetSavedGames.mockResolvedValue({ game_1_x: done(), game_2_x: notStarted() });
    const { result } = renderHook(() => useDayReportPrompt(true, 1));
    await waitFor(() => expect(mockGetSavedGames).toHaveBeenCalled());
    expect(result.current).toBeNull();

    mockGetSavedGames.mockClear();
    renderHook(() => useDayReportPrompt(false, 1));
    expect(mockGetSavedGames).not.toHaveBeenCalled();
  });
});

describe('useLastDayGamePlan (finish screen)', () => {
  /** @critical the stored copy of the open game may be stale: the screen's copy counts */
  it('names the plan when the open game was the last one, using the game as on screen', async () => {
    // Storage still has game 2 unplayed; on screen it has been played.
    mockGetSavedGames.mockResolvedValue({ game_1_x: done(), game_2_x: notStarted() });
    const { result } = renderHook(() => useLastDayGamePlan('game_2_x', done({ gameStatus: 'periodEnd' }), true));
    await waitFor(() => expect(result.current).toBe('p'));
  });

  it('stays null while another of the plan\'s games is unplayed', async () => {
    mockGetSavedGames.mockResolvedValue({ game_1_x: notStarted(), game_2_x: done() });
    const { result } = renderHook(() => useLastDayGamePlan('game_2_x', done(), true));
    await waitFor(() => expect(mockGetSavedGames).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('does not look for a game that is not played, a game with no plan, or when disabled', async () => {
    mockGetSavedGames.mockResolvedValue({ game_1_x: done(), game_2_x: done() });
    renderHook(() => useLastDayGamePlan('game_2_x', notStarted(), true));
    renderHook(() => useLastDayGamePlan('game_2_x', done(), false));
    expect(mockGetPlanLink).not.toHaveBeenCalled();

    const { result } = renderHook(() => useLastDayGamePlan('game_9_x', done(), true));
    await waitFor(() => expect(mockGetPlanLink).toHaveBeenCalledWith('game_9_x'));
    expect(result.current).toBeNull();
  });
});
