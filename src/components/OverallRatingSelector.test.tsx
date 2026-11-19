import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import OverallRatingSelector from './OverallRatingSelector';

describe('OverallRatingSelector', () => {
  it('calls onChange when a button is clicked', () => {
    const onChange = jest.fn();
    render(<OverallRatingSelector value={5} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onChange).toHaveBeenCalledWith(3);
  });
});

describe('OverallRatingSelector layout and selection look', () => {
  /** @edge-case ten 1-10 cells in one row were ~27px wide on a phone. */
  it('lays the ten cells out as two rows of five at every width', () => {
    render(<OverallRatingSelector value={5} onChange={jest.fn()} label="Overall" />);
    const group = screen.getByRole('group', { name: 'Overall' });
    expect(group).toHaveClass('grid-cols-5');
    expect(group.className).not.toMatch(/grid-cols-10/);
    expect(screen.getAllByRole('button')).toHaveLength(10);
    screen.getAllByRole('button').forEach((b) => expect(b).toHaveClass('min-h-11'));
  });

  it('draws a given rating as the amber ring on an amber tint', () => {
    render(<OverallRatingSelector value={7} onChange={jest.fn()} />);
    const chosen = screen.getByRole('button', { name: '7' });
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    expect(chosen).toHaveClass('bg-action/[0.12]');
    expect(chosen.className).toContain('var(--color-action)');
  });

  it('keeps an untouched default faint: not pressed, no amber', () => {
    render(<OverallRatingSelector value={5} onChange={jest.fn()} untouched />);
    const def = screen.getByRole('button', { name: '5' });
    expect(def).toHaveAttribute('aria-pressed', 'false');
    expect(def.className).not.toContain('bg-action');
    expect(def.className).not.toContain('var(--color-action)');
  });
});
