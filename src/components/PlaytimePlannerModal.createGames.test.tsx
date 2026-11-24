/**
 * Planner -> real games: the per-game "Created / Create match" status, the
 * plan's "N/M games created" line, "Create match" (hands the planned game to
 * the host's new-game form) and "Create all games" (the batch sheet).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent, act, cleanup, within } from '@testing-library/react';
import PlaytimePlannerModal from './PlaytimePlannerModal';
import type { Player } from '@/types';

const interpolate = (template: string, options?: Record<string, unknown>): string =>
  options
    ? template.replace(/\{\{(\w+)\}\}/g, (_m, k) => (options[k] !== undefined ? String(options[k]) : `{{${k}}}`))
    : template;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValueOrOptions?: string | Record<string, unknown>, maybeOptions?: Record<string, unknown>) => {
      if (typeof defaultValueOrOptions === 'string') return interpolate(defaultValueOrOptions, maybeOptions);
      const dv = defaultValueOrOptions?.defaultValue;
      return typeof dv === 'string' ? interpolate(dv, defaultValueOrOptions) : '';
    },
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

jest.mock('@/contexts/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast: mockShowToast }) }));

// Storage the planner reads: saved games + plan links. The batch persist adds to both.
let mockGames: Record<string, unknown> = {};
let mockLinks: Record<string, { planId: string; planGameId: string }> = {};
jest.mock('@/utils/savedGames', () => ({
  getSavedGames: jest.fn(async () => ({ ...mockGames })),
  saveGame: jest.fn(async (_id: string, g: unknown) => g),
  deleteGame: jest.fn(async () => null),
}));
jest.mock('@/utils/playtimePlanner/planLinks', () => ({
  getAllPlanLinks: jest.fn(async () => ({ ...mockLinks })),
  deletePlanLinksForPlan: jest.fn(async () => true),
  setPlanLink: jest.fn(async () => true),
}));
jest.mock('@/utils/playtimePlanner/gameSubs', () => ({ setGameSubs: jest.fn(async () => true) }));

const mockInvalidate = jest.fn(async () => undefined);
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));

// The game write itself (covered in newGameHandlers.test.ts): record what the
// planner asked for and "persist" it into the mocked storage above.
const mockPersist = jest.fn();
jest.mock('@/components/HomePage/utils/newGameHandlers', () => ({
  persistGameFromPlan: (...args: unknown[]) => mockPersist(...args),
}));

const roster: Player[] = [
  { id: 'p1', name: 'Alex', isGoalie: false, receivedFairPlayCard: false, jerseyNumber: '1' },
  { id: 'p2', name: 'Sam', isGoalie: false, receivedFairPlayCard: false, jerseyNumber: '2' },
];
jest.mock('@/utils/masterRosterManager', () => ({ getMasterRoster: jest.fn(async () => roster) }));

jest.mock('@/utils/teams', () => ({
  getTeams: jest.fn(async () => [{ id: 'team1', name: 'FC Koti', createdAt: '', updatedAt: '' }]),
  getTeamRoster: jest.fn(async () => []),
  getTeamDisplayName: jest.requireActual('@/utils/teams').getTeamDisplayName,
  sortTeamsByName: jest.requireActual('@/utils/teams').sortTeamsByName,
}));
jest.mock('@/utils/seasons', () => ({ getSeasons: jest.fn(async () => []) }));
jest.mock('@/utils/tournaments', () => ({ getTournaments: jest.fn(async () => []) }));

const game = (id: string, label: string) => ({
  id,
  label,
  formationId: '8v8-2-1-2-1-1',
  numberOfPeriods: 2,
  periodMinutes: 12,
  included: true,
  startingSlots: [] as unknown[],
  subs: [] as unknown[],
});
const plan = {
  id: 'cup',
  name: 'Saved Cup',
  version: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  teamId: 'team1',
  players: [{ id: 'p1', name: 'Alex' }],
  games: [game('g1', 'Game 1'), game('g2', 'HJK'), game('g3', 'Game 3')],
};

const mockSavePlan = jest.fn(async (p: unknown) => p);
jest.mock('@/utils/playtimePlanner/storage', () => ({
  getPlans: jest.fn(async () => ({ cup: plan })),
  getPlan: jest.fn(async () => plan),
  savePlan: (p: unknown) => mockSavePlan(p),
  deletePlan: jest.fn(async () => true),
  importPlan: jest.fn(async () => null),
  serializePlan: (p: unknown) => JSON.stringify(p),
  duplicatePlan: (p: unknown) => p,
  createPlan: jest.fn(),
}));

jest.mock('@/utils/logger', () => {
  const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
  return { __esModule: true, default: mockLogger, createLogger: () => mockLogger };
});

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  // g1 has a game; g2's game was deleted (link outlived it); g3 never created.
  mockGames = { game_1_a: { opponentName: 'X' } };
  mockLinks = {
    game_1_a: { planId: 'cup', planGameId: 'g1' },
    game_2_b: { planId: 'cup', planGameId: 'g2' },
  };
  mockPersist.mockImplementation(
    async (_deps: unknown, request: { prefill: { sourcePlanGameId: string } }, createdAtMs: number) => {
      const id = `game_${createdAtMs}_${request.prefill.sourcePlanGameId}`;
      mockGames[id] = {};
      mockLinks[id] = { planId: 'cup', planGameId: request.prefill.sourcePlanGameId };
      return id;
    },
  );
});

afterEach(() => cleanup());

const openPlanSettings = async (props: Partial<React.ComponentProps<typeof PlaytimePlannerModal>> = {}) => {
  render(<PlaytimePlannerModal isOpen onClose={jest.fn()} {...props} />);
  const row = (await screen.findAllByRole('button', { name: /Saved Cup/ })).find((b) => !b.getAttribute('aria-label'))!;
  await act(async () => {
    fireEvent.click(row);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
  });
};

describe('planner: games created from the plan', () => {
  /** @critical one planned game, one game: created games show it, the rest offer creating */
  it('shows the created status per planned game and the plan summary', async () => {
    const onOpenGame = jest.fn();
    await openPlanSettings({ onOpenGame, onCreateGame: jest.fn() });

    await waitFor(() => expect(screen.getByTestId('planner-created-summary')).toHaveTextContent('1/3 games created'));
    // g1: created, can be opened, cannot be created again.
    expect(within(screen.getByTestId('planner-created-g1')).getByText('Created')).toBeInTheDocument();
    expect(screen.queryByTestId('planner-create-game-g1')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('planner-open-game-g1'));
    });
    expect(onOpenGame).toHaveBeenCalledWith('game_1_a');
    // g2's game was deleted -> free again; g3 never created.
    expect(screen.getByTestId('planner-create-game-g2')).toHaveTextContent('Create match');
    expect(screen.getByTestId('planner-create-game-g3')).toBeInTheDocument();
    expect(screen.queryByTestId('planner-created-g2')).not.toBeInTheDocument();
  });

  it('"Create match" saves the plan first, then hands the planned game to the host', async () => {
    const onCreateGame = jest.fn();
    await openPlanSettings({ onCreateGame });
    const button = await screen.findByTestId('planner-create-game-g3');
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => expect(onCreateGame).toHaveBeenCalledTimes(1));
    expect(onCreateGame.mock.calls[0][0]).toMatchObject({ id: 'cup' });
    expect(onCreateGame.mock.calls[0][1]).toBe('g3');
  });

  it('offers no per-game create without a host handler, but still "Create all games"', async () => {
    await openPlanSettings();
    await screen.findByTestId('planner-create-all');
    expect(screen.queryByTestId('planner-create-game-g3')).not.toBeInTheDocument();
  });

  /** @critical the batch: validate first, create the rest in plan order, link them */
  it('"Create all games" validates, creates the not-created games and updates the status', async () => {
    await openPlanSettings({ onCreateGame: jest.fn() });
    await act(async () => {
      fireEvent.click(await screen.findByTestId('planner-create-all'));
    });
    const dialog = await screen.findByRole('dialog', { name: 'Create all games' });
    // Only the not-created games, g2 prefilled from its label, g3 (placeholder) empty.
    expect(within(dialog).queryByTestId('plan-create-row-g1')).not.toBeInTheDocument();
    const opponents = within(dialog).getAllByLabelText('Opponent') as HTMLInputElement[];
    expect(opponents.map((i) => i.value)).toEqual(['HJK', '']);

    // Nothing filled: inline errors, nothing created.
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create 2 games' }));
    });
    expect(within(dialog).getByText('Enter the opponent.')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Choose the date.')).toHaveLength(2);
    expect(mockPersist).not.toHaveBeenCalled();

    // A date typed into the first row fills the empty rows after it.
    const dates = within(dialog).getAllByLabelText('Date') as HTMLInputElement[];
    await act(async () => {
      fireEvent.change(dates[0], { target: { value: '2026-12-06' } });
      fireEvent.change(opponents[1], { target: { value: 'PK-35' } });
    });
    expect((within(dialog).getAllByLabelText('Date') as HTMLInputElement[]).map((d) => d.value)).toEqual([
      '2026-12-06',
      '2026-12-06',
    ]);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create 2 games' }));
    });

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('2 matches created.', 'success'));
    expect(mockPersist.mock.calls.map((c) => c[1].prefill.sourcePlanGameId)).toEqual(['g2', 'g3']);
    expect(mockPersist.mock.calls[1][1]).toMatchObject({ opponentName: 'PK-35', teamId: 'team1', homeTeamName: 'FC Koti', gameTime: '' });
    expect(mockInvalidate).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Create all games' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('planner-created-summary')).toHaveTextContent('3/3 games created'));
    expect(screen.queryByTestId('planner-create-all')).not.toBeInTheDocument();
  });

  /** @edge-case a failed game keeps its row and inputs; the created ones drop out */
  it('reports a failed game by name and keeps only its row', async () => {
    const real = mockPersist.getMockImplementation()!;
    mockPersist.mockImplementation(async (deps: unknown, request: { prefill: { sourcePlanGameId: string } }, ms: number) =>
      request.prefill.sourcePlanGameId === 'g3' ? null : real(deps, request, ms),
    );
    await openPlanSettings({ onCreateGame: jest.fn() });
    await act(async () => {
      fireEvent.click(await screen.findByTestId('planner-create-all'));
    });
    const dialog = await screen.findByRole('dialog', { name: 'Create all games' });
    const opponents = within(dialog).getAllByLabelText('Opponent');
    await act(async () => {
      fireEvent.change(within(dialog).getAllByLabelText('Date')[0], { target: { value: '2026-12-06' } });
      fireEvent.change(opponents[1], { target: { value: 'PK-35' } });
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create 2 games' }));
    });

    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent('These games could not be created: Game 3.'),
    );
    expect(within(dialog).queryByTestId('plan-create-row-g2')).not.toBeInTheDocument();
    expect((within(dialog).getByLabelText('Opponent') as HTMLInputElement).value).toBe('PK-35');
    expect(within(dialog).getByRole('button', { name: 'Create 1 games' })).toBeInTheDocument();
    expect(mockShowToast).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('planner-created-summary')).toHaveTextContent('2/3 games created'));
  });
});
