import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent, act, cleanup, within } from '@testing-library/react';
import PlaytimePlannerModal from './PlaytimePlannerModal';
import type { Player } from '@/types';

// Interpolating t mock: resolves the default string and substitutes {{vars}}
// from the options object, so interpolated strings get real coverage.
const interpolate = (template: string, options?: Record<string, unknown>): string =>
  options
    ? template.replace(/\{\{(\w+)\}\}/g, (_m, k) =>
        options[k] !== undefined ? String(options[k]) : `{{${k}}}`,
      )
    : template;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValueOrOptions?: string | Record<string, unknown>, maybeOptions?: Record<string, unknown>) => {
      if (typeof defaultValueOrOptions === 'string') {
        return interpolate(defaultValueOrOptions, maybeOptions);
      }
      const dv = defaultValueOrOptions?.defaultValue;
      return typeof dv === 'string' ? interpolate(dv, defaultValueOrOptions) : '';
    },
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

jest.mock('@/contexts/AuthProvider', () => ({
  useAuth: () => ({ user: null }),
}));

const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// The planner reads saved games to count/bulk-update plan-linked games (Phase 3.4).
const mockGetSavedGames = jest.fn((..._args: unknown[]) => Promise.resolve<Record<string, unknown>>({}));
jest.mock('@/utils/savedGames', () => ({
  getSavedGames: (...args: unknown[]) => mockGetSavedGames(...args),
  saveGame: jest.fn(async (_id: string, g: unknown) => g),
}));

// The planner invalidates the saved-games query cache after a bulk re-apply.
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// Bulk re-apply stores the recomputed planned subs per game.
jest.mock('@/utils/playtimePlanner/gameSubs', () => ({
  setGameSubs: jest.fn(async () => true),
}));

// Linked games are found via the local plan-link store (not the game blob).
const mockGetAllPlanLinks = jest.fn(async (): Promise<Record<string, { planId: string; planGameId: string }>> => ({}));
jest.mock('@/utils/playtimePlanner/planLinks', () => ({
  getAllPlanLinks: () => mockGetAllPlanLinks(),
}));

const roster: Player[] = [
  { id: 'p1', name: 'Alex', isGoalie: false, receivedFairPlayCard: false, jerseyNumber: '1' },
  { id: 'p2', name: 'Sam', isGoalie: false, receivedFairPlayCard: false, jerseyNumber: '2' },
];

jest.mock('@/utils/masterRosterManager', () => ({
  getMasterRoster: jest.fn(async () => roster),
}));

const mockGetTeams = jest.fn();
const mockGetTeamRoster = jest.fn();
const mockGetSeasons = jest.fn();
const mockGetTournaments = jest.fn();
jest.mock('@/utils/teams', () => ({
  getTeams: (...a: unknown[]) => mockGetTeams(...a),
  getTeamRoster: (...a: unknown[]) => mockGetTeamRoster(...a),
}));
jest.mock('@/utils/seasons', () => ({ getSeasons: (...a: unknown[]) => mockGetSeasons(...a) }));
jest.mock('@/utils/tournaments', () => ({ getTournaments: (...a: unknown[]) => mockGetTournaments(...a) }));

// Fully mock storage to decouple the modal from the IndexedDB layer. The real
// createPlan is covered in storage.test.ts; here we only need its shape.
const mockGetPlans = jest.fn();
const mockGetPlan = jest.fn();
const mockSavePlan = jest.fn();
const mockDeletePlan = jest.fn();
const mockImportPlan = jest.fn();
jest.mock('@/utils/playtimePlanner/storage', () => ({
  getPlans: (...a: unknown[]) => mockGetPlans(...a),
  getPlan: (...a: unknown[]) => mockGetPlan(...a),
  savePlan: (...a: unknown[]) => mockSavePlan(...a),
  deletePlan: (...a: unknown[]) => mockDeletePlan(...a),
  importPlan: (...a: unknown[]) => mockImportPlan(...a),
  serializePlan: (plan: unknown) => JSON.stringify(plan),
  duplicatePlan: (plan: { name: string }) => ({ ...plan, id: 'dup-1', name: `${plan.name} (copy)` }),
  createPlan: (opts: {
    name: string;
    players: { id: string; name: string }[];
    gameCount: number;
    formationId: string;
    numberOfPeriods: number;
    periodMinutes: number;
    teamId?: string;
  }) => ({
    id: 'plan-1',
    name: opts.name,
    version: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    players: opts.players,
    ...(opts.teamId ? { teamId: opts.teamId } : {}),
    games: Array.from({ length: Math.max(1, opts.gameCount) }, (_, i) => ({
      id: `g${i}`,
      label: `Game ${i + 1}`,
      formationId: opts.formationId,
      numberOfPeriods: opts.numberOfPeriods,
      periodMinutes: opts.periodMinutes,
      included: true,
      startingSlots: [],
      subs: [],
    })),
  }),
}));

