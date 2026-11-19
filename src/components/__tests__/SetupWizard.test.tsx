import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { __resetModalHardwareBackForTests } from '@/hooks/useModalHardwareBack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fs from 'fs';
import path from 'path';
import SetupWizard, { isSetupWizardDone } from '../SetupWizard';
import { getStoredSetupFormat, getStoredSetupAgeGroup, useSetupWizardActive } from '../setupWizardActive';

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

const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

let mockUserId: string | null = 'user-1';
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({ userId: mockUserId }),
}));

const mockAddPlayer = jest.fn();
const mockRemovePlayer = jest.fn();
jest.mock('@/utils/masterRosterManager', () => ({
  addPlayer: (...args: unknown[]) => mockAddPlayer(...args),
  removePlayer: (...args: unknown[]) => mockRemovePlayer(...args),
}));

const mockAddTeam = jest.fn();
const mockSetTeamRoster = jest.fn();
const mockUpdateTeam = jest.fn();
jest.mock('@/utils/teams', () => ({
  addTeam: (...args: unknown[]) => mockAddTeam(...args),
  setTeamRoster: (...args: unknown[]) => mockSetTeamRoster(...args),
  updateTeam: (...args: unknown[]) => mockUpdateTeam(...args),
}));

// The next-game step's creation is unit-tested in services/nextGamePair; here
// the wizard's wiring to it is what matters.
const mockCreateNextGamePair = jest.fn();
jest.mock('@/services/nextGamePair', () => ({
  createNextGamePair: (...args: unknown[]) => mockCreateNextGamePair(...args),
}));
const mockBuildAndPersistNewGame = jest.fn();
jest.mock('@/components/HomePage/utils/newGameHandlers', () => ({
  buildAndPersistNewGame: (...args: unknown[]) => mockBuildAndPersistNewGame(...args),
}));
jest.mock('@/utils/playtimePlanner/storage', () => ({ savePlan: jest.fn(), deletePlan: jest.fn() }));
jest.mock('@/utils/savedGames', () => ({ saveGame: jest.fn() }));
jest.mock('@/utils/appSettings', () => ({ saveCurrentGameIdSetting: jest.fn() }));
// Milestones live in the settings storage (D17); here only that they are recorded.
const mockRecordMilestone = jest.fn().mockResolvedValue(undefined);
jest.mock('@/utils/onboardingMilestones', () => ({
  recordMilestone: (...args: unknown[]) => mockRecordMilestone(...args),
}));
// The plan screen has its own tests (PlanQuickView.test.tsx).
jest.mock('../PlanQuickView', () => ({
  __esModule: true,
  default: ({ planId, gameId, onDone }: { planId: string; gameId: string; onDone: () => void }) => (
    <div data-testid="plan-quick-view-mock">
      {planId}:{gameId}
      <button type="button" onClick={onDone}>
        plan-done
      </button>
    </div>
  ),
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

/** After "Valmis" with players: the next-game step, not Home. */
const expectNextGameStep = async () => {
  expect(await screen.findByTestId('next-game-step')).toBeInTheDocument();
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
  sessionStorage.clear();
  mockUserId = 'user-1';
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
  mockRemovePlayer.mockResolvedValue(true);
  mockUpdateTeam.mockImplementation(async (id: string, updates: { name: string }) => ({
    id,
    name: updates.name,
    createdAt: '',
    updatedAt: '',
  }));
  mockCreateNextGamePair.mockResolvedValue({ gameId: 'game-1', planId: 'plan-1', planGameId: 'pg-1' });
});

describe('SetupWizard', () => {
  /**
   * @critical - The happy path IS the onboarding: name + players in, real
   * entities out (players -> team -> roster), one-time flag set.
   */
  it('creates players, the team, and its roster on Valmis, flags done, then asks for the next game', async () => {
    const { onComplete } = renderWizard();

    toStepTwo('FC Honka P12');
    addPlayerRow('Aino');
    addPlayerRow('Eetu');
    fireEvent.click(screen.getByTestId('wizard-finish'));

    await expectNextGameStep();
    // Not Home yet: the coach is asked about the next game first.
    expect(onComplete).not.toHaveBeenCalled();
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
    // Done already: closing the app on the next step must not bring the wizard back.
    expect(localStorage.getItem(DONE_KEY)).toBe('1');
    expect(isSetupWizardDone('user-1')).toBe(true);
    // No game is created behind the coach's back.
    expect(mockCreateNextGamePair).not.toHaveBeenCalled();
  });

  it('derives the disc nickname from the first word of multi-word names', async () => {
    renderWizard();

    toStepTwo();
    addPlayerRow('Matti Meikalainen');
    addPlayerRow('Aino');
    fireEvent.click(screen.getByTestId('wizard-finish'));

    await expectNextGameStep();
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
    renderWizard();

    toStepTwo();
    addPlayerRow('Aino');
    fireEvent.change(screen.getByTestId('wizard-player-input'), { target: { value: 'Sofia' } });
    fireEvent.click(screen.getByTestId('wizard-finish'));

    await expectNextGameStep();
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
    // The ACCOUNT remembers the skip too (R9), not only this device.
    expect(mockRecordMilestone).toHaveBeenCalledWith('wizardSkipped', 'user-1');
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
    // Nothing to plan without players: no next-game step, no game.
    expect(screen.queryByTestId('next-game-step')).not.toBeInTheDocument();
    expect(mockCreateNextGamePair).not.toHaveBeenCalled();
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
    await expectNextGameStep();
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
   * Review 7.6: a retry used to resume by POSITION. After the coach removed a
   * row in between, the removed player stayed in the roster and team, and the
   * player now at an already-used position was never created.
   * @critical
   */
  it('a retry after removing a row matches the list on screen', async () => {
    // Aino and Eetu are created, then the third row fails.
    mockAddPlayer.mockImplementation(async (data: { name: string }) => {
      if (data.name === 'Liisa' && mockAddPlayer.mock.calls.length === 3) return null;
      return { id: `p-${data.name}`, name: data.name, nickname: '', jerseyNumber: '', notes: '', isGoalie: false, receivedFairPlayCard: false };
    });
    const { onComplete } = renderWizard();
    toStepTwo();
    addPlayerRow('Aino');
    addPlayerRow('Eetu');
    addPlayerRow('Liisa');
    fireEvent.click(screen.getByTestId('wizard-finish'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledTimes(1));

    // The coach removes Aino and tries again.
    fireEvent.click(screen.getByLabelText('Remove Aino'));
    fireEvent.click(screen.getByTestId('wizard-finish'));
    await expectNextGameStep();
    expect(onComplete).not.toHaveBeenCalled();

    expect(mockRemovePlayer).toHaveBeenCalledWith('p-Aino', 'user-1');
    expect(mockAddPlayer.mock.calls.map((c) => (c[0] as { name: string }).name)).toEqual(['Aino', 'Eetu', 'Liisa', 'Liisa']);
    expect(mockSetTeamRoster).toHaveBeenCalledWith(
      'team-1',
      [expect.objectContaining({ id: 'p-Eetu' }), expect.objectContaining({ id: 'p-Liisa' })],
      'user-1',
    );
  });

  it('a failed removal keeps the wizard open, and the retry removes the player', async () => {
    mockAddPlayer.mockImplementation(async (data: { name: string }) =>
      data.name === 'Eetu' && mockAddPlayer.mock.calls.length === 2
        ? null
        : { id: `p-${data.name}`, name: data.name, nickname: '', jerseyNumber: '', notes: '', isGoalie: false, receivedFairPlayCard: false });
    mockRemovePlayer.mockResolvedValueOnce(false);
    const { onComplete } = renderWizard();
    toStepTwo();
    addPlayerRow('Aino');
    addPlayerRow('Eetu');
    fireEvent.click(screen.getByTestId('wizard-finish'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByLabelText('Remove Aino'));
    fireEvent.click(screen.getByTestId('wizard-finish'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledTimes(2));
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('wizard-finish'));
    await expectNextGameStep();
    expect(mockRemovePlayer).toHaveBeenCalledTimes(2);
    expect(mockSetTeamRoster).toHaveBeenCalledWith('team-1', [expect.objectContaining({ id: 'p-Eetu' })], 'user-1');
  });

  /**
   * Review 7.1b: Android can destroy a backgrounded app's page while the coach
   * reads names from another app. The wizard comes back with what was typed.
   * @critical
   */
  describe('survives the page being recreated', () => {
    it('restores the team name, step and player rows', () => {
      const first = renderWizard();
      toStepTwo('FC Draft');
      addPlayerRow('Aino');
      addPlayerRow('Eetu');
      first.unmount(); // the page is gone

      renderWizard();
      expect(screen.getByText('Aino')).toBeInTheDocument();
      expect(screen.getByText('Eetu')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-player-count')).toHaveTextContent('2 players added');
    });

    it('does not create again what a failed finish created before the reload', async () => {
      mockAddPlayer.mockImplementation(async (data: { name: string }) =>
        data.name === 'Eetu' && mockAddPlayer.mock.calls.length === 2
          ? null
          : { id: `p-${data.name}`, name: data.name, nickname: '', jerseyNumber: '', notes: '', isGoalie: false, receivedFairPlayCard: false });
      const first = renderWizard();
      toStepTwo();
      addPlayerRow('Aino');
      addPlayerRow('Eetu');
      fireEvent.click(screen.getByTestId('wizard-finish'));
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledTimes(1)); // Aino created, Eetu failed
      first.unmount();

      renderWizard();
      fireEvent.click(screen.getByTestId('wizard-finish'));
      await expectNextGameStep();
      expect(mockAddPlayer.mock.calls.map((c) => (c[0] as { name: string }).name)).toEqual(['Aino', 'Eetu', 'Eetu']);
      expect(mockSetTeamRoster).toHaveBeenCalledWith(
        'team-1',
        [expect.objectContaining({ id: 'p-Aino' }), expect.objectContaining({ id: 'p-Eetu' })],
        'user-1',
      );
    });

    it('finds the draft when the account id settles after the first render', () => {
      const first = renderWizard();
      toStepTwo('FC Draft');
      addPlayerRow('Aino');
      first.unmount();

      mockUserId = null; // auth still rehydrating on the recreated page
      const { rerender } = renderWizard();
      expect(screen.queryByText('Aino')).not.toBeInTheDocument();
      mockUserId = 'user-1';
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <SetupWizard onComplete={jest.fn()} />
        </QueryClientProvider>,
      );
      expect(screen.getByText('Aino')).toBeInTheDocument();
    });

    it('is gone once the wizard is finished or skipped', async () => {
      const first = renderWizard();
      toStepTwo('FC Draft');
      addPlayerRow('Aino');
      fireEvent.click(screen.getByText("Skip, I'll do this later"));
      first.unmount();
      renderWizard();
      expect(screen.queryByText('Aino')).not.toBeInTheDocument();
      expect(screen.getByTestId('wizard-team-name')).toHaveValue('');
    });
  });

  it('limits the team and player names to what the store accepts', () => {
    renderWizard();
    expect(screen.getByTestId('wizard-team-name')).toHaveAttribute('maxLength', '48');
    toStepTwo();
    // The field takes a whole pasted list; each NAME is capped at 100 when it
    // becomes a row (see the paste tests).
    fireEvent.change(screen.getByTestId('wizard-player-input'), { target: { value: 'x'.repeat(150) } });
    expect((screen.getByTestId('wizard-player-input') as HTMLTextAreaElement).value).toHaveLength(100);
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
   * discoverable twin. Onboarding v3: the last button is just "Valmis"
   * (the count is shown above the rows).
   */
  it('commits rows via the Add button; Valmis is just "Done"', () => {
    renderWizard();
    toStepTwo();

    const input = screen.getByTestId('wizard-player-input');
    expect(screen.getByTestId('wizard-add-player')).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Aino' } });
    fireEvent.click(screen.getByTestId('wizard-add-player'));
    expect(screen.getByText('Aino')).toBeInTheDocument();
    expect(input).toHaveValue('');

    expect(screen.getByTestId('wizard-finish')).toHaveTextContent(/^Done$/);
    expect(screen.getByTestId('wizard-player-count')).toHaveTextContent('1 players added');
  });

  /**
   * @integration - The input stays PINNED at the top and rows grow BELOW it in
   * the order entered (Onboarding v3: a pasted list reads as pasted); the list
   * scrolls itself to the newest row.
   */
  it('renders committed rows below the input, in the order entered', () => {
    renderWizard();
    toStepTwo();
    addPlayerRow('Aino');
    addPlayerRow('Eetu');

    const rows = screen.getAllByTestId('wizard-player-row');
    expect(rows[0]).toHaveTextContent('Aino');
    expect(rows[1]).toHaveTextContent('Eetu');
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
      for (const key of ['playersAdded_one', 'playersAdded_other', 'pastedCount_one', 'pastedCount_other']) {
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

  /**
   * @critical - owner-reported: the wizard is the FIRST screen a new coach
   * sees and it offered no way to change language, so a coach who is not
   * reading Finnish was stuck with it until they finished or skipped. Every
   * other entry point has the switch; this one did not.
   */
  it('lets a new coach switch language before filling anything in', () => {
    const i18nMock = jest.requireMock('@/i18n');
    renderWizard();

    // Mounting must not change the language - the shape that fed the Home
    // render loop. Only a real press does.
    expect(i18nMock.default.changeLanguage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('wizard-lang-en'));
    expect(i18nMock.default.changeLanguage).toHaveBeenCalledWith('en');
    expect(i18nMock.saveLanguagePreference).toHaveBeenCalledWith('en');
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

  /**
   * Swap the function and put the original BACK, rather than spyOn +
   * mockRestore. The suite-wide localStorage is itself a jest.fn with an
   * implementation (setupTests.mjs); spying on a jest.fn and then restoring it
   * leaves a bare mock with NO implementation, so getItem returned undefined
   * for every test after this one in the file. That went unnoticed until a
   * later test actually read a value back.
   */
  it('survives storage failure', () => {
    const original = window.localStorage.getItem;
    window.localStorage.getItem = jest.fn(() => {
      throw new Error('blocked');
    });
    try {
      expect(getStoredSetupFormat('user-1')).toBeNull();
    } finally {
      window.localStorage.getItem = original;
    }
  });

  /**
   * The point of asking is that the answer REACHES a game. Writing it onto the
   * team alone would change nothing a coach can see: nothing reads
   * teams.ageGroup - preferredRulesContext derives from games, and
   * NewGameSetupModal prefills only from a season or tournament.
   * @critical
   */
  describe('age group', () => {
    const pickAge = (value: string) =>
      fireEvent.change(screen.getByTestId('wizard-age-group'), { target: { value } });

    it('stores it per user so new games can default to it', async () => {
      const { onComplete } = renderWizard();
      pickAge('U10');
      toStepTwo('FC Honka P10');
      fireEvent.click(screen.getByTestId('wizard-finish'));
      await waitFor(() => expect(onComplete).toHaveBeenCalled());
      expect(getStoredSetupAgeGroup('user-1')).toBe('U10');
    });

    it('puts it on the team as well', async () => {
      const { onComplete } = renderWizard();
      pickAge('U10');
      toStepTwo('FC Honka P10');
      fireEvent.click(screen.getByTestId('wizard-finish'));
      await waitFor(() => expect(onComplete).toHaveBeenCalled());
      expect(mockAddTeam).toHaveBeenCalledWith(
        { name: 'FC Honka P10', ageGroup: 'U10' },
        'user-1',
      );
    });

    /** Optional means optional: skipping must leave today's behaviour intact. */
    it('sends no age group when the coach skips it', async () => {
      const { onComplete } = renderWizard();
      toStepTwo('FC Honka P12');
      fireEvent.click(screen.getByTestId('wizard-finish'));
      await waitFor(() => expect(onComplete).toHaveBeenCalled());
      expect(mockAddTeam).toHaveBeenCalledWith({ name: 'FC Honka P12' }, 'user-1');
      expect(getStoredSetupAgeGroup('user-1')).toBeNull();
    });

    it('offers every age group the rest of the app knows', () => {
      renderWizard();
      const options = screen.getByTestId('wizard-age-group').querySelectorAll('option');
      // 15 age groups (U7-U21) plus the "not set" entry that makes it optional.
      expect(options).toHaveLength(16);
      expect(options[0]).toHaveValue('');
    });
  });
});
/**
 * Onboarding v3: sport + age group suggest the format, a pasted list becomes
 * rows, and "Valmis" leads to "Milloin seuraava peli?" - the only place the
 * first game (and its one-game plan) is created.
 */
describe('SetupWizard - Onboarding v3', () => {
  const pickAge = (value: string) =>
    fireEvent.change(screen.getByTestId('wizard-age-group'), { target: { value } });
  const pressed = (testId: string) => screen.getByTestId(testId).getAttribute('aria-pressed');

  describe('format suggestion', () => {
    it('offers every format, 3v3 to 11v11', () => {
      renderWizard();
      for (const f of ['3v3', '4v4', '5v5', '8v8', '11v11']) {
        expect(screen.getByTestId(`wizard-format-${f}`)).toBeInTheDocument();
      }
    });

    it('suggests the format from the age group and the sport', () => {
      renderWizard();
      pickAge('U12');
      expect(pressed('wizard-format-8v8')).toBe('true');
      expect(screen.getByTestId('wizard-format-hint')).toHaveTextContent('Suggested for the age group: 8v8');

      fireEvent.click(screen.getByTestId('wizard-sport-futsal'));
      expect(pressed('wizard-format-5v5')).toBe('true');

      pickAge('U9');
      expect(pressed('wizard-format-4v4')).toBe('true');
    });

    it("keeps the coach's own pick when the age group changes afterwards", () => {
      renderWizard();
      fireEvent.click(screen.getByTestId('wizard-format-11v11'));
      pickAge('U8');
      expect(pressed('wizard-format-11v11')).toBe('true');
    });

    it('stores the chosen format and puts futsal on the team', async () => {
      const { onComplete } = renderWizard();
      fireEvent.click(screen.getByTestId('wizard-sport-futsal'));
      pickAge('U9');
      toStepTwo('FC Futsal');
      fireEvent.click(screen.getByTestId('wizard-finish'));
      await waitFor(() => expect(onComplete).toHaveBeenCalled());
      expect(mockAddTeam).toHaveBeenCalledWith({ name: 'FC Futsal', ageGroup: 'U9', gameType: 'futsal' }, 'user-1');
      expect(getStoredSetupFormat('user-1')).toBe('4v4');
    });
  });

  describe('pasting the squad', () => {
    it('turns a pasted numbered list into rows, without the numbers', () => {
      renderWizard();
      toStepTwo();
      fireEvent.paste(screen.getByTestId('wizard-player-input'), {
        clipboardData: { getData: () => '1. Onni\n2. Toivo\n3. Aatos' },
      });
      const rows = screen.getAllByTestId('wizard-player-row');
      expect(rows.map((r) => r.textContent?.replace('×', '').trim())).toEqual(['Onni', 'Toivo', 'Aatos']);
      expect(mockShowToast).toHaveBeenCalledWith('3 players added', 'success');
      expect(screen.getByTestId('wizard-player-input')).toHaveValue('');
    });

    it('leaves a single pasted name in the field', () => {
      renderWizard();
      toStepTwo();
      fireEvent.paste(screen.getByTestId('wizard-player-input'), {
        clipboardData: { getData: () => 'Onni' },
      });
      expect(screen.queryAllByTestId('wizard-player-row')).toHaveLength(0);
    });

    /** Some Android keyboards paste without a paste event: line breaks arrive in onChange. */
    it('splits a list that arrives through onChange with line breaks', () => {
      renderWizard();
      toStepTwo();
      fireEvent.change(screen.getByTestId('wizard-player-input'), { target: { value: '7 Onni\n8 Toivo\n' } });
      expect(screen.getAllByTestId('wizard-player-row')).toHaveLength(2);
      expect(screen.getByText('Onni')).toBeInTheDocument();
      expect(screen.getByText('Toivo')).toBeInTheDocument();
    });

    it('creates the pasted players on Valmis', async () => {
      renderWizard();
      toStepTwo();
      fireEvent.paste(screen.getByTestId('wizard-player-input'), {
        clipboardData: { getData: () => 'Onni, Toivo' },
      });
      fireEvent.click(screen.getByTestId('wizard-finish'));
      await expectNextGameStep();
      expect(mockAddPlayer.mock.calls.map((c) => (c[0] as { name: string }).name)).toEqual(['Onni', 'Toivo']);
    });
  });

  describe('"Milloin seuraava peli?"', () => {
    const toNextGame = async (teamName = 'MePa P12') => {
      fireEvent.change(screen.getByTestId('wizard-team-name'), { target: { value: teamName } });
      pickAge('U12');
      fireEvent.click(screen.getByTestId('wizard-continue'));
      addPlayerRow('Onni');
      addPlayerRow('Toivo');
      fireEvent.click(screen.getByTestId('wizard-finish'));
      await expectNextGameStep();
    };
    const firstDateChip = () =>
      document.querySelector('[data-testid^="next-game-date-2"]') as HTMLButtonElement;

    it('needs a date before it can make the plan', async () => {
      renderWizard();
      await toNextGame();
      expect(screen.getByTestId('next-game-submit')).toBeDisabled();
      fireEvent.click(firstDateChip());
      expect(screen.getByTestId('next-game-submit')).toBeEnabled();
    });

    /** @critical - the first game is created HERE and only here, with its plan. */
    it('creates the game and its plan from what the coach gave, then opens the plan', async () => {
      const { onComplete } = renderWizard();
      await toNextGame();
      fireEvent.click(firstDateChip());
      const date = firstDateChip().getAttribute('data-testid')!.replace('next-game-date-', '');
      fireEvent.change(screen.getByTestId('next-game-opponent'), { target: { value: '  Rantakylän FC ' } });
      fireEvent.click(screen.getByTestId('next-game-submit'));

      expect(await screen.findByTestId('plan-quick-view-mock')).toHaveTextContent('plan-1:game-1');
      expect(mockCreateNextGamePair).toHaveBeenCalledTimes(1);
      const [, pairInput] = mockCreateNextGamePair.mock.calls[0];
      expect(pairInput).toMatchObject({
        team: { id: 'team-1', name: 'FC Test' },
        fieldSize: '8v8',
        gameType: 'soccer',
        ageGroup: 'U12',
        // U12 football: no published time -> the 2 x 15 default (D7).
        numberOfPeriods: 2,
        periodMinutes: 15,
        gameDate: date,
        opponentName: 'Rantakylän FC',
      });
      expect(pairInput.players.map((p: { name: string }) => p.name)).toEqual(['Onni', 'Toivo']);
      expect(mockRecordMilestone).toHaveBeenCalledWith('wizardDone', 'user-1');
      expect(mockRecordMilestone).toHaveBeenCalledWith('firstPlanSeen', 'user-1');
      expect(onComplete).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('plan-done'));
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('uses a neutral opponent name when none is given', async () => {
      renderWizard();
      await toNextGame();
      fireEvent.click(firstDateChip());
      fireEvent.click(screen.getByTestId('next-game-submit'));
      await screen.findByTestId('plan-quick-view-mock');
      expect(mockCreateNextGamePair.mock.calls[0][1].opponentName).toBe('Opponent');
    });

    it('wires game creation through the normal new-game path', async () => {
      mockCreateNextGamePair.mockImplementation(async (deps: { createGame: (r: unknown) => Promise<unknown> }) => {
        await deps.createGame({ marker: 'request' });
        return { gameId: 'game-1', planId: 'plan-1', planGameId: 'pg-1' };
      });
      renderWizard();
      await toNextGame();
      fireEvent.click(firstDateChip());
      fireEvent.click(screen.getByTestId('next-game-submit'));
      await screen.findByTestId('plan-quick-view-mock');
      expect(mockBuildAndPersistNewGame).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', savedGames: {} }),
        { marker: 'request' },
      );
    });

    it('stays on the step with a message when creation fails', async () => {
      mockCreateNextGamePair.mockRejectedValueOnce(new Error('offline'));
      const { onComplete } = renderWizard();
      await toNextGame();
      fireEvent.click(firstDateChip());
      fireEvent.click(screen.getByTestId('next-game-submit'));
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith('Could not create the game - please try again.', 'error'),
      );
      expect(screen.getByTestId('next-game-step')).toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('"Not now" goes Home without creating a game', async () => {
      const { onComplete } = renderWizard();
      await toNextGame();
      fireEvent.click(screen.getByTestId('next-game-skip'));
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(mockCreateNextGamePair).not.toHaveBeenCalled();
    });

    it('offers "Today" first (R13)', async () => {
      renderWizard();
      await toNextGame();
      const chips = screen.getAllByRole('button', { pressed: false }).filter((b) =>
        (b.getAttribute('data-testid') ?? '').startsWith('next-game-date-'),
      );
      expect(chips[0]).toHaveAttribute('data-testid', 'next-game-date-today');
      expect(chips[0]).toHaveTextContent('Today');
    });

    /** @critical R3: an app kill on this step must not lose it */
    it('keeps the open step and its answers on the device until it is left', async () => {
      renderWizard();
      await toNextGame();
      const key = 'matchops_next_game_step_user-1';
      expect(localStorage.getItem(key)).not.toBeNull();
      fireEvent.click(firstDateChip());
      fireEvent.change(screen.getByTestId('next-game-opponent'), { target: { value: 'Rantakylä' } });
      const kept = JSON.parse(localStorage.getItem(key)!);
      expect(kept.gameDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(kept.opponent).toBe('Rantakylä');
      fireEvent.click(screen.getByTestId('next-game-submit'));
      await screen.findByTestId('plan-quick-view-mock');
      expect(localStorage.getItem(key)).toBeNull();
    });

    it('"Not now" forgets the open step', async () => {
      renderWizard();
      await toNextGame();
      fireEvent.click(screen.getByTestId('next-game-skip'));
      expect(localStorage.getItem('matchops_next_game_step_user-1')).toBeNull();
    });
  });

  /** R10: Android/browser back steps back inside the wizard. */
  describe('hardware back', () => {
    let backSpy: jest.SpyInstance;
    beforeEach(() => {
      __resetModalHardwareBackForTests();
      backSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});
    });
    afterEach(() => backSpy.mockRestore());
    const pressBack = () =>
      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

    it('goes from the player list to the team step', async () => {
      renderWizard();
      toStepTwo();
      expect(screen.getByTestId('wizard-player-input')).toBeInTheDocument();
      pressBack();
      await waitFor(() => expect(screen.getByTestId('wizard-team-name')).toBeInTheDocument());
      expect(screen.getByTestId('wizard-team-name')).toHaveValue('FC Test');
    });

    it('goes from the next-game step back to the player list, and Valmis again creates nothing twice', async () => {
      const { onComplete } = renderWizard();
      toStepTwo();
      addPlayerRow('Onni');
      fireEvent.click(screen.getByTestId('wizard-finish'));
      await expectNextGameStep();
      pressBack();
      await waitFor(() => expect(screen.getAllByTestId('wizard-player-row')).toHaveLength(1));
      expect(onComplete).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('wizard-finish'));
      await expectNextGameStep();
      expect(mockAddPlayer).toHaveBeenCalledTimes(1);
      expect(mockAddTeam).toHaveBeenCalledTimes(1);
    });
  });
});
