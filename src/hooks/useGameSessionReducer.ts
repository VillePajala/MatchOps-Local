import { GameEvent, SubAlertLevel, GameType, Gender } from '@/types';
import logger from '@/utils/logger';

// --- State Definition ---
export interface GameSessionState {
  teamName: string;
  opponentName: string;
  gameDate: string;
  homeScore: number;
  awayScore: number;
  gameNotes: string;
  homeOrAway: 'home' | 'away';
  numberOfPeriods: 1 | 2;
  periodDurationMinutes: number;
  currentPeriod: number;
  gameStatus: 'notStarted' | 'inProgress' | 'periodEnd' | 'gameEnd';
  selectedPlayerIds: string[];
  gamePersonnel: string[];
  seasonId: string;
  tournamentId: string;
  leagueId?: string; // Optional league ID - can override season's default league
  customLeagueName?: string; // Custom league name when leagueId === 'muu'
  teamId?: string; // Optional team ID for multi-team support
  gameType?: GameType; // Sport type: 'soccer' or 'futsal' (defaults to 'soccer')
  gender?: Gender; // Gender: 'boys' or 'girls' (optional for backward compatibility)
  ageGroup?: string;
  tournamentLevel?: string;
  tournamentSeriesId?: string;
  gameLocation?: string;
  gameTime?: string;
  demandFactor: number;
  gameEvents: GameEvent[];
  // Timer related state
  timeElapsedInSeconds: number; // This will now represent the time elapsed *when paused*
  startTimestamp: number | null; // Timestamp from Date.now() when the timer was started/resumed
  isTimerRunning: boolean;
  subIntervalMinutes: number;
  nextSubDueTimeSeconds: number;
  subAlertLevel: SubAlertLevel;
  lastSubConfirmationTimeSeconds: number;
  completedIntervalDurations?: IntervalLog[]; // Made optional to align with AppState
  showPlayerNames: boolean;
}

// Define IntervalLog if it's not globally available from AppState import
// For now, assuming AppState might not be directly importable or could cause circular deps
// So, defining it locally or ensuring it's available via a shared types file is better.
export interface IntervalLog {
  period: number;
  duration: number; // Duration in seconds
  timestamp: number; // Unix timestamp when the interval ended
}


// --- Initial State ---
// The actual initial state will be derived from page.tsx's initialState object.
// This is just a placeholder for type completeness if needed directly in this file,
// but generally, the page will provide the true initial state.
export const initialGameSessionStatePlaceholder: GameSessionState = {
  teamName: "My Team",
  opponentName: "Opponent",
  gameDate: new Date().toISOString().split('T')[0],
  homeScore: 0,
  awayScore: 0,
  gameNotes: '',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 15,
  currentPeriod: 1,
  gameStatus: 'notStarted',
  selectedPlayerIds: [],
  gamePersonnel: [],
  seasonId: '',
  tournamentId: '',
  ageGroup: '',
  tournamentLevel: '',
  gameLocation: '',
  gameTime: '',
  demandFactor: 1,
  gameEvents: [],
  timeElapsedInSeconds: 0,
  startTimestamp: null,
  isTimerRunning: false,
  subIntervalMinutes: 5,
  nextSubDueTimeSeconds: 300,
  subAlertLevel: 'none',
  lastSubConfirmationTimeSeconds: 0,
  completedIntervalDurations: [],
  showPlayerNames: true,
  gameType: 'soccer',
};


