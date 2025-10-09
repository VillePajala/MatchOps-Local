import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SeasonTournamentManagementModal from './SeasonTournamentManagementModal';
import { UseMutationResult } from '@tanstack/react-query';
import { Season, Tournament } from '@/types';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n'; // Your i18n instance

const mockMutation = () => ({
  mutate: jest.fn(),
  isPending: false,
});

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  seasons: [{ id: 's1', name: 'Season 1' }],
  tournaments: [{ id: 't1', name: 'Tournament 1' }],
  masterRoster: [{ id: 'p1', name: 'Test Player', jerseyNumber: '10' }],
  addSeasonMutation: mockMutation() as unknown as UseMutationResult<Season | null, Error, { name: string; }>,
  addTournamentMutation: mockMutation() as unknown as UseMutationResult<Tournament | null, Error, { name: string; }>,
  updateSeasonMutation: mockMutation() as unknown as UseMutationResult<Season | null, Error, { id: string; name: string; }>,
  deleteSeasonMutation: mockMutation() as unknown as UseMutationResult<boolean, Error, string>,
  updateTournamentMutation: mockMutation() as unknown as UseMutationResult<Tournament | null, Error, { id: string; name: string; }>,
  deleteTournamentMutation: mockMutation() as unknown as UseMutationResult<boolean, Error, string>,
};

const renderWithProviders = (props: Partial<typeof defaultProps> = {}) => {
  return render(
    <I18nextProvider i18n={i18n}>
      <SeasonTournamentManagementModal {...defaultProps} {...props} />
    </I18nextProvider>
  );
};

describe('SeasonTournamentManagementModal', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
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

    const createSeasonButton = screen.getByTestId('create-season-button');
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

    const createTournamentButton = screen.getByTestId('create-tournament-button');
    await user.click(createTournamentButton);

    const input = screen.getByPlaceholderText(i18n.t('seasonTournamentModal.newTournamentPlaceholder'));
    await user.type(input, 'New Awesome Tournament');

    const saveButton = screen.getByTestId('save-new-tournament-button');
    await user.click(saveButton);

    expect(defaultProps.addTournamentMutation.mutate).toHaveBeenCalledWith({ name: 'New Awesome Tournament' });
  });

  it('allows editing a season', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});
    
    const editButton = screen.getByRole('button', { name: 'Edit Season 1' });
    await user.click(editButton);

    const input = screen.getByDisplayValue('Season 1');
    await user.clear(input);
    await user.type(input, 'Updated Season Name');

    const saveButton = screen.getByRole('button', { name: 'Save Season 1' });
    await user.click(saveButton);

    expect(defaultProps.updateSeasonMutation.mutate).toHaveBeenCalledWith({ id: 's1', name: 'Updated Season Name' });
  });

  it('allows editing a tournament', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});
    
    const editButton = screen.getByRole('button', { name: 'Edit Tournament 1' });
    await user.click(editButton);

    const input = screen.getByDisplayValue('Tournament 1');
    await user.clear(input);
    await user.type(input, 'Updated Tournament Name');

    const saveButton = screen.getByRole('button', { name: 'Save Tournament 1' });
    await user.click(saveButton);

    expect(defaultProps.updateTournamentMutation.mutate).toHaveBeenCalledWith({ id: 't1', name: 'Updated Tournament Name' });
  });

  it('allows deleting a season', async () => {
    window.confirm = jest.fn(() => true); // Mock window.confirm
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});

    const deleteButton = screen.getByRole('button', { name: 'Delete Season 1' });
    await user.click(deleteButton);

    expect(window.confirm).toHaveBeenCalled();
    expect(defaultProps.deleteSeasonMutation.mutate).toHaveBeenCalledWith('s1');
  });

  it('allows deleting a tournament', async () => {
    window.confirm = jest.fn(() => true); // Mock window.confirm
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});

    const deleteButton = screen.getByRole('button', { name: 'Delete Tournament 1' });
    await user.click(deleteButton);

    expect(window.confirm).toHaveBeenCalled();
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

  /**
   * Tournament Player Award Tests
   * @critical - Tests player award dropdown selection and display
   */
  describe('Tournament Player Award Selection', () => {
    it('should allow selecting a player award when editing tournament', async () => {
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

      // Click edit button for tournament
      const editButton = screen.getByRole('button', { name: 'Edit Championship Cup' });
      await user.click(editButton);

      // Find the player award dropdown (should be visible when editing tournament)
      const awardDropdown = screen.getByRole('combobox', { name: /select player of tournament/i });
      expect(awardDropdown).toBeInTheDocument();

      // Select a player
      await user.selectOptions(awardDropdown, 'p1');

      // Save the tournament
      const saveButton = screen.getByRole('button', { name: 'Save Championship Cup' });
      await user.click(saveButton);

      // Verify the mutation was called with the award ID
      expect(defaultProps.updateTournamentMutation.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 't1',
          awardedPlayerId: 'p1',
        })
      );
    });

    it('should display trophy badge for tournaments with player awards', async () => {
      const user = userEvent.setup();
      await act(async () => {
        renderWithProviders({
          tournaments: [
            { id: 't1', name: 'Spring Cup', awardedPlayerId: 'p1' },
            { id: 't2', name: 'Summer League' }, // No award
          ],
          masterRoster: [{ id: 'p1', name: 'Alice', jerseyNumber: '10' }],
        });
      });
      await act(async () => {});

      // Check for trophy emoji
      expect(screen.getByText('🏆')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('should allow removing player award by selecting empty option', async () => {
      const user = userEvent.setup();
      await act(async () => {
        renderWithProviders({
          tournaments: [{ id: 't1', name: 'Championship Cup', awardedPlayerId: 'p1' }],
          masterRoster: [{ id: 'p1', name: 'Alice', jerseyNumber: '10' }],
        });
      });
      await act(async () => {});

      // Click edit button
      const editButton = screen.getByRole('button', { name: 'Edit Championship Cup' });
      await user.click(editButton);

      // Find the dropdown
      const awardDropdown = screen.getByRole('combobox', { name: /select player of tournament/i });

      // Select empty option (value="")
      await user.selectOptions(awardDropdown, '');

      // Save
      const saveButton = screen.getByRole('button', { name: 'Save Championship Cup' });
      await user.click(saveButton);

      // Verify the mutation was called with undefined awardedPlayerId
      expect(defaultProps.updateTournamentMutation.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 't1',
          awardedPlayerId: undefined,
        })
      );
    });

    it('should handle deleted player gracefully (no trophy displayed)', async () => {
      await act(async () => {
        renderWithProviders({
          tournaments: [{ id: 't1', name: 'Championship Cup', awardedPlayerId: 'deleted-player' }],
          masterRoster: [{ id: 'p1', name: 'Alice', jerseyNumber: '10' }], // deleted-player not in roster
        });
      });
      await act(async () => {});

      // Trophy should not be displayed
      expect(screen.queryByText('🏆')).not.toBeInTheDocument();
    });

    it('should not show player award dropdown when editing season', async () => {
      const user = userEvent.setup();
      await act(async () => {
        renderWithProviders({
          seasons: [{ id: 's1', name: 'Spring Season' }],
        });
      });
      await act(async () => {});

      // Click edit button for season
      const editButton = screen.getByRole('button', { name: 'Edit Spring Season' });
      await user.click(editButton);

      // Player award dropdown should NOT be present for seasons
      const awardDropdown = screen.queryByRole('combobox', { name: /select player of tournament/i });
      expect(awardDropdown).not.toBeInTheDocument();
    });
  });
});