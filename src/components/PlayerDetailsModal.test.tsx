import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlayerDetailsModal from './PlayerDetailsModal';
import { Player } from '@/types';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';

type PlayerDetailsModalProps = React.ComponentProps<typeof PlayerDetailsModal>;

const mockPlayers: Player[] = [
  { id: 'p1', name: 'John Doe', nickname: 'JD', jerseyNumber: '10', notes: '', isGoalie: false },
  { id: 'p2', name: 'Jane Smith', nickname: '', jerseyNumber: '1', notes: '', isGoalie: true },
];

const mockPlayer: Player = {
  id: 'p1',
  name: 'John Doe',
  nickname: 'JD',
  jerseyNumber: '10',
  notes: 'Excellent striker',
  isGoalie: false,
};

const defaultProps: PlayerDetailsModalProps = {
  isOpen: true,
  onClose: jest.fn(),
  mode: 'edit',
  player: mockPlayer,
  players: mockPlayers,
  onUpdatePlayer: jest.fn().mockResolvedValue(undefined),
  isRosterUpdating: false,
};

const renderWithProviders = (props: Partial<PlayerDetailsModalProps> = {}) => {
  return render(
    <I18nextProvider i18n={i18n}>
      <PlayerDetailsModal {...defaultProps} {...props} />
    </I18nextProvider>
  );
};

