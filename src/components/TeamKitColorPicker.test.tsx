/**
 * @jest-environment jsdom
 * @critical - a team's colour is the one piece of a team that is purely the
 * coach's own. Losing the ability to clear it, or storing a value the swatches
 * cannot show back, strands them with a choice they cannot undo.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TeamKitColorPicker from './TeamKitColorPicker';
import { TEAM_KIT_COLORS } from '@/config/palette';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, d?: string) => d ?? _k,
  }),
}));

describe('TeamKitColorPicker', () => {
  it('offers every kit colour plus a way to have none', () => {
    render(<TeamKitColorPicker value={undefined} onChange={jest.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(TEAM_KIT_COLORS.length + 1);
  });

  it('reports the chosen hex', () => {
    const onChange = jest.fn();
    render(<TeamKitColorPicker value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('radio')[0]);
    expect(onChange).toHaveBeenCalledWith(TEAM_KIT_COLORS[0].hex);
  });

  /** A control you cannot undo is a trap, and most teams will never set one. */
  it('clears back to no colour', () => {
    const onChange = jest.fn();
    render(<TeamKitColorPicker value={TEAM_KIT_COLORS[0].hex} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('No colour'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('marks the stored colour as the checked one', () => {
    render(<TeamKitColorPicker value={TEAM_KIT_COLORS[2].hex} onChange={jest.fn()} />);
    const checked = screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
  });

  /** Hex casing varies by where it was written; the swatch must still match. */
  it('recognises a stored colour whatever its casing', () => {
    render(<TeamKitColorPicker value={TEAM_KIT_COLORS[1].hex.toLowerCase()} onChange={jest.fn()} />);
    const checked = screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(screen.getByLabelText('No colour')).toHaveAttribute('aria-checked', 'false');
  });

  it('marks "no colour" when the team has none', () => {
    render(<TeamKitColorPicker value={undefined} onChange={jest.fn()} />);
    expect(screen.getByLabelText('No colour')).toHaveAttribute('aria-checked', 'true');
  });

  it('goes inert while a save is in flight', () => {
    const onChange = jest.fn();
    render(<TeamKitColorPicker value={undefined} onChange={onChange} disabled />);
    fireEvent.click(screen.getAllByRole('radio')[0]);
    expect(onChange).not.toHaveBeenCalled();
  });

  /** A club with an odd strip should not be told their colour does not exist. */
  it('accepts a colour outside the preset set', () => {
    const onChange = jest.fn();
    render(<TeamKitColorPicker value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Custom colour'), { target: { value: '#123456' } });
    expect(onChange).toHaveBeenCalledWith('#123456'.toUpperCase());
  });

  /** A stored custom colour must read back as chosen, not as "none". */
  it('marks a custom colour as the current one', () => {
    render(<TeamKitColorPicker value="#123456" onChange={jest.fn()} />);
    expect(screen.getByLabelText('No colour')).toHaveAttribute('aria-checked', 'false');
    const presetsChecked = screen
      .getAllByRole('radio')
      .filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(presetsChecked).toHaveLength(0);
  });
});
