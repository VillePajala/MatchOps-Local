import { calculatePlayerAssessmentAverages, calculateTeamAssessmentAverages, calculatePlayerDevelopment, getPlayerAssessmentTrends, getPlayerAssessmentNotes } from './assessmentStats';
import type { SavedGamesCollection, AppState, PlayerAssessment } from '@/types';

const baseGame: AppState = {
  playersOnField: [],
  opponents: [],
  drawings: [],
  availablePlayers: [],
  showPlayerNames: true,
  teamName: 'Team',
  gameEvents: [],
  opponentName: 'Opp',
  gameDate: '2025-01-01',
  homeScore: 0,
  awayScore: 0,
  gameNotes: '',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 10,
  currentPeriod: 1,
  gameStatus: 'notStarted',
  selectedPlayerIds: [],
  assessments: {},
  seasonId: '',
  tournamentId: '',
  gameLocation: '',
  gameTime: '',
  subIntervalMinutes: 5,
  completedIntervalDurations: [],
  lastSubConfirmationTimeSeconds: 0,
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: { relX: 0, relY: 0 },
};

const sampleAssessment = (val: number): PlayerAssessment => ({
  overall: val,
  sliders: {
    ball_control: val,
    passing: val,
    scanning: val,
    game_reading: val,
    decisions: val,
    courage: val,
    effort: val,
    enjoyment: val,
    teamwork: val,
    fair_play: val,
  },
  notes: '',
  minutesPlayed: 90,
  createdAt: 0,
  createdBy: 'me',
});

describe('assessmentStats', () => {
  it('returns null when no assessments exist for player', () => {
    const games: SavedGamesCollection = { g1: { ...baseGame } };
    expect(calculatePlayerAssessmentAverages('p1', games)).toBeNull();
  });

  it('calculates player averages across games', () => {
    const games: SavedGamesCollection = {
      g1: { ...baseGame, assessments: { p1: sampleAssessment(4) } },
      g2: { ...baseGame, assessments: { p1: sampleAssessment(2) } },
    };
    const result = calculatePlayerAssessmentAverages('p1', games);
    expect(result?.count).toBe(2);
    expect(result?.averages.effort).toBe(3);
    expect(result?.averages.ball_control).toBe(3);
    expect(result?.overall).toBe(3);
  });

  it('computes team averages across games', () => {
    const games: SavedGamesCollection = {
      g1: {
        ...baseGame,
        assessments: { p1: sampleAssessment(4), p2: sampleAssessment(2) },
      },
      g2: {
        ...baseGame,
        assessments: { p1: sampleAssessment(3) },
      },
    };
    const result = calculateTeamAssessmentAverages(games);
    // For g1: average per metric = (4 + 2)/2 = 3
    // For g2: average = 3
    // Overall average across games = (3 + 3)/2 = 3
    expect(result?.count).toBe(2);
    expect(result?.averages.effort).toBe(3);
    expect(result?.averages.fair_play).toBe(3);
    expect(result?.overall).toBe(3);
  });

  it('provides trend data', () => {
    const games: SavedGamesCollection = {
      g1: { ...baseGame, gameDate: '2024-01-01', assessments: { p1: sampleAssessment(4) } },
      g2: { ...baseGame, gameDate: '2024-02-01', assessments: { p1: sampleAssessment(2) } },
    };
    const trends = getPlayerAssessmentTrends('p1', games);
    expect(trends.effort.length).toBe(2);
    expect(trends.effort[0].value).toBe(4);
    expect(trends.effort[1].value).toBe(2);
  });

  it('collects notes', () => {
    const games: SavedGamesCollection = {
      g1: { ...baseGame, gameDate: '2024-01-01', assessments: { p1: { ...sampleAssessment(4), notes: 'good' } } },
      g2: { ...baseGame, gameDate: '2024-02-01', assessments: { p1: sampleAssessment(2) } },
    };
    const notes = getPlayerAssessmentNotes('p1', games);
    expect(notes[0].notes).toBe('good');
  });

  it('weights averages using demand factor when enabled', () => {
    const games: SavedGamesCollection = {
      g1: { ...baseGame, demandFactor: 1, assessments: { p1: sampleAssessment(4) } },
      g2: { ...baseGame, demandFactor: 0.5, assessments: { p1: sampleAssessment(2) } },
    };
    const result = calculatePlayerAssessmentAverages('p1', games, true);
    const divisor = 1 + 0.5;
    const expected = (4 * 1 + 2 * 0.5) / divisor;
    expect(result?.overall).toBeCloseTo(expected);
  });

  it('calculates finalScore for a single game', () => {
    const assessment: PlayerAssessment = {
      ...sampleAssessment(0),
      overall: 5,
      sliders: {
        ball_control: 4,
        passing: 6,
        scanning: 2,
        game_reading: 3,
        decisions: 5,
        courage: 4,
        effort: 5,
        enjoyment: 6,
        teamwork: 5,
        fair_play: 4,
      },
    };
    const games: SavedGamesCollection = { g1: { ...baseGame, assessments: { p1: assessment } } };
    const result = calculatePlayerAssessmentAverages('p1', games);
    expect(result?.finalScore).toBeCloseTo(4.4);
  });

  it('weights finalScore using demand factor', () => {
    const games: SavedGamesCollection = {
      g1: { ...baseGame, demandFactor: 2, assessments: { p1: sampleAssessment(4) } },
      g2: { ...baseGame, demandFactor: 1, assessments: { p1: sampleAssessment(6) } },
    };
    const result = calculatePlayerAssessmentAverages('p1', games, true);
    const divisor = 2 + 1;
    const expected = (4 * 2 + 6 * 1) / divisor;
    expect(result?.finalScore).toBeCloseTo(expected);
  });
});

