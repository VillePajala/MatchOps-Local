import React, { createContext, useContext, useState, useRef } from 'react';

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
  const [isLoadGameModalOpen, _setIsLoadGameModalOpen] = useState(false);
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

  const setIsLoadGameModalOpen = guardedSetter(_setIsLoadGameModalOpen, loadGameLastOpenRef);
  const setIsNewGameSetupModalOpen = guardedSetter(_setIsNewGameSetupModalOpen, newGameLastOpenRef);

  const value: ModalContextValue = {
    isGameSettingsModalOpen,
    setIsGameSettingsModalOpen,
    isLoadGameModalOpen,
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
