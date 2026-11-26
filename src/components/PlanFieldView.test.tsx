import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import PlanFieldView from './PlanFieldView';
import type { PlanGame, PlanPlayer } from '@/utils/playtimePlanner/types';

const interpolate = (template: string, options?: Record<string, unknown>): string =>
  options
    ? template.replace(/\{\{(\w+)\}\}/g, (_m, k) => (options[k] !== undefined ? String(options[k]) : `{{${k}}}`))
    : template;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, dv?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      if (typeof dv === 'string') return interpolate(dv, opts);
      // Options-object form incl. i18next plurals: t(key, { count, defaultValue_one, defaultValue_other }).
      const o = (dv ?? {}) as Record<string, unknown>;
      const template =
        o.count === 1 && typeof o.defaultValue_one === 'string'
          ? o.defaultValue_one
          : typeof o.defaultValue_other === 'string'
            ? o.defaultValue_other
            : '';
      return interpolate(template, o);
    },
  }),
}));

// The chain sheet's phone-back registration is covered in its own suites.
jest.mock('@/hooks/useModalHardwareBack', () => ({
  useHardwareBackSubLevel: jest.fn(),
}));

const players: PlanPlayer[] = [
  { id: 'p1', name: 'Alex' },
  { id: 'p2', name: 'Sam' },
  { id: 'p3', name: 'Jo' },
  { id: 'p4', name: 'Max' },
  { id: 'p5', name: 'Kai' },
];

const makeGame = (startingSlots: PlanGame['startingSlots'] = []): PlanGame => ({
  id: 'g1',
  label: 'Game 1',
  formationId: '5v5-2-2', // GK + 4 field = 5 slots
  numberOfPeriods: 2,
  periodMinutes: 12,
  included: true,
  startingSlots,
  subs: [],
});

afterEach(() => cleanup());

