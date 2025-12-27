import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TournamentDetailsModal from './TournamentDetailsModal';
import { QueryClient, QueryClientProvider, UseMutationResult } from '@tanstack/react-query';
import { Tournament, Player } from '@/types';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const mockMutation = () => ({
  mutate: jest.fn((data, options) => {
    // Simulate successful mutation by calling onSuccess with the data (non-null)
    if (options?.onSuccess) {
      options.onSuccess(data);
    }
  }),
  isPending: false,
});

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Alice', jerseyNumber: '10' },
  { id: 'p2', name: 'Bob', jerseyNumber: '7' },
  { id: 'p3', name: 'Charlie', jerseyNumber: '5' },
];

const mockTournament: Tournament = {
  id: 't1',
  name: 'Championship Cup 2024',
  location: 'Central Arena',
  ageGroup: 'U12',
  level: 'Elite',
  periodCount: 2,
  periodDuration: 25,
  startDate: '2024-05-01',
  endDate: '2024-05-05',
  notes: 'Championship tournament',
  color: '#F59E0B',
  badge: '🏆',
  awardedPlayerId: 'p1',
  archived: false,
};

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  mode: 'edit' as const,
  tournament: mockTournament,
  masterRoster: mockPlayers,
  updateTournamentMutation: mockMutation() as unknown as UseMutationResult<Tournament | null, Error, Tournament, unknown>,
  stats: { games: 8, goals: 24 },
};

const renderWithProviders = (props: Partial<typeof defaultProps> = {}) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <TournamentDetailsModal {...defaultProps} {...props} />
      </I18nextProvider>
    </QueryClientProvider>
  );
};

