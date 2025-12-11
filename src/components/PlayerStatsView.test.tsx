import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '../../tests/utils/test-utils';
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
