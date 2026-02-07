import React, { createContext, useContext, useState, useMemo, useRef, useReducer, useCallback } from 'react';
import { initialModalState, modalReducer } from './modalReducer';

type SettingsTab = 'general' | 'data' | 'account' | 'about';

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
  isRulesDirectoryOpen: boolean;
  setIsRulesDirectoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isGoalLogModalOpen: boolean;
  setIsGoalLogModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isGameStatsModalOpen: boolean;
  setIsGameStatsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isNewGameSetupModalOpen: boolean;
  setIsNewGameSetupModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Open settings modal to a specific tab */
  openSettingsToTab: (tab: SettingsTab) => void;
  /** The tab to open settings modal to (undefined = default) */
  settingsInitialTab: SettingsTab | undefined;
  isPlayerAssessmentModalOpen: boolean;
  setIsPlayerAssessmentModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export const ModalProvider = ({ children }: { children: React.ReactNode }) => {
  const [isGameSettingsModalOpen, setIsGameSettingsModalOpen] = useState(false);
  // Layer 2 (2.1): Wire Load Game modal to reducer; keep API stable
  const [modalState, dispatchModal] = useReducer(modalReducer, initialModalState);
  const [isTrainingResourcesOpen, setIsTrainingResourcesOpen] = useState(false);
  const [isRulesDirectoryOpen, setIsRulesDirectoryOpen] = useState(false);
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
  const rosterOpenRef = useRef<boolean>(false);
  const seasonTournamentOpenRef = useRef<boolean>(false);

  // Guarded modal setter for Load Game modal (with anti-flash protection)
  const setIsLoadGameModalOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((valueOrUpdater) => {
    const now = Date.now();
    const prev = loadGameOpenRef.current;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;

    if (next && !prev) {
      loadGameLastOpenRef.current = now;
      loadGameOpenRef.current = true;
      dispatchModal({ type: 'OPEN_MODAL', id: 'loadGame', at: now });
      return;
    }

    if (!next && prev) {
      if (now - loadGameLastOpenRef.current < ANTI_FLASH_MS) {
        return;
      }
      loadGameOpenRef.current = false;
      dispatchModal({ type: 'CLOSE_MODAL', id: 'loadGame' });
    }
  }, []);

  // Guarded modal setter for New Game Setup modal (with anti-flash protection)
  const setIsNewGameSetupModalOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((valueOrUpdater) => {
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
        return;
      }
      newGameSetupOpenRef.current = false;
      dispatchModal({ type: 'CLOSE_MODAL', id: 'newGameSetup' });
    }
  }, []);

  // Settings modal initial tab state
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);

  // Reducer-backed setter for Settings modal (no anti-flash needed)
  const setIsSettingsModalOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((valueOrUpdater) => {
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
      setSettingsInitialTab(undefined); // Reset initial tab when closing
      dispatchModal({ type: 'CLOSE_MODAL', id: 'settings' });
    }
  }, []);

  // Open settings modal to a specific tab
  const openSettingsToTab = useCallback((tab: SettingsTab) => {
    setSettingsInitialTab(tab);
    settingsOpenRef.current = true;
    dispatchModal({ type: 'OPEN_MODAL', id: 'settings', at: Date.now() });
  }, []);

  // Reducer-backed setter for Game Stats modal (no anti-flash needed)
  const setIsGameStatsModalOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((valueOrUpdater) => {
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
  }, []);

  // Roster modal setter (no anti-flash guard needed)
  // Rationale: Triggered from static buttons (ControlBar CTAs),
  // not from closing menus/overlays. Lower risk of click-through timing issues.
  const setIsRosterModalOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((valueOrUpdater) => {
    const prev = rosterOpenRef.current;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;
    if (next === prev) return;
    rosterOpenRef.current = next;
    if (next) {
      dispatchModal({ type: 'OPEN_MODAL', id: 'roster', at: Date.now() });
    } else {
      dispatchModal({ type: 'CLOSE_MODAL', id: 'roster' });
    }
  }, []);

  // Season/Tournament modal setter (no anti-flash guard needed)
  // Rationale: Same as roster - triggered from persistent UI elements,
  // not timing-sensitive menu/overlay contexts. Add guard if flash-close issues emerge.
  const setIsSeasonTournamentModalOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((valueOrUpdater) => {
    const prev = seasonTournamentOpenRef.current;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;
    if (next === prev) return;
    seasonTournamentOpenRef.current = next;
    if (next) {
      dispatchModal({ type: 'OPEN_MODAL', id: 'seasonTournament', at: Date.now() });
    } else {
      dispatchModal({ type: 'CLOSE_MODAL', id: 'seasonTournament' });
    }
  }, []);

  const value: ModalContextValue = useMemo(() => ({
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
    isRulesDirectoryOpen,
    setIsRulesDirectoryOpen,
    isGoalLogModalOpen,
    setIsGoalLogModalOpen,
    isGameStatsModalOpen: modalState.gameStats,
    setIsGameStatsModalOpen,
    isNewGameSetupModalOpen: modalState.newGameSetup,
    setIsNewGameSetupModalOpen,
    isSettingsModalOpen: modalState.settings,
    setIsSettingsModalOpen,
    openSettingsToTab,
    settingsInitialTab,
    isPlayerAssessmentModalOpen,
    setIsPlayerAssessmentModalOpen,
  }), [
    isGameSettingsModalOpen, setIsGameSettingsModalOpen,
    modalState.loadGame, setIsLoadGameModalOpen,
    modalState.roster, setIsRosterModalOpen,
    modalState.seasonTournament, setIsSeasonTournamentModalOpen,
    isTrainingResourcesOpen, setIsTrainingResourcesOpen,
    isRulesDirectoryOpen, setIsRulesDirectoryOpen,
    isGoalLogModalOpen, setIsGoalLogModalOpen,
    modalState.gameStats, setIsGameStatsModalOpen,
    modalState.newGameSetup, setIsNewGameSetupModalOpen,
    modalState.settings, setIsSettingsModalOpen,
    openSettingsToTab, settingsInitialTab,
    isPlayerAssessmentModalOpen, setIsPlayerAssessmentModalOpen,
  ]);

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
