/**
 * @unit
 * Unit tests for useGameSessionCoordination hook
 *
 * Tests cover:
 * - Initial state setup with fallback defaults
 * - All metadata handlers (team name, opponent, dates, etc.)
 * - Validation logic (team name, numberOfPeriods)
 * - Season/tournament mutual exclusivity
 * - History operations (undo/redo, saveStateToHistory)
 * - applyHistoryState with legacy data compatibility
 */

import { renderHook, act } from '@testing-library/react';
import { useGameSessionCoordination } from './useGameSessionCoordination';
import type { AppState } from '@/types';
import logger from '@/utils/logger';

// Mock logger to verify logging behavior
jest.mock('@/utils/logger', () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

/**
 * Creates a complete AppState for testing
 */
const createAppState = (overrides: Partial<AppState> = {}): AppState => ({
  playersOnField: [],
  opponents: [],
  drawings: [],
  availablePlayers: [],
  showPlayerNames: true,
  teamName: 'Test Team',
  gameEvents: [],
  opponentName: 'Test Opponent',
  gameDate: '2025-11-18',
  homeScore: 0,
  awayScore: 0,
  gameNotes: '',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 10,
  currentPeriod: 1,
  gameStatus: 'notStarted',
  selectedPlayerIds: [],
  seasonId: '',
  tournamentId: '',
  demandFactor: 1,
  ageGroup: 'U12',
  tournamentLevel: '',
  gameLocation: '',
  gameTime: '',
  subIntervalMinutes: 5,
  completedIntervalDurations: [],
  lastSubConfirmationTimeSeconds: 0,
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: { relX: 0.5, relY: 0.5 },
  gamePersonnel: [],
  timeElapsedInSeconds: 0,
  ...overrides,
});

describe('useGameSessionCoordination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial State Setup', () => {
    /**
     * Tests that initial state is correctly set from initialState prop
     * @critical
     */
    it('should initialize with provided initial state', () => {
      const initialState = createAppState({
        teamName: 'Custom Team',
        opponentName: 'Custom Opponent',
        homeScore: 3,
        awayScore: 2,
      });

      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState })
      );

      expect(result.current.gameSessionState.teamName).toBe('Custom Team');
      expect(result.current.gameSessionState.opponentName).toBe('Custom Opponent');
      expect(result.current.gameSessionState.homeScore).toBe(3);
      expect(result.current.gameSessionState.awayScore).toBe(2);
    });

    /**
     * Tests fallback defaults for optional timer fields (legacy save compatibility)
     * @critical
     * @edge-case
     */
    it('should apply fallback defaults for optional timer fields', () => {
      const initialState = createAppState({
        subIntervalMinutes: undefined,
        completedIntervalDurations: undefined,
        lastSubConfirmationTimeSeconds: undefined,
      } as Partial<AppState>);

      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState })
      );

      expect(result.current.gameSessionState.subIntervalMinutes).toBe(5);
      expect(result.current.gameSessionState.completedIntervalDurations).toEqual([]);
      expect(result.current.gameSessionState.lastSubConfirmationTimeSeconds).toBe(0);
    });

    /**
     * Tests that initialGameSessionData is exposed for reset operations
     */
    it('should expose initialGameSessionData', () => {
      const initialState = createAppState({ teamName: 'Initial Team' });

      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState })
      );

      expect(result.current.initialGameSessionData).toBeDefined();
      expect(result.current.initialGameSessionData.teamName).toBe('Initial Team');
    });
  });

  describe('Team Name Handler', () => {
    /**
     * Tests successful team name update
     */
    it('should update team name with valid input', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setTeamName('New Team Name');
      });

      expect(result.current.gameSessionState.teamName).toBe('New Team Name');
    });

    /**
     * Tests validation - silently ignores empty team names
     * @edge-case
     */
    it('should silently ignore empty team names', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState({ teamName: 'Original Team' }) })
      );

      act(() => {
        result.current.handlers.setTeamName('');
      });

      // Should remain unchanged
      expect(result.current.gameSessionState.teamName).toBe('Original Team');
    });

    /**
     * Tests validation - silently ignores whitespace-only team names
     * @edge-case
     */
    it('should silently ignore whitespace-only team names', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState({ teamName: 'Original Team' }) })
      );

      act(() => {
        result.current.handlers.setTeamName('   ');
      });

      // Should remain unchanged
      expect(result.current.gameSessionState.teamName).toBe('Original Team');
    });

    /**
     * Tests trimming of team name input
     */
    it('should trim team name input', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setTeamName('  Trimmed Team  ');
      });

      expect(result.current.gameSessionState.teamName).toBe('Trimmed Team');
    });
  });

  describe('Metadata Handlers', () => {
    /**
     * Tests opponent name handler
     */
    it('should update opponent name', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setOpponentName('New Opponent');
      });

      expect(result.current.gameSessionState.opponentName).toBe('New Opponent');
    });

    /**
     * Tests game date handler
     */
    it('should update game date', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setGameDate('2025-12-25');
      });

      expect(result.current.gameSessionState.gameDate).toBe('2025-12-25');
    });

    /**
     * Tests game notes handler
     */
    it('should update game notes', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setGameNotes('Important notes');
      });

      expect(result.current.gameSessionState.gameNotes).toBe('Important notes');
    });

    /**
     * Tests game location handler
     */
    it('should update game location', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setGameLocation('Stadium A');
      });

      expect(result.current.gameSessionState.gameLocation).toBe('Stadium A');
    });

    /**
     * Tests game time handler
     */
    it('should update game time', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setGameTime('14:30');
      });

      expect(result.current.gameSessionState.gameTime).toBe('14:30');
    });

    /**
     * Tests age group handler
     */
    it('should update age group', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setAgeGroup('U15');
      });

      expect(result.current.gameSessionState.ageGroup).toBe('U15');
    });

    /**
     * Tests tournament level handler
     */
    it('should update tournament level', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setTournamentLevel('Regional');
      });

      expect(result.current.gameSessionState.tournamentLevel).toBe('Regional');
    });
  });

  describe('Game Structure Handlers', () => {
    /**
     * Tests setting number of periods with valid value (1)
     */
    it('should set number of periods to 1', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setNumberOfPeriods(1);
      });

      expect(result.current.gameSessionState.numberOfPeriods).toBe(1);
      expect(logger.log).toHaveBeenCalledWith('Number of periods set to: 1');
    });

    /**
     * Tests setting number of periods with valid value (2)
     */
    it('should set number of periods to 2', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setNumberOfPeriods(2);
      });

      expect(result.current.gameSessionState.numberOfPeriods).toBe(2);
      expect(logger.log).toHaveBeenCalledWith('Number of periods set to: 2');
    });

    /**
     * Tests validation - rejects invalid number of periods
     * @edge-case
     */
    it('should reject invalid number of periods and log warning', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState({ numberOfPeriods: 2 }) })
      );

      act(() => {
        result.current.handlers.setNumberOfPeriods(3);
      });

      // Should remain unchanged
      expect(result.current.gameSessionState.numberOfPeriods).toBe(2);
      expect(logger.warn).toHaveBeenCalledWith('Invalid number of periods attempted: 3. Must be 1 or 2.');
    });

    /**
     * Tests period duration handler with valid value
     */
    it('should set period duration', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setPeriodDuration(15);
      });

      expect(result.current.gameSessionState.periodDurationMinutes).toBe(15);
    });

    /**
     * Tests period duration handler enforces minimum value
     * @edge-case
     */
    it('should enforce minimum period duration of 1 minute', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setPeriodDuration(0);
      });

      expect(result.current.gameSessionState.periodDurationMinutes).toBe(1);
    });

    /**
     * Tests demand factor handler
     */
    it('should set demand factor', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setDemandFactor(2);
      });

      expect(result.current.gameSessionState.demandFactor).toBe(2);
    });

    /**
     * Tests home/away status handler
     */
    it('should set home/away status', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setHomeOrAway('away');
      });

      expect(result.current.gameSessionState.homeOrAway).toBe('away');
    });
  });

  describe('Season/Tournament Handlers', () => {
    /**
     * Tests setting season ID
     */
    it('should set season ID', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setSeasonId('season-123');
      });

      expect(result.current.gameSessionState.seasonId).toBe('season-123');
    });

    /**
     * Tests setting tournament ID
     */
    it('should set tournament ID', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setTournamentId('tournament-456');
      });

      expect(result.current.gameSessionState.tournamentId).toBe('tournament-456');
    });

    /**
     * Tests that setting season ID clears tournament ID (mutual exclusivity)
     * @critical
     */
    it('should clear tournament ID when setting season ID', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({
          initialState: createAppState({ tournamentId: 'existing-tournament' }),
        })
      );

      act(() => {
        result.current.handlers.setSeasonId('season-123');
      });

      expect(result.current.gameSessionState.seasonId).toBe('season-123');
      expect(result.current.gameSessionState.tournamentId).toBe('');
    });

    /**
     * Tests that setting tournament ID clears season ID (mutual exclusivity)
     * @critical
     */
    it('should clear season ID when setting tournament ID', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({
          initialState: createAppState({ seasonId: 'existing-season' }),
        })
      );

      act(() => {
        result.current.handlers.setTournamentId('tournament-456');
      });

      expect(result.current.gameSessionState.tournamentId).toBe('tournament-456');
      expect(result.current.gameSessionState.seasonId).toBe('');
    });

    /**
     * Tests handling undefined season ID
     */
    it('should handle undefined season ID', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setSeasonId(undefined);
      });

      expect(result.current.gameSessionState.seasonId).toBe('');
    });

    /**
     * Tests handling undefined tournament ID
     */
    it('should handle undefined tournament ID', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      act(() => {
        result.current.handlers.setTournamentId(undefined);
      });

      expect(result.current.gameSessionState.tournamentId).toBe('');
    });
  });

  describe('Game Personnel Handler', () => {
    /**
     * Tests setting game personnel
     */
    it('should set game personnel', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      const personnelIds = ['player1', 'player2', 'player3'];

      act(() => {
        result.current.handlers.setGamePersonnel(personnelIds);
      });

      expect(result.current.gameSessionState.gamePersonnel).toEqual(personnelIds);
    });

    /**
     * Tests clearing game personnel with empty array
     */
    it('should clear game personnel with empty array', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({
          initialState: createAppState({ gamePersonnel: ['player1', 'player2'] }),
        })
      );

      act(() => {
        result.current.handlers.setGamePersonnel([]);
      });

      expect(result.current.gameSessionState.gamePersonnel).toEqual([]);
    });
  });

  describe('History Operations', () => {
    /**
     * Tests that history state is initialized
     */
    it('should initialize history state', () => {
      const initialState = createAppState({ teamName: 'History Team' });

      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState })
      );

      expect(result.current.historyState).toBeDefined();
      expect(result.current.historyState.teamName).toBe('History Team');
    });

    /**
     * Tests undo/redo availability flags
     */
    it('should initialize with no undo/redo available', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    /**
     * Tests saveStateToHistory callback is exposed
     */
    it('should expose saveStateToHistory callback', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      expect(result.current.saveStateToHistory).toBeDefined();
      expect(typeof result.current.saveStateToHistory).toBe('function');
    });

    /**
     * Tests saveTacticalStateToHistory callback is exposed
     */
    it('should expose saveTacticalStateToHistory callback', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      expect(result.current.saveTacticalStateToHistory).toBeDefined();
      expect(typeof result.current.saveTacticalStateToHistory).toBe('function');
    });

    /**
     * Tests tactical history is exposed
     */
    it('should expose tactical history', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      expect(result.current.tacticalHistory).toBeDefined();
    });
  });

  describe('applyHistoryState', () => {
    /**
     * Tests applying complete history state
     * @critical
     */
    it('should apply complete history state', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      const historyState = createAppState({
        teamName: 'Restored Team',
        opponentName: 'Restored Opponent',
        homeScore: 5,
        awayScore: 3,
        gameDate: '2025-12-01',
        gameNotes: 'Restored notes',
        numberOfPeriods: 1,
        periodDurationMinutes: 20,
        seasonId: 'restored-season',
        gameLocation: 'Restored Location',
        gameTime: '18:00',
      });

      act(() => {
        result.current.applyHistoryState(historyState);
      });

      expect(result.current.gameSessionState.teamName).toBe('Restored Team');
      expect(result.current.gameSessionState.opponentName).toBe('Restored Opponent');
      expect(result.current.gameSessionState.homeScore).toBe(5);
      expect(result.current.gameSessionState.awayScore).toBe(3);
      expect(result.current.gameSessionState.gameDate).toBe('2025-12-01');
      expect(result.current.gameSessionState.gameNotes).toBe('Restored notes');
      expect(result.current.gameSessionState.numberOfPeriods).toBe(1);
      expect(result.current.gameSessionState.periodDurationMinutes).toBe(20);
      expect(result.current.gameSessionState.seasonId).toBe('restored-season');
      expect(result.current.gameSessionState.gameLocation).toBe('Restored Location');
      expect(result.current.gameSessionState.gameTime).toBe('18:00');
    });

    /**
     * Review 4.1: an undo entry that lacks a field (the load baseline did) must leave
     * the live value alone - spreading undefined wiped the team, the shootout result,
     * the tournament level and the clock, and the autosave persisted that.
     * @critical
     */
    it('leaves fields the history entry does not have untouched', () => {
      const live = createAppState({
        teamId: 'team_1',
        tournamentLevel: 'A',
        tournamentSeriesId: 'series_1',
        wentToPenalties: true,
        shootoutKicks: [{ team: 'home', scored: true }] as never,
        timeElapsedInSeconds: 1234,
        homeScore: 2,
        gameStatus: 'inProgress', // differs from the initial state, so the clock is set too
      } as Partial<AppState>);
      const { result } = renderHook(() => useGameSessionCoordination({ initialState: createAppState() }));
      act(() => { result.current.applyHistoryState(live); }); // the live game, fully set

      const partialEntry = { ...createAppState({ homeScore: 1 }) } as Record<string, unknown>;
      for (const key of ['teamId', 'tournamentLevel', 'tournamentSeriesId', 'wentToPenalties', 'shootoutKicks', 'timeElapsedInSeconds']) {
        delete partialEntry[key];
      }
      act(() => {
        result.current.applyHistoryState(partialEntry as unknown as AppState);
      });

      const state = result.current.gameSessionState;
      expect(state.homeScore).toBe(1); // what the entry has is restored
      expect(state.teamId).toBe('team_1');
      expect(state.tournamentLevel).toBe('A');
      expect(state.tournamentSeriesId).toBe('series_1');
      expect(state.wentToPenalties).toBe(true);
      expect(state.shootoutKicks).toHaveLength(1);
      expect(state.timeElapsedInSeconds).toBe(1234);
    });

    /**
     * Review 4.3: undo within the same period never rewinds the clock (a pause at
     * 19:30 then Undo set it back to the 08:00 goal entry); crossing a period start or
     * end still restores it, so clock and period match.
     * @critical
     */
    it('keeps the live clock when undoing within the same period, restores it across periods', () => {
      const { result } = renderHook(() => useGameSessionCoordination({ initialState: createAppState() }));
      const at = (t: number, period: number, status: AppState['gameStatus']) =>
        createAppState({ timeElapsedInSeconds: t, currentPeriod: period, gameStatus: status } as Partial<AppState>);
      act(() => { result.current.applyHistoryState(at(1170, 1, 'inProgress')); }); // paused at 19:30
      expect(result.current.gameSessionState.timeElapsedInSeconds).toBe(1170);

      act(() => { result.current.applyHistoryState(at(480, 1, 'inProgress')); }); // undo to the 08:00 goal
      expect(result.current.gameSessionState.timeElapsedInSeconds).toBe(1170);

      act(() => { result.current.applyHistoryState(at(1200, 1, 'periodEnd')); }); // a different status
      expect(result.current.gameSessionState.timeElapsedInSeconds).toBe(1200);
      act(() => { result.current.applyHistoryState(at(1300, 2, 'inProgress')); }); // a different period
      expect(result.current.gameSessionState.timeElapsedInSeconds).toBe(1300);
    });

    /** Review 4.5: undoing a venue change restores its pitch, pin and address too. @critical */
    it('undo restores the venue name together with its pitch, pin and address', () => {
      const venue = (name: string, lat: number) => createAppState({
        gameLocation: name, fieldNumber: `${name}-1`, locationLat: lat, locationLng: lat + 1, locationAddress: `${name} street`,
      } as Partial<AppState>);
      const { result } = renderHook(() => useGameSessionCoordination({ initialState: createAppState() }));
      act(() => { result.current.applyHistoryState(venue('New', 61)); });
      act(() => { result.current.applyHistoryState(venue('Old', 60)); }); // undo to the old venue
      expect(result.current.gameSessionState).toMatchObject({
        gameLocation: 'Old', fieldNumber: 'Old-1', locationLat: 60, locationLng: 61, locationAddress: 'Old street',
      });
    });

    it('a venue change records its pitch, pin and address in the history entry', () => {
      const { result } = renderHook(() => useGameSessionCoordination({ initialState: createAppState() }));
      act(() => {
        result.current.dispatchGameSession({ type: 'SET_LOCATION_COORDS', payload: { lat: 60.2, lng: 24.9, address: 'Pitch road 1' } });
      });
      act(() => { result.current.dispatchGameSession({ type: 'SET_FIELD_NUMBER', payload: '3' }); });
      expect(result.current.historyState).toMatchObject({
        locationLat: 60.2, locationLng: 24.9, locationAddress: 'Pitch road 1', fieldNumber: '3',
      });
    });

    it('still clears a field the history entry has as undefined (undo of "set team")', () => {
      const { result } = renderHook(() => useGameSessionCoordination({ initialState: createAppState() }));
      act(() => { result.current.applyHistoryState(createAppState({ teamId: 'team_1' } as Partial<AppState>)); });
      expect(result.current.gameSessionState.teamId).toBe('team_1');
      act(() => { result.current.applyHistoryState(createAppState({ teamId: undefined } as Partial<AppState>)); });
      expect(result.current.gameSessionState.teamId).toBeUndefined();
    });

    /**
     * Tests applying legacy history state without optional timer fields
     * @critical
     * @edge-case
     * This is the bug we fixed - legacy saves lack subIntervalMinutes, etc.
     */
    it('should apply fallback defaults for legacy history state', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      // Simulate legacy save that lacks optional timer fields
      const legacyHistoryState = createAppState({
        subIntervalMinutes: undefined,
        completedIntervalDurations: undefined,
        lastSubConfirmationTimeSeconds: undefined,
      } as Partial<AppState>);

      act(() => {
        result.current.applyHistoryState(legacyHistoryState);
      });

      // Should apply fallback defaults, NOT undefined
      expect(result.current.gameSessionState.subIntervalMinutes).toBe(5);
      expect(result.current.gameSessionState.completedIntervalDurations).toEqual([]);
      expect(result.current.gameSessionState.lastSubConfirmationTimeSeconds).toBe(0);
    });

    /**
     * Tests that applyHistoryState doesn't trigger another history save
     * This prevents infinite loops in undo/redo
     */
    it('should not create new history entry when applying history state', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      const historyState = createAppState({ teamName: 'State 1' });

      // Apply first state
      act(() => {
        result.current.applyHistoryState(historyState);
      });

      // Should still have no undo available (applyHistoryState doesn't save to history)
      expect(result.current.canUndo).toBe(false);
    });
  });

  describe('Reducer Integration', () => {
    /**
     * Tests that dispatchGameSession is exposed
     */
    it('should expose dispatchGameSession', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      expect(result.current.dispatchGameSession).toBeDefined();
      expect(typeof result.current.dispatchGameSession).toBe('function');
    });

    /**
     * Tests that gameSessionState is exposed
     */
    it('should expose gameSessionState', () => {
      const { result } = renderHook(() =>
        useGameSessionCoordination({ initialState: createAppState() })
      );

      expect(result.current.gameSessionState).toBeDefined();
      expect(result.current.gameSessionState.teamName).toBeDefined();
    });
  });
});
