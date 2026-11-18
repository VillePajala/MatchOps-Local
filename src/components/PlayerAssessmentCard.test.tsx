import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n.test';
import PlayerAssessmentCard from './PlayerAssessmentCard';
import type { Player, PlayerAssessment } from '@/types';

describe('PlayerAssessmentCard', () => {
  const player: Player = { id: 'p1', name: 'Test', jerseyNumber: '9' };

  const defaultSliders = {
    ball_control: 3,
    passing: 3,
    scanning: 3,
    game_reading: 3,
    decisions: 3,
    courage: 3,
    effort: 3,
    enjoyment: 3,
    teamwork: 3,
    fair_play: 3,
  };

  const createAssessment = (overrides: Partial<PlayerAssessment> = {}): PlayerAssessment => ({
    overall: 7,
    sliders: { ...defaultSliders },
    notes: 'test note',
    minutesPlayed: 0,
    createdAt: Date.now(),
    createdBy: 'test',
    ...overrides,
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders player name', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <PlayerAssessmentCard player={player} onSave={jest.fn()} />
      </I18nextProvider>
    );
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('calls onSave with assessment', () => {
    const onSave = jest.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <PlayerAssessmentCard player={player} onSave={onSave} />
      </I18nextProvider>
    );
    fireEvent.click(screen.getByText('Test'));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(onSave).toHaveBeenCalled();
  });

  it('loads existing assessment values', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <PlayerAssessmentCard
          player={player}
          onSave={jest.fn()}
          assessment={createAssessment({ notes: 'note' })}
        />
      </I18nextProvider>
    );
    fireEvent.click(screen.getByText('Test'));
    expect(screen.getByDisplayValue('note')).toBeInTheDocument();
  });

  /**
   * Round 2 (2a): an untouched default must not read as a given rating - it is
   * not announced as chosen (grey outline), and only a tap makes it a rating.
   * The values SAVED are unchanged: untouched metrics still save the default.
   */
  it('shows untouched defaults as not chosen, but saves them exactly as before', () => {
    const onSave = jest.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <PlayerAssessmentCard player={player} onSave={onSave} />
      </I18nextProvider>
    );
    fireEvent.click(screen.getByText('Test'));
    // Nothing is pressed before the coach taps.
    const pressedBefore = screen.queryAllByRole('button', { pressed: true });
    expect(pressedBefore).toHaveLength(0);
    // Tap overall 7: it becomes the one chosen value.
    fireEvent.click(screen.getByRole('button', { name: '7' }));
    expect(screen.getByRole('button', { name: '7' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    const saved = onSave.mock.calls[0][0];
    expect(saved.overall).toBe(7);
    // Every untouched metric saves the default (canonical 5), as before.
    expect(Object.values(saved.sliders).every((v) => v === 5)).toBe(true);
  });

  it('keeps untouched defaults grey after the auto-save stores the assessment', () => {
    const onSave = jest.fn();
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <PlayerAssessmentCard player={player} onSave={onSave} />
      </I18nextProvider>
    );
    fireEvent.click(screen.getByText('Test'));
    fireEvent.click(screen.getByRole('button', { name: '7' }));
    act(() => { jest.advanceTimersByTime(900); });
    expect(onSave).toHaveBeenCalledTimes(1);
    const stored = { ...createAssessment(), ...onSave.mock.calls[0][0] } as PlayerAssessment;
    // The stored assessment comes back as a prop (our own save's echo).
    rerender(
      <I18nextProvider i18n={i18n}>
        <PlayerAssessmentCard player={player} onSave={onSave} assessment={stored} />
      </I18nextProvider>
    );
    // Only the overall the coach tapped reads as chosen.
    expect(screen.getAllByRole('button', { pressed: true }).map((b) => b.getAttribute('aria-label'))).toEqual(['7']);
  });

  it('shows a stored assessment as chosen ratings', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <PlayerAssessmentCard player={player} onSave={jest.fn()} assessment={createAssessment({ overall: 8 })} />
      </I18nextProvider>
    );
    fireEvent.click(screen.getByText('Test'));
    expect(screen.getByRole('button', { name: '8' })).toHaveAttribute('aria-pressed', 'true');
  });

  describe('auto-save prevention after assessment reset', () => {
    /**
     * Tests that auto-save does not trigger when assessment is reset
     * @critical - Prevents deleted assessments from being re-created
     *
     * Bug scenario: Player is deleted → assessment prop becomes undefined →
     * useLayoutEffect resets state → auto-save useEffect sees "change" and saves
     *
     * Fix: Update prev.current in useLayoutEffect to prevent auto-save trigger
     */
    it('does not auto-save when assessment prop changes from value to undefined', async () => {
      const onSave = jest.fn();

      const { rerender } = render(
        <I18nextProvider i18n={i18n}>
          <PlayerAssessmentCard
            player={player}
            onSave={onSave}
            assessment={createAssessment({ overall: 8, notes: 'existing' })}
          />
        </I18nextProvider>
      );

      // Verify initial assessment loaded
      fireEvent.click(screen.getByText('Test'));
      expect(screen.getByDisplayValue('existing')).toBeInTheDocument();

      // Close the card
      fireEvent.click(screen.getByText('Test'));

      // Clear any calls from initial render
      onSave.mockClear();

      // Simulate assessment being cleared (e.g., player deleted)
      await act(async () => {
        rerender(
          <I18nextProvider i18n={i18n}>
            <PlayerAssessmentCard
              player={player}
              onSave={onSave}
              assessment={undefined}
            />
          </I18nextProvider>
        );
      });

      // Advance timers to trigger any auto-save debounce
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // onSave should NOT have been called - the state reset should not trigger auto-save
      expect(onSave).not.toHaveBeenCalled();
    });

    /**
     * Tests that legitimate user changes still trigger auto-save
     * @critical - Ensure the fix doesn't break normal auto-save functionality
     */
    it('still auto-saves when user makes actual changes', async () => {
      const onSave = jest.fn();

      render(
        <I18nextProvider i18n={i18n}>
          <PlayerAssessmentCard
            player={player}
            onSave={onSave}
            assessment={createAssessment({ notes: 'original' })}
          />
        </I18nextProvider>
      );

      // Expand card and modify notes
      fireEvent.click(screen.getByText('Test'));
      const notesInput = screen.getByDisplayValue('original');
      fireEvent.change(notesInput, { target: { value: 'modified by user' } });

      // Wait for auto-save debounce
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Auto-save SHOULD have been called with user changes
      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });
    });

    /**
     * Review 4.16: a change made within the debounce window is saved when the card
     * closes (it used to be dropped), and an unchanged card saves nothing on close.
     * @critical
     */
    it('saves a pending change when the card closes before the debounce fires', async () => {
      const onSave = jest.fn();
      const { unmount } = render(
        <I18nextProvider i18n={i18n}>
          <PlayerAssessmentCard player={player} onSave={onSave} assessment={createAssessment({ notes: 'original' })} />
        </I18nextProvider>
      );
      fireEvent.click(screen.getByText('Test'));
      fireEvent.change(screen.getByDisplayValue('original'), { target: { value: 'last words' } });
      await act(async () => { jest.advanceTimersByTime(300); }); // closed within 0.8 s
      expect(onSave).not.toHaveBeenCalled();
      unmount();
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave.mock.calls[0][0]).toMatchObject({ notes: 'last words' });
    });

    it('does not save again on close after an explicit Save', () => {
      const onSave = jest.fn();
      const { unmount } = render(
        <I18nextProvider i18n={i18n}>
          <PlayerAssessmentCard player={player} onSave={onSave} assessment={createAssessment({ notes: 'original' })} />
        </I18nextProvider>
      );
      fireEvent.click(screen.getByText('Test'));
      fireEvent.change(screen.getByDisplayValue('original'), { target: { value: 'saved by button' } });
      fireEvent.click(screen.getByRole('button', { name: /save|tallenna/i }));
      expect(onSave).toHaveBeenCalledTimes(1);
      unmount();
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('does not bring a deleted assessment back on close', async () => {
      const onSave = jest.fn();
      const onDelete = jest.fn();
      const { unmount } = render(
        <I18nextProvider i18n={i18n}>
          <PlayerAssessmentCard player={player} onSave={onSave} onDelete={onDelete} assessment={createAssessment({ notes: 'original' })} />
        </I18nextProvider>
      );
      fireEvent.click(screen.getByText('Test'));
      fireEvent.change(screen.getByDisplayValue('original'), { target: { value: 'edited then deleted' } });
      fireEvent.click(screen.getByRole('button', { name: /^(reset|nollaa|tyhjennä)$/i }));
      expect(onDelete).toHaveBeenCalled();
      unmount();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('saves nothing on close when nothing changed', () => {
      const onSave = jest.fn();
      const { unmount } = render(
        <I18nextProvider i18n={i18n}>
          <PlayerAssessmentCard player={player} onSave={onSave} assessment={createAssessment({ notes: 'original' })} />
        </I18nextProvider>
      );
      unmount();
      expect(onSave).not.toHaveBeenCalled();
    });

    /**
     * Tests re-render with same assessment doesn't trigger save
     * @edge-case - Component re-renders shouldn't cause spurious saves
     */
    it('does not auto-save on re-render with same assessment values', async () => {
      const onSave = jest.fn();
      const assessment = createAssessment({ overall: 6 });

      const { rerender } = render(
        <I18nextProvider i18n={i18n}>
          <PlayerAssessmentCard
            player={player}
            onSave={onSave}
            assessment={assessment}
          />
        </I18nextProvider>
      );

      onSave.mockClear();

      // Re-render with equivalent assessment (same values)
      await act(async () => {
        rerender(
          <I18nextProvider i18n={i18n}>
            <PlayerAssessmentCard
              player={player}
              onSave={onSave}
              assessment={{ ...assessment }}
            />
          </I18nextProvider>
        );
      });

      // Advance timers
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Should not trigger auto-save
      expect(onSave).not.toHaveBeenCalled();
    });
  });
});