describe('TournamentDetailsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders tournament details when open', async () => {
    await act(async () => {
      renderWithProviders();
    });

    expect(screen.getByDisplayValue('Championship Cup 2024')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Central Arena')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Championship tournament')).toBeInTheDocument();
  });

  it('displays statistics when provided', async () => {
    await act(async () => {
      renderWithProviders();
    });

    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    renderWithProviders({ isOpen: false });

    expect(screen.queryByDisplayValue('Championship Cup 2024')).not.toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders({ onClose });
    });

    const cancelButton = screen.getByRole('button', { name: i18n.t('common.cancel', 'Cancel') });
    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows editing tournament name', async () => {
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders();
    });

    const nameInput = screen.getByDisplayValue('Championship Cup 2024');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Tournament Name');

    expect(screen.getByDisplayValue('Updated Tournament Name')).toBeInTheDocument();
  });

  it('allows editing all tournament fields', async () => {
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders();
    });

    // Edit location
    const locationInput = screen.getByDisplayValue('Central Arena');
    await user.clear(locationInput);
    await user.type(locationInput, 'New Arena');

    // Edit age group
    const ageGroupSelect = screen.getByDisplayValue('U12');
    await user.selectOptions(ageGroupSelect, 'U14');

    // Edit notes
    const notesTextarea = screen.getByDisplayValue('Championship tournament');
    await user.clear(notesTextarea);
    await user.type(notesTextarea, 'Updated tournament notes');

    expect(screen.getByDisplayValue('New Arena')).toBeInTheDocument();
    expect(screen.getByDisplayValue('U14')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Updated tournament notes')).toBeInTheDocument();
  });

  it('displays player of tournament dropdown with all players', async () => {
    await act(async () => {
      renderWithProviders();
    });

    const awardDropdown = screen.getByRole('combobox', { name: /select player of tournament/i });
    expect(awardDropdown).toBeInTheDocument();

    // Should have the awarded player selected
    expect(awardDropdown).toHaveValue('p1');

    // Check that all players are in the dropdown (find options within the select element)
    const options = awardDropdown.querySelectorAll('option');
    expect(options.length).toBe(4); // 1 empty option + 3 players
  });

  it('allows changing the awarded player', async () => {
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders();
    });

    const awardDropdown = screen.getByRole('combobox', { name: /select player of tournament/i });

    // Change to Bob
    await user.selectOptions(awardDropdown, 'p2');
    expect(awardDropdown).toHaveValue('p2');
  });

  it('allows removing the awarded player by selecting empty option', async () => {
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders();
    });

    const awardDropdown = screen.getByRole('combobox', { name: /select player of tournament/i });

    // Change to empty
    await user.selectOptions(awardDropdown, '');
    expect(awardDropdown).toHaveValue('');
  });

  it('saves changes when Save button is clicked', async () => {
    const updateMutation = mockMutation();
    const onClose = jest.fn();
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders({
        updateTournamentMutation: updateMutation as unknown as UseMutationResult<Tournament | null, Error, Tournament, unknown>,
        onClose,
      });
    });

    // Edit the name
    const nameInput = screen.getByDisplayValue('Championship Cup 2024');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Tournament');

    // Click save
    const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
    await user.click(saveButton);

    expect(updateMutation.mutate).toHaveBeenCalled();
    const [[firstArg]] = (updateMutation.mutate as jest.Mock).mock.calls;
    expect(firstArg).toMatchObject({
      id: 't1',
      name: 'Updated Tournament',
      location: 'Central Arena',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('saves awarded player changes', async () => {
    const updateMutation = mockMutation();
    const onClose = jest.fn();
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders({
        updateTournamentMutation: updateMutation as unknown as UseMutationResult<Tournament | null, Error, Tournament, unknown>,
        onClose,
      });
    });

    // Change awarded player
    const awardDropdown = screen.getByRole('combobox', { name: /select player of tournament/i });
    await user.selectOptions(awardDropdown, 'p2');

    // Click save
    const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
    await user.click(saveButton);

    expect(updateMutation.mutate).toHaveBeenCalled();
    const [[firstArg]] = (updateMutation.mutate as jest.Mock).mock.calls;
    expect(firstArg).toMatchObject({
      id: 't1',
      awardedPlayerId: 'p2',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('saves undefined awardedPlayerId when empty option selected', async () => {
    const updateMutation = mockMutation();
    const onClose = jest.fn();
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders({
        updateTournamentMutation: updateMutation as unknown as UseMutationResult<Tournament | null, Error, Tournament, unknown>,
        onClose,
      });
    });

    // Remove awarded player
    const awardDropdown = screen.getByRole('combobox', { name: /select player of tournament/i });
    await user.selectOptions(awardDropdown, '');

    // Click save
    const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
    await user.click(saveButton);

    expect(updateMutation.mutate).toHaveBeenCalled();
    const [[firstArg]] = (updateMutation.mutate as jest.Mock).mock.calls;
    expect(firstArg).toMatchObject({
      id: 't1',
      awardedPlayerId: undefined,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables Save button when name is empty', async () => {
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders();
    });

    const nameInput = screen.getByDisplayValue('Championship Cup 2024');
    await user.clear(nameInput);

    const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
    expect(saveButton).toBeDisabled();
  });

  it('handles archived checkbox toggle', async () => {
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders();
    });

    const archivedCheckbox = screen.getByRole('checkbox', { name: i18n.t('tournamentDetailsModal.archivedLabel', 'Archived') });
    expect(archivedCheckbox).not.toBeChecked();

    await user.click(archivedCheckbox);
    expect(archivedCheckbox).toBeChecked();
  });

  it('handles date inputs correctly', async () => {
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders();
    });

    const startDateInput = screen.getByDisplayValue('2024-05-01');
    await user.clear(startDateInput);
    await user.type(startDateInput, '2024-06-01');

    const endDateInput = screen.getByDisplayValue('2024-05-05');
    await user.clear(endDateInput);
    await user.type(endDateInput, '2024-06-05');

    expect(screen.getByDisplayValue('2024-06-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2024-06-05')).toBeInTheDocument();
  });

  it('sanitizes period values when saving', async () => {
    const updateMutation = mockMutation();
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders({
        updateTournamentMutation: updateMutation as unknown as UseMutationResult<Tournament | null, Error, Tournament, unknown>,
      });
    });

    // Set invalid period count (not 1 or 2)
    const periodCountInput = screen.getByDisplayValue('2');
    await user.clear(periodCountInput);
    await user.type(periodCountInput, '5');

    // Click save
    const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
    await user.click(saveButton);

    // Period count should be sanitized to undefined (invalid value)
    expect(updateMutation.mutate).toHaveBeenCalled();
    const [[firstArg]] = (updateMutation.mutate as jest.Mock).mock.calls;
    expect(firstArg).toMatchObject({
      periodCount: undefined,
    });
  });

  it('does not render when tournament is null', () => {
    renderWithProviders({ tournament: undefined });

    expect(screen.queryByDisplayValue('Championship Cup 2024')).not.toBeInTheDocument();
  });

  it('initializes form with tournament data when tournament changes', async () => {
    const { rerender } = renderWithProviders();

    const newTournament: Tournament = {
      id: 't2',
      name: 'Winter Cup 2024',
      location: 'Ice Rink',
      ageGroup: 'U16',
      level: 'Harraste',
      periodCount: 1,
      periodDuration: 30,
      awardedPlayerId: 'p3',
      archived: true,
    };

    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <TournamentDetailsModal
              {...defaultProps}
              tournament={newTournament}
            />
          </I18nextProvider>
        </QueryClientProvider>
      );
    });

    expect(screen.getByDisplayValue('Winter Cup 2024')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ice Rink')).toBeInTheDocument();
    expect(screen.getByDisplayValue('U16')).toBeInTheDocument();

    // Legacy level should be migrated to series and displayed (translated)
    expect(screen.getByText('Recreational')).toBeInTheDocument(); // Harraste -> Recreational

    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();

    const awardDropdown = screen.getByRole('combobox', { name: /select player of tournament/i });
    expect(awardDropdown).toHaveValue('p3');
  });

  it('handles tournaments without awarded player', async () => {
    const tournamentWithoutAward: Tournament = {
      ...mockTournament,
      awardedPlayerId: undefined,
    };

    await act(async () => {
      renderWithProviders({ tournament: tournamentWithoutAward });
    });

    const awardDropdown = screen.getByRole('combobox', { name: /select player of tournament/i });
    expect(awardDropdown).toHaveValue('');
  });

  describe('Tournament Series Management', () => {
    it('displays existing series when editing tournament with series', async () => {
      const tournamentWithSeries: Tournament = {
        ...mockTournament,
        series: [
          { id: 'series_1', level: 'Elite' },
          { id: 'series_2', level: 'Kilpa' },
        ],
      };

      await act(async () => {
        renderWithProviders({ tournament: tournamentWithSeries });
      });

      // Should display both series levels (using translated text)
      expect(screen.getByText('Elite')).toBeInTheDocument();
      expect(screen.getByText('Competition')).toBeInTheDocument(); // 'Kilpa' translates to 'Competition' in EN
    });

    it('allows adding a new series to the tournament', async () => {
      const user = userEvent.setup();
      const tournamentWithSeries: Tournament = {
        ...mockTournament,
        series: [{ id: 'series_1', level: 'Elite' }],
      };

      await act(async () => {
        renderWithProviders({ tournament: tournamentWithSeries });
      });

      // Click add series button
      const addButton = screen.getByRole('button', { name: /add series/i });
      await user.click(addButton);

      // Select a level for the new series (using raw value, not translated)
      const levelSelect = screen.getByRole('combobox', { name: /select level for new series/i });
      await user.selectOptions(levelSelect, 'Kilpa');

      // Confirm adding the series (look for Add button by aria-label)
      const confirmButton = screen.getByRole('button', { name: /confirm add series/i });
      await user.click(confirmButton);

      // Should now show both series (translated)
      expect(screen.getByText('Elite')).toBeInTheDocument();
      expect(screen.getByText('Competition')).toBeInTheDocument();
    });

    it('allows removing a series from the tournament', async () => {
      const user = userEvent.setup();
      const tournamentWithSeries: Tournament = {
        ...mockTournament,
        series: [
          { id: 'series_1', level: 'Elite' },
          { id: 'series_2', level: 'Kilpa' },
        ],
      };

      await act(async () => {
        renderWithProviders({ tournament: tournamentWithSeries });
      });

      // Find and click remove button for Kilpa series
      const removeButtons = screen.getAllByRole('button', { name: /remove series/i });
      await user.click(removeButtons[1]); // Remove second series (Kilpa)

      // Should only show Elite now
      expect(screen.getByText('Elite')).toBeInTheDocument();
      expect(screen.queryByText('Competition')).not.toBeInTheDocument();
    });

    it('saves series array when saving tournament', async () => {
      const updateMutation = mockMutation();
      const user = userEvent.setup();
      const tournamentWithSeries: Tournament = {
        ...mockTournament,
        series: [
          { id: 'series_1', level: 'Elite' },
          { id: 'series_2', level: 'Kilpa' },
        ],
      };

      await act(async () => {
        renderWithProviders({
          tournament: tournamentWithSeries,
          updateTournamentMutation: updateMutation as unknown as UseMutationResult<Tournament | null, Error, Tournament, unknown>,
        });
      });

      // Click save
      const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
      await user.click(saveButton);

      expect(updateMutation.mutate).toHaveBeenCalled();
      const [[firstArg]] = (updateMutation.mutate as jest.Mock).mock.calls;
      expect(firstArg.series).toEqual([
        { id: 'series_1', level: 'Elite' },
        { id: 'series_2', level: 'Kilpa' },
      ]);
    });

    it('prevents adding duplicate series levels', async () => {
      const user = userEvent.setup();
      const tournamentWithSeries: Tournament = {
        ...mockTournament,
        series: [{ id: 'series_1', level: 'Elite' }],
      };

      await act(async () => {
        renderWithProviders({ tournament: tournamentWithSeries });
      });

      // Click add series button
      const addButton = screen.getByRole('button', { name: /add series/i });
      await user.click(addButton);

      // Elite should be disabled or not available since it already exists
      const levelSelect = screen.getByRole('combobox', { name: /select level for new series/i });
      const eliteOption = levelSelect.querySelector('option[value="Elite"]') as HTMLOptionElement;
      expect(eliteOption.disabled).toBe(true);
    });

    it('migrates legacy level to series on edit mode load', async () => {
      // Tournament with legacy level but no series
      const legacyTournament: Tournament = {
        id: 't_legacy',
        name: 'Legacy Tournament',
        level: 'Harraste',
      };

      await act(async () => {
        renderWithProviders({ tournament: legacyTournament });
      });

      // Should display the migrated series (translated: Harraste -> Recreational)
      expect(screen.getByText('Recreational')).toBeInTheDocument();
    });
  });

  describe('Game Type Handling', () => {
    it('defaults to soccer game type for new tournaments', async () => {
      const addMutation = mockMutation();
      const user = userEvent.setup();

      await act(async () => {
        render(
          <QueryClientProvider client={queryClient}>
            <I18nextProvider i18n={i18n}>
              <TournamentDetailsModal
                isOpen={true}
                onClose={jest.fn()}
                mode="create"
                tournament={undefined}
                masterRoster={mockPlayers}
                addTournamentMutation={addMutation as unknown as UseMutationResult<Tournament | null, Error, Partial<Tournament> & { name: string }, unknown>}
              />
            </I18nextProvider>
          </QueryClientProvider>
        );
      });

      // Soccer button should be selected by default (has indigo background)
      const soccerButton = screen.getByRole('button', { name: i18n.t('common.gameTypeSoccer', 'Soccer') });
      expect(soccerButton).toHaveClass('bg-indigo-600');

      // Enter required name
      const nameInput = screen.getByPlaceholderText(i18n.t('tournamentDetailsModal.namePlaceholder', 'e.g., Nordic Cup 2024'));
      await user.type(nameInput, 'Test Tournament');

      // Click create (not save - button text is "Create" in create mode)
      const createButton = screen.getByRole('button', { name: i18n.t('common.create', 'Create') });
      await user.click(createButton);

      // Should save with soccer as default
      expect(addMutation.mutate).toHaveBeenCalled();
      const [[firstArg]] = (addMutation.mutate as jest.Mock).mock.calls;
      expect(firstArg).toMatchObject({
        gameType: 'soccer',
      });
    });

    it('saves tournament with futsal game type when selected', async () => {
      const updateMutation = mockMutation();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          updateTournamentMutation: updateMutation as unknown as UseMutationResult<Tournament | null, Error, Tournament, unknown>,
        });
      });

      // Click futsal button
      const futsalButton = screen.getByRole('button', { name: i18n.t('common.gameTypeFutsal', 'Futsal') });
      await user.click(futsalButton);

      // Futsal button should now be selected
      expect(futsalButton).toHaveClass('bg-indigo-600');

      // Click save
      const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
      await user.click(saveButton);

      // Verify mutation called with gameType: 'futsal'
      expect(updateMutation.mutate).toHaveBeenCalled();
      const [[firstArg]] = (updateMutation.mutate as jest.Mock).mock.calls;
      expect(firstArg).toMatchObject({
        gameType: 'futsal',
      });
    });

    it('loads tournament with existing futsal gameType and shows futsal selected', async () => {
      const tournamentWithFutsal: Tournament = {
        ...mockTournament,
        gameType: 'futsal',
      };

      await act(async () => {
        renderWithProviders({ tournament: tournamentWithFutsal });
      });

      // Futsal button should be selected (has indigo background)
      const futsalButton = screen.getByRole('button', { name: i18n.t('common.gameTypeFutsal', 'Futsal') });
      expect(futsalButton).toHaveClass('bg-indigo-600');

      // Soccer button should NOT be selected
      const soccerButton = screen.getByRole('button', { name: i18n.t('common.gameTypeSoccer', 'Soccer') });
      expect(soccerButton).not.toHaveClass('bg-indigo-600');
    });

    it('loads tournament with existing soccer gameType and shows soccer selected', async () => {
      const tournamentWithSoccer: Tournament = {
        ...mockTournament,
        gameType: 'soccer',
      };

      await act(async () => {
        renderWithProviders({ tournament: tournamentWithSoccer });
      });

      // Soccer button should be selected (has indigo background)
      const soccerButton = screen.getByRole('button', { name: i18n.t('common.gameTypeSoccer', 'Soccer') });
      expect(soccerButton).toHaveClass('bg-indigo-600');

      // Futsal button should NOT be selected
      const futsalButton = screen.getByRole('button', { name: i18n.t('common.gameTypeFutsal', 'Futsal') });
      expect(futsalButton).not.toHaveClass('bg-indigo-600');
    });

    it('defaults to soccer when editing tournament without gameType set', async () => {
      // Tournament without gameType (legacy data)
      const legacyTournament: Tournament = {
        ...mockTournament,
        gameType: undefined,
      };

      await act(async () => {
        renderWithProviders({ tournament: legacyTournament });
      });

      // Soccer should be selected by default for legacy data
      const soccerButton = screen.getByRole('button', { name: i18n.t('common.gameTypeSoccer', 'Soccer') });
      expect(soccerButton).toHaveClass('bg-indigo-600');
    });

    it('allows switching between soccer and futsal', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const soccerButton = screen.getByRole('button', { name: i18n.t('common.gameTypeSoccer', 'Soccer') });
      const futsalButton = screen.getByRole('button', { name: i18n.t('common.gameTypeFutsal', 'Futsal') });

      // Initially soccer is selected (default)
      expect(soccerButton).toHaveClass('bg-indigo-600');
      expect(futsalButton).not.toHaveClass('bg-indigo-600');

      // Click futsal
      await user.click(futsalButton);
      expect(futsalButton).toHaveClass('bg-indigo-600');
      expect(soccerButton).not.toHaveClass('bg-indigo-600');

      // Click soccer again
      await user.click(soccerButton);
      expect(soccerButton).toHaveClass('bg-indigo-600');
      expect(futsalButton).not.toHaveClass('bg-indigo-600');
    });
  });
});