describe('calculatePlayerDevelopment', () => {
  // Build a chronological set of games where the player is rated `val` each game.
  const seriesGames = (vals: number[]): SavedGamesCollection => {
    const games: SavedGamesCollection = {};
    vals.forEach((v, i) => {
      const day = String(i + 1).padStart(2, '0');
      games[`g${i}`] = { ...baseGame, gameDate: `2024-01-${day}`, assessments: { p1: sampleAssessment(v) } };
    });
    return games;
  };

  it('returns null when the player has no assessments', () => {
    expect(calculatePlayerDevelopment('p1', { g1: { ...baseGame } })).toBeNull();
  });

  it('detects a rising trend and recency-weights toward recent form', () => {
    const games = seriesGames([1, 1, 1, 1, 1, 1, 4, 4, 4]);
    const current = calculatePlayerDevelopment('p1', games, { recencyWeighted: true });
    const overall = calculatePlayerDevelopment('p1', games, { recencyWeighted: false });
    expect(current?.count).toBe(9);
    expect(current?.metrics.effort.direction).toBe('rising');
    // Plain lifetime average = (6*1 + 3*4)/9 = 2; recency-weighted leans higher.
    expect(overall?.metrics.effort.level).toBeCloseTo(2);
    expect(current!.metrics.effort.level).toBeGreaterThan(overall!.metrics.effort.level);
    // Baseline = mean of the first 3 games (all 1); current sits above it.
    expect(current?.metrics.effort.baseline).toBeCloseTo(1);
    expect(current!.metrics.effort.level).toBeGreaterThan(current!.metrics.effort.baseline);
    // Rising from a low base is NOT a strength (it is still a low current level).
    expect(current?.strengths).toHaveLength(0);
  });

  it('treats a genuinely high current level as a strength', () => {
    const dev = calculatePlayerDevelopment('p1', seriesGames([8, 8, 9, 9, 9]));
    expect(dev?.strengths.length).toBeGreaterThan(0);
    expect(dev?.focusAreas).toHaveLength(0);
  });

  it('flags a declining metric as a focus area (slipping)', () => {
    const games = seriesGames([5, 5, 5, 5, 2, 2, 2, 2]);
    const dev = calculatePlayerDevelopment('p1', games);
    expect(dev?.metrics.effort.direction).toBe('slipping');
    // Slipping metrics surface as focus areas (all metrics slip here, capped at 3).
    expect(dev?.focusAreas.length).toBeGreaterThan(0);
  });

  it('reports an insufficient trend with too few games', () => {
    const dev = calculatePlayerDevelopment('p1', seriesGames([3, 3, 3]));
    expect(dev?.metrics.effort.direction).toBe('insufficient');
  });
});
