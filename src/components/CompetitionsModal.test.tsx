import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompetitionsModal from './CompetitionsModal';
import { UseMutationResult } from '@tanstack/react-query';
import { League, Tournament } from '@/types';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n'; // Your i18n instance
import { getFilteredGames } from '@/utils/savedGames';
import { ToastProvider } from '@/contexts/ToastProvider';

jest.mock('@/utils/savedGames', () => ({
  getFilteredGames: jest.fn().mockResolvedValue([]),
}));

const mockMutation = () => ({
  mutate: jest.fn(),
  isPending: false,
});

const mockGetFilteredGames = getFilteredGames as jest.MockedFunction<typeof getFilteredGames>;

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  seasons: [{ id: 's1', name: 'Season 1' }] as League[],
  tournaments: [{ id: 't1', name: 'Tournament 1' }] as Tournament[],
  masterRoster: [{ id: 'p1', name: 'Test Player', jerseyNumber: '10' }],
  addSeasonMutation: mockMutation() as unknown as UseMutationResult<League | null, Error, { name: string; }>,
  addTournamentMutation: mockMutation() as unknown as UseMutationResult<Tournament | null, Error, { name: string; }>,
  updateSeasonMutation: mockMutation() as unknown as UseMutationResult<League | null, Error, { id: string; name: string; }>,
  deleteSeasonMutation: mockMutation() as unknown as UseMutationResult<boolean, Error, string>,
  updateTournamentMutation: mockMutation() as unknown as UseMutationResult<Tournament | null, Error, { id: string; name: string; }>,
  deleteTournamentMutation: mockMutation() as unknown as UseMutationResult<boolean, Error, string>,
};

const renderWithProviders = (props: Partial<typeof defaultProps> = {}) => {
  return render(
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <CompetitionsModal {...defaultProps} {...props} />
      </ToastProvider>
    </I18nextProvider>
  );
};

