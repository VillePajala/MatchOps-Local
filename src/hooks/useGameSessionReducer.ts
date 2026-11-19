import { GameEvent, SubAlertLevel, GameType, Gender, IntervalLog, ShootoutKick } from '@/types';
import type { AiMeta } from '@/types/game';
import logger from '@/utils/logger';
import { todayIso } from '@/utils/todayIso';
import { clockContinuation } from '@/utils/clockContinuation';
import { extraTimePeriodCount, isLastPeriod, periodEndSeconds, periodStartSeconds, regulationEndSeconds, structureFrom, type MatchStructure } from '@/utils/matchStructure';

// --- State Definition ---
export interface GameSessionState {
  teamName: string;
  opponentName: string;
  gameDate: string;
  homeScore: number;
  awayScore: number;
  gameNotes: string;
  /** Provenance when the report text came from an approved AI draft. */
  gameNotesAiMeta?: AiMeta;
  playerPositions?: Record<string, string[]>;
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
  wentToOvertime?: boolean; // Game went to overtime/extra time
  extraTimePeriods?: number; // Extra-time periods after regulation (review 11.1; 0/absent = none)
  extraTimeMinutes?: number; // Length of each extra-time period
  wentToPenalties?: boolean; // Game decided by penalty shootout
  shootoutKicks?: ShootoutKick[]; // Penalty-shootout kicks (free-form log; result derived)
  ageGroup?: string;
  tournamentLevel?: string;
  tournamentSeriesId?: string;
  gameLocation?: string;
  /** Which pitch at the venue; see AppState.fieldNumber. */
  fieldNumber?: string;
  locationLat?: number;
  locationLng?: number;
  /** The pinned venue's address; see AppState.locationAddress. */
  locationAddress?: string;
  gameTime?: string;
  demandFactor: number;
  gameEvents: GameEvent[];
  // Timer related state
  timeElapsedInSeconds: number; // This will now represent the time elapsed *when paused*
  startTimestamp: number | null; // Timestamp from Date.now() when the timer was started/resumed
  /** The current break was made by "End period" (review 4.31): a length edit must not
   *  reopen it as a false half-time. Session-only; cleared when play resumes or resets. */
  periodEndedManually?: boolean;
  isTimerRunning: boolean;
  subIntervalMinutes: number;
  nextSubDueTimeSeconds: number;
  subAlertLevel: SubAlertLevel;
  lastSubConfirmationTimeSeconds: number;
  completedIntervalDurations?: IntervalLog[]; // Made optional to align with AppState
  showPlayerNames: boolean;
  showPositionLabels?: boolean; // Whether to show position labels on the field (default: true)
}

// IntervalLog is imported from @/types (canonical definition in types/game.ts)

