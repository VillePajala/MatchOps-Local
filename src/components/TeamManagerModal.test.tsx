import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TeamManagerModal from './TeamManagerModal';
import type { Team } from '@/types';
import * as teamsUtils from '@/utils/teams';
import { ToastProvider } from '@/contexts/ToastProvider';
import { PremiumProvider } from '@/contexts/PremiumContext';

// Mock utilities
jest.mock('@/utils/teams');
jest.mock('@/utils/logger');

// Mock usePremium to avoid limit checks blocking UI in tests
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
const mockGetTeamReferences = jest.fn().mockResolvedValue({
  canDelete: true,
  counts: { games: 0 },
  summary: 'Not used by any other data',
});

jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({
    userId: 'test-user-123',
    getStore: jest.fn().mockResolvedValue({
      getTeamReferences: mockGetTeamReferences,
    }),
    isUserScoped: true,
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, params?: Record<string, string | number>) => {
      if (params) {
        let text = fallback || key;
        Object.keys(params).forEach(param => {
          text = text.replace(`{{${param}}}`, String(params[param]));
        });
        return text;
      }
      return fallback || key;
    },
  }),
}));

const mockTeams: Team[] = [
  { id: 't1', name: 'Team Alpha', color: '#6366F1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 't2', name: 'Team Beta', color: '#8B5CF6', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 't3', name: 'Team Gamma', color: '#10B981', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const flushPromises = () => new Promise<void>(resolve => queueMicrotask(resolve));

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  teams: mockTeams,
  masterRoster: [],
  onManageOrphanedGames: jest.fn(),
};

const renderWithQueryClient = async (ui: React.ReactElement) => {
  const queryClient = createQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <PremiumProvider>
        <ToastProvider>
          {ui}
        </ToastProvider>
      </PremiumProvider>
    </QueryClientProvider>
  );
  await act(async () => {
    await flushPromises();
  });
  return result;
};

