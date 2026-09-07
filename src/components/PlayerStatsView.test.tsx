import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent, act } from '../../tests/utils/test-utils';
import PlayerStatsView from './PlayerStatsView';
import { AppState, Player, Season, Tournament } from '@/types';

jest.mock('./SparklineChart', () => {
  const Mock = () => <div data-testid="sparkline-chart" />;
  Mock.displayName = 'MockSparklineChart';
  return Mock;
});

jest.mock('./MetricTrendChart', () => {
  const Mock = () => <div data-testid="metric-trend-chart" />;
  Mock.displayName = 'MockMetricTrendChart';
  return Mock;
});

jest.mock('./MetricAreaChart', () => {
  const Mock = () => <div data-testid="metric-area-chart" />;
  Mock.displayName = 'MockMetricAreaChart';
  return Mock;
});

jest.mock('./RatingBar', () => {
  const Mock = ({ value }: { value: number }) => <div data-testid="rating-bar">{value}</div>;
  Mock.displayName = 'MockRatingBar';
  return Mock;
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValueOrOptions?: string | { defaultValue?: string }) =>
      typeof defaultValueOrOptions === 'string'
        ? defaultValueOrOptions
        : defaultValueOrOptions?.defaultValue || '',
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

jest.mock('@/utils/appSettings', () => ({
  getAppSettings: jest.fn().mockResolvedValue({
    useDemandCorrection: false,
    clubSeasonStartDate: '2000-10-01',
    clubSeasonEndDate: '2000-05-01',
  }),
  updateAppSettings: jest.fn(),
}));

jest.mock('@/utils/playerAdjustments', () => ({
  getAdjustmentsForPlayer: jest.fn().mockResolvedValue([]),
  addPlayerAdjustment: jest.fn(),
  updatePlayerAdjustment: jest.fn(),
  deletePlayerAdjustment: jest.fn(),
}));

jest.mock('@/utils/assessmentStats', () => ({
  calculatePlayerAssessmentAverages: jest.fn().mockReturnValue(null),
  calculatePlayerDevelopment: jest.fn().mockReturnValue(null),
  getPlayerAssessmentTrends: jest.fn().mockReturnValue(null),
  getPlayerAssessmentNotes: jest.fn().mockReturnValue([]),
}));

const player: Player = {
  id: 'player-1',
  name: 'Alex Striker',
  jerseyNumber: '10',
  isGoalie: false,
  receivedFairPlayCard: false,
};

const createGame = (overrides: Partial<AppState>): AppState => ({
  playersOnField: [player],
  opponents: [],
  drawings: [],
  availablePlayers: [player],
  showPlayerNames: true,
  teamName: 'Home Team',
  gameEvents: [],
  opponentName: 'Opponent',
  gameDate: '2024-01-01',
  homeScore: 2,
  awayScore: 1,
  gameNotes: '',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 20,
  currentPeriod: 1,
  gameStatus: 'gameEnd',
  selectedPlayerIds: [player.id],
  assessments: {},
  seasonId: '',
  tournamentId: '',
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: null,
  isPlayed: true,
  ...overrides,
});

const baseProps = {
  player,
  onGameClick: jest.fn(),
  seasons: [] as Season[],
  tournaments: [] as Tournament[],
  selectedClubSeason: 'all',
  clubSeasonStartDate: '2000-10-01',
  clubSeasonEndDate: '2000-05-01',
};

beforeAll(() => {
  (global as typeof globalThis).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('PlayerStatsView game type filtering', () => {
  const buildSavedGames = () => ({
    'soccer-game': createGame({
      opponentName: 'Soccer Opponent',
      gameDate: '2024-02-15',
      gameType: 'soccer',
    }),
    'futsal-game': createGame({
      opponentName: 'Futsal Opponent',
      gameDate: '2024-03-20',
      gameType: 'futsal',
    }),
    'legacy-game': createGame({
      opponentName: 'Legacy Opponent',
      gameDate: '2024-01-10',
    }),
  });

  it('shows only futsal games when futsal filter is selected', async () => {
    const savedGames = buildSavedGames();

    render(
      <PlayerStatsView
        {...baseProps}
        savedGames={savedGames}
        selectedGameTypeFilter="futsal"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Games Played')).toBeInTheDocument();
    });

    const gamesPlayedLabel = screen.getByText('Games Played');
    expect(gamesPlayedLabel.previousElementSibling).toHaveTextContent('1');

    expect(screen.getByText(/Futsal Opponent/)).toBeInTheDocument();
    expect(screen.queryByText(/Soccer Opponent/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Legacy Opponent/)).not.toBeInTheDocument();
    expect(screen.getByText('Futsal')).toBeInTheDocument();
  });

  it('treats legacy games as soccer when filtering for soccer', async () => {
    const savedGames = buildSavedGames();

    render(
      <PlayerStatsView
        {...baseProps}
        savedGames={savedGames}
        selectedGameTypeFilter="soccer"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Games Played')).toBeInTheDocument();
    });

    const gamesPlayedLabel = screen.getByText('Games Played');
    expect(gamesPlayedLabel.previousElementSibling).toHaveTextContent('2');

    expect(screen.getByText(/Soccer Opponent/)).toBeInTheDocument();
    expect(screen.getByText(/Legacy Opponent/)).toBeInTheDocument();
    expect(screen.queryByText(/Futsal Opponent/)).not.toBeInTheDocument();
    expect(screen.queryByText('Futsal')).not.toBeInTheDocument();
  });
});

describe('External game cards styling', () => {
  const mockAdjustment = {
    id: 'adj-1',
    seasonId: 'season-1',
    tournamentId: 'tournament-1',
    gamesPlayedDelta: 1,
    goalsDelta: 2,
    assistsDelta: 1,
    fairPlayCardsDelta: 0,
    note: 'Great game',
    homeOrAway: 'home' as const,
    externalTeamName: 'My Team',
    opponentName: 'External Opponent',
    gameDate: '2024-03-15',
    scoreFor: 3,
    scoreAgainst: 1,
    includeInSeasonTournament: false,
    appliedAt: '2024-03-15T12:00:00Z',
  };

  const mockSeason: Season = {
    id: 'season-1',
    name: 'Spring 2024',
    startDate: '2024-01-01',
    endDate: '2024-06-30',
    gameType: 'soccer',
  };

  const mockTournament: Tournament = {
    id: 'tournament-1',
    name: 'Cup Tournament',
    startDate: '2024-03-01',
    endDate: '2024-03-31',
    gameType: 'soccer',
  };

  beforeEach(() => {
    jest.clearAllMocks();
     
    const { getAdjustmentsForPlayer } = require('@/utils/playerAdjustments');
    getAdjustmentsForPlayer.mockResolvedValue([mockAdjustment]);
  });

  it('should display two-row layout with date on bottom left and badges on bottom right', async () => {
    render(
      <PlayerStatsView
        {...baseProps}
        savedGames={{}}
        seasons={[mockSeason]}
        tournaments={[mockTournament]}
      />
    );

    // Wait for external games section to load
    await waitFor(() => {
      expect(screen.getByText('External Games')).toBeInTheDocument();
    });

    // Expand the external games section
    await act(async () => {
      fireEvent.click(screen.getByText('External Games'));
    });

    await waitFor(() => {
      // Check score display is present (top row)
      expect(screen.getByText(/My Team 3 - 1 External Opponent/)).toBeInTheDocument();
    });

    // Check date is displayed (bottom row left)
    expect(screen.getByText(/Mar 15, 2024|15\.3\.2024/)).toBeInTheDocument();

    // Check EXT badge is displayed (bottom row right)
    expect(screen.getByText('EXT')).toBeInTheDocument();
  });

  it('should show colored dot indicators for badges (purple=EXT, blue=season, amber=tournament)', async () => {
    render(
      <PlayerStatsView
        {...baseProps}
        savedGames={{}}
        seasons={[mockSeason]}
        tournaments={[mockTournament]}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('External Games')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('External Games'));
    });

    await waitFor(() => {
      expect(screen.getByText('EXT')).toBeInTheDocument();
    });

    // Find EXT badge and verify it has purple styling
    const extBadge = screen.getByText('EXT').closest('span');
    expect(extBadge).toHaveClass('bg-purple-600/40');

    // Find purple dot inside EXT badge
    const purpleDot = extBadge?.querySelector('.bg-purple-400');
    expect(purpleDot).toBeInTheDocument();

    // Find season badge with blue dot
    const seasonBadge = screen.getByText('Spring 2024 (2024)').closest('span');
    expect(seasonBadge).toHaveClass('bg-slate-700/60');
    const blueDot = seasonBadge?.querySelector('.bg-blue-400');
    expect(blueDot).toBeInTheDocument();

    // Find tournament badge with amber dot
    const tournamentBadge = screen.getByText('Cup Tournament (2024)').closest('span');
    expect(tournamentBadge).toHaveClass('bg-slate-700/60');
    const amberDot = tournamentBadge?.querySelector('.bg-amber-400');
    expect(amberDot).toBeInTheDocument();
  });

  it('should not display home/away/neutral text in external game cards', async () => {
    render(
      <PlayerStatsView
        {...baseProps}
        savedGames={{}}
        seasons={[mockSeason]}
        tournaments={[mockTournament]}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('External Games')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('External Games'));
    });

    await waitFor(() => {
      expect(screen.getByText('EXT')).toBeInTheDocument();
    });

    // Verify home/away/neutral text is NOT displayed
    expect(screen.queryByText('(Home)')).not.toBeInTheDocument();
    expect(screen.queryByText('(Away)')).not.toBeInTheDocument();
    expect(screen.queryByText('(Neutral)')).not.toBeInTheDocument();
  });

  it('should display note in external game card when present', async () => {
    render(
      <PlayerStatsView
        {...baseProps}
        savedGames={{}}
        seasons={[mockSeason]}
        tournaments={[mockTournament]}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('External Games')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('External Games'));
    });

    await waitFor(() => {
      // Note should be displayed with quotes
      expect(screen.getByText(/Great game/)).toBeInTheDocument();
    });
  });

  it('shows the Positions played card and flags a single-line player as narrow', async () => {
    const savedGames = {
      g1: createGame({ playerPositions: { 'player-1': ['st'] }, gameDate: '2024-03-01' }),
      g2: createGame({ playerPositions: { 'player-1': ['st'] }, gameDate: '2024-03-08' }),
      g3: createGame({ playerPositions: { 'player-1': ['lw'] }, gameDate: '2024-03-15' }),
    };
    render(<PlayerStatsView {...baseProps} savedGames={savedGames} />);
    await waitFor(() => expect(screen.getByText('Positions played')).toBeInTheDocument());
    // st + st + lw are all attacking -> one line across 3 games -> narrow
    expect(screen.getByText('Narrow')).toBeInTheDocument();
    // exact positions are listed (ST played twice)
    expect(screen.getByText(/ST/)).toBeInTheDocument();
  });
});

