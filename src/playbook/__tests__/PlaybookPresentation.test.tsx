import React from 'react';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import type { Player } from '@/types';
import PlaybookPresentation from '../PlaybookPresentation';
import { DEMO_CONCEPT } from './demoConcept.fixture';
import { planMotion } from '../motion';

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
  render(<PlaybookPresentation isOpen concept={DEMO_CONCEPT} onClose={onClose} />);
  // Names arrive from the roster read.
  await waitFor(() => expect(screen.getByText('Eeli')).toBeInTheDocument());
  return onClose;
}

describe('PlaybookPresentation', () => {
  beforeEach(() => {
    mockGetPlayers.mockResolvedValue(roster);
    mockGetCurrentGameId.mockResolvedValue(null);
    mockGetGameById.mockResolvedValue(null);
    mockSyncWakeLock.mockClear();
    localStorage.clear();
  });

  /** @critical the coach steps through the concept and ends on the question */
  it('steps forward and back, then shows the question after the last step', async () => {
    await renderView();
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[0].title);
    expect(screen.getByTestId('playbook-counter')).toHaveTextContent(`1 / ${steps.length}`);
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();

    fireEvent.click(screen.getByTestId('playbook-next'));
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[1].title);
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[0].title);

    for (let i = 1; i < steps.length; i++) fireEvent.click(screen.getByTestId('playbook-next'));
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[steps.length - 1].title);
    expect(screen.getByTestId('playbook-next')).toHaveTextContent('Think about it');

    fireEvent.click(screen.getByTestId('playbook-next'));
    expect(screen.getByTestId('playbook-question')).toHaveTextContent(DEMO_CONCEPT.question as string);
    expect(screen.getByTestId('playbook-next')).toHaveTextContent('Start over');

    // Back from the question returns to the last step; "Start over" goes to step 1.
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[steps.length - 1].title);
    fireEvent.click(screen.getByTestId('playbook-next'));
    fireEvent.click(screen.getByTestId('playbook-next'));
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[0].title);
  });

  it('step dots, the restart button and the arrow keys move between steps', async () => {
    await renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Step 3' }));
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[2].title);
    expect(screen.getByRole('button', { name: 'Step 3' })).toHaveAttribute('aria-current', 'step');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[3].title);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[1].title);

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[0].title);
  });

  it('a swipe on the pitch changes the step', async () => {
    await renderView();
    const pitch = screen.getByRole('group', { name: /Pitch, step 1 of/ });
    fireEvent.pointerDown(pitch, { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 400 });
    fireEvent.pointerUp(pitch, { pointerId: 1, pointerType: 'touch', clientX: 150, clientY: 410 });
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[1].title);
    fireEvent.pointerDown(pitch, { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 400 });
    fireEvent.pointerUp(pitch, { pointerId: 2, pointerType: 'touch', clientX: 260, clientY: 400 });
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[0].title);
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
    render(<PlaybookPresentation isOpen concept={DEMO_CONCEPT} onClose={jest.fn()} />);
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
    const arrows = screen.getByTestId('playbook-arrows').querySelectorAll('[data-arrow-kind]');
    expect([...arrows].map((a) => a.getAttribute('data-arrow-kind'))).toEqual(
      (steps[1].arrows ?? []).map((a) => a.kind),
    );
    expect(screen.getByTestId('playbook-ball')).toBeInTheDocument();
  });

  it('keeps the screen awake while open, has no on-screen back arrow, and closes with the phone back button and Escape', async () => {
    const onClose = await renderView();
    expect(mockSyncWakeLock).toHaveBeenCalledWith(true);
    // Back = the phone's back button, as everywhere in the app (owner, 2026-11-21).
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  /**
   * Regression (owner, 2026-11-21): a step with long text shrank the pitch,
   * because the text panel's width followed the pitch and its height grew with
   * the text. The panel now has a fixed width and height; long text scrolls.
   * @edge-case
   */
  it('keeps the text panel a fixed size so long step text cannot shrink the pitch', async () => {
    const long = 'Hyvin pitkä selitys, joka jatkuu ja jatkuu. '.repeat(20);
    const concept = { ...DEMO_CONCEPT, steps: DEMO_CONCEPT.steps.map((st, i) => (i === 0 ? { ...st, text: long } : st)) };
    render(<PlaybookPresentation isOpen onClose={jest.fn()} concept={concept} />);
    const text = await screen.findByText(long.trim());
    const panel = text.closest('.pt-text') as HTMLElement;
    expect(panel.style.height).toContain('calc(');
    expect(panel.style.minHeight).toBe('');
    expect(panel.className).toContain('overflow-y-auto');
  });

  it('shows a message instead of the board for an invalid concept', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await act(async () => {
      render(<PlaybookPresentation isOpen onClose={jest.fn()} concept={{ ...DEMO_CONCEPT, steps: [] }} />);
    });
    expect(screen.getByText('This concept cannot be shown.')).toBeInTheDocument();
    expect(screen.queryByTestId('playbook-board')).not.toBeInTheDocument();
    warn.mockRestore();
  });

  it('a move over a cut step jumps (no transition); numbered arrows and links are drawn', async () => {
    const concept: typeof DEMO_CONCEPT = {
      ...DEMO_CONCEPT,
      steps: [
        { ...DEMO_CONCEPT.steps[0], arrows: [{ kind: 'pass', from: 'mv', to: 'vp', label: '1' }] },
        { ...DEMO_CONCEPT.steps[1], zones: [{ kind: 'link', ids: ['vp', 'op'] }] },
        { ...DEMO_CONCEPT.steps[2], cut: true },
      ],
    };
    render(<PlaybookPresentation isOpen onClose={jest.fn()} concept={concept} />);
    await waitFor(() => expect(screen.getByText('Eeli')).toBeInTheDocument());
    const moveMs = () => (document.querySelector('.pt-pitch') as HTMLElement).style.getPropertyValue('--pt-move');

    // Without a durationMs the move takes longer the further the players go.
    const into1 = `${planMotion(concept, 0, 1).durationMs}ms`;
    expect(into1).not.toBe('700ms');
    expect(screen.getByTestId('playbook-arrow-label')).toHaveTextContent('1');
    fireEvent.click(screen.getByTestId('playbook-next'));
    expect(moveMs()).toBe(into1);
    expect(screen.getByTestId('playbook-board').querySelector('.pt-zone line')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('playbook-next'));
    expect(moveMs()).toBe('0ms');
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(moveMs()).toBe('0ms');
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(moveMs()).toBe(`${planMotion(concept, 1, 0).durationMs}ms`);
  });
});