describe('PlanFieldView', () => {
  it('assigns a bench player to a tapped empty slot', () => {
    const onAssign = jest.fn();
    render(<PlanFieldView game={makeGame()} players={players} onAssign={onAssign} />);

    // Tap the goalkeeper slot (unique aria-label), then a bench player.
    fireEvent.click(screen.getByLabelText('GK: empty'));
    fireEvent.click(screen.getByRole('button', { name: /^Alex/ }));

    expect(onAssign).toHaveBeenCalledWith('gk', 'p1');
  });

  it('quick-places a bench player into the first empty outfield slot (not the GK)', () => {
    const onAssign = jest.fn();
    render(<PlanFieldView game={makeGame()} players={players} onAssign={onAssign} />);

    // No slot selected: tapping a bench player drops them into the first empty
    // slot, skipping the goalkeeper so nobody is silently made the keeper.
    fireEvent.click(screen.getByRole('button', { name: /^Sam/ }));
    expect(onAssign).toHaveBeenCalledTimes(1);
    expect(onAssign).toHaveBeenCalledWith('s0', 'p2');
  });

  it('auto-fills every empty slot from the bench', () => {
    const onAssign = jest.fn();
    render(<PlanFieldView game={makeGame()} players={players} onAssign={onAssign} />);

    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }));
    // 5 slots (GK + 4 field), 5 bench players → all slots filled, distinct players.
    expect(onAssign).toHaveBeenCalledTimes(5);
    const assignedPlayers = onAssign.mock.calls.map((c) => c[1]);
    expect(new Set(assignedPlayers).size).toBe(5);
  });

  it('renders a slot with a planned sub as a divided pill: both names + minute visible', () => {
    const game: PlanGame = {
      ...makeGame([{ slotId: 'gk', playerId: 'p1' }]),
      subs: [{ id: 's1', slotId: 'gk', timeSeconds: 6 * 60, inPlayerId: 'p2' }],
    };
    render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} />);
    // Starter and incoming player are BOTH permanently on the field (no tooltip),
    // with the sub minute as a tag on the incoming segment.
    const slot = screen.getByLabelText("GK: Alex; 6' Sam");
    expect(slot).toHaveTextContent('Alex');
    expect(slot).toHaveTextContent("6'");
    expect(slot).toHaveTextContent('Sam');
  });

  it('keeps a scheduled sub visible as a pill even after the starter is cleared', () => {
    // The engine still grants the incoming player minutes from 12' on, so the
    // field must not pretend the slot is plain empty (regression guard).
    const game: PlanGame = {
      ...makeGame([]), // no starter in the GK slot
      subs: [{ id: 's1', slotId: 'gk', timeSeconds: 6 * 60, inPlayerId: 'p2' }],
    };
    render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} />);
    const slot = screen.getByLabelText(/GK: empty; 6' Sam/);
    expect(slot).toHaveTextContent("6'");
    expect(slot).toHaveTextContent('Sam');
  });

  it('folds the incoming players into the slot aria-label (SRs never see pill contents)', () => {
    const game: PlanGame = {
      ...makeGame([{ slotId: 'gk', playerId: 'p1' }]),
      subs: [{ id: 's1', slotId: 'gk', timeSeconds: 6 * 60, inPlayerId: 'p2' }],
    };
    render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} />);
    expect(screen.getByLabelText("GK: Alex; 6' Sam")).toBeInTheDocument();
  });

  it('a sub at the final whistle grants nothing and must NOT silence the bench alarm', () => {
    // 2×12 min game: a "sub" at 24' is zero seconds of playtime.
    const game: PlanGame = {
      ...makeGame([{ slotId: 'gk', playerId: 'p1' }]),
      subs: [{ id: 's1', slotId: 'gk', timeSeconds: 24 * 60, inPlayerId: 'p2' }],
    };
    render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} />);
    // Sam's bench chip still carries the "Not in this game" alarm.
    expect(screen.getByRole('button', { name: /Sam.*Not in this game/ })).toBeInTheDocument();
  });

  it('highlight mode rings the tracked player and dims the rest', () => {
    render(
      <PlanFieldView
        game={makeGame([{ slotId: 'gk', playerId: 'p1' }])}
        players={players}
        onAssign={jest.fn()}
        highlightPlayerIds={["p2"]}
      />,
    );
    // Sam (bench) is tracked: their DISC (inner span) is ringed, not dimmed.
    const sam = screen.getByRole('button', { name: /^Sam/ });
    expect(sam.querySelector('span')?.className).toContain('ring-amber-300');
    // Dimming lives on the positioning wrapper (the disc button's parent).
    const alexSlot = screen.getByLabelText('GK: Alex');
    expect(alexSlot.parentElement?.className).toContain('opacity-40');
  });

  it('clears an occupied slot completely via onClearSlot (no partial fallback)', () => {
    const onAssign = jest.fn();
    const onClearSlot = jest.fn();
    render(
      <PlanFieldView
        game={makeGame([{ slotId: 'gk', playerId: 'p1' }])}
        players={players}
        onAssign={onAssign}
        onClearSlot={onClearSlot}
      />,
    );

    // GK slot now shows the player in its label.
    fireEvent.click(screen.getByLabelText('GK: Alex'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onClearSlot).toHaveBeenCalledWith('gk');
    // Without onClearSlot wired the button doesn't render at all - "Clear"
    // can never silently mean starter-only.
    expect(onAssign).not.toHaveBeenCalledWith('gk', null);
  });

  it('shows cumulative plan minutes on bench chips and filled discs when provided', () => {
    render(
      <PlanFieldView
        game={makeGame([{ slotId: 'gk', playerId: 'p1' }])}
        players={players}
        onAssign={jest.fn()}
        minutesByPlayer={{
          p1: { minutes: 42, ratio: 1.0 },
          p2: { minutes: 6, ratio: 0.2 },
        }}
      />,
    );
    // Bench chip: name + tinted minutes (number AND colour, never colour alone).
    expect(screen.getByRole('button', { name: /Sam 6'/ })).toBeInTheDocument();
    // Filled disc: minutes under the disc.
    expect(screen.getByText("42'")).toBeInTheDocument();
  });

  it('excludes assigned players from the bench', () => {
    render(
      <PlanFieldView
        game={makeGame([{ slotId: 'gk', playerId: 'p1' }])}
        players={players}
        onAssign={jest.fn()}
      />,
    );
    // Bench buttons list the unassigned players, not the placed one. Alex sits on
    // the GK disc (accessible name "GK: Alex"), so there is no bench button "Alex".
    expect(screen.queryByRole('button', { name: /^Alex/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sam/ })).toBeInTheDocument();
  });
});

describe('PlanFieldView direct manipulation (tap-tap swap / move / clear)', () => {
  it('tap one filled disc, tap another: the two players swap whole-game', () => {
    const onSwapPlayers = jest.fn();
    render(
      <PlanFieldView
        game={makeGame([
          { slotId: 'gk', playerId: 'p1' },
          { slotId: 's0', playerId: 'p2' },
        ])}
        players={players}
        onAssign={jest.fn()}
        onSwapPlayers={onSwapPlayers}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'GK: Alex' }));
    fireEvent.click(screen.getByRole('button', { name: '#1: Sam' }));
    expect(onSwapPlayers).toHaveBeenCalledWith('p1', 'p2');
  });

  it('tap a pill STINT, tap a disc with no stint handler wired: falls back to the whole-game swap', () => {
    const onSwapPlayers = jest.fn();
    const game = {
      ...makeGame([
        { slotId: 'gk', playerId: 'p1' },
        { slotId: 's0', playerId: 'p3' },
      ]),
      subs: [{ id: 'x1', slotId: 'gk', timeSeconds: 720, inPlayerId: 'p2' }],
    };
    render(
      <PlanFieldView game={game} players={players} onAssign={jest.fn()} onSwapPlayers={onSwapPlayers} />,
    );
    // The 12' Sam segment is its own tap target inside the GK pill.
    fireEvent.click(screen.getByRole('button', { name: "12' Sam (GK)" }));
    fireEvent.click(screen.getByRole('button', { name: '#1: Jo' }));
    expect(onSwapPlayers).toHaveBeenCalledWith('p2', 'p3');
  });

  it('tap a filled disc, tap an empty spot: the player moves there', () => {
    const onAssign = jest.fn();
    render(
      <PlanFieldView
        game={makeGame([{ slotId: 's0', playerId: 'p1' }])}
        players={players}
        onAssign={onAssign}
        onSwapPlayers={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '#1: Alex' }));
    fireEvent.click(screen.getByRole('button', { name: 'GK: empty' }));
    expect(onAssign).toHaveBeenCalledWith('gk', 'p1');
  });

  it('tap a pill stint, tap an empty spot: the STINT moves to that position', () => {
    const onMoveSub = jest.fn();
    const game = {
      ...makeGame([{ slotId: 'gk', playerId: 'p1' }]),
      subs: [{ id: 'x1', slotId: 'gk', timeSeconds: 720, inPlayerId: 'p2' }],
    };
    render(
      <PlanFieldView game={game} players={players} onAssign={jest.fn()} onMoveSub={onMoveSub} />,
    );
    fireEvent.click(screen.getByRole('button', { name: "12' Sam (GK)" }));
    fireEvent.click(screen.getByRole('button', { name: '#1: empty' }));
    expect(onMoveSub).toHaveBeenCalledWith('x1', 's0');
  });

  it('tap a stint, tap its own empty kickoff spot: the incomer is PROMOTED to starter', () => {
    const onPromoteSub = jest.fn();
    const onMoveSub = jest.fn();
    const game = {
      ...makeGame([]), // GK slot starterless
      subs: [{ id: 'x1', slotId: 'gk', timeSeconds: 720, inPlayerId: 'p2' }],
    };
    render(
      <PlanFieldView
        game={game}
        players={players}
        onAssign={jest.fn()}
        onMoveSub={onMoveSub}
        onPromoteSub={onPromoteSub}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "12' Sam (GK)" }));
    fireEvent.click(screen.getByRole('button', { name: 'GK: empty' }));
    expect(onPromoteSub).toHaveBeenCalledWith('x1', 'gk', 'p2');
    expect(onMoveSub).not.toHaveBeenCalled();
  });

  it('tap a pill stint, tap a bench disc: that player takes over the stint', () => {
    const onSetSubPlayer = jest.fn();
    const game = {
      ...makeGame([{ slotId: 'gk', playerId: 'p1' }]),
      subs: [{ id: 'x1', slotId: 'gk', timeSeconds: 720, inPlayerId: 'p2' }],
    };
    render(
      <PlanFieldView game={game} players={players} onAssign={jest.fn()} onSetSubPlayer={onSetSubPlayer} />,
    );
    fireEvent.click(screen.getByRole('button', { name: "12' Sam (GK)" }));
    fireEvent.click(screen.getByRole('button', { name: /^Jo/ }));
    expect(onSetSubPlayer).toHaveBeenCalledWith('x1', 'p3');
  });

  describe('a selected stint can go to ANY player (owner report: not just the bench)', () => {
    // Alex starts in goal, Sam comes on for him at 12'; Jo starts #1.
    const stintGame = () => ({
      ...makeGame([
        { slotId: 'gk', playerId: 'p1' },
        { slotId: 's0', playerId: 'p3' },
      ]),
      subs: [{ id: 'x1', slotId: 'gk', timeSeconds: 720, inPlayerId: 'p2' }],
    });

    it('lists players already in this game under their own label, after the bench', () => {
      render(
        <PlanFieldView game={stintGame()} players={players} onAssign={jest.fn()} onSetSubPlayer={jest.fn()} />,
      );
      // Without a stint selected the strip is the plain bench (no starters).
      expect(screen.queryByText('Already in this game')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: "12' Sam (GK)" }));
      expect(screen.getByText('Already in this game')).toBeInTheDocument();
      const inGame = screen.getByTestId('plan-stint-in-game');
      // Jo (starter elsewhere) is offered; Alex (who goes off for this change)
      // and Sam (the stint's own player) are not - both would be no-ops.
      expect(inGame).toHaveTextContent('Jo');
      expect(inGame).not.toHaveTextContent('Alex');
      expect(inGame).not.toHaveTextContent('Sam');
      // True bench players still come first, outside the in-game group.
      expect(screen.getByRole('button', { name: /^Max/ })).toBeInTheDocument();
      expect(inGame).not.toHaveTextContent('Max');
    });

    it('excludes absentees from both groups', () => {
      const game = { ...stintGame(), absentIds: ['p3', 'p4'] };
      render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} onSetSubPlayer={jest.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: "12' Sam (GK)" }));
      expect(screen.queryByText('Already in this game')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Max/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Kai/ })).toBeInTheDocument();
    });

    it('tapping an in-game player sets the stint - no whole-game swap', () => {
      const onSetSubPlayer = jest.fn();
      const onSwapPlayers = jest.fn();
      render(
        <PlanFieldView
          game={stintGame()}
          players={players}
          onAssign={jest.fn()}
          onSetSubPlayer={onSetSubPlayer}
          onSwapPlayers={onSwapPlayers}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: "12' Sam (GK)" }));
      const inGame = screen.getByTestId('plan-stint-in-game');
      fireEvent.click(inGame.querySelector('button') as HTMLButtonElement);
      expect(onSetSubPlayer).toHaveBeenCalledWith('x1', 'p3');
      expect(onSwapPlayers).not.toHaveBeenCalled();
    });

    it('tapping a player disc on the field sets the stint - no whole-game swap', () => {
      const onSetSubPlayer = jest.fn();
      const onSwapPlayers = jest.fn();
      render(
        <PlanFieldView
          game={stintGame()}
          players={players}
          onAssign={jest.fn()}
          onSetSubPlayer={onSetSubPlayer}
          onSwapPlayers={onSwapPlayers}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: "12' Sam (GK)" }));
      fireEvent.click(screen.getByRole('button', { name: '#1: Jo' }));
      expect(onSetSubPlayer).toHaveBeenCalledWith('x1', 'p3');
      expect(onSwapPlayers).not.toHaveBeenCalled();
    });

    it('a kickoff slot selected, then another starter: still the two-starters swap', () => {
      const onSetSubPlayer = jest.fn();
      const onSwapPlayers = jest.fn();
      render(
        <PlanFieldView
          game={stintGame()}
          players={players}
          onAssign={jest.fn()}
          onSetSubPlayer={onSetSubPlayer}
          onSwapPlayers={onSwapPlayers}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'GK: Alex' }));
      fireEvent.click(screen.getByRole('button', { name: '#1: Jo' }));
      expect(onSwapPlayers).toHaveBeenCalledWith('p1', 'p3');
      expect(onSetSubPlayer).not.toHaveBeenCalled();
    });
  });

  it('Sub… is reachable from a selected STINT segment (grow an already-subbed pill)', () => {
    const onRequestSub = jest.fn();
    const game = {
      ...makeGame([{ slotId: 'gk', playerId: 'p1' }]),
      subs: [{ id: 'x1', slotId: 'gk', timeSeconds: 720, inPlayerId: 'p2' }],
    };
    render(
      <PlanFieldView game={game} players={players} onAssign={jest.fn()} onRequestSub={onRequestSub} />,
    );
    fireEvent.click(screen.getByRole('button', { name: "12' Sam (GK)" }));
    fireEvent.click(screen.getByRole('button', { name: 'Sub…' }));
    expect(onRequestSub).toHaveBeenCalledWith('gk');
  });

  it('Sub… is reachable on a STARTERLESS rotation pill', () => {
    const onRequestSub = jest.fn();
    const game = {
      ...makeGame([]),
      subs: [{ id: 'x1', slotId: 'gk', timeSeconds: 720, inPlayerId: 'p2' }],
    };
    render(
      <PlanFieldView game={game} players={players} onAssign={jest.fn()} onRequestSub={onRequestSub} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'GK: empty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sub…' }));
    expect(onRequestSub).toHaveBeenCalledWith('gk');
  });

  it('Remove sub action deletes the selected stint', () => {
    const onRemoveSub = jest.fn();
    const game = {
      ...makeGame([{ slotId: 'gk', playerId: 'p1' }]),
      subs: [{ id: 'x1', slotId: 'gk', timeSeconds: 720, inPlayerId: 'p2' }],
    };
    render(
      <PlanFieldView game={game} players={players} onAssign={jest.fn()} onRemoveSub={onRemoveSub} />,
    );
    fireEvent.click(screen.getByRole('button', { name: "12' Sam (GK)" }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove sub' }));
    expect(onRemoveSub).toHaveBeenCalledWith('x1');
  });

  it('Clear empties the selected position INCLUDING its scheduled subs', () => {
    const onClearSlot = jest.fn();
    const game = {
      ...makeGame([{ slotId: 'gk', playerId: 'p1' }]),
      subs: [{ id: 'x1', slotId: 'gk', timeSeconds: 720, inPlayerId: 'p2' }],
    };
    render(
      <PlanFieldView game={game} players={players} onAssign={jest.fn()} onClearSlot={onClearSlot} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'GK: Alex' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClearSlot).toHaveBeenCalledWith('gk');
  });

  it('Clear field lives under the bench (Clear all games moved to the Settings tab)', () => {
    const onClearAll = jest.fn();
    render(
      <PlanFieldView
        game={makeGame([{ slotId: 'gk', playerId: 'p1' }])}
        players={players}
        onAssign={jest.fn()}
        onClearAll={onClearAll}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear field' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Clear all games' })).not.toBeInTheDocument();
  });

  it('Clear field hides on an empty game', () => {
    render(
      <PlanFieldView
        game={makeGame([])}
        players={players}
        onAssign={jest.fn()}
        onClearAll={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Clear field' })).not.toBeInTheDocument();
  });
});