// --- Initial State ---
// The actual initial state will be derived from page.tsx's initialState object.
// This is just a placeholder for type completeness if needed directly in this file,
// but generally, the page will provide the true initial state.
export const initialGameSessionStatePlaceholder: GameSessionState = {
  teamName: "My Team",
  opponentName: "Opponent",
  gameDate: todayIso(),
  homeScore: 0,
  awayScore: 0,
  gameNotes: '',
  gameNotesAiMeta: undefined,
  playerPositions: {},
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
  fieldNumber: '',
  locationLat: undefined,
  locationLng: undefined,
  locationAddress: undefined,
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
  showPositionLabels: true,
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
  /** Kirjuri: report text and the provenance of the draft it came from, together. */
  | { type: 'APPLY_REPORT_DRAFT'; payload: { gameNotes: string; aiMeta?: AiMeta } }
  | { type: 'SET_PLAYER_POSITIONS'; payload: Record<string, string[]> }
  | { type: 'SET_HOME_OR_AWAY'; payload: 'home' | 'away' }
  | { type: 'SET_NUMBER_OF_PERIODS'; payload: 1 | 2 }
  | { type: 'SET_PERIOD_DURATION'; payload: number }
  | { type: 'SET_GAME_STATUS'; payload: GameSessionState['gameStatus'] }
  | { type: 'START_PERIOD'; payload: { nextPeriod: number, periodDurationMinutes: number, subIntervalMinutes: number } }
  | { type: 'START_EXTRA_TIME'; payload: { periods: number; minutes: number } }
  | { type: 'END_PERIOD_OR_GAME'; payload: { newStatus: 'periodEnd' | 'gameEnd', finalTime?: number; manual?: boolean } }
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
  | { type: 'SET_WENT_TO_OVERTIME'; payload: boolean }
  | { type: 'SET_WENT_TO_PENALTIES'; payload: boolean }
  | { type: 'SET_SHOOTOUT_KICKS'; payload: ShootoutKick[] }
  | { type: 'SET_SHOW_POSITION_LABELS'; payload: boolean }
  | { type: 'SET_GAME_LOCATION'; payload: string }
  | { type: 'SET_FIELD_NUMBER'; payload: string }
  | { type: 'SET_LOCATION_COORDS'; payload: { lat?: number; lng?: number; address?: string } }
  | { type: 'SET_GAME_TIME'; payload: string }
  | { type: 'SET_AGE_GROUP'; payload: string }
  | { type: 'SET_TOURNAMENT_LEVEL'; payload: string }
  | { type: 'SET_TOURNAMENT_SERIES_ID'; payload: string | undefined }
  | { type: 'SET_TEAM_ID'; payload: string | undefined }
  | { type: 'SET_DEMAND_FACTOR'; payload: number }
  | { type: 'ADD_GAME_EVENT'; payload: GameEvent }
  | { type: 'UPDATE_GAME_EVENT'; payload: GameEvent }
  /** Name the scorer/assister of the goal just logged by quick goal entry (D16).
   *  Same change as UPDATE_GAME_EVENT, but it joins the undo step that logged the
   *  goal instead of starting its own (see useGameSessionWithHistory). */
  | { type: 'AMEND_GAME_EVENT'; payload: GameEvent }
  | { type: 'DELETE_GAME_EVENT'; payload: string } // eventId (legacy - kept for tests)
  | { type: 'DELETE_GAME_EVENT_WITH_SCORE'; payload: GameEvent } // Atomic delete + score adjustment
  | { type: 'SET_TIMER_ELAPSED'; payload: number }
  | { type: 'SET_TIMER_RUNNING'; payload: boolean }
  | { type: 'SET_SUB_INTERVAL'; payload: number } // subIntervalMinutes
  | { type: 'CONFIRM_SUBSTITUTION' }
  | { type: 'RESET_TIMER_AND_GAME_PROGRESS'; payload?: { subIntervalMinutes?: number } } // Optional payload preserves subIntervalMinutes across reset
  | { type: 'RESET_TIMER_ONLY' }
  | { type: 'LOAD_GAME_SESSION_STATE'; payload: Partial<GameSessionState> }
  | { type: 'RESET_GAME_SESSION_STATE'; payload: GameSessionState } // Action to reset to a specific state
  | { type: 'LOAD_PERSISTED_GAME_DATA'; payload: Partial<GameSessionState> } // For loading GameData-like objects
  | { type: 'RESUME_GAME' } // Resume a loaded in-progress game at its saved clock/period
  /** Continue a clock that reached full time too early, after the period length or
   *  count was corrected (the game was set up shorter than it was played). */
  | { type: 'CONTINUE_CLOCK'; payload: { period: number } };

const safeElapsedSeconds = (value: unknown, fallback: number): number => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
};

// --- Reducer Function ---
/**
 * A STOPPED clock at or past the end of its current period is a period break, or
 * full time on the last period - never "in progress" (review 4.26). Left as
 * in-progress (or as the load-coerced notStarted) it showed a plain Start/Resume at
 * the boundary: one tap ran the clock for a second, the tick then ended the period
 * and the clock stopped again - an untimed second half for a coach who tapped Start
 * at kick-off and looked up. Reached by: reopening after the phone was locked
 * through the period end, a pause in the last fraction of a second, or shortening
 * the period while paused.
 */
export function boundaryStop(
  structure: MatchStructure,
  currentPeriod: number,
  elapsed: number,
): { status: 'periodEnd' | 'gameEnd'; time: number } | null {
  const boundary = periodEndSeconds(structure, currentPeriod);
  if (!(boundary > 0) || elapsed < boundary) return null;
  return { status: isLastPeriod(structure, currentPeriod) ? 'gameEnd' : 'periodEnd', time: boundary };
}