/**
 * Correcting an existing entry.
 *
 * @critical - every external game recorded before this feature has no team on
 * it, so the edit form is the only way to say that one of them was in fact
 * your own team's match.
 */
describe('PlayerStatsView - editing which team an external game was for', () => {
  const myTeam = { id: 'teamA', name: 'FC Oma' } as never;
  const existing = {
    id: 'adj-1',
    playerId: 'player-1',
    teamId: 'teamA',
    externalTeamName: 'FC Oma',
    opponentName: 'Vastus',
    gamesPlayedDelta: 1,
    goalsDelta: 0,
    assistsDelta: 0,
    appliedAt: '2024-12-02T00:00:00Z',
  };

  const openEditForm = async () => {
    await waitFor(() => expect(screen.getByText('External Games')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('External Games'));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Actions'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Edit'));
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { getAdjustmentsForPlayer } = require('@/utils/playerAdjustments');
    getAdjustmentsForPlayer.mockResolvedValue([existing]);
  });

  it('opens showing the team the game is already recorded against', async () => {
    render(<PlayerStatsView {...baseProps} savedGames={{}} teams={[myTeam]} />);
    await openEditForm();
    expect((screen.getByTestId('edit-team-select') as HTMLSelectElement).value).toBe('teamA');
  });
});

