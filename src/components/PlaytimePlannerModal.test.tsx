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
const mockSaveGameUtil = jest.fn(async (_id: string, g: unknown) => g);
jest.mock('@/utils/savedGames', () => ({
  getSavedGames: (...args: unknown[]) => mockGetSavedGames(...args),
  saveGame: (...args: unknown[]) => mockSaveGameUtil(...(args as [string, unknown])),
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
  deletePlanLinksForPlan: jest.fn(async () => true),
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
  // Pure formatter - use the real one so option labels are tested for real.
  getTeamDisplayName: jest.requireActual('@/utils/teams').getTeamDisplayName,
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
  mockSaveGameUtil.mockImplementation(async (_id: string, g: unknown) => g);
  // The planner persists the open plan id per session (resume-from-background);
  // stale keys must not leak a previous test's plan into the next render.
  sessionStorage.clear();
  mockGetPlans.mockResolvedValue({});
  // Mirror real storage: getPlan reads the same collection getPlans serves, so
  // opening a plan from the manager resolves without per-test wiring.
  mockGetPlan.mockImplementation(async (id: string) => {
    const all = (await mockGetPlans()) as Record<string, unknown>;
    return (all?.[id] as never) ?? null;
  });
  mockSavePlan.mockImplementation(async (plan) => plan);
  mockDeletePlan.mockResolvedValue(true);
  mockImportPlan.mockResolvedValue(null);
  mockGetTeams.mockResolvedValue([]);
  mockGetTeamRoster.mockResolvedValue([]);
  mockGetSeasons.mockResolvedValue([]);
  mockGetTournaments.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

// The planner now opens on the plan MANAGER; tests that work inside a plan
// enter it by tapping its row first.
const openPlanTab = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
  });
};

