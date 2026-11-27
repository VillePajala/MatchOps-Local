import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import PlanChainExpanded from './PlanChainExpanded';
import { useHardwareBackSubLevel } from '@/hooks/useModalHardwareBack';

const interpolate = (template: string, options?: Record<string, unknown>): string =>
  options
    ? template.replace(/\{\{(\w+)\}\}/g, (_m, k) => (options[k] !== undefined ? String(options[k]) : `{{${k}}}`))
    : template;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, dv?: string, opts?: Record<string, unknown>) => interpolate(dv ?? '', opts),
  }),
}));

// The phone's back button is the hook's business (covered in its own suite);
// here we only need to know the card registers with it and closes on it.
jest.mock('@/hooks/useModalHardwareBack', () => ({
  useHardwareBackSubLevel: jest.fn(),
}));
const mockedBack = useHardwareBackSubLevel as jest.MockedFunction<typeof useHardwareBackSubLevel>;

const ROWS = [
  { key: 'starter', minute: null, name: 'Kalle', totalMinutes: 46 },
  { key: 'a', minute: 2, name: 'Eino' },
  { key: 'b', minute: 7, name: 'Sampo' },
  { key: 'c', minute: 12, name: 'Rafael' },
];
const FIELD = { widthPx: 328, heightPx: 437 };
const ANCHOR = { centerX: 164, top: 100, bottom: 180 };

const renderCard = (props: Partial<React.ComponentProps<typeof PlanChainExpanded>> = {}) =>
  render(
    <div>
      <button type="button">opener</button>
      <PlanChainExpanded
        positionLabel="ST"
        rows={ROWS}
        anchor={ANCHOR}
        fieldSize={FIELD}
        onClose={jest.fn()}
        {...props}
      />
    </div>,
  );

afterEach(() => {
  cleanup();
  mockedBack.mockClear();
});

describe('PlanChainExpanded', () => {
  it('heads the card with the position and lists the starter and every change with its minute', () => {
    renderCard();
    const dialog = screen.getByRole('dialog', { name: 'ST: substitutions' });
    expect(within(dialog).getByRole('heading')).toHaveTextContent('ST');
    const items = within(dialog).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Start');
    expect(items[0]).toHaveTextContent('Kalle');
    expect(items[0]).toHaveTextContent("46'");
    expect(items[1]).toHaveTextContent("2'Eino");
    expect(items[3]).toHaveTextContent("12'Rafael");
  });

  it('sits on the field at the card it expands from', () => {
    renderCard();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveStyle({ top: '100px', width: '216px', left: '56px' });
    expect(dialog).toHaveAttribute('data-direction', 'down');
  });

  it('takes focus on open and gives it back to the opener on close', () => {
    const { rerender } = render(<button type="button">opener</button>);
    const opener = screen.getByRole('button', { name: 'opener' });
    opener.focus();
    rerender(
      <>
        <button type="button">opener</button>
        <PlanChainExpanded positionLabel="ST" rows={ROWS} anchor={ANCHOR} fieldSize={FIELD} onClose={jest.fn()} />
      </>,
    );
    expect(screen.getByRole('dialog')).toHaveFocus();
    rerender(<button type="button">opener</button>);
    expect(screen.getByRole('button', { name: 'opener' })).toHaveFocus();
  });

  it('closes on a tap elsewhere on the field, but not on a tap inside', () => {
    const onClose = jest.fn();
    renderCard({ onClose });
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('plan-chain-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a press outside the field, but not on a press inside the card', () => {
    const onClose = jest.fn();
    renderCard({ onClose });
    fireEvent.pointerDown(screen.getByText('Eino'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'opener' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on its close button', () => {
    const onClose = jest.fn();
    renderCard({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape without letting it reach the screen behind', () => {
    const onClose = jest.fn();
    const behind = jest.fn();
    document.addEventListener('keydown', behind);
    renderCard({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(behind).not.toHaveBeenCalled();
    document.removeEventListener('keydown', behind);
  });

  it('closes on the phone back button', () => {
    const onClose = jest.fn();
    renderCard({ onClose });
    expect(mockedBack).toHaveBeenCalledWith(true, onClose);
  });

  it('dims the field behind it only when asked to', () => {
    renderCard();
    expect(screen.getByTestId('plan-chain-backdrop').style.backgroundColor).toBe('');
    cleanup();
    renderCard({ dimField: true });
    expect(screen.getByTestId('plan-chain-backdrop').style.backgroundColor).not.toBe('');
  });

  it('a selectable row picks its placement up and closes the card', () => {
    const onClose = jest.fn();
    const onSelect = jest.fn();
    renderCard({ rows: [...ROWS.slice(0, 1), { key: 'a', minute: 2, name: 'Eino', onSelect }], onClose });
    fireEvent.click(screen.getByRole('button', { name: /Eino/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Read-only rows are not buttons.
    expect(screen.queryByRole('button', { name: /Kalle/ })).not.toBeInTheDocument();
  });
});
