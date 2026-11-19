/**
 * The compact plan screen ("Suunnitelma", Onboarding v3): the planner for ONE
 * game, without its tabs. Every edit is saved to the plan AND re-applied to
 * the linked game, so the two can never drift apart.
 * @critical
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PlanQuickView from '../PlanQuickView';
import { buildFirstPlan } from '@/services/nextGamePair';
import { buildReapplyPatch } from '@/utils/playtimePlanner/reapply';
import { ensureStartingSlots, getGameSlots } from '@/utils/playtimePlanner/lineup';
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';
import type { AppState, Player } from '@/types';
import { TestFixtures } from '../../../tests/fixtures';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const fb = typeof fallback === 'string' ? fallback : key;
      const vars = (typeof fallback === 'object' ? (fallback as Record<string, unknown>) : opts) ?? undefined;
      if (!vars) return fb;
      return fb.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(vars[name] ?? ''));
    },
  }),
}));

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { language: 'fi', changeLanguage: jest.fn(), isInitialized: true, on: jest.fn(), off: jest.fn() },
  saveLanguagePreference: jest.fn(),
}));

jest.mock('@/utils/logger', () => {
  const log = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() };
  return { __esModule: true, default: log, createLogger: () => log };
});

const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Storage: an in-memory plan + game, so the save/re-apply round trip is real.
let mockPlanStore: Record<string, PlaytimePlan> = {};
let mockGameStore: Record<string, AppState> = {};
jest.mock('@/utils/playtimePlanner/storage', () => ({
  getPlan: jest.fn(async (id: string) => mockPlanStore[id] ?? null),
  savePlan: jest.fn(async (p: PlaytimePlan) => {
    mockPlanStore[p.id] = p;
    return p;
  }),
  createPlan: jest.requireActual('@/utils/playtimePlanner/storage').createPlan,
}));
jest.mock('@/datastore/factory', () => ({ getDataStore: jest.fn() }));
jest.mock('@/utils/savedGames', () => ({
  getGame: jest.fn(async (id: string) => mockGameStore[id] ?? null),
  saveGame: jest.fn(async (id: string, g: AppState) => {
    mockGameStore[id] = g;
    return g;
  }),
}));
const mockSetGameSubs = jest.fn(async () => true);
jest.mock('@/utils/playtimePlanner/gameSubs', () => ({
  setGameSubs: (...args: unknown[]) => mockSetGameSubs(...(args as [])),
}));
let mockLink: { planId: string; planGameId: string } | null = null;
jest.mock('@/utils/playtimePlanner/planLinks', () => ({
  getPlanLink: jest.fn(async () => mockLink),
}));
jest.mock('@/utils/masterRosterManager', () => ({
  getMasterRoster: jest.fn(async () => []),
}));

// The FULL planner is a separate (big) component with its own tests; here a
// stand-in proves the layer contract: it opens on this plan as a single-plan
// layer, reports its edits, and closing returns here with them.
const mockPlannerProps = jest.fn();
jest.mock('@/components/lazyModal', () => ({
  lazyModal: () =>
    function PlannerStub(props: {
      initialTarget: { planId: string; planGameId: string };
      singlePlanLayer?: boolean;
      onActivePlanChange?: (p: PlaytimePlan) => void;
      onClose: () => void;
    }) {
      mockPlannerProps(props);
      return (
        <div data-testid="full-planner">
          <button
            type="button"
            onClick={() => {
              const p = mockPlanStore[props.initialTarget.planId];
              props.onActivePlanChange?.({
                ...p,
                games: p.games.map((g) => ({ ...g, periodMinutes: 30 })),
              });
              props.onClose();
            }}
          >
            close-with-edit
          </button>
        </div>
      );
    },
}));

const NAMES = ['Onni', 'Toivo', 'Aatos', 'Otso', 'Aapo', 'Elias', 'Leevi', 'Eeli', 'Eino', 'Niilo'];
const squad: Player[] = NAMES.map((name, i) => ({ id: `p${i + 1}`, name }));

let plan: PlaytimePlan;

const keeperOf = (p: PlaytimePlan): string | null => {
  const g = p.games[0];
  const gk = getGameSlots(g.formationId).find((s) => s.isGoalie)!;
  return ensureStartingSlots(g).find((s) => s.slotId === gk.slotId)?.playerId ?? null;
};

const renderView = () => {
  const onDone = jest.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PlanQuickView planId={plan.id} gameId="game-1" userId="user-1" onDone={onDone} />
    </QueryClientProvider>,
  );
  return { onDone };
};

beforeEach(() => {
  jest.clearAllMocks();
  plan = buildFirstPlan({
    team: { id: 'team-1', name: 'MePa P12' },
    players: squad,
    fieldSize: '8v8',
    gameType: 'soccer',
    ageGroup: 'U12',
    numberOfPeriods: 2,
    periodMinutes: 25,
    gameDate: '2026-11-22',
    opponentName: 'Rantakylän FC',
  });
  mockPlanStore = { [plan.id]: plan };
  const fresh = TestFixtures.games.newGame({
    teamName: 'MePa P12',
    opponentName: 'Rantakylän FC',
    gameDate: '2026-11-22',
    numberOfPeriods: 2,
    periodDurationMinutes: 25,
    availablePlayers: squad,
    selectedPlayerIds: squad.map((p) => p.id),
    playersOnField: [],
    gameEvents: [],
  }) as AppState;
  // Lined up from the plan, exactly as creating the game does.
  mockGameStore = { 'game-1': { ...fresh, ...buildReapplyPatch(fresh, plan, plan.games[0], squad).patch! } };
  mockLink = { planId: plan.id, planGameId: plan.games[0].id };
});

describe('PlanQuickView (compact planner)', () => {
  it('shows the one game without the full planner tabs, and states facts only', async () => {
    renderView();
    expect(await screen.findByTestId('plan-quick-view')).toBeInTheDocument();

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByText('MePa P12 – Rantakylän FC')).toBeInTheDocument();
    expect(screen.getByTestId('plan-quick-facts')).toHaveTextContent('10 players · 8v8 · 2 × 25 min');
    // Planned minutes for every player.
    expect(screen.getByTestId('plan-quick-minutes').querySelectorAll('li')).toHaveLength(10);
    // No fairness claims anywhere on the screen.
    expect(document.body.textContent).not.toMatch(/fair|everyone plays|all play/i);
  });

  it('names the keeper and lets the coach put someone else in goal', async () => {
    renderView();
    await screen.findByTestId('plan-quick-view');
    const keeper = keeperOf(plan)!;
    const keeperName = squad.find((p) => p.id === keeper)!.name;
    expect(screen.getByTestId('plan-quick-keeper')).toHaveTextContent(`In goal: ${keeperName}`);

    const other = squad.find((p) => p.id !== keeper)!;
    fireEvent.click(screen.getByRole('button', { name: 'change' }));
    fireEvent.click(screen.getByRole('button', { name: other.name, pressed: false }));

    await waitFor(() =>
      expect(screen.getByTestId('plan-quick-keeper')).toHaveTextContent(`In goal: ${other.name}`),
    );
    // Saved to the plan and re-applied to the game.
    await waitFor(() => expect(keeperOf(mockPlanStore[plan.id])).toBe(other.id));
    await waitFor(() =>
      expect(mockGameStore['game-1'].playersOnField.find((p) => p.isGoalie)?.id).toBe(other.id),
    );
    expect(mockSetGameSubs).toHaveBeenCalledWith('game-1', expect.any(Array));
  });

  it('"Shuffle again" makes a new lineup and saves it', async () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      renderView();
      await screen.findByTestId('plan-quick-view');
      const before = JSON.stringify(plan.games[0].startingSlots);
      fireEvent.click(screen.getByTestId('plan-quick-reshuffle'));
      await waitFor(() =>
        expect(JSON.stringify(mockPlanStore[plan.id].games[0].startingSlots)).not.toBe(before),
      );
      expect(mockPlanStore[plan.id].players).toEqual(plan.players);
    } finally {
      random.mockRestore();
    }
  });

  it('changes the length on the plan and the game ("muuta")', async () => {
    renderView();
    await screen.findByTestId('plan-quick-view');
    fireEvent.click(screen.getByRole('button', { name: 'Change the length' }));
    fireEvent.change(screen.getByLabelText('Minutes per period'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByTestId('plan-quick-facts')).toHaveTextContent('2 × 20 min');
    await waitFor(() => expect(mockGameStore['game-1'].periodDurationMinutes).toBe(20));
    expect(mockPlanStore[plan.id].games[0].periodMinutes).toBe(20);
  });

  it('changes the date on the game', async () => {
    renderView();
    await screen.findByTestId('plan-quick-view');
    fireEvent.click(screen.getByRole('button', { name: 'Change the date' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-29' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockGameStore['game-1'].gameDate).toBe('2026-11-29'));
  });

  it('"Detailed editing" opens the full planner on this plan, and closing returns here with the changes', async () => {
    renderView();
    await screen.findByTestId('plan-quick-view');
    fireEvent.click(screen.getByTestId('plan-quick-full'));

    expect(await screen.findByTestId('full-planner')).toBeInTheDocument();
    expect(mockPlannerProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialTarget: { planId: plan.id, planGameId: plan.games[0].id },
        singlePlanLayer: true,
      }),
    );

    fireEvent.click(screen.getByText('close-with-edit'));
    expect(screen.queryByTestId('full-planner')).not.toBeInTheDocument();
    expect(screen.getByTestId('plan-quick-facts')).toHaveTextContent('2 × 30 min');
    await waitFor(() => expect(mockGameStore['game-1'].periodDurationMinutes).toBe(30));
  });

  it('"Looks good" waits for the last save, then hands back', async () => {
    const { onDone } = renderView();
    await screen.findByTestId('plan-quick-view');
    fireEvent.click(screen.getByTestId('plan-quick-reshuffle'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('plan-quick-done'));
    });
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(mockSetGameSubs).toHaveBeenCalled();
  });

  it('offers the way Home when the plan cannot be opened', async () => {
    mockPlanStore = {};
    const { onDone } = renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Go to Home' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('tells the coach when a change could not be saved', async () => {
    const storage = jest.requireMock('@/utils/playtimePlanner/storage');
    renderView();
    await screen.findByTestId('plan-quick-view');
    storage.savePlan.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByTestId('plan-quick-reshuffle'));
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Could not save the change. Please try again.', 'error'),
    );
  });

  /**
   * Review R13: the coach moved players on the game's pitch by hand. A plan
   * edit re-applies the plan to the pitch, so the first one asks first.
   * @critical
   */
  describe('hand-moved players on the pitch', () => {
    const moveOneByHand = () => {
      const game = mockGameStore['game-1'];
      const [first, ...rest] = game.playersOnField;
      mockGameStore['game-1'] = { ...game, playersOnField: [{ ...first, relX: (first.relX ?? 0) + 0.1 }, ...rest] };
      return first.id;
    };

    it('asks before an edit replaces them; Cancel leaves plan and pitch alone', async () => {
      const moved = moveOneByHand();
      const pitchBefore = JSON.stringify(mockGameStore['game-1'].playersOnField);
      renderView();
      await screen.findByTestId('plan-quick-view');
      fireEvent.click(screen.getByTestId('plan-quick-reshuffle'));
      expect(await screen.findByText('Moved by hand')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await act(async () => {});
      expect(mockPlanStore[plan.id]).toBe(plan);
      expect(JSON.stringify(mockGameStore['game-1'].playersOnField)).toBe(pitchBefore);
      expect(mockGameStore['game-1'].playersOnField.some((p) => p.id === moved)).toBe(true);
    });

    it('applies the edit once the coach chooses the plan, and asks only once', async () => {
      moveOneByHand();
      renderView();
      await screen.findByTestId('plan-quick-view');
      fireEvent.click(screen.getByTestId('plan-quick-reshuffle'));
      fireEvent.click(await screen.findByRole('button', { name: 'Use the plan' }));
      await waitFor(() => expect(mockPlanStore[plan.id]).not.toBe(plan));
      await waitFor(() => expect(mockSetGameSubs).toHaveBeenCalled());
      const saved = mockPlanStore[plan.id];
      fireEvent.click(screen.getByTestId('plan-quick-reshuffle'));
      expect(screen.queryByText('Moved by hand')).not.toBeInTheDocument();
      await waitFor(() => expect(mockPlanStore[plan.id]).not.toBe(saved));
    });

    it('a date change does not touch the line-up, so it does not ask', async () => {
      moveOneByHand();
      const pitchBefore = JSON.stringify(mockGameStore['game-1'].playersOnField);
      renderView();
      await screen.findByTestId('plan-quick-view');
      fireEvent.click(screen.getByRole('button', { name: 'Change the date' }));
      fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-29' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(mockGameStore['game-1'].gameDate).toBe('2026-11-29'));
      expect(screen.queryByText('Moved by hand')).not.toBeInTheDocument();
      expect(JSON.stringify(mockGameStore['game-1'].playersOnField)).toBe(pitchBefore);
    });
  });
});
