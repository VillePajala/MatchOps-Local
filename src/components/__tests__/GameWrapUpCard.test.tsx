import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GameWrapUpCard from '../GameWrapUpCard';
import { computeGameCompleteness as computeRaw } from '@/utils/gameCompleteness';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options?.[name] ?? '')),
  }),
}));

/** A finished (started) game - only a started game is judged (R2). */
const computeGameCompleteness = (...[game, options]: Parameters<typeof computeRaw>) =>
  computeRaw({ gameStatus: 'gameEnd', ...game }, options);

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
    // ...shown as outstanding work, though not part of the core count.
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
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent(/^\d\/2$/);
    expect(screen.getByTestId('wrap-up-progress-bar')).toBeInTheDocument();
  });

  /**
   * @critical - R7: the counter is the D2 core only, so it agrees with
   * "Complete" whatever the other rows say.
   */
  it('counts only squad and goal log, whatever the other rows say', () => {
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

    // Squad + a consistent 0-0 goal log: the core is done, so the counter is full.
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent('2/2');
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('shows an outstanding row in amber without it touching the count', () => {
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
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent('2/2');
  });

  /** @critical - "Complete" and the counter follow the same rule, clips or not. */
  it('keeps Complete and a full counter while clips wait - the clips row stays amber', () => {
    const complete = computeGameCompleteness({
      isPlayed: true, gameNotes: 'Good game', selectedPlayerIds: ['p1'], seasonId: '', tournamentId: '', teamId: '', playerPositions: {}, assessments: {},
    });
    render(<GameWrapUpCard completeness={complete} voiceClipCount={1} />);
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent('2/2');
    expect(screen.getByTestId('wrap-up-status-voiceNotes-todo')).toBeInTheDocument();
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
  /** Both counted items are rows, done or not, or the list and the number disagree. */
  it('shows the squad row as done rather than hiding it', () => {
    const c = computeGameCompleteness(
      { isPlayed: true, gameNotes: 'x', selectedPlayerIds: ['a'], seasonId: '', tournamentId: '', teamId: '', playerPositions: {}, assessments: {} },
      { assessmentsEnabled: false },
    );
    render(<GameWrapUpCard completeness={c} />);
    expect(screen.getByTestId('wrap-up-status-roster-done')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(screen.getByTestId('wrap-up-status-goals-done')).toBeInTheDocument();
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent('2/2');
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

  /** @critical - the counter's total is the two core rows, which are always listed. */
  it('always lists the two counted rows', () => {
    render(<GameWrapUpCard completeness={game()} voiceClipCount={3} onOpenVoiceNotes={jest.fn()} />);
    expect(screen.getByTestId('wrap-up-status-roster-done')).toBeInTheDocument();
    expect(screen.getByTestId('wrap-up-status-goals-done')).toBeInTheDocument();
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent('2/2');
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
    expect(line.tagName).toBe('BUTTON');
    // Not one of the numbered rows, so it can never read as owed.
    expect(line.closest('li')).toBeNull();
    fireEvent.click(line);
    expect(onOpenNotes).toHaveBeenCalledTimes(1);
    expect(onOpenVoiceNotes).not.toHaveBeenCalled();
  });

  /** A button with nothing behind it invites a tap that does nothing. */
  it('is plain text when no caller gave it somewhere to go', () => {
    const c = computeGameCompleteness({
      isPlayed: true, gameNotes: 'x', selectedPlayerIds: ['a'], seasonId: '', tournamentId: '',
      teamId: '', playerPositions: {}, assessments: {}, gameEvents: [], homeScore: 0, awayScore: 0,
    }, { assessmentsEnabled: false });
    render(<GameWrapUpCard completeness={c} />);
    expect(screen.getByTestId('wrap-up-notes-line').tagName).toBe('DIV');
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

describe('D2 "valmis" and the competition row', () => {
  const base = {
    isPlayed: true, gameNotes: '', selectedPlayerIds: ['a'], seasonId: '', tournamentId: '',
    teamId: '', playerPositions: {}, assessments: {},
  };

  /**
   * @critical - the report is a checklist item, not the bar for Complete (D2):
   * squad + a goal log matching the score is.
   */
  it('calls a game Complete without a report once the goal log matches the score', () => {
    const c = computeGameCompleteness({ ...base, gameEvents: [{ type: 'goal' }], homeScore: 1, awayScore: 0 });
    render(<GameWrapUpCard completeness={c} />);
    expect(screen.getByText('Complete')).toBeInTheDocument();
    // The report row is still there to do.
    expect(screen.getByTestId('wrap-up-status-report-todo')).toBeInTheDocument();
  });

  it('says Needs finishing while goals are missing from the log', () => {
    const c = computeGameCompleteness({ ...base, gameNotes: 'Report', gameEvents: [{ type: 'goal' }], homeScore: 2, awayScore: 0 });
    render(<GameWrapUpCard completeness={c} />);
    expect(screen.getByText('Needs finishing')).toBeInTheDocument();
  });

  /** The competition row is hidden when not relevant (basic layout, or nothing to link to). */
  it('hides the competition row when not relevant, the count unchanged', () => {
    const c = computeGameCompleteness(base, { assessmentsEnabled: false });
    const { rerender } = render(<GameWrapUpCard completeness={c} />);
    expect(screen.getByText('Competition & team')).toBeInTheDocument();
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent('2/2');

    rerender(<GameWrapUpCard completeness={c} showCompetition={false} />);
    expect(screen.queryByText('Competition & team')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByTestId('wrap-up-progress-count')).toHaveTextContent('2/2');
  });
});
