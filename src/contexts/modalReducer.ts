// Modal reducer (Layer 2 - Steps 2.0–2.3)
// Currently managing: loadGame, newGameSetup, settings, gameStats, roster, seasonTournament modals

export type ModalId =
  | 'loadGame'
  | 'newGameSetup'
  | 'settings'
  | 'gameStats'
  | 'roster'
  | 'seasonTournament';

export interface ModalState {
  loadGame: boolean;
  newGameSetup: boolean;
  settings: boolean;
  gameStats: boolean;
  roster: boolean;
  seasonTournament: boolean;
  // Timestamps for analytics and anti-flash guards
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

/**
 * Valid modal IDs that exist in ModalState
 */
const validModalIds: readonly ModalId[] = [
  'loadGame',
  'newGameSetup',
  'settings',
  'gameStats',
  'roster',
  'seasonTournament',
];

/**
 * Helper: Check if a modal ID is valid (exists in ModalState)
 */
function isValidModalId(id: ModalId): boolean {
  return validModalIds.includes(id);
}

/**
 * Helper: Open a modal (idempotent - returns same state if already open)
 */
function openModal(state: ModalState, id: ModalId, at: number): ModalState {
  // Unknown modal ID — return state unchanged (future-proof)
  if (!isValidModalId(id)) {
    return state;
  }
  // Already open — return same object to avoid unnecessary re-renders
  if (state[id]) {
    return state;
  }
  return {
    ...state,
    [id]: true,
    openTimestamps: { ...state.openTimestamps, [id]: at },
  };
}

/**
 * Helper: Close a modal (idempotent - returns same state if already closed)
 */
function closeModal(state: ModalState, id: ModalId): ModalState {
  // Unknown modal ID — return state unchanged (future-proof)
  if (!isValidModalId(id)) {
    return state;
  }
  // Already closed — return same object
  if (!state[id]) {
    return state;
  }
  // Keep openTimestamps for analytics; only toggle flag
  return { ...state, [id]: false };
}

/**
 * Helper: Toggle a modal (open → closed, closed → open)
 */
function toggleModal(state: ModalState, id: ModalId, at: number): ModalState {
  // Unknown modal ID — return state unchanged (future-proof)
  if (!isValidModalId(id)) {
    return state;
  }
  const next = !state[id];
  return {
    ...state,
    [id]: next,
    openTimestamps: next
      ? { ...state.openTimestamps, [id]: at }
      : state.openTimestamps,
  };
}

export function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'OPEN_MODAL':
      return openModal(state, action.id, action.at ?? Date.now());

    case 'CLOSE_MODAL':
      return closeModal(state, action.id);

    case 'TOGGLE_MODAL':
      return toggleModal(state, action.id, action.at ?? Date.now());

    case 'RESET_MODALS':
      return { ...initialModalState };

    default:
      return state;
  }
}