const enterPlan = async (name: string | RegExp = /Saved Cup/) => {
  const pattern = typeof name === 'string' ? new RegExp(name) : name;
  // Each manager row has TWO buttons matching the plan name: the open button
  // (name from content, no aria-label) and the trash icon (aria-label
  // "Delete: <name>"). Pick the open one.
  const row = (await screen.findAllByRole('button', { name: pattern })).find(
    (b) => !b.getAttribute('aria-label'),
  )!;
  await act(async () => {
    fireEvent.click(row);
  });
};

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
    expect(screen.getByText('selected', { exact: false }).parentElement?.textContent).toContain('2 / 2');
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

    // The created plan opens straight onto its Games tab.
    await waitFor(() => expect(screen.getByLabelText('Game name')).toBeInTheDocument());
    await openPlanTab();
    expect(screen.getByDisplayValue('Tournament plan')).toBeInTheDocument();
    expect(screen.getByText('Export JSON')).toBeInTheDocument(); // footer export
  });

  it('disables create when no players are selected', async () => {
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Create plan')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Select All'));
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

  it('resumes straight into the open plan after a background remount', async () => {
    // GameContainer restores the modal itself; the session key restores WHICH
    // plan was open, skipping the manager.
    sessionStorage.setItem('matchops_planner_active_plan', 'existing');
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    // Lands on the Games tab of the remembered plan - no manager row tap.
    await screen.findByLabelText('Game name');
    expect(screen.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'true');
    // Back to the manager clears the resume key.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    });
    expect(sessionStorage.getItem('matchops_planner_active_plan')).toBeNull();
  });

  it('a background-resume remount still loads team data for the Settings tab', async () => {
    // The resume path used to early-return out of the load effect BEFORE the
    // team/season/tournament block, leaving those selectors empty for the rest
    // of the modal instance after every background -> foreground remount.
    sessionStorage.setItem('matchops_planner_active_plan', 'existing');
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    mockGetTeams.mockResolvedValue([{ id: 't1', name: 'U10' }]);
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await screen.findByLabelText('Game name'); // resumed straight into the plan

    await openPlanTab();
    // The selector sits inside the collapsed "Games & format" fold-out.
    await act(async () => {
      fireEvent.click(screen.getByText('Games & format'));
    });
    // The team selector renders only when teams actually loaded.
    const teamSelect = await screen.findByLabelText('Team (optional)');
    expect(teamSelect).toContainHTML('U10');
  });

  describe('Escape ladder', () => {
    it('steps back one level: games tab -> manager -> close', async () => {
      const onClose = jest.fn();
      mockGetPlans.mockResolvedValue({ existing: existingPlan });
      render(<PlaytimePlannerModal isOpen onClose={onClose} />);
      await enterPlan();
      await screen.findByLabelText('Game name');

      // From a plan tab: Escape returns to the manager, not out of the modal.
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });
      expect(onClose).not.toHaveBeenCalled();
      expect((await screen.findAllByRole('button', { name: /Saved Cup/ })).length).toBeGreaterThan(0);

      // From the manager: Escape closes.
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('only blurs a focused input - never navigates mid-edit', async () => {
      const onClose = jest.fn();
      mockGetPlans.mockResolvedValue({ existing: existingPlan });
      render(<PlaytimePlannerModal isOpen onClose={onClose} />);
      await enterPlan();
      const nameInput = await screen.findByLabelText('Game name');
      nameInput.focus();
      expect(document.activeElement).toBe(nameInput);

      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });
      // Field dismissed, still on the games tab, modal open.
      expect(document.activeElement).not.toBe(nameInput);
      expect(screen.getByLabelText('Game name')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it('explicit Close from an open plan clears the resume key', async () => {
    // The key exists so BACKGROUNDING resumes the workspace; a deliberate
    // footer Close must not make the next open jump back into the plan.
    const onClose = jest.fn();
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={onClose} />);
    await enterPlan();
    await screen.findByLabelText('Game name');
    expect(sessionStorage.getItem('matchops_planner_active_plan')).toBe('existing');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('matchops_planner_active_plan')).toBeNull();
  });

  it('opens on the plan manager and enters a plan on tap', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    // Manager first: the plan is a row with its meta, not an open workspace.
    const row = (await screen.findAllByRole('button', { name: /Saved Cup/ })).find(
      (b) => !b.getAttribute('aria-label'),
    )!;
    expect(row).toHaveTextContent('1 games · 1 players');
    expect(screen.queryByDisplayValue('Saved Cup')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(row);
    });
    // Inside: the Games tab with the editable game-name header and the tabs.
    expect(screen.getByLabelText('Game name')).toHaveValue('Game 1');
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
    // Back returns to the manager.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    });
    expect(screen.getAllByRole('button', { name: /Saved Cup/ }).length).toBeGreaterThan(0);
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
    await enterPlan();
    await openPlanTab();

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

  it('bulk re-apply reports PARTIAL success when some writes fail', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    mockGetAllPlanLinks.mockResolvedValue({
      game_1: { planId: 'existing', planGameId: 'g1' },
      game_2: { planId: 'existing', planGameId: 'g1' },
    });
    const unplayed = {
      gameStatus: 'notStarted',
      gameEvents: [],
      availablePlayers: [{ id: 'p1', name: 'Alex' }],
      selectedPlayerIds: [],
      playersOnField: [],
    };
    mockGetSavedGames.mockResolvedValue({ game_1: unplayed, game_2: unplayed } as never);
    // The second game's storage write fails (the seam contract: failures throw).
    mockSaveGameUtil.mockImplementation(async (id: string, g: unknown) => {
      if (id === 'game_2') throw new Error('write failed');
      return g;
    });

    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await openPlanTab();
    await act(async () => {
      fireEvent.click(await screen.findByText('Update 2 games created from this'));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Update' }));
    });

    // Partial outcome is an ERROR toast naming both counts - never a clean success.
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Updated 1 games; 1 could not be updated.', 'error'),
    );
  });

  it('bulk re-apply names plan players missing from a game roster', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    mockGetAllPlanLinks.mockResolvedValue({
      game_1: { planId: 'existing', planGameId: 'g1' },
    });
    // The game's roster does NOT contain plan player Alex (p1) - roster drift.
    mockGetSavedGames.mockResolvedValue({
      game_1: {
        gameStatus: 'notStarted',
        gameEvents: [],
        availablePlayers: [{ id: 'p9', name: 'Visitor' }],
        selectedPlayerIds: [],
        playersOnField: [],
      },
    } as never);
    // Give the plan a lineup so Alex is actually expected somewhere.
    const planWithLineup = {
      ...existingPlan,
      games: [{ ...existingPlan.games[0], startingSlots: [{ slotId: 'gk', playerId: 'p1' }] }],
    };
    mockGetPlans.mockResolvedValue({ existing: planWithLineup });

    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await openPlanTab();
    await act(async () => {
      fireEvent.click(await screen.findByText('Update 1 games created from this'));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Update' }));
    });

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'Updated 1 games. Not in a game roster, skipped: Alex.',
        'success',
      ),
    );
  });

  it('bulk re-apply surfaces a hard failure as the re-apply error toast', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
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

    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await openPlanTab();
    const button = await screen.findByText('Update 1 games created from this');
    // The linked-count refresh also reads saved games - storage goes down only
    // now, so the re-apply itself is what hits the failure.
    mockGetSavedGames.mockRejectedValue(new Error('storage down'));
    await act(async () => {
      fireEvent.click(button);
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Update' }));
    });

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Could not update the linked games.', 'error'),
    );
  });

  it('autosaves a plan-tab edit (debounced) to the plan name', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await openPlanTab();
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
    await enterPlan();
    // 8v8-2-1-2-1-1 => GK + 7 = 8 slots, none placed yet (plan tab shows it).
    await openPlanTab();
    expect(screen.getByText('0/8 placed')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Games' }));
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

    // The plan tab's game row reflects the assignment.
    await openPlanTab();
    await waitFor(() => expect(screen.getByText('1/8 placed')).toBeInTheDocument());
  });

  it('replaces a plan player from the plan tab and re-adds via checkbox (Phase 4)', async () => {
    // Plan holds only Alex; master roster also has Sam -> Sam is the candidate.
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await openPlanTab();

    // Replace: expand the section; Alex's spots + subs hand over to Sam.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Replace a player/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
    });
    // Sam is now the plan member; Alex left (checkbox unchecked).
    expect(screen.getByRole('checkbox', { name: 'Sam' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Alex' })).not.toBeChecked();

    // Add: Alex rejoins via the roster checkbox -> no replace-candidates left.
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Alex' }));
    });
    expect(screen.getByText('Everyone from your roster is already in this plan.')).toBeInTheDocument();
  });

  it('removes a ZERO-impact player silently via the roster checkboxes', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await openPlanTab();

    // Alex holds no lineup spots -> unchecking removes without a confirm
    // (impacted removals are covered by the impact-confirm test).
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Alex' }));
    });
    expect(screen.queryByText('Remove player?')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Alex' })).not.toBeChecked();
  });

  it('swiping ON the fairness strip does NOT flip the game (touch isolation)', async () => {
    const twoGamePlan = {
      ...existingPlan,
      games: [existingPlan.games[0], { ...existingPlan.games[0], id: 'g2', label: 'Game 2' }],
    };
    mockGetPlans.mockResolvedValue({ existing: twoGamePlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');

    // A horizontal swipe starting on a strip cell must stay in the strip.
    const stripCell = screen
      .getAllByRole('button', { name: /Alex/ })
      .find((b) => b.getAttribute('title') === 'Alex')!;
    await act(async () => {
      fireEvent.touchStart(stripCell, { touches: [{ clientX: 300, clientY: 100 }] });
      fireEvent.touchEnd(stripCell, { changedTouches: [{ clientX: 100, clientY: 100 }] });
    });
    expect(screen.getByDisplayValue('Game 1')).toBeInTheDocument();
  });

  it('grid view shows every game as an editable card with the totals strip on top', async () => {
    const twoGamePlan = {
      ...existingPlan,
      games: [existingPlan.games[0], { ...existingPlan.games[0], id: 'g2', label: 'Game 2' }],
    };
    mockGetPlans.mockResolvedValue({ existing: twoGamePlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Side by side' }));
    });
    // Both game cards render with their own editable field (bench hint per card).
    expect(screen.getByRole('heading', { name: 'Game 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Game 2' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Auto-fill' })).toHaveLength(2);
    // The shared strip sits above the cards.
    expect(screen.getByRole('button', { name: /Playing-time totals/ })).toBeInTheDocument();
    // The toggle returns to the single-game layout (header edits the game).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Single game' }));
    });
    expect(screen.getByLabelText('Game name')).toBeInTheDocument();
  });

  it('suggests fair lineups behind a confirm, and undo restores the old state', async () => {
    // Plan has one game with an empty lineup; the generator fills it.
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await openPlanTab();
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

    // Generated overwrite is one undo away - undo lives on the Games tab.
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Games' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    await openPlanTab();
    expect(screen.getByText(/0\/\d+ placed/)).toBeInTheDocument();
  });

  it('does NOT coalesce renames of two different games into one undo step', async () => {
    const twoGamePlan = {
      ...existingPlan,
      games: [existingPlan.games[0], { ...existingPlan.games[0], id: 'g2', label: 'Game 2' }],
    };
    mockGetPlans.mockResolvedValue({ existing: twoGamePlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Game name'), { target: { value: 'Final A' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^G2 .*Game 2$/ }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Game name'), { target: { value: 'Final B' } });
    });

    // One undo reverts ONLY the second rename (different coalesce keys).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect(screen.getByLabelText('Game name')).toHaveValue('Game 2');
    expect(screen.getByRole('button', { name: /^G1 .*Final A$/ })).toBeInTheDocument();
  });

  it('undo reverts the last edit and redo restores it', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Game name'), { target: { value: 'Final' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect(screen.getByLabelText('Game name')).toHaveValue('Game 1');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    });
    expect(screen.getByLabelText('Game name')).toHaveValue('Final');
  });

  it('coalesces consecutive keystrokes into ONE undo step', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();

    // Three keystrokes of a game rename in the header...
    const nameInput = await screen.findByLabelText('Game name');
    for (const v of ['Game 1 A', 'Game 1 AB', 'Game 1 ABC']) {
      await act(async () => {
        fireEvent.change(nameInput, { target: { value: v } });
      });
    }
    expect(screen.getByDisplayValue('Game 1 ABC')).toBeInTheDocument();
    // ...revert with a SINGLE undo (not one per keystroke).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect(screen.getByDisplayValue('Game 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('swiping ON the game-tab strip does not ALSO flip via the swipe handler', async () => {
    const threeGamePlan = {
      ...existingPlan,
      games: [
        existingPlan.games[0],
        { ...existingPlan.games[0], id: 'g2', label: 'Game 2' },
        { ...existingPlan.games[0], id: 'g3', label: 'Game 3' },
      ],
    };
    mockGetPlans.mockResolvedValue({ existing: threeGamePlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');

    // A drag that starts on the tab strip stays in the strip (it scrolls it,
    // never triggers the lineup's game-flip).
    const tabs = screen.getByRole('navigation', { name: 'Switch game' });
    await act(async () => {
      fireEvent.touchStart(tabs, { touches: [{ clientX: 300, clientY: 100 }] });
      fireEvent.touchEnd(tabs, { changedTouches: [{ clientX: 100, clientY: 100 }] });
    });
    expect(screen.getByDisplayValue('Game 1')).toBeInTheDocument();
  });

  it('undo is disabled on a freshly opened plan (history never crosses plans)', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('overview roster checkboxes add instantly and route impacted removals through the confirm', async () => {
    const planWithLineup = {
      ...existingPlan,
      games: [{ ...existingPlan.games[0], startingSlots: [{ slotId: 'gk', playerId: 'p1' }] }],
    };
    mockGetPlans.mockResolvedValue({ existing: planWithLineup });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await openPlanTab();

    // Sam (master roster, not in the plan) joins with one tap - no confirm.
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Sam' }));
    });
    expect(screen.getByRole('checkbox', { name: 'Sam' })).toBeChecked();

    // Alex holds a lineup spot - unchecking names the damage before it happens.
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Alex' }));
    });
    expect(screen.getByText('Remove player?')).toBeInTheDocument();
    expect(screen.getByText(/starting spots: 1, planned subs: 0/)).toBeInTheDocument();
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await act(async () => {
      fireEvent.click(removeButtons[removeButtons.length - 1]);
    });
    expect(screen.getByRole('checkbox', { name: 'Alex' })).not.toBeChecked();
  });

  it('toggles a game in/out of totals via the tab include dot', async () => {
    const twoGamePlan = {
      ...existingPlan,
      games: [existingPlan.games[0], { ...existingPlan.games[0], id: 'g2', label: 'Game 2' }],
    };
    mockGetPlans.mockResolvedValue({ existing: twoGamePlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');

    // The dot is the ONLY inclusion toggle (the overview checkbox is gone).
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Counted in totals - tap to exclude: Game 2' }),
      );
    });
    expect(
      screen.getByRole('button', { name: 'Excluded from totals - tap to include: Game 2' }),
    ).toBeInTheDocument();

    // The plan tab mirrors the exclusion on the game row.
    await openPlanTab();
    expect(screen.getByText(/Not counted/)).toBeInTheDocument();
  });

  it('a horizontal swipe on the lineup flips to the next game', async () => {
    const twoGamePlan = {
      ...existingPlan,
      games: [existingPlan.games[0], { ...existingPlan.games[0], id: 'g2', label: 'Game 2' }],
    };
    mockGetPlans.mockResolvedValue({ existing: twoGamePlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');
    expect(screen.getByDisplayValue('Game 1')).toBeInTheDocument();

    const area = screen.getByTestId('lineup-swipe-area');
    await act(async () => {
      fireEvent.touchStart(area, { touches: [{ clientX: 300, clientY: 200 }] });
      fireEvent.touchEnd(area, { changedTouches: [{ clientX: 120, clientY: 210 }] });
    });
    expect(screen.getByDisplayValue('Game 2')).toBeInTheDocument();

    // Swiping right at the LAST game clamps (no wrap) - stays on Game 2... swipe
    // right goes BACK to Game 1.
    await act(async () => {
      fireEvent.touchStart(area, { touches: [{ clientX: 120, clientY: 200 }] });
      fireEvent.touchEnd(area, { changedTouches: [{ clientX: 300, clientY: 210 }] });
    });
    expect(screen.getByDisplayValue('Game 1')).toBeInTheDocument();
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
    await enterPlan();
    await screen.findByLabelText('Game name');
    expect(screen.getByDisplayValue('Game 1')).toBeInTheDocument();

    // Ribbon tabs carry the short code AND the game name.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^G2 .*Game 2$/ }));
    });
    expect(screen.getByDisplayValue('Game 2')).toBeInTheDocument();
    // Current tab is marked for assistive tech.
    expect(screen.getByRole('button', { name: /^G2 .*Game 2$/ })).toHaveAttribute('aria-current', 'true');
  });

  it('marks a placed player absent: slot clears, bench hides them, toggle restores', async () => {
    const planWithLineup = {
      ...existingPlan,
      players: [{ id: 'p1', name: 'Alex' }, { id: 'p2', name: 'Sam' }],
      games: [{ ...existingPlan.games[0], startingSlots: [{ slotId: 'gk', playerId: 'p1' }] }],
    };
    mockGetPlans.mockResolvedValue({ existing: planWithLineup });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('GK: Alex');

    // Open the availability fold-out and mark the PLACED starter absent.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Absent from this game/ }));
    });
    const group = screen.getByRole('group', { name: 'Absent from this game' });
    await act(async () => {
      fireEvent.click(within(group).getByRole('button', { name: 'Alex' }));
    });

    // The goalkeeper slot is empty again and Alex is NOT offered on the bench.
    expect(screen.getByLabelText('GK: empty')).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Alex' })).toHaveAttribute('aria-pressed', 'true');

    // Toggle back: Alex returns as a bench candidate (disc outside the group).
    await act(async () => {
      fireEvent.click(within(group).getByRole('button', { name: 'Alex' }));
    });
    const alexButtons = screen.getAllByRole('button', { name: /^Alex/ });
    expect(alexButtons.some((b) => !group.contains(b))).toBe(true);
  });

  it('renames a game by editing the header title in the game view', async () => {
    const twoGamePlan = {
      ...existingPlan,
      games: [existingPlan.games[0], { ...existingPlan.games[0], id: 'g2', label: 'Game 2' }],
    };
    mockGetPlans.mockResolvedValue({ existing: twoGamePlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');

    // The header IS the game name - tap-editable, no separate row.
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Game name'), { target: { value: 'Final' } });
    });
    // The ribbon tab picks up the new name; switching games swaps the header.
    expect(screen.getByRole('button', { name: /^G1 .*Final$/ })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^G2 .*Game 2$/ }));
    });
    expect(screen.getByDisplayValue('Game 2')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Final')).not.toBeInTheDocument();
  });

  it('adds and removes a substitution from the lineup view, announcing EVERY change (repeats included)', async () => {
    mockGetPlans.mockResolvedValue({
      existing: {
        ...existingPlan,
        players: [{ id: 'p1', name: 'Alex' }, { id: 'p2', name: 'Sam' }, { id: 'p3', name: 'Jo' }],
      },
    });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');
    const announcement = () => document.querySelector('[data-announcement-nonce]');

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

    // Select the GK slot, open the sub sheet, tap Sam -> first sub.
    await act(async () => {
      fireEvent.click(screen.getByLabelText('GK: Alex'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sub…' }));
    });
    expect(screen.getByRole('dialog', { name: 'Substitution · GK (Alex)' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Substitution · GK (Alex)' })).getByRole('button', { name: /Sam/ }));
    });
    await waitFor(() => expect(screen.getByText(/Sam in for Alex \(GK\)/)).toBeInTheDocument());
    expect(announcement()).toHaveTextContent('Substitution added');
    expect(announcement()).toHaveAttribute('data-announcement-nonce', '1');

    // Second sub onto the same slot (Jo) - the stacked-pill flow.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sub…' }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: /Substitution · GK/ })).getByRole('button', { name: /Jo/ }));
    });
    expect(announcement()).toHaveAttribute('data-announcement-nonce', '2');

    // Remove BOTH from the sheet in sequence: the second announcement carries
    // the SAME text as the first - the nonce must still force a fresh DOM node
    // or assistive tech announces only the first removal.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sub…' }));
    });
    const sheet = () => screen.getByRole('dialog', { name: /Substitution · GK/ });
    await act(async () => {
      fireEvent.click(within(sheet()).getAllByRole('button', { name: 'Remove' })[0]);
    });
    expect(announcement()).toHaveTextContent('Substitution removed');
    expect(announcement()).toHaveAttribute('data-announcement-nonce', '3');
    await act(async () => {
      fireEvent.click(within(sheet()).getAllByRole('button', { name: 'Remove' })[0]);
    });
    expect(announcement()).toHaveTextContent('Substitution removed');
    expect(announcement()).toHaveAttribute('data-announcement-nonce', '4');
  });

  it('placing a starter KEEPS their scheduled subs (rotations survive lineup edits)', async () => {
    // Alex is scheduled to come into s0 at 6' but starts nowhere. Placing him
    // as the GK starter must NOT strip that sub - the old Phase-1 guard did,
    // which made rotations unbuildable from the lineup side.
    mockGetPlans.mockResolvedValue({
      existing: {
        ...existingPlan,
        players: [{ id: 'p1', name: 'Alex' }, { id: 'p2', name: 'Sam' }],
        games: [
          {
            ...existingPlan.games[0],
            startingSlots: [],
            subs: [{ id: 'x1', slotId: 's0', timeSeconds: 360, inPlayerId: 'p1' }],
          },
        ],
      },
    });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');

    // The scheduled entry is visible on the field pill before the edit.
    expect(screen.getByRole('button', { name: "6' Alex (#1)" })).toBeInTheDocument();

    // Place Alex as the goalkeeper starter.
    await act(async () => {
      fireEvent.click(screen.getByLabelText('GK: empty'));
    });
    await act(async () => {
      fireEvent.click(
        screen
          .getAllByRole('button', { name: /^Alex/ })
          .find((b) => b.className.includes('rounded-full'))!,
      );
    });

    // The sub survives: the pill still announces Alex coming into s0 at 6'.
    expect(screen.getByRole('button', { name: "6' Alex (#1)" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'GK: Alex' })).toBeInTheDocument();
  });

  it('swaps two players whole-game by tapping one placement then another', async () => {
    mockGetPlans.mockResolvedValue({
      existing: {
        ...existingPlan,
        players: [{ id: 'p1', name: 'Alex' }, { id: 'p2', name: 'Sam' }, { id: 'p3', name: 'Jo' }],
        games: [
          {
            ...existingPlan.games[0],
            // Alex starts GK and is subbed for Sam at 12'; Jo starts s0.
            startingSlots: [
              { slotId: 'gk', playerId: 'p1' },
              { slotId: 's0', playerId: 'p3' },
            ],
            subs: [{ id: 'x1', slotId: 'gk', timeSeconds: 720, inPlayerId: 'p2' }],
          },
        ],
      },
    });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');
    const announcement = () => document.querySelector('[data-announcement-nonce]');

    // Direct manipulation: tap the GK starter segment, then tap Jo's disc.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'GK: Alex' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '#1: Jo' }));
    });

    // Whole-game identity swap: Jo now starts GK (Sam still comes in at 12'),
    // Alex holds s0 for the full game.
    expect(screen.getByRole('button', { name: 'GK: Jo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "12' Sam (GK)" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#1: Alex' })).toBeInTheDocument();
    expect(announcement()).toHaveTextContent('Swapped Alex and Jo');
  });

  it('clears the whole field from the lineup actions', async () => {
    mockGetPlans.mockResolvedValue({
      existing: {
        ...existingPlan,
        players: [{ id: 'p1', name: 'Alex' }, { id: 'p2', name: 'Sam' }],
        games: [
          {
            ...existingPlan.games[0],
            startingSlots: [{ slotId: 'gk', playerId: 'p1' }],
            subs: [{ id: 'x1', slotId: 'gk', timeSeconds: 720, inPlayerId: 'p2' }],
          },
        ],
      },
    });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear field' }));
    });
    // Starter AND the scheduled sub are gone.
    expect(screen.getByRole('button', { name: 'GK: empty' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "12' Sam (GK)" })).not.toBeInTheDocument();
  });

  it('team options carry their binding context, matching New Game creation', async () => {
    // A bare "U10" is ambiguous when a club runs several U10 squads across
    // competitions - the option label must say which context the team lives
    // in, exactly like the New Game team dropdown does.
    mockGetTeams.mockResolvedValue([{ id: 't1', name: 'U10', boundSeasonId: 's1' }]);
    mockGetSeasons.mockResolvedValue([{ id: 's1', name: 'Spring', periodCount: 1, periodDuration: 20 }]);
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Team (optional)')).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'U10 (Spring)' })).toBeInTheDocument();
  });

  it('prefills roster selection and durations from a chosen team, and stamps teamId', async () => {
    mockGetTeams.mockResolvedValue([{ id: 't1', name: 'U10', boundSeasonId: 's1' }]);
    mockGetSeasons.mockResolvedValue([{ id: 's1', name: 'Spring', periodCount: 1, periodDuration: 20 }]);
    mockGetTeamRoster.mockResolvedValue([{ id: 'tp1', name: 'Alex' }]); // only Alex is on the team
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Team (optional)')).toBeInTheDocument());

    // Both players selected by default (freehand).
    expect(screen.getByText('selected', { exact: false }).parentElement?.textContent).toContain('2 / 2');

    // Choose the team (the select currently shows the "No team" option text).
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('No team - all players'), { target: { value: 't1' } });
    });

    // Roster narrows to the team's matching players; durations come from its season.
    await waitFor(() => expect(screen.getByText('selected', { exact: false }).parentElement?.textContent).toContain('1 / 2'));
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
    expect(screen.getByText('selected', { exact: false }).parentElement?.textContent).toContain('2 / 2');

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('No team - all players'), { target: { value: 't1' } });
    });

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith("Could not load that team's roster.", 'error'),
    );
    // Durations are deferred until the roster loads, so nothing half-applied.
    expect(screen.getByText('selected', { exact: false }).parentElement?.textContent).toContain('2 / 2');
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
    await waitFor(() => expect(screen.getByText('selected', { exact: false }).parentElement?.textContent).toContain('1 / 2'));

    // t1's late response must be discarded (selection stays at t2's 1, not 2).
    await act(async () => {
      resolveT1?.();
    });
    await waitFor(() => expect(screen.getByText('selected', { exact: false }).parentElement?.textContent).toContain('1 / 2'));
    expect(screen.getByText('selected', { exact: false }).parentElement?.textContent).not.toContain('2 / 2');
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
    await waitFor(() => expect(screen.getByText('selected', { exact: false }).parentElement?.textContent).toContain('1 / 2'));
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();

    // Deselect: full roster back AND durations revert to the default 12.
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue(/U10/), { target: { value: '' } });
    });
    await waitFor(() => expect(screen.getByText('selected', { exact: false }).parentElement?.textContent).toContain('2 / 2'));
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
      fireEvent.change(screen.getByDisplayValue(/Alpha/), { target: { value: 't2' } });
    });
    await waitFor(() => expect(screen.getByDisplayValue('12')).toBeInTheDocument());
    expect(screen.queryByDisplayValue('20')).not.toBeInTheDocument();
  });

  it('tab strip tracks scroll pixel-for-pixel: partial hide, full hide, reveal', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');

    const scroller = screen.getByTestId('planner-scroll');
    const inner = screen.getByRole('tablist').parentElement!;
    const outer = inner.parentElement!;
    // jsdom has no layout - give the strip a real height.
    Object.defineProperty(inner, 'offsetHeight', { value: 52, configurable: true });

    const scrollTo = async (y: number) => {
      Object.defineProperty(scroller, 'scrollTop', { value: y, configurable: true });
      await act(async () => {
        fireEvent.scroll(scroller);
      });
    };

    // 20px down -> exactly 20px of the strip hidden (follows the finger).
    await scrollTo(20);
    expect(outer.style.height).toBe('32px');
    expect(inner.style.transform).toBe('translateY(-20px)');
    expect(inner).toHaveAttribute('aria-hidden', 'false');

    // Far enough down -> fully hidden (clamped at its own height).
    await scrollTo(200);
    expect(outer.style.height).toBe('0px');
    expect(inner).toHaveAttribute('aria-hidden', 'true');

    // 30px back up -> 30px revealed, same pace.
    await scrollTo(170);
    expect(outer.style.height).toBe('30px');
    expect(inner).toHaveAttribute('aria-hidden', 'false');

    // Back at the top -> always fully shown.
    await scrollTo(0);
    expect(outer.style.height).toBe('52px');
  });

  it('switches to the Minutes tab and back to Games', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await screen.findByLabelText('Game name');

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Minutes' }));
    });
    await waitFor(() => expect(screen.getByText('Playing-time balance')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Games' }));
    });
    await waitFor(() => expect(screen.getByLabelText('Game name')).toBeInTheDocument());
  });

  it('duplicates a plan from the manager 3-dot menu (stays in the manager)', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await screen.findAllByRole('button', { name: /Saved Cup/ });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Plan actions: Saved Cup' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    });

    await waitFor(() =>
      expect(
        mockSavePlan.mock.calls.some((c) => typeof c[0]?.name === 'string' && c[0].name.includes('(copy)')),
      ).toBe(true),
    );
    // Copies start active even off an archived source, and the user stays put.
    expect(mockSavePlan.mock.calls[0][0].archived).toBe(false);
    expect(screen.queryByDisplayValue(/copy/)).not.toBeInTheDocument();
  });

  it('shows an export-specific error toast when export fails', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    const original = URL.createObjectURL;
    URL.createObjectURL = jest.fn(() => {
      throw new Error('blob failed');
    });
    try {
      render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await openPlanTab();
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
    await enterPlan(/Cup A\/B/);
    await openPlanTab();
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

  it('deletes a plan from the manager 3-dot menu (menu + confirm)', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await screen.findAllByRole('button', { name: /Saved Cup/ });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Plan actions: Saved Cup' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    // Confirm dialog names the plan; nothing deleted before confirming.
    expect(mockDeletePlan).not.toHaveBeenCalled();
    mockGetPlans.mockResolvedValue({}); // list refresh after delete finds none
    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    });
    expect(mockDeletePlan).toHaveBeenCalledWith('existing');
    // Last plan gone -> falls through to setup.
    await waitFor(() => expect(screen.getByText('Create plan')).toBeInTheDocument());
  });

  it('persists a pending edit before opening another plan from the manager', async () => {
    const planB = { ...existingPlan, id: 'b', name: 'Plan B' };
    mockGetPlans.mockResolvedValue({ existing: existingPlan, b: planB });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await openPlanTab();
    const nameInput = screen.getByDisplayValue('Saved Cup');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Edited Cup' } });
    });
    // Back to the manager flushes the pending edit before anything reloads.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    });
    await waitFor(() => expect(mockSavePlan).toHaveBeenCalled());
    expect(mockSavePlan.mock.calls[mockSavePlan.mock.calls.length - 1][0].name).toBe('Edited Cup');
    await enterPlan(/Plan B/);
    await openPlanTab();
    await waitFor(() => expect(screen.getByDisplayValue('Plan B')).toBeInTheDocument());
  });

  it('shows a toast when opening a plan that no longer exists', async () => {
    const planB = { ...existingPlan, id: 'b', name: 'Plan B' };
    mockGetPlans.mockResolvedValue({ existing: existingPlan, b: planB });
    mockGetPlan.mockResolvedValue(null); // storage lost it (e.g. another tab)
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan(/Plan B/);
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error'));
  });

  it('lists every plan in the manager and opens the chosen one', async () => {
    const planB = { ...existingPlan, id: 'b', name: 'Plan B' };
    mockGetPlans.mockResolvedValue({ existing: existingPlan, b: planB });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await screen.findAllByRole('button', { name: /Saved Cup/ });
    expect(screen.getAllByRole('button', { name: /Plan B/ }).length).toBeGreaterThan(0);
    await enterPlan(/Plan B/);
    await openPlanTab();
    await waitFor(() => expect(screen.getByDisplayValue('Plan B')).toBeInTheDocument());
  });

  it('shows an error toast when delete fails', async () => {
    mockGetPlans.mockResolvedValue({ existing: existingPlan });
    mockDeletePlan.mockResolvedValue(false);
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await screen.findAllByRole('button', { name: /Saved Cup/ });

    // The 3-dot menu opens the ConfirmationModal; the destructive action runs
    // only after the styled confirm (no native window.confirm anymore).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Plan actions: Saved Cup' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    const confirmButtons = await screen.findAllByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    });

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error'));
  });

  it('archives a plan via the 3-dot menu and lists it only behind Show archived', async () => {
    // Live-mirror storage so refreshPlanList sees the archived flag land.
    let stored: Record<string, unknown> = { existing: existingPlan };
    mockGetPlans.mockImplementation(async () => stored);
    mockSavePlan.mockImplementation(async (plan) => {
      stored = { ...stored, [(plan as { id: string }).id]: plan };
      return plan;
    });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await screen.findAllByRole('button', { name: /Saved Cup/ });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Plan actions: Saved Cup' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    });

    // Archived plans leave the default list; the toggle appears.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Plan actions: Saved Cup' })).not.toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show archived' }));
    });
    expect(screen.getByText('Archived')).toBeInTheDocument();

    // The menu now offers Unarchive; using it restores the plan to the list.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Plan actions: Saved Cup' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unarchive' }));
    });
    await waitFor(() => expect(screen.queryByText('Archived')).not.toBeInTheDocument());
  });

  it('edits games & format after creation: add game, remove-with-confirm, change minutes', async () => {
    const filledGame = {
      ...existingPlan.games[0],
      startingSlots: [{ slotId: 'gk', playerId: 'p1' }],
    };
    mockGetPlans.mockResolvedValue({ existing: { ...existingPlan, games: [filledGame] } });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await openPlanTab();
    await screen.findByDisplayValue('Saved Cup');

    // Add: a second game row appears with the next label.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add game' }));
    });
    expect(screen.getByDisplayValue('Game 2')).toBeInTheDocument();

    // Duration edits apply to every game (summary shows the new minutes);
    // the fields live behind the collapsed Games & format header.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Games & format/ }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Minutes per period'), { target: { value: '20' } });
    });
    expect(screen.getByText(/2×20 min/)).toBeInTheDocument();

    // Remove: Game 2 is empty -> its row trash removes silently. The last
    // remaining game can never be removed.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove game: Game 2' }));
    });
    expect(screen.queryByDisplayValue('Game 2')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove game: Game 1' })).toBeDisabled();
  });

  it('asks before removing a game that has lineup content', async () => {
    const filled = {
      ...existingPlan.games[0],
      id: 'g2',
      label: 'Game 2',
      startingSlots: [{ slotId: 'gk', playerId: 'p1' }],
    };
    mockGetPlans.mockResolvedValue({
      existing: { ...existingPlan, games: [existingPlan.games[0], filled] },
    });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await openPlanTab();
    await screen.findByDisplayValue('Saved Cup');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove game: Game 2' }));
    });
    // Confirm names the game; nothing removed before confirming.
    expect(screen.getByText('Remove Game 2?')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Game 2')).toBeInTheDocument();
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    });
    expect(screen.queryByDisplayValue('Game 2')).not.toBeInTheDocument();
  });

  it('changes the source team after creation: matched players join, impacted ones confirm out', async () => {
    mockGetTeams.mockResolvedValue([{ id: 't1', name: 'Reds' }]);
    mockGetTeamRoster.mockResolvedValue([{ id: 'tp1', name: 'Sam' }]);
    const filledGame = {
      ...existingPlan.games[0],
      startingSlots: [{ slotId: 'gk', playerId: 'p1' }],
    };
    mockGetPlans.mockResolvedValue({ existing: { ...existingPlan, games: [filledGame] } });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await enterPlan();
    await openPlanTab();
    await screen.findByDisplayValue('Saved Cup');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Games & format/ }));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Team (optional)'), { target: { value: 't1' } });
    });
    // Sam (on the team, name-matched to the master roster) joined instantly.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Sam' })).toBeChecked());
    // Alex is not on the team and holds a lineup spot -> impact confirm.
    expect(screen.getByText('Remove player?')).toBeInTheDocument();
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await act(async () => {
      fireEvent.click(removeButtons[removeButtons.length - 1]);
    });
    expect(screen.getByRole('checkbox', { name: 'Alex' })).not.toBeChecked();
  });
});
