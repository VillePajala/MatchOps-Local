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
const mockSavePlan = jest.fn();
const mockDeletePlan = jest.fn();
jest.mock('@/utils/playtimePlanner/storage', () => ({
  getPlans: (...a: unknown[]) => mockGetPlans(...a),
  savePlan: (...a: unknown[]) => mockSavePlan(...a),
  deletePlan: (...a: unknown[]) => mockDeletePlan(...a),
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
