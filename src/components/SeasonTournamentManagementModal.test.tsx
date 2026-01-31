import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SeasonTournamentManagementModal from './SeasonTournamentManagementModal';
import { UseMutationResult } from '@tanstack/react-query';
import { Season, Tournament } from '@/types';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n'; // Your i18n instance
import { getFilteredGames } from '@/utils/savedGames';
import { ToastProvider } from '@/contexts/ToastProvider';
import { PremiumProvider } from '@/contexts/PremiumContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createTestQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

jest.mock('@/utils/savedGames', () => ({
  getFilteredGames: jest.fn().mockResolvedValue([]),
}));

// Mock usePremium to avoid "Upgrade prompt handler not registered" warnings
jest.mock('@/hooks/usePremium', () => ({
  usePremium: () => ({
    isPremium: false,
    isLoading: false,
    hasLimits: true,
    grantPremiumAccess: jest.fn(),
    revokePremiumAccess: jest.fn(),
    PREMIUM_PRICE: '€ 4,99/kk',
  }),
  useResourceLimit: () => ({
    canAdd: true,
    remaining: 10,
    limit: 10,
    current: 0,
    checkAndPrompt: jest.fn().mockReturnValue(true),
  }),
}));

// Mock useDataStore for user-scoped storage
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({
    userId: 'test-user-123',
    getStore: jest.fn(),
    isUserScoped: true,
  }),
}));

const mockMutation = () => ({
  mutate: jest.fn(),
  isPending: false,
});

const mockGetFilteredGames = getFilteredGames as jest.MockedFunction<typeof getFilteredGames>;

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  seasons: [{ id: 's1', name: 'Season 1' }] as Season[],
  tournaments: [{ id: 't1', name: 'Tournament 1' }] as Tournament[],
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
    <QueryClientProvider client={createTestQueryClient()}>
      <PremiumProvider>
        <I18nextProvider i18n={i18n}>
          <ToastProvider>
            <SeasonTournamentManagementModal {...defaultProps} {...props} />
          </ToastProvider>
        </I18nextProvider>
      </PremiumProvider>
    </QueryClientProvider>
  );
};

