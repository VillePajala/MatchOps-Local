/**
 * @critical - the preview is editable, and a coach's own wording is the one
 * thing in this modal that cannot be regenerated. Rebuilding the text must
 * never take it away without asking.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GameRecapModal from '../GameRecapModal';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k }),
}));
jest.mock('@/utils/logger', () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn() } }));

const box = () => screen.getByRole('textbox') as HTMLTextAreaElement;

describe('GameRecapModal', () => {
  it('follows the generated text while the coach has not touched it', () => {
    const { rerender } = render(<GameRecapModal isOpen onClose={jest.fn()} recap="First" />);
    expect(box().value).toBe('First');
    rerender(<GameRecapModal isOpen onClose={jest.fn()} recap="Second" />);
    expect(box().value).toBe('Second');
    expect(screen.queryByTestId('recap-stale')).not.toBeInTheDocument();
  });

  it('keeps an edit when the text is rebuilt, and takes the new one on request', () => {
    const { rerender } = render(<GameRecapModal isOpen onClose={jest.fn()} recap="First" />);
    fireEvent.change(box(), { target: { value: 'My own wording' } });

    // A section was ticked: the generated text changed underneath the edit.
    rerender(<GameRecapModal isOpen onClose={jest.fn()} recap="First and more" />);
    expect(box().value).toBe('My own wording');
    expect(screen.getByTestId('recap-stale')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('recap-apply-generated'));
    expect(box().value).toBe('First and more');
    expect(screen.queryByTestId('recap-stale')).not.toBeInTheDocument();
  });

  it('offers the section switches and reports which one was tapped', () => {
    const onToggleSection = jest.fn();
    render(
      <GameRecapModal
        isOpen
        onClose={jest.fn()}
        recap="Text"
        sections={[
          { key: 'totals', label: 'Totals', checked: true },
          { key: 'games', label: 'Every game', checked: false },
        ]}
        onToggleSection={onToggleSection}
      />,
    );
    expect(screen.getByTestId('recap-section-totals')).toBeChecked();
    expect(screen.getByTestId('recap-section-games')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('recap-section-games'));
    expect(onToggleSection).toHaveBeenCalledWith('games');
  });

  it('says nothing above the text when the caller asks for no subtitle', () => {
    const { rerender } = render(<GameRecapModal isOpen onClose={jest.fn()} recap="Text" />);
    expect(screen.getByText(/Ready to paste into the team chat/)).toBeInTheDocument();
    rerender(<GameRecapModal isOpen onClose={jest.fn()} recap="Text" subtitle={null} />);
    expect(screen.queryByText(/Ready to paste into the team chat/)).not.toBeInTheDocument();
  });
});