/**
 * Saying which team an external game was for.
 *
 * @critical - this is the only thing that separates "my team played and I
 * could not track it" from "he guested for another team". Without it the app
 * has to guess, and any guess is wrong for one of those.
 */
describe('PlayerStatsView - which team was this external game for', () => {
  const myTeam = { id: 'teamA', name: 'FC Oma', boundSeasonId: 'season-1' } as never;

  const openAddForm = async () => {
    await waitFor(() => expect(screen.getByText('External Games')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('External Games'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-external-game'));
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { getAdjustmentsForPlayer } = require('@/utils/playerAdjustments');
    getAdjustmentsForPlayer.mockResolvedValue([]);
  });

  it('defaults to another team, because that is the common case', async () => {
    render(<PlayerStatsView {...baseProps} savedGames={{}} teams={[myTeam]} />);
    await openAddForm();
    expect((screen.getByTestId('adj-team-select') as HTMLSelectElement).value).toBe('');
  });

  it('offers the coach own teams alongside it', async () => {
    render(<PlayerStatsView {...baseProps} savedGames={{}} teams={[myTeam]} />);
    await openAddForm();
    expect(screen.getByRole('option', { name: 'FC Oma' })).toBeInTheDocument();
  });

  it('saves the team so the game can count toward it', async () => {
    const { addPlayerAdjustment } = require('@/utils/playerAdjustments');
    addPlayerAdjustment.mockResolvedValue({ id: 'new', playerId: player.id, gamesPlayedDelta: 1, goalsDelta: 0, assistsDelta: 0, appliedAt: '2024-12-02T00:00:00Z' });
    render(<PlayerStatsView {...baseProps} savedGames={{}} teams={[myTeam]} />);
    await openAddForm();

    fireEvent.change(screen.getByTestId('adj-team-select'), { target: { value: 'teamA' } });
    fireEvent.change(screen.getByPlaceholderText('Opponent name'), { target: { value: 'Vastus' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-external-game'));
    });

    expect(addPlayerAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'teamA' }),
      undefined,
    );
  });

  it('carries the team own competition across, the way new game setup does', async () => {
    render(<PlayerStatsView {...baseProps} savedGames={{}} teams={[myTeam]} seasons={[{ id: 'season-1', name: 'Aluesarja' } as never]} />);
    await openAddForm();
    fireEvent.change(screen.getByTestId('adj-team-select'), { target: { value: 'teamA' } });
    // The team is bound to a season, so the season comes with it.
    await waitFor(() =>
      expect((screen.getByTestId('adj-season-select') as HTMLSelectElement).value).toBe('season-1'),
    );
  });

  /**
   * @critical - leaving the team's name in the box under "another team"
   * describes a game that did not happen, and the coach has to remember to
   * clear it.
   */
  it('undoes what the team filled in when you change your mind back', async () => {
    render(<PlayerStatsView {...baseProps} savedGames={{}} teams={[myTeam]} seasons={[{ id: 'season-1', name: 'Aluesarja' } as never]} />);
    await openAddForm();

    fireEvent.change(screen.getByTestId('adj-team-select'), { target: { value: 'teamA' } });
    await waitFor(() =>
      expect((screen.getByPlaceholderText('External team') as HTMLInputElement).value).toBe('FC Oma'),
    );

    fireEvent.change(screen.getByTestId('adj-team-select'), { target: { value: '' } });

    expect((screen.getByPlaceholderText('External team') as HTMLInputElement).value).toBe('');
    expect(screen.queryByTestId('adj-season-select')).not.toBeInTheDocument();
  });

  it('sends no team when the game was for somebody else', async () => {
    const { addPlayerAdjustment } = require('@/utils/playerAdjustments');
    addPlayerAdjustment.mockResolvedValue({ id: 'new', playerId: player.id, gamesPlayedDelta: 1, goalsDelta: 0, assistsDelta: 0, appliedAt: '2024-12-02T00:00:00Z' });
    render(<PlayerStatsView {...baseProps} savedGames={{}} teams={[myTeam]} />);
    await openAddForm();

    fireEvent.change(screen.getByPlaceholderText('External team'), { target: { value: 'Alue-joukkue' } });
    fireEvent.change(screen.getByPlaceholderText('Opponent name'), { target: { value: 'Vastus' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-external-game'));
    });

    expect(addPlayerAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: undefined }),
      undefined,
    );
  });
});

