import React, { createContext, useContext, useState, useRef, useReducer } from 'react';
import { initialModalState, modalReducer } from './modalReducer';

interface ModalContextValue {
  isGameSettingsModalOpen: boolean;
  setIsGameSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isLoadGameModalOpen: boolean;
  setIsLoadGameModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isRosterModalOpen: boolean;
  setIsRosterModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSeasonTournamentModalOpen: boolean;
  setIsSeasonTournamentModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isTrainingResourcesOpen: boolean;
  setIsTrainingResourcesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isGoalLogModalOpen: boolean;
  setIsGoalLogModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isGameStatsModalOpen: boolean;
  setIsGameStatsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isNewGameSetupModalOpen: boolean;
  setIsNewGameSetupModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isPlayerAssessmentModalOpen: boolean;
  setIsPlayerAssessmentModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export const ModalProvider = ({ children }: { children: React.ReactNode }) => {
  const [isGameSettingsModalOpen, setIsGameSettingsModalOpen] = useState(false);
  // Layer 2 (2.1): Wire Load Game modal to reducer; keep API stable
  const [modalState, dispatchModal] = useReducer(modalReducer, initialModalState);
  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);
  const [isSeasonTournamentModalOpen, setIsSeasonTournamentModalOpen] = useState(false);
  const [isTrainingResourcesOpen, setIsTrainingResourcesOpen] = useState(false);
  const [isGoalLogModalOpen, setIsGoalLogModalOpen] = useState(false);
  const [isGameStatsModalOpen, setIsGameStatsModalOpen] = useState(false);
  const [isNewGameSetupModalOpen, _setIsNewGameSetupModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isPlayerAssessmentModalOpen, setIsPlayerAssessmentModalOpen] = useState(false);

  // Anti-flash guard: ignore closes occurring too soon after opening for critical modals
  const ANTI_FLASH_MS = 200;
  const loadGameLastOpenRef = useRef<number>(0);
  const newGameLastOpenRef = useRef<number>(0);

  const guardedSetter = (
    baseSet: React.Dispatch<React.SetStateAction<boolean>>,
    lastOpenRef: React.MutableRefObject<number>,
  ): React.Dispatch<React.SetStateAction<boolean>> => {
    return (valueOrUpdater) => {
      const now = Date.now();
      if (typeof valueOrUpdater === 'function') {
        baseSet((prev) => {
          const next = (valueOrUpdater as (prev: boolean) => boolean)(prev);
          if (!next && prev) {
            if (now - lastOpenRef.current < ANTI_FLASH_MS) {
              return prev; // ignore premature close
            }
          }
          if (next && !prev) {
            lastOpenRef.current = now;
          }
          return next;
        });
      } else {
        const next = valueOrUpdater;
        if (!next) {
          baseSet((prev) => {
            if (prev && now - lastOpenRef.current < ANTI_FLASH_MS) {
              return prev; // ignore premature close
            }
            return next;
          });
        } else {
          lastOpenRef.current = now;
          baseSet(next);
        }
      }
    };
  };

  // For reducer-backed Load Game modal, emulate React setState<boolean> API with anti-flash guard
  const setIsLoadGameModalOpen: React.Dispatch<React.SetStateAction<boolean>> = (valueOrUpdater) => {
    const now = Date.now();
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(modalState.loadGame)
      : valueOrUpdater;

    if (next) {
      // Always dispatch OPEN to preserve setState-like semantics (last call wins)
      loadGameLastOpenRef.current = now;
      dispatchModal({ type: 'OPEN_MODAL', id: 'loadGame', at: now });
      return;
    }

    // Close requested: honor anti-flash guard, otherwise dispatch CLOSE
    if (now - loadGameLastOpenRef.current < ANTI_FLASH_MS) {
      return; // ignore premature close
    }
    dispatchModal({ type: 'CLOSE_MODAL', id: 'loadGame' });
  };
  const setIsNewGameSetupModalOpen = guardedSetter(_setIsNewGameSetupModalOpen, newGameLastOpenRef);

  const value: ModalContextValue = {
    isGameSettingsModalOpen,
    setIsGameSettingsModalOpen,
    isLoadGameModalOpen: modalState.loadGame,
    setIsLoadGameModalOpen,
    isRosterModalOpen,
    setIsRosterModalOpen,
    isSeasonTournamentModalOpen,
    setIsSeasonTournamentModalOpen,
    isTrainingResourcesOpen,
    setIsTrainingResourcesOpen,
    isGoalLogModalOpen,
    setIsGoalLogModalOpen,
    isGameStatsModalOpen,
    setIsGameStatsModalOpen,
    isNewGameSetupModalOpen,
    setIsNewGameSetupModalOpen,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isPlayerAssessmentModalOpen,
    setIsPlayerAssessmentModalOpen,
  };

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
};

export const useModalContext = () => {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error('useModalContext must be used within ModalProvider');
  }
  return ctx;
};

export default ModalProvider;
