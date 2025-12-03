import { createPlayerMapping, processImportedGame, processImportedGames } from './gameImportHelper';
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
          { id: 'event1', type: 'goal' as const, time: 1500, scorerId: 'unknown1', assisterId: 'unknown2', entityId: undefined }
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

    /**
     * @critical - Tests fix for bug where ALL roster players were added to selectedPlayerIds
     * Bug: Previously, processImportedGame would add all mapped players to selectedPlayerIds,
     * not just the ones that were originally selected in the imported game.
     */
    it('should ONLY include originally selected players, not all roster players', () => {
      // Large roster with many players
      const largeRoster: Player[] = [
        { id: 'p1', name: 'Player One', isGoalie: false, jerseyNumber: '1', notes: '' },
        { id: 'p2', name: 'Player Two', isGoalie: false, jerseyNumber: '2', notes: '' },
        { id: 'p3', name: 'Player Three', isGoalie: false, jerseyNumber: '3', notes: '' },
        { id: 'p4', name: 'Player Four', isGoalie: false, jerseyNumber: '4', notes: '' },
        { id: 'p5', name: 'Player Five', isGoalie: false, jerseyNumber: '5', notes: '' },
        { id: 'p6', name: 'Player Six', isGoalie: false, jerseyNumber: '6', notes: '' },
        { id: 'p7', name: 'Player Seven', isGoalie: false, jerseyNumber: '7', notes: '' },
        { id: 'p8', name: 'Player Eight', isGoalie: false, jerseyNumber: '8', notes: '' },
        { id: 'p9', name: 'Player Nine', isGoalie: false, jerseyNumber: '9', notes: '' },
        { id: 'p10', name: 'Player Ten', isGoalie: true, jerseyNumber: '10', notes: '' },
      ];

      // Game where only 3 players were selected (not all 10)
      const gameWithLimitedSelection: AppState = {
        ...mockImportedGame,
        playersOnField: [
          { id: 'p1', name: 'Player One', isGoalie: false, jerseyNumber: '1', notes: '' },
          { id: 'p2', name: 'Player Two', isGoalie: false, jerseyNumber: '2', notes: '' },
        ],
        availablePlayers: [
          { id: 'p3', name: 'Player Three', isGoalie: false, jerseyNumber: '3', notes: '' },
          { id: 'p4', name: 'Player Four', isGoalie: false, jerseyNumber: '4', notes: '' },
          { id: 'p5', name: 'Player Five', isGoalie: false, jerseyNumber: '5', notes: '' },
          { id: 'p6', name: 'Player Six', isGoalie: false, jerseyNumber: '6', notes: '' },
          { id: 'p7', name: 'Player Seven', isGoalie: false, jerseyNumber: '7', notes: '' },
          { id: 'p8', name: 'Player Eight', isGoalie: false, jerseyNumber: '8', notes: '' },
          { id: 'p9', name: 'Player Nine', isGoalie: false, jerseyNumber: '9', notes: '' },
          { id: 'p10', name: 'Player Ten', isGoalie: true, jerseyNumber: '10', notes: '' },
        ],
        // Only 3 players were selected for this game
        selectedPlayerIds: ['p1', 'p2', 'p3'],
        gameEvents: [],
      };

      const processedGame = processImportedGame(gameWithLimitedSelection, largeRoster);

      // Should only have the 3 originally selected players
      expect(processedGame.selectedPlayerIds).toHaveLength(3);
      expect(processedGame.selectedPlayerIds).toContain('p1');
      expect(processedGame.selectedPlayerIds).toContain('p2');
      expect(processedGame.selectedPlayerIds).toContain('p3');

      // Should NOT include the other 7 players who were available but not selected
      expect(processedGame.selectedPlayerIds).not.toContain('p4');
      expect(processedGame.selectedPlayerIds).not.toContain('p5');
      expect(processedGame.selectedPlayerIds).not.toContain('p6');
      expect(processedGame.selectedPlayerIds).not.toContain('p7');
      expect(processedGame.selectedPlayerIds).not.toContain('p8');
      expect(processedGame.selectedPlayerIds).not.toContain('p9');
      expect(processedGame.selectedPlayerIds).not.toContain('p10');
    });

    it('should handle imported games with different player IDs but same names', () => {
      // Roster with known players
      const roster: Player[] = [
        { id: 'current-uuid-1', name: 'Alice', isGoalie: false, jerseyNumber: '1', notes: '' },
        { id: 'current-uuid-2', name: 'Bob', isGoalie: false, jerseyNumber: '2', notes: '' },
        { id: 'current-uuid-3', name: 'Charlie', isGoalie: false, jerseyNumber: '3', notes: '' },
      ];

      // Imported game has different UUIDs but same player names
      const importedGame: AppState = {
        ...mockImportedGame,
        playersOnField: [
          { id: 'old-uuid-1', name: 'Alice', isGoalie: false, jerseyNumber: '1', notes: '' },
        ],
        availablePlayers: [
          { id: 'old-uuid-2', name: 'Bob', isGoalie: false, jerseyNumber: '2', notes: '' },
          { id: 'old-uuid-3', name: 'Charlie', isGoalie: false, jerseyNumber: '3', notes: '' },
        ],
        selectedPlayerIds: ['old-uuid-1', 'old-uuid-2'], // Only Alice and Bob selected
        gameEvents: [
          { id: 'e1', type: 'goal', time: 100, scorerId: 'old-uuid-1', assisterId: 'old-uuid-2', entityId: undefined },
        ],
      };

      const processedGame = processImportedGame(importedGame, roster);

      // Selected players should be mapped to current roster IDs
      expect(processedGame.selectedPlayerIds).toHaveLength(2);
      expect(processedGame.selectedPlayerIds).toContain('current-uuid-1'); // Alice
      expect(processedGame.selectedPlayerIds).toContain('current-uuid-2'); // Bob
      expect(processedGame.selectedPlayerIds).not.toContain('current-uuid-3'); // Charlie was NOT selected

      // Game events should use current roster IDs
      expect(processedGame.gameEvents[0].scorerId).toBe('current-uuid-1');
      expect(processedGame.gameEvents[0].assisterId).toBe('current-uuid-2');
    });

    it('should preserve selectedPlayerIds count even with partial roster matches', () => {
      const partialRoster: Player[] = [
        { id: 'p1', name: 'Known Player', isGoalie: false, jerseyNumber: '1', notes: '' },
      ];

      const gameWithMixedPlayers: AppState = {
        ...mockImportedGame,
        playersOnField: [
          { id: 'p1', name: 'Known Player', isGoalie: false, jerseyNumber: '1', notes: '' },
        ],
        availablePlayers: [
          { id: 'unknown-1', name: 'Unknown A', isGoalie: false, jerseyNumber: '2', notes: '' },
          { id: 'unknown-2', name: 'Unknown B', isGoalie: false, jerseyNumber: '3', notes: '' },
        ],
        selectedPlayerIds: ['p1', 'unknown-1', 'unknown-2'], // 3 players selected
        gameEvents: [],
      };

      const processedGame = processImportedGame(gameWithMixedPlayers, partialRoster);

      // Only the known player should remain (unknown players filtered out)
      expect(processedGame.selectedPlayerIds).toHaveLength(1);
      expect(processedGame.selectedPlayerIds).toContain('p1');
    });

    it('should handle empty selectedPlayerIds', () => {
      const gameWithNoPlayers: AppState = {
        ...mockImportedGame,
        playersOnField: [],
        availablePlayers: mockCurrentRoster,
        selectedPlayerIds: [], // No players selected
        gameEvents: [],
      };

      const processedGame = processImportedGame(gameWithNoPlayers, mockCurrentRoster);

      expect(processedGame.selectedPlayerIds).toHaveLength(0);
    });

    it('should handle duplicate player IDs in selectedPlayerIds', () => {
      const gameWithDuplicates: AppState = {
        ...mockImportedGame,
        playersOnField: [mockCurrentRoster[0]],
        availablePlayers: [mockCurrentRoster[1]],
        selectedPlayerIds: ['player1', 'player1', 'player2', 'player2'], // Duplicates
        gameEvents: [],
      };

      const processedGame = processImportedGame(gameWithDuplicates, mockCurrentRoster);

      // Should deduplicate
      expect(processedGame.selectedPlayerIds).toHaveLength(2);
      expect(processedGame.selectedPlayerIds).toContain('player1');
      expect(processedGame.selectedPlayerIds).toContain('player2');
    });
  });

  describe('processImportedGames (batch processing)', () => {
    it('should process multiple games correctly', () => {
      const games: { [gameId: string]: AppState } = {
        'game1': {
          ...mockImportedGame,
          selectedPlayerIds: ['imported_player1'],
          gameDate: '2023-01-01',
        },
        'game2': {
          ...mockImportedGame,
          selectedPlayerIds: ['imported_player2', 'imported_player3'],
          gameDate: '2023-01-02',
        },
      };

      const { processedGames, mappingReport } = processImportedGames(games, mockCurrentRoster);

      expect(Object.keys(processedGames)).toHaveLength(2);
      expect(mappingReport.totalGames).toBe(2);

      // Game 1 should have 1 selected player
      expect(processedGames['game1'].selectedPlayerIds).toHaveLength(1);
      expect(processedGames['game1'].selectedPlayerIds).toContain('player1');

      // Game 2 should have 2 selected players
      expect(processedGames['game2'].selectedPlayerIds).toHaveLength(2);
      expect(processedGames['game2'].selectedPlayerIds).toContain('player2');
      expect(processedGames['game2'].selectedPlayerIds).toContain('player3');
    });

    it('should generate accurate mapping report', () => {
      const games: { [gameId: string]: AppState } = {
        'game1': mockImportedGame,
      };

      const { mappingReport } = processImportedGames(games, mockCurrentRoster);

      expect(mappingReport.totalGames).toBe(1);
      expect(mappingReport.gamesWithMappedPlayers).toBe(1);
      // Should have mappings for all unique players in the game
      expect(mappingReport.totalPlayerMappings).toBeGreaterThan(0);
      expect(mappingReport.nameMatches).toBeGreaterThan(0); // We use name matching
    });

    it('should handle empty games collection', () => {
      const { processedGames, mappingReport } = processImportedGames({}, mockCurrentRoster);

      expect(Object.keys(processedGames)).toHaveLength(0);
      expect(mappingReport.totalGames).toBe(0);
      expect(mappingReport.gamesWithMappedPlayers).toBe(0);
    });
  });

  describe('Data integrity after import', () => {
    it('should preserve all non-player-related game data', () => {
      const processedGame = processImportedGame(mockImportedGame, mockCurrentRoster);

      // Core game data should be preserved
      expect(processedGame.teamName).toBe('Test Team');
      expect(processedGame.opponentName).toBe('Opponent Team');
      expect(processedGame.gameDate).toBe('2023-05-15');
      expect(processedGame.homeScore).toBe(2);
      expect(processedGame.awayScore).toBe(1);
      expect(processedGame.homeOrAway).toBe('home');
      expect(processedGame.numberOfPeriods).toBe(2);
      expect(processedGame.periodDurationMinutes).toBe(45);
      expect(processedGame.currentPeriod).toBe(2);
      expect(processedGame.gameStatus).toBe('gameEnd');
      expect(processedGame.seasonId).toBe('season1');
      expect(processedGame.tournamentId).toBe('tournament1');
      expect(processedGame.gameLocation).toBe('Home Stadium');
      expect(processedGame.gameTime).toBe('14:00');
    });

    it('should preserve game event count and types', () => {
      const processedGame = processImportedGame(mockImportedGame, mockCurrentRoster);

      expect(processedGame.gameEvents).toHaveLength(mockImportedGame.gameEvents.length);

      const goalEvents = processedGame.gameEvents.filter(e => e.type === 'goal');
      const originalGoalEvents = mockImportedGame.gameEvents.filter(e => e.type === 'goal');
      expect(goalEvents).toHaveLength(originalGoalEvents.length);
    });

    it('should preserve event timestamps', () => {
      const processedGame = processImportedGame(mockImportedGame, mockCurrentRoster);

      mockImportedGame.gameEvents.forEach((originalEvent, index) => {
        expect(processedGame.gameEvents[index].time).toBe(originalEvent.time);
        expect(processedGame.gameEvents[index].id).toBe(originalEvent.id);
      });
    });

    it('should map assessments to correct current roster players', () => {
      const processedGame = processImportedGame(mockImportedGame, mockCurrentRoster);

      // Assessment for imported_player1 should be moved to player1
      expect(processedGame.assessments).toBeDefined();
      expect(processedGame.assessments!['player1']).toBeDefined();
      expect(processedGame.assessments!['player1'].overall).toBe(8);
      expect(processedGame.assessments!['player1'].notes).toBe('Great game');
      expect(processedGame.assessments!['player1'].minutesPlayed).toBe(90);

      // Original imported ID should not exist
      expect(processedGame.assessments!['imported_player1']).toBeUndefined();
    });

    it('should not create assessments for players not in current roster', () => {
      const gameWithUnknownAssessment: AppState = {
        ...mockImportedGame,
        assessments: {
          'completely-unknown-id': {
            overall: 5,
            sliders: { intensity: 5, courage: 5, duels: 5, technique: 5, creativity: 5, decisions: 5, awareness: 5, teamwork: 5, fair_play: 5, impact: 5 },
            notes: 'Should be filtered',
            minutesPlayed: 45,
            createdAt: Date.now(),
            createdBy: 'test'
          }
        }
      };

      const processedGame = processImportedGame(gameWithUnknownAssessment, mockCurrentRoster);

      // Unknown assessment should be filtered out
      expect(Object.keys(processedGame.assessments || {})).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle case-insensitive name matching', () => {
      const rosterWithDifferentCase: Player[] = [
        { id: 'p1', name: 'JOHN SMITH', isGoalie: false, jerseyNumber: '10', notes: '' },
      ];

      const gameWithLowerCaseName: AppState = {
        ...mockImportedGame,
        playersOnField: [
          { id: 'imported-1', name: 'john smith', isGoalie: false, jerseyNumber: '10', notes: '' },
        ],
        availablePlayers: [],
        selectedPlayerIds: ['imported-1'],
        gameEvents: [],
      };

      const processedGame = processImportedGame(gameWithLowerCaseName, rosterWithDifferentCase);

      expect(processedGame.selectedPlayerIds).toContain('p1');
    });

    it('should handle names with extra whitespace', () => {
      const rosterWithCleanNames: Player[] = [
        { id: 'p1', name: 'John Smith', isGoalie: false, jerseyNumber: '10', notes: '' },
      ];

      const gameWithWhitespaceName: AppState = {
        ...mockImportedGame,
        playersOnField: [
          { id: 'imported-1', name: '  John Smith  ', isGoalie: false, jerseyNumber: '10', notes: '' },
        ],
        availablePlayers: [],
        selectedPlayerIds: ['imported-1'],
        gameEvents: [],
      };

      const processedGame = processImportedGame(gameWithWhitespaceName, rosterWithCleanNames);

      expect(processedGame.selectedPlayerIds).toContain('p1');
    });

    it('should prefer exact ID match over name match', () => {
      const rosterWithSameIdDifferentName: Player[] = [
        { id: 'shared-id', name: 'Different Name', isGoalie: false, jerseyNumber: '10', notes: '' },
        { id: 'other-id', name: 'Original Name', isGoalie: false, jerseyNumber: '11', notes: '' },
      ];

      const gameWithSharedId: AppState = {
        ...mockImportedGame,
        playersOnField: [
          { id: 'shared-id', name: 'Original Name', isGoalie: false, jerseyNumber: '10', notes: '' },
        ],
        availablePlayers: [],
        selectedPlayerIds: ['shared-id'],
        gameEvents: [],
      };

      const mappings = createPlayerMapping(gameWithSharedId, rosterWithSameIdDifferentName);
      const sharedIdMapping = mappings.find(m => m.importedPlayerId === 'shared-id');

      // Should match by ID, not by name
      expect(sharedIdMapping?.currentPlayerId).toBe('shared-id');
      expect(sharedIdMapping?.matchConfidence).toBe('exact');
    });

    it('should handle games with no assessments', () => {
      const gameWithoutAssessments: AppState = {
        ...mockImportedGame,
        assessments: undefined,
      };

      const processedGame = processImportedGame(gameWithoutAssessments, mockCurrentRoster);

      expect(processedGame.assessments).toBeUndefined();
    });

    it('should handle games with empty assessments object', () => {
      const gameWithEmptyAssessments: AppState = {
        ...mockImportedGame,
        assessments: {},
      };

      const processedGame = processImportedGame(gameWithEmptyAssessments, mockCurrentRoster);

      expect(processedGame.assessments).toEqual({});
    });
  });
});