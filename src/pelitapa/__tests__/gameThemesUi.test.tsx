/**
 * Pelitapa game themes in the UI: the library's selection mode (the picker)
 * and the themes control on the next-match card / in the game forms.
 * @integration
 */
import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import PelitapaLibrary from '../PelitapaLibrary';
import GameThemesControl from '../GameThemesControl';
import type { Concept } from '../types';
import type { Playbook, PlaybooksStatus } from '../usePlaybooks';
import type { PresentationSequence } from '../PelitapaPresentation';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) => {
      const text = fallback || key;
      if (!options) return text;
      return text.replace(/\{\{(\w+)\}\}/g, (_m: string, name: string) => String(options[name] ?? ''));
    },
  }),
}));

// The presentation is tested on its own; here: which concept, and the sequence's "next".
jest.mock('../PelitapaPresentation', () => ({
  __esModule: true,
  default: ({ concept, onClose, sequence }: { concept: Concept; onClose: () => void; sequence?: PresentationSequence }) => (
    <div data-testid="presentation">
      <span data-testid="presenting">{concept.id}</span>
      {sequence && <span data-testid="sequence">{`${sequence.index + 1}/${sequence.total}`}</span>}
      {sequence && <button onClick={() => sequence.onNext({ focus: false })}>next-theme</button>}
      <button onClick={onClose}>close-presentation</button>
    </div>
  ),
}));

let mockPlaybooks: Playbook[] = [];
let mockStatus: PlaybooksStatus = 'ready';
jest.mock('../usePlaybooks', () => ({
  usePlaybooks: () => ({ playbooks: mockPlaybooks, status: mockStatus, refresh: jest.fn() }),
}));

/** SYNTHETIC concepts. */
const c = (id: string, phase = 'Hyökkääminen'): Concept => ({
  id,
  title: `Title ${id}`,
  phase,
  format: '8v8',
  version: 1,
  players: [
    { id: 'p', side: 'us', start: [30, 60] },
    { id: 'o', side: 'opp', start: [30, 40] },
  ],
  steps: [{ title: 'First', text: 'Plain text', ball: 'p' }],
});

const CLUB: Playbook = { id: 'club', name: 'Club', builtIn: false, concepts: [c('a'), c('b'), c('d', 'Puolustaminen')] };

beforeEach(() => {
  mockPlaybooks = [CLUB];
  mockStatus = 'ready';
});

