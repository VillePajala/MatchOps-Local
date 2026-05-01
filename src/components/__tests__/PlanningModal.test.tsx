import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.test';
import PlanningModal from '../PlanningModal';
import {
  PLAN_FORMAT_VERSION,
  PLAN_EXPORT_KIND,
} from '@/utils/planExport';
import type { AppState, SavedGamesCollection } from '@/types/game';
import type { PlanningSession } from '@/types';

// Mock the planning-session hooks so the component tree doesn't need a
// real QueryClientProvider. Tests can override the returned data per-case
// via the helpers below.
const mockUsePlanningSessionsQuery = jest.fn();
// The component calls `deleteSession.mutate(id, { onSettled })`. The mock
// simulates a settled mutation by invoking onSettled in a microtask so
// that `waitFor` assertions in the tests resolve correctly.
type MutateCallback = (
  data: boolean | undefined,
  error: Error | null,
  variables: string,
) => void;
const mockDeleteMutate = jest.fn<
  void,
  [string, { onSettled?: MutateCallback }?]
>((id, opts) => {
  // Default: success — true signals the row was deleted on the backend.
  Promise.resolve().then(() => opts?.onSettled?.(true, null, id));
});

// Default mutation return — tests override via mockDeleteMutationReturn.
let mockDeleteMutationReturn: {
  mutate: typeof mockDeleteMutate;
  isPending: boolean;
  error: Error | null;
} = {
  mutate: mockDeleteMutate,
  isPending: false,
  error: null,
};

// Save mutation mock — default resolves with the input as if the backend
// stamped id/createdAt/updatedAt and returned the full session.
const mockSaveMutateAsync = jest.fn(async (vars: Partial<PlanningSession>) => ({
  ...buildSession(),
  ...vars,
  id: vars.id ?? 'planningSession_new',
}));

jest.mock('@/hooks/usePlanningSessionQueries', () => ({
  __esModule: true,
  usePlanningSessionsQuery: (
    opts?: { teamId?: string; enabled?: boolean },
  ) => mockUsePlanningSessionsQuery(opts),
  useDeletePlanningSessionMutation: () => mockDeleteMutationReturn,
  useSavePlanningSessionMutation: () => ({
    mutateAsync: mockSaveMutateAsync,
    isPending: false,
    error: null,
  }),
}));

const setSessions = (sessions: PlanningSession[], isLoading = false) => {
  mockUsePlanningSessionsQuery.mockReturnValue({
    data: sessions,
    isLoading,
    isError: false,
  });
};

const buildSession = (
  overrides: Partial<PlanningSession> = {},
): PlanningSession => ({
  id: 'planningSession_x',
  teamId: 't1',
  name: 'Plan A',
  gameIds: ['g1', 'g2'],
  draft: {
    g1: { startingXI: {}, bench: [], scheduledSubs: [] },
    g2: { startingXI: {}, bench: [], scheduledSubs: [] },
  },
  isActive: false,
  createdAt: '2026-04-30T10:00:00.000Z',
  updatedAt: '2026-04-30T10:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  mockDeleteMutate.mockClear();
  mockSaveMutateAsync.mockClear();
  mockUsePlanningSessionsQuery.mockClear();
  mockDeleteMutationReturn = {
    mutate: mockDeleteMutate,
    isPending: false,
    error: null,
  };
  // Default: empty list, no error. Tests opt in to populated / error
  // cases via setSessions / direct mockReturnValue.
  mockUsePlanningSessionsQuery.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  });
});

// Picker reads only a handful of fields off each saved game; this helper
// builds the minimal shape and casts to AppState so individual tests
// don't need ad-hoc `as never`/`as unknown as AppState` escapes.
type PickerGameFixture = Pick<
  AppState,
  | 'teamId'
  | 'teamName'
  | 'opponentName'
  | 'gameDate'
  | 'numberOfPeriods'
  | 'periodDurationMinutes'
>;
const asSavedGame = (game: PickerGameFixture): AppState => game as AppState;