// --- Action Definitions ---
export type GameSessionAction =
  | { type: 'LOAD_STATE_FROM_HISTORY'; payload: Partial<GameSessionState> }
  | { type: 'RESET_TO_INITIAL_STATE'; payload: GameSessionState } // Payload is the full initial state
  | { type: 'SET_TEAM_NAME'; payload: string }
  | { type: 'SET_OPPONENT_NAME'; payload: string }
  | { type: 'SET_GAME_DATE'; payload: string }
  | { type: 'SET_HOME_SCORE'; payload: number }
  | { type: 'SET_AWAY_SCORE'; payload: number }
  | { type: 'ADJUST_SCORE_FOR_EVENT'; payload: { eventType: 'goal' | 'opponentGoal', action: 'add' | 'delete' } }
  | { type: 'SET_GAME_NOTES'; payload: string }
  | { type: 'SET_HOME_OR_AWAY'; payload: 'home' | 'away' }
  | { type: 'SET_NUMBER_OF_PERIODS'; payload: 1 | 2 }
  | { type: 'SET_PERIOD_DURATION'; payload: number }
  | { type: 'SET_GAME_STATUS'; payload: GameSessionState['gameStatus'] }
  | { type: 'START_PERIOD'; payload: { nextPeriod: number, periodDurationMinutes: number, subIntervalMinutes: number } }
  | { type: 'END_PERIOD_OR_GAME'; payload: { newStatus: 'periodEnd' | 'gameEnd', finalTime?: number } }
  | { type: 'START_TIMER' }
  | { type: 'PAUSE_TIMER'; payload?: number } // Optional payload: precise current time from precision timer
  | { type: 'SET_SELECTED_PLAYER_IDS'; payload: string[] }
  | { type: 'SET_GAME_PERSONNEL'; payload: string[] }
  | { type: 'SET_SEASON_ID'; payload: string }
  | { type: 'SET_TOURNAMENT_ID'; payload: string }
  | { type: 'SET_LEAGUE_ID'; payload: string | undefined }
  | { type: 'SET_CUSTOM_LEAGUE_NAME'; payload: string | undefined }
  | { type: 'SET_GAME_TYPE'; payload: GameType }
  | { type: 'SET_GENDER'; payload: Gender | undefined }
  | { type: 'SET_GAME_LOCATION'; payload: string }
  | { type: 'SET_GAME_TIME'; payload: string }
  | { type: 'SET_AGE_GROUP'; payload: string }
  | { type: 'SET_TOURNAMENT_LEVEL'; payload: string }
  | { type: 'SET_TOURNAMENT_SERIES_ID'; payload: string | undefined }
  | { type: 'SET_DEMAND_FACTOR'; payload: number }
  | { type: 'ADD_GAME_EVENT'; payload: GameEvent }
  | { type: 'UPDATE_GAME_EVENT'; payload: GameEvent }
  | { type: 'DELETE_GAME_EVENT'; payload: string } // eventId (legacy - kept for tests)
  | { type: 'DELETE_GAME_EVENT_WITH_SCORE'; payload: GameEvent } // Atomic delete + score adjustment
  | { type: 'SET_TIMER_ELAPSED'; payload: number }
  | { type: 'SET_TIMER_RUNNING'; payload: boolean }
  | { type: 'SET_SUB_INTERVAL'; payload: number } // subIntervalMinutes
  | { type: 'CONFIRM_SUBSTITUTION' }
  | { type: 'RESET_TIMER_AND_GAME_PROGRESS'; payload?: Partial<GameSessionState> } // Optional payload for selective reset
  | { type: 'RESET_TIMER_ONLY' }
  | { type: 'LOAD_GAME_SESSION_STATE'; payload: Partial<GameSessionState> }
  | { type: 'RESET_GAME_SESSION_STATE'; payload: GameSessionState } // Action to reset to a specific state
  | { type: 'LOAD_PERSISTED_GAME_DATA'; payload: Partial<GameSessionState> } // For loading GameData-like objects
  | { type: 'PAUSE_TIMER_FOR_HIDDEN' }
  | { type: 'RESTORE_TIMER_STATE'; payload: { savedTime: number; timestamp: number } };

