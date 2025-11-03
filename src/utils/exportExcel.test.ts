/**
 * Tests for Excel export utility functions
 *
 * @critical - Validates Excel workbook generation and data export
 * @edge-case - Tests error handling, isPlayed filtering, multi-sheet structure
 * @integration - Tests complete export workflows for games, aggregates, and players
 */

import * as XLSX from 'xlsx';
import {
  exportCurrentGameExcel,
  exportAggregateExcel,
  exportPlayerExcel,
} from './exportExcel';
import type { AppState, Player, Season, Tournament, PlayerStatRow, SavedGamesCollection } from '@/types';

// Mock dependencies
jest.mock('./logger');

// Type definitions for mock data
interface MockWorkbook {
  Sheets: Record<string, unknown>;
  SheetNames: string[];
}

interface PlayerStatsRow {
  Player: string;
  'Jersey #': string;
  Nickname?: string;
  Goals: number;
  Assists: number;
  Points: number;
  'Fair Play': string;
  'Is Goalie': string;
  Notes?: string;
}

interface GameInfoRow {
  Field: string;
  Value: string | number;
}

interface EventRow {
  Time: string;
  Type: string;
  Scorer: string;
  Assister: string;
}

interface PerformanceRow {
  Metric: string;
  Value: number | string;
}

interface GameHistoryRow {
  'Game ID': string;
  Date: string;
  Opponent: string;
  'Home/Away': string;
  Result: string;
  'Our Score': number;
  'Their Score': number;
  Goals: number;
  Assists: number;
  Points: number;
  'Fair Play': string;
  'Minutes Played': number | string;
  'Overall Rating': number | string;
  Season: string;
  Tournament: string;
}

// Mock xlsx library
jest.mock('xlsx', () => ({
  utils: {
    book_new: jest.fn(() => ({ Sheets: {}, SheetNames: [] })),
    json_to_sheet: jest.fn((data: unknown) => ({ data, '!ref': 'A1:Z100' })),
    book_append_sheet: jest.fn((wb: MockWorkbook, ws: unknown, name: string) => {
      wb.SheetNames.push(name);
      wb.Sheets[name] = ws;
    }),
  },
  write: jest.fn(() => new ArrayBuffer(100)),
}));

// Mock DOM APIs
const mockCreateElement = jest.fn();
const mockAppendChild = jest.fn();
const mockRemoveChild = jest.fn();
const mockClick = jest.fn();
const mockCreateObjectURL = jest.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = jest.fn();