describe('CompetitionsModal', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockGetFilteredGames.mockResolvedValue([]);
  });

  it('renders seasons and tournaments lists', async () => {
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});
    expect(screen.getByText('Season 1')).toBeInTheDocument();
    expect(screen.getByText('Tournament 1')).toBeInTheDocument();
  });

  it('allows creating a new season', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});

    const createSeasonButton = screen.getByRole('button', {
      name: i18n.t('seasonTournamentModal.addSeason', 'Add Season'),
    });
    await user.click(createSeasonButton);

    const input = screen.getByPlaceholderText(i18n.t('seasonTournamentModal.newSeasonPlaceholder'));
    await user.type(input, 'New Amazing Season');

    const saveButton = screen.getByTestId('save-new-season-button');
    await user.click(saveButton);

    expect(defaultProps.addSeasonMutation.mutate).toHaveBeenCalledWith({ name: 'New Amazing Season' });
  });

  it('allows creating a new tournament', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});

    const createTournamentButton = screen.getByRole('button', {
      name: i18n.t('seasonTournamentModal.addTournament', 'Add Tournament'),
    });
    await user.click(createTournamentButton);

    const input = screen.getByPlaceholderText(i18n.t('seasonTournamentModal.newTournamentPlaceholder'));
    await user.type(input, 'New Awesome Tournament');

    const saveButton = screen.getByTestId('save-new-tournament-button');
    await user.click(saveButton);

    expect(defaultProps.addTournamentMutation.mutate).toHaveBeenCalledWith({ name: 'New Awesome Tournament' });
  });

  it('opens season details modal when clicking season item', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});

    const seasonItem = screen.getByText('Season 1');
    await user.click(seasonItem);

    // LeagueDetailsModal should open (title should be visible)
    expect(await screen.findByText(i18n.t('seasonDetailsModal.title', 'Season Details'))).toBeInTheDocument();
  });

  it('opens season details modal when clicking edit in actions menu', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});

    const actionsButton = screen.getByLabelText('season actions');
    await user.click(actionsButton);

    const editOption = await screen.findByRole('button', { name: i18n.t('common.edit', 'Edit') });
    await user.click(editOption);

    // LeagueDetailsModal should open
    expect(await screen.findByText(i18n.t('seasonDetailsModal.title', 'Season Details'))).toBeInTheDocument();
  });

  it('opens tournament details modal when clicking tournament item', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});

    const tournamentItem = screen.getByText('Tournament 1');
    await user.click(tournamentItem);

    // TournamentDetailsModal should open (title should be visible)
    expect(await screen.findByText(i18n.t('tournamentDetailsModal.title', 'Tournament Details'))).toBeInTheDocument();
  });

  it('opens tournament details modal when clicking edit in actions menu', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});

    const actionsButton = screen.getByLabelText('tournament actions');
    await user.click(actionsButton);

    const editOption = await screen.findByRole('button', { name: i18n.t('common.edit', 'Edit') });
    await user.click(editOption);

    // TournamentDetailsModal should open
    expect(await screen.findByText(i18n.t('tournamentDetailsModal.title', 'Tournament Details'))).toBeInTheDocument();
  });

  it('allows deleting a season', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});

    const seasonActionsButton = screen.getByLabelText('season actions');
    await user.click(seasonActionsButton);

    const deleteOption = await screen.findByRole('button', { name: i18n.t('common.delete', 'Delete') });
    await user.click(deleteOption);

    // Wait for confirmation modal to appear
    await waitFor(() => {
      expect(screen.getByText(i18n.t('common.confirmDelete'))).toBeInTheDocument();
    });

    // Click confirm button in modal
    const confirmButtons = screen.getAllByRole('button', { name: i18n.t('common.delete', 'Delete') });
    const modalConfirmButton = confirmButtons.find(btn => btn.closest('[role="dialog"]'));
    await user.click(modalConfirmButton!);

    expect(defaultProps.deleteSeasonMutation.mutate).toHaveBeenCalledWith('s1');
  });

  it('allows deleting a tournament', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});

    const tournamentActionsButton = screen.getByLabelText('tournament actions');
    await user.click(tournamentActionsButton);

    const deleteOption = await screen.findByRole('button', { name: i18n.t('common.delete', 'Delete') });
    await user.click(deleteOption);

    // Wait for confirmation modal to appear
    await waitFor(() => {
      expect(screen.getByText(i18n.t('common.confirmDelete'))).toBeInTheDocument();
    });

    // Click confirm button in modal
    const confirmButtons = screen.getAllByRole('button', { name: i18n.t('common.delete', 'Delete') });
    const modalConfirmButton = confirmButtons.find(btn => btn.closest('[role="dialog"]'));
    await user.click(modalConfirmButton!);

    expect(defaultProps.deleteTournamentMutation.mutate).toHaveBeenCalledWith('t1');
  });

  it('filters items by search text', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders({
        seasons: [
          { id: 's1', name: 'Winter Season' },
          { id: 's2', name: 'Summer Season' }
        ],
        tournaments: [
          { id: 't1', name: 'Autumn Cup' }
        ]
      });
    });
    await act(async () => {});

    const searchInput = screen.getByPlaceholderText(i18n.t('seasonTournamentModal.searchPlaceholder'));
    await user.type(searchInput, 'Winter');

    expect(screen.getByText('Winter Season')).toBeInTheDocument();
    expect(screen.queryByText('Summer Season')).toBeNull();
    expect(screen.queryByText('Autumn Cup')).toBeNull();
  });

  it('allows archiving a season', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});

    const seasonActionsButton = screen.getByLabelText('season actions');
    await user.click(seasonActionsButton);

    const archiveOption = await screen.findByRole('button', { name: i18n.t('seasonTournamentModal.archive', 'Archive') });
    await user.click(archiveOption);

    expect(defaultProps.updateSeasonMutation.mutate).toHaveBeenCalledWith({
      id: 's1',
      name: 'Season 1',
      archived: true,
    });
  });

  it('allows unarchiving a season', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders({
        seasons: [{ id: 's1', name: 'Season 1', archived: true }],
      });
    });
    await act(async () => {});

    // Enable show archived to see archived items
    const showArchivedCheckbox = screen.getByLabelText(i18n.t('seasonTournamentModal.showArchived', 'Show Archived'));
    await user.click(showArchivedCheckbox);

    const seasonActionsButton = screen.getByLabelText('season actions');
    await user.click(seasonActionsButton);

    const unarchiveOption = await screen.findByRole('button', { name: i18n.t('seasonTournamentModal.unarchive', 'Unarchive') });
    await user.click(unarchiveOption);

    expect(defaultProps.updateSeasonMutation.mutate).toHaveBeenCalledWith({
      id: 's1',
      name: 'Season 1',
      archived: false,
    });
  });

  it('allows archiving a tournament', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});

    const tournamentActionsButton = screen.getByLabelText('tournament actions');
    await user.click(tournamentActionsButton);

    const archiveOption = await screen.findByRole('button', { name: i18n.t('seasonTournamentModal.archive', 'Archive') });
    await user.click(archiveOption);

    expect(defaultProps.updateTournamentMutation.mutate).toHaveBeenCalledWith({
      id: 't1',
      name: 'Tournament 1',
      archived: true,
    });
  });

  it('allows unarchiving a tournament', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders({
        tournaments: [{ id: 't1', name: 'Tournament 1', archived: true }],
      });
    });
    await act(async () => {});

    // Enable show archived to see archived items
    const showArchivedCheckbox = screen.getByLabelText(i18n.t('seasonTournamentModal.showArchived', 'Show Archived'));
    await user.click(showArchivedCheckbox);

    const tournamentActionsButton = screen.getByLabelText('tournament actions');
    await user.click(tournamentActionsButton);

    const unarchiveOption = await screen.findByRole('button', { name: i18n.t('seasonTournamentModal.unarchive', 'Unarchive') });
    await user.click(unarchiveOption);

    expect(defaultProps.updateTournamentMutation.mutate).toHaveBeenCalledWith({
      id: 't1',
      name: 'Tournament 1',
      archived: false,
    });
  });

  /**
   * Tournament Player Award Tests
   * @critical - Tests player award dropdown selection and display via dedicated modal
   */
  describe('Tournament Player Award Selection', () => {
    it('should open tournament details modal with player award dropdown', async () => {
      const user = userEvent.setup();
      await act(async () => {
        renderWithProviders({
          tournaments: [{ id: 't1', name: 'Championship Cup' }],
          masterRoster: [
            { id: 'p1', name: 'Alice', jerseyNumber: '10' },
            { id: 'p2', name: 'Bob', jerseyNumber: '7' },
          ],
        });
      });
      await act(async () => {});

      // Click tournament to open details modal
      const tournamentItem = screen.getByText('Championship Cup');
      await user.click(tournamentItem);

      // TournamentDetailsModal should open with player award dropdown
      expect(await screen.findByText(i18n.t('tournamentDetailsModal.title', 'Tournament Details'))).toBeInTheDocument();

      const awardDropdown = screen.getByRole('combobox', { name: /select player of tournament/i });
      expect(awardDropdown).toBeInTheDocument();
    });

    it('should open tournament details modal via edit button', async () => {
      const user = userEvent.setup();
      await act(async () => {
        renderWithProviders({
          tournaments: [{ id: 't1', name: 'Championship Cup', awardedPlayerId: 'p1' } as Tournament],
          masterRoster: [{ id: 'p1', name: 'Alice', jerseyNumber: '10' }],
        });
      });
      await act(async () => {});

      // Open actions menu and choose edit
      const actionsButton = screen.getByLabelText('tournament actions');
      await user.click(actionsButton);

      const editOption = await screen.findByRole('button', { name: i18n.t('common.edit', 'Edit') });
      await user.click(editOption);

      // TournamentDetailsModal should open
      expect(await screen.findByText(i18n.t('tournamentDetailsModal.title', 'Tournament Details'))).toBeInTheDocument();

      // Award dropdown should show the current award
      const awardDropdown = screen.getByRole('combobox', { name: /select player of tournament/i });
      expect(awardDropdown).toHaveValue('p1');
    });

    it('should handle deleted player gracefully (no trophy displayed)', async () => {
      await act(async () => {
        renderWithProviders({
          tournaments: [{ id: 't1', name: 'Championship Cup', awardedPlayerId: 'deleted-player' } as Tournament],
          masterRoster: [{ id: 'p1', name: 'Alice', jerseyNumber: '10' }], // deleted-player not in roster
        });
      });
      await act(async () => {});

      // Trophy should not be displayed
      expect(screen.queryByText('🏆')).not.toBeInTheDocument();
    });
  });
});
