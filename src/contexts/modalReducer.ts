// Modal reducer (Layer 2 - Steps 2.0–2.2)
// Currently managing: loadGame, newGameSetup modals

export type ModalId = 'loadGame' | 'newGameSetup';

export interface ModalState {
  // Start with a single modal; we will add others in subsequent microsteps
  loadGame: boolean;
  newGameSetup: boolean;
  // Room for future timing/analytics (e.g., anti-flash timestamps)
  openTimestamps: Partial<Record<ModalId, number>>;
}

export const initialModalState: ModalState = {
  loadGame: false,
  newGameSetup: false,
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
      return state;
    }
    case 'RESET_MODALS':
      return { ...initialModalState };
    default:
      return state;
  }
}