describe('PlayerDetailsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders player details when open in edit mode', async () => {
      await act(async () => {
        renderWithProviders();
      });

      expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('JD')).toBeInTheDocument();
      expect(screen.getByDisplayValue('10')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Excellent striker')).toBeInTheDocument();
    });

    it('renders create form when in create mode', async () => {
      await act(async () => {
        renderWithProviders({
          mode: 'create',
          player: undefined,
          onAddPlayer: jest.fn(),
          onUpdatePlayer: undefined,
        });
      });

      expect(screen.getByText('Add Player')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter player name')).toHaveValue('');
    });

    it('does not render when isOpen is false', () => {
      renderWithProviders({ isOpen: false });

      expect(screen.queryByDisplayValue('John Doe')).not.toBeInTheDocument();
    });

    it('renders all form fields', async () => {
      await act(async () => {
        renderWithProviders();
      });

      expect(screen.getByPlaceholderText('Enter player name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Optional nickname')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., 10')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Optional notes about this player/i)).toBeInTheDocument();
    });
  });

  describe('Form Interaction', () => {
    it('allows editing player name', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const nameInput = screen.getByDisplayValue('John Doe');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Name');

      expect(screen.getByDisplayValue('Updated Name')).toBeInTheDocument();
    });

    it('allows editing nickname', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const nicknameInput = screen.getByDisplayValue('JD');
      await user.clear(nicknameInput);
      await user.type(nicknameInput, 'Johnny');

      expect(screen.getByDisplayValue('Johnny')).toBeInTheDocument();
    });

    it('allows editing jersey number', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const jerseyInput = screen.getByDisplayValue('10');
      await user.clear(jerseyInput);
      await user.type(jerseyInput, '99');

      expect(screen.getByDisplayValue('99')).toBeInTheDocument();
    });

    it('allows editing notes', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const notesInput = screen.getByDisplayValue('Excellent striker');
      await user.clear(notesInput);
      await user.type(notesInput, 'Great defender');

      expect(screen.getByDisplayValue('Great defender')).toBeInTheDocument();
    });
  });

  describe('Save Functionality', () => {
    it('saves changes when Save button is clicked', async () => {
      const onUpdatePlayer = jest.fn().mockResolvedValue(undefined);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePlayer,
          onClose,
        });
      });

      const nameInput = screen.getByDisplayValue('John Doe');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Player');

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(onUpdatePlayer).toHaveBeenCalledWith('p1', {
        name: 'Updated Player',
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('saves multiple field changes', async () => {
      const onUpdatePlayer = jest.fn().mockResolvedValue(undefined);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePlayer,
          onClose,
        });
      });

      const nameInput = screen.getByDisplayValue('John Doe');
      await user.clear(nameInput);
      await user.type(nameInput, 'New Name');

      const nicknameInput = screen.getByDisplayValue('JD');
      await user.clear(nicknameInput);
      await user.type(nicknameInput, 'NN');

      const jerseyInput = screen.getByDisplayValue('10');
      await user.clear(jerseyInput);
      await user.type(jerseyInput, '7');

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(onUpdatePlayer).toHaveBeenCalledWith('p1', {
        name: 'New Name',
        nickname: 'NN',
        jerseyNumber: '7',
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onUpdatePlayer when no changes are made', async () => {
      const onUpdatePlayer = jest.fn().mockResolvedValue(undefined);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePlayer,
          onClose,
        });
      });

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(onUpdatePlayer).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('creates player when in create mode', async () => {
      const onAddPlayer = jest.fn();
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          mode: 'create',
          player: undefined,
          onAddPlayer,
          onUpdatePlayer: undefined,
          onClose,
        });
      });

      const nameInput = screen.getByPlaceholderText('Enter player name');
      await user.type(nameInput, 'New Player');

      const nicknameInput = screen.getByPlaceholderText('Optional nickname');
      await user.type(nicknameInput, 'NP');

      const jerseyInput = screen.getByPlaceholderText('e.g., 10');
      await user.type(jerseyInput, '15');

      const createButton = screen.getByRole('button', { name: /Add/i });
      await user.click(createButton);

      expect(onAddPlayer).toHaveBeenCalledWith({
        name: 'New Player',
        nickname: 'NP',
        jerseyNumber: '15',
        notes: '',
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('trims whitespace from inputs when saving', async () => {
      const onAddPlayer = jest.fn();
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          mode: 'create',
          player: undefined,
          onAddPlayer,
          onUpdatePlayer: undefined,
          onClose,
        });
      });

      const nameInput = screen.getByPlaceholderText('Enter player name');
      await user.type(nameInput, '  Spaced Name  ');

      const nicknameInput = screen.getByPlaceholderText('Optional nickname');
      await user.type(nicknameInput, '  Nick  ');

      const createButton = screen.getByRole('button', { name: /Add/i });
      await user.click(createButton);

      expect(onAddPlayer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Spaced Name',
          nickname: 'Nick',
        })
      );
    });
  });

  describe('Validation', () => {
    it('disables Save button when name is empty', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const nameInput = screen.getByDisplayValue('John Doe');
      await user.clear(nameInput);

      const saveButton = screen.getByRole('button', { name: /Save/i });
      expect(saveButton).toBeDisabled();
    });

    it('disables Add button when name is empty in create mode', async () => {
      await act(async () => {
        renderWithProviders({
          mode: 'create',
          player: undefined,
          onAddPlayer: jest.fn(),
          onUpdatePlayer: undefined,
        });
      });

      const addButton = screen.getByRole('button', { name: /Add/i });
      expect(addButton).toBeDisabled();
    });

    it('disables Save button when isRosterUpdating is true', async () => {
      await act(async () => {
        renderWithProviders({
          isRosterUpdating: true,
        });
      });

      const saveButton = screen.getByRole('button', { name: /Saving.../i });
      expect(saveButton).toBeDisabled();
    });

    it('enables Save button when name is whitespace-only then cleared and typed', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const nameInput = screen.getByDisplayValue('John Doe');
      await user.clear(nameInput);
      await user.type(nameInput, '   ');

      const saveButton = screen.getByRole('button', { name: /Save/i });
      expect(saveButton).toBeDisabled();

      await user.clear(nameInput);
      await user.type(nameInput, 'Valid Name');

      expect(saveButton).toBeEnabled();
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

    it('calls onClose without saving changes when cancelled', async () => {
      const onUpdatePlayer = jest.fn().mockResolvedValue(undefined);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePlayer,
          onClose,
        });
      });

      const nameInput = screen.getByDisplayValue('John Doe');
      await user.clear(nameInput);
      await user.type(nameInput, 'Changed Name');

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(onUpdatePlayer).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('handles async update error gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const onUpdatePlayer = jest.fn().mockRejectedValue(new Error('Update failed'));
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePlayer,
        });
      });

      const nameInput = screen.getByDisplayValue('John Doe');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Name');

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to save player:', expect.any(Error));
      consoleErrorSpy.mockRestore();
    });

    it('does not close modal when update fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const onUpdatePlayer = jest.fn().mockRejectedValue(new Error('Update failed'));
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePlayer,
          onClose,
        });
      });

      const nameInput = screen.getByDisplayValue('John Doe');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Name');

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      // Wait for error to be logged
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(onClose).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Form Reset', () => {
    it('resets form when switching from edit to create mode', async () => {
      const { rerender } = renderWithProviders();

      expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();

      await act(async () => {
        rerender(
          <I18nextProvider i18n={i18n}>
            <PlayerDetailsModal
              {...defaultProps}
              mode="create"
              player={undefined}
              onAddPlayer={jest.fn()}
              onUpdatePlayer={undefined}
            />
          </I18nextProvider>
        );
      });

      expect(screen.getByPlaceholderText('Enter player name')).toHaveValue('');
      expect(screen.getByPlaceholderText('Optional nickname')).toHaveValue('');
      expect(screen.getByPlaceholderText('e.g., 10')).toHaveValue('');
    });

    it('loads player data when switching to edit mode', async () => {
      const { rerender } = renderWithProviders({
        mode: 'create',
        player: undefined,
        onAddPlayer: jest.fn(),
        onUpdatePlayer: undefined,
      });

      expect(screen.getByPlaceholderText('Enter player name')).toHaveValue('');

      await act(async () => {
        rerender(
          <I18nextProvider i18n={i18n}>
            <PlayerDetailsModal {...defaultProps} />
          </I18nextProvider>
        );
      });

      expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('JD')).toBeInTheDocument();
      expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    });
  });
});