describe('PlaybookPresentation focus mode', () => {
  beforeEach(() => {
    mockGetPlayers.mockResolvedValue(roster);
    mockGetCurrentGameId.mockResolvedValue(null);
    mockGetGameById.mockResolvedValue(null);
    mockSyncWakeLock.mockClear();
    localStorage.clear();
  });

  const enterFocus = () => fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
  const focusPitch = () => {
    const el = screen.getByTestId('playbook-focus-pitch');
    // A 400 px wide screen: x < 200 is the left half.
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 800, right: 400, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
    return el;
  };
  const tapAt = (x: number) => fireEvent.click(focusPitch(), { clientX: x, clientY: 300 });

  /** @critical the coach shows the concept with nothing but the pitch on screen */
  it('the button enters focus mode: only the pitch, the step title and a counter; same step', async () => {
    await renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Step 2' }));
    enterFocus();
    expect(screen.getByTestId('playbook-focus')).toBeInTheDocument();
    expect(screen.getByTestId('playbook-focus-title')).toHaveTextContent(steps[1].title);
    expect(screen.getByTestId('playbook-focus-counter')).toHaveTextContent(`2/${steps.length}`);
    // No header, controls or step text.
    expect(screen.queryByTestId('playbook-next')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Previous step' })).toBeNull();
    expect(screen.queryByText(steps[1].text)).toBeNull();
    // Bigger discs on a frameless board.
    const board = document.querySelector('.pt-pitch') as HTMLElement;
    expect(board.style.borderRadius).toBe('0');
    expect(mockSyncWakeLock).toHaveBeenCalledWith(true);
    expect(mockSyncWakeLock).not.toHaveBeenCalledWith(false);
  });

  it('a tap on the right half steps forward, the left half back; a swipe works too', async () => {
    await renderView();
    enterFocus();
    tapAt(300);
    expect(screen.getByTestId('playbook-focus-title')).toHaveTextContent(steps[1].title);
    tapAt(320);
    expect(screen.getByTestId('playbook-focus-title')).toHaveTextContent(steps[2].title);
    tapAt(50);
    expect(screen.getByTestId('playbook-focus-title')).toHaveTextContent(steps[1].title);

    const pitch = focusPitch();
    fireEvent.pointerDown(pitch, { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 400 });
    fireEvent.pointerUp(pitch, { pointerId: 1, pointerType: 'touch', clientX: 120, clientY: 410 });
    // The click a browser may send after the swipe is not a second step.
    fireEvent.click(pitch, { clientX: 120, clientY: 410 });
    expect(screen.getByTestId('playbook-focus-title')).toHaveTextContent(steps[2].title);
  });

  it('a tap on one of our discs opens the name picker instead of stepping', async () => {
    await renderView();
    enterFocus();
    focusPitch();
    fireEvent.click(screen.getByRole('button', { name: 'Change player: Eeli' }));
    const picker = screen.getByRole('dialog', { name: 'Choose a player' });
    expect(screen.getByTestId('playbook-focus-title')).toHaveTextContent(steps[0].title);
    fireEvent.click(within(picker).getByRole('button', { name: 'Niilo Lehtonen' }));
    expect(screen.queryByRole('dialog', { name: 'Choose a player' })).toBeNull();
    expect(screen.getByTestId('playbook-focus-title')).toHaveTextContent(steps[0].title);
    expect(within(document.querySelector('[data-player="mv"]') as HTMLElement).getByText('Niilo')).toBeInTheDocument();
  });

  it('after the last step the question fills the screen; left goes back, right starts over', async () => {
    await renderView();
    enterFocus();
    for (let i = 1; i < steps.length; i++) tapAt(300);
    expect(screen.getByTestId('playbook-focus-title')).toHaveTextContent(steps[steps.length - 1].title);
    tapAt(300);
    expect(screen.getByTestId('playbook-focus-question')).toHaveTextContent(DEMO_CONCEPT.question as string);
    expect(screen.queryByTestId('playbook-focus-title')).toBeNull();
    expect(screen.queryByTestId('playbook-focus-counter')).toBeNull();
    tapAt(10);
    expect(screen.getByTestId('playbook-focus-title')).toHaveTextContent(steps[steps.length - 1].title);
    tapAt(300);
    tapAt(300);
    expect(screen.getByTestId('playbook-focus-title')).toHaveTextContent(steps[0].title);
  });

  it('the phone back button and Escape return to the normal view on the same step (not close)', async () => {
    const onClose = await renderView();
    enterFocus();
    tapAt(300);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByTestId('playbook-focus')).toBeNull();
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[1].title);

    enterFocus();
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[1].title);
    // From the normal view, Escape closes as before.
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('with the picker open, back closes only the picker', async () => {
    await renderView();
    enterFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Change player: Eeli' }));
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByRole('dialog', { name: 'Choose a player' })).toBeNull();
    expect(screen.getByTestId('playbook-focus')).toBeInTheDocument();
  });

  it('remembers the mode a concept was left in: focus (also back, back out of it) or normal', async () => {
    const open = async () => {
      const view = render(<PlaybookPresentation isOpen concept={DEMO_CONCEPT} onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByText('Eeli')).toBeInTheDocument());
      return view;
    };
    const back = () =>
      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

    // Left while in focus mode.
    let view = await open();
    enterFocus();
    view.unmount();
    view = await open();
    expect(screen.getByTestId('playbook-focus')).toBeInTheDocument();

    // Back to the normal view, then straight out (back, back): still focus mode.
    back();
    expect(screen.queryByTestId('playbook-focus')).toBeNull();
    view.unmount();
    view = await open();
    expect(screen.getByTestId('playbook-focus')).toBeInTheDocument();

    // Out of focus mode and presenting in the normal view, then left: normal.
    back();
    fireEvent.click(screen.getByTestId('playbook-next'));
    view.unmount();
    view = await open();
    expect(screen.queryByTestId('playbook-focus')).toBeNull();

    // Opened in the normal view, then focus mode entered and the concept left in it: focus.
    enterFocus();
    view.unmount();
    await open();
    expect(screen.getByTestId('playbook-focus')).toBeInTheDocument();
  });

  /** A stretched pitch would distort the distances and angles the animations teach. */
  it('keeps the pitch at its true aspect in focus mode, the largest that fits', async () => {
    const w = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
    const h = jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800);
    try {
      await renderView();
      enterFocus();
      const board = document.querySelector('.pt-pitch') as HTMLElement;
      // Width-limited on a tall screen: full width, height at 100 : 68.
      expect(board.style.width).toBe('400px');
      expect(board.style.height).toBe(`${Math.floor(400 / (68 / 100))}px`);
    } finally {
      w.mockRestore();
      h.mockRestore();
    }
  });

  it('works without storage (blocked localStorage): opens in the normal view', async () => {
    const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await renderView();
    expect(screen.queryByTestId('playbook-focus')).toBeNull();
    enterFocus();
    expect(screen.getByTestId('playbook-focus')).toBeInTheDocument();
    get.mockRestore();
    set.mockRestore();
  });
});

