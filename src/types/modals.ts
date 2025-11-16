import type { ModalId } from '@/contexts/modalReducer';

/**
 * Reducer-driven modal helpers introduced in Layer 2 refactoring.
 *
 * These types wrap reducer-managed modal state behind a familiar API so callers
 * can migrate away from `useState` setters without touching call-site logic.
 *
 * @example
 * const reducerDrivenModals: ReducerDrivenModals = {
 *   newGameSetup: {
 *     isOpen: modalState.newGameSetup,
 *     open: () => dispatch({ type: 'OPEN_MODAL', id: 'newGameSetup' }),
 *     close: () => dispatch({ type: 'CLOSE_MODAL', id: 'newGameSetup' }),
 *   },
 * };
 */
export type ReducerDrivenModalId = Extract<ModalId, 'loadGame' | 'newGameSetup' | 'roster' | 'seasonTournament'>;

export interface ReducerDrivenModalControl {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export type ReducerDrivenModals = Record<ReducerDrivenModalId, ReducerDrivenModalControl>;