describe('picker (library selection mode)', () => {
  it('picks several concepts in tap order and hands them back on Done', () => {
    const onDone = jest.fn();
    render(<PelitapaLibrary isOpen onClose={jest.fn()} selection={{ initial: [], onDone }} />);

    const cards = screen.getAllByTestId('pelitapa-card');
    const byTitle = (title: string) => cards.find((el) => el.textContent?.includes(title)) as HTMLElement;
    fireEvent.click(byTitle('Title b'));
    fireEvent.click(byTitle('Title a'));

    expect(byTitle('Title b')).toHaveAttribute('aria-pressed', 'true');
    expect(byTitle('Title d')).toHaveAttribute('aria-pressed', 'false');
    const marks = screen.getAllByTestId('pelitapa-pick-mark').map((m) => m.textContent);
    expect(marks.filter(Boolean).sort()).toEqual(['1', '2']);
    expect(screen.getByTestId('pelitapa-pick-count')).toHaveTextContent('2 chosen');

    fireEvent.click(screen.getByTestId('pelitapa-pick-done'));
    expect(onDone).toHaveBeenCalledWith([
      { playbookId: 'club', conceptId: 'b' },
      { playbookId: 'club', conceptId: 'a' },
    ]);
  });

  it('a second tap unpicks; the starting selection is shown as picked', () => {
    const onDone = jest.fn();
    render(
      <PelitapaLibrary
        isOpen
        onClose={jest.fn()}
        selection={{ initial: [{ playbookId: 'club', conceptId: 'a' }], onDone }}
      />,
    );
    const cardA = screen.getAllByTestId('pelitapa-card').find((el) => el.textContent?.includes('Title a')) as HTMLElement;
    expect(cardA).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(cardA);
    expect(cardA).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByTestId('pelitapa-pick-done'));
    expect(onDone).toHaveBeenCalledWith([]);
  });

  it('the eye previews a concept without picking it', () => {
    render(<PelitapaLibrary isOpen onClose={jest.fn()} selection={{ initial: [], onDone: jest.fn() }} />);
    fireEvent.click(screen.getAllByTestId('pelitapa-preview')[0]);
    expect(screen.getByTestId('presenting')).toBeInTheDocument();
    fireEvent.click(screen.getByText('close-presentation'));
    expect(screen.getByTestId('pelitapa-pick-count')).toHaveTextContent('No theme chosen');
  });

  /** @edge-case a withdrawn grant must not crash the picker or silently drop the pick */
  it('lists a picked concept the account can no longer read as unavailable, removable', () => {
    const onDone = jest.fn();
    const gone = { playbookId: 'other-club', conceptId: 'secret' };
    render(
      <PelitapaLibrary
        isOpen
        onClose={jest.fn()}
        selection={{ initial: [gone, { playbookId: 'club', conceptId: 'a' }], onDone }}
      />,
    );
    const panel = screen.getByTestId('pelitapa-unavailable');
    expect(panel).toHaveTextContent('No longer available');
    expect(panel).toHaveTextContent('Theme 1');
    expect(panel).not.toHaveTextContent('secret');

    // Kept unless removed...
    fireEvent.click(screen.getByTestId('pelitapa-pick-done'));
    expect(onDone).toHaveBeenLastCalledWith([gone, { playbookId: 'club', conceptId: 'a' }]);
    // ...and removable.
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove' }));
    expect(screen.queryByTestId('pelitapa-unavailable')).toBeNull();
    fireEvent.click(screen.getByTestId('pelitapa-pick-done'));
    expect(onDone).toHaveBeenLastCalledWith([{ playbookId: 'club', conceptId: 'a' }]);
  });

  it('does not call anything unavailable while the club playbooks are still loading', () => {
    mockStatus = 'loading';
    mockPlaybooks = [];
    render(
      <PelitapaLibrary
        isOpen
        onClose={jest.fn()}
        selection={{ initial: [{ playbookId: 'club', conceptId: 'a' }], onDone: jest.fn() }}
      />,
    );
    expect(screen.queryByTestId('pelitapa-unavailable')).toBeNull();
  });

  it('the close button cancels without handing anything back', () => {
    const onClose = jest.fn();
    const onDone = jest.fn();
    render(<PelitapaLibrary isOpen onClose={onClose} selection={{ initial: [], onDone }} />);
    fireEvent.click(screen.getByTestId('pelitapa-pick-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('themes row on the next-match card', () => {
  it('none: offers "Choose a theme", which opens the picker', () => {
    render(<GameThemesControl themes={[]} onChange={jest.fn()} variant="card" />);
    expect(screen.queryByTestId('game-theme-row')).toBeNull();
    fireEvent.click(screen.getByTestId('game-theme-choose'));
    expect(screen.getByTestId('pelitapa-library')).toBeInTheDocument();
  });

  it('one: "Theme" and its title; a tap opens its presentation', () => {
    render(<GameThemesControl themes={[{ playbookId: 'club', conceptId: 'b' }]} onChange={jest.fn()} variant="card" />);
    const row = screen.getByTestId('game-theme-row');
    expect(row).toHaveTextContent('Theme');
    expect(screen.getByTestId('game-theme-summary')).toHaveTextContent('Title b');
    fireEvent.click(screen.getByTestId('game-theme-show'));
    expect(screen.getByTestId('presenting')).toHaveTextContent('b');
    expect(screen.queryByTestId('sequence')).toBeNull();
  });

  it('many: "Themes: n", and the presentation steps through them in pick order', () => {
    render(
      <GameThemesControl
        themes={[
          { playbookId: 'club', conceptId: 'd' },
          { playbookId: 'club', conceptId: 'a' },
        ]}
        onChange={jest.fn()}
        variant="card"
      />,
    );
    expect(screen.getByTestId('game-theme-row')).toHaveTextContent('Themes: 2');
    expect(screen.getByTestId('game-theme-summary')).toHaveTextContent('Title d · Title a');
    fireEvent.click(screen.getByTestId('game-theme-show'));
    expect(screen.getByTestId('presenting')).toHaveTextContent('d');
    expect(screen.getByTestId('sequence')).toHaveTextContent('1/2');
    fireEvent.click(screen.getByText('next-theme'));
    expect(screen.getByTestId('presenting')).toHaveTextContent('a');
    expect(screen.getByTestId('sequence')).toHaveTextContent('2/2');
  });

  /** @edge-case */
  it('an unavailable theme reads "Not available" and is skipped by the presentation', () => {
    render(
      <GameThemesControl
        themes={[
          { playbookId: 'gone', conceptId: 'x' },
          { playbookId: 'club', conceptId: 'a' },
        ]}
        onChange={jest.fn()}
        variant="card"
      />,
    );
    expect(screen.getByTestId('game-theme-summary')).toHaveTextContent('Not available · Title a');
    fireEvent.click(screen.getByTestId('game-theme-show'));
    expect(screen.getByTestId('presenting')).toHaveTextContent('a');
    expect(screen.queryByTestId('sequence')).toBeNull();
  });

  it('only unavailable themes: the row opens the picker instead of an empty presentation', () => {
    render(<GameThemesControl themes={[{ playbookId: 'gone', conceptId: 'x' }]} onChange={jest.fn()} variant="card" />);
    fireEvent.click(screen.getByTestId('game-theme-show'));
    expect(screen.queryByTestId('presentation')).toBeNull();
    expect(screen.getByTestId('pelitapa-library')).toBeInTheDocument();
  });

  it('the pencil opens the picker and Done saves the new selection', async () => {
    const onChange = jest.fn();
    render(<GameThemesControl themes={[{ playbookId: 'club', conceptId: 'a' }]} onChange={onChange} variant="card" />);
    fireEvent.click(screen.getByTestId('game-theme-edit'));
    const cardB = screen.getAllByTestId('pelitapa-card').find((el) => el.textContent?.includes('Title b')) as HTMLElement;
    fireEvent.click(cardB);
    await act(async () => {
      fireEvent.click(screen.getByTestId('pelitapa-pick-done'));
    });
    expect(onChange).toHaveBeenCalledWith([
      { playbookId: 'club', conceptId: 'a' },
      { playbookId: 'club', conceptId: 'b' },
    ]);
    expect(screen.queryByTestId('pelitapa-library')).toBeNull();
  });
});

describe('themes in the game forms', () => {
  it('lists the picked themes in order with show and change actions', () => {
    render(
      <GameThemesControl
        themes={[
          { playbookId: 'club', conceptId: 'b' },
          { playbookId: 'club', conceptId: 'a' },
        ]}
        onChange={jest.fn()}
        variant="form"
      />,
    );
    const items = within(screen.getByTestId('game-theme-list')).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([expect.stringContaining('Title b'), expect.stringContaining('Title a')]);
    expect(screen.getByTestId('game-theme-show')).toHaveTextContent('Show themes');
    expect(screen.getByTestId('game-theme-edit')).toBeInTheDocument();
  });

  it('empty: a hint and "Choose themes", no show button', () => {
    render(<GameThemesControl themes={[]} onChange={jest.fn()} variant="form" />);
    expect(screen.queryByTestId('game-theme-show')).toBeNull();
    expect(screen.getByTestId('game-theme-choose')).toHaveTextContent('Choose themes');
  });
});