/**
 * @critical - the wiring, not the rule.
 *
 * Two of the four review rounds on this fix were the same shape: the rule was
 * right and the component was not handed what it needed to apply it. Pure and
 * hook-level tests could not see either. These render the component.
 */
describe('PlayerStatsView - external games respect the filters on screen', () => {
  const teamGame = createGame({
    teamId: 'teamA',
    gameDate: '2024-12-01',
    selectedPlayerIds: [player.id],
  } as Partial<AppState>);

  const external = (over: Record<string, unknown> = {}) => ({
    id: `adj-${Math.random()}`,
    playerId: player.id,
    gamesPlayedDelta: 1,
    goalsDelta: 0,
    assistsDelta: 0,
    appliedAt: '2024-12-02T00:00:00Z',
    ...over,
  });

  const setAdjustments = (list: unknown[]) => {
    const { getAdjustmentsForPlayer } = require('@/utils/playerAdjustments');
    getAdjustmentsForPlayer.mockResolvedValue(list);
  };

  const gamesPlayedShown = async (): Promise<string> => {
    const label = await screen.findByText('Games Played');
    return label.previousElementSibling?.textContent ?? '';
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('counts an external game recorded against the selected team', async () => {
    setAdjustments([external({ teamId: 'teamA' })]);
    render(<PlayerStatsView {...baseProps} savedGames={{ g1: teamGame }} teamId="teamA" />);
    await waitFor(async () => expect(await gamesPlayedShown()).toBe('2'));
  });

  it('leaves out one played for another team', async () => {
    setAdjustments([external({ teamId: 'teamB' })]);
    render(<PlayerStatsView {...baseProps} savedGames={{ g1: teamGame }} teamId="teamA" />);
    await waitFor(async () => expect(await gamesPlayedShown()).toBe('1'));
  });

  /** The gap the review found: the table dropped these, this view kept them. */
  it('leaves out every external game once a sport is chosen', async () => {
    setAdjustments([external({ teamId: 'teamA' })]);
    render(
      <PlayerStatsView
        {...baseProps}
        savedGames={{ g1: teamGame }}
        teamId="teamA"
        selectedGameTypeFilter="soccer"
      />,
    );
    // The team game itself is soccer and still counts; the external one cannot
    // be shown to be soccer, so it does not.
    await waitFor(async () => expect(await gamesPlayedShown()).toBe('1'));
  });

  /**
   * @critical - the list is captioned "added to totals". Once a filter starts
   * excluding some of them that caption is a lie, and a list disagreeing with
   * its own numbers is the exact fault this change exists to fix. Every game
   * stays visible and editable; the uncounted ones say so.
   */
  it('marks the external games a filter has excluded, rather than hiding or miscounting them', async () => {
    setAdjustments([external({ teamId: 'teamA' }), external({ teamId: 'teamB' })]);
    render(<PlayerStatsView {...baseProps} savedGames={{ g1: teamGame }} teamId="teamA" />);

    await waitFor(() => expect(screen.getByText('External Games')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('External Games'));
    });

    // Both are still listed, so neither looks lost and both stay editable.
    await waitFor(() => {
      expect(screen.getAllByTestId('external-game-counted')).toHaveLength(1);
      expect(screen.getAllByTestId('external-game-uncounted')).toHaveLength(1);
    });
    // ...and the total counts only the one that belongs, plus the team game.
    expect(await gamesPlayedShown()).toBe('2');
  });

  it('under Legacy Games, counts only what names no team', async () => {
    setAdjustments([external({ teamId: 'teamA' }), external({})]);
    const legacyGame = createGame({
      gameDate: '2024-12-01',
      selectedPlayerIds: [player.id],
    } as Partial<AppState>);
    render(
      <PlayerStatsView {...baseProps} savedGames={{ g1: legacyGame }} teamId="legacy" />,
    );
    await waitFor(async () => expect(await gamesPlayedShown()).toBe('2'));
  });
});
