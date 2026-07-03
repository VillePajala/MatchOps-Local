import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
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

const roster: Player[] = [
  { id: 'p1', name: 'Alex', isGoalie: false, receivedFairPlayCard: false, jerseyNumber: '1' },
  { id: 'p2', name: 'Sam', isGoalie: false, receivedFairPlayCard: false, jerseyNumber: '2' },
];

jest.mock('@/utils/masterRosterManager', () => ({
  getMasterRoster: jest.fn(async () => roster),
}));

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
  }) => ({
    id: 'plan-1',
    name: opts.name,
    version: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    players: opts.players,
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
    await waitFor(() => expect(screen.getByText('Delete plan')).toBeInTheDocument());
    expect(screen.getByText('New plan')).toBeInTheDocument();
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
    expect(screen.getByText('Delete plan')).toBeInTheDocument();
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
    expect(screen.queryByText('Delete plan')).not.toBeInTheDocument();
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
      fireEvent.click(screen.getByRole('button', { name: 'Alex' }));
    });

    // Back to the plan; the placed count now reflects the assignment.
    await act(async () => {
      fireEvent.click(screen.getByText('Back to plan'));
    });
    await waitFor(() => expect(screen.getByText('1/8 placed')).toBeInTheDocument());
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
      fireEvent.click(screen.getByRole('button', { name: 'Alex' }));
    });

    // Subs editor: choose position (GK) + incoming (Sam), then add.
    const [posSelect, inSelect] = screen.getAllByRole('combobox');
    await act(async () => {
      fireEvent.change(posSelect, { target: { value: 'gk' } });
      fireEvent.change(inSelect, { target: { value: 'p2' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add substitution' }));
    });
    await waitFor(() => expect(screen.getByText(/Sam → GK/)).toBeInTheDocument());

    // Remove it again.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    });
    await waitFor(() => expect(screen.queryByText(/Sam → GK/)).not.toBeInTheDocument());
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
      fireEvent.click(screen.getByText('Back to plan'));
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
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Delete plan')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('Delete plan'));
    });

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error'));
    confirmSpy.mockRestore();
  });
});