/**
 * Re-checks a clock stopped at a PERIOD BREAK after the period length or count
 * changes (review 1.11). At a false half-time (period set up shorter than played),
 * lengthening the period puts the game back in play, paused at the same minute, so
 * Start continues the period; reducing the game to one period at half-time ends it.
 *
 * A finished game ('gameEnd') is deliberately NOT changed here: reopening it would
 * make it the live match the app opens into at launch, and hide the wrap-up, even
 * when the coach is only correcting the length for the record. Instead the timer's
 * Start button offers to continue when the corrected structure leaves time to play
 * (see clockContinuation, useGameTimer.startPause and TimerOverlay).
 *
 * A PAUSED in-progress clock (incl. the load-coerced notStarted with time on the
 * clock) that a shortened period leaves at or past its end becomes the break
 * (review 4.26) - status only, the clock stays where it was.
 */
function reconcilePeriodBreak(state: GameSessionState): GameSessionState {
  if (state.isTimerRunning) return state;
  const pausedInPlay = state.gameStatus === 'inProgress'
    || (state.gameStatus === 'notStarted' && state.timeElapsedInSeconds > 0); // load-coerced
  if (pausedInPlay) {
    // Paused mid-period and the period was shortened to end at or before this minute:
    // it is now the period break. Only the STATUS changes - the clock stays where the
    // game was, so re-entering the right length (a typo of 15 for 25) continues from
    // exactly there via clockContinuation instead of losing the minutes in between.
    const stop = boundaryStop(state, state.currentPeriod, state.timeElapsedInSeconds);
    return stop ? { ...state, gameStatus: stop.status } : state;
  }
  if (state.gameStatus !== 'periodEnd') return state;
  // A break the coach made with "End period" (review 4.31) is never reopened by a length
  // edit - only the period COUNT can still turn it into full time.
  if (state.periodEndedManually) {
    return isLastPeriod(state, state.currentPeriod) ? { ...state, gameStatus: 'gameEnd' } : state;
  }
  // The break still stands when the clock is at or past the CURRENT period's end under
  // the new structure (review 4.30): shortening the length at half-time (2 x 25 played
  // as 2 x 20, corrected at the break) used to read 25:00 as "5 minutes into period 2",
  // turning the break into a paused period 2 whose half then ran 15 minutes. Start
  // Period 2 still starts the next period at its nominal time. On the last period it
  // is full time. Only a LONGER period (a false half-time) continues the clock below.
  // The clock is deliberately left where it stopped (as for a paused clock above).
  const breakStands = boundaryStop(state, state.currentPeriod, state.timeElapsedInSeconds);
  if (breakStands) {
    return breakStands.status === 'gameEnd' ? { ...state, gameStatus: 'gameEnd' } : state;
  }
  const next = clockContinuation(state);
  if (next === null) return { ...state, gameStatus: 'gameEnd' };
  if (next.kind === 'resume') return { ...state, gameStatus: 'inProgress', currentPeriod: next.period };
  return { ...state, currentPeriod: next.period - 1 };
}

