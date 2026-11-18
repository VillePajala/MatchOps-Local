import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n.test';
import AssessmentLevelSelector from './AssessmentLevelSelector';
import { canonicalToDisplay, displayToCanonical } from '@/config/assessmentMetrics';

const renderSelector = (props: Partial<React.ComponentProps<typeof AssessmentLevelSelector>> = {}) => {
  const onChange = jest.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <AssessmentLevelSelector label="Passing" value={displayToCanonical(4, 5)} onChange={onChange} {...props} />
    </I18nextProvider>,
  );
  return { onChange };
};

describe('AssessmentLevelSelector', () => {
  beforeAll(() => {
    // The level words, as in the en locale (the shared test bundle is minimal).
    i18n.addResources('en', 'translation', {
      'assessmentScale.level3': 'Developing',
      'assessmentScale.level4': 'Consistent',
    });
  });

  /** @critical the number is inside every box, also in the words style. */
  it('shows the level number inside each box in the words style, the word beside the name', () => {
    renderSelector({ ratingStyle: 'words' });
    const buttons = screen.getAllByRole('button', { name: /^\d, / });
    expect(buttons.map((b) => b.textContent)).toEqual(['1', '2', '3', '4', '5']);
    // The accessible name starts with the visible number, then the word.
    expect(buttons[3]).toHaveAccessibleName('4, Consistent');
    expect(screen.getByTestId('assessment-level-value')).toHaveTextContent('Consistent');
  });

  it('marks a given rating with the amber ring and tint', () => {
    renderSelector({ ratingStyle: 'words' });
    const chosen = screen.getByRole('button', { name: '4, Consistent' });
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    expect(chosen).toHaveClass('bg-action/[0.12]');
  });

  /** @edge-case the untouched default stays a faint middle box, not a selection. */
  it('keeps an untouched default faint and unpressed', () => {
    renderSelector({ ratingStyle: 'words', value: displayToCanonical(3, 5), untouched: true });
    const middle = screen.getByRole('button', { name: '3, Developing' });
    expect(middle).toHaveAttribute('aria-pressed', 'false');
    expect(middle.className).not.toContain('bg-action');
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
  });

  it('respects the 1-10 style and stores canonical values', () => {
    const { onChange } = renderSelector({ ratingStyle: 'num10', value: 6 });
    const cells = screen.getAllByRole('button', { name: /^\d+$/ });
    expect(cells).toHaveLength(10);
    expect(screen.getByRole('button', { name: String(canonicalToDisplay(6, 10)) })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '9' }));
    expect(onChange).toHaveBeenCalledWith(displayToCanonical(9, 10));
  });

  it('converts a 1-5 pick back to the canonical scale', () => {
    const { onChange } = renderSelector({ ratingStyle: 'num5' });
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(onChange).toHaveBeenCalledWith(displayToCanonical(2, 5));
  });
});