describe('PlanFieldView conflict banner (simultaneity flags)', () => {
  it('flags a player scheduled in two slots at the same minutes', () => {
    const game = {
      ...makeGame([
        { slotId: 's0', playerId: 'p1' },
        { slotId: 's1', playerId: 'p2' },
      ]),
      // Alex holds s0 all game AND comes into s1 at 12' - impossible overlap.
      subs: [{ id: 'x1', slotId: 's1', timeSeconds: 720, inPlayerId: 'p1' }],
    };
    render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} />);
    const banner = screen.getByTestId('plan-conflict-banner');
    expect(banner).toHaveTextContent('Alex');
    expect(banner).toHaveTextContent('at the same time');
  });

  it('stays silent for a legal rotation (two players trading one slot)', () => {
    const game = {
      ...makeGame([{ slotId: 's0', playerId: 'p1' }]),
      subs: [
        { id: 'x1', slotId: 's0', timeSeconds: 480, inPlayerId: 'p2' },
        { id: 'x2', slotId: 's0', timeSeconds: 960, inPlayerId: 'p1' },
      ],
    };
    render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} />);
    expect(screen.queryByTestId('plan-conflict-banner')).not.toBeInTheDocument();
  });
});


/**
 * Owner report: long chains stacked down the pitch and ran over the next
 * position's card. A chain card is now compact above two changes (or when it
 * has no room), and the whole chain expands in place on the field.
 */
