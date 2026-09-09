/**
 * @critical - before this, the only way to create a note about a player was to
 * dictate during the match or let an AI draft one, so the checklist row asking
 * how many players had been written about was not completable by hand at all.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GameNoteComposer from '../GameNoteComposer';
import type { Player } from '@/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k }),
}));

const players: Player[] = [
  { id: 'p1', name: 'Liam Smith' } as Player,
  { id: 'p2', name: 'Emma Jones' } as Player,
];
const stamp = { time: 3000, period: 2 };

describe('GameNoteComposer', () => {
  it('writes a note about the chosen player, stamped to the end of the match', () => {
    const onAdd = jest.fn(() => true);
    render(<GameNoteComposer players={players} stamp={stamp} onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText('About'), { target: { value: 'p2' } });
    fireEvent.change(screen.getByLabelText('Write a note'), { target: { value: '  Won the ball back late on.  ' } });
    fireEvent.click(screen.getByTestId('note-composer-save'));
    expect(onAdd).toHaveBeenCalledWith({
      time: 3000, period: 2, text: 'Won the ball back late on.', entityId: 'p2', source: 'manual',
    });
  });

  it('writes a note about the match when no player is chosen', () => {
    const onAdd = jest.fn(() => true);
    render(<GameNoteComposer players={players} stamp={stamp} onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText('Write a note'), { target: { value: 'Sloppy first half.' } });
    fireEvent.click(screen.getByTestId('note-composer-save'));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ entityId: undefined }));
  });

  it('cannot save nothing, and clears only when the note was taken', () => {
    const onAdd = jest.fn(() => false);
    render(<GameNoteComposer players={players} stamp={stamp} onAdd={onAdd} />);
    expect(screen.getByTestId('note-composer-save')).toBeDisabled();
    const box = screen.getByLabelText('Write a note');
    fireEvent.change(box, { target: { value: 'Kept it.' } });
    fireEvent.click(screen.getByTestId('note-composer-save'));
    // Refused by the host (no saved game): the coach's words stay on screen.
    expect((box as HTMLTextAreaElement).value).toBe('Kept it.');
  });
});
