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
  const [isTrainingResourcesOpen, setIsTrainingResourcesOpen] = useState(false);
  const [isGoalLogModalOpen, setIsGoalLogModalOpen] = useState(false);
  // Reducer-backed in L2 2.3
  const [isPlayerAssessmentModalOpen, setIsPlayerAssessmentModalOpen] = useState(false);

  // Anti-flash guard: ignore closes occurring too soon after opening for critical modals
  const ANTI_FLASH_MS = 200;
  const loadGameLastOpenRef = useRef<number>(0);
  const newGameLastOpenRef = useRef<number>(0);
  const loadGameOpenRef = useRef<boolean>(false);
  const newGameSetupOpenRef = useRef<boolean>(false);
  const settingsOpenRef = useRef<boolean>(false);
  const gameStatsOpenRef = useRef<boolean>(false);

  // For reducer-backed Load Game modal, emulate React setState<boolean> API with anti-flash guard
  // Note: This intentionally duplicates guarded close timing with the local reducer-backed setter
  // until we consolidate via a shared createGuardedReducerSetter() in L2 step 2.4.
  const setIsLoadGameModalOpen: React.Dispatch<React.SetStateAction<boolean>> = (valueOrUpdater) => {
    const now = Date.now();
    const prev = loadGameOpenRef.current;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;

    if (next && !prev) {
      // Always dispatch OPEN to preserve setState-like semantics (last call wins)
      loadGameLastOpenRef.current = now;
      loadGameOpenRef.current = true;
      dispatchModal({ type: 'OPEN_MODAL', id: 'loadGame', at: now });
      return;
    }

    // Close requested: honor anti-flash guard, otherwise dispatch CLOSE
    if (!next && prev) {
      if (now - loadGameLastOpenRef.current < ANTI_FLASH_MS) {
        return; // ignore premature close
      }
      loadGameOpenRef.current = false;
      dispatchModal({ type: 'CLOSE_MODAL', id: 'loadGame' });
    }
  };
  // Reducer-backed setter for New Game Setup modal (preserves setState semantics and anti-flash close)
  // NOTE: Intentional duplication with loadGame close guard until consolidation in L2 step 2.4.
  const setIsNewGameSetupModalOpen: React.Dispatch<React.SetStateAction<boolean>> = (valueOrUpdater) => {
    const now = Date.now();
    const prev = newGameSetupOpenRef.current;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;
    if (next && !prev) {
      newGameLastOpenRef.current = now;
      newGameSetupOpenRef.current = true;
      dispatchModal({ type: 'OPEN_MODAL', id: 'newGameSetup', at: now });
      return;
    }
    if (!next && prev) {
      if (now - newGameLastOpenRef.current < ANTI_FLASH_MS) {
        return; // ignore premature close
      }
      newGameSetupOpenRef.current = false;
      dispatchModal({ type: 'CLOSE_MODAL', id: 'newGameSetup' });
    }
  };

  // Reducer-backed setter for Settings modal (no anti-flash needed)
  const setIsSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>> = (valueOrUpdater) => {
    const prev = settingsOpenRef.current;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;
    if (next && !prev) {
      settingsOpenRef.current = true;
      dispatchModal({ type: 'OPEN_MODAL', id: 'settings', at: Date.now() });
      return;
    }
    if (!next && prev) {
      settingsOpenRef.current = false;
      dispatchModal({ type: 'CLOSE_MODAL', id: 'settings' });
    }
  };

  // Reducer-backed setter for Game Stats modal (no anti-flash needed)
  const setIsGameStatsModalOpen: React.Dispatch<React.SetStateAction<boolean>> = (valueOrUpdater) => {
    const prev = gameStatsOpenRef.current;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;
    if (next && !prev) {
      gameStatsOpenRef.current = true;
      dispatchModal({ type: 'OPEN_MODAL', id: 'gameStats', at: Date.now() });
      return;
    }
    if (!next && prev) {
      gameStatsOpenRef.current = false;
      dispatchModal({ type: 'CLOSE_MODAL', id: 'gameStats' });
    }
  };

  const setIsRosterModalOpen: React.Dispatch<React.SetStateAction<boolean>> = (valueOrUpdater) => {
    const prev = modalState.roster;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;
    if (next === prev) return;
    dispatchModal({ type: next ? 'OPEN_MODAL' : 'CLOSE_MODAL', id: 'roster', at: Date.now() });
  };

  const setIsSeasonTournamentModalOpen: React.Dispatch<React.SetStateAction<boolean>> = (valueOrUpdater) => {
    const prev = modalState.seasonTournament;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;
    if (next === prev) return;
    dispatchModal({ type: next ? 'OPEN_MODAL' : 'CLOSE_MODAL', id: 'seasonTournament', at: Date.now() });
  };

  const value: ModalContextValue = {
    isGameSettingsModalOpen,
    setIsGameSettingsModalOpen,
    isLoadGameModalOpen: modalState.loadGame,
    setIsLoadGameModalOpen,
    isRosterModalOpen: modalState.roster,
    setIsRosterModalOpen,
    isSeasonTournamentModalOpen: modalState.seasonTournament,
    setIsSeasonTournamentModalOpen,
    isTrainingResourcesOpen,
    setIsTrainingResourcesOpen,
    isGoalLogModalOpen,
    setIsGoalLogModalOpen,
    isGameStatsModalOpen: modalState.gameStats,
    setIsGameStatsModalOpen,
    isNewGameSetupModalOpen: modalState.newGameSetup,
    setIsNewGameSetupModalOpen,
    isSettingsModalOpen: modalState.settings,
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
