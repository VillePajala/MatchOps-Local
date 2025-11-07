/**
 * Regression tests for useGameSessionReducer bugs fixed in PR #55
 *
 * These tests ensure that the following bugs do not reoccur:
 * - Fix #4: Season/Tournament mutual exclusivity in reducer
 *
 * @critical
 */

import { gameSessionReducer, initialGameSessionStatePlaceholder } from '../useGameSessionReducer';
import type { GameSessionState, GameSessionAction } from '../useGameSessionReducer';

describe('useGameSessionReducer - Regression Tests for PR #55', () => {
  let initialState: GameSessionState;

  beforeEach(() => {
    initialState = {
      ...initialGameSessionStatePlaceholder,
      seasonId: '',
      tournamentId: '',
    };
  });

  /**
   * Regression test for Fix #4: Season/Tournament mutual exclusivity in reducer
   *
   * Bug: Clearing season also cleared tournament (and vice versa)
   * Fix: Only clear opposite field when setting non-empty value
   *
   * Lines: src/hooks/useGameSessionReducer.ts:224-235
   *
   * @critical
   */
  describe('Fix #4: Season/Tournament mutual exclusivity in reducer', () => {
    describe('SET_SEASON_ID action', () => {
      it('should clear tournament when setting a non-empty season', () => {
        const state: GameSessionState = {
          ...initialState,
          seasonId: '',
          tournamentId: 'tournament-1',
        };

        const action: GameSessionAction = {
          type: 'SET_SEASON_ID',
          payload: 'season-1',
        };

        const newState = gameSessionReducer(state, action);

        expect(newState.seasonId).toBe('season-1');
        expect(newState.tournamentId).toBe(''); // Should be cleared
      });

      it('should NOT clear tournament when clearing season (empty string)', () => {
        const state: GameSessionState = {
          ...initialState,
          seasonId: 'season-1',
          tournamentId: 'tournament-1',
        };

        const action: GameSessionAction = {
          type: 'SET_SEASON_ID',
          payload: '',
        };

        const newState = gameSessionReducer(state, action);

        expect(newState.seasonId).toBe('');
        expect(newState.tournamentId).toBe('tournament-1'); // Should NOT be cleared
      });

      it('should handle clearing season when no tournament is set', () => {
        const state: GameSessionState = {
          ...initialState,
          seasonId: 'season-1',
          tournamentId: '',
        };

        const action: GameSessionAction = {
          type: 'SET_SEASON_ID',
          payload: '',
        };

        const newState = gameSessionReducer(state, action);

        expect(newState.seasonId).toBe('');
        expect(newState.tournamentId).toBe('');
      });
    });

    describe('SET_TOURNAMENT_ID action', () => {
      it('should clear season when setting a non-empty tournament', () => {
        const state: GameSessionState = {
          ...initialState,
          seasonId: 'season-1',
          tournamentId: '',
        };

        const action: GameSessionAction = {
          type: 'SET_TOURNAMENT_ID',
          payload: 'tournament-1',
        };

        const newState = gameSessionReducer(state, action);

        expect(newState.tournamentId).toBe('tournament-1');
        expect(newState.seasonId).toBe(''); // Should be cleared
      });

      it('should NOT clear season when clearing tournament (empty string)', () => {
        const state: GameSessionState = {
          ...initialState,
          seasonId: 'season-1',
          tournamentId: 'tournament-1',
        };

        const action: GameSessionAction = {
          type: 'SET_TOURNAMENT_ID',
          payload: '',
        };

        const newState = gameSessionReducer(state, action);

        expect(newState.tournamentId).toBe('');
        expect(newState.seasonId).toBe('season-1'); // Should NOT be cleared
      });

      it('should handle clearing tournament when no season is set', () => {
        const state: GameSessionState = {
          ...initialState,
          seasonId: '',
          tournamentId: 'tournament-1',
        };

        const action: GameSessionAction = {
          type: 'SET_TOURNAMENT_ID',
          payload: '',
        };

        const newState = gameSessionReducer(state, action);

        expect(newState.tournamentId).toBe('');
        expect(newState.seasonId).toBe('');
      });
    });

    describe('Edge cases', () => {
      it('should handle switching from season to tournament', () => {
        let state: GameSessionState = {
          ...initialState,
          seasonId: 'season-1',
          tournamentId: '',
        };

        // Set tournament (should clear season)
        const action: GameSessionAction = {
          type: 'SET_TOURNAMENT_ID',
          payload: 'tournament-1',
        };

        state = gameSessionReducer(state, action);

        expect(state.tournamentId).toBe('tournament-1');
        expect(state.seasonId).toBe('');
      });

      it('should handle switching from tournament to season', () => {
        let state: GameSessionState = {
          ...initialState,
          seasonId: '',
          tournamentId: 'tournament-1',
        };

        // Set season (should clear tournament)
        const action: GameSessionAction = {
          type: 'SET_SEASON_ID',
          payload: 'season-1',
        };

        state = gameSessionReducer(state, action);

        expect(state.seasonId).toBe('season-1');
        expect(state.tournamentId).toBe('');
      });

      it('should handle multiple clears without affecting the other field', () => {
        let state: GameSessionState = {
          ...initialState,
          seasonId: 'season-1',
          tournamentId: '',
        };

        // Clear season multiple times
        state = gameSessionReducer(state, { type: 'SET_SEASON_ID', payload: '' });
        state = gameSessionReducer(state, { type: 'SET_SEASON_ID', payload: '' });

        expect(state.seasonId).toBe('');
        expect(state.tournamentId).toBe('');

        // Set tournament
        state = gameSessionReducer(state, { type: 'SET_TOURNAMENT_ID', payload: 'tournament-1' });
        expect(state.tournamentId).toBe('tournament-1');

        // Clear tournament multiple times
        state = gameSessionReducer(state, { type: 'SET_TOURNAMENT_ID', payload: '' });
        state = gameSessionReducer(state, { type: 'SET_TOURNAMENT_ID', payload: '' });

        expect(state.tournamentId).toBe('');
        expect(state.seasonId).toBe('');
      });
    });
  });
});
