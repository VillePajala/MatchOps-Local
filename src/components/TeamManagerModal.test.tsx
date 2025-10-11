import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TeamManagerModal from './TeamManagerModal';
import type { Team } from '@/types';
import * as teamsUtils from '@/utils/teams';
import { ToastProvider } from '@/contexts/ToastProvider';

// Mock utilities
jest.mock('@/utils/teams');
jest.mock('@/utils/logger');

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

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  teams: mockTeams,
  onManageRoster: jest.fn(),
  onManageOrphanedGames: jest.fn(),
};

const renderWithQueryClient = (ui: React.ReactElement) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {ui}
      </ToastProvider>
    </QueryClientProvider>
  );
};

describe('TeamManagerModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = jest.fn();
    (teamsUtils.countGamesForTeam as jest.Mock).mockResolvedValue(0);
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = renderWithQueryClient(<TeamManagerModal {...defaultProps} isOpen={false} />);
      expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
    });

    it('renders modal with title when open', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);
      expect(screen.getByRole('heading', { name: 'Teams' })).toBeInTheDocument();
    });

    it('renders team counter with correct count', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);
      const counterNumber = screen.getByText('3');
      expect(counterNumber).toBeInTheDocument();
      expect(counterNumber).toHaveClass('text-yellow-400');
    });

    it('renders singular "Team" when only one team exists', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} teams={[mockTeams[0]]} />);
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('Team')).toBeInTheDocument();
    });

    it('renders all teams in list', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
      expect(screen.getByText('Team Beta')).toBeInTheDocument();
      expect(screen.getByText('Team Gamma')).toBeInTheDocument();
    });

    it('renders empty state when no teams', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} teams={[]} />);
      expect(screen.getByText('No teams yet. Create your first team to get started.')).toBeInTheDocument();
    });

    it('renders Add Team button', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);
      expect(screen.getByText('Add Team')).toBeInTheDocument();
    });

    it('renders orphaned games button when handler provided', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);
      expect(screen.getByText('Orphaned Games')).toBeInTheDocument();
    });

    it('does not render orphaned games button when no handler', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} onManageOrphanedGames={undefined} />);
      expect(screen.queryByText('Orphaned Games')).not.toBeInTheDocument();
    });
  });

  describe('Team Creation', () => {
    it('shows create form when Add Team clicked', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));

      expect(screen.getByPlaceholderText('Enter team name')).toBeInTheDocument();
      expect(screen.getByText('Team Color')).toBeInTheDocument();
    });

    it('hides Add Team button when create form is open', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));

      expect(screen.queryByText('Add Team')).not.toBeInTheDocument();
    });

    it('focuses input when create form opens', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter team name')).toHaveFocus();
      });
    });

    it('creates team with valid name', async () => {
      (teamsUtils.addTeam as jest.Mock).mockResolvedValue({ id: 't4', name: 'New Team', color: '#6366F1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));

      const input = screen.getByPlaceholderText('Enter team name');
      fireEvent.change(input, { target: { value: 'New Team' } });

      // Wait for button to be enabled
      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        const createButton = buttons.find(btn => btn.textContent === 'Create' && !btn.hasAttribute('disabled'));
        expect(createButton).toBeDefined();
      });

      const buttons = screen.getAllByRole('button');
      const createButton = buttons.find(btn => btn.textContent === 'Create');
      fireEvent.click(createButton!);

      await waitFor(() => {
        expect(teamsUtils.addTeam).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Team',
            color: '#6366F1',
          }),
          expect.anything()
        );
      });
    });

    it('trims whitespace from team name', async () => {
      (teamsUtils.addTeam as jest.Mock).mockResolvedValue({ id: 't4', name: 'Trimmed Team', color: '#6366F1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));

      const input = screen.getByPlaceholderText('Enter team name');
      fireEvent.change(input, { target: { value: '  Trimmed Team  ' } });

      // Wait for button to be enabled
      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        const createButton = buttons.find(btn => btn.textContent === 'Create' && !btn.hasAttribute('disabled'));
        expect(createButton).toBeDefined();
      });

      const buttons = screen.getAllByRole('button');
      const createButton = buttons.find(btn => btn.textContent === 'Create');
      fireEvent.click(createButton!);

      await waitFor(() => {
        expect(teamsUtils.addTeam).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Trimmed Team',
            color: '#6366F1',
          }),
          expect.anything()
        );
      });
    });

    it('prevents creating team with empty name', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));

      const createButton = screen.getByRole('button', { name: /Create/i });
      expect(createButton).toBeDisabled();
    });

    it('prevents creating team with only whitespace', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));

      const input = screen.getByPlaceholderText('Enter team name');
      fireEvent.change(input, { target: { value: '   ' } });

      const createButton = screen.getByRole('button', { name: /Create/i });
      expect(createButton).toBeDisabled();
    });

    it('allows selecting team color', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));

      const colorButtons = screen.getAllByLabelText(/Select color/i);
      expect(colorButtons.length).toBeGreaterThan(0);

      fireEvent.click(colorButtons[1]); // Select second color
      // Color selection should work without errors
    });

    it('closes create form when Cancel clicked', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));
      expect(screen.getByPlaceholderText('Enter team name')).toBeInTheDocument();

      const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButtons[0]);

      expect(screen.queryByPlaceholderText('Enter team name')).not.toBeInTheDocument();
    });

    it('creates team on Enter key press', async () => {
      (teamsUtils.addTeam as jest.Mock).mockResolvedValue({ id: 't4', name: 'Quick Team', color: '#6366F1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));

      const input = screen.getByPlaceholderText('Enter team name');
      fireEvent.change(input, { target: { value: 'Quick Team' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(teamsUtils.addTeam).toHaveBeenCalled();
      });
    });

    it('closes form on Escape key press', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));

      const input = screen.getByPlaceholderText('Enter team name');
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

      expect(screen.queryByPlaceholderText('Enter team name')).not.toBeInTheDocument();
    });
  });

  describe('Duplicate Name Validation - Create', () => {
    it('prevents creating team with duplicate name (exact match)', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));

      const input = screen.getByPlaceholderText('Enter team name');
      fireEvent.change(input, { target: { value: 'Team Alpha' } });

      const createButton = screen.getByRole('button', { name: /Create/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('A team named "Team Alpha" already exists. Please choose a different name.')).toBeInTheDocument();
      });

      expect(teamsUtils.addTeam).not.toHaveBeenCalled();
    });

    it('prevents creating team with duplicate name (case insensitive)', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));

      const input = screen.getByPlaceholderText('Enter team name');
      fireEvent.change(input, { target: { value: 'TEAM ALPHA' } });

      const createButton = screen.getByRole('button', { name: /Create/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('A team named "Team Alpha" already exists. Please choose a different name.')).toBeInTheDocument();
      });

      expect(teamsUtils.addTeam).not.toHaveBeenCalled();
    });

    it('prevents creating team with duplicate name (with whitespace)', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));

      const input = screen.getByPlaceholderText('Enter team name');
      fireEvent.change(input, { target: { value: '  team alpha  ' } });

      const createButton = screen.getByRole('button', { name: /Create/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('A team named "Team Alpha" already exists. Please choose a different name.')).toBeInTheDocument();
      });

      expect(teamsUtils.addTeam).not.toHaveBeenCalled();
    });

    it('allows creating team with unique name', async () => {
      (teamsUtils.addTeam as jest.Mock).mockResolvedValue({ id: 't4', name: 'Unique Team', color: '#6366F1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Add Team'));

      const input = screen.getByPlaceholderText('Enter team name');
      fireEvent.change(input, { target: { value: 'Unique Team' } });

      const createButton = screen.getByRole('button', { name: /Create/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(teamsUtils.addTeam).toHaveBeenCalled();
      });

      expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
    });
  });

  describe('Team Editing', () => {
    it('opens edit form when Rename clicked', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Rename')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Rename'));

      const input = screen.getByDisplayValue('Team Alpha');
      expect(input).toBeInTheDocument();
    });

    it('focuses and selects text when edit form opens', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Rename'));
      });

      await waitFor(() => {
        const input = screen.getByDisplayValue('Team Alpha');
        expect(input).toHaveFocus();
      });
    });

    it('saves edited team name', async () => {
      (teamsUtils.updateTeam as jest.Mock).mockResolvedValue({ ...mockTeams[0], name: 'Updated Team' });

      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Rename'));
      });

      const input = screen.getByDisplayValue('Team Alpha');
      fireEvent.change(input, { target: { value: 'Updated Team' } });

      const saveButton = screen.getByRole('button', { name: /Save/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(teamsUtils.updateTeam).toHaveBeenCalledWith('t1', {
          name: 'Updated Team',
          color: '#6366F1',
        });
      });
    });

    it('cancels edit when Cancel clicked', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Rename'));
      });

      expect(screen.getByDisplayValue('Team Alpha')).toBeInTheDocument();

      const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButtons[cancelButtons.length - 1]); // Last cancel button

      await waitFor(() => {
        expect(screen.queryByDisplayValue('Team Alpha')).not.toBeInTheDocument();
      });
    });

    it('saves edit on Enter key press', async () => {
      (teamsUtils.updateTeam as jest.Mock).mockResolvedValue({ ...mockTeams[0], name: 'Quick Edit' });

      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Rename'));
      });

      const input = screen.getByDisplayValue('Team Alpha');
      fireEvent.change(input, { target: { value: 'Quick Edit' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(teamsUtils.updateTeam).toHaveBeenCalled();
      });
    });

    it('cancels edit on Escape key press', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Rename'));
      });

      const input = screen.getByDisplayValue('Team Alpha');
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByDisplayValue('Team Alpha')).not.toBeInTheDocument();
      });
    });
  });

  describe('Duplicate Name Validation - Edit', () => {
    it('prevents renaming to duplicate name', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Rename'));
      });

      const input = screen.getByDisplayValue('Team Alpha');
      fireEvent.change(input, { target: { value: 'Team Beta' } }); // Already exists

      const saveButton = screen.getByRole('button', { name: /Save/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('A team named "Team Beta" already exists. Please choose a different name.')).toBeInTheDocument();
      });

      expect(teamsUtils.updateTeam).not.toHaveBeenCalled();
    });

    it('prevents renaming to duplicate name (case insensitive)', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Rename'));
      });

      const input = screen.getByDisplayValue('Team Alpha');
      fireEvent.change(input, { target: { value: 'TEAM BETA' } });

      const saveButton = screen.getByRole('button', { name: /Save/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/already exists/i)).toBeInTheDocument();
      });

      expect(teamsUtils.updateTeam).not.toHaveBeenCalled();
    });

    it('allows renaming to same name (no change)', async () => {
      (teamsUtils.updateTeam as jest.Mock).mockResolvedValue(mockTeams[0]);

      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Rename'));
      });

      const input = screen.getByDisplayValue('Team Alpha');
      fireEvent.change(input, { target: { value: 'Team Alpha' } });

      const saveButton = screen.getByRole('button', { name: /Save/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(teamsUtils.updateTeam).toHaveBeenCalled();
      });

      expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
    });

    it('allows renaming to same name with different case', async () => {
      (teamsUtils.updateTeam as jest.Mock).mockResolvedValue({ ...mockTeams[0], name: 'TEAM ALPHA' });

      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Rename'));
      });

      const input = screen.getByDisplayValue('Team Alpha');
      fireEvent.change(input, { target: { value: 'TEAM ALPHA' } });

      const saveButton = screen.getByRole('button', { name: /Save/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(teamsUtils.updateTeam).toHaveBeenCalled();
      });

      expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
    });
  });

  describe('Team Deletion', () => {
    it('shows delete confirmation when Delete clicked', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

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

      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

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

      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

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

      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

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

      // Find the red delete button in the confirmation modal (not the one in the menu)
      const allButtons = screen.getAllByRole('button');
      const confirmDeleteButton = allButtons.find(btn =>
        btn.textContent === 'Delete' && btn.className.includes('bg-red-600')
      );
      fireEvent.click(confirmDeleteButton!);

      await waitFor(() => {
        expect(teamsUtils.deleteTeam).toHaveBeenCalledWith('t1', expect.anything());
      });
    });

    it('cancels deletion when Cancel clicked in confirmation', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

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

  describe('Team Roster Access', () => {
    it('calls onManageRoster when team name clicked', () => {
      const onManageRoster = jest.fn();
      renderWithQueryClient(<TeamManagerModal {...defaultProps} onManageRoster={onManageRoster} />);

      fireEvent.click(screen.getByText('Team Alpha'));

      expect(onManageRoster).toHaveBeenCalledWith('t1');
    });

    it('does not error when onManageRoster not provided', () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} onManageRoster={undefined} />);

      fireEvent.click(screen.getByText('Team Alpha'));

      // Should not crash or throw error
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });
  });

  describe('Close Functionality', () => {
    it('calls onClose when Done button clicked', () => {
      const onClose = jest.fn();
      renderWithQueryClient(<TeamManagerModal {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByText('Done'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('resets state when modal closes', () => {
      const { rerender } = renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      // Open create form
      fireEvent.click(screen.getByText('Add Team'));
      expect(screen.getByPlaceholderText('Enter team name')).toBeInTheDocument();

      // Close modal
      rerender(
        <QueryClientProvider client={createQueryClient()}>
          <ToastProvider>
            <TeamManagerModal {...defaultProps} isOpen={false} />
          </ToastProvider>
        </QueryClientProvider>
      );

      // Reopen modal
      rerender(
        <QueryClientProvider client={createQueryClient()}>
          <ToastProvider>
            <TeamManagerModal {...defaultProps} isOpen={true} />
          </ToastProvider>
        </QueryClientProvider>
      );

      // Create form should be reset
      expect(screen.queryByPlaceholderText('Enter team name')).not.toBeInTheDocument();
      expect(screen.getByText('Add Team')).toBeInTheDocument();
    });
  });

  describe('Actions Menu', () => {
    it('opens actions menu when ellipsis clicked', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Rename')).toBeInTheDocument();
        expect(screen.getByText('Delete')).toBeInTheDocument();
      });
    });

    it('closes actions menu when clicking outside', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButtons = screen.getAllByLabelText('Team actions');
      fireEvent.click(actionsButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Rename')).toBeInTheDocument();
      });

      fireEvent.mouseDown(document.body);

      await waitFor(() => {
        expect(screen.queryByText('Rename')).not.toBeInTheDocument();
      });
    });

    it('toggles actions menu on ellipsis click', async () => {
      renderWithQueryClient(<TeamManagerModal {...defaultProps} />);

      const actionsButton = screen.getAllByLabelText('Team actions')[0];

      // Open
      fireEvent.click(actionsButton);
      await waitFor(() => {
        expect(screen.getByText('Rename')).toBeInTheDocument();
      });

      // Close
      fireEvent.click(actionsButton);
      await waitFor(() => {
        expect(screen.queryByText('Rename')).not.toBeInTheDocument();
      });
    });
  });

  describe('Orphaned Games', () => {
    it('calls onManageOrphanedGames when button clicked', () => {
      const onManageOrphanedGames = jest.fn();
      renderWithQueryClient(<TeamManagerModal {...defaultProps} onManageOrphanedGames={onManageOrphanedGames} />);

      fireEvent.click(screen.getByText('Orphaned Games'));

      expect(onManageOrphanedGames).toHaveBeenCalledTimes(1);
    });
  });
});