const validEnvelope = () => ({
  formatVersion: PLAN_FORMAT_VERSION,
  kind: PLAN_EXPORT_KIND,
  savedAt: '2026-04-28T12:00:00.000Z',
  tournament: {
    teamName: 'Pepo U10',
    formationId: '8v8-2-1-2-1-1',
    rosterSize: 11,
    games: [
      {
        id: 'g1',
        label: 'Game 1',
        time: '14:00',
        field: 'A',
        opponent: 'FC Opp',
        numberOfPeriods: 2,
        periodDurationMinutes: 12.5,
        durationMin: 25,
        halfTimeMin: 12.5,
        startingXI: { GK: 'p0', CDM: 'p1' },
        scheduledSubs: [
          { id: 'sub_1', timeSec: 600, role: 'CDM', outPlayer: 'p1', inPlayer: 'p2' },
        ],
      },
    ],
  },
  included: [true],
  currentVersionName: null,
});

const renderModal = (overrides: Partial<React.ComponentProps<typeof PlanningModal>> = {}) => {
  const props = {
    isOpen: true,
    onClose: jest.fn(),
    applyToGame: jest.fn().mockResolvedValue(undefined),
    roster: [],
    ...overrides,
  };
  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <PlanningModal {...props} />
      </I18nextProvider>,
    ),
    props,
  };
};

const fileFromText = (name: string, text: string) =>
  new File([text], name, { type: 'application/json' });

