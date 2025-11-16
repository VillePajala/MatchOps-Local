import type { ModalId } from '@/contexts/modalReducer';

export type ReducerDrivenModalId = Extract<ModalId, 'loadGame' | 'newGameSetup' | 'roster' | 'seasonTournament'>;

export interface ReducerDrivenModalControl {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export type ReducerDrivenModals = Record<ReducerDrivenModalId, ReducerDrivenModalControl>;
