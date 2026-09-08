/**
 * The report editor, and the Tidy button that now lives with the text.
 *
 * Tidying used to sit two cards below, under a heading that says "draft",
 * which described the wrong action and put the button furthest away at the
 * moment it is most useful: right after the coach has typed something.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameNotesEditor } from '../GameNotesEditor';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? _k).replace(/\{\{(\w+)\}\}/g, (_m, n) => String(options?.[n] ?? '')),
  }),
}));

const renderEditor = (over: Partial<React.ComponentProps<typeof GameNotesEditor>> = {}) => {
  const props = {
    gameNotes: 'Tallennettu raportti.',
    isEditingNotes: false,
    editGameNotes: '',
    notesTextareaRef: React.createRef<HTMLTextAreaElement>(),
    onStartEdit: jest.fn(),
    onSaveNotes: jest.fn(),
    onCancelEdit: jest.fn(),
    onEditNotesChange: jest.fn(),
    ...over,
  };
  render(<GameNotesEditor {...props} />);
  return props;
};

describe('GameNotesEditor - tidying lives with the text', () => {
  it('offers Tidy beside the report the coach is reading', () => {
    const onTidy = jest.fn();
    renderEditor({ onTidy });
    fireEvent.click(screen.getByTestId('report-editor-tidy'));
    expect(onTidy).toHaveBeenCalledTimes(1);
  });

  it('offers Tidy while the coach is editing, next to Template', () => {
    const onTidy = jest.fn();
    renderEditor({ onTidy, isEditingNotes: true, editGameNotes: 'Juuri kirjoitettu.' });
    expect(screen.getByTestId('report-editor-tidy')).toBeInTheDocument();
    expect(screen.getByText('Template')).toBeInTheDocument();
  });

  /** Nothing written is nothing to tidy; the other button writes one. */
  it('offers no Tidy when there is nothing written', () => {
    renderEditor({ onTidy: jest.fn(), gameNotes: '' });
    expect(screen.queryByTestId('report-editor-tidy')).not.toBeInTheDocument();
  });

  it('reads the unsaved buffer, not the saved text, while editing', () => {
    // Saved is empty but the coach has typed: there IS something to tidy.
    renderEditor({ onTidy: jest.fn(), gameNotes: '', isEditingNotes: true, editGameNotes: 'Uusi teksti.' });
    expect(screen.getByTestId('report-editor-tidy')).toBeInTheDocument();
  });

  /** @critical - a button that spends the coach's money says its own price. */
  it('shows what the request will cost', () => {
    renderEditor({ onTidy: jest.fn(), tidyEstimateUsd: 0.0234 });
    expect(screen.getByTestId('report-editor-tidy')).toHaveTextContent('Tidy this up (~$0.02)');
  });

  it('falls back to a plain label when there is no price to show', () => {
    renderEditor({ onTidy: jest.fn(), tidyEstimateUsd: 0 });
    expect(screen.getByTestId('report-editor-tidy')).toHaveTextContent('Tidy up what I wrote');
  });

  it('offers no Tidy at all when nothing can handle it', () => {
    renderEditor();
    expect(screen.queryByTestId('report-editor-tidy')).not.toBeInTheDocument();
  });
});