// --- Reducer Function ---
export const gameSessionReducer = (state: GameSessionState, action: GameSessionAction): GameSessionState => {
  logger.log('[gameSessionReducer] action type:', action.type);
  switch (action.type) {
    case 'LOAD_STATE_FROM_HISTORY':
    case 'LOAD_GAME_SESSION_STATE':
      return { ...state, ...action.payload };
    case 'RESET_TO_INITIAL_STATE':
      return { ...action.payload };
    case 'SET_TEAM_NAME':
      return { ...state, teamName: action.payload };
    case 'SET_OPPONENT_NAME':
      return { ...state, opponentName: action.payload };
    case 'SET_GAME_DATE':
      return { ...state, gameDate: action.payload };
    case 'SET_HOME_SCORE':
      return { ...state, homeScore: action.payload };
    case 'SET_AWAY_SCORE':
      return { ...state, awayScore: action.payload };
    case 'ADJUST_SCORE_FOR_EVENT': {
        let newHomeScore = state.homeScore;
        let newAwayScore = state.awayScore;
        const adjustment = action.payload.action === 'add' ? 1 : -1;

        if (action.payload.eventType === 'goal') {
            if (state.homeOrAway === 'home') newHomeScore = Math.max(0, state.homeScore + adjustment);
            else newAwayScore = Math.max(0, state.awayScore + adjustment);
        } else if (action.payload.eventType === 'opponentGoal') {
            if (state.homeOrAway === 'home') newAwayScore = Math.max(0, state.awayScore + adjustment);
            else newHomeScore = Math.max(0, state.homeScore + adjustment);
        }
        return { ...state, homeScore: newHomeScore, awayScore: newAwayScore };
    }
    case 'SET_GAME_NOTES':
      return { ...state, gameNotes: action.payload };
    case 'SET_HOME_OR_AWAY': {
      // When switching home/away, swap the scores because homeScore/awayScore
      // refer to the position (home team vs away team), not the user's team.
      const newHomeOrAway = action.payload;
      const isChanging = state.homeOrAway !== newHomeOrAway;

      if (isChanging) {
        // Swap scores when toggling
        return {
          ...state,
          homeOrAway: newHomeOrAway,
          homeScore: state.awayScore,
          awayScore: state.homeScore,
        };
      }

      // No change, return state as-is
      return state;
    }
    case 'SET_NUMBER_OF_PERIODS':
      return { ...state, numberOfPeriods: action.payload };
    case 'SET_PERIOD_DURATION':
      return { ...state, periodDurationMinutes: action.payload };
    case 'SET_GAME_STATUS':
      return { ...state, gameStatus: action.payload };
    case 'START_PERIOD': {
        const { nextPeriod, periodDurationMinutes, subIntervalMinutes } = action.payload;
        const previousPeriodEndTime = (nextPeriod - 1) * periodDurationMinutes * 60;
        return {
            ...state,
            currentPeriod: nextPeriod,
            gameStatus: 'inProgress',
            timeElapsedInSeconds: nextPeriod === 1 ? 0 : previousPeriodEndTime,
            isTimerRunning: true,
            lastSubConfirmationTimeSeconds: nextPeriod === 1 ? 0 : previousPeriodEndTime,
            nextSubDueTimeSeconds: (nextPeriod === 1 ? 0 : previousPeriodEndTime) + (subIntervalMinutes * 60),
            subAlertLevel: 'none',
            completedIntervalDurations: nextPeriod === 1 ? [] : state.completedIntervalDurations,
            startTimestamp: Date.now(),
        };
    }
    case 'END_PERIOD_OR_GAME': {
        const { newStatus, finalTime } = action.payload;
        const timeToSet = finalTime !== undefined ? finalTime : state.timeElapsedInSeconds;
        return {
            ...state,
            gameStatus: newStatus,
            isTimerRunning: false,
            timeElapsedInSeconds: timeToSet,
            subAlertLevel: timeToSet >= state.nextSubDueTimeSeconds ? 'due' : state.subAlertLevel,
            startTimestamp: null,
        };
    }
    case 'START_TIMER': {
      if (state.isTimerRunning) return state;
      return {
        ...state,
        isTimerRunning: true,
        startTimestamp: Date.now(),
      };
    }
    case 'PAUSE_TIMER': {
      if (!state.isTimerRunning || !state.startTimestamp) return state;
      // Use precise time from precision timer if provided, otherwise calculate from Date.now()
      const preciseTime = action.payload;
      const timeElapsedAtPause = preciseTime !== undefined
        ? preciseTime
        : state.timeElapsedInSeconds + (Date.now() - state.startTimestamp) / 1000;
      return {
        ...state,
        isTimerRunning: false,
        startTimestamp: null,
        timeElapsedInSeconds: timeElapsedAtPause,
      };
    }
    case 'SET_SELECTED_PLAYER_IDS':
      return { ...state, selectedPlayerIds: action.payload };
    case 'SET_GAME_PERSONNEL':
      return { ...state, gamePersonnel: action.payload };
    case 'SET_SEASON_ID':
      // Only clear tournament if setting a non-empty season (mutual exclusivity)
      // If clearing season (empty string), leave tournament unchanged
      return action.payload
        ? { ...state, seasonId: action.payload, tournamentId: '' }
        : { ...state, seasonId: action.payload };
    case 'SET_TOURNAMENT_ID':
      // Only clear season if setting a non-empty tournament (mutual exclusivity)
      // If clearing tournament (empty string), leave season unchanged
      return action.payload
        ? { ...state, tournamentId: action.payload, seasonId: '' }
        : { ...state, tournamentId: action.payload };
    case 'SET_LEAGUE_ID':
      return { ...state, leagueId: action.payload || undefined };
    case 'SET_CUSTOM_LEAGUE_NAME':
      return { ...state, customLeagueName: action.payload || undefined };
    case 'SET_GAME_TYPE':
      return { ...state, gameType: action.payload };
    case 'SET_GENDER':
      return { ...state, gender: action.payload };
    case 'SET_GAME_LOCATION':
      return { ...state, gameLocation: action.payload };
    case 'SET_GAME_TIME':
      return { ...state, gameTime: action.payload };
    case 'SET_AGE_GROUP':
      return { ...state, ageGroup: action.payload };
    case 'SET_TOURNAMENT_LEVEL':
      return { ...state, tournamentLevel: action.payload };
    case 'SET_TOURNAMENT_SERIES_ID':
      return { ...state, tournamentSeriesId: action.payload };
    case 'SET_DEMAND_FACTOR':
      return { ...state, demandFactor: action.payload };
    case 'ADD_GAME_EVENT':
      return { ...state, gameEvents: [...state.gameEvents, action.payload] };
    case 'UPDATE_GAME_EVENT': {
      const index = state.gameEvents.findIndex(e => e.id === action.payload.id);
      if (index === -1) return state;
      const newGameEvents = [...state.gameEvents];
      newGameEvents[index] = action.payload;
      return { ...state, gameEvents: newGameEvents };
    }
    case 'DELETE_GAME_EVENT': {
      return { ...state, gameEvents: state.gameEvents.filter(e => e.id !== action.payload) };
    }
    case 'DELETE_GAME_EVENT_WITH_SCORE': {
      // Atomic operation: Delete event + adjust score in single state update
      // This prevents race conditions where event and score could become out of sync
      const eventToDelete = action.payload;
      const newGameEvents = state.gameEvents.filter(e => e.id !== eventToDelete.id);

      // Calculate score adjustment if it's a goal event
      let newHomeScore = state.homeScore;
      let newAwayScore = state.awayScore;

      if (eventToDelete.type === 'goal') {
        if (state.homeOrAway === 'home') {
          newHomeScore = Math.max(0, state.homeScore - 1);
        } else {
          newAwayScore = Math.max(0, state.awayScore - 1);
        }
      } else if (eventToDelete.type === 'opponentGoal') {
        if (state.homeOrAway === 'home') {
          newAwayScore = Math.max(0, state.awayScore - 1);
        } else {
          newHomeScore = Math.max(0, state.homeScore - 1);
        }
      }

      return {
        ...state,
        gameEvents: newGameEvents,
        homeScore: newHomeScore,
        awayScore: newAwayScore
      };
    }
    case 'SET_TIMER_ELAPSED': {
        // Ignore timer updates when timer is not running to prevent race conditions
        // (e.g., a tick that was queued just before pause should not override the paused time)
        if (!state.isTimerRunning) return state;

        const newTime = action.payload;
        let newAlertLevel: GameSessionState['subAlertLevel'] = 'none';
        const warningTime = state.nextSubDueTimeSeconds - 60;
        if (newTime >= state.nextSubDueTimeSeconds) {
            newAlertLevel = 'due';
        } else if (warningTime >= 0 && newTime >= warningTime) {
            newAlertLevel = 'warning';
        }
        return { ...state, timeElapsedInSeconds: newTime, subAlertLevel: newAlertLevel };
    }
    case 'SET_TIMER_RUNNING':
      return { ...state, isTimerRunning: action.payload };
    case 'PAUSE_TIMER_FOR_HIDDEN':
      if (state.isTimerRunning && state.gameStatus === 'inProgress') {
        return { ...state, isTimerRunning: false };
      }
      return state;
    case 'RESTORE_TIMER_STATE': {
      if (state.gameStatus === 'inProgress') {
        const { savedTime } = action.payload;
        // savedTime is already corrected by handleVisibilityChange (savedTime + offline duration)
        // Don't calculate offline time again to avoid double-counting
        return {
          ...state,
          timeElapsedInSeconds: Math.round(savedTime),
          isTimerRunning: true,
        };
      }
      return state;
    }
    case 'SET_SUB_INTERVAL': {
        const newIntervalMinutes = Math.max(1, action.payload);
        const currentElapsedTime = state.timeElapsedInSeconds;
        const newIntervalSec = newIntervalMinutes * 60;
        let newDueTime = Math.ceil((currentElapsedTime + 1) / newIntervalSec) * newIntervalSec;
        if (newDueTime <= currentElapsedTime && newIntervalSec > 0 ) newDueTime += newIntervalSec;
        if (newDueTime === 0 && newIntervalSec > 0) newDueTime = newIntervalSec;


        let alertLevel: GameSessionState['subAlertLevel'] = 'none';
        const warningTime = newDueTime - 60;
        if (currentElapsedTime >= newDueTime && newIntervalSec > 0) alertLevel = 'due';
        else if (warningTime >=0 && currentElapsedTime >= warningTime) alertLevel = 'warning';

        return {
            ...state,
            subIntervalMinutes: newIntervalMinutes,
            nextSubDueTimeSeconds: newDueTime,
            subAlertLevel: alertLevel,
        };
    }
    case 'CONFIRM_SUBSTITUTION': {
        const duration = state.timeElapsedInSeconds - state.lastSubConfirmationTimeSeconds;
        const newIntervalLog: IntervalLog = {
            period: state.currentPeriod,
            duration: duration,
            timestamp: state.timeElapsedInSeconds,
        };
        // Add interval to CURRENT time, not the old target time
        const newNextSubDueTime = state.timeElapsedInSeconds + (state.subIntervalMinutes * 60);
        let alertLevelAfterSub: GameSessionState['subAlertLevel'] = 'none';
        const warningTimeForNext = newNextSubDueTime - 60;
        if (state.timeElapsedInSeconds >= newNextSubDueTime) alertLevelAfterSub = 'due';
        else if (warningTimeForNext >=0 && state.timeElapsedInSeconds >= warningTimeForNext) alertLevelAfterSub = 'warning';

        return {
            ...state,
            completedIntervalDurations: [newIntervalLog, ...(state.completedIntervalDurations || [])],
            lastSubConfirmationTimeSeconds: state.timeElapsedInSeconds,
            nextSubDueTimeSeconds: newNextSubDueTime,
            subAlertLevel: alertLevelAfterSub,
        };
    }
    case 'RESET_TIMER_ONLY': {
      // UX DECISION - PRODUCT OWNER APPROVED: Reset to 0:00 of first period
      // 
      // Previous behavior: Reset only to start of current period (e.g., 10:00 → 10:00 in period 2)  
      // New behavior: Complete reset to game beginning (any time → 0:00 period 1)
      //
      // Rationale: Users expect a "reset" button to return to the very beginning, not just 
      // the current period. This matches behavior of stopwatches and is more intuitive.
      // Coaches can use pause/resume for period-level control.
      const nextSubDue = state.subIntervalMinutes * 60;
      return {
        ...state,
        timeElapsedInSeconds: 0,
        isTimerRunning: false,
        currentPeriod: 1,
        gameStatus: 'notStarted',
        nextSubDueTimeSeconds: nextSubDue,
        subAlertLevel: 'none',
        lastSubConfirmationTimeSeconds: 0,
      };
    }
    case 'RESET_TIMER_AND_GAME_PROGRESS': {
        const subIntervalMins = action.payload?.subIntervalMinutes || state.subIntervalMinutes || 5;
        return {
            ...state,
            timeElapsedInSeconds: 0,
            isTimerRunning: false,
            currentPeriod: 1,
            gameStatus: 'notStarted',
            gameEvents: [],
            homeScore: 0,
            awayScore: 0,
            subIntervalMinutes: subIntervalMins,
            nextSubDueTimeSeconds: subIntervalMins * 60,
            subAlertLevel: 'none',
            lastSubConfirmationTimeSeconds: 0,
            completedIntervalDurations: [],
            ...(action.payload || {}),
        };
    }
    case 'RESET_GAME_SESSION_STATE':
      return action.payload;
    case 'LOAD_PERSISTED_GAME_DATA': {
      logger.log('[gameSessionReducer] LOAD_PERSISTED_GAME_DATA - Received action.payload:', JSON.parse(JSON.stringify(action.payload)));
      const loadedData = action.payload as Partial<GameSessionState>;

      const teamName = loadedData.teamName ?? initialGameSessionStatePlaceholder.teamName;
      const opponentName = loadedData.opponentName ?? initialGameSessionStatePlaceholder.opponentName;
      const gameDate = loadedData.gameDate ?? initialGameSessionStatePlaceholder.gameDate;
      const homeScore = loadedData.homeScore ?? 0;
      const awayScore = loadedData.awayScore ?? 0;
      const gameNotes = loadedData.gameNotes ?? '';
      const homeOrAway = loadedData.homeOrAway ?? 'home';
      const numberOfPeriods = loadedData.numberOfPeriods ?? initialGameSessionStatePlaceholder.numberOfPeriods;
      const periodDurationMinutes = loadedData.periodDurationMinutes ?? initialGameSessionStatePlaceholder.periodDurationMinutes;
      const currentPeriod = loadedData.currentPeriod ?? 1;

      // Never restore 'inProgress' status - timer must be manually restarted by user.
      // This prevents auto-starting timers on app reload (better UX and safety).
      const gameStatus = loadedData.gameStatus && ['notStarted', 'periodEnd', 'gameEnd'].includes(loadedData.gameStatus)
        ? loadedData.gameStatus
        : 'notStarted';
      const selectedPlayerIds = loadedData.selectedPlayerIds ?? [];
      const seasonId = loadedData.seasonId ?? '';
      const tournamentId = loadedData.tournamentId ?? '';
      const tournamentSeriesId = loadedData.tournamentSeriesId;
      const teamId = loadedData.teamId;
      const leagueId = loadedData.leagueId;
      const customLeagueName = loadedData.customLeagueName;
      const gameType = loadedData.gameType;
      const gender = loadedData.gender;
      const ageGroup = loadedData.ageGroup;
      const tournamentLevel = loadedData.tournamentLevel;
      const gameLocation = loadedData.gameLocation ?? '';
      const gameTime = loadedData.gameTime ?? '';
      const demandFactor = loadedData.demandFactor ?? 1;
      const gameEvents = loadedData.gameEvents ?? [];
      const subIntervalMinutes = loadedData.subIntervalMinutes ?? initialGameSessionStatePlaceholder.subIntervalMinutes;
      const showPlayerNames = loadedData.showPlayerNames ?? initialGameSessionStatePlaceholder.showPlayerNames;
      const completedIntervalDurations = loadedData.completedIntervalDurations ?? [];
      const gamePersonnel = loadedData.gamePersonnel ?? [];

      // Calculate fallback time based on period (used if no saved time exists)
      let fallbackTimeElapsed = 0;
      if (gameStatus === 'periodEnd' || gameStatus === 'gameEnd') {
         fallbackTimeElapsed = currentPeriod * periodDurationMinutes * 60;
      } else {
         fallbackTimeElapsed = (currentPeriod - 1) * periodDurationMinutes * 60;
      }

      // Use saved timeElapsedInSeconds if available, otherwise fall back to calculated value
      const timeElapsedAtLoad = loadedData.timeElapsedInSeconds ?? fallbackTimeElapsed;

      // Use persisted lastSubConfirmationTimeSeconds if available, otherwise use timeElapsedAtLoad as fallback
      const lastSubConfirmation = loadedData.lastSubConfirmationTimeSeconds ?? timeElapsedAtLoad;
      // Calculate next due time from last confirmation, not from current time
      const nextSubDueTime = lastSubConfirmation + (subIntervalMinutes * 60);

      // Recalculate alert level based on restored timer position (matches logic in SET_TIMER_ELAPSED)
      let recalculatedAlertLevel: SubAlertLevel = 'none';
      const warningTime = nextSubDueTime - 60;
      if (timeElapsedAtLoad >= nextSubDueTime) {
        recalculatedAlertLevel = 'due';
      } else if (warningTime >= 0 && timeElapsedAtLoad >= warningTime) {
        recalculatedAlertLevel = 'warning';
      }

      const stateToBeReturned: GameSessionState = {
        teamName,
        opponentName,
        gameDate,
        homeScore,
        awayScore,
        gameNotes,
        homeOrAway,
        numberOfPeriods,
        periodDurationMinutes,
        currentPeriod,
        gameStatus,
        selectedPlayerIds,
        gamePersonnel,
        seasonId,
        tournamentId,
        tournamentSeriesId,
        teamId,
        leagueId,
        customLeagueName,
        gameType,
        gender,
        ageGroup,
        tournamentLevel,
        gameLocation,
        gameTime,
        demandFactor,
        gameEvents,
        subIntervalMinutes,
        showPlayerNames,
        completedIntervalDurations,

        timeElapsedInSeconds: timeElapsedAtLoad,
        startTimestamp: null,
        isTimerRunning: false,
        nextSubDueTimeSeconds: nextSubDueTime,
        subAlertLevel: recalculatedAlertLevel,
        lastSubConfirmationTimeSeconds: lastSubConfirmation,
      };
      logger.log('[gameSessionReducer] LOAD_PERSISTED_GAME_DATA - state to be returned:', JSON.parse(JSON.stringify(stateToBeReturned)));
      return stateToBeReturned;
    }
    default:
      return state;
  }
}; 