describe('TeamManagerModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = jest.fn();
    (teamsUtils.countGamesForTeam as jest.Mock).mockResolvedValue(0);
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', async () => {
      const { container } = await renderWithQueryClient(<TeamManagerModal {...defaultProps} isOpen={false} />);
      expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
    });

    it('renders modal with title when open', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);
      expect(screen.getByRole('heading', { name: 'Teams' })).toBeInTheDocument();
    });

    it('renders team counter with correct count', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);
      const counterNumber = screen.getByText('3');
      expect(counterNumber).toBeInTheDocument();
      expect(counterNumber).toHaveClass('text-yellow-400');
    });

    it('renders singular "Team" when only one team exists', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} teams={[mockTeams[0]]} />);
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('Team')).toBeInTheDocument();
    });

    it('renders all teams in list', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
      expect(screen.getByText('Team Beta')).toBeInTheDocument();
      expect(screen.getByText('Team Gamma')).toBeInTheDocument();
    });

    it('renders empty state when no teams', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} teams={[]} />);
      expect(screen.getByText('No teams yet. Create your first team to get started.')).toBeInTheDocument();
    });

    it('renders Add Team button', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);
      expect(screen.getByText('Add Team')).toBeInTheDocument();
    });

    it('renders orphaned games button when handler provided', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);
      expect(screen.getByText('Orphaned Games')).toBeInTheDocument();
    });

    it('does not render orphaned games button when no handler', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} onManageOrphanedGames={undefined} />);
      expect(screen.queryByText('Orphaned Games')).not.toBeInTheDocument();
    });
  });

  describe('Team Deletion', () => {
    it('shows delete confirmation when Delete clicked', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Delete'));
      });

      await waitFor(() => {
        expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
        expect(screen.getByText(/Delete team "Team Alpha"/i)).toBeInTheDocument();
      });
    });

    it('shows game count warning when team has games', async () => {
      (teamsUtils.countGamesForTeam as jest.Mock).mockResolvedValue(5);

      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Delete'));
      });

      await waitFor(() => {
        expect(screen.getByText(/This will orphan 5 game/i)).toBeInTheDocument();
      });
    });

    it('shows no games message when team has no games', async () => {
      (teamsUtils.countGamesForTeam as jest.Mock).mockResolvedValue(0);

      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Delete'));
      });

      await waitFor(() => {
        expect(screen.getByText('No games are associated with this team.')).toBeInTheDocument();
      });
    });

    it('deletes team when confirmed', async () => {
      (teamsUtils.deleteTeam as jest.Mock).mockResolvedValue(undefined);

      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        const deleteMenuItem = screen.getByText('Delete');
        expect(deleteMenuItem).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Delete'));

      await waitFor(() => {
        expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
      });

      // Find the delete button in the confirmation modal by its text and role
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      // The last one should be the confirmation button (first one is in the actions menu)
      const confirmDeleteButton = deleteButtons[deleteButtons.length - 1];
      fireEvent.click(confirmDeleteButton);

      await waitFor(() => {
        expect(teamsUtils.deleteTeam).toHaveBeenCalledWith('t1', expect.anything());
      });
    });

    it('cancels deletion when Cancel clicked in confirmation', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Delete'));
      });

      await waitFor(() => {
        const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });
        const confirmCancelButton = cancelButtons[cancelButtons.length - 1];
        fireEvent.click(confirmCancelButton);
      });

      await waitFor(() => {
        expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument();
      });

      expect(teamsUtils.deleteTeam).not.toHaveBeenCalled();
    });
  });

  describe('Close Functionality', () => {
    it('calls onClose when Done button clicked', async () => {
      const onClose = jest.fn();
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByText('Done'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('resets state when modal closes', async () => {
      const { rerender } = await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      // Open create form
      fireEvent.click(screen.getByText('Add Team'));
      expect(screen.getByPlaceholderText('Enter team name')).toBeInTheDocument();

      // Close modal
      rerender(
        <QueryClientProvider client={createQueryClient()}>
          <PremiumProvider>
            <ToastProvider>
              <TeamManagerModal {...defaultProps} isOpen={false} />
            </ToastProvider>
          </PremiumProvider>
        </QueryClientProvider>
      );

      // Reopen modal
      rerender(
        <QueryClientProvider client={createQueryClient()}>
          <PremiumProvider>
            <ToastProvider>
              <TeamManagerModal {...defaultProps} isOpen={true} />
            </ToastProvider>
          </PremiumProvider>
        </QueryClientProvider>
      );

      // Create form should be reset
      expect(screen.queryByPlaceholderText('Enter team name')).not.toBeInTheDocument();
      expect(screen.getByText('Add Team')).toBeInTheDocument();
    });
  });

  describe('Actions Menu', () => {
    it('opens actions menu when ellipsis clicked', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Muokkaa')).toBeInTheDocument();
        expect(screen.getByText('Delete')).toBeInTheDocument();
      });
    });

    it('closes actions menu when clicking outside', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Muokkaa')).toBeInTheDocument();
      });

      fireEvent.mouseDown(document.body);

      await waitFor(() => {
        expect(screen.queryByText('Muokkaa')).not.toBeInTheDocument();
      });
    });

    it('toggles actions menu on ellipsis click', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButton = screen.getAllByLabelText('Team actions')[0];

      // Open
      fireEvent.click(actionsButton);
      await waitFor(() => {
        expect(screen.getByText('Muokkaa')).toBeInTheDocument();
      });

      // Close
      fireEvent.click(actionsButton);
      await waitFor(() => {
        expect(screen.queryByText('Muokkaa')).not.toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('renders search input field', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search teams...');
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).toHaveAttribute('aria-label', 'Search teams by name');
    });

    it('filters teams by search text (case insensitive)', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search teams...');
      fireEvent.change(searchInput, { target: { value: 'alpha' } });

      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Team Beta')).not.toBeInTheDocument();
      expect(screen.queryByText('Team Gamma')).not.toBeInTheDocument();
    });

    it('filters teams with partial match', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search teams...');
      fireEvent.change(searchInput, { target: { value: 'Team' } });

      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
      expect(screen.getByText('Team Beta')).toBeInTheDocument();
      expect(screen.getByText('Team Gamma')).toBeInTheDocument();
    });

    it('shows no results message when search has no matches', async () => {
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search teams...');
      fireEvent.change(searchInput, { target: { value: 'NonexistentTeam' } });

      expect(screen.getByText(/No teams match your search for "NonexistentTeam"/i)).toBeInTheDocument();
      expect(screen.queryByText('Team Alpha')).not.toBeInTheDocument();
    });

    it('clears search when modal closes', async () => {
      const { rerender } = await renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search teams...');
      fireEvent.change(searchInput, { target: { value: 'Alpha' } });
      expect(searchInput).toHaveValue('Alpha');

      // Close modal
      rerender(
        <QueryClientProvider client={createQueryClient()}>
          <PremiumProvider>
            <ToastProvider>
              <TeamManagerModal {...defaultProps} isOpen={false} />
            </ToastProvider>
          </PremiumProvider>
        </QueryClientProvider>
      );

      // Reopen modal
      rerender(
        <QueryClientProvider client={createQueryClient()}>
          <PremiumProvider>
            <ToastProvider>
              <TeamManagerModal {...defaultProps} isOpen={true} />
            </ToastProvider>
          </PremiumProvider>
        </QueryClientProvider>
      );

      const reopenedSearchInput = screen.getByPlaceholderText('Search teams...');
      expect(reopenedSearchInput).toHaveValue('');
    });

    it('combines search with archived filter', async () => {
      const teamsWithArchived: Team[] = [
        ...mockTeams,
        { id: 't4', name: 'Team Delta', color: '#EC4899', archived: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ];

      await renderWithQueryClient(<TeamManagerModal {...defaultProps} teams={teamsWithArchived} />);

      // Enable show archived
      const showArchivedCheckbox = screen.getByLabelText('Show Archived');
      fireEvent.click(showArchivedCheckbox);

      // Search for "Delta"
      const searchInput = screen.getByPlaceholderText('Search teams...');
      fireEvent.change(searchInput, { target: { value: 'Delta' } });

      expect(screen.getByText('Team Delta')).toBeInTheDocument();
      expect(screen.queryByText('Team Alpha')).not.toBeInTheDocument();
    });

    it('shows archived empty message when only archived teams are hidden', async () => {
      const archivedOnlyTeams: Team[] = [
        { id: 't1', name: 'Team Alpha', color: '#6366F1', archived: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ];

      await renderWithQueryClient(<TeamManagerModal {...defaultProps} teams={archivedOnlyTeams} />);

      expect(screen.getByText('No archived teams to show.')).toBeInTheDocument();
    });
  });

  describe('Orphaned Games', () => {
    it('calls onManageOrphanedGames when button clicked', async () => {
      const onManageOrphanedGames = jest.fn();
      await renderWithQueryClient(<TeamManagerModal {...defaultProps} onManageOrphanedGames={onManageOrphanedGames} />);

      fireEvent.click(screen.getByText('Orphaned Games'));

      expect(onManageOrphanedGames).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * Premium limit enforcement tests for TeamManagerModal
 * @critical - Tests that free users are blocked when hitting team limit
 */
describe('TeamManagerModal - Premium Limit Enforcement', () => {
  let mockCheckAndPrompt: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckAndPrompt = jest.fn();
    (teamsUtils.countGamesForTeam as jest.Mock).mockResolvedValue(0);
    window.alert = jest.fn();
  });

  /**
   * Tests team creation blocked when limit reached
   * @critical - Monetization: free users cannot exceed 1 team limit
   */
  it('blocks team creation when free limit is reached', async () => {
    // Override the mock to return false for this test
    mockCheckAndPrompt.mockReturnValue(false);

    // Re-mock usePremium for this specific test
    const usePremiumModule = require('@/hooks/usePremium');
    const originalUseResourceLimit = usePremiumModule.useResourceLimit;

    usePremiumModule.useResourceLimit = jest.fn(() => ({
      canAdd: false,
      remaining: 0,
      limit: 1,
      current: 1,
      checkAndPrompt: mockCheckAndPrompt,
    }));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PremiumProvider>
          <ToastProvider>
            <TeamManagerModal {...defaultProps} teams={mockTeams} />
          </ToastProvider>
        </PremiumProvider>
      </QueryClientProvider>
    );

    // Click Add Team button
    fireEvent.click(screen.getByText('Add Team'));

    // checkAndPrompt should have been called
    expect(mockCheckAndPrompt).toHaveBeenCalled();

    // Modal should NOT open (no team name input visible)
    expect(screen.queryByPlaceholderText('Enter team name')).not.toBeInTheDocument();

    // Restore original mock
    usePremiumModule.useResourceLimit = originalUseResourceLimit;
  });

  /**
   * Tests team creation allowed when under limit
   */
  it('allows team creation when under limit', async () => {
    // The default mock returns true, so team creation should work
    await renderWithQueryClient(<TeamManagerModal {...defaultProps} teams={[]} />);

    fireEvent.click(screen.getByText('Add Team'));

    // Modal should open - team name input should be visible
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter team name')).toBeInTheDocument();
    });
  });

  /**
   * Tests unarchive blocked when limit reached
   * @critical - Prevents circumventing limits via archive/unarchive
   */
  it('blocks team unarchive when free limit is reached', async () => {
    mockCheckAndPrompt.mockReturnValue(false);

    const usePremiumModule = require('@/hooks/usePremium');
    const originalUseResourceLimit = usePremiumModule.useResourceLimit;

    usePremiumModule.useResourceLimit = jest.fn(() => ({
      canAdd: false,
      remaining: 0,
      limit: 1,
      current: 1,
      checkAndPrompt: mockCheckAndPrompt,
    }));

    const teamsWithArchived: Team[] = [
      { id: 't1', name: 'Active Team', color: '#6366F1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 't2', name: 'Archived Team', color: '#8B5CF6', archived: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PremiumProvider>
          <ToastProvider>
            <TeamManagerModal {...defaultProps} teams={teamsWithArchived} />
          </ToastProvider>
        </PremiumProvider>
      </QueryClientProvider>
    );

    // Enable show archived
    const showArchivedCheckbox = screen.getByLabelText('Show Archived');
    fireEvent.click(showArchivedCheckbox);

    // Open actions menu for archived team
    const actionsButtons = screen.getAllByLabelText('Team actions');
    fireEvent.click(actionsButtons[1]); // Second team is archived

    await waitFor(() => {
      expect(screen.getByText('Unarchive')).toBeInTheDocument();
    });

    // Click Unarchive
    fireEvent.click(screen.getByText('Unarchive'));

    // checkAndPrompt should have been called
    expect(mockCheckAndPrompt).toHaveBeenCalled();

    // Team should NOT be unarchived (mutation not called)
    expect(teamsUtils.updateTeam).not.toHaveBeenCalled();

    // Restore original mock
    usePremiumModule.useResourceLimit = originalUseResourceLimit;
  });
});
