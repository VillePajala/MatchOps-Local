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
    intensity: 3,
    courage: 3,
    duels: 3,
    technique: 3,
    creativity: 3,
    decisions: 3,
    awareness: 3,
    teamwork: 3,
    fair_play: 3,
    impact: 3,
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
