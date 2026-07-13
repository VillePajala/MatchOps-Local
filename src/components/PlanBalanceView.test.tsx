import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PlanBalanceView from './PlanBalanceView';
import type { PlaytimePlan, PlanGame } from '@/utils/playtimePlanner/types';

const interpolate = (template: string, options?: Record<string, unknown>): string =>
  options
    ? template.replace(/\{\{(\w+)\}\}/g, (_m, k) => (options[k] !== undefined ? String(options[k]) : `{{${k}}}`))
    : template;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, dv?: string | Record<string, unknown>, opts?: Record<string, unknown>) =>
      typeof dv === 'string' ? interpolate(dv, opts) : '',
  }),
}));

// One 24-min game, 5v5-2-2 (5 slots). Alex plays the whole game as GK; the four
// others never take the field -> Alex at 100% of a 24' fair share, the rest at 0%.
const game = (overrides: Partial<PlanGame> = {}): PlanGame => ({
  id: 'g1',
  label: 'Game 1',
  formationId: '5v5-2-2',
  numberOfPeriods: 2,
  periodMinutes: 12,
  included: true,
  startingSlots: [{ slotId: 'gk', playerId: 'p1' }],
  subs: [],
  ...overrides,
});

const plan = (games: PlanGame[]): PlaytimePlan => ({
  id: 'p',
  name: 'Plan',
  version: 1,
  createdAt: 'x',
  updatedAt: 'x',
  players: [
    { id: 'p1', name: 'Alex' },
    { id: 'p2', name: 'Sam' },
    { id: 'p3', name: 'Jo' },
    { id: 'p4', name: 'Max' },
    { id: 'p5', name: 'Kai' },
  ],
  games,
});

afterEach(() => cleanup());

const noop = () => {};

describe('PlanBalanceView', () => {
  it('shows the fair share and counted games', () => {
    render(<PlanBalanceView plan={plan([game()])} onToggleHighlight={noop} onReplaceHighlights={noop} />);
    expect(screen.getByText(/Share 24' each/)).toBeInTheDocument();
    expect(screen.getByText(/1 games counted/)).toBeInTheDocument();
  });

  it('renders whole-colour player chips sorted least-played first, tap toggles highlight', () => {
    const onToggleHighlight = jest.fn();
    render(
      <PlanBalanceView plan={plan([game()])} onToggleHighlight={onToggleHighlight} onReplaceHighlights={noop} />,
    );
    // Alex (24') sorts LAST; a zero-minute player leads the grid.
    const chips = screen.getAllByRole('button', { name: /'\s*$/ }).filter((b) => b.getAttribute('aria-pressed') !== null);
    expect(chips[chips.length - 1]).toHaveTextContent("Alex");
    expect(chips[chips.length - 1]).toHaveTextContent("24'");
    fireEvent.click(chips[0]);
    expect(onToggleHighlight).toHaveBeenCalled();
  });

  it('surfaces the zero-minutes warning and taps it into the highlight selection', () => {
    const onReplaceHighlights = jest.fn();
    render(
      <PlanBalanceView plan={plan([game()])} onToggleHighlight={noop} onReplaceHighlights={onReplaceHighlights} />,
    );
    // Four players never take the field in the only included game.
    const warning = screen.getByRole('button', { name: /4 players with 0 minutes/ });
    expect(warning).toHaveTextContent('Jo (G1)');
    expect(warning).toHaveTextContent('+1'); // capped at 3 names, the rest counted
    fireEvent.click(warning);
    expect(onReplaceHighlights).toHaveBeenCalledWith(expect.arrayContaining(['p2', 'p3', 'p4', 'p5']));
  });

  it('warns when a single player keeps goal in every included game', () => {
    render(<PlanBalanceView plan={plan([game()])} onToggleHighlight={noop} onReplaceHighlights={noop} />);
    expect(screen.getByRole('button', { name: /Only Alex plays goalkeeper/ })).toBeInTheDocument();
  });

  it('shows the worst-off focus card by default with per-game tiles (position + minutes)', () => {
    render(
      <PlanBalanceView plan={plan([game()])} onToggleHighlight={noop} onReplaceHighlights={noop} />,
    );
    // Default focus = least-played (Jo sorts first among the 0' players): the
    // card is the only place the %-of-share line renders.
    expect(screen.getByText(/0% of share · -24 min vs own share/)).toBeInTheDocument();
    // Jo appears twice: his chip and his focus card.
    expect(screen.getAllByText('Jo')).toHaveLength(2);
    // Tile: G1 label + em dash position (never plays).
    expect(screen.getByText('G1')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('stacks one focus card per highlighted player with %-of-share and delta', () => {
    render(
      <PlanBalanceView
        plan={plan([game()])}
        highlightPlayerIds={['p1', 'p2']}
        onToggleHighlight={noop}
        onReplaceHighlights={noop}
      />,
    );
    // Alex: full game = 100% of share, on fair share; his tile names the GK slot.
    expect(screen.getByText(/100% of share · on fair share/)).toBeInTheDocument();
    expect(screen.getByText(/0% of share · -24 min vs own share/)).toBeInTheDocument();
    expect(screen.getByText('GK')).toBeInTheDocument();
  });

  it('focus tiles jump to the game lineup when onOpenGame is provided', () => {
    const onOpenGame = jest.fn();
    render(
      <PlanBalanceView
        plan={plan([game()])}
        onToggleHighlight={noop}
        onReplaceHighlights={noop}
        onOpenGame={onOpenGame}
      />,
    );
    // The tile carries the game's full label as its title (warning buttons also
    // mention G1, so disambiguate by title).
    fireEvent.click(screen.getByTitle('Game 1'));
    expect(onOpenGame).toHaveBeenCalledWith('g1');
  });

  it('reports no games counted when none are included', () => {
    render(
      <PlanBalanceView plan={plan([game({ included: false })])} onToggleHighlight={noop} onReplaceHighlights={noop} />,
    );
    expect(screen.getByText('No games counted yet. Mark games as included.')).toBeInTheDocument();
  });
});
