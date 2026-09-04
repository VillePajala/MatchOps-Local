import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fs from 'fs';
import path from 'path';
import SetupWizard, { isSetupWizardDone } from '../SetupWizard';
import { getStoredSetupFormat, useSetupWizardActive } from '../setupWizardActive';

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

const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({ userId: 'user-1' }),
}));

const mockAddPlayer = jest.fn();
jest.mock('@/utils/masterRosterManager', () => ({
  addPlayer: (...args: unknown[]) => mockAddPlayer(...args),
}));

const mockAddTeam = jest.fn();
const mockSetTeamRoster = jest.fn();
jest.mock('@/utils/teams', () => ({
  addTeam: (...args: unknown[]) => mockAddTeam(...args),
  setTeamRoster: (...args: unknown[]) => mockSetTeamRoster(...args),
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

const DONE_KEY = 'matchops_setup_wizard_done_user-1';

const renderWizard = () => {
  const onComplete = jest.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SetupWizard onComplete={onComplete} />
    </QueryClientProvider>,
  );
  return { onComplete, ...utils };
};

/** Fill the team name and move to step 2. */
const toStepTwo = (teamName = 'FC Test') => {
  fireEvent.change(screen.getByTestId('wizard-team-name'), { target: { value: teamName } });
  fireEvent.click(screen.getByTestId('wizard-continue'));
};

/** Type a player name and commit it with Enter. */
const addPlayerRow = (name: string) => {
  const input = screen.getByTestId('wizard-player-input');
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockAddPlayer.mockImplementation(async (data: { name: string }) => ({
    id: `p-${data.name}`,
    name: data.name,
    nickname: '',
    jerseyNumber: '',
    notes: '',
    isGoalie: false,
    receivedFairPlayCard: false,
  }));
  mockAddTeam.mockResolvedValue({ id: 'team-1', name: 'FC Test', createdAt: '', updatedAt: '' });
  mockSetTeamRoster.mockResolvedValue(undefined);
});

describe('SetupWizard', () => {
  /**
   * @critical - The happy path IS the onboarding: name + players in, real
   * entities out (players -> team -> roster), one-time flag set.
   */
  it('creates players, the team, and its roster on Valmis, then flags done and completes', async () => {
    const { onComplete } = renderWizard();

    toStepTwo('FC Honka P12');
    addPlayerRow('Aino');
    addPlayerRow('Eetu');
    fireEvent.click(screen.getByTestId('wizard-finish'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(mockAddPlayer).toHaveBeenCalledTimes(2);
    expect(mockAddPlayer).toHaveBeenCalledWith(
      { name: 'Aino', nickname: '', jerseyNumber: '', notes: '' },
      'user-1',
    );
    expect(mockAddTeam).toHaveBeenCalledWith({ name: 'FC Honka P12' }, 'user-1');
    expect(mockSetTeamRoster).toHaveBeenCalledWith(
      'team-1',
      [
        expect.objectContaining({ id: 'p-Aino', name: 'Aino' }),
        expect.objectContaining({ id: 'p-Eetu', name: 'Eetu' }),
      ],
      'user-1',
    );
    expect(localStorage.getItem(DONE_KEY)).toBe('1');
    expect(isSetupWizardDone('user-1')).toBe(true);
  });

  it('derives the disc nickname from the first word of multi-word names', async () => {
    const { onComplete } = renderWizard();

    toStepTwo();
    addPlayerRow('Matti Meikalainen');
    addPlayerRow('Aino');
    fireEvent.click(screen.getByTestId('wizard-finish'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(mockAddPlayer).toHaveBeenCalledWith(
      { name: 'Matti Meikalainen', nickname: 'Matti', jerseyNumber: '', notes: '' },
      'user-1',
    );
    // Single-word names stay nickname-free (no "Aino (Aino)" in the roster).
    expect(mockAddPlayer).toHaveBeenCalledWith(
      { name: 'Aino', nickname: '', jerseyNumber: '', notes: '' },
      'user-1',
    );
  });

  /**
   * @edge-case - A typed-but-unentered name still counts on Valmis: the fast
   * typist must not lose the last row.
   */
  it('includes the pending (un-entered) draft name when finishing', async () => {
    const { onComplete } = renderWizard();

    toStepTwo();
    addPlayerRow('Aino');
    fireEvent.change(screen.getByTestId('wizard-player-input'), { target: { value: 'Sofia' } });
    fireEvent.click(screen.getByTestId('wizard-finish'));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(mockAddPlayer).toHaveBeenCalledTimes(2);
    expect(mockAddPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sofia' }),
      'user-1',
    );
  });

  /**
   * @critical - "Valmis" is the ONLY creator: the quiet skip creates nothing,
   * on either step, but still retires the wizard for this account.
   */
  it('quiet skip creates nothing but marks the wizard done', () => {
    const { onComplete } = renderWizard();

    fireEvent.change(screen.getByTestId('wizard-team-name'), { target: { value: 'FC Typed' } });
    fireEvent.click(screen.getByTestId('wizard-skip'));

    expect(mockAddTeam).not.toHaveBeenCalled();
    expect(mockAddPlayer).not.toHaveBeenCalled();
    expect(mockSetTeamRoster).not.toHaveBeenCalled();
    expect(localStorage.getItem(DONE_KEY)).toBe('1');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  /**
   * @edge-case - Valmis with zero players creates the team only; the coach is
   * never trapped into inventing players.
   */
  it('finishes with the team alone when no players were added', async () => {
    const { onComplete } = renderWizard();

    toStepTwo();
    fireEvent.click(screen.getByTestId('wizard-finish'));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(mockAddTeam).toHaveBeenCalledTimes(1);
    expect(mockAddPlayer).not.toHaveBeenCalled();
    expect(mockSetTeamRoster).not.toHaveBeenCalled();
  });

  /**
   * @critical - Retry safety: a failed save must toast, keep the wizard open,
   * NOT set the done flag - and a retry must not duplicate already-created
   * players.
   */
  it('on failure stays open with a toast, and the retry does not duplicate players', async () => {
    mockAddTeam.mockRejectedValueOnce(new Error('network'));
    const { onComplete } = renderWizard();

    toStepTwo();
    addPlayerRow('Aino');
    fireEvent.click(screen.getByTestId('wizard-finish'));

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledTimes(1));
    expect(onComplete).not.toHaveBeenCalled();
    expect(localStorage.getItem(DONE_KEY)).toBeNull();
    expect(mockAddPlayer).toHaveBeenCalledTimes(1);

    // Retry: the already-created player is NOT re-created.
    fireEvent.click(screen.getByTestId('wizard-finish'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(mockAddPlayer).toHaveBeenCalledTimes(1);
    expect(mockAddTeam).toHaveBeenCalledTimes(2);
    expect(mockSetTeamRoster).toHaveBeenCalledWith(
      'team-1',
      [expect.objectContaining({ id: 'p-Aino' })],
      'user-1',
    );
    expect(localStorage.getItem(DONE_KEY)).toBe('1');
  });

  /**
   * @integration - Step 1 gating and list editing.
   */
  it('gates Jatka on a non-empty team name and supports removing a player row', () => {
    renderWizard();

    expect(screen.getByTestId('wizard-continue')).toBeDisabled();
    toStepTwo('FC Test');

    addPlayerRow('Aino');
    addPlayerRow('Eetu');
    fireEvent.click(screen.getByLabelText('Remove Aino'));
    expect(screen.queryByText('Aino')).not.toBeInTheDocument();
    expect(screen.getByText('Eetu')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-player-count')).toHaveTextContent('1 players added');
  });

  /**
   * @critical - Owner round 1: the visible "+ Add" button is Enter's
   * discoverable twin, and Valmis announces what it will create so a
   * premature tap self-identifies instead of silently finishing.
   */
  it('commits rows via the Add button and announces the count on Valmis', () => {
    renderWizard();
    toStepTwo();

    const input = screen.getByTestId('wizard-player-input');
    expect(screen.getByTestId('wizard-add-player')).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Aino' } });
    fireEvent.click(screen.getByTestId('wizard-add-player'));
    expect(screen.getByText('Aino')).toBeInTheDocument();
    expect(input).toHaveValue('');

    // Valmis self-announces (mocked t interpolates the fallback).
    expect(screen.getByTestId('wizard-finish')).toHaveTextContent('Done (1 players)');
    // Empty roster: plain label.
    fireEvent.click(screen.getByLabelText('Remove Aino'));
    expect(screen.getByTestId('wizard-finish')).toHaveTextContent('Done');
  });

  /**
   * @integration - Owner round 1: the input stays PINNED at the top and rows
   * grow BELOW it newest-first, so old rows (not the input) scroll behind the
   * phone keyboard.
   */
  it('renders committed rows below the input, newest first', () => {
    renderWizard();
    toStepTwo();
    addPlayerRow('Aino');
    addPlayerRow('Eetu');

    const rows = screen.getAllByTestId('wizard-player-row');
    expect(rows[0]).toHaveTextContent('Eetu');
    expect(rows[1]).toHaveTextContent('Aino');
    // Input precedes the rows in the DOM.
    const input = screen.getByTestId('wizard-player-input');
    expect(input.compareDocumentPosition(rows[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /**
   * @integration - Review #725: the plural forms must exist in the REAL locale
   * files (the mocked t above bypasses them, so this guards the JSON itself).
   */
  it('ships i18next plural forms for the count strings in both locales', () => {
    for (const locale of ['en', 'fi']) {
      const file = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'public', 'locales', locale, 'common.json'), 'utf-8'),
      );
      const wizard = file.setupWizard;
      for (const key of ['playersAdded_one', 'playersAdded_other', 'finishWithCount_one', 'finishWithCount_other']) {
        expect(wizard[key]).toEqual(expect.stringContaining('{{count}}'));
      }
    }
  });

  /**
   * @integration - The marketing-consent prompt defers on this store: it must
   * read true exactly while the wizard is mounted.
   */
  it('exposes wizard-active while mounted (for the marketing-prompt deferral)', () => {
    const Probe = () => <span data-testid="probe">{useSetupWizardActive() ? 'on' : 'off'}</span>;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <SetupWizard onComplete={jest.fn()} />
        <Probe />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('on');
    unmount();

    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('off');
  });
});


describe('getStoredSetupFormat (review #742)', () => {
  beforeEach(() => localStorage.clear());

  it('returns the stored valid format for the user', () => {
    localStorage.setItem('matchops_setup_format_user-1', '8v8');
    expect(getStoredSetupFormat('user-1')).toBe('8v8');
  });

  it('rejects corrupted values', () => {
    localStorage.setItem('matchops_setup_format_user-1', '7v7');
    expect(getStoredSetupFormat('user-1')).toBeNull();
  });

  it('returns null while auth is unsettled (undefined userId)', () => {
    localStorage.setItem('matchops_setup_format_local', '5v5');
    expect(getStoredSetupFormat(undefined)).toBeNull();
  });

  it('survives storage failure', () => {
    const spy = jest.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(getStoredSetupFormat('user-1')).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