jest.mock('@/utils/logger', () => {
  const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
  return { __esModule: true, default: mockLogger, createLogger: () => mockLogger };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPlans.mockResolvedValue({});
  mockSavePlan.mockImplementation(async (plan) => plan);
  mockDeletePlan.mockResolvedValue(true);
  mockGetPlan.mockResolvedValue(null);
  mockImportPlan.mockResolvedValue(null);
  mockGetTeams.mockResolvedValue([]);
  mockGetTeamRoster.mockResolvedValue([]);
  mockGetSeasons.mockResolvedValue([]);
  mockGetTournaments.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe('PlaytimePlannerModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<PlaytimePlannerModal isOpen={false} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the setup form with the roster when there are no plans', async () => {
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Create plan')).toBeInTheDocument());
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();
    // All players selected by default (interpolated count).
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('creates a plan (5 games, 2 selected players) and moves to the overview', async () => {
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Create plan')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('Create plan'));
    });

    await waitFor(() => expect(mockSavePlan).toHaveBeenCalledTimes(1));
    const savedPlan = mockSavePlan.mock.calls[0][0];
    expect(savedPlan.players).toHaveLength(2);
    expect(savedPlan.games).toHaveLength(5);

    // Overview view now shows management controls.
    await waitFor(() => expect(screen.getByText('Delete')).toBeInTheDocument());
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('disables create when no players are selected', async () => {
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Create plan')).toBeInTheDocument());

    fireEvent.click(screen.getByText('None'));
    await waitFor(() =>
      expect(screen.getByText('Create plan').closest('button')).toBeDisabled(),
    );
  });

  const existingPlan = {
    id: 'existing',
    name: 'Saved Cup',
    version: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    players: [{ id: 'p1', name: 'Alex' }],
    games: [
      {
        id: 'g1',
        label: 'Game 1',
        formationId: '8v8-2-1-2-1-1',
        numberOfPeriods: 2,
        periodMinutes: 12,
        included: true,
        startingSlots: [] as unknown[],
        subs: [] as unknown[],
      },
    ],
  };

  it('opens straight to the overview when a plan already exists', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue('Saved Cup')).toBeInTheDocument());
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('bulk re-applies the plan to linked unplayed games (Phase 3.4)', async () => {
    const onLinkedGamesUpdated = jest.fn();
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    // One saved game was created from planned game g1 (link in the link store)
    // and is still unplayed.
    mockGetAllPlanLinks.mockResolvedValue({
      game_1: { planId: 'existing', planGameId: 'g1' },
    });
    mockGetSavedGames.mockResolvedValue({
      game_1: {
        gameStatus: 'notStarted',
        gameEvents: [],
        availablePlayers: [{ id: 'p1', name: 'Alex' }],
        selectedPlayerIds: [],
        playersOnField: [],
      },
    } as never);

    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} onLinkedGamesUpdated={onLinkedGamesUpdated} />);

    // The "update N games" affordance appears once the linked count resolves.
    const button = await screen.findByText('Update 1 games created from this');
    await act(async () => {
      fireEvent.click(button);
    });

    // Guarded behind the app's ConfirmationModal - nothing runs until confirmed.
    expect(mockShowToast).not.toHaveBeenCalled();
    const confirm = await screen.findByRole('button', { name: 'Update' });
    await act(async () => {
      fireEvent.click(confirm);
    });

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Updated 1 games from the plan.', 'success'),
    );
    // The host is told which games changed so it can refresh live state.
    expect(onLinkedGamesUpdated).toHaveBeenCalledWith(['game_1']);
  });

  it('autosaves an overview edit (debounced) to the plan name', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    const nameInput = await screen.findByDisplayValue('Saved Cup');

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Renamed Cup' } });
    });

    // Debounced save (600ms) eventually fires with the new name.
    await waitFor(() => expect(mockSavePlan).toHaveBeenCalled(), { timeout: 2000 });
    const lastCall = mockSavePlan.mock.calls[mockSavePlan.mock.calls.length - 1][0];
    expect(lastCall.name).toBe('Renamed Cup');
  });

  it('shows an error toast when create fails to save', async () => {
    mockSavePlan.mockResolvedValue(null); // storage failure
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Create plan')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('Create plan'));
    });

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error'));
    // Stays on setup (no overview) since the save failed.
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('edits a lineup end-to-end: assign a player and the placed count updates', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Edit lineup')).toBeInTheDocument());
    // 8v8-2-1-2-1-1 => GK + 7 = 8 slots, none placed yet.
    expect(screen.getByText('0/8 placed')).toBeInTheDocument();

    // Open the lineup editor for the game.
    await act(async () => {
      fireEvent.click(screen.getByText('Edit lineup'));
    });

    // Assign the one roster player (Alex) to the goalkeeper slot.
    await act(async () => {
      fireEvent.click(screen.getByLabelText('GK: empty'));
    });
    await act(async () => {
      // Both the fairness strip and the bench render an "Alex" button; the
      // bench chip is the pill-shaped one (rounded-full).
      fireEvent.click(
        screen
          .getAllByRole('button', { name: /^Alex/ })
          .find((b) => b.className.includes('rounded-full'))!,
      );
    });

    // Back to the plan; the placed count now reflects the assignment.
    await act(async () => {
      fireEvent.click(screen.getByText('Back'));
    });
    await waitFor(() => expect(screen.getByText('1/8 placed')).toBeInTheDocument());
  });

  it('adds and replaces plan players from the Edit players view (Phase 4)', async () => {
    // Plan holds only Alex; master roster also has Sam -> Sam is the candidate.
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Edit players')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('Edit players'));
    });
    expect(screen.getByText('Plan players')).toBeInTheDocument();

    // Replace: Alex's spots + subs hand over to Sam in one action.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
    });
    // Sam is now the plan member; Alex is gone and becomes the add-candidate.
    expect(screen.queryByRole('button', { name: 'Sam' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Alex' })).toBeInTheDocument();

    // Add: Alex rejoins -> no candidates left.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Alex' }));
    });
    expect(screen.getByText('Everyone from your roster is already in this plan.')).toBeInTheDocument();
  });

  it('removes a plan player only after an impact confirm (Phase 4)', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Edit players')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('Edit players'));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    });
    // Impact confirm names the damage before anything happens.
    expect(screen.getByText('Remove player?')).toBeInTheDocument();
    expect(screen.getByText(/starting spots: 0, planned subs: 0/)).toBeInTheDocument();

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await act(async () => {
      fireEvent.click(removeButtons[removeButtons.length - 1]);
    });
    // Alex left the plan and is offered as an add-candidate again.
    expect(screen.getByRole('button', { name: '+ Alex' })).toBeInTheDocument();
  });

  it('swiping ON the fairness strip does NOT flip the game (touch isolation)', async () => {
    const twoGamePlan = {
      ...existingPlan,
      games: [existingPlan.games[0], { ...existingPlan.games[0], id: 'g2', label: 'Game 2' }],
    };
    mockGetPlans.mockResolvedValue({ existing: twoGamePlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getAllByText('Edit lineup')[0]).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getAllByText('Edit lineup')[0]);
    });

    // A horizontal swipe starting on a strip cell must stay in the strip.
    const stripCell = screen
      .getAllByRole('button', { name: /Alex/ })
      .find((b) => b.getAttribute('title') === 'Alex')!;
    await act(async () => {
      fireEvent.touchStart(stripCell, { touches: [{ clientX: 300, clientY: 100 }] });
      fireEvent.touchEnd(stripCell, { changedTouches: [{ clientX: 100, clientY: 100 }] });
    });
    expect(screen.getByRole('heading', { name: 'Game 1' })).toBeInTheDocument();
  });

  it('grid view shows every game as an editable card with the totals strip on top', async () => {
    const twoGamePlan = {
      ...existingPlan,
      games: [existingPlan.games[0], { ...existingPlan.games[0], id: 'g2', label: 'Game 2' }],
    };
    mockGetPlans.mockResolvedValue({ existing: twoGamePlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await screen.findByDisplayValue('Saved Cup');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'All games side by side' }));
    });
    // Both game cards render with their own editable field (bench hint per card).
    expect(screen.getByRole('heading', { name: 'Game 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Game 2' })).toBeInTheDocument();
    expect(screen.getAllByText('Tap a player to place them, or a position first.')).toHaveLength(2);
    // The shared strip sits above the cards.
    expect(screen.getByRole('button', { name: /Playing-time totals/ })).toBeInTheDocument();
    // Back returns to the overview.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    });
    expect(screen.getByDisplayValue('Saved Cup')).toBeInTheDocument();
  });

  it('suggests fair lineups behind a confirm, and undo restores the old state', async () => {
    // Plan has one game with an empty lineup; the generator fills it.
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await screen.findByDisplayValue('Saved Cup');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Suggest fair lineups' }));
    });
    // Nothing changes until confirmed.
    expect(screen.getByText(/0\/\d+ placed/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    });
    // 8v8 formation, but only 1 roster player -> exactly 1 placed.
    await waitFor(() => expect(screen.getByText(/1\/\d+ placed/)).toBeInTheDocument());
    expect(mockShowToast).toHaveBeenCalledWith(
      'Fair lineups suggested - check the balance view.',
      'success',
    );

    // Generated overwrite is one undo away.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect(screen.getByText(/0\/\d+ placed/)).toBeInTheDocument();
  });

  it('undo reverts the last edit and redo restores it', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    const nameInput = await screen.findByDisplayValue('Saved Cup');

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Renamed Cup' } });
    });
    expect(screen.getByDisplayValue('Renamed Cup')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect(screen.getByDisplayValue('Saved Cup')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    });
    expect(screen.getByDisplayValue('Renamed Cup')).toBeInTheDocument();
  });

  it('undo is disabled on a freshly opened plan (history never crosses plans)', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await screen.findByDisplayValue('Saved Cup');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('a horizontal swipe on the lineup flips to the next game', async () => {
    const twoGamePlan = {
      ...existingPlan,
      games: [existingPlan.games[0], { ...existingPlan.games[0], id: 'g2', label: 'Game 2' }],
    };
    mockGetPlans.mockResolvedValue({ existing: twoGamePlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getAllByText('Edit lineup')[0]).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getAllByText('Edit lineup')[0]);
    });
    expect(screen.getByRole('heading', { name: 'Game 1' })).toBeInTheDocument();

    const area = screen.getByTestId('lineup-swipe-area');
    await act(async () => {
      fireEvent.touchStart(area, { touches: [{ clientX: 300, clientY: 200 }] });
      fireEvent.touchEnd(area, { changedTouches: [{ clientX: 120, clientY: 210 }] });
    });
    expect(screen.getByRole('heading', { name: 'Game 2' })).toBeInTheDocument();

    // Swiping right at the LAST game clamps (no wrap) - stays on Game 2... swipe
    // right goes BACK to Game 1.
    await act(async () => {
      fireEvent.touchStart(area, { touches: [{ clientX: 120, clientY: 200 }] });
      fireEvent.touchEnd(area, { changedTouches: [{ clientX: 300, clientY: 210 }] });
    });
    expect(screen.getByRole('heading', { name: 'Game 1' })).toBeInTheDocument();
  });

  it('switches between games with one tap via the lineup game tabs', async () => {
    // Two-game plan: the tab strip renders (hidden for single-game plans) and
    // jumping Game 1 -> Game 2 is a single tap, no round trip via the overview.
    const twoGamePlan = {
      ...existingPlan,
      games: [
        existingPlan.games[0],
        { ...existingPlan.games[0], id: 'g2', label: 'Game 2' },
      ],
    };
    mockGetPlans.mockResolvedValue({ existing: twoGamePlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getAllByText('Edit lineup')[0]).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getAllByText('Edit lineup')[0]);
    });
    expect(screen.getByRole('heading', { name: 'Game 1' })).toBeInTheDocument();

    // Tab labels use the short game code (G1/G2, P1/P2 in fi).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'G2' }));
    });
    expect(screen.getByRole('heading', { name: 'Game 2' })).toBeInTheDocument();
    // Current tab is marked for assistive tech.
    expect(screen.getByRole('button', { name: 'G2' })).toHaveAttribute('aria-current', 'true');
  });

  it('adds and removes a substitution from the lineup view', async () => {
    mockGetPlans.mockResolvedValue({
      existing: { ...existingPlan, players: [{ id: 'p1', name: 'Alex' }, { id: 'p2', name: 'Sam' }] },
    });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Edit lineup')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('Edit lineup'));
    });

    // Place Alex as goalkeeper so there is a starter to sub off.
    await act(async () => {
      fireEvent.click(screen.getByLabelText('GK: empty'));
    });
    await act(async () => {
      // Both the fairness strip and the bench render an "Alex" button; the
      // bench chip is the pill-shaped one (rounded-full).
      fireEvent.click(
        screen
          .getAllByRole('button', { name: /^Alex/ })
          .find((b) => b.className.includes('rounded-full'))!,
      );
    });

    // New flow: select the GK slot again, open the sub sheet, tap Sam.
    await act(async () => {
      fireEvent.click(screen.getByLabelText('GK: Alex'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sub…' }));
    });
    // The sheet names the position + outgoing player; one tap creates the sub.
    expect(screen.getByRole('dialog', { name: 'Substitution · GK (Alex)' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Substitution · GK (Alex)' })).getByRole('button', { name: /Sam/ }));
    });
    await waitFor(() => expect(screen.getByText(/Sam in for Alex \(GK\)/)).toBeInTheDocument());

    // Remove it again.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    });
    await waitFor(() => expect(screen.queryByText(/Sam in for Alex \(GK\)/)).not.toBeInTheDocument());
  });

  it('prefills roster selection and durations from a chosen team, and stamps teamId', async () => {
    mockGetTeams.mockResolvedValue([{ id: 't1', name: 'U10', boundSeasonId: 's1' }]);
    mockGetSeasons.mockResolvedValue([{ id: 's1', name: 'Spring', periodCount: 1, periodDuration: 20 }]);
    mockGetTeamRoster.mockResolvedValue([{ id: 'tp1', name: 'Alex' }]); // only Alex is on the team
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Team (optional)')).toBeInTheDocument());

    // Both players selected by default (freehand).
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    // Choose the team (the select currently shows the "No team" option text).
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('No team - all players'), { target: { value: 't1' } });
    });

    // Roster narrows to the team's matching players; durations come from its season.
    await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());
    expect(screen.getByDisplayValue('20')).toBeInTheDocument(); // periodDuration inherited

    // Creating the plan stamps the teamId.
    await act(async () => {
      fireEvent.click(screen.getByText('Create plan'));
    });
    await waitFor(() =>
      expect(mockSavePlan.mock.calls.some((c) => c[0]?.teamId === 't1')).toBe(true),
    );
  });

  it('toasts and leaves selection + durations unchanged when the team roster fails to load', async () => {
    mockGetTeams.mockResolvedValue([{ id: 't1', name: 'U10', boundSeasonId: 's1' }]);
    mockGetSeasons.mockResolvedValue([{ id: 's1', name: 'Spring', periodCount: 1, periodDuration: 20 }]);
    mockGetTeamRoster.mockRejectedValue(new Error('boom'));
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Team (optional)')).toBeInTheDocument());
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('No team - all players'), { target: { value: 't1' } });
    });

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith("Could not load that team's roster.", 'error'),
    );
    // Durations are deferred until the roster loads, so nothing half-applied.
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('20')).not.toBeInTheDocument();

    // teamId must NOT be stamped after a failed load: creating yields a plan without one.
    await act(async () => {
      fireEvent.click(screen.getByText('Create plan'));
    });
    await waitFor(() => expect(mockSavePlan).toHaveBeenCalled());
    expect(mockSavePlan.mock.calls.every((c) => c[0]?.teamId === undefined)).toBe(true);
  });

  it('discards a stale team-roster response when a newer team is picked first', async () => {
    mockGetTeams.mockResolvedValue([
      { id: 't1', name: 'Alpha' },
      { id: 't2', name: 'Bravo' },
    ]);
    let resolveT1: (() => void) | undefined;
    mockGetTeamRoster.mockImplementation((id: string) => {
      if (id === 't1') {
        return new Promise((res) => {
          resolveT1 = () => res([{ id: 'tp1', name: 'Alex' }, { id: 'tp2', name: 'Sam' }]);
        });
      }
      return Promise.resolve([{ id: 'tp1', name: 'Alex' }]); // t2 -> only Alex
    });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Team (optional)')).toBeInTheDocument());
    const sel = screen.getByDisplayValue('No team - all players');

    // Pick t1 (roster stays pending), then t2 (resolves -> 1 selected).
    await act(async () => {
      fireEvent.change(sel, { target: { value: 't1' } });
    });
    await act(async () => {
      fireEvent.change(sel, { target: { value: 't2' } });
    });
    await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());

    // t1's late response must be discarded (selection stays at t2's 1, not 2).
    await act(async () => {
      resolveT1?.();
    });
    await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
  });

  it('reverts roster AND durations to defaults when switching back to "No team"', async () => {
    mockGetTeams.mockResolvedValue([{ id: 't1', name: 'U10', boundSeasonId: 's1' }]);
    mockGetSeasons.mockResolvedValue([{ id: 's1', name: 'Spring', periodCount: 1, periodDuration: 20 }]);
    mockGetTeamRoster.mockResolvedValue([{ id: 'tp1', name: 'Alex' }]);
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Team (optional)')).toBeInTheDocument());

    // Pick the team: roster narrows to 1 and durations inherit (20 min).
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('No team - all players'), { target: { value: 't1' } });
    });
    await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();

    // Deselect: full roster back AND durations revert to the default 12.
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('U10'), { target: { value: '' } });
    });
    await waitFor(() => expect(screen.getByText('2 selected')).toBeInTheDocument());
    expect(screen.getByDisplayValue('12')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('20')).not.toBeInTheDocument();
  });

  it('resets durations to defaults when switching to an unbound team (no stale carry-over)', async () => {
    mockGetTeams.mockResolvedValue([
      { id: 't1', name: 'Alpha', boundSeasonId: 's1' },
      { id: 't2', name: 'Bravo' }, // unbound - no competition
    ]);
    mockGetSeasons.mockResolvedValue([{ id: 's1', name: 'Spring', periodCount: 1, periodDuration: 20 }]);
    mockGetTeamRoster.mockResolvedValue([{ id: 'tp1', name: 'Alex' }]);
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Team (optional)')).toBeInTheDocument());

    // Bound team A -> inherits 20 min.
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('No team - all players'), { target: { value: 't1' } });
    });
    await waitFor(() => expect(screen.getByDisplayValue('20')).toBeInTheDocument());

    // Switch to unbound team B -> durations revert to the default 12, not stale 20.
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Alpha'), { target: { value: 't2' } });
    });
    await waitFor(() => expect(screen.getByDisplayValue('12')).toBeInTheDocument());
    expect(screen.queryByDisplayValue('20')).not.toBeInTheDocument();
  });

  it('navigates to the balance view and back', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('View playing-time balance')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('View playing-time balance'));
    });
    await waitFor(() => expect(screen.getByText('Playing-time balance')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('Back'));
    });
    await waitFor(() => expect(screen.getByText('View playing-time balance')).toBeInTheDocument());
  });

  it('duplicates the active plan under a copy name', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Duplicate')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('Duplicate'));
    });

    await waitFor(() =>
      expect(
        mockSavePlan.mock.calls.some((c) => typeof c[0]?.name === 'string' && c[0].name.includes('(copy)')),
      ).toBe(true),
    );
  });

  it('shows an export-specific error toast when export fails', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    const original = URL.createObjectURL;
    URL.createObjectURL = jest.fn(() => {
      throw new Error('blob failed');
    });
    try {
      render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByText('Export JSON')).toBeInTheDocument());
      await act(async () => {
        fireEvent.click(screen.getByText('Export JSON'));
      });
      // Must be the export message, NOT the import one (that was the bug).
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith('Could not export the plan.', 'error'),
      );
    } finally {
      URL.createObjectURL = original;
    }
  });

  it('shows an import error toast when the chosen file is not a valid plan', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    mockImportPlan.mockResolvedValue(null);
    const { container } = render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Import JSON')).toBeInTheDocument());

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{"bad":true}'], 'plan.json', { type: 'application/json' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Could not read that file as a plan.', 'error'),
    );
  });

  it('exports the active plan as a sanitized .json download', async () => {
    mockGetPlans.mockResolvedValue({ existing: { ...existingPlan, name: 'Cup A/B' } });
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn(() => 'blob:x');
    URL.revokeObjectURL = jest.fn();
    const clicked: string[] = [];
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this.download);
      });
    try {
      render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByText('Export JSON')).toBeInTheDocument());
      await act(async () => {
        fireEvent.click(screen.getByText('Export JSON'));
      });
      // '/' and space in the name are sanitized to underscores.
      await waitFor(() => expect(clicked).toEqual(['Cup_A_B.json']));
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      clickSpy.mockRestore();
    }
  });

  it('persists a pending edit before reading the target plan on switch', async () => {
    const planB = { ...existingPlan, id: 'b', name: 'Plan B' };
    mockGetPlans.mockResolvedValue({ existing: existingPlan, b: planB });
    let saveResolved = false;
    mockSavePlan.mockImplementation(async (p) => {
      await Promise.resolve();
      saveResolved = true;
      return p;
    });
    mockGetPlan.mockImplementation(async (id: string) => {
      // The pending edit must be persisted before the target read runs (race fix).
      expect(saveResolved).toBe(true);
      return id === 'b' ? planB : existingPlan;
    });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    // Use the game-label input to dirty the plan: its value ('Game 1') is unique,
    // whereas the plan name collides with the switcher's selected-option text.
    await waitFor(() => expect(screen.getByDisplayValue('Game 1')).toBeInTheDocument());

    // Dirty the active plan (schedules a debounced save), then switch immediately.
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Game 1'), { target: { value: 'Match 1' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
    });
    await waitFor(() => expect(mockGetPlan).toHaveBeenCalledWith('b'));
    expect(mockSavePlan).toHaveBeenCalled();
  });

  it('shows a toast when switching to a plan that no longer exists', async () => {
    const planB = { ...existingPlan, id: 'b', name: 'Plan B' };
    mockGetPlans.mockResolvedValue({ existing: existingPlan, b: planB });
    mockGetPlan.mockResolvedValue(null); // target vanished (e.g. deleted elsewhere)
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Plan')).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
    });
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Could not open that plan.', 'error'),
    );
  });

  it('shows a plan switcher when multiple plans exist and switches between them', async () => {
    const planB = { ...existingPlan, id: 'b', name: 'Plan B' };
    mockGetPlans.mockResolvedValue({ existing: existingPlan, b: planB });
    mockGetPlan.mockImplementation(async (id: string) => (id === 'b' ? planB : existingPlan));
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Plan')).toBeInTheDocument());

    // The overview's only <select> is the plan switcher.
    const switcher = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(switcher, { target: { value: 'b' } });
    });
    await waitFor(() => expect(mockGetPlan).toHaveBeenCalledWith('b'));
    await waitFor(() => expect((switcher as HTMLSelectElement).value).toBe('b'));
  });

  it('shows an error toast when delete fails', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    mockDeletePlan.mockResolvedValue(false);
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Delete')).toBeInTheDocument());

    // Footer button opens the ConfirmationModal; the destructive action runs
    // only after the styled confirm (no native window.confirm anymore).
    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });
    const confirmButtons = await screen.findAllByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    });

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error'));
  });
});