describe('PlanningModal', () => {
  it('renders nothing when closed', () => {
    const { container } = renderModal({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the empty-state message when open with no import yet', () => {
    renderModal();
    expect(
      screen.getByText(
        /No saved planning sessions yet|Ei tallennettuja suunnitelmia/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Import plan from JSON|Tuo suunnitelma JSON-tiedostosta/i,
      }),
    ).toBeInTheDocument();
  });

  it('calls onClose when Done is clicked', () => {
    const { props } = renderModal();
    fireEvent.click(
      screen.getByRole('button', { name: /^Done$|^Valmis$/i }),
    );
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a success summary after a valid file is imported', async () => {
    renderModal();
    const file = fileFromText(
      'plan.json',
      JSON.stringify(validEnvelope()),
    );
    const input = screen.getByTestId(
      'planning-modal-file-input',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText(/Plan imported|Suunnitelma tuotu/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Pepo U10/)).toBeInTheDocument();
    expect(screen.getByText(/8v8-2-1-2-1-1/)).toBeInTheDocument();
  });

  it('shows an error message and field path on invalid envelope', async () => {
    renderModal();
    const bad = JSON.stringify({ ...validEnvelope(), formatVersion: 2 });
    const file = fileFromText('bad.json', bad);
    const input = screen.getByTestId(
      'planning-modal-file-input',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText(/Import failed|Tuonti epäonnistui/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Unsupported formatVersion/i)).toBeInTheDocument();
    // Error path renders inside a separate element matching the path string.
    expect(
      screen.getByText((_, el) => {
        if (!el || !el.textContent) return false;
        const t = el.textContent.trim();
        return /^(at|kohdassa):\s*formatVersion$/.test(t);
      }),
    ).toBeInTheDocument();
  });

  it('shows an error on malformed JSON', async () => {
    renderModal();
    const file = fileFromText('bad.json', '{ not valid json');
    const input = screen.getByTestId(
      'planning-modal-file-input',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText(/Import failed|Tuonti epäonnistui/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/JSON parse error/i)).toBeInTheDocument();
  });

  it('rejects files larger than 1 MB without reading them', async () => {
    renderModal();
    // Build a "large" file via a 2 MB string buffer; the guard short-circuits
    // before FileReader runs, so we don't actually need real bytes parsed.
    const big = new File(['x'.repeat(2 * 1024 * 1024)], 'big.json', {
      type: 'application/json',
    });
    const input = screen.getByTestId(
      'planning-modal-file-input',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [big] } });

    await waitFor(() => {
      expect(
        screen.getByText(/File is too large|Tiedosto on liian suuri/i),
      ).toBeInTheDocument();
    });
  });

  it('shows readError when FileReader errors out', async () => {
    renderModal();
    // Replace FileReader with a mock that synchronously fires onerror.
    const realFileReader = window.FileReader;
    class MockFileReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsText() {
        // Use a microtask so the React state updates happen during act.
        Promise.resolve().then(() => this.onerror?.());
      }
    }
    // @ts-expect-error - test injection
    window.FileReader = MockFileReader;

    try {
      const file = fileFromText('plan.json', '{}');
      const input = screen.getByTestId(
        'planning-modal-file-input',
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to read file|Tiedoston lukeminen/i),
        ).toBeInTheDocument();
      });
    } finally {
      window.FileReader = realFileReader;
    }
  });

  it('shows the New plan button on the list page', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: /New plan|Uusi suunnitelma/i }),
    ).toBeInTheDocument();
  });

  it('navigates to the picker when New plan is clicked, and back to the list on Back', () => {
    renderModal({ savedGames: {} });
    fireEvent.click(
      screen.getByRole('button', { name: /New plan|Uusi suunnitelma/i }),
    );
    expect(screen.getByTestId('planning-game-picker')).toBeInTheDocument();
    // Picker shows empty state when no games are available.
    expect(
      screen.getByText(/No games available|Aktiiviselle joukkueelle ei ole pelejä/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /back|takaisin/i })[0]);
    // Back on the list — New plan button visible again.
    expect(
      screen.getByRole('button', { name: /New plan|Uusi suunnitelma/i }),
    ).toBeInTheDocument();
  });

  it('navigates to the editor when Continue is pressed in the picker', () => {
    // Continue in the picker hands off the selected ids to the editor;
    // the modal stays open until Apply (or the editor's Back goes back
    // to the picker).
    const onClose = jest.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <PlanningModal
          isOpen
          onClose={onClose}
          applyToGame={jest.fn().mockResolvedValue(undefined)}
          roster={[]}
          savedGames={{
            g1: asSavedGame({
              teamId: 'team_a',
              teamName: 'Pepo',
              opponentName: 'Opp',
              gameDate: '2026-04-28',
              numberOfPeriods: 2,
              periodDurationMinutes: 25,
            }),
          }}
          currentTeamId="team_a"
        />
      </I18nextProvider>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /New plan|Uusi suunnitelma/i }),
    );
    expect(screen.getByTestId('planning-game-picker')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: /continue|jatka/i }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('planning-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('planning-game-picker')).not.toBeInTheDocument();
  });

  it('Back from the editor returns to the picker', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <PlanningModal
          isOpen
          onClose={jest.fn()}
          applyToGame={jest.fn().mockResolvedValue(undefined)}
          roster={[]}
          savedGames={{
            g1: asSavedGame({
              teamId: 'team_a',
              teamName: 'Pepo',
              opponentName: 'Opp',
              gameDate: '2026-04-28',
              numberOfPeriods: 2,
              periodDurationMinutes: 25,
            }),
          }}
          currentTeamId="team_a"
        />
      </I18nextProvider>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /New plan|Uusi suunnitelma/i }),
    );
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: /continue|jatka/i }));
    expect(screen.getByTestId('planning-editor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back|takaisin/i }));
    expect(screen.getByTestId('planning-game-picker')).toBeInTheDocument();
  });

  it('passes the active team id to the picker so it filters to that team', () => {
    renderModal({
      currentTeamId: 'team_a',
      savedGames: {
        g1: asSavedGame({
          teamId: 'team_a',
          teamName: 'Pepo',
          opponentName: 'Opp',
          gameDate: '2026-04-28',
          numberOfPeriods: 2,
          periodDurationMinutes: 25,
        }),
        g2: asSavedGame({
          teamId: 'team_b',
          teamName: 'Other',
          opponentName: 'Opp',
          gameDate: '2026-04-28',
          numberOfPeriods: 2,
          periodDurationMinutes: 25,
        }),
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /New plan|Uusi suunnitelma/i }),
    );
    // Only g1 is eligible (team_a); g2 is filtered out.
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('passes currentTeamName to the picker so legacy games match by name', () => {
    // Legacy games saved before the teamId column was assigned still
    // need to be selectable when their teamName matches the active team.
    renderModal({
      currentTeamId: 'team_a',
      currentTeamName: 'Pepo',
      savedGames: {
        modern: asSavedGame({
          teamId: 'team_a',
          teamName: 'Pepo',
          opponentName: 'Opp',
          gameDate: '2026-04-28',
          numberOfPeriods: 2,
          periodDurationMinutes: 25,
        }),
        legacy: asSavedGame({
          teamId: undefined,
          teamName: 'Pepo',
          opponentName: 'Opp',
          gameDate: '2026-04-29',
          numberOfPeriods: 2,
          periodDurationMinutes: 25,
        }),
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /New plan|Uusi suunnitelma/i }),
    );
    // Both modern and legacy match — the legacy game would otherwise
    // be silently excluded.
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('clears import state when Done is clicked, so a re-open starts fresh', async () => {
    const { props, rerender } = renderModal();
    const file = fileFromText('plan.json', JSON.stringify(validEnvelope()));
    const input = screen.getByTestId(
      'planning-modal-file-input',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/Plan imported|Suunnitelma tuotu/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Done$|^Valmis$/i }));
    expect(props.onClose).toHaveBeenCalled();

    // Re-render: empty state again
    rerender(
      <I18nextProvider i18n={i18n}>
        <PlanningModal
          isOpen
          onClose={props.onClose}
          applyToGame={jest.fn().mockResolvedValue(undefined)}
          roster={[]}
        />
      </I18nextProvider>,
    );
    expect(
      screen.getByText(
        /No saved planning sessions yet|Ei tallennettuja suunnitelmia/i,
      ),
    ).toBeInTheDocument();
  });

  describe('saved sessions list', () => {
    it('renders saved sessions on the landing screen', () => {
      setSessions([
        buildSession({ id: 's1', name: 'Default plan' }),
        buildSession({
          id: 's2',
          name: 'Jasper-sick contingency',
          isActive: true,
        }),
      ]);
      renderModal();

      expect(screen.getByTestId('planning-modal-session-list')).toBeInTheDocument();
      expect(screen.getByText('Default plan')).toBeInTheDocument();
      expect(screen.getByText('Jasper-sick contingency')).toBeInTheDocument();
    });

    it('shows the active badge only for sessions with isActive=true', () => {
      setSessions([
        buildSession({ id: 's1', name: 'Inactive plan', isActive: false }),
        buildSession({ id: 's2', name: 'Active plan', isActive: true }),
      ]);
      renderModal();

      const badges = screen.getAllByText(/^Active$|^Aktiivinen$/i);
      expect(badges).toHaveLength(1);
    });

    it('shows the empty-state when the query returns no sessions', () => {
      setSessions([]);
      renderModal();
      expect(
        screen.getByText(
          /No saved planning sessions yet|Ei tallennettuja suunnitelmia/i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('planning-modal-session-list'),
      ).not.toBeInTheDocument();
    });

    it('shows a loading message while sessions are loading', () => {
      mockUsePlanningSessionsQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      });
      renderModal();
      expect(
        screen.getByText(
          /Loading saved plans|Ladataan tallennettuja suunnitelmia/i,
        ),
      ).toBeInTheDocument();
    });

    it('shows an error banner — not empty-state — when the sessions query failed', () => {
      // isError + empty data could naively trigger the "No saved planning
      // sessions yet" copy, which would be misleading on a fetch failure.
      // The user should see a clear error message; full retry UI lands in
      // PR 7c via sessionsQuery.error.
      mockUsePlanningSessionsQuery.mockReturnValue({
        data: [],
        isLoading: false,
        isError: true,
      });
      renderModal();
      expect(
        screen.queryByText(
          /No saved planning sessions yet|Ei tallennettuja suunnitelmia/i,
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId('planning-modal-sessions-error'),
      ).toBeInTheDocument();
    });

    it('hides the session list when the query has errored, even if stale data is present', () => {
      // React Query keeps the last successful `data` while a refetch
      // fails. Without the !isError guard, both the list and the error
      // banner render at the same time and the user sees a list that
      // looks fresh while the banner says "could not load."
      mockUsePlanningSessionsQuery.mockReturnValue({
        data: [buildSession({ id: 's1', name: 'Stale' })],
        isLoading: false,
        isError: true,
      });
      renderModal();
      expect(
        screen.queryByTestId('planning-modal-session-list'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId('planning-modal-sessions-error'),
      ).toBeInTheDocument();
    });

    it('handleNewPlan clears listErrorMessage so the stale banner does not reappear after picker→back→list', async () => {
      // Set up a failed delete so the error banner is visible on the list.
      setSessions([buildSession({ id: 's1', name: 'Will fail' })]);
      mockDeleteMutate.mockImplementationOnce((id, opts) => {
        Promise.resolve().then(() =>
          opts?.onSettled?.(undefined, new Error('storage offline'), id),
        );
      });
      renderModal({ currentTeamId: 't1' });
      fireEvent.click(screen.getByTestId('planning-session-delete-s1'));
      fireEvent.click(
        await screen.findByTestId('planning-session-delete-confirm-s1'),
      );
      await waitFor(() =>
        expect(
          screen.getByTestId('planning-modal-list-error'),
        ).toBeInTheDocument(),
      );

      // Navigate: list → "New plan" (picker) → Back (list).
      fireEvent.click(
        screen.getByRole('button', {
          name: /New plan|Uusi suunnitelma/i,
        }),
      );
      // On picker now; banner element is absent because the whole list
      // block unmounts.
      expect(
        screen.getByTestId('planning-game-picker'),
      ).toBeInTheDocument();
      // Press Back from the picker — returns to the list. The clear
      // inside handleNewPlan is what prevents the stale banner from
      // reappearing here. Without it, this assertion would fail.
      fireEvent.click(
        screen.getByRole('button', {
          name: /^Back$|^Takaisin$/i,
        }),
      );
      expect(
        screen.queryByTestId('planning-modal-list-error'),
      ).not.toBeInTheDocument();
    });

    it('Open button hydrates the editor with the session data (PR 7c reopen)', () => {
      const session = buildSession({
        id: 's1',
        name: 'Default plan',
        gameIds: ['g1'],
        draft: {
          g1: {
            startingXI: { GK: 'p1' },
            bench: ['p2'],
            scheduledSubs: [],
          },
        },
      });
      setSessions([session]);
      renderModal({ currentTeamId: 't1' });

      fireEvent.click(screen.getByTestId('planning-session-open-s1'));

      // Saved-session list disappears; editor mounts.
      expect(
        screen.queryByTestId('planning-modal-session-list'),
      ).not.toBeInTheDocument();
      // Editor's Save button shows "Update plan" because editingSessionId is set.
      // getByTestId fails loudly if the button is absent (better than
      // getAllByText[0] which would TypeError on a missing element).
      expect(screen.getByTestId('planning-editor-save')).toHaveTextContent(
        /Update plan|Päivitä suunnitelma/i,
      );
    });

    it('preserves isActive / appliedAt / createdAt when saving an existing session (Reopen → Save)', async () => {
      const session = buildSession({
        id: 's1',
        name: 'Existing plan',
        gameIds: ['g1'],
        draft: {
          g1: { startingXI: { GK: 'p1' }, bench: [], scheduledSubs: [] },
        },
        isActive: true,
        appliedAt: '2026-04-25T10:00:00.000Z',
        createdAt: '2026-04-20T10:00:00.000Z',
      });
      setSessions([session]);
      const savedGames: SavedGamesCollection = {
        g1: asSavedGame({
          teamId: 't1',
          teamName: 'Pepo U10',
          opponentName: 'Opp',
          gameDate: '2026-04-30',
          numberOfPeriods: 2,
          periodDurationMinutes: 12,
        }),
      };
      renderModal({ currentTeamId: 't1', savedGames });

      // Reopen → click Save (form opens, name pre-filled) → confirm.
      fireEvent.click(screen.getByTestId('planning-session-open-s1'));
      fireEvent.click(screen.getByTestId('planning-editor-save'));
      await act(async () => {
        fireEvent.click(
          screen.getByTestId('planning-editor-save-confirm'),
        );
      });

      // mutateAsync should have been called preserving the metadata
      // fields (the editor only changes name/draft/gameIds/updatedAt).
      expect(mockSaveMutateAsync).toHaveBeenCalledTimes(1);
      const payload = mockSaveMutateAsync.mock.calls[0][0];
      expect(payload).toMatchObject({
        id: 's1',
        isActive: true,
        appliedAt: '2026-04-25T10:00:00.000Z',
        createdAt: '2026-04-20T10:00:00.000Z',
      });
    });

    it('shows the corrupt-session banner when gameIds is empty (not just empty draft map)', () => {
      // Other corrupt path: gameIds is [] entirely. Without the
      // length>0 guard, session.draft[undefined] would silently return
      // undefined and the user would see a blank editor instead of
      // the explicit error.
      const corrupt = buildSession({
        id: 's1',
        name: 'Empty gameIds',
        gameIds: [],
        draft: {},
      });
      setSessions([corrupt]);
      renderModal();
      fireEvent.click(screen.getByTestId('planning-session-open-s1'));
      expect(
        screen.getByTestId('planning-modal-list-error'),
      ).toHaveTextContent(
        /Could not open this plan|Tämän suunnitelman avaaminen epäonnistui/i,
      );
      // Editor did not mount — saved-session list still visible.
      expect(
        screen.getByTestId('planning-modal-session-list'),
      ).toBeInTheDocument();
    });

    it('shows an inline error when Open targets a corrupt session (no draft for first gameId)', () => {
      // Synthesize a corrupt session: gameIds references "g1" but the
      // draft map is empty. Without the inline-error fallback, Open
      // would silently no-op and the user would think the click failed.
      const corrupt = buildSession({
        id: 's1',
        name: 'Corrupt session',
        gameIds: ['g1'],
        draft: {},
      });
      setSessions([corrupt]);
      renderModal();

      fireEvent.click(screen.getByTestId('planning-session-open-s1'));

      // List error banner appears with the corrupt-open copy.
      const banner = screen.getByTestId('planning-modal-list-error');
      expect(banner).toHaveTextContent(
        /Could not open this plan|Tämän suunnitelman avaaminen epäonnistui/i,
      );
      // Editor did NOT mount — saved-session list still rendered.
      expect(
        screen.getByTestId('planning-modal-session-list'),
      ).toBeInTheDocument();
    });

    it('shows an inline error when the delete mutation rejects (PR 7c)', async () => {
      setSessions([buildSession({ id: 's1', name: 'Will fail' })]);
      mockDeleteMutate.mockImplementationOnce((id, opts) => {
        Promise.resolve().then(() =>
          opts?.onSettled?.(undefined, new Error('storage offline'), id),
        );
      });
      renderModal();

      fireEvent.click(screen.getByTestId('planning-session-delete-s1'));
      fireEvent.click(
        await screen.findByTestId('planning-session-delete-confirm-s1'),
      );

      // Failure message appears once the rejection settles.
      expect(
        await screen.findByTestId('planning-modal-list-error'),
      ).toBeInTheDocument();
    });

    it('shows only the loading indicator when isLoading=true even with stale data', () => {
      // Symmetric guard for the loading + stale-data case: React Query
      // can hand back data: [last successful] while isLoading is true on
      // a remount. The list block must not render alongside the loader.
      mockUsePlanningSessionsQuery.mockReturnValue({
        data: [buildSession({ id: 's1', name: 'Stale' })],
        isLoading: true,
        isError: false,
      });
      renderModal();
      expect(
        screen.queryByTestId('planning-modal-session-list'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          /Loading saved plans|Ladataan tallennettuja suunnitelmia/i,
        ),
      ).toBeInTheDocument();
    });

    it('requires a confirm click before calling delete', async () => {
      setSessions([buildSession({ id: 's1', name: 'To delete' })]);
      renderModal();

      // First click on the trash icon flips the row into the confirm state.
      fireEvent.click(screen.getByTestId('planning-session-delete-s1'));
      expect(mockDeleteMutate).not.toHaveBeenCalled();

      const confirm = await screen.findByTestId(
        'planning-session-delete-confirm-s1',
      );
      fireEvent.click(confirm);

      await waitFor(() => {
        // mutate(id, { onSettled }) — second arg is the options object the
        // component passes so the row's pendingDeleteId resets either way.
        expect(mockDeleteMutate).toHaveBeenCalledWith(
          's1',
          expect.objectContaining({ onSettled: expect.any(Function) }),
        );
      });
    });

    it('does not call delete when the user cancels the confirm', async () => {
      setSessions([buildSession({ id: 's1', name: 'Spared' })]);
      renderModal();

      fireEvent.click(screen.getByTestId('planning-session-delete-s1'));
      const cancel = await screen.findByRole('button', {
        name: /^Cancel$|^Peruuta$/i,
      });
      fireEvent.click(cancel);

      // Confirm button gone after cancel; the trash icon is back.
      expect(
        screen.queryByTestId('planning-session-delete-confirm-s1'),
      ).not.toBeInTheDocument();
      expect(mockDeleteMutate).not.toHaveBeenCalled();
    });

    it('disables the confirm button while the delete mutation is pending', async () => {
      // Block double-submit during a slow backend round-trip — without
      // disabled={isPending}, a frustrated tap could fire the mutation
      // multiple times.
      setSessions([buildSession({ id: 's1', name: 'Slow delete' })]);
      mockDeleteMutationReturn = {
        mutate: mockDeleteMutate,
        isPending: true,
        error: null,
      };
      renderModal();
      fireEvent.click(screen.getByTestId('planning-session-delete-s1'));
      const confirm = await screen.findByTestId(
        'planning-session-delete-confirm-s1',
      );
      expect(confirm).toBeDisabled();
    });

    it('clears the pending-delete state even when the mutation rejects', async () => {
      setSessions([buildSession({ id: 's1', name: 'Will fail' })]);
      // Simulate a backend failure: React Query catches the rejection
      // internally and calls `onSettled` with the error. The component must
      // clear pendingDeleteId from onSettled so the row recovers without
      // leaving the user staring at "Confirm delete?".
      mockDeleteMutate.mockImplementationOnce((id, opts) => {
        Promise.resolve().then(() =>
          opts?.onSettled?.(undefined, new Error('storage offline'), id),
        );
      });
      renderModal();

      fireEvent.click(screen.getByTestId('planning-session-delete-s1'));
      const confirm = await screen.findByTestId(
        'planning-session-delete-confirm-s1',
      );
      fireEvent.click(confirm);

      await waitFor(() => {
        expect(mockDeleteMutate).toHaveBeenCalledWith(
          's1',
          expect.objectContaining({ onSettled: expect.any(Function) }),
        );
      });
      // Row recovers — confirm button gone, trash icon back.
      await waitFor(() => {
        expect(
          screen.queryByTestId('planning-session-delete-confirm-s1'),
        ).not.toBeInTheDocument();
      });
      expect(
        screen.getByTestId('planning-session-delete-s1'),
      ).toBeInTheDocument();
    });

    it('passes currentTeamId to the sessions query so the list is team-scoped', () => {
      setSessions([]);
      renderModal({ currentTeamId: 'team_42' });

      // The component calls usePlanningSessionsQuery({ teamId: 'team_42', enabled: true })
      // — verify the teamId arrived intact.
      expect(mockUsePlanningSessionsQuery).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team_42' }),
      );
    });

    it('disables the sessions query while the modal is closed', () => {
      setSessions([]);
      renderModal({ isOpen: false });

      // React's Rules of Hooks force the hook to run on every render —
      // even when isOpen=false (the early-return JSX comes after hooks).
      // So we should always see a call, and it should pass enabled=false.
      expect(mockUsePlanningSessionsQuery).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
    });
  });
});
