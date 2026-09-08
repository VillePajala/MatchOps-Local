import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GameNotesList from '../GameNotesList';
import type { GameEvent, Player } from '@/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options?.[name] ?? '')),
  }),
}));

const players: Player[] = [{ id: 'p-emma', name: 'Emma Virtanen', nickname: 'Emma' }];

const notes: GameEvent[] = [
  { id: 'n1', type: 'note', time: 1834, period: 2, entityId: 'p-emma', text: 'hieno syöttö', source: 'dictation' },
  { id: 'n2', type: 'note', time: 200, period: 1, text: 'puolustus nukkui', source: 'manual' },
];

describe('GameNotesList', () => {
  it('renders nothing without notes', () => {
    const { container } = render(<GameNotesList notes={[]} availablePlayers={players} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows clock, player, text and source per note', () => {
    render(<GameNotesList notes={notes} availablePlayers={players} />);
    expect(screen.getAllByTestId('game-note')).toHaveLength(2);
    expect(screen.getByText('P2 30:34')).toBeInTheDocument();
    expect(screen.getByText('Emma')).toBeInTheDocument();
    expect(screen.getByText('hieno syöttö')).toBeInTheDocument();
    expect(screen.getByText('voice')).toBeInTheDocument();
    expect(screen.getByText('typed')).toBeInTheDocument();
  });

  /** @critical - a note is the coach's own words: deletion asks first. */
  it('deletes only after confirmation', () => {
    const onDeleteNote = jest.fn();
    render(<GameNotesList notes={notes} availablePlayers={players} onDeleteNote={onDeleteNote} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    expect(onDeleteNote).not.toHaveBeenCalled();
    expect(screen.getByText('Delete note?')).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    expect(onDeleteNote).toHaveBeenCalledWith('n1');
  });
});
