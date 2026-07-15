import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PlanSwapSheet from './PlanSwapSheet';
import type { PlanGame, PlanPlayer } from '@/utils/playtimePlanner/types';

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

const players: PlanPlayer[] = [
  { id: 'timo', name: 'Timo' },
  { id: 'sauli', name: 'Sauli' },
  { id: 'tapio', name: 'Tapio' },
  { id: 'pekka', name: 'Pekka' },
];

// The feature-request scenario: Timo starts s0, Sauli subs in at 25';
// Tapio holds s1 the whole game.
const scenarioGame = (over: Partial<PlanGame> = {}): PlanGame => ({
  id: 'g1',
  label: 'Game 1',
  formationId: '5v5-2-2',
  numberOfPeriods: 2,
  periodMinutes: 25,
  included: true,
  startingSlots: [
    { slotId: 's0', playerId: 'timo' },
    { slotId: 's1', playerId: 'tapio' },
  ],
  subs: [{ id: 'x1', slotId: 's0', timeSeconds: 1500, inPlayerId: 'sauli' }],
  ...over,
});

afterEach(() => cleanup());

describe('PlanSwapSheet', () => {
  it('swaps the slot starter with the tapped target (Timo ⇄ Tapio)', () => {
    const onSwap = jest.fn();
    const onClose = jest.fn();
    render(
      <PlanSwapSheet game={scenarioGame()} slotId="s0" players={players} onSwap={onSwap} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Tapio/ }));
    expect(onSwap).toHaveBeenCalledWith('timo', 'tapio');
    expect(onClose).toHaveBeenCalled();
  });

  it('lets the coach pick the INCOMER as the source (Sauli ⇄ Tapio)', () => {
    const onSwap = jest.fn();
    render(
      <PlanSwapSheet game={scenarioGame()} slotId="s0" players={players} onSwap={onSwap} onClose={jest.fn()} />,
    );
    // The slot's rotation holds two identities -> the source picker shows both.
    expect(screen.getByText('Swap who?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sauli 25'/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Tapio/ }));
    expect(onSwap).toHaveBeenCalledWith('sauli', 'tapio');
  });

  it('hides the source picker when the slot holds a single player', () => {
    render(
      <PlanSwapSheet game={scenarioGame()} slotId="s1" players={players} onSwap={jest.fn()} onClose={jest.fn()} />,
    );
    expect(screen.queryByText('Swap who?')).not.toBeInTheDocument();
  });

  it('excludes the source and absentees from the targets', () => {
    render(
      <PlanSwapSheet
        game={scenarioGame({ absentIds: ['pekka'] })}
        slotId="s1"
        players={players}
        onSwap={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    // Source (Tapio) and absent Pekka are not offered; Timo and Sauli are.
    expect(screen.queryByRole('button', { name: /Tapio/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pekka/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Timo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sauli/ })).toBeInTheDocument();
  });

  it('closes on backdrop tap without swapping', () => {
    const onSwap = jest.fn();
    const onClose = jest.fn();
    render(
      <PlanSwapSheet game={scenarioGame()} slotId="s0" players={players} onSwap={onSwap} onClose={onClose} />,
    );
    fireEvent.click(screen.getByTestId('plan-swap-sheet-backdrop'));
    expect(onClose).toHaveBeenCalled();
    expect(onSwap).not.toHaveBeenCalled();
  });
});
