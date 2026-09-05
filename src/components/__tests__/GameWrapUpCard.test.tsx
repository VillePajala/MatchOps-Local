import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GameWrapUpCard from '../GameWrapUpCard';
import { computeGameCompleteness } from '@/utils/gameCompleteness';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options?.[name] ?? '')),
  }),
}));

const completeness = computeGameCompleteness({
  isPlayed: true,
  gameNotes: '',
  selectedPlayerIds: ['p1', 'p2'],
  seasonId: '',
  tournamentId: '',
  teamId: '',
  playerPositions: {},
  assessments: {},
});

describe('GameWrapUpCard - Kirjuri voice notes row', () => {
  it('offers the voice-notes row only while clips await review, routing to the inbox', () => {
    const onOpenVoiceNotes = jest.fn();
    const { rerender } = render(<GameWrapUpCard completeness={completeness} voiceClipCount={0} onOpenVoiceNotes={onOpenVoiceNotes} />);
    expect(screen.queryByText(/voice notes to review/)).not.toBeInTheDocument();

    rerender(<GameWrapUpCard completeness={completeness} voiceClipCount={3} onOpenVoiceNotes={onOpenVoiceNotes} />);
    fireEvent.click(screen.getByText('3 voice notes to review'));
    expect(onOpenVoiceNotes).toHaveBeenCalledTimes(1);
  });

  it('report and positions rows scroll within the page instead of leaving it', () => {
    const onOpenReport = jest.fn();
    const onOpenPositions = jest.fn();
    render(<GameWrapUpCard completeness={completeness} onOpenReport={onOpenReport} onOpenPositions={onOpenPositions} />);
    fireEvent.click(screen.getByText('Match report'));
    fireEvent.click(screen.getByText('Positions played'));
    expect(onOpenReport).toHaveBeenCalledTimes(1);
    expect(onOpenPositions).toHaveBeenCalledTimes(1);
  });

  it('shows how much of the finishing work is done', () => {
    render(<GameWrapUpCard completeness={completeness} />);

    // The number and the bar come from the same model the list does, so they
    // cannot disagree with the rows underneath.
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent(/^\d\/5$/);
    expect(screen.getByTestId('wrap-up-progress-bar')).toBeInTheDocument();
  });

  /**
   * @critical - the bar and the list have twice drifted apart (first the
   * competition/team row, then these two). The rule is now one function, and
   * this test states it end to end: a row the list shows in amber is a row the
   * bar does not count, and every other row it does.
   */
  it('never counts a row the list shows as outstanding, and always counts the rest', () => {
    // One of two players positioned and assessed: genuinely partial, which is
    // the state that used to read "all done" on the bar and "todo" in the list.
    const partial = computeGameCompleteness({
      isPlayed: true,
      gameNotes: 'Yleiskuva',
      selectedPlayerIds: ['p1', 'p2'],
      seasonId: 's1',
      tournamentId: '',
      teamId: 't1',
      playerPositions: { p1: ['CM'] },
      assessments: { p1: { overall: 7 } },
    });
    render(<GameWrapUpCard completeness={partial} />);

    // Started, so neither a green tick nor an amber warning.
    expect(screen.getByTestId('wrap-up-status-positions-partial')).toBeInTheDocument();
    expect(screen.getByTestId('wrap-up-status-assessments-partial')).toBeInTheDocument();
    expect(screen.queryByTestId('wrap-up-status-positions-todo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wrap-up-status-assessments-todo')).not.toBeInTheDocument();

    // And the count agrees: nothing is amber, so the bar is full.
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent('5/5');
  });

  it('shows an outstanding row in amber and leaves it out of the count', () => {
    // Nobody assessed: the row is amber, so the bar must not count it.
    const noAssessments = computeGameCompleteness({
      isPlayed: true,
      gameNotes: 'Yleiskuva',
      selectedPlayerIds: ['p1', 'p2'],
      seasonId: 's1',
      tournamentId: '',
      teamId: 't1',
      playerPositions: { p1: ['CM'], p2: ['RB'] },
      assessments: {},
    });
    render(<GameWrapUpCard completeness={noAssessments} />);

    expect(screen.getByTestId('wrap-up-status-assessments-todo')).toBeInTheDocument();
    // All squad positioned -> the solid tick, not the partial one.
    expect(screen.getByTestId('wrap-up-status-positions-done')).toBeInTheDocument();
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent('4/5');
  });

  it('does not call the game Complete while clips still wait', () => {
    const complete = computeGameCompleteness({
      isPlayed: true, gameNotes: 'Good game', selectedPlayerIds: ['p1'], seasonId: '', tournamentId: '', teamId: '', playerPositions: {}, assessments: {},
    });
    const { rerender } = render(<GameWrapUpCard completeness={complete} voiceClipCount={0} />);
    expect(screen.getByText('Complete')).toBeInTheDocument();
    rerender(<GameWrapUpCard completeness={complete} voiceClipCount={1} />);
    expect(screen.getByText('Needs finishing')).toBeInTheDocument();
  });
});
