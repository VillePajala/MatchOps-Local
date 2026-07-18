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

  it('Positions read: shows each player’s zone breakdown and flags single-position players', () => {
    render(<PlanBalanceView plan={plan([game()])} onToggleHighlight={noop} onReplaceHighlights={noop} />);
    // Default mode is Minutes; the position breakdown is not shown yet.
    expect(screen.queryByText(/GK 24'/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Positions' }));

    // Alex plays the whole 24' game in goal -> one GK zone worth 24 minutes,
    // and the single-position variety flag.
    expect(screen.getByText(/GK 24'/)).toBeInTheDocument();
    expect(screen.getByText(/only one position/)).toBeInTheDocument();
  });

  it('Roles read: two same-zone roles show as distinct positions with a role count', () => {
    // Alex plays LDM in one game and RDM in the next - both midfield (one zone),
    // two distinct roles. The Roles sub-view must surface both.
    const p = plan([
      game({ id: 'g1', startingSlots: [{ slotId: 's0', playerId: 'p1' }] }),
      game({ id: 'g2', startingSlots: [{ slotId: 's1', playerId: 'p1' }] }),
    ]);
    render(<PlanBalanceView plan={p} onToggleHighlight={noop} onReplaceHighlights={noop} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Positions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roles' }));

    expect(screen.getByText(/LDM 24'/)).toBeInTheDocument();
    expect(screen.getByText(/RDM 24'/)).toBeInTheDocument();
    expect(screen.getByText(/2 roles/)).toBeInTheDocument();
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

  it('a player absent from every game neither triggers the spread warning nor becomes the default focus', () => {
    // p2-p4 each play the full 24' (equal), p5 never plays anywhere, p1 keeps
    // goal. Kai (p5) is marked absent from the only game: his 0 minutes are a
    // DECISION, so the 24-min spread against him must not raise the warning,
    // and the default "worst-off" focus must be a participant instead.
    const g = game({
      startingSlots: [
        { slotId: 'gk', playerId: 'p1' },
        { slotId: 's0', playerId: 'p2' },
        { slotId: 's1', playerId: 'p3' },
        { slotId: 's2', playerId: 'p4' },
      ],
      absentIds: ['p5'],
    });
    render(<PlanBalanceView plan={plan([g])} onToggleHighlight={noop} onReplaceHighlights={noop} />);
    expect(screen.queryByText(/min spread/)).not.toBeInTheDocument();
    // Kai appears once (his chip) - NOT twice (chip + default focus card).
    expect(screen.getAllByText('Kai')).toHaveLength(1);
  });

  it('reports no games counted when none are included', () => {
    render(
      <PlanBalanceView plan={plan([game({ included: false })])} onToggleHighlight={noop} onReplaceHighlights={noop} />,
    );
    expect(screen.getByText('No games counted yet. Mark games as included.')).toBeInTheDocument();
  });
});

describe('zero-minutes warning split (rotation vs forgotten)', () => {
  const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const mkGame = (id: string, starters: string[]): PlanGame => ({
    id,
    label: id,
    formationId: '5v5-2-2',
    numberOfPeriods: 2,
    periodMinutes: 10,
    included: true,
    startingSlots: starters.map((pid, i) => ({ slotId: i === 0 ? 'gk' : `s${i - 1}`, playerId: pid })),
    subs: [],
  });

  it('rotated starters (everyone plays somewhere) -> amber sits-out, NO red alarm', () => {
    // G1 starts p0,p1; G2 starts p2,p3 - every player sits out one full game
    // but everyone has minutes. The old combined warning shouted "4 players
    // with 0 minutes" at a fully-used roster.
    const plan = {
      id: 'x', name: 'X', version: 1, createdAt: 'x', updatedAt: 'x',
      players,
      games: [mkGame('g1', ['p0', 'p1']), mkGame('g2', ['p2', 'p3'])],
    };
    render(
      <PlanBalanceView plan={plan as never} onToggleHighlight={jest.fn()} onReplaceHighlights={jest.fn()} />,
    );
    expect(screen.queryByText(/players with 0 minutes/)).not.toBeInTheDocument();
    expect(screen.getByText('4 players sit out a full game')).toBeInTheDocument();
  });

  it('a player with NO minutes anywhere still raises the red alarm', () => {
    const plan = {
      id: 'x', name: 'X', version: 1, createdAt: 'x', updatedAt: 'x',
      players,
      games: [mkGame('g1', ['p0', 'p1']), mkGame('g2', ['p0', 'p1'])],
    };
    render(
      <PlanBalanceView plan={plan as never} onToggleHighlight={jest.fn()} onReplaceHighlights={jest.fn()} />,
    );
    expect(screen.getByText('2 players with 0 minutes')).toBeInTheDocument();
  });
});