describe('Excel Export Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup DOM mocks
    global.document.createElement = mockCreateElement.mockReturnValue({
      click: mockClick,
      download: '',
      href: '',
    }) as typeof document.createElement;
    global.document.body.appendChild = mockAppendChild as typeof document.body.appendChild;
    global.document.body.removeChild = mockRemoveChild as typeof document.body.removeChild;
    global.URL.createObjectURL = mockCreateObjectURL as typeof URL.createObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL as typeof URL.revokeObjectURL;
    global.Blob = jest.fn() as unknown as typeof Blob;
  });

  describe('exportCurrentGameExcel', () => {
    const mockGameId = 'game_123';
    const mockPlayers: Player[] = [
      {
        id: 'player1',
        name: 'John Doe',
        jerseyNumber: '10',
        nickname: 'Johnny',
        isGoalie: false,
        receivedFairPlayCard: true,
        notes: 'Great player',
      },
      {
        id: 'player2',
        name: 'Jane Smith',
        jerseyNumber: '7',
        isGoalie: true,
        receivedFairPlayCard: false,
      },
    ];

    const mockGame: AppState = {
      playersOnField: [],
      opponents: [],
      drawings: [],
      availablePlayers: mockPlayers,
      showPlayerNames: true,
      teamName: 'Test Team',
      gameEvents: [
        { id: 'evt1', type: 'goal', time: 300, scorerId: 'player1', assisterId: 'player2' },
        { id: 'evt2', type: 'goal', time: 600, scorerId: 'player1' },
        { id: 'evt3', type: 'opponentGoal', time: 900 },
      ],
      opponentName: 'Opponent Team',
      gameDate: '2025-01-15',
      homeScore: 2,
      awayScore: 1,
      gameNotes: 'Good game',
      homeOrAway: 'home',
      numberOfPeriods: 2,
      periodDurationMinutes: 20,
      currentPeriod: 2,
      gameStatus: 'gameEnd',
      isPlayed: true,
      selectedPlayerIds: ['player1', 'player2'],
      seasonId: 'season1',
      tournamentId: 'tournament1',
      tacticalDiscs: [],
      tacticalDrawings: [],
      tacticalBallPosition: null,
      completedIntervalDurations: [
        { period: 1, duration: 1200, timestamp: Date.now() },
        { period: 2, duration: 1200, timestamp: Date.now() },
      ],
    };

    const mockSeasons: Season[] = [
      { id: 'season1', name: 'Spring 2025' },
    ];

    const mockTournaments: Tournament[] = [
      { id: 'tournament1', name: 'Championship Cup' },
    ];

    /**
     * Tests basic Excel export functionality
     * @critical - Core export workflow
     */
    it('should generate workbook with multiple sheets', () => {
      exportCurrentGameExcel(mockGameId, mockGame, mockPlayers, mockSeasons, mockTournaments);

      const mockWorkbook = (XLSX.utils.book_new as jest.Mock).mock.results[0].value;

      expect(XLSX.utils.book_new).toHaveBeenCalled();
      expect(mockWorkbook.SheetNames).toContain('Player Stats');
      expect(mockWorkbook.SheetNames).toContain('Events');
      expect(mockWorkbook.SheetNames).toContain('Game Info');
      expect(mockWorkbook.SheetNames).toContain('Substitution Intervals');
    });

    /**
     * Tests player stats sheet content
     * @critical - Validates data accuracy
     */
    it('should export correct player statistics', () => {
      exportCurrentGameExcel(mockGameId, mockGame, mockPlayers, mockSeasons, mockTournaments);

      const jsonToSheetCalls = (XLSX.utils.json_to_sheet as jest.Mock).mock.calls;
      const playerStatsCall = jsonToSheetCalls.find(call =>
        call[0][0]?.Player === 'John Doe'
      );

      expect(playerStatsCall).toBeDefined();
      const playerStats = playerStatsCall[0] as PlayerStatsRow[];

      // John Doe should have 2 goals, 0 assists, 2 points
      const johnDoe = playerStats.find((p) => p.Player === 'John Doe');
      expect(johnDoe).toMatchObject({
        Player: 'John Doe',
        'Jersey #': '10',
        Nickname: 'Johnny',
        Goals: 2,
        Assists: 0,
        Points: 2,
        'Fair Play': 'Yes',
        'Is Goalie': 'No',
      });

      // Jane Smith should have 0 goals, 1 assist, 1 point
      const janeSmith = playerStats.find((p) => p.Player === 'Jane Smith');
      expect(janeSmith).toMatchObject({
        Player: 'Jane Smith',
        'Jersey #': '7',
        Goals: 0,
        Assists: 1,
        Points: 1,
        'Fair Play': 'No',
        'Is Goalie': 'Yes',
      });
    });

    /**
     * Tests events sheet with proper sorting
     * @critical - Validates timeline accuracy
     */
    it('should export events in chronological order', () => {
      exportCurrentGameExcel(mockGameId, mockGame, mockPlayers, mockSeasons, mockTournaments);

      const jsonToSheetCalls = (XLSX.utils.json_to_sheet as jest.Mock).mock.calls;
      const eventsCall = jsonToSheetCalls.find(call =>
        call[0][0]?.Type === 'Goal' || call[0][0]?.Type === 'Opponent Goal'
      );

      expect(eventsCall).toBeDefined();
      const events = eventsCall[0] as EventRow[];

      expect(events).toHaveLength(3);
      expect(events[0].Time).toBe('05:00'); // 300 seconds
      expect(events[1].Time).toBe('10:00'); // 600 seconds
      expect(events[2].Time).toBe('15:00'); // 900 seconds
    });

    /**
     * Tests game info sheet completeness
     * @integration - Validates metadata
     */
    it('should export complete game information', () => {
      exportCurrentGameExcel(mockGameId, mockGame, mockPlayers, mockSeasons, mockTournaments);

      const jsonToSheetCalls = (XLSX.utils.json_to_sheet as jest.Mock).mock.calls;
      const gameInfoCall = jsonToSheetCalls.find(call =>
        call[0].some((item: GameInfoRow) => item.Field === 'Game ID')
      );

      expect(gameInfoCall).toBeDefined();
      const gameInfo = gameInfoCall[0] as GameInfoRow[];

      const findField = (field: string) => gameInfo.find((item) => item.Field === field);

      expect(findField('Game ID')?.Value).toBe(mockGameId);
      expect(findField('Game Date')?.Value).toBe('2025-01-15');
      expect(findField('Home Team')?.Value).toBe('Test Team');
      expect(findField('Away Team')?.Value).toBe('Opponent Team');
      expect(findField('Home Score')?.Value).toBe(2);
      expect(findField('Away Score')?.Value).toBe(1);
      expect(findField('Result')?.Value).toBe('Win');
      expect(findField('Season')?.Value).toBe('Spring 2025');
      expect(findField('Tournament')?.Value).toBe('Championship Cup');
    });

    /**
     * Tests file download trigger
     * @integration - Validates download mechanism
     */
    it('should trigger file download', () => {
      jest.useFakeTimers();

      exportCurrentGameExcel(mockGameId, mockGame, mockPlayers, mockSeasons, mockTournaments);

      expect(XLSX.write).toHaveBeenCalled();
      expect(global.Blob).toHaveBeenCalled();
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockAppendChild).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRemoveChild).toHaveBeenCalled();

      // URL.revokeObjectURL is now delayed by 100ms to prevent memory leaks
      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
      jest.advanceTimersByTime(100);
      expect(mockRevokeObjectURL).toHaveBeenCalled();

      jest.useRealTimers();
    });

    /**
     * Tests filename format
     * @edge-case - Validates naming convention
     */
    it('should use correct filename format', () => {
      exportCurrentGameExcel(mockGameId, mockGame, mockPlayers, mockSeasons, mockTournaments);

      const anchorElement = mockCreateElement.mock.results[0].value;
      expect(anchorElement.download).toMatch(/^MatchOps_Game_game_123_\d{8}_\d{6}\.xlsx$/);
    });

    /**
     * Tests error handling with proper context preservation
     * @critical - Validates error recovery
     */
    it('should preserve error context when export fails', () => {
      const mockError = new Error('XLSX write failed');
      (XLSX.write as jest.Mock).mockImplementationOnce(() => {
        throw mockError;
      });

      expect(() => {
        exportCurrentGameExcel(mockGameId, mockGame, mockPlayers, mockSeasons, mockTournaments);
      }).toThrow('Failed to export game to Excel. Please try again.');

      // Verify error context is preserved
      try {
        exportCurrentGameExcel(mockGameId, mockGame, mockPlayers, mockSeasons, mockTournaments);
      } catch (error) {
        expect((error as Error & { cause?: Error }).cause).toBe(mockError);
      }
    });

    /**
     * Tests handling games without assessments
     * @edge-case - Optional data handling
     */
    it('should handle games without assessments gracefully', () => {
      const gameWithoutAssessments = { ...mockGame, assessments: undefined };

      expect(() => {
        exportCurrentGameExcel(mockGameId, gameWithoutAssessments, mockPlayers, mockSeasons, mockTournaments);
      }).not.toThrow();

      const mockWorkbook = (XLSX.utils.book_new as jest.Mock).mock.results[0].value;
      expect(mockWorkbook.SheetNames).not.toContain('Assessments');
    });
  });

  describe('exportAggregateExcel', () => {
    const mockGames: SavedGamesCollection = {
      game1: {
        playersOnField: [],
        opponents: [],
        drawings: [],
        availablePlayers: [],
        showPlayerNames: true,
        teamName: 'Test Team',
        gameEvents: [
          { id: 'evt1', type: 'goal', time: 300, scorerId: 'player1' },
        ],
        opponentName: 'Team A',
        gameDate: '2025-01-15',
        homeScore: 2,
        awayScore: 1,
        gameNotes: '',
        homeOrAway: 'home',
        numberOfPeriods: 2,
        periodDurationMinutes: 20,
        currentPeriod: 2,
        gameStatus: 'gameEnd',
        isPlayed: true,
        selectedPlayerIds: ['player1'],
        seasonId: 'season1',
        tournamentId: '',
        tacticalDiscs: [],
        tacticalDrawings: [],
        tacticalBallPosition: null,
      },
      game2: {
        playersOnField: [],
        opponents: [],
        drawings: [],
        availablePlayers: [],
        showPlayerNames: true,
        teamName: 'Test Team',
        gameEvents: [],
        opponentName: 'Team B',
        gameDate: '2025-01-20',
        homeScore: 0,
        awayScore: 0,
        gameNotes: '',
        homeOrAway: 'home',
        numberOfPeriods: 2,
        periodDurationMinutes: 20,
        currentPeriod: 1,
        gameStatus: 'notStarted',
        isPlayed: false, // NOT YET PLAYED
        selectedPlayerIds: [],
        seasonId: 'season1',
        tournamentId: '',
        tacticalDiscs: [],
        tacticalDrawings: [],
        tacticalBallPosition: null,
      },
    };

    const mockAggregateStats: PlayerStatRow[] = [
      {
        id: 'player1',
        name: 'John Doe',
        jerseyNumber: '10',
        goals: 5,
        assists: 3,
        totalScore: 8,
        gamesPlayed: 3,
        avgPoints: 2.67,
        fpAwards: 1,
        isGoalie: false,
      },
    ];

    /**
     * Tests calculateRecord function excludes unplayed games
     * @critical - Validates isPlayed filtering logic
     */
    it('should exclude unplayed games from win/loss record', () => {
      exportAggregateExcel(mockGames, mockAggregateStats, [], [], []);

      const jsonToSheetCalls = (XLSX.utils.json_to_sheet as jest.Mock).mock.calls;
      const performanceCall = jsonToSheetCalls.find(call =>
        call[0].some((item: PerformanceRow) => item.Metric === 'Games Played')
      );

      expect(performanceCall).toBeDefined();
      const performance = performanceCall[0] as PerformanceRow[];

      const gamesPlayed = performance.find((item) => item.Metric === 'Games Played');
      const wins = performance.find((item) => item.Metric === 'Wins');

      // Should only count game1 (isPlayed: true), not game2 (isPlayed: false)
      expect(gamesPlayed?.Value).toBe(1);
      expect(wins?.Value).toBe(1); // game1 is a win (2-1)
    });

    /**
     * Tests multiple sheets generation
     * @critical - Validates complete export structure
     */
    it('should generate all aggregate sheets', () => {
      exportAggregateExcel(mockGames, mockAggregateStats, [], [], []);

      const mockWorkbook = (XLSX.utils.book_new as jest.Mock).mock.results[0].value;

      expect(mockWorkbook.SheetNames).toContain('Player Stats Summary');
      expect(mockWorkbook.SheetNames).toContain('Team Performance');
      expect(mockWorkbook.SheetNames).toContain('Game Details');
    });

    /**
     * Tests context-based filename generation
     * @edge-case - Validates filename variations
     */
    it('should generate season-specific filename when contextType is season', () => {
      const seasons: Season[] = [{ id: 'season1', name: 'Spring 2025' }];

      exportAggregateExcel(
        mockGames,
        mockAggregateStats,
        seasons,
        [],
        [],
        'season',
        'season1'
      );

      const anchorElement = mockCreateElement.mock.results[0].value;
      expect(anchorElement.download).toMatch(/^MatchOps_Season_Spring 2025_\d{8}_\d{6}\.xlsx$/);
    });

    /**
     * Tests error handling
     * @critical - Validates error recovery
     */
    it('should preserve error context when aggregate export fails', () => {
      const mockError = new Error('Export failed');
      (XLSX.utils.book_new as jest.Mock).mockImplementationOnce(() => {
        throw mockError;
      });

      try {
        exportAggregateExcel(mockGames, mockAggregateStats, [], [], []);
      } catch (error) {
        expect((error as Error).message).toContain('Failed to export stats to Excel');
        expect((error as Error & { cause?: Error }).cause).toBe(mockError);
      }
    });
  });

  describe('exportPlayerExcel', () => {
    const mockPlayerId = 'player1';
    const mockPlayerData: PlayerStatRow = {
      id: 'player1',
      name: 'John Doe',
      jerseyNumber: '10',
      nickname: 'Johnny',
      goals: 5,
      assists: 3,
      totalScore: 8,
      gamesPlayed: 2,
      avgPoints: 4,
      fpAwards: 1,
      isGoalie: false,
      notes: 'Star player',
    };

    const mockGames: SavedGamesCollection = {
      game1: {
        playersOnField: [],
        opponents: [],
        drawings: [],
        availablePlayers: [
          {
            id: 'player1',
            name: 'John Doe',
            jerseyNumber: '10',
            receivedFairPlayCard: true, // Fair play in THIS game
          },
        ],
        showPlayerNames: true,
        teamName: 'Test Team',
        gameEvents: [
          { id: 'evt1', type: 'goal', time: 300, scorerId: 'player1' },
          { id: 'evt2', type: 'goal', time: 600, scorerId: 'player1', assisterId: 'player2' },
        ],
        opponentName: 'Opponent A',
        gameDate: '2025-01-15',
        homeScore: 2,
        awayScore: 1,
        gameNotes: '',
        homeOrAway: 'home',
        numberOfPeriods: 2,
        periodDurationMinutes: 20,
        currentPeriod: 2,
        gameStatus: 'gameEnd',
        isPlayed: true,
        selectedPlayerIds: ['player1'],
        seasonId: 'season1',
        tournamentId: '',
        tacticalDiscs: [],
        tacticalDrawings: [],
        tacticalBallPosition: null,
      },
      game2: {
        playersOnField: [],
        opponents: [],
        drawings: [],
        availablePlayers: [
          {
            id: 'player1',
            name: 'John Doe',
            jerseyNumber: '10',
            receivedFairPlayCard: false, // NO fair play in THIS game
          },
        ],
        showPlayerNames: true,
        teamName: 'Test Team',
        gameEvents: [
          { id: 'evt3', type: 'goal', time: 300, scorerId: 'player1' },
        ],
        opponentName: 'Opponent B',
        gameDate: '2025-01-20',
        homeScore: 1,
        awayScore: 0,
        gameNotes: '',
        homeOrAway: 'away',
        numberOfPeriods: 2,
        periodDurationMinutes: 20,
        currentPeriod: 2,
        gameStatus: 'gameEnd',
        isPlayed: true,
        selectedPlayerIds: ['player1'],
        seasonId: 'season1',
        tournamentId: '',
        tacticalDiscs: [],
        tacticalDrawings: [],
        tacticalBallPosition: null,
      },
    };

    /**
     * Tests per-game fair play data accuracy
     * @critical - Validates fair play uses game roster snapshot
     */
    it('should use per-game fair play status from availablePlayers', () => {
      exportPlayerExcel(mockPlayerId, mockPlayerData, mockGames, [], [], []);

      const jsonToSheetCalls = (XLSX.utils.json_to_sheet as jest.Mock).mock.calls;
      const gameHistoryCall = jsonToSheetCalls.find(call =>
        call[0].some((item: GameHistoryRow) => item['Game ID'] === 'game1')
      );

      expect(gameHistoryCall).toBeDefined();
      const gameHistory = gameHistoryCall[0] as GameHistoryRow[];

      const game1 = gameHistory.find((item) => item['Game ID'] === 'game1');
      const game2 = gameHistory.find((item) => item['Game ID'] === 'game2');

      // game1 should show "Yes" (receivedFairPlayCard: true in that game's roster)
      expect(game1?.['Fair Play']).toBe('Yes');

      // game2 should show "No" (receivedFairPlayCard: false in that game's roster)
      expect(game2?.['Fair Play']).toBe('No');
    });

    /**
     * Tests player export filters to only include player's games
     * @critical - Validates data filtering
     */
    it('should only include games where player participated', () => {
      const gamesWithNonParticipation = {
        ...mockGames,
        game3: {
          ...mockGames.game1,
          selectedPlayerIds: ['player2'], // player1 not selected
          gameDate: '2025-01-25',
        },
      };

      exportPlayerExcel(mockPlayerId, mockPlayerData, gamesWithNonParticipation, [], [], []);

      const jsonToSheetCalls = (XLSX.utils.json_to_sheet as jest.Mock).mock.calls;
      const gameHistoryCall = jsonToSheetCalls.find(call =>
        call[0].some((item: GameHistoryRow) => item['Game ID'])
      );

      expect(gameHistoryCall).toBeDefined();
      const gameHistory = gameHistoryCall[0] as GameHistoryRow[];

      // Should only have game1 and game2, not game3
      expect(gameHistory).toHaveLength(2);
      expect(gameHistory.find((item) => item['Game ID'] === 'game3')).toBeUndefined();
    });

    /**
     * Tests player summary sheet
     * @critical - Validates player metadata
     */
    it('should export correct player summary', () => {
      exportPlayerExcel(mockPlayerId, mockPlayerData, mockGames, [], [], []);

      const jsonToSheetCalls = (XLSX.utils.json_to_sheet as jest.Mock).mock.calls;
      const summaryCall = jsonToSheetCalls.find(call =>
        call[0][0]?.['Player Name'] === 'John Doe'
      );

      expect(summaryCall).toBeDefined();
      const summary = summaryCall[0][0];

      expect(summary).toMatchObject({
        'Player Name': 'John Doe',
        'Jersey Number': '10',
        'Nickname': 'Johnny',
        'Total Games': 2,
        'Total Goals': 5,
        'Total Assists': 3,
        'Total Points': 8,
      });
    });

    /**
     * Tests player-specific filename with sanitization
     * @edge-case - Validates unicode normalization and character sanitization
     */
    it('should sanitize player name in filename', () => {
      const playerWithSpecialChars: PlayerStatRow = {
        ...mockPlayerData,
        name: 'Mäkinen Öberg-Åström',
      };

      exportPlayerExcel(mockPlayerId, playerWithSpecialChars, mockGames, [], [], []);

      const anchorElement = mockCreateElement.mock.results[0].value;
      // Unicode characters normalized: ä->a, ö->o, å->a
      // Hyphen preserved, spaces preserved
      expect(anchorElement.download).toMatch(/^MatchOps_Player_Makinen Oberg-Astrom_\d{8}_\d{6}\.xlsx$/);
    });

    /**
     * Tests filename sanitization with special characters
     * @edge-case - Validates invalid character removal
     */
    it('should sanitize special characters in filename', () => {
      const playerWithInvalidChars: PlayerStatRow = {
        ...mockPlayerData,
        name: 'John O\'Doe/Jr.',
      };

      exportPlayerExcel(mockPlayerId, playerWithInvalidChars, mockGames, [], [], []);

      const anchorElement = mockCreateElement.mock.results[0].value;
      // Apostrophe and slash replaced with _, period and space preserved
      expect(anchorElement.download).toMatch(/^MatchOps_Player_John O_Doe_Jr\._\d{8}_\d{6}\.xlsx$/);
    });

    /**
     * Tests error handling
     * @critical - Validates error recovery
     */
    it('should preserve error context when player export fails', () => {
      const mockError = new Error('Player export failed');
      (XLSX.utils.book_new as jest.Mock).mockImplementationOnce(() => {
        throw mockError;
      });

      try {
        exportPlayerExcel(mockPlayerId, mockPlayerData, mockGames, [], [], []);
      } catch (error) {
        expect((error as Error).message).toContain('Failed to export player stats to Excel');
        expect((error as Error & { cause?: Error }).cause).toBe(mockError);
      }
    });
  });

  describe('DOM manipulation error handling', () => {
    /**
     * Tests blob creation failure
     * @edge-case - Validates error handling for Blob API
     */
    it('should handle Blob creation failure', () => {
      (global.Blob as unknown as jest.Mock) = jest.fn(() => {
        throw new Error('Blob creation failed');
      });

      const mockGame: AppState = {
        playersOnField: [],
        opponents: [],
        drawings: [],
        availablePlayers: [],
        showPlayerNames: true,
        teamName: 'Test',
        gameEvents: [],
        opponentName: 'Opponent',
        gameDate: '2025-01-15',
        homeScore: 0,
        awayScore: 0,
        gameNotes: '',
        homeOrAway: 'home',
        numberOfPeriods: 2,
        periodDurationMinutes: 20,
        currentPeriod: 1,
        gameStatus: 'notStarted',
        selectedPlayerIds: [],
        seasonId: '',
        tournamentId: '',
        tacticalDiscs: [],
        tacticalDrawings: [],
        tacticalBallPosition: null,
      };

      expect(() => {
        exportCurrentGameExcel('game1', mockGame, [], [], []);
      }).toThrow('Failed to export game to Excel');
    });

    /**
     * Tests URL creation failure
     * @edge-case - Validates error handling for URL API
     */
    it('should handle URL.createObjectURL failure', () => {
      mockCreateObjectURL.mockImplementationOnce(() => {
        throw new Error('URL creation failed');
      });

      const mockGame: AppState = {
        playersOnField: [],
        opponents: [],
        drawings: [],
        availablePlayers: [],
        showPlayerNames: true,
        teamName: 'Test',
        gameEvents: [],
        opponentName: 'Opponent',
        gameDate: '2025-01-15',
        homeScore: 0,
        awayScore: 0,
        gameNotes: '',
        homeOrAway: 'home',
        numberOfPeriods: 2,
        periodDurationMinutes: 20,
        currentPeriod: 1,
        gameStatus: 'notStarted',
        selectedPlayerIds: [],
        seasonId: '',
        tournamentId: '',
        tacticalDiscs: [],
        tacticalDrawings: [],
        tacticalBallPosition: null,
      };

      expect(() => {
        exportCurrentGameExcel('game1', mockGame, [], [], []);
      }).toThrow('Failed to export game to Excel');
    });
  });
});
