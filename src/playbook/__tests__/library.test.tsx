import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { filterConcepts, formatsIn, groupByPhase, knownPhase, matchesQuery, phasesIn } from '../library';
import PlaybookLibrary from '../PlaybookLibrary';
import type { Concept } from '../types';
import type { Playbook, PlaybooksStatus } from '../usePlaybooks';

// Phase names come from the locale by key (the fallback is the concept's own text).
const mockPhaseNames: Record<string, string> = {
  'playbook.library.phase.basics': 'Basics',
  'playbook.library.phase.attacking': 'Attacking',
  'playbook.library.phase.defending': 'Defending',
  'playbook.library.phase.transitionMinus': 'Transition: ball lost',
};
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) => {
      const text = mockPhaseNames[key] || fallback || key;
      if (!options) return text;
      return text.replace(/\{\{(\w+)\}\}/g, (_m: string, name: string) => String(options[name] ?? ''));
    },
  }),
}));

// The presentation view is tested on its own; here it only has to open and close.
jest.mock('../PlaybookPresentation', () => ({
  __esModule: true,
  default: ({ concept, onClose }: { concept: Concept; onClose: () => void }) => (
    <div data-testid="presentation">
      <span>{`showing ${concept.id}`}</span>
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
const c = (id: string, phase: string, format: Concept['format'] = '8v8', extra: Partial<Concept> = {}): Concept => ({
  id,
  title: `Title ${id}`,
  phase,
  format,
  version: 1,
  players: [
    { id: 'p', side: 'us', start: [30, 60] },
    { id: 'o', side: 'opp', start: [30, 40] },
  ],
  steps: [
    { title: 'First', text: 'Plain text', ball: 'p' },
    { title: 'Second', text: 'More' },
  ],
  ...extra,
});

const BOOK: Concept[] = [
  c('d1', 'Puolustaminen'),
  c('a1', 'Hyökkääminen', '8v8', { steps: [{ title: 'Kolmio', text: 'Pallo kiertää kolmiossa' }], question: 'Miksi?' }),
  c('t1', 'Tilanteenvaihto -'),
  c('b1', 'Perusteet'),
  c('s5', 'Hyökkääminen', '5v5'),
  c('x1', 'Oma vaihe'),
];

describe('library helpers', () => {
  it('formats in fixed order, only those present', () => {
    expect(formatsIn(BOOK)).toEqual(['5v5', '8v8']);
  });

  it('phases: known ones in library order (any dash), unknown after them', () => {
    expect(phasesIn(BOOK)).toEqual(['Perusteet', 'Hyökkääminen', 'Puolustaminen', 'Tilanteenvaihto -', 'Oma vaihe']);
    expect(knownPhase('tilanteenvaihto − ')).toBe('transitionMinus');
    expect(knownPhase('Tilanteenvaihto +')).toBe('transitionPlus');
    expect(knownPhase('Oma vaihe')).toBeUndefined();
  });

  it('search: words anywhere in title, steps or question; case and accents ignored', () => {
    expect(matchesQuery(BOOK[1], 'KOLMIO kiertaa')).toBe(true);
    expect(matchesQuery(BOOK[1], 'miksi')).toBe(true);
    expect(matchesQuery(BOOK[1], 'kolmio prässi')).toBe(false);
    expect(matchesQuery(BOOK[1], '   ')).toBe(true);
  });

  it('filters by format, phase and query together; groups by phase', () => {
    expect(filterConcepts(BOOK, { format: '8v8', phase: 'Hyökkääminen' }).map((x) => x.id)).toEqual(['a1']);
    expect(filterConcepts(BOOK, { phase: 'Tilanteenvaihto −' }).map((x) => x.id)).toEqual(['t1']);
    expect(filterConcepts(BOOK, { query: 'title s5' }).map((x) => x.id)).toEqual(['s5']);
    expect(groupByPhase(filterConcepts(BOOK, { format: '8v8' })).map((g) => [g.phase, g.concepts.map((x) => x.id)])).toEqual([
      ['Perusteet', ['b1']],
      ['Hyökkääminen', ['a1']],
      ['Puolustaminen', ['d1']],
      ['Tilanteenvaihto -', ['t1']],
      ['Oma vaihe', ['x1']],
    ]);
  });
});

describe('PlaybookLibrary', () => {
  const cardTitles = () => screen.queryAllByTestId('playbook-card').map((el) => within(el).getByText(/^Title /).textContent);

  beforeEach(() => {
    mockStatus = 'ready';
    mockPlaybooks = [
      { id: 'club', name: 'Club book', builtIn: false, concepts: BOOK },
      { id: 'matchops-examples', name: 'x', builtIn: true, concepts: [c('demo', 'Hyökkääminen')] },
    ];
  });

  it('renders nothing when closed', () => {
    const { container } = render(<PlaybookLibrary isOpen={false} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the first playbook in its first format, grouped by phase, with step counts', () => {
    render(<PlaybookLibrary isOpen onClose={jest.fn()} />);
    expect(screen.getByTestId('playbook-playbook-name')).toHaveTextContent('Club book');
    // 5v5 has one concept and comes first.
    expect(screen.getByRole('button', { name: '5v5' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '11v11' })).toBeDisabled();
    expect(cardTitles()).toEqual(['Title s5']);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '8v8' }));
    });
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Basics',
      'Attacking',
      'Defending',
      'Transition: ball lost',
      'Oma vaihe',
    ]);
    expect(cardTitles()).toEqual(['Title b1', 'Title a1', 'Title d1', 'Title t1', 'Title x1']);
    const a1 = screen.getAllByTestId('playbook-card')[1];
    expect(a1).toHaveTextContent('1 steps · Think about it');
    expect(within(a1).getByTestId('playbook-board')).toBeInTheDocument();
  });

  it('phase chips and search filter; "Show all" clears them', () => {
    render(<PlaybookLibrary isOpen onClose={jest.fn()} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '8v8' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Defending' }));
    });
    expect(cardTitles()).toEqual(['Title d1']);
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);

    act(() => {
      fireEvent.change(screen.getByTestId('playbook-search'), { target: { value: 'kolmio' } });
    });
    expect(screen.getByTestId('playbook-empty')).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    });
    expect(cardTitles()).toHaveLength(5);
  });

  it('a card opens the presentation; closing it returns with the filters kept', () => {
    render(<PlaybookLibrary isOpen onClose={jest.fn()} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '8v8' }));
    });
    act(() => {
      fireEvent.change(screen.getByTestId('playbook-search'), { target: { value: 'kolmio' } });
    });
    act(() => {
      fireEvent.click(screen.getAllByTestId('playbook-card')[0]);
    });
    expect(screen.getByText('showing a1')).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByText('close-presentation'));
    });
    expect(screen.queryByTestId('presentation')).not.toBeInTheDocument();
    expect(screen.getByTestId('playbook-search')).toHaveValue('kolmio');
    expect(screen.getByRole('button', { name: '8v8' })).toHaveAttribute('aria-pressed', 'true');
    expect(cardTitles()).toEqual(['Title a1']);
  });

  it('switches playbooks; the built-in one is named by the app', () => {
    render(<PlaybookLibrary isOpen onClose={jest.fn()} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'PePo Ops: 8v8 basics' }));
    });
    expect(screen.getByTestId('playbook-playbook-name')).toHaveTextContent('PePo Ops: 8v8 basics');
    expect(cardTitles()).toEqual(['Title demo']);
    // One phase only: no phase chips.
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
  });

  it('offline and loading states', () => {
    mockStatus = 'offline';
    const { rerender } = render(<PlaybookLibrary isOpen onClose={jest.fn()} />);
    expect(screen.getByTestId('playbook-offline')).toBeInTheDocument();
    mockStatus = 'loading';
    mockPlaybooks = [mockPlaybooks[1]];
    rerender(<PlaybookLibrary isOpen onClose={jest.fn()} />);
    expect(screen.getByTestId('playbook-loading')).toBeInTheDocument();
    expect(cardTitles()).toEqual(['Title demo']);
  });

  it('closes with the back button and Escape (not while a concept is open)', () => {
    const onClose = jest.fn();
    render(<PlaybookLibrary isOpen onClose={onClose} />);
    act(() => {
      fireEvent.click(screen.getAllByTestId('playbook-card')[0]);
    });
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      fireEvent.click(screen.getByText('close-presentation'));
    });
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    // No on-screen back arrow: the phone's back button closes the library.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