describe('PlaybookPresentation in a sequence (a game\'s themes)', () => {
  beforeEach(() => {
    mockGetPlayers.mockResolvedValue(roster);
    mockGetCurrentGameId.mockResolvedValue(null);
    mockGetGameById.mockResolvedValue(null);
    localStorage.clear();
  });

  async function renderInSequence(index: number, total: number, initialFocus?: boolean) {
    const onNext = jest.fn();
    render(
      <PlaybookPresentation isOpen concept={DEMO_CONCEPT} onClose={jest.fn()} sequence={{ index, total, onNext }} initialFocus={initialFocus} />,
    );
    await waitFor(() => expect(screen.getByText('Eeli')).toBeInTheDocument());
    return onNext;
  }

  it('after the question, "Next theme" moves on instead of starting over', async () => {
    const onNext = await renderInSequence(0, 2);
    expect(screen.getByTestId('playbook-eyebrow')).toHaveTextContent('Theme 1/2');
    for (let i = 1; i < steps.length; i++) fireEvent.click(screen.getByTestId('playbook-next'));
    fireEvent.click(screen.getByTestId('playbook-next')); // to the question
    expect(screen.getByTestId('playbook-next')).toHaveTextContent('Next theme');
    fireEvent.click(screen.getByTestId('playbook-next'));
    expect(onNext).toHaveBeenCalledWith({ focus: false });
  });

  it('the last theme ends as usual (start over)', async () => {
    const onNext = await renderInSequence(1, 2);
    for (let i = 1; i < steps.length; i++) fireEvent.click(screen.getByTestId('playbook-next'));
    fireEvent.click(screen.getByTestId('playbook-next'));
    expect(screen.getByTestId('playbook-next')).toHaveTextContent('Start over');
    fireEvent.click(screen.getByTestId('playbook-next'));
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[0].title);
  });

  /** @edge-case "Previous" on a theme's first step goes back to the previous theme */
  it('back from the first step goes to the previous theme (not on the first theme)', async () => {
    const onPrev = jest.fn();
    const { unmount } = render(
      <PlaybookPresentation isOpen concept={DEMO_CONCEPT} onClose={jest.fn()} sequence={{ index: 1, total: 2, onNext: jest.fn(), onPrev }} />,
    );
    await waitFor(() => expect(screen.getByText('Eeli')).toBeInTheDocument());
    const back = screen.getByRole('button', { name: 'Previous theme' });
    expect(back).toBeEnabled();
    fireEvent.click(back);
    expect(onPrev).toHaveBeenCalledWith({ focus: false });
    // From step 2 it is an ordinary step back.
    fireEvent.click(screen.getByTestId('playbook-next'));
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[0].title);
    unmount();

    render(<PlaybookPresentation isOpen concept={DEMO_CONCEPT} onClose={jest.fn()} sequence={{ index: 0, total: 2, onNext: jest.fn(), onPrev }} />);
    await waitFor(() => expect(screen.getByText('Eeli')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
  });

  it('startAtEnd opens the concept at its end (the question)', async () => {
    render(<PlaybookPresentation isOpen concept={DEMO_CONCEPT} onClose={jest.fn()} startAtEnd sequence={{ index: 0, total: 2, onNext: jest.fn() }} />);
    await waitFor(() => expect(screen.getByText('Eeli')).toBeInTheDocument());
    expect(screen.getByTestId('playbook-next')).toHaveTextContent('Next theme');
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(screen.getByTestId('playbook-step-title')).toHaveTextContent(steps[steps.length - 1].title);
  });

  it('opens the next theme in the mode the previous one was in, and passes it on', async () => {
    const onNext = await renderInSequence(0, 3, true);
    expect(screen.getByTestId('playbook-focus')).toBeInTheDocument();
    const pitch = screen.getByTestId('playbook-focus-pitch');
    pitch.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 800, right: 400, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
    // Right-half taps through every step and the question, then on to the next theme.
    for (let i = 0; i < steps.length + 1; i++) fireEvent.click(pitch, { clientX: 300, clientY: 300 });
    expect(onNext).toHaveBeenCalledWith({ focus: true });
  });
});
