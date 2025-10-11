import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import RosterSettingsModal from './RosterSettingsModal';
import type { Player } from '@/types';
import { ToastProvider } from '@/contexts/ToastProvider';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | undefined) => fallback || key,
  }),
}));

const mockOnClose = jest.fn();
const mockOnAddPlayer = jest.fn();
const mockOnRemovePlayer = jest.fn();
const mockOnRenamePlayer = jest.fn();
const mockOnSetJerseyNumber = jest.fn();
const mockOnSetPlayerNotes = jest.fn();
const mockOnOpenPlayerStats = jest.fn();
const mockOnUpdatePlayer = jest.fn();

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Player One', nickname: 'P1', jerseyNumber: '10', notes: 'Note 1' },
  { id: 'p2', name: 'Player Two', nickname: 'P2', jerseyNumber: '20', notes: 'Note 2' },
];

const defaultProps = {
  isOpen: true,
  onClose: mockOnClose,
  availablePlayers: mockPlayers,
  onUpdatePlayer: mockOnUpdatePlayer,
  onRenamePlayer: mockOnRenamePlayer,
  onSetJerseyNumber: mockOnSetJerseyNumber,
  onSetPlayerNotes: mockOnSetPlayerNotes,
  onRemovePlayer: mockOnRemovePlayer,
  onAddPlayer: mockOnAddPlayer,
  selectedPlayerIds: [],
  onOpenPlayerStats: mockOnOpenPlayerStats,
};

describe('<RosterSettingsModal />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the modal when isOpen is true', () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );
    expect(screen.getByText('Manage Roster')).toBeInTheDocument();
    expect(screen.getByText('Player One')).toBeInTheDocument();
    expect(screen.getByText('Player Two')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Player/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Done/i })).toBeInTheDocument();
  });

  test('does not render when isOpen is false', () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} isOpen={false} />
      </ToastProvider>
    );
    expect(screen.queryByText('Manage Roster')).not.toBeInTheDocument();
  });

  test('calls onClose when Done button is clicked', () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );
    const doneButton = screen.getByRole('button', { name: /Done/i });
    fireEvent.click(doneButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('shows add player form when Add Player button is clicked', () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );
    const addButton = screen.getByRole('button', { name: /Add Player/i });
    fireEvent.click(addButton);
    expect(screen.getByPlaceholderText(/Player Name/i)).toBeInTheDocument();
  });

  test('adds a new player when form is submitted', () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );

    // Open form
    const addButtons = screen.getAllByRole('button', { name: /Add Player/i });
    const mainAddButton = addButtons.find(button => !button.hasAttribute('disabled'));
    if (!mainAddButton) throw new Error('No enabled Add Player button found');
    fireEvent.click(mainAddButton);
    
    // Fill form
    const newPlayer = {
      name: 'New Player',
      nickname: 'NP',
      jerseyNumber: '99',
      notes: 'Test notes'
    };
    
    fireEvent.change(screen.getByPlaceholderText(/Player Name/i), { target: { value: newPlayer.name }});
    fireEvent.change(screen.getByPlaceholderText(/Nickname/i), { target: { value: newPlayer.nickname }});
    fireEvent.change(screen.getByPlaceholderText(/#/i), { target: { value: newPlayer.jerseyNumber }});
    fireEvent.change(screen.getByPlaceholderText(/Player notes/i), { target: { value: newPlayer.notes }});
    
    // Submit - find the enabled Add Player button in the form
    const submitButtons = screen.getAllByRole('button', { name: /Add Player/i });
    const submitButton = submitButtons.find(button => !button.hasAttribute('disabled'));
    if (!submitButton) throw new Error('No enabled Add Player button found for submission');
    fireEvent.click(submitButton);
    
    expect(mockOnAddPlayer).toHaveBeenCalledWith(newPlayer);
  });

  test('edits player when edit form is submitted', () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );

    // Open the actions menu for first player (P1)
    const actionsButtons = screen.getAllByTitle('Actions');
    fireEvent.click(actionsButtons[0]);

    // Click Edit in the dropdown
    const editButton = screen.getByRole('button', { name: /Edit/i });
    fireEvent.click(editButton);

    // Fill edit form
    const updatedData = {
      name: 'Updated Name',
      nickname: 'UN',
      jerseyNumber: '11',
      notes: 'Updated notes'
    };

    fireEvent.change(screen.getByDisplayValue('Player One'), { target: { value: updatedData.name }});
    fireEvent.change(screen.getByDisplayValue('P1'), { target: { value: updatedData.nickname }});
    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: updatedData.jerseyNumber }});
    fireEvent.change(screen.getByDisplayValue('Note 1'), { target: { value: updatedData.notes }});

    // Save
    fireEvent.click(screen.getByTitle('Save'));

    // Should call unified update with all changed fields
    expect(mockOnUpdatePlayer).toHaveBeenCalledWith('p1', {
      name: updatedData.name,
      nickname: updatedData.nickname,
      jerseyNumber: updatedData.jerseyNumber,
      notes: updatedData.notes
    });
  });

  test('removes player when remove button is clicked', async () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );

    // Open the actions menu for first player (P1)
    const actionsButtons = screen.getAllByTitle('Actions');
    fireEvent.click(actionsButtons[0]);

    // Click Delete in the dropdown
    const deleteButton = screen.getByRole('button', { name: /Delete/i });
    fireEvent.click(deleteButton);

    // Wait for confirmation modal to appear
    await waitFor(() => {
      expect(screen.getByText(/Are you sure/i)).toBeInTheDocument();
    });

    // Click Remove in the confirmation modal (not the Delete buttons)
    const allButtons = screen.getAllByRole('button');
    const removeButton = allButtons.find(btn =>
      btn.textContent === 'Remove' && btn.className.includes('bg-gradient-to-b')
    );
    fireEvent.click(removeButton!);

    await waitFor(() => {
      expect(mockOnRemovePlayer).toHaveBeenCalledWith('p1');
    });
  });



  test('opens player stats', () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );

    // Open the actions menu for first player (P1)
    const actionsButtons = screen.getAllByTitle('Actions');
    fireEvent.click(actionsButtons[0]);

    // Click Stats in the dropdown
    const statsButton = screen.getByRole('button', { name: /Stats/i });
    fireEvent.click(statsButton);

    expect(mockOnOpenPlayerStats).toHaveBeenCalledWith('p1');
  });

  test('filters players by search input', () => {
    render(
      <ToastProvider>
        <RosterSettingsModal {...defaultProps} />
      </ToastProvider>
    );
    const searchInput = screen.getByPlaceholderText('Search players...');
    fireEvent.change(searchInput, { target: { value: 'Two' } });
    expect(screen.queryByText('Player One')).not.toBeInTheDocument();
    expect(screen.getByText('Player Two')).toBeInTheDocument();
  });

});