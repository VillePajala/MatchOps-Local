// Modal reducer (Layer 2 - Steps 2.0–2.3)
// Currently managing: loadGame, newGameSetup, settings, gameStats modals

export type ModalId =
  | 'loadGame'
  | 'newGameSetup'
  | 'settings'
  | 'gameStats'
  | 'roster'
  | 'seasonTournament';

export interface ModalState {
  // Start with a single modal; we will add others in subsequent microsteps
  loadGame: boolean;
  newGameSetup: boolean;
  settings: boolean;
  gameStats: boolean;
  roster: boolean;
  seasonTournament: boolean;
  // Room for future timing/analytics (e.g., anti-flash timestamps)
  openTimestamps: Partial<Record<ModalId, number>>;
}

export const initialModalState: ModalState = {
  loadGame: false,
  newGameSetup: false,
  settings: false,
  gameStats: false,
  roster: false,
  seasonTournament: false,
  openTimestamps: {},
};

export type ModalAction =
  | { type: 'OPEN_MODAL'; id: ModalId; at?: number }
  | { type: 'CLOSE_MODAL'; id: ModalId }
  | { type: 'TOGGLE_MODAL'; id: ModalId; at?: number }
  | { type: 'RESET_MODALS' };

export function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'OPEN_MODAL': {
      const at = action.at ?? Date.now();
      if (action.id === 'loadGame') {
        if (state.loadGame) {
          // Already open — return same object to avoid unnecessary re-render loops
          return state;
        }
        return {
          ...state,
          loadGame: true,
          openTimestamps: { ...state.openTimestamps, loadGame: at },
        };
      }
      if (action.id === 'newGameSetup') {
        if (state.newGameSetup) {
          return state;
        }
        return {
          ...state,
          newGameSetup: true,
          openTimestamps: { ...state.openTimestamps, newGameSetup: at },
        };
      }
      if (action.id === 'settings') {
        if (state.settings) return state;
        return {
          ...state,
          settings: true,
          openTimestamps: { ...state.openTimestamps, settings: at },
        };
      }
      if (action.id === 'gameStats') {
        if (state.gameStats) return state;
        return {
          ...state,
          gameStats: true,
          openTimestamps: { ...state.openTimestamps, gameStats: at },
        };
      }
      if (action.id === 'roster') {
        if (state.roster) return state;
        return {
          ...state,
          roster: true,
          openTimestamps: { ...state.openTimestamps, roster: at },
        };
      }
      if (action.id === 'seasonTournament') {
        if (state.seasonTournament) return state;
        return {
          ...state,
          seasonTournament: true,
          openTimestamps: { ...state.openTimestamps, seasonTournament: at },
        };
      }
      return state;
    }
    case 'CLOSE_MODAL': {
      if (action.id === 'loadGame') {
        if (!state.loadGame) {
          // Already closed — return same object
          return state;
        }
        // Keep openTimestamps for analytics; only toggle flag
        return { ...state, loadGame: false };
      }
      if (action.id === 'newGameSetup') {
        if (!state.newGameSetup) {
          return state;
        }
        return { ...state, newGameSetup: false };
      }
      if (action.id === 'settings') {
        if (!state.settings) return state;
        return { ...state, settings: false };
      }
      if (action.id === 'gameStats') {
        if (!state.gameStats) return state;
        return { ...state, gameStats: false };
      }
      if (action.id === 'roster') {
        if (!state.roster) return state;
        return { ...state, roster: false };
      }
      if (action.id === 'seasonTournament') {
        if (!state.seasonTournament) return state;
        return { ...state, seasonTournament: false };
      }
      return state;
    }
    case 'TOGGLE_MODAL': {
      const at = action.at ?? Date.now();
      if (action.id === 'loadGame') {
        const next = !state.loadGame;
        return {
          ...state,
          loadGame: next,
          openTimestamps: next
            ? { ...state.openTimestamps, loadGame: at }
            : state.openTimestamps,
        };
      }
      if (action.id === 'newGameSetup') {
        const next = !state.newGameSetup;
        return {
          ...state,
          newGameSetup: next,
          openTimestamps: next
            ? { ...state.openTimestamps, newGameSetup: at }
            : state.openTimestamps,
        };
      }
      if (action.id === 'settings') {
        const next = !state.settings;
        return {
          ...state,
          settings: next,
          openTimestamps: next
            ? { ...state.openTimestamps, settings: at }
            : state.openTimestamps,
        };
      }
      if (action.id === 'gameStats') {
        const next = !state.gameStats;
        return {
          ...state,
          gameStats: next,
          openTimestamps: next
            ? { ...state.openTimestamps, gameStats: at }
            : state.openTimestamps,
        };
      }
      if (action.id === 'roster') {
        const next = !state.roster;
        return {
          ...state,
          roster: next,
          openTimestamps: next
            ? { ...state.openTimestamps, roster: at }
            : state.openTimestamps,
        };
      }
      if (action.id === 'seasonTournament') {
        const next = !state.seasonTournament;
        return {
          ...state,
          seasonTournament: next,
          openTimestamps: next
            ? { ...state.openTimestamps, seasonTournament: at }
            : state.openTimestamps,
        };
      }
      return state;
    }
    case 'RESET_MODALS':
      return { ...initialModalState };
    default:
      return state;
  }
}
