import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import PlaytimePlannerModal from './PlaytimePlannerModal';
import type { Player } from '@/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValueOrOptions?: string | { defaultValue?: string }) =>
      typeof defaultValueOrOptions === 'string'
        ? defaultValueOrOptions
        : defaultValueOrOptions?.defaultValue || '',
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

jest.mock('@/contexts/AuthProvider', () => ({
  useAuth: () => ({ user: null }),
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
    // All players selected by default.
    expect(screen.getByText('{{count}} selected')).toBeInTheDocument();
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

  it('opens straight to the overview when a plan already exists', async () => {
    mockGetPlans.mockResolvedValue({
      existing: {
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
            startingSlots: [],
            subs: [],
          },
        ],
      },
    });
    render(<PlaytimePlannerModal isOpen onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue('Saved Cup')).toBeInTheDocument());
    expect(screen.getByText('Delete plan')).toBeInTheDocument();
  });
});