export const gameSessionReducer = (state: GameSessionState, action: GameSessionAction): GameSessionState => {
  logger.debug('[gameSessionReducer] action type:', action.type);
  switch (action.type) {
    case 'LOAD_STATE_FROM_HISTORY': {
      let merged = { ...state, ...action.payload };
      // Belt and braces (review 4.27): a running clock only exists in play.
      if (merged.gameStatus !== 'inProgress' && (merged.isTimerRunning || merged.startTimestamp !== null)) {
        merged = { ...merged, isTimerRunning: false, startTimestamp: null };
      }
      // An undone period length or count re-checks the break, as editing it does.
      if (merged.periodDurationMinutes !== state.periodDurationMinutes || merged.numberOfPeriods !== state.numberOfPeriods) {
        merged = reconcilePeriodBreak(merged);
        // Undoing the change that ENDED the match at half-time (periods 2 -> 1 at the
        // break) puts it back at the break. Editing never reopens a finished game (see
        // reconcilePeriodBreak); undo returns to a state the coach already had.
        if (merged.gameStatus === 'gameEnd' && !merged.isTimerRunning) {
          const next = clockContinuation(merged);
          if (next?.kind === 'nextPeriod') {
            merged = { ...merged, gameStatus: 'periodEnd', currentPeriod: next.period - 1 };
          }
        }
      }
      // The sub reminder is derived state, not in history (review 4.4): undoing a sub
      // confirmation restored lastSubConfirmationTimeSeconds but left the next-due time
      // of the mistaken confirmation, so a sub still owed showed no reminder. Recompute
      // both from the restored values, as loading a saved game does.
      // Only when the undo actually changes them: every entry carries these fields, so
      // undoing an unrelated goal must not touch the reminder.
      if (merged.lastSubConfirmationTimeSeconds === state.lastSubConfirmationTimeSeconds
        && merged.subIntervalMinutes === state.subIntervalMinutes) {
        return merged;
      }
      const nextSubDueTimeSeconds = merged.lastSubConfirmationTimeSeconds + merged.subIntervalMinutes * 60;
      const warningTime = nextSubDueTimeSeconds - 60;
      const elapsed = merged.timeElapsedInSeconds;
      const subAlertLevel: SubAlertLevel = elapsed >= nextSubDueTimeSeconds
        ? 'due'
        : warningTime >= 0 && elapsed >= warningTime ? 'warning' : 'none';
      return { ...merged, nextSubDueTimeSeconds, subAlertLevel };
    }
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
      // Hand-written edits clear the AI provenance: the text is the coach's now.
      return { ...state, gameNotes: action.payload, gameNotesAiMeta: undefined };
    case 'APPLY_REPORT_DRAFT':
      return { ...state, gameNotes: action.payload.gameNotes, gameNotesAiMeta: action.payload.aiMeta };
    case 'SET_PLAYER_POSITIONS':
      return { ...state, playerPositions: action.payload };
    case 'SET_HOME_OR_AWAY': {
      // When switching home/away, swap the scores because homeScore/awayScore
      // refer to the position (home team vs away team), not the user's team.
      const newHomeOrAway = action.payload;
      const isChanging = state.homeOrAway !== newHomeOrAway;

      if (isChanging) {
        // Swap scores when toggling - and the shootout kicks with them (review 4.12):
        // a kick's team is a side ('home'/'away') too, so leaving it flipped a won
        // shootout into a loss and listed the coach's shooters as the opponent's.
        return {
          ...state,
          homeOrAway: newHomeOrAway,
          homeScore: state.awayScore,
          awayScore: state.homeScore,
          ...(state.shootoutKicks
            ? {
                shootoutKicks: state.shootoutKicks.map((kick) => ({
                  ...kick,
                  team: kick.team === 'home' ? 'away' as const : 'home' as const,
                })),
              }
            : {}),
        };
      }

      // No change, return state as-is
      return state;
    }
    case 'SET_NUMBER_OF_PERIODS':
      return reconcilePeriodBreak({ ...state, numberOfPeriods: action.payload });
    case 'SET_PERIOD_DURATION':
      return reconcilePeriodBreak({ ...state, periodDurationMinutes: action.payload });
    case 'SET_GAME_STATUS':
      return { ...state, gameStatus: action.payload };
    case 'START_PERIOD': {
        const { nextPeriod, periodDurationMinutes, subIntervalMinutes } = action.payload;
        // The payload carries the regulation length the timer started with; extra time
        // (if any) comes from the state.
        const previousPeriodEndTime = periodStartSeconds({ ...structureFrom(state, state), periodDurationMinutes }, nextPeriod);
        return {
            ...state,
            currentPeriod: nextPeriod,
            gameStatus: 'inProgress',
            periodEndedManually: false,
            timeElapsedInSeconds: nextPeriod === 1 ? 0 : previousPeriodEndTime,
            isTimerRunning: true,
            lastSubConfirmationTimeSeconds: nextPeriod === 1 ? 0 : previousPeriodEndTime,
            nextSubDueTimeSeconds: (nextPeriod === 1 ? 0 : previousPeriodEndTime) + (subIntervalMinutes * 60),
            subAlertLevel: 'none',
            completedIntervalDurations: nextPeriod === 1 ? [] : state.completedIntervalDurations,
            startTimestamp: Date.now(),
        };
    }
    case 'START_EXTRA_TIME': {
        // Review 11.1 (owner 2026-11-17): at full time the coach starts extra time -
        // 1 or 2 periods of whole minutes, after regulation. Only from a stopped full
        // time with no extra time yet; it never starts by itself. The clock starts at
        // the regulation end, like any next period.
        const { periods, minutes } = action.payload;
        if (state.gameStatus !== 'gameEnd' || state.isTimerRunning) return state;
        if (extraTimePeriodCount(state) > 0) return state;
        if (!(periods === 1 || periods === 2) || !Number.isInteger(minutes) || minutes < 1 || minutes > 60) return state;
        const withExtra = { ...state, extraTimePeriods: periods, extraTimeMinutes: minutes };
        const start = regulationEndSeconds(withExtra);
        return {
            ...withExtra,
            wentToOvertime: true,
            currentPeriod: state.numberOfPeriods + 1,
            gameStatus: 'inProgress',
            periodEndedManually: false,
            timeElapsedInSeconds: start,
            isTimerRunning: true,
            lastSubConfirmationTimeSeconds: start,
            nextSubDueTimeSeconds: start + state.subIntervalMinutes * 60,
            subAlertLevel: 'none',
            startTimestamp: Date.now(),
        };
    }
    case 'END_PERIOD_OR_GAME': {
        // Only a period in play can end (review 4.33): a stray end (a tick landing
        // between a reset and the interval teardown) must not end a reset game.
        if (state.gameStatus !== 'inProgress') return state;
        const { newStatus, finalTime } = action.payload;
        const timeToSet = finalTime !== undefined ? finalTime : state.timeElapsedInSeconds;
        return {
            ...state,
            gameStatus: newStatus,
            isTimerRunning: false,
            timeElapsedInSeconds: timeToSet,
            subAlertLevel: timeToSet >= state.nextSubDueTimeSeconds ? 'due' : state.subAlertLevel,
            startTimestamp: null,
            periodEndedManually: action.payload.manual === true,
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
    case 'CONTINUE_CLOCK': {
      // Only from a finished game whose corrected structure leaves time to play;
      // the caller checks clockContinuation. Keeps the clock and sub tracking.
      if (state.isTimerRunning || state.gameStatus !== 'gameEnd') return state;
      return {
        ...state,
        periodEndedManually: false,
        gameStatus: 'inProgress',
        currentPeriod: action.payload.period,
        isTimerRunning: true,
        startTimestamp: Date.now(),
      };
    }
    case 'RESUME_GAME': {
      // Resume a game restored from storage. LOAD_PERSISTED_GAME_DATA
      // coerces 'inProgress' to 'notStarted' (never auto-start a timer on load)
      // while preserving the clock, period, substitution tracking and interval
      // history — so resuming must NOT go through START_PERIOD, which would
      // reset all of those to period 1 / 0:00.
      // Only valid from the load-coerced 'notStarted' state; periodEnd/gameEnd
      // have their own transitions.
      if (state.isTimerRunning || state.gameStatus !== 'notStarted') return state;
      return {
        ...state,
        gameStatus: 'inProgress',
        isTimerRunning: true,
        startTimestamp: Date.now(),
      };
    }
    case 'PAUSE_TIMER': {
      if (!state.isTimerRunning || !state.startTimestamp) return state;
      // Use precise time from precision timer if provided. If unavailable, keep
      // the latest reducer time instead of adding wall-clock time again: while
      // running, SET_TIMER_ELAPSED already advances timeElapsedInSeconds.
      const preciseTime = action.payload;
      const timeElapsedAtPause = safeElapsedSeconds(
        preciseTime,
        safeElapsedSeconds(state.timeElapsedInSeconds, 0)
      );
      // A pause in the last fraction of a second (precise time just past the end,
      // before the tick ended the period) is the period end (review 4.26).
      const stop = state.gameStatus === 'inProgress'
        ? boundaryStop(state, state.currentPeriod, timeElapsedAtPause)
        : null;
      return {
        ...state,
        isTimerRunning: false,
        startTimestamp: null,
        timeElapsedInSeconds: stop ? stop.time : timeElapsedAtPause,
        // Same as the tick's period end (END_PERIOD_OR_GAME), incl. its sub-alert rule.
        ...(stop ? {
          gameStatus: stop.status,
          subAlertLevel: stop.time >= state.nextSubDueTimeSeconds ? 'due' as const : state.subAlertLevel,
        } : {}),
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
    case 'SET_WENT_TO_OVERTIME':
      return { ...state, wentToOvertime: action.payload ?? undefined };
    case 'SET_WENT_TO_PENALTIES':
      return { ...state, wentToPenalties: action.payload ?? undefined };
    case 'SET_SHOOTOUT_KICKS':
      return { ...state, shootoutKicks: action.payload };
    case 'SET_SHOW_POSITION_LABELS':
      return { ...state, showPositionLabels: action.payload };
    case 'SET_GAME_LOCATION':
      return { ...state, gameLocation: action.payload };
    case 'SET_FIELD_NUMBER':
      return { ...state, fieldNumber: action.payload };
    case 'SET_LOCATION_COORDS':
      // The address rides with the coordinates because it describes the SAME
      // pin - splitting them is how a position and its label drift apart.
      return {
        ...state,
        locationLat: action.payload.lat,
        locationLng: action.payload.lng,
        locationAddress: action.payload.address,
      };
    case 'SET_GAME_TIME':
      return { ...state, gameTime: action.payload };
    case 'SET_AGE_GROUP':
      return { ...state, ageGroup: action.payload };
    case 'SET_TOURNAMENT_LEVEL':
      return { ...state, tournamentLevel: action.payload };
    case 'SET_TOURNAMENT_SERIES_ID':
      return { ...state, tournamentSeriesId: action.payload };
    case 'SET_TEAM_ID':
      return { ...state, teamId: action.payload };
    case 'SET_DEMAND_FACTOR':
      return { ...state, demandFactor: action.payload };
    case 'ADD_GAME_EVENT':
      return { ...state, gameEvents: [...state.gameEvents, action.payload] };
    case 'UPDATE_GAME_EVENT':
    case 'AMEND_GAME_EVENT': {
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
    case 'SET_SUB_INTERVAL': {
        const newIntervalMinutes = Math.max(1, action.payload);
        const currentElapsedTime = state.timeElapsedInSeconds;
        const newIntervalSec = newIntervalMinutes * 60;
        // Last confirmed sub + interval (review 4.13, owner decision 2026-11-16) - the
        // same rule as confirming a sub, starting a period and loading a game. A grid
        // from kick-off here made the reminder jump after a reload (07:00 became 12:00).
        // If that time has already passed, the reminder is due straight away.
        const newDueTime = state.lastSubConfirmationTimeSeconds + newIntervalSec;

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
        // Back to kick-off: extra time is chosen again at full time (review 11.1), and
        // the Overtime flag starting it set goes with it.
        extraTimePeriods: undefined,
        extraTimeMinutes: undefined,
        wentToOvertime: extraTimePeriodCount(state) > 0 ? false : state.wentToOvertime,
        timeElapsedInSeconds: 0,
        isTimerRunning: false,
        startTimestamp: null,
        currentPeriod: 1,
        gameStatus: 'notStarted',
        nextSubDueTimeSeconds: nextSubDue,
        subAlertLevel: 'none',
        lastSubConfirmationTimeSeconds: 0,
        completedIntervalDurations: [],
      };
    }
    case 'RESET_TIMER_AND_GAME_PROGRESS': {
        // Resets game progress to initial state. Only subIntervalMinutes is
        // preserved from the payload (to keep settings in sync with reset).
        const subIntervalMins = action.payload?.subIntervalMinutes ?? state.subIntervalMinutes ?? 5;
        return {
            ...state,
            timeElapsedInSeconds: 0,
            startTimestamp: null,
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
            // Back to kick-off: extra time is chosen again at full time (review 11.1), and
            // the Overtime flag starting it set goes with it.
            extraTimePeriods: undefined,
            extraTimeMinutes: undefined,
            wentToOvertime: extraTimePeriodCount(state) > 0 ? false : state.wentToOvertime,
        };
    }
    case 'RESET_GAME_SESSION_STATE':
      return action.payload;
    case 'LOAD_PERSISTED_GAME_DATA': {
      logger.debug('[gameSessionReducer] LOAD_PERSISTED_GAME_DATA - Received action.payload:', action.payload);
      const loadedData = action.payload as Partial<GameSessionState>;

      const teamName = loadedData.teamName ?? initialGameSessionStatePlaceholder.teamName;
      const opponentName = loadedData.opponentName ?? initialGameSessionStatePlaceholder.opponentName;
      const gameDate = loadedData.gameDate ?? initialGameSessionStatePlaceholder.gameDate;
      const homeScore = loadedData.homeScore ?? 0;
      const awayScore = loadedData.awayScore ?? 0;
      const gameNotes = loadedData.gameNotes ?? '';
      const gameNotesAiMeta = loadedData.gameNotesAiMeta;
      const playerPositions = loadedData.playerPositions ?? {};
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
      const wentToOvertime = loadedData.wentToOvertime;
      const extraTimePeriods = loadedData.extraTimePeriods;
      const extraTimeMinutes = loadedData.extraTimeMinutes;
      const wentToPenalties = loadedData.wentToPenalties;
      const shootoutKicks = loadedData.shootoutKicks;
      const ageGroup = loadedData.ageGroup;
      const tournamentLevel = loadedData.tournamentLevel;
      const gameLocation = loadedData.gameLocation ?? '';
      const fieldNumber = loadedData.fieldNumber ?? '';
      const locationLat = loadedData.locationLat;
      const locationLng = loadedData.locationLng;
      const locationAddress = loadedData.locationAddress;
      const gameTime = loadedData.gameTime ?? '';
      const demandFactor = loadedData.demandFactor ?? 1;
      const gameEvents = loadedData.gameEvents ?? [];
      const subIntervalMinutes = loadedData.subIntervalMinutes ?? initialGameSessionStatePlaceholder.subIntervalMinutes;
      const showPlayerNames = loadedData.showPlayerNames ?? initialGameSessionStatePlaceholder.showPlayerNames;
      const showPositionLabels = loadedData.showPositionLabels ?? true;
      const completedIntervalDurations = loadedData.completedIntervalDurations ?? [];
      const gamePersonnel = loadedData.gamePersonnel ?? [];

      // Calculate fallback time based on period (used if no saved time exists)
      const structureAtLoad: MatchStructure = structureFrom(loadedData, { numberOfPeriods, periodDurationMinutes });
      let fallbackTimeElapsed = 0;
      if (gameStatus === 'periodEnd' || gameStatus === 'gameEnd') {
         fallbackTimeElapsed = periodEndSeconds(structureAtLoad, currentPeriod);
      } else {
         fallbackTimeElapsed = periodStartSeconds(structureAtLoad, currentPeriod);
      }

      // Use saved timeElapsedInSeconds if available, otherwise fall back to calculated value
      const timeElapsedAtLoad = loadedData.timeElapsedInSeconds ?? fallbackTimeElapsed;

      // Use persisted lastSubConfirmationTimeSeconds if available, otherwise use timeElapsedAtLoad as fallback
      const lastSubConfirmation = loadedData.lastSubConfirmationTimeSeconds ?? timeElapsedAtLoad;
      // Calculate next due time from last confirmation, not from current time
      const nextSubDueTime = lastSubConfirmation + (subIntervalMinutes * 60);

      // An in-progress game stored (or recovered) at or past its period end loads as
      // the period break / full time it is, not as a startable clock (review 4.26).
      const stopAtLoad = loadedData.gameStatus === 'inProgress'
        ? boundaryStop(structureAtLoad, currentPeriod, timeElapsedAtLoad)
        : null;
      const clockAtLoad = stopAtLoad ? stopAtLoad.time : timeElapsedAtLoad;

      // Recalculate alert level based on restored timer position (matches logic in SET_TIMER_ELAPSED)
      let recalculatedAlertLevel: SubAlertLevel = 'none';
      const warningTime = nextSubDueTime - 60;
      if (clockAtLoad >= nextSubDueTime) {
        recalculatedAlertLevel = 'due';
      } else if (warningTime >= 0 && clockAtLoad >= warningTime) {
        recalculatedAlertLevel = 'warning';
      }

      const stateToBeReturned: GameSessionState = {
        teamName,
        opponentName,
        gameDate,
        homeScore,
        awayScore,
        gameNotes,
        gameNotesAiMeta,
        playerPositions,
        homeOrAway,
        numberOfPeriods,
        periodDurationMinutes,
        currentPeriod,
        gameStatus: stopAtLoad ? stopAtLoad.status : gameStatus,
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
        wentToOvertime,
        extraTimePeriods,
        extraTimeMinutes,
        wentToPenalties,
        shootoutKicks,
        ageGroup,
        tournamentLevel,
        gameLocation,
        fieldNumber,
        locationLat,
        locationLng,
        locationAddress,
        gameTime,
        demandFactor,
        gameEvents,
        subIntervalMinutes,
        showPlayerNames,
        showPositionLabels,
        completedIntervalDurations,

        timeElapsedInSeconds: clockAtLoad,
        startTimestamp: null,
        isTimerRunning: false,
        nextSubDueTimeSeconds: nextSubDueTime,
        subAlertLevel: recalculatedAlertLevel,
        lastSubConfirmationTimeSeconds: lastSubConfirmation,
      };
      logger.debug('[gameSessionReducer] LOAD_PERSISTED_GAME_DATA - state to be returned:', stateToBeReturned);
      return stateToBeReturned;
    }
    default:
      return state;
  }
}; 
