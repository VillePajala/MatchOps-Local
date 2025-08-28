import { createPlayerMapping, processImportedGame } from './gameImportHelper';
import { AppState, Player } from '@/types';

// Mock logger
jest.mock('./logger', () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('gameImportHelper', () => {
  const mockCurrentRoster: Player[] = [
    { id: 'player1', name: 'John Smith', isGoalie: false, jerseyNumber: '10', notes: '' },
    { id: 'player2', name: 'Jane Doe', isGoalie: true, jerseyNumber: '1', notes: '' },
    { id: 'player3', name: 'Bob Wilson', isGoalie: false, jerseyNumber: '7', notes: '' }
  ];

  const mockImportedGame: AppState = {
    playersOnField: [
      { id: 'imported_player1', name: 'John Smith', isGoalie: false, jerseyNumber: '10', notes: '' },
      { id: 'imported_player2', name: 'Jane Doe', isGoalie: true, jerseyNumber: '1', notes: '' }
    ],
    availablePlayers: [
      { id: 'imported_player3', name: 'Bob Wilson', isGoalie: false, jerseyNumber: '7', notes: '' },
      { id: 'imported_player4', name: 'Unknown Player', isGoalie: false, jerseyNumber: '99', notes: '' }
    ],
    selectedPlayerIds: ['imported_player1', 'imported_player2', 'imported_player3'],
    gameEvents: [
      { id: 'event1', type: 'goal', time: 1500, scorerId: 'imported_player1', assisterId: 'imported_player2', entityId: undefined },
      { id: 'event2', type: 'goal', time: 3000, scorerId: 'imported_player3', assisterId: undefined, entityId: undefined }
    ],
    drawings: [],
    opponents: [],
    showPlayerNames: true,
    teamName: 'Test Team',
    opponentName: 'Opponent Team',
    gameDate: '2023-05-15',
    homeScore: 2,
    awayScore: 1,
    gameNotes: '',
    homeOrAway: 'home',
    numberOfPeriods: 2,
    periodDurationMinutes: 45,
    currentPeriod: 2,
    gameStatus: 'gameEnd',
    isPlayed: true,
    assessments: {
      'imported_player1': { overall: 8, sliders: { intensity: 8, courage: 7, duels: 8, technique: 7, creativity: 6, decisions: 7, awareness: 8, teamwork: 9, fair_play: 8, impact: 7 }, notes: 'Great game', minutesPlayed: 90, createdAt: Date.now(), createdBy: 'test' }
    },
    seasonId: 'season1',
    tournamentId: 'tournament1',
    demandFactor: 1.0,
    gameLocation: 'Home Stadium',
    gameTime: '14:00',
    subIntervalMinutes: 15,
    completedIntervalDurations: [],
    lastSubConfirmationTimeSeconds: 0,
    tacticalDiscs: [],
    tacticalDrawings: [],
    tacticalBallPosition: null,
    teamId: 'team1'
  };

  describe('createPlayerMapping', () => {
    it('should create correct player mappings', () => {
      const mappings = createPlayerMapping(mockImportedGame, mockCurrentRoster);

      expect(mappings).toHaveLength(4);
      
      // Check exact name matches
      const johnMapping = mappings.find(m => m.importedPlayerName === 'John Smith');
      expect(johnMapping).toEqual({
        importedPlayerId: 'imported_player1',
        importedPlayerName: 'John Smith',
        currentPlayerId: 'player1',
        matchConfidence: 'name'
      });

      const janeMapping = mappings.find(m => m.importedPlayerName === 'Jane Doe');
      expect(janeMapping).toEqual({
        importedPlayerId: 'imported_player2',
        importedPlayerName: 'Jane Doe',
        currentPlayerId: 'player2',
        matchConfidence: 'name'
      });

      // Check no match
      const unknownMapping = mappings.find(m => m.importedPlayerName === 'Unknown Player');
      expect(unknownMapping).toEqual({
        importedPlayerId: 'imported_player4',
        importedPlayerName: 'Unknown Player',
        currentPlayerId: null,
        matchConfidence: 'none'
      });
    });
  });

  describe('processImportedGame', () => {
    it('should properly map players and update game data', () => {
      const processedGame = processImportedGame(mockImportedGame, mockCurrentRoster);

      // Should update selectedPlayerIds with current roster IDs
      expect(processedGame.selectedPlayerIds).toContain('player1'); // John Smith
      expect(processedGame.selectedPlayerIds).toContain('player2'); // Jane Doe  
      expect(processedGame.selectedPlayerIds).toContain('player3'); // Bob Wilson

      // Should update game events with current roster IDs
      const goalEvent = processedGame.gameEvents.find(e => e.scorerId === 'player1');
      expect(goalEvent).toBeDefined();
      expect(goalEvent?.assisterId).toBe('player2');

      const secondGoalEvent = processedGame.gameEvents.find(e => e.scorerId === 'player3');
      expect(secondGoalEvent).toBeDefined();

      // Should update assessments with current roster IDs
      expect(processedGame.assessments?.['player1']).toBeDefined();
      expect(processedGame.assessments?.['player1']?.notes).toBe('Great game');

      // Should ensure game is marked as played
      expect(processedGame.isPlayed).toBe(true);
    });

    it('should handle games without matching players', () => {
      const gameWithUnknownPlayers = {
        ...mockImportedGame,
        playersOnField: [
          { id: 'unknown1', name: 'Unknown Player 1', isGoalie: false, jerseyNumber: '88', notes: '' }
        ],
        availablePlayers: [
          { id: 'unknown2', name: 'Unknown Player 2', isGoalie: false, jerseyNumber: '89', notes: '' }
        ],
        selectedPlayerIds: ['unknown1', 'unknown2'],
        gameEvents: [
          { id: 'event1', type: 'goal', time: 1500, scorerId: 'unknown1', assisterId: 'unknown2', entityId: undefined }
        ]
      };

      const processedGame = processImportedGame(gameWithUnknownPlayers, mockCurrentRoster);

      // Should filter out unknown players from selectedPlayerIds
      expect(processedGame.selectedPlayerIds).toHaveLength(0);

      // Game events should retain original IDs since no mapping found
      expect(processedGame.gameEvents[0].scorerId).toBe('unknown1');
      expect(processedGame.gameEvents[0].assisterId).toBe('unknown2');
    });

    it('should mark unplayed games with gameEnd status as played', () => {
      const unplayedGame = {
        ...mockImportedGame,
        isPlayed: false,
        gameStatus: 'gameEnd' as const
      };

      const processedGame = processImportedGame(unplayedGame, mockCurrentRoster);
      expect(processedGame.isPlayed).toBe(true);
    });

    it('should not mark in-progress games as played', () => {
      const inProgressGame = {
        ...mockImportedGame,
        isPlayed: false,
        gameStatus: 'inProgress' as const
      };

      const processedGame = processImportedGame(inProgressGame, mockCurrentRoster);
      expect(processedGame.isPlayed).toBe(false);
    });
  });
});