describe('SeasonTournamentManagementModal', () => {
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

    // Now a modal should open - find the input in the modal
    await waitFor(() => {
      expect(screen.getByText('Create Season')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Enter season name/i);
    await user.type(input, 'New Amazing Season');

    // Find and click the Create button in the modal
    const saveButtons = screen.getAllByRole('button', { name: /Create/i });
    const createButton = saveButtons.find(btn => btn.textContent === 'Create');
    if (!createButton) throw new Error('Create button not found');
    await user.click(createButton);

    expect(defaultProps.addSeasonMutation.mutate).toHaveBeenCalled();
    const [[firstArg]] = (defaultProps.addSeasonMutation.mutate as jest.Mock).mock.calls;
    expect(firstArg).toMatchObject({ name: 'New Amazing Season' });
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

    // Now a modal should open - find the input in the modal
    await waitFor(() => {
      expect(screen.getByText('Create Tournament')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Enter tournament name/i);
    await user.type(input, 'New Awesome Tournament');

    // Find and click the Create button in the modal
    const saveButtons = screen.getAllByRole('button', { name: /Create/i });
    const createButton = saveButtons.find(btn => btn.textContent === 'Create');
    if (!createButton) throw new Error('Create button not found');
    await user.click(createButton);

    expect(defaultProps.addTournamentMutation.mutate).toHaveBeenCalled();
    const [[firstArg]] = (defaultProps.addTournamentMutation.mutate as jest.Mock).mock.calls;
    expect(firstArg).toMatchObject({ name: 'New Awesome Tournament' });
  });

  it('opens season details modal when clicking season item', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders();
    });
    await act(async () => {});

    const seasonItem = screen.getByText('Season 1');
    await user.click(seasonItem);

    // SeasonDetailsModal should open (title shows the season name)
    expect(await screen.findByRole('heading', { name: 'Season 1' })).toBeInTheDocument();
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

    // SeasonDetailsModal should open (title shows the season name)
    expect(await screen.findByRole('heading', { name: 'Season 1' })).toBeInTheDocument();
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
    expect(await screen.findByRole('heading', { name: 'Tournament 1' })).toBeInTheDocument();
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
    expect(await screen.findByRole('heading', { name: 'Tournament 1' })).toBeInTheDocument();
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

      // TournamentDetailsModal should open with player award dropdown (shows tournament name)
      expect(await screen.findByRole('heading', { name: 'Championship Cup' })).toBeInTheDocument();

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

      // TournamentDetailsModal should open (shows tournament name)
      expect(await screen.findByRole('heading', { name: 'Championship Cup' })).toBeInTheDocument();

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

/**
 * Premium limit enforcement tests for SeasonTournamentManagementModal
 * @critical - Tests that free users are blocked when hitting season/tournament limits
 */
describe('SeasonTournamentManagementModal - Premium Limit Enforcement', () => {
  let mockSeasonCheckAndPrompt: jest.Mock;
  let mockTournamentCheckAndPrompt: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSeasonCheckAndPrompt = jest.fn();
    mockTournamentCheckAndPrompt = jest.fn();
    mockGetFilteredGames.mockResolvedValue([]);
  });

  /**
   * Tests season creation blocked when limit reached
   * @critical - Monetization: free users cannot exceed 1 season limit
   */
  it('blocks season creation when free limit is reached', async () => {
    const user = userEvent.setup();
    mockSeasonCheckAndPrompt.mockReturnValue(false);
    mockTournamentCheckAndPrompt.mockReturnValue(true);

    // Re-mock usePremium for this specific test
    const usePremiumModule = require('@/hooks/usePremium');
    const originalUseResourceLimit = usePremiumModule.useResourceLimit;

    usePremiumModule.useResourceLimit = jest.fn((resourceType: string) => {
      if (resourceType === 'season') {
        return {
          canAdd: false,
          remaining: 0,
          limit: 1,
          current: 1,
          checkAndPrompt: mockSeasonCheckAndPrompt,
        };
      }
      return {
        canAdd: true,
        remaining: 10,
        limit: 10,
        current: 0,
        checkAndPrompt: mockTournamentCheckAndPrompt,
      };
    });

    await act(async () => {
      renderWithProviders({
        seasons: [{ id: 's1', name: 'Existing Season' }],
        tournaments: [],
      });
    });
    await act(async () => {});

    // Click Add Season button
    const addSeasonButton = screen.getByRole('button', {
      name: i18n.t('seasonTournamentModal.addSeason', 'Add Season'),
    });
    await user.click(addSeasonButton);

    // checkAndPrompt should have been called
    expect(mockSeasonCheckAndPrompt).toHaveBeenCalled();

    // Modal should NOT open (no season create modal visible)
    expect(screen.queryByText('Create Season')).not.toBeInTheDocument();

    // Restore original mock
    usePremiumModule.useResourceLimit = originalUseResourceLimit;
  });

  /**
   * Tests tournament creation blocked when limit reached
   * @critical - Monetization: free users cannot exceed 1 tournament limit
   */
  it('blocks tournament creation when free limit is reached', async () => {
    const user = userEvent.setup();
    mockSeasonCheckAndPrompt.mockReturnValue(true);
    mockTournamentCheckAndPrompt.mockReturnValue(false);

    const usePremiumModule = require('@/hooks/usePremium');
    const originalUseResourceLimit = usePremiumModule.useResourceLimit;

    usePremiumModule.useResourceLimit = jest.fn((resourceType: string) => {
      if (resourceType === 'tournament') {
        return {
          canAdd: false,
          remaining: 0,
          limit: 1,
          current: 1,
          checkAndPrompt: mockTournamentCheckAndPrompt,
        };
      }
      return {
        canAdd: true,
        remaining: 10,
        limit: 10,
        current: 0,
        checkAndPrompt: mockSeasonCheckAndPrompt,
      };
    });

    await act(async () => {
      renderWithProviders({
        seasons: [],
        tournaments: [{ id: 't1', name: 'Existing Tournament' }],
      });
    });
    await act(async () => {});

    // Click Add Tournament button
    const addTournamentButton = screen.getByRole('button', {
      name: i18n.t('seasonTournamentModal.addTournament', 'Add Tournament'),
    });
    await user.click(addTournamentButton);

    // checkAndPrompt should have been called
    expect(mockTournamentCheckAndPrompt).toHaveBeenCalled();

    // Modal should NOT open
    expect(screen.queryByText('Create Tournament')).not.toBeInTheDocument();

    // Restore original mock
    usePremiumModule.useResourceLimit = originalUseResourceLimit;
  });

  /**
   * Tests season creation allowed when under limit
   */
  it('allows season creation when under limit', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders({
        seasons: [],
        tournaments: [],
      });
    });
    await act(async () => {});

    const createSeasonButton = screen.getByRole('button', {
      name: i18n.t('seasonTournamentModal.addSeason', 'Add Season'),
    });
    await user.click(createSeasonButton);

    // Modal should open
    await waitFor(() => {
      expect(screen.getByText('Create Season')).toBeInTheDocument();
    });
  });

  /**
   * Tests tournament creation allowed when under limit
   */
  it('allows tournament creation when under limit', async () => {
    const user = userEvent.setup();
    await act(async () => {
      renderWithProviders({
        seasons: [],
        tournaments: [],
      });
    });
    await act(async () => {});

    const createTournamentButton = screen.getByRole('button', {
      name: i18n.t('seasonTournamentModal.addTournament', 'Add Tournament'),
    });
    await user.click(createTournamentButton);

    // Modal should open
    await waitFor(() => {
      expect(screen.getByText('Create Tournament')).toBeInTheDocument();
    });
  });

  /**
   * Tests season unarchive blocked when limit reached
   * @critical - Prevents circumventing limits via archive/unarchive
   */
  it('blocks season unarchive when free limit is reached', async () => {
    const user = userEvent.setup();
    mockSeasonCheckAndPrompt.mockReturnValue(false);

    const usePremiumModule = require('@/hooks/usePremium');
    const originalUseResourceLimit = usePremiumModule.useResourceLimit;

    usePremiumModule.useResourceLimit = jest.fn((resourceType: string) => {
      if (resourceType === 'season') {
        return {
          canAdd: false,
          remaining: 0,
          limit: 1,
          current: 1,
          checkAndPrompt: mockSeasonCheckAndPrompt,
        };
      }
      return {
        canAdd: true,
        remaining: 10,
        limit: 10,
        current: 0,
        checkAndPrompt: jest.fn().mockReturnValue(true),
      };
    });

    await act(async () => {
      renderWithProviders({
        seasons: [
          { id: 's1', name: 'Active Season' },
          { id: 's2', name: 'Archived Season', archived: true },
        ],
        tournaments: [],
      });
    });
    await act(async () => {});

    // Enable show archived
    const showArchivedCheckbox = screen.getByLabelText(i18n.t('seasonTournamentModal.showArchived', 'Show Archived'));
    await user.click(showArchivedCheckbox);

    // Find the archived season's actions button
    const archivedSeasonItem = screen.getByText('Archived Season');
    expect(archivedSeasonItem).toBeInTheDocument();

    // Get the actions button within the archived season's row
    const actionsButtons = screen.getAllByLabelText('season actions');
    await user.click(actionsButtons[1]); // Second season is archived

    const unarchiveOption = await screen.findByRole('button', { name: i18n.t('seasonTournamentModal.unarchive', 'Unarchive') });
    await user.click(unarchiveOption);

    // checkAndPrompt should have been called
    expect(mockSeasonCheckAndPrompt).toHaveBeenCalled();

    // Mutation should NOT have been called
    expect(defaultProps.updateSeasonMutation.mutate).not.toHaveBeenCalled();

    // Restore original mock
    usePremiumModule.useResourceLimit = originalUseResourceLimit;
  });

  /**
   * Tests tournament unarchive blocked when limit reached
   * @critical - Prevents circumventing limits via archive/unarchive
   */
  it('blocks tournament unarchive when free limit is reached', async () => {
    const user = userEvent.setup();
    mockTournamentCheckAndPrompt.mockReturnValue(false);

    const usePremiumModule = require('@/hooks/usePremium');
    const originalUseResourceLimit = usePremiumModule.useResourceLimit;

    usePremiumModule.useResourceLimit = jest.fn((resourceType: string) => {
      if (resourceType === 'tournament') {
        return {
          canAdd: false,
          remaining: 0,
          limit: 1,
          current: 1,
          checkAndPrompt: mockTournamentCheckAndPrompt,
        };
      }
      return {
        canAdd: true,
        remaining: 10,
        limit: 10,
        current: 0,
        checkAndPrompt: jest.fn().mockReturnValue(true),
      };
    });

    await act(async () => {
      renderWithProviders({
        seasons: [],
        tournaments: [
          { id: 't1', name: 'Active Tournament' },
          { id: 't2', name: 'Archived Tournament', archived: true },
        ],
      });
    });
    await act(async () => {});

    // Enable show archived
    const showArchivedCheckbox = screen.getByLabelText(i18n.t('seasonTournamentModal.showArchived', 'Show Archived'));
    await user.click(showArchivedCheckbox);

    // Get the actions button for archived tournament
    const actionsButtons = screen.getAllByLabelText('tournament actions');
    await user.click(actionsButtons[1]); // Second tournament is archived

    const unarchiveOption = await screen.findByRole('button', { name: i18n.t('seasonTournamentModal.unarchive', 'Unarchive') });
    await user.click(unarchiveOption);

    // checkAndPrompt should have been called
    expect(mockTournamentCheckAndPrompt).toHaveBeenCalled();

    // Mutation should NOT have been called
    expect(defaultProps.updateTournamentMutation.mutate).not.toHaveBeenCalled();

    // Restore original mock
    usePremiumModule.useResourceLimit = originalUseResourceLimit;
  });
});