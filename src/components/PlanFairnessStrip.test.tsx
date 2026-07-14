import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PlanFairnessStrip, { type FairnessStripRow } from './PlanFairnessStrip';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, dv?: string) => dv ?? _k,
  }),
}));

const rows: FairnessStripRow[] = [
  { id: 'a', name: 'Onni Virtanen', minutes: 6, ratio: 0.2 },
  { id: 'b', name: 'Eino', minutes: 18, ratio: 0.6 },
  { id: 'c', name: 'Niilo', minutes: 36, ratio: 1.0 },
];

afterEach(() => cleanup());

describe('PlanFairnessStrip', () => {
  it('renders every player as a cell with first name + minutes (worst-off first)', () => {
    render(<PlanFairnessStrip rows={rows} onToggleHighlight={jest.fn()} />);
    const cells = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'));
    expect(cells).toHaveLength(3);
    // First name only keeps cells compact; the number is always printed.
    expect(cells[0]).toHaveTextContent('Onni');
    expect(cells[0]).toHaveTextContent("6'");
  });

  it('tapping a cell toggles the highlight callback', () => {
    const onToggleHighlight = jest.fn();
    render(<PlanFairnessStrip rows={rows} onToggleHighlight={onToggleHighlight} />);
    fireEvent.click(screen.getByRole('button', { name: /Eino/ }));
    expect(onToggleHighlight).toHaveBeenCalledWith('b');
  });

  it('marks the highlighted cell and dims the rest', () => {
    render(<PlanFairnessStrip rows={rows} highlightPlayerIds={["b"]} onToggleHighlight={jest.fn()} />);
    const highlighted = screen.getByRole('button', { name: /Eino/ });
    expect(highlighted).toHaveAttribute('aria-pressed', 'true');
    expect(highlighted.className).toContain('ring-amber-300');
    expect(screen.getByRole('button', { name: /Onni/ }).className).toContain('opacity-40');
  });

  it('collapses and expands via the header toggle (large squads fold away)', () => {
    render(<PlanFairnessStrip rows={rows} onToggleHighlight={jest.fn()} />);
    const toggle = screen.getByRole('button', { name: /Playing-time totals/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Onni/ })).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /Onni/ })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /Onni/ })).toBeInTheDocument();
  });

  it('renders nothing for an empty plan', () => {
    const { container } = render(<PlanFairnessStrip rows={[]} onToggleHighlight={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
