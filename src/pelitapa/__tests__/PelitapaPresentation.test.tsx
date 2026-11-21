import React from 'react';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import type { Player } from '@/types';
import PelitapaPresentation from '../PelitapaPresentation';
import { DEMO_CONCEPT } from '../demoConcept';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) => {
      const text = fallback || key;
      if (!options) return text;
      return text.replace(/\{\{(\w+)\}\}/g, (_m: string, name: string) => String(options[name] ?? ''));
    },
  }),
}));

const mockSyncWakeLock = jest.fn().mockResolvedValue(undefined);
jest.mock('@/hooks/useWakeLock', () => ({
  useWakeLock: () => ({ syncWakeLock: mockSyncWakeLock, isWakeLockActive: false }),
}));

const roster: Player[] = [
  { id: 'p1', name: 'Eeli Virtanen', isGoalie: true },
  { id: 'p2', name: 'Onni Korhonen' },
  { id: 'p3', name: 'Leo Nieminen', nickname: 'Leksa' },
  { id: 'p4', name: 'Väinö Mäkinen' },
  { id: 'p5', name: 'Aapo Laine' },
  { id: 'p6', name: 'Elias Heikkinen' },
  { id: 'p7', name: 'Oliver Koskinen' },
  { id: 'p8', name: 'Leevi Järvinen' },
  { id: 'p9', name: 'Niilo Lehtonen' },
];
const mockGetPlayers = jest.fn();
const mockGetGameById = jest.fn();
jest.mock('@/hooks/useDataStore', () => {
  const store = {
    getPlayers: (...a: unknown[]) => mockGetPlayers(...a),
    getGameById: (...a: unknown[]) => mockGetGameById(...a),
  };
  const getStore = () => Promise.resolve(store);
  return { useDataStore: () => ({ userId: 'u1', getStore }) };
});
const mockGetCurrentGameId = jest.fn();
jest.mock('@/utils/appSettings', () => ({
  getCurrentGameIdSetting: (...a: unknown[]) => mockGetCurrentGameId(...a),
}));

const steps = DEMO_CONCEPT.steps;

// jsdom has no PointerEvent: without one fireEvent.pointer* drops clientX / pointerType.
if (typeof window.PointerEvent === 'undefined') {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  (window as unknown as { PointerEvent: typeof TestPointerEvent }).PointerEvent = TestPointerEvent;
}

async function renderView(onClose = jest.fn()) {
  render(<PelitapaPresentation isOpen onClose={onClose} />);
  // Names arrive from the roster read.
  await waitFor(() => expect(screen.getByText('Eeli')).toBeInTheDocument());
  return onClose;
}

