import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TournamentDetailsModal from './TournamentDetailsModal';
import { UseMutationResult } from '@tanstack/react-query';
import { Tournament, Player } from '@/types';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';

const mockMutation = () => ({
  mutate: jest.fn(),
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
  tournament: mockTournament,
  masterRoster: mockPlayers,
  updateTournamentMutation: mockMutation() as unknown as UseMutationResult<Tournament | null, Error, Tournament, unknown>,
  stats: { games: 8, goals: 24 },
};

const renderWithProviders = (props: Partial<typeof defaultProps> = {}) => {
  return render(
    <I18nextProvider i18n={i18n}>
      <TournamentDetailsModal {...defaultProps} {...props} />
    </I18nextProvider>
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
    expect(screen.getByDisplayValue('#F59E0B')).toBeInTheDocument();
    expect(screen.getByDisplayValue('🏆')).toBeInTheDocument();
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

  it('allows editing all tournament fields including level', async () => {
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

    // Edit level
    const levelSelect = screen.getByDisplayValue('Elite');
    await user.selectOptions(levelSelect, 'Kilpa');

    // Edit notes
    const notesTextarea = screen.getByDisplayValue('Championship tournament');
    await user.clear(notesTextarea);
    await user.type(notesTextarea, 'Updated tournament notes');

    expect(screen.getByDisplayValue('New Arena')).toBeInTheDocument();
    expect(screen.getByDisplayValue('U14')).toBeInTheDocument();
    expect(levelSelect).toHaveValue('Kilpa'); // Check value directly since it's translated
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

    expect(updateMutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 't1',
        name: 'Updated Tournament',
        location: 'Central Arena',
      })
    );
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

    expect(updateMutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 't1',
        awardedPlayerId: 'p2',
      })
    );
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

    expect(updateMutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 't1',
        awardedPlayerId: undefined,
      })
    );
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
    expect(updateMutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        periodCount: undefined,
      })
    );
  });

  it('does not render when tournament is null', () => {
    renderWithProviders({ tournament: null });

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
        <I18nextProvider i18n={i18n}>
          <TournamentDetailsModal
            {...defaultProps}
            tournament={newTournament}
          />
        </I18nextProvider>
      );
    });

    expect(screen.getByDisplayValue('Winter Cup 2024')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ice Rink')).toBeInTheDocument();
    expect(screen.getByDisplayValue('U16')).toBeInTheDocument();

    // Check level select value directly since it's translated
    // Find all selects and locate the one with Harraste value
    const selects = document.querySelectorAll('select');
    const levelSelect = Array.from(selects).find(s => s.value === 'Harraste');
    expect(levelSelect).toBeTruthy();

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
});
