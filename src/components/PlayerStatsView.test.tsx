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
});
