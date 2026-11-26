import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import PlanChainSheet from './PlanChainSheet';
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
// here we only need to know the sheet registers with it and closes on it.
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

afterEach(() => {
  cleanup();
  mockedBack.mockClear();
});

describe('PlanChainSheet', () => {
  it('lists the position, the starter and every change with its minute', () => {
    render(<PlanChainSheet positionLabel="ST" rows={ROWS} onClose={jest.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'ST · substitutions' });
    const items = within(dialog).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Start');
    expect(items[0]).toHaveTextContent('Kalle');
    expect(items[0]).toHaveTextContent("46'");
    expect(items[1]).toHaveTextContent("2'Eino");
    expect(items[3]).toHaveTextContent("12'Rafael");
  });

  it('takes focus on open', () => {
    render(<PlanChainSheet positionLabel="ST" rows={ROWS} onClose={jest.fn()} />);
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('closes on a tap outside, but not on a tap inside', () => {
    const onClose = jest.fn();
    render(<PlanChainSheet positionLabel="ST" rows={ROWS} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('plan-chain-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape without letting it reach the screen behind', () => {
    const onClose = jest.fn();
    const behind = jest.fn();
    document.addEventListener('keydown', behind);
    render(<PlanChainSheet positionLabel="ST" rows={ROWS} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(behind).not.toHaveBeenCalled();
    document.removeEventListener('keydown', behind);
  });

  it('closes on the phone back button', () => {
    const onClose = jest.fn();
    render(<PlanChainSheet positionLabel="ST" rows={ROWS} onClose={onClose} />);
    expect(mockedBack).toHaveBeenCalledWith(true, onClose);
  });

  it('a selectable row picks its placement up and closes the sheet', () => {
    const onClose = jest.fn();
    const onSelect = jest.fn();
    render(
      <PlanChainSheet
        positionLabel="ST"
        rows={[...ROWS.slice(0, 1), { key: 'a', minute: 2, name: 'Eino', onSelect }]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Eino/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Read-only rows are not buttons.
    expect(screen.queryByRole('button', { name: /Kalle/ })).not.toBeInTheDocument();
  });
});
