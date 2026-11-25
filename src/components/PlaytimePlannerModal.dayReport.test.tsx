/**
 * Planner -> "Turnauspäivän raportti": the entry shows once one of the plan's
 * games is played, opens the report over the plan's games, and the day text
 * is saved with the plan.
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
jest.mock('@/utils/appSettings', () => ({ getAppSettings: jest.fn(async () => ({ knownVenues: [] })) }));
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

const unplayed = (opponentName: string) => ({
  teamName: 'FC Koti',
  opponentName,
  homeScore: 0,
  awayScore: 0,
  homeOrAway: 'home',
  gameStatus: 'notStarted',
  gameEvents: [] as unknown[],
  availablePlayers: roster,
  selectedPlayerIds: ['p1'],
  playersOnField: [] as unknown[],
  playerPositions: { p1: ['gk'] },
  gameNotes: '',
});

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
  // g1 and g2 have games, neither played yet; g3 never created.
  mockGames = {
    game_1_a: unplayed('HJK'),
    game_2_b: unplayed('PK-35'),
  };
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

describe('planner: tournament day report', () => {
  it('offers no day report while none of the plan\'s games is played', async () => {
    await openPlanSettings();
    await waitFor(() => expect(screen.getByTestId('planner-created-summary')).toHaveTextContent('2/3 games created'));
    expect(screen.queryByTestId('planner-day-report')).not.toBeInTheDocument();
  });

  /** @critical entry from the plan once a game is played; text saved with the plan */
  it('opens the report once one game is played and saves the day text on the plan', async () => {
    mockGames.game_1_a = { ...(mockGames.game_1_a as object), gameStatus: 'gameEnd', homeScore: 3, awayScore: 1 };
    await openPlanSettings();
    const entry = await screen.findByTestId('planner-day-report');
    expect(entry).toHaveTextContent('Tournament day report');
    await act(async () => {
      fireEvent.click(entry);
    });
    const dialog = await screen.findByTestId('plan-day-report');
    // Plan order; the unplayed game is listed but not counted.
    expect(within(dialog).getByTestId('day-report-game-1')).toHaveTextContent('HJK');
    expect(within(dialog).getByTestId('day-report-game-1')).toHaveTextContent('3–1');
    expect(within(dialog).getByTestId('day-report-game-2')).toHaveTextContent('not played yet');
    expect(within(dialog).getByTestId('day-report-subtitle')).toHaveTextContent('1W 0D 0L');

    await act(async () => {
      fireEvent.click(within(dialog).getByTestId('day-report-open-editor'));
    });
    await act(async () => {
      fireEvent.change(within(dialog).getByTestId('day-report-text'), { target: { value: 'Hyvä päivä.' } });
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByTestId('day-report-save'));
    });
    // Saved with the plan (debounced plan save), and shown back in the report.
    await waitFor(
      () => expect(mockSavePlan).toHaveBeenCalledWith(expect.objectContaining({ id: 'cup', dayReport: 'Hyvä päivä.' })),
      { timeout: 3000 },
    );
    expect(within(dialog).getByTestId('day-report-open-editor')).toHaveTextContent('Hyvä päivä.');
  });
});
