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
    // ...and it is a scored row now: unhandled audio is unfinished work.
    expect(screen.getByTestId('wrap-up-status-voiceNotes-todo')).toBeInTheDocument();
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
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent(/^\d\/6$/);
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
      // One of the two written about: partial there too, so nothing is amber.
      gameEvents: [{ type: 'note', entityId: 'p1' }],
    });
    render(<GameWrapUpCard completeness={partial} />);

    // Started, so neither a green tick nor an amber warning.
    expect(screen.getByTestId('wrap-up-status-positions-partial')).toBeInTheDocument();
    expect(screen.getByTestId('wrap-up-status-assessments-partial')).toBeInTheDocument();
    expect(screen.queryByTestId('wrap-up-status-positions-todo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wrap-up-status-assessments-todo')).not.toBeInTheDocument();

    // And the count agrees: nothing is amber, so the bar is full.
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent('6/6');
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
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent('5/6');
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

describe('assessments setting', () => {
  /** A 0/0 row would sit forever unfinished, pointing at a hidden editor. */
  it('drops the assessments row when the model reports 0/0', () => {
    const off = computeGameCompleteness(
      { isPlayed: true, gameNotes: 'x', selectedPlayerIds: ['a'], seasonId: '', tournamentId: '', teamId: '', playerPositions: {}, assessments: {} },
      { assessmentsEnabled: false },
    );
    render(<GameWrapUpCard completeness={off} onOpenAssessments={jest.fn()} />);
    expect(screen.queryByText('Player assessments')).not.toBeInTheDocument();
    expect(screen.getByText('Positions played')).toBeInTheDocument();
  });
});

describe('rows match the counter', () => {
  /** Every item the counter counts is a row, done or not, or the list and the number disagree. */
  it('shows the squad row as done rather than hiding it', () => {
    const c = computeGameCompleteness(
      { isPlayed: true, gameNotes: 'x', selectedPlayerIds: ['a'], seasonId: '', tournamentId: '', teamId: '', playerPositions: {}, assessments: {} },
      { assessmentsEnabled: false },
    );
    render(<GameWrapUpCard completeness={c} />);
    expect(screen.getByTestId('wrap-up-status-roster-done')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent('3/5');
  });
});

describe('consistency rows', () => {
  const game = (over: Parameters<typeof computeGameCompleteness>[0] = {}) =>
    computeGameCompleteness({
      isPlayed: true, gameNotes: 'x', selectedPlayerIds: ['a', 'b'], seasonId: 's', tournamentId: '',
      teamId: 't', playerPositions: {}, assessments: {}, homeScore: 0, awayScore: 0, gameEvents: [], ...over,
    }, { assessmentsEnabled: false });

  it('shows the goal log against the score and routes to the goal log', () => {
    const onAddGoal = jest.fn();
    render(<GameWrapUpCard completeness={game({ homeScore: 2, awayScore: 1, gameEvents: [{ type: 'goal' }] })} onAddGoal={onAddGoal} />);
    expect(screen.getByText('Goals logged')).toBeInTheDocument();
    expect(screen.getByTestId('wrap-up-status-goals-partial')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Goals logged'));
    expect(onAddGoal).toHaveBeenCalled();
  });

  it('asks for a scorer only when we scored', () => {
    render(<GameWrapUpCard completeness={game({ homeScore: 1, awayScore: 0, gameEvents: [{ type: 'goal' }] })} />);
    expect(screen.getByText('Goal scorers named')).toBeInTheDocument();
  });

  it('has no scorer row when only the opponent scored', () => {
    render(<GameWrapUpCard completeness={game({ homeScore: 0, awayScore: 1, gameEvents: [{ type: 'opponentGoal' }] })} />);
    expect(screen.queryByText('Goal scorers named')).not.toBeInTheDocument();
  });

  /**
   * @critical - a row the counter cannot count is the mismatch this card has
   * produced twice. Voice clips are a banner precisely because the model does
   * not know about them.
   */
  it('keeps the rows equal to the counter, with clips waiting', () => {
    render(<GameWrapUpCard completeness={game()} voiceClipCount={3} onOpenVoiceNotes={jest.fn()} />);
    const rows = screen.getAllByRole('listitem');
    const [, total] = (screen.getByTestId('wrap-up-progress-count').textContent ?? '').split('/');
    expect(rows).toHaveLength(Number(total));
  });
});

describe('notes-coverage row', () => {
  /** @critical - it pointed at the voice inbox, which does not exist without a clip. */
  it('is a line, not a scored row, and leads to the notes step', () => {
    const onOpenNotes = jest.fn();
    const onOpenVoiceNotes = jest.fn();
    const c = computeGameCompleteness({
      isPlayed: true, gameNotes: 'x', selectedPlayerIds: ['a'], seasonId: '', tournamentId: '',
      teamId: '', playerPositions: {}, assessments: {}, gameEvents: [], homeScore: 0, awayScore: 0,
    }, { assessmentsEnabled: false });
    render(<GameWrapUpCard completeness={c} onOpenNotes={onOpenNotes} onOpenVoiceNotes={onOpenVoiceNotes} />);
    const line = screen.getByTestId('wrap-up-notes-line');
    expect(line).toHaveTextContent('0/1');
    // Not one of the numbered rows, so it can never read as owed.
    expect(line.closest('li')).toBeNull();
    fireEvent.click(line);
    expect(onOpenNotes).toHaveBeenCalledTimes(1);
    expect(onOpenVoiceNotes).not.toHaveBeenCalled();
  });
});

describe('the recordings row turns green', () => {
  /** The coach sees the last clip written out, and the row go from amber to a tick. */
  it('is amber while clips wait and done once they are written out', () => {
    const withAudio = computeGameCompleteness({
      isPlayed: true, gameNotes: 'x', selectedPlayerIds: ['a'], seasonId: '', tournamentId: '',
      teamId: '', playerPositions: {}, assessments: {}, homeScore: 0, awayScore: 0,
      gameEvents: [{ type: 'note', entityId: 'a', source: 'dictation' }],
    }, { assessmentsEnabled: false });
    const { rerender } = render(<GameWrapUpCard completeness={withAudio} voiceClipCount={1} />);
    expect(screen.getByTestId('wrap-up-status-voiceNotes-todo')).toBeInTheDocument();
    rerender(<GameWrapUpCard completeness={withAudio} voiceClipCount={0} />);
    expect(screen.getByTestId('wrap-up-status-voiceNotes-done')).toBeInTheDocument();
    expect(screen.getByText('Voice notes written out')).toBeInTheDocument();
  });

  it('says nothing about recordings for a game that never had any', () => {
    const noAudio = computeGameCompleteness({
      isPlayed: true, gameNotes: 'x', selectedPlayerIds: ['a'], seasonId: '', tournamentId: '',
      teamId: '', playerPositions: {}, assessments: {}, homeScore: 0, awayScore: 0, gameEvents: [],
    }, { assessmentsEnabled: false });
    render(<GameWrapUpCard completeness={noAudio} voiceClipCount={0} />);
    expect(screen.queryByTestId('wrap-up-status-voiceNotes-done')).not.toBeInTheDocument();
  });
});
