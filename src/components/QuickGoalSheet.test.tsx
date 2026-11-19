import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import QuickGoalSheet from './QuickGoalSheet';
import type { Player } from '@/types';
import type { GameEvent } from '@/types/game';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, vars?: Record<string, string | number>) =>
      vars ? Object.entries(vars).reduce((s, [k, v]) => s.replace(`{{${k}}}`, String(v)), fallback) : fallback,
  }),
}));

/** The whole squad of a game: starters and substitutes alike. */
const squad: Player[] = [
  { id: 'p1', name: 'Onni Virtanen', nickname: 'Onni' },
  { id: 'p2', name: 'Toivo Korhonen', nickname: 'Toivo' },
  { id: 'p3', name: 'Aatos Mäkinen' },
  { id: 'p4', name: 'Leo Nieminen', nickname: 'Leo' },
];

const goal: GameEvent = { id: 'g1', type: 'goal', time: 586, scorerId: undefined };

/** Renders the sheet against a live goal log, the way ModalManager hosts it. */
function setup(events: GameEvent[] = [goal]) {
  const onUpdateGameEvent = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <QuickGoalSheet
      eventId="g1"
      gameEvents={events}
      players={squad}
      homeScore={1}
      awayScore={0}
      onUpdateGameEvent={onUpdateGameEvent}
      onClose={onClose}
    />,
  );
  return { ...utils, onUpdateGameEvent, onClose };
}

const names = () =>
  within(screen.getByTestId('quick-goal-names')).getAllByRole('button').map((b) => b.textContent);

describe('QuickGoalSheet', () => {
  /**
   * D16: the goal is already logged, so the sheet says so and asks who scored,
   * offering every player in the squad - no pitch/bench split.
   * @critical
   */
  it('asks who scored, listing every squad player by disc name', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Who scored?' })).toBeInTheDocument();
    expect(screen.getByText('Goal logged · 09:46 · 1–0')).toBeInTheDocument();
    expect(names()).toHaveLength(squad.length);
    expect(names()).toEqual(expect.arrayContaining(['Onni', 'Toivo', 'Aatos Mäkinen', 'Leo']));
    expect(screen.getByRole('button', { name: 'Toivo Korhonen' })).toBeInTheDocument();
  });

  /** @critical Skip stores no scorer: the goal stays a team goal. */
  it('Skip closes without touching the goal', () => {
    const { onUpdateGameEvent, onClose } = setup();
    fireEvent.click(screen.getByTestId('quick-goal-skip'));
    expect(onUpdateGameEvent).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /** @critical Scorer, then the optional assister step, on the same goal. */
  it('names the scorer, then offers the assister step without the scorer', () => {
    const { onUpdateGameEvent, onClose, rerender } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Toivo Korhonen' }));
    expect(onUpdateGameEvent).toHaveBeenCalledWith({ ...goal, scorerId: 'p2' });
    expect(onClose).not.toHaveBeenCalled();

    // The host feeds the updated log back, as the reducer does.
    const named = { ...goal, scorerId: 'p2' };
    rerender(
      <QuickGoalSheet
        eventId="g1"
        gameEvents={[named]}
        players={squad}
        homeScore={1}
        awayScore={0}
        onUpdateGameEvent={onUpdateGameEvent}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Who assisted?' })).toBeInTheDocument();
    expect(names()).toHaveLength(squad.length - 1);
    expect(screen.queryByRole('button', { name: 'Toivo Korhonen' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Leo Nieminen' }));
    expect(onUpdateGameEvent).toHaveBeenLastCalledWith({ ...named, assisterId: 'p4' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Skip on the assister step keeps the scorer and stores no assist', () => {
    const { onUpdateGameEvent, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Onni Virtanen' }));
    fireEvent.click(screen.getByTestId('quick-goal-skip'));
    expect(onUpdateGameEvent).toHaveBeenCalledTimes(1);
    expect(onUpdateGameEvent).toHaveBeenCalledWith({ ...goal, scorerId: 'p1' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /** @edge-case Undo removed the goal while the sheet was open: nothing left to name. */
  it('closes by itself when the goal is no longer in the log', () => {
    const { onClose } = setup([]);
    expect(screen.queryByTestId('quick-goal-sheet')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });
});
