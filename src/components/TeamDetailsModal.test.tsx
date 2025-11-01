import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamDetailsModal from './TeamDetailsModal';
import { UseMutationResult } from '@tanstack/react-query';
import { Team } from '@/types';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';

const mockMutation = () => ({
  mutate: jest.fn((data, options) => {
    // Simulate successful mutation by calling onSuccess
    if (options?.onSuccess) {
      options.onSuccess();
    }
  }),
  isPending: false,
});

const mockTeams: Team[] = [
  { id: 't1', name: 'Team Alpha', color: '#6366F1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 't2', name: 'Team Beta', color: '#8B5CF6', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const mockTeam: Team = {
  id: 't1',
  name: 'Team Alpha',
  color: '#6366F1',
  archived: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  mode: 'edit' as const,
  team: mockTeam,
  teams: mockTeams,
  updateTeamMutation: mockMutation() as unknown as UseMutationResult<Team | null, Error, { teamId: string; updates: Partial<Team> }, unknown>,
};

const renderWithProviders = (props: Partial<typeof defaultProps> = {}) => {
  return render(
    <I18nextProvider i18n={i18n}>
      <TeamDetailsModal {...defaultProps} {...props} />
    </I18nextProvider>
  );
};

describe('TeamDetailsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders team details when open in edit mode', async () => {
      await act(async () => {
        renderWithProviders();
      });

      expect(screen.getByDisplayValue('Team Alpha')).toBeInTheDocument();
      expect(screen.getByDisplayValue('#6366F1')).toBeInTheDocument();
    });

    it('renders create form when in create mode', async () => {
      await act(async () => {
        renderWithProviders({
          mode: 'create',
          team: undefined,
          addTeamMutation: mockMutation() as unknown as UseMutationResult<Team | null, Error, Partial<Team> & { name: string }, unknown>,
        });
      });

      expect(screen.getByText('Create Team')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter team name')).toHaveValue('');
    });

    it('does not render when isOpen is false', () => {
      renderWithProviders({ isOpen: false });

      expect(screen.queryByDisplayValue('Team Alpha')).not.toBeInTheDocument();
    });

    it('renders all form fields', async () => {
      await act(async () => {
        renderWithProviders();
      });

      expect(screen.getByPlaceholderText('Enter team name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/e.g., #FF5733 or blue/i)).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /Archived/i })).toBeInTheDocument();
    });
  });

  describe('Form Interaction', () => {
    it('allows editing team name', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const nameInput = screen.getByDisplayValue('Team Alpha');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Team Name');

      expect(screen.getByDisplayValue('Updated Team Name')).toBeInTheDocument();
    });

    it('allows editing team color', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const colorInput = screen.getByDisplayValue('#6366F1');
      await user.clear(colorInput);
      await user.type(colorInput, '#FF0000');

      expect(screen.getByDisplayValue('#FF0000')).toBeInTheDocument();
    });

    it('allows toggling archived checkbox', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const archivedCheckbox = screen.getByRole('checkbox', { name: /Archived/i });
      expect(archivedCheckbox).not.toBeChecked();

      await user.click(archivedCheckbox);
      expect(archivedCheckbox).toBeChecked();
    });
  });

  describe('Save Functionality', () => {
    it('saves changes when Save button is clicked', async () => {
      const updateMutation = mockMutation();
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          updateTeamMutation: updateMutation as unknown as UseMutationResult<Team | null, Error, { teamId: string; updates: Partial<Team> }, unknown>,
          onClose,
        });
      });

      const nameInput = screen.getByDisplayValue('Team Alpha');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Team');

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(updateMutation.mutate).toHaveBeenCalled();
      const [[firstArg]] = (updateMutation.mutate as jest.Mock).mock.calls;
      expect(firstArg).toMatchObject({
        teamId: 't1',
        updates: {
          name: 'Updated Team',
        },
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('creates team when in create mode', async () => {
      const addMutation = mockMutation();
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          mode: 'create',
          team: undefined,
          addTeamMutation: addMutation as unknown as UseMutationResult<Team | null, Error, Partial<Team> & { name: string }, unknown>,
          updateTeamMutation: undefined,
          onClose,
        });
      });

      const nameInput = screen.getByPlaceholderText('Enter team name');
      await user.type(nameInput, 'New Team');

      const createButton = screen.getByRole('button', { name: /Create/i });
      await user.click(createButton);

      expect(addMutation.mutate).toHaveBeenCalled();
      const [[firstArg]] = (addMutation.mutate as jest.Mock).mock.calls;
      expect(firstArg).toMatchObject({
        name: 'New Team',
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Validation', () => {
    it('disables Save button when name is empty', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const nameInput = screen.getByDisplayValue('Team Alpha');
      await user.clear(nameInput);

      const saveButton = screen.getByRole('button', { name: /Save/i });
      expect(saveButton).toBeDisabled();
    });

    it('shows duplicate name error in create mode', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          mode: 'create',
          team: undefined,
          addTeamMutation: mockMutation() as unknown as UseMutationResult<Team | null, Error, Partial<Team> & { name: string }, unknown>,
        });
      });

      const nameInput = screen.getByPlaceholderText('Enter team name');
      await user.type(nameInput, 'Team Alpha'); // Duplicate name

      const createButton = screen.getByRole('button', { name: /Create/i });
      await user.click(createButton);

      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });

    it('shows duplicate name error (case insensitive)', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          mode: 'create',
          team: undefined,
          addTeamMutation: mockMutation() as unknown as UseMutationResult<Team | null, Error, Partial<Team> & { name: string }, unknown>,
        });
      });

      const nameInput = screen.getByPlaceholderText('Enter team name');
      await user.type(nameInput, 'TEAM ALPHA'); // Duplicate with different case

      const createButton = screen.getByRole('button', { name: /Create/i });
      await user.click(createButton);

      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });
  });

  describe('Cancel Functionality', () => {
    it('calls onClose when Cancel button is clicked', async () => {
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({ onClose });
      });

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('handles mutation error gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const failingMutation = {
        mutate: jest.fn((data, options) => {
          if (options?.onError) {
            options.onError(new Error('Save failed'));
          }
        }),
        isPending: false,
      };
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          updateTeamMutation: failingMutation as unknown as UseMutationResult<Team | null, Error, { teamId: string; updates: Partial<Team> }, unknown>,
        });
      });

      const nameInput = screen.getByDisplayValue('Team Alpha');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Team');

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to update team:', expect.any(Error));
      consoleErrorSpy.mockRestore();
    });
  });
});