describe('PlanFieldView compact chain cards', () => {
  const sub = (id: string, slotId: string, minute: number, inPlayerId: string) => ({
    id,
    slotId,
    timeSeconds: minute * 60,
    inPlayerId,
  });

  /** @critical */
  it('shows the starter, the next change and "+N" for a chain of more than two', () => {
    const game: PlanGame = {
      ...makeGame([{ slotId: 's2', playerId: 'p1' }]),
      subs: [sub('a', 's2', 2, 'p2'), sub('b', 's2', 7, 'p3'), sub('c', 's2', 12, 'p4')],
    };
    render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} />);
    // The group label still carries the WHOLE chain for screen readers.
    const card = screen.getByRole('group', { name: "#3: Alex; 2' Sam, 7' Jo, 12' Max" });
    expect(within(card).getByRole('button', { name: '#3: Alex' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: "2' Sam (#3)" })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: "7' Jo (#3)" })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: "12' Max (#3)" })).not.toBeInTheDocument();
    const more = within(card).getByRole('button', { name: '#3: 3 changes, show all' });
    expect(more).toHaveTextContent('+2');
    expect(more).toHaveAttribute('aria-haspopup', 'dialog');
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });

  it('counts every hidden change in the badge', () => {
    const game: PlanGame = {
      ...makeGame([{ slotId: 's2', playerId: 'p1' }]),
      subs: [
        sub('a', 's2', 2, 'p2'),
        sub('b', 's2', 7, 'p3'),
        sub('c', 's2', 12, 'p4'),
        sub('d', 's2', 17, 'p5'),
        sub('e', 's2', 20, 'p2'),
      ],
    };
    render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} />);
    expect(screen.getByRole('button', { name: '#3: 5 changes, show all' })).toHaveTextContent('+4');
  });

  it('keeps a two-change chain stacked in full when there is room below it', () => {
    const game: PlanGame = {
      ...makeGame([{ slotId: 's2', playerId: 'p1' }]),
      subs: [sub('a', 's2', 6, 'p2'), sub('b', 's2', 12, 'p3')],
    };
    render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} />);
    expect(screen.getByRole('button', { name: "6' Sam (#3)" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "12' Jo (#3)" })).toBeInTheDocument();
    expect(screen.queryByTestId('plan-chain-more')).not.toBeInTheDocument();
  });

  /** @edge-case - ST sits 0.14 above CAM in the 8v8 2-1-2-1-1: three rows do not fit. */
  it('makes even a two-change chain compact when the slot below is too close', () => {
    const game: PlanGame = {
      ...makeGame([{ slotId: 's6', playerId: 'p1' }]),
      formationId: '8v8-2-1-2-1-1',
      subs: [sub('a', 's6', 6, 'p2'), sub('b', 's6', 12, 'p3')],
    };
    render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} />);
    expect(screen.getByRole('button', { name: "6' Sam (#7)" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "12' Jo (#7)" })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#7: 2 changes, show all' })).toHaveTextContent('+1');
  });

  /** @critical - the compact card grows in place on the field; no sheet over it. */
  it('expands the full chain in place on the field and closes it on a tap elsewhere on the field', () => {
    const game: PlanGame = {
      ...makeGame([{ slotId: 's2', playerId: 'p1' }]),
      subs: [sub('a', 's2', 2, 'p2'), sub('b', 's2', 7, 'p3'), sub('c', 's2', 12, 'p4')],
    };
    const onAssign = jest.fn();
    render(
      <PlanFieldView
        game={game}
        players={players}
        onAssign={onAssign}
        minutesByPlayer={{ p1: { minutes: 20, ratio: 1 } }}
      />,
    );
    const more = screen.getByRole('button', { name: '#3: 3 changes, show all' });
    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const dialog = screen.getByRole('dialog', { name: 'LAM: substitutions' });
    // In place: inside the pitch, beside the position cards - not portaled out.
    expect(dialog.parentElement).toBe(more.closest('[role="group"]')!.parentElement);
    expect(dialog).toHaveFocus();
    const rows = within(dialog).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(["StartAlex20'", "2'Sam", "7'Jo", "12'Max"]);

    fireEvent.click(screen.getByTestId('plan-chain-backdrop'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The closing tap did nothing else.
    expect(onAssign).not.toHaveBeenCalled();
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });

  it('dims every other position while a chain is expanded', () => {
    const game: PlanGame = {
      ...makeGame([
        { slotId: 's2', playerId: 'p1' },
        { slotId: 's0', playerId: 'p5' },
      ]),
      subs: [sub('a', 's2', 2, 'p2'), sub('b', 's2', 7, 'p3'), sub('c', 's2', 12, 'p4')],
    };
    render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} />);
    const otherDisc = () => screen.getByRole('button', { name: '#1: Kai' }).parentElement!;
    const ownCard = () => screen.getByTestId('plan-chain-more').closest('[role="group"]')!;
    expect(otherDisc()).not.toHaveClass('opacity-30');
    fireEvent.click(screen.getByTestId('plan-chain-more'));
    expect(otherDisc()).toHaveClass('opacity-30');
    expect(ownCard()).not.toHaveClass('opacity-30');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(otherDisc()).not.toHaveClass('opacity-30');
  });

  /**
   * Regression: the heading read "#7 · vaihdot" - an internal slot number. It
   * names the position (ST) like everything else a coach reads.
   * @critical
   */
  it('heads the expanded chain with the position label, not the slot number', () => {
    const game: PlanGame = {
      ...makeGame([{ slotId: 's6', playerId: 'p1' }]),
      formationId: '8v8-2-1-2-1-1',
      subs: [sub('a', 's6', 6, 'p2'), sub('b', 's6', 12, 'p3')],
    };
    render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '#7: 2 changes, show all' }));
    const dialog = screen.getByRole('dialog', { name: 'ST: substitutions' });
    expect(within(dialog).getByRole('heading')).toHaveTextContent(/^ST$/);
    expect(dialog).not.toHaveTextContent('#7');
  });

  it('closes the expanded chain from its close button', () => {
    const game: PlanGame = {
      ...makeGame([{ slotId: 's2', playerId: 'p1' }]),
      subs: [sub('a', 's2', 2, 'p2'), sub('b', 's2', 7, 'p3'), sub('c', 's2', 12, 'p4')],
    };
    render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} />);
    fireEvent.click(screen.getByTestId('plan-chain-more'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /** Select-and-place still reaches a stint hidden behind the badge. */
  it('picking a hidden stint in the expanded chain selects it, then a spot places it', () => {
    const onMoveSub = jest.fn();
    const game: PlanGame = {
      ...makeGame([{ slotId: 's2', playerId: 'p1' }]),
      subs: [sub('a', 's2', 2, 'p2'), sub('b', 's2', 7, 'p3'), sub('c', 's2', 12, 'p4')],
    };
    render(
      <PlanFieldView
        game={game}
        players={players}
        onAssign={jest.fn()}
        onRemoveSub={jest.fn()}
        onMoveSub={onMoveSub}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '#3: 3 changes, show all' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /12'.*Max/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const shown = screen.getByRole('button', { name: "12' Max (#3)" });
    expect(shown).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: "2' Sam (#3)" })).not.toBeInTheDocument();
    // ...then press an empty spot: the stint moves there.
    fireEvent.click(screen.getByRole('button', { name: '#1: empty' }));
    expect(onMoveSub).toHaveBeenCalledWith('c', 's0');
  });
});