describe('PelitapaPresentation', () => {
  beforeEach(() => {
    mockGetPlayers.mockResolvedValue(roster);
    mockGetCurrentGameId.mockResolvedValue(null);
    mockGetGameById.mockResolvedValue(null);
    mockSyncWakeLock.mockClear();
  });

  /** @critical the coach steps through the concept and ends on the question */
  it('steps forward and back, then shows the question after the last step', async () => {
    await renderView();
    expect(screen.getByTestId('pelitapa-step-title')).toHaveTextContent(steps[0].title);
    expect(screen.getByTestId('pelitapa-counter')).toHaveTextContent(`1 / ${steps.length}`);
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();

    fireEvent.click(screen.getByTestId('pelitapa-next'));
    expect(screen.getByTestId('pelitapa-step-title')).toHaveTextContent(steps[1].title);
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(screen.getByTestId('pelitapa-step-title')).toHaveTextContent(steps[0].title);

    for (let i = 1; i < steps.length; i++) fireEvent.click(screen.getByTestId('pelitapa-next'));
    expect(screen.getByTestId('pelitapa-step-title')).toHaveTextContent(steps[steps.length - 1].title);
    expect(screen.getByTestId('pelitapa-next')).toHaveTextContent('Think about it');

    fireEvent.click(screen.getByTestId('pelitapa-next'));
    expect(screen.getByTestId('pelitapa-question')).toHaveTextContent(DEMO_CONCEPT.question as string);
    expect(screen.getByTestId('pelitapa-next')).toHaveTextContent('Start over');

    // Back from the question returns to the last step; "Start over" goes to step 1.
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(screen.getByTestId('pelitapa-step-title')).toHaveTextContent(steps[steps.length - 1].title);
    fireEvent.click(screen.getByTestId('pelitapa-next'));
    fireEvent.click(screen.getByTestId('pelitapa-next'));
    expect(screen.getByTestId('pelitapa-step-title')).toHaveTextContent(steps[0].title);
  });

  it('step dots, the restart button and the arrow keys move between steps', async () => {
    await renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Step 3' }));
    expect(screen.getByTestId('pelitapa-step-title')).toHaveTextContent(steps[2].title);
    expect(screen.getByRole('button', { name: 'Step 3' })).toHaveAttribute('aria-current', 'step');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('pelitapa-step-title')).toHaveTextContent(steps[3].title);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('pelitapa-step-title')).toHaveTextContent(steps[1].title);

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByTestId('pelitapa-step-title')).toHaveTextContent(steps[0].title);
  });

  it('a swipe on the pitch changes the step', async () => {
    await renderView();
    const pitch = screen.getByRole('group', { name: /Pitch, step 1 of/ });
    fireEvent.pointerDown(pitch, { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 400 });
    fireEvent.pointerUp(pitch, { pointerId: 1, pointerType: 'touch', clientX: 150, clientY: 410 });
    expect(screen.getByTestId('pelitapa-step-title')).toHaveTextContent(steps[1].title);
    fireEvent.pointerDown(pitch, { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 400 });
    fireEvent.pointerUp(pitch, { pointerId: 2, pointerType: 'touch', clientX: 260, clientY: 400 });
    expect(screen.getByTestId('pelitapa-step-title')).toHaveTextContent(steps[0].title);
  });

  /** @critical the team's own names are on our discs, not the opponents' */
  it("puts the team's own names on our discs (keeper on the keeper disc, nickname first)", async () => {
    await renderView();
    const keeper = document.querySelector('[data-player="mv"]') as Element;
    expect(within(keeper as HTMLElement).getByText('Eeli')).toBeInTheDocument();
    expect(screen.getByText('Leksa')).toBeInTheDocument();
    const opp = document.querySelector('[data-player="v1"]') as Element;
    expect(opp.textContent).toBe('');
  });

  it('uses the current game formation when there is one', async () => {
    mockGetCurrentGameId.mockResolvedValue('g1');
    mockGetGameById.mockResolvedValue({
      playersOnField: [
        { ...roster[8], relX: 0.5, relY: 0.95, isGoalie: true },
        { ...roster[6], relX: 0.36, relY: 0.83 },
      ],
    });
    render(<PelitapaPresentation isOpen onClose={jest.fn()} />);
    await waitFor(() => {
      const keeper = document.querySelector('[data-player="mv"]') as HTMLElement;
      expect(within(keeper).getByText('Niilo')).toBeInTheDocument();
    });
    const leftBack = document.querySelector('[data-player="vp"]') as HTMLElement;
    expect(within(leftBack).getByText('Oliver')).toBeInTheDocument();
  });

  it('tapping a disc lets the coach pick another player (swapping names)', async () => {
    await renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Change player: Eeli' }));
    const picker = screen.getByRole('dialog', { name: 'Choose a player' });
    fireEvent.click(within(picker).getByRole('button', { name: 'Niilo Lehtonen' }));
    expect(screen.queryByRole('dialog', { name: 'Choose a player' })).not.toBeInTheDocument();
    const keeper = document.querySelector('[data-player="mv"]') as HTMLElement;
    expect(within(keeper).getByText('Niilo')).toBeInTheDocument();

    // Picking a player already on another disc swaps the two.
    fireEvent.click(screen.getByRole('button', { name: 'Change player: Niilo' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Choose a player' })).getByRole('button', { name: 'Onni Korhonen' }));
    expect(within(document.querySelector('[data-player="mv"]') as HTMLElement).getByText('Onni')).toBeInTheDocument();
    expect(screen.getAllByText('Onni')).toHaveLength(1);
    expect(screen.getByText('Niilo')).toBeInTheDocument();
  });

  it('highlights the step’s players and draws its arrows', async () => {
    await renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Step 2' }));
    for (const id of steps[1].highlights ?? []) {
      expect(document.querySelector(`[data-player="${id}"]`)).toHaveAttribute('data-highlighted', 'true');
    }
    const arrows = screen.getByTestId('pelitapa-arrows').querySelectorAll('[data-arrow-kind]');
    expect([...arrows].map((a) => a.getAttribute('data-arrow-kind'))).toEqual(
      (steps[1].arrows ?? []).map((a) => a.kind),
    );
    expect(screen.getByTestId('pelitapa-ball')).toBeInTheDocument();
  });

  it('keeps the screen awake while open, and closes with the back button and Escape', async () => {
    const onClose = await renderView();
    expect(mockSyncWakeLock).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows a message instead of the board for an invalid concept', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await act(async () => {
      render(<PelitapaPresentation isOpen onClose={jest.fn()} concept={{ ...DEMO_CONCEPT, steps: [] }} />);
    });
    expect(screen.getByText('This concept cannot be shown.')).toBeInTheDocument();
    expect(screen.queryByTestId('pelitapa-board')).not.toBeInTheDocument();
    warn.mockRestore();
  });
});
