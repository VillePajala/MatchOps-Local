/**
 * @jest-environment jsdom
 * @critical - a team's colour is the one piece of a team that is purely the
 * coach's own. Losing the ability to clear it, or failing to show back a
 * colour already saved, strands them with a choice they cannot undo.
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
    const checked = screen
      .getAllByRole('radio')
      .filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
  });

  /** Hex casing varies by where it was written; the swatch must still match. */
  it('recognises a stored colour whatever its casing', () => {
    render(
      <TeamKitColorPicker value={TEAM_KIT_COLORS[1].hex.toLowerCase()} onChange={jest.fn()} />,
    );
    const checked = screen
      .getAllByRole('radio')
      .filter((r) => r.getAttribute('aria-checked') === 'true');
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

  /**
   * The native colour input is gone - it handed the coach the OS dialog in the
   * middle of the app. Nothing here may open one.
   */
  it('opens no operating-system colour dialog', () => {
    const { container } = render(<TeamKitColorPicker value={undefined} onChange={jest.fn()} />);
    expect(container.querySelector('input[type="color"]')).toBeNull();
  });

  describe('a colour saved before the grid existed', () => {
    const CUSTOM = '#123456';

    /**
     * Without this the value would sit in the database while the UI showed
     * "no colour chosen", and one careless tap would clear it for real.
     */
    it('still shows it, and shows it as chosen', () => {
      render(<TeamKitColorPicker value={CUSTOM} onChange={jest.fn()} />);
      const legacy = screen.getByTestId('kit-colour-legacy');
      expect(legacy).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByLabelText('No colour')).toHaveAttribute('aria-checked', 'false');
    });

    it('does not claim any preset is the chosen one', () => {
      render(<TeamKitColorPicker value={CUSTOM} onChange={jest.fn()} />);
      const checked = screen
        .getAllByRole('radio')
        .filter((r) => r.getAttribute('aria-checked') === 'true');
      expect(checked).toHaveLength(1);
      expect(checked[0]).toHaveAttribute('data-testid', 'kit-colour-legacy');
    });

    /** It is a curated set; a one-off colour must not join it. */
    it('is absent when the stored colour is a preset', () => {
      render(<TeamKitColorPicker value={TEAM_KIT_COLORS[0].hex} onChange={jest.fn()} />);
      expect(screen.queryByTestId('kit-colour-legacy')).not.toBeInTheDocument();
    });
  });

  /** Four full rows of six: the layout the widened palette exists to fill. */
  it('offers a palette that fills the grid exactly', () => {
    expect((TEAM_KIT_COLORS.length + 1) % 6).toBe(0);
  });

  it('has no duplicate colours', () => {
    const hexes = TEAM_KIT_COLORS.map((c) => c.hex.toLowerCase());
    expect(new Set(hexes).size).toBe(hexes.length);
    const ids = TEAM_KIT_COLORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